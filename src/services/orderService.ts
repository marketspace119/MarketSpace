import { doc, getDocs, collection, runTransaction, query, where, updateDoc, limit } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { OrderDetails, VendorSubOrder, CartItem } from '../types';
import { storeService } from './storeService';
import { productService } from './productService';
import { pricingService } from './pricingService';
import { inventoryService } from './inventoryService';
import { notificationService } from './notificationService';
import { auditLogService } from './auditLogService';
import { couponService } from './couponService';
import { analyticsService } from './analyticsService';

const ORDERS_STORAGE_KEY = 'marketspace_orders_v1';
const ORDERS_COLLECTION = 'orders';

let memoryOrders: OrderDetails[] = [];

function initOrders(): OrderDetails[] {
  if (memoryOrders.length > 0) return memoryOrders;
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(ORDERS_STORAGE_KEY);
    memoryOrders = raw ? JSON.parse(raw) : [];
    return memoryOrders;
  } catch (err) {
    console.error('Failed to load orders from storage', err);
    return [];
  }
}

function sanitizeOrderForLocalStorage(order: OrderDetails): OrderDetails {
  return {
    ...order,
    phone: order.phone ? order.phone.replace(/(\+?\d{2,4})\d+(\d{2})/, '$1 •••• $2') : '',
    email: order.email ? order.email.replace(/(.{2})(.*)(@.*)/, '$1•••$3') : undefined,
    address: order.address ? (order.address.length > 25 ? `${order.address.slice(0, 25)}...` : order.address) : '',
    notes: undefined,
  };
}

function persistLocal(orders: OrderDetails[]) {
  memoryOrders = orders;
  if (typeof window === 'undefined') return;
  try {
    const sanitized = orders.map(sanitizeOrderForLocalStorage);
    localStorage.setItem(ORDERS_STORAGE_KEY, JSON.stringify(sanitized));
  } catch (err) {
    console.error('Failed to save orders to storage', err);
  }
}

export const orderService = {
  /**
   * Purge local order cache on logout or user switch
   */
  clearUserCache() {
    memoryOrders = [];
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem(ORDERS_STORAGE_KEY);
      } catch (err) {
        console.error('Failed to clear order cache', err);
      }
    }
  },

  /**
   * Seed orders in memory for deterministic test fixtures and audits
   */
  seedOrders(orders: OrderDetails[]) {
    memoryOrders = [...orders];
  },

  /**
   * Syncs orders from Firestore for the authenticated user
   */
  async syncWithFirestore(currentUserId?: string, userRole?: string): Promise<OrderDetails[]> {
    try {
      const isAdmin = userRole === 'ADMIN' || userRole === 'SUPER_ADMIN';
      let q;
      if (isAdmin) {
        q = collection(db, ORDERS_COLLECTION);
      } else if (userRole === 'SELLER' && currentUserId) {
        q = query(collection(db, ORDERS_COLLECTION), where('sellerIds', 'array-contains', currentUserId));
      } else if (currentUserId) {
        q = query(collection(db, ORDERS_COLLECTION), where('customerId', '==', currentUserId));
      } else {
        return [];
      }

      const snap = await getDocs(q);
      if (!snap.empty) {
        const cloudOrders: OrderDetails[] = [];
        snap.forEach(d => cloudOrders.push(d.data() as OrderDetails));
        persistLocal(cloudOrders);
        return cloudOrders;
      }
    } catch (err) {
      console.warn('Firestore orders sync skipped or offline:', err);
    }
    return initOrders();
  },

  /**
   * Authoritative, Atomic Server & Firestore Order Creation with Stock Decrement
   */
  async createMultiVendorOrder(params: {
    customerName: string;
    phone: string;
    email?: string;
    city: string;
    address: string;
    paymentMethod: 'cash_on_delivery' | 'evc_plus' | 'zaad' | 'sahall' | 'card';
    notes?: string;
    items: CartItem[];
    customerId?: string;
    couponCode?: string;
    idempotencyKey?: string;
  }): Promise<OrderDetails> {
    // 1. Input bounds and validation
    if (!params.items || params.items.length === 0) {
      throw new Error('Cannot create order with an empty shopping cart');
    }
    if (!params.customerName?.trim() || !params.phone?.trim() || !params.city?.trim() || !params.address?.trim()) {
      throw new Error('Missing required delivery information (name, phone, city, address)');
    }

    const paymentMethod = params.paymentMethod === 'cash_on_delivery' ? 'cod' : params.paymentMethod;

    // 2. Call trusted Order Processing Gateway (P0 Security: Server-Authoritative)
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    try {
      if (auth.currentUser) {
        const idToken = await auth.currentUser.getIdToken();
        headers['Authorization'] = `Bearer ${idToken}`;
      }
    } catch (authErr) {
      console.warn('Failed to retrieve Firebase ID token for order placement:', authErr);
    }

    const response = await fetch('/api/orders/create', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        items: params.items.map(it => ({
          productId: it.product?.id || it.id,
          quantity: it.quantity,
          selectedOptions: {
            color: it.selectedColor || '',
            size: it.selectedSize || '',
          },
          selectedAddons: it.selectedAddons?.map(a => ({
            id: a.id,
            name: a.name,
            price: a.price,
          })),
          productSnapshot: it.product,
        })),
        customerName: params.customerName.trim(),
        phone: params.phone.trim(),
        email: params.email?.trim() || undefined,
        city: params.city.trim(),
        address: params.address.trim(),
        paymentMethod,
        notes: params.notes?.trim() || undefined,
        customerId: params.customerId || 'guest_user',
        couponCode: params.couponCode || undefined,
        idempotencyKey: params.idempotencyKey || `idemp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      }),
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Failed to process order securely');
    }

    const finalOrder: OrderDetails = data.order;

    // P1-02: Server transaction already atomically recorded coupon usage in Firestore.
    // Client-side recordUsage must NOT be invoked again to avoid duplicate count.
    if (finalOrder.couponCode) {
      couponService.syncLocalCouponUsage(finalOrder.couponCode, params.customerId);
    }

    // Track order completed analytics event
    analyticsService.trackEvent({
      type: 'ORDER_COMPLETED',
      targetType: 'order',
      targetId: finalOrder.orderId,
      currentUserId: params.customerId,
      metadata: {
        total: finalOrder.total,
        discount: finalOrder.discount,
        itemsCount: finalOrder.items.length,
      },
    });

    // Update local cache
    const orders = initOrders();
    orders.unshift(finalOrder);
    persistLocal(orders);

    // Local/Client notification for customer
    if (params.customerId && params.customerId !== 'guest_user') {
      try {
        await notificationService.createNotification({
          userId: params.customerId,
          type: 'order',
          title: {
            ar: `تم تأكيد طلبك بنجاح #${finalOrder.orderId}`,
            en: `Order confirmed #${finalOrder.orderId}`,
            so: `Dalabkaaga waa la xaqiijiyay #${finalOrder.orderId}`,
          },
          message: {
            ar: `المجموع الكلي: $${finalOrder.total}. سنقوم بإشعارك عند شحن الطلب.`,
            en: `Total: $${finalOrder.total}. We will notify you when dispatched.`,
            so: `Wadarta: $${finalOrder.total}. Waxaan kula soo socodsiin doonnaa marka la diro.`,
          },
          link: `/orders/${finalOrder.orderId}`,
        });
      } catch {
        // Non-blocking notification
      }
    }

    return finalOrder;
  },

  getAllOrders(currentUserId?: string, userRole?: string): OrderDetails[] {
    const orders = initOrders();
    const isAdmin = userRole === 'ADMIN' || userRole === 'SUPER_ADMIN';
    if (isAdmin) {
      return orders;
    }
    if (currentUserId) {
      return orders.filter(o => o.customerId === currentUserId);
    }
    return [];
  },

  /**
   * Secure, strictly authorized order retrieval.
   * NEVER returns order data to an unauthenticated visitor unless matching phone is verified for guest tracking.
   */
  getOrderById(
    orderId: string,
    currentUserId?: string,
    userRole?: string,
    guestVerificationPhone?: string
  ): OrderDetails | undefined {
    const orders = initOrders();
    const order = orders.find(o => o.orderId === orderId);
    if (!order) return undefined;

    const isAdmin = userRole === 'ADMIN' || userRole === 'SUPER_ADMIN';
    if (isAdmin) return order;

    // Authenticated customer
    if (currentUserId && order.customerId === currentUserId) {
      return order;
    }

    // Authenticated vendor involved in this order
    if (currentUserId && (order.sellerIds?.includes(currentUserId) || order.vendorOrders?.some(s => s.sellerId === currentUserId))) {
      return order;
    }

    // Secure guest verification with matching order phone number
    if (guestVerificationPhone && order.phone.replace(/\D/g, '') === guestVerificationPhone.replace(/\D/g, '')) {
      return order;
    }

    // Strictly forbidden for unauthorized callers
    return undefined;
  },

  getOrdersBySellerId(
    sellerId: string,
    currentUserId?: string,
    userRole?: string
  ): { order: OrderDetails; vendorSubOrder: VendorSubOrder }[] {
    const isAdmin = userRole === 'ADMIN' || userRole === 'SUPER_ADMIN';
    if (!isAdmin && currentUserId && currentUserId !== sellerId) {
      throw new Error('Forbidden: You can only access orders for your own seller account');
    }

    const orders = initOrders();
    const result: { order: OrderDetails; vendorSubOrder: VendorSubOrder }[] = [];

    orders.forEach(order => {
      order.vendorOrders?.forEach(subOrder => {
        if (subOrder.sellerId === sellerId) {
          result.push({ order, vendorSubOrder: subOrder });
        }
      });
    });

    return result;
  },

  async updateVendorOrderStatus(
    parentOrderId: string,
    subOrderId: string,
    newStatus: VendorSubOrder['status'],
    currentUserId: string,
    userRole: string,
    note?: string,
    trackingNumber?: string
  ): Promise<boolean> {
    const orders = initOrders();
    const orderIndex = orders.findIndex(o => o.orderId === parentOrderId);
    if (orderIndex === -1) return false;

    const order = orders[orderIndex];
    if (!order.vendorOrders) return false;

    const subOrderIndex = order.vendorOrders.findIndex(s => s.subOrderId === subOrderId);
    if (subOrderIndex === -1) return false;

    const subOrder = order.vendorOrders[subOrderIndex];
    const isAdmin = userRole === 'ADMIN' || userRole === 'SUPER_ADMIN';

    if (!isAdmin && subOrder.sellerId !== currentUserId) {
      throw new Error('Forbidden: You can only update orders for your own store');
    }

    // Forward-only state transition integrity
    if (subOrder.status === 'delivered' && newStatus !== 'delivered') {
      throw new Error('Invalid state transition: Delivered sub-orders cannot be modified');
    }
    if (subOrder.status === 'cancelled' && newStatus !== 'cancelled') {
      throw new Error('Invalid state transition: Cancelled sub-orders cannot be reactivated');
    }

    const updatedSubOrder = { ...subOrder, status: newStatus };
    if (trackingNumber) {
      updatedSubOrder.trackingNumber = trackingNumber;
    }

    const now = new Date().toISOString();
    const historyEntry = {
      status: newStatus,
      timestamp: now,
      actor: currentUserId,
      note: note || `Order status updated to ${newStatus}`,
    };

    updatedSubOrder.statusHistory = [...(updatedSubOrder.statusHistory || []), historyEntry];
    const updatedVendorOrders = [...order.vendorOrders];
    updatedVendorOrders[subOrderIndex] = updatedSubOrder;

    let nextOrderStatus = order.status;
    const allDelivered = updatedVendorOrders.every(s => s.status === 'delivered' || s.status === 'completed');
    if (allDelivered) {
      nextOrderStatus = 'delivered';
    } else if (updatedVendorOrders.some(s => s.status === 'preparing' || s.status === 'in_progress' || s.status === 'shipped')) {
      nextOrderStatus = 'processing';
    }

    const updatedStatusHistory = [...(order.statusHistory || []), historyEntry];

    // Try secure backend gateway first if in browser environment
    let apiHandled = false;
    if (typeof window !== 'undefined' && window.fetch && auth.currentUser) {
      try {
        const idToken = await auth.currentUser.getIdToken();
        const response = await fetch('/api/orders/update-suborder', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            parentOrderId,
            subOrderId,
            newStatus,
            trackingNumber,
            note,
          }),
        });
        if (response.ok) {
          apiHandled = true;
        } else {
          const errBody = await response.json().catch(() => ({}));
          throw new Error(errBody.error || `Server update failed with HTTP ${response.status}`);
        }
      } catch (apiErr: any) {
        console.error('[OrderService] Authoritative API update suborder failed:', apiErr);
        throw apiErr;
      }
    }

    if (!apiHandled) {
      // HIGH-06: Durable Firestore update MUST succeed first
      try {
        await updateDoc(doc(db, ORDERS_COLLECTION, parentOrderId), {
          status: nextOrderStatus,
          vendorOrders: updatedVendorOrders,
          statusHistory: updatedStatusHistory,
          ...(trackingNumber ? { deliveryTrackingCode: trackingNumber } : {}),
          updatedAt: now,
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `${ORDERS_COLLECTION}/${parentOrderId}`);
        throw err;
      }
    }

    // Update local and in-memory cache ONLY AFTER durable write succeeds
    order.status = nextOrderStatus;
    order.vendorOrders = updatedVendorOrders;
    order.statusHistory = updatedStatusHistory;
    if (trackingNumber) {
      order.deliveryTrackingCode = trackingNumber;
    }
    orders[orderIndex] = order;
    persistLocal(orders);

    // Notify Customer about status update
    if (order.customerId && order.customerId !== 'guest_user') {
      notificationService.createNotification({
        userId: order.customerId,
        type: 'order',
        title: {
          ar: `تحديث حالة طلبك #${parentOrderId}`,
          en: `Update on Order #${parentOrderId}`,
          so: `Cusboonaysiinta dalabkaaga #${parentOrderId}`,
        },
        message: {
          ar: `تم تحديث حالة شحنتك من متجر ${subOrder.storeName} إلى: ${newStatus}`,
          en: `Your order from ${subOrder.storeName} is now: ${newStatus}`,
          so: `Dalabkaaga ka yimid ${subOrder.storeName} hadda waa: ${newStatus}`,
        },
        link: `/orders/${parentOrderId}`,
      }).catch(() => {});
    }

    return true;
  },

  /**
   * Only Admin can mark a payment as verified/paid in production.
   * Firestore is the single source of truth: local state is ONLY updated if Firestore write succeeds.
   * Hardened contract matches backend gateway for submissions, COD settlement, and administrative override (P1-PAY-01).
   */
  async confirmPaymentStatus(
    orderId: string,
    userRole: string,
    options?: {
      submissionId?: string;
      action?: 'COD_SETTLEMENT' | 'SUPER_ADMIN_OVERRIDE';
      notes?: string;
    }
  ): Promise<boolean> {
    const isAdmin = userRole === 'ADMIN' || userRole === 'SUPER_ADMIN';
    if (!isAdmin) {
      throw new Error('Forbidden: Only platform administrators can confirm order payments');
    }

    const orders = initOrders();
    const index = orders.findIndex(o => o.orderId === orderId);
    if (index === -1) return false;
    const order = orders[index];

    // Determine payload parameters (P1-PAY-01)
    let submissionId = options?.submissionId;
    let action = options?.action;
    let notes = options?.notes || 'Admin confirmed payment status via Order Management';

    if (!submissionId && !action) {
      const method = (order.paymentMethod || '').toLowerCase().trim();
      if (method === 'cash_on_delivery' || method === 'cod') {
        action = 'COD_SETTLEMENT';
        notes = options?.notes || 'Admin confirmed cash on delivery settlement';
      } else {
        // Electronic payment: query for active paymentSubmission for this order
        try {
          const subQuery = query(
            collection(db, 'paymentSubmissions'),
            where('orderId', '==', orderId),
            limit(1)
          );
          const subSnap = await getDocs(subQuery);
          if (!subSnap.empty) {
            submissionId = subSnap.docs[0].id;
          }
        } catch (subErr) {
          console.warn('[OrderService:PaymentSubmissions] Notice querying paymentSubmissions:', subErr);
        }

        if (!submissionId) {
          if (userRole === 'SUPER_ADMIN') {
            action = 'SUPER_ADMIN_OVERRIDE';
            notes = options?.notes || 'تجاوز إداري استثنائي موثق من المدير العام لتأكيد الدفع';
          } else {
            throw new Error('لا يوجد إشعار دفع مسجل لهذا الطلب. يتطلب تأكيد الدفع الإلكتروني إشعار دفع موثق أو تجاوزاً من المدير العام.');
          }
        }
      }
    }

    // Authoritative update: Must pass through Trusted Backend Gateway (/api/payments/review)
    let token = '';
    if (auth?.currentUser) {
      try {
        token = await auth.currentUser.getIdToken();
      } catch (e) {}
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const baseUrl = typeof window !== 'undefined' ? '' : (process.env.API_BASE_URL || 'http://127.0.0.1:3000');
    const res = await fetch(`${baseUrl}/api/payments/review`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        orderId,
        submissionId,
        action,
        decision: 'CONFIRMED',
        notes,
      }),
    });

    const resData = await res.json().catch(() => ({}));
    if (!res.ok || !resData.success) {
      throw new Error(resData.error || `فشل تأكيد حالة دفع الطلب عبر البوابة الموثوقة (HTTP ${res.status})`);
    }

    // Only mutate memory and local cache AFTER durable backend transaction succeeds
    orders[index].paymentStatus = 'paid';
    persistLocal(orders);

    return true;
  },

  async updateOrderStatus(
    orderId: string,
    newStatus: OrderDetails['status'],
    currentUserId: string,
    userRole: string,
    reason?: string
  ): Promise<boolean> {
    const orders = initOrders();
    const index = orders.findIndex(o => o.orderId === orderId);
    if (index === -1) return false;

    const order = orders[index];
    // State machine integrity check: Terminal states (delivered/cancelled) are immutable and cannot be reopened
    if (order.status === 'delivered' && newStatus !== 'delivered') {
      throw new Error('Cannot reopen or modify terminal delivered order: لا يمكن تعديل أو إعادة فتح طلب تم تسليمه (terminal state)');
    }
    if (order.status === 'cancelled' && newStatus !== 'cancelled') {
      throw new Error('Cannot reopen or modify terminal cancelled order: لا يمكن تعديل أو إعادة فتح طلب ملغي (terminal state)');
    }

    const isAdmin = userRole === 'ADMIN' || userRole === 'SUPER_ADMIN';
    if (!isAdmin) {
      throw new Error('Forbidden: Only platform administrators can change overall order status');
    }

    const now = new Date().toISOString();
    const historyEntry = {
      status: newStatus,
      timestamp: now,
      actor: currentUserId,
      note: reason || `Admin updated order status to ${newStatus}`,
    };
    const nextStatusHistory = [...(order.statusHistory || []), historyEntry];

    let nextVendorOrders = order.vendorOrders ? [...order.vendorOrders] : undefined;
    if (nextVendorOrders) {
      nextVendorOrders = nextVendorOrders.map(v => ({
        ...v,
        status: newStatus === 'cancelled' ? 'cancelled' : newStatus === 'delivered' ? 'delivered' : v.status,
      }));
    }

    // HIGH-06: Await Firestore write first
    try {
      await updateDoc(doc(db, ORDERS_COLLECTION, orderId), {
        status: newStatus,
        statusHistory: nextStatusHistory,
        ...(nextVendorOrders ? { vendorOrders: nextVendorOrders } : {}),
        updatedAt: now,
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `${ORDERS_COLLECTION}/${orderId}`);
      throw err;
    }

    // Mutate state only after Firestore write succeeds
    order.status = newStatus;
    order.statusHistory = nextStatusHistory;
    if (nextVendorOrders) {
      order.vendorOrders = nextVendorOrders;
    }
    orders[index] = order;
    persistLocal(orders);

    // Restore inventory stock when an order is cancelled
    if (newStatus === 'cancelled' && Array.isArray(order.items)) {
      for (const item of order.items) {
        const prodId = item.product?.id || item.id;
        if (prodId && item.quantity > 0) {
          inventoryService.restoreStockOnCancellation(prodId, item.quantity, {
            orderId,
            customerId: order.customerId,
            timestamp: now,
            reason: reason || 'Order cancelled',
          }).catch(err => {
            console.warn(`[OrderService] Failed restoring stock for product ${prodId}:`, err);
          });
        }
      }
    }

    auditLogService.logAction({
      actorId: currentUserId,
      actorRole: userRole as any,
      action: `ORDER_${newStatus.toUpperCase()}`,
      targetType: 'order',
      targetId: orderId,
      targetName: `Order #${orderId}`,
      metadata: { newStatus, total: order.total, reason },
    });

    return true;
  },

  async cancelOrder(
    orderId: string,
    currentUserId: string,
    userRole: string,
    reason?: string
  ): Promise<boolean> {
    return this.updateOrderStatus(orderId, 'cancelled', currentUserId, userRole, reason || 'Cancelled by administrator');
  },

  /**
   * Authoritative verification of whether a user has purchased a product or ordered from a store
   */
  hasUserPurchased(userId: string, targetId: string): boolean {
    if (!userId) return false;
    const orders = initOrders();
    const userOrders = orders.filter(
      o => (o.customerId === userId || (o as any).userId === userId) && o.status !== 'cancelled'
    );
    return userOrders.some(o => {
      const hasProduct = o.items.some(
        it => it.product?.id === targetId || it.id === targetId || it.product?.slug === targetId
      );
      const hasStore = o.vendorOrders?.some(vo => vo.storeId === targetId) || o.items.some(it => it.storeId === targetId);
      return hasProduct || hasStore;
    });
  },
};
