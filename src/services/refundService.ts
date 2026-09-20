import { doc, getDocs, collection, updateDoc, query, where } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { RefundRequest, RefundStatus, UserRole } from '../types';
import { auditLogService } from './auditLogService';
import { orderService } from './orderService';

const REFUNDS_STORAGE_KEY = 'marketspace_refund_requests_v1';
const REFUNDS_COLLECTION = 'refundRequests';

export const INITIAL_REFUNDS: RefundRequest[] = [
  {
    id: 'REF-2026-001',
    orderId: 'ORD-1715000001',
    subOrderId: 'ORD-1715000001-SUB-1',
    customerId: 'user_cust_01',
    customerName: 'Amina Farah Warsame',
    customerPhone: '+252 61 5551234',
    sellerId: 'user_seller_01',
    storeId: 'store_cosmetics_01',
    amount: 18.0,
    reason: 'damaged',
    notes: 'One cosmetic bottle arrived leaking during transit',
    status: 'REFUNDED',
    settlementType: 'MANUAL_MOBILE_TRANSFER',
    settlementReference: 'EVC-REF-9920194',
    adminNotes: 'Verified with merchant and customer. Partial refund issued via EVC Plus.',
    processedBy: 'system_admin',
    processedAt: '2026-02-15T14:30:00.000Z',
    createdAt: '2026-02-14T10:00:00.000Z',
    updatedAt: '2026-02-15T14:30:00.000Z',
  },
];

let memoryRefunds: RefundRequest[] = [];

function loadRefunds(): RefundRequest[] {
  if (memoryRefunds.length > 0) return memoryRefunds;
  if (typeof window === 'undefined') return INITIAL_REFUNDS;
  try {
    const raw = localStorage.getItem(REFUNDS_STORAGE_KEY);
    memoryRefunds = raw ? JSON.parse(raw) : INITIAL_REFUNDS;
    return memoryRefunds;
  } catch {
    return INITIAL_REFUNDS;
  }
}

function persistRefunds(refunds: RefundRequest[]) {
  memoryRefunds = refunds;
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(REFUNDS_STORAGE_KEY, JSON.stringify(refunds));
  } catch (err) {
    console.error('Failed to save refunds to localStorage', err);
  }
}

export const refundService = {
  /**
   * Seed refund requests in memory for deterministic test fixtures and audits
   */
  seedRefunds(refunds: RefundRequest[]) {
    memoryRefunds = [...refunds];
  },

  async syncWithFirestore(filter?: { customerId?: string; sellerId?: string; isAdmin?: boolean }): Promise<RefundRequest[]> {
    try {
      let q;
      if (filter?.isAdmin) {
        q = collection(db, REFUNDS_COLLECTION);
      } else if (filter?.customerId) {
        q = query(collection(db, REFUNDS_COLLECTION), where('customerId', '==', filter.customerId));
      } else if (filter?.sellerId) {
        q = query(collection(db, REFUNDS_COLLECTION), where('sellerId', '==', filter.sellerId));
      }

      if (q) {
        const snap = await getDocs(q);
        if (!snap.empty) {
          const cloudRefunds: RefundRequest[] = [];
          snap.forEach(d => cloudRefunds.push(d.data() as RefundRequest));
          persistRefunds(cloudRefunds);
          return cloudRefunds;
        }
      }
    } catch (err) {
      console.warn('Refunds Firestore sync offline:', err);
    }
    return loadRefunds();
  },

  getAllRefunds(): RefundRequest[] {
    return loadRefunds();
  },

  getRefundsBySeller(sellerId: string): RefundRequest[] {
    return loadRefunds().filter(r => r.sellerId === sellerId);
  },

  getRefundsByCustomer(customerId: string): RefundRequest[] {
    return loadRefunds().filter(r => r.customerId === customerId);
  },

  getRefundsByOrder(orderId: string): RefundRequest[] {
    return loadRefunds().filter(r => r.orderId === orderId);
  },

  getRemainingRefundable(orderId: string): number {
    const order = orderService.getOrderById(orderId, undefined, 'ADMIN');
    if (!order) return 0;
    const existingRefunds = this.getRefundsByOrder(orderId).filter(
      r => r.status !== 'REFUND_REJECTED'
    );
    const totalRefundedOrPending = existingRefunds.reduce((sum, r) => sum + r.amount, 0);
    return Math.max(0, order.total - totalRefundedOrPending);
  },

  /**
   * Customer initiates a refund request for an order.
   * Validates order existence, customer ownership, seller assignment, and max allowable amount.
   */
  async requestRefund(params: {
    orderId: string;
    subOrderId?: string;
    customerId: string;
    customerName: string;
    customerPhone: string;
    sellerId?: string;
    storeId?: string;
    amount: number;
    reason: RefundRequest['reason'];
    notes?: string;
  }): Promise<RefundRequest> {
    const amount = Number(params.amount);
    if (isNaN(amount) || !isFinite(amount) || amount <= 0) {
      throw new Error('مبلغ الاسترداد يجب أن يكون رقماً موجباً أكبر من الصفر (Invalid refund amount: must be greater than zero)');
    }

    const order = orderService.getOrderById(params.orderId, params.customerId, 'CUSTOMER');
    if (!order) {
      const anyOrder = orderService.getOrderById(params.orderId, undefined, 'ADMIN');
      if (anyOrder && anyOrder.customerId !== params.customerId) {
        throw new Error('Forbidden: لا يمكنك طلب استرداد لطلب لا يخصك (You cannot request a refund for an order you do not own)');
      }
      throw new Error('الطلب غير موجود (Order not found)');
    }

    if (amount > order.total) {
      throw new Error(`مبلغ الاسترداد المطلوب ($${amount}) يتجاوز إجمالي الطلب ($${order.total}) (Refund amount cannot exceed order total)`);
    }

    const existingRefunds = this.getRefundsByOrder(params.orderId).filter(
      r => r.status !== 'REFUND_REJECTED'
    );
    const totalRefundedOrPending = existingRefunds.reduce((sum, r) => sum + r.amount, 0);
    const remainingRefundable = Math.max(0, order.total - totalRefundedOrPending);

    if (amount > remainingRefundable) {
      throw new Error(`مبلغ الاسترداد المطلوب ($${amount}) يتجاوز الرصيد المتبقي القابل للاسترداد ($${remainingRefundable})`);
    }

    return this.createRefundRequest({
      ...params,
      sellerId: params.sellerId || (order.vendorOrders?.[0]?.sellerId || ''),
      storeId: params.storeId || (order.vendorOrders?.[0]?.storeId || ''),
      notes: params.notes || '',
    });
  },

  async createRefundRequest(params: {
    orderId: string;
    subOrderId?: string;
    customerId?: string;
    customerName?: string;
    customerPhone?: string;
    sellerId?: string;
    storeId?: string;
    amount: number;
    reason: RefundRequest['reason'];
    notes?: string;
  }): Promise<RefundRequest> {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error('UNAUTHENTICATED: Authentication required to submit a refund request (تسجيل الدخول مطلوب لتقديم طلب استرداد)');
    }

    const idToken = await currentUser.getIdToken();
    const res = await fetch('/api/refunds/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        orderId: params.orderId,
        subOrderId: params.subOrderId,
        amount: Number(params.amount),
        reason: params.reason,
        notes: params.notes,
      }),
    });

    const data = await res.json();
    if (!res.ok || !data.success || !data.refund) {
      throw new Error(data.error || 'Failed to process refund request');
    }

    const createdRefund: RefundRequest = data.refund;
    const refunds = loadRefunds();
    const existingIndex = refunds.findIndex(r => r.id === createdRefund.id);
    if (existingIndex >= 0) {
      refunds[existingIndex] = createdRefund;
    } else {
      refunds.unshift(createdRefund);
    }
    persistRefunds(refunds);

    return createdRefund;
  },

  async processRefund(params: {
    refundId: string;
    newStatus: RefundStatus;
    adminId: string;
    adminRole?: UserRole;
    settlementReference?: string;
    adminNotes?: string;
  }): Promise<RefundRequest> {
    const adminRole = params.adminRole || 'ADMIN';
    const refunds = loadRefunds();
    const target = refunds.find(r => r.id === params.refundId);
    if (!target) throw new Error('Refund request not found');

    if (target.status === 'REFUNDED') {
      throw new Error('Terminal state: settled refund cannot be modified (تمت تسويته مسبقاً - terminal)');
    }

    if (params.newStatus === 'REFUNDED') {
      const ref = params.settlementReference?.trim() || '';
      if (!ref || ref.length < 4) {
        throw new Error('رقم إشعار / مرجع التحويل المالي مطلوب ويجب أن يحتوي على 4 أحرف على الأقل');
      }
      return this.recordSettlement(
        params.refundId,
        {
          settlementType: 'MANUAL_MOBILE_TRANSFER',
          settlementReference: ref,
          adminNotes: params.adminNotes,
        },
        params.adminId,
        adminRole
      );
    } else {
      const action = params.newStatus === 'REFUND_APPROVED' ? 'APPROVE' : 'REJECT';
      return this.reviewRefund(params.refundId, action, params.adminId, adminRole, params.adminNotes);
    }
  },

  /**
   * Admin approves or rejects refund request.
   * HIGH-06: Awaits Firestore update first; fails fast without corrupting state if Firestore fails.
   */
  async reviewRefund(
    refundId: string,
    action: 'APPROVE' | 'REJECT',
    adminId: string,
    adminRole: UserRole,
    adminNotes?: string
  ): Promise<RefundRequest> {
    const isAdmin = adminRole === 'ADMIN' || adminRole === 'SUPER_ADMIN';
    if (!isAdmin) {
      throw new Error('Forbidden: Only administrators can review refund disputes');
    }

    const refunds = loadRefunds();
    const target = refunds.find(r => r.id === refundId);
    if (!target) throw new Error('Refund request not found');

    if (target.status === 'REFUNDED') {
      throw new Error('Terminal state: Settled refunds cannot be modified');
    }

    const now = new Date().toISOString();
    const nextStatus: RefundStatus = action === 'APPROVE' ? 'REFUND_APPROVED' : 'REFUND_REJECTED';

    try {
      await updateDoc(doc(db, REFUNDS_COLLECTION, refundId), {
        status: nextStatus,
        processedBy: adminId,
        processedAt: now,
        updatedAt: now,
        adminNotes: adminNotes || target.adminNotes || '',
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `${REFUNDS_COLLECTION}/${refundId}`);
      throw err;
    }

    target.status = nextStatus;
    target.processedBy = adminId;
    target.processedAt = now;
    target.updatedAt = now;
    if (adminNotes) target.adminNotes = adminNotes;

    persistRefunds(refunds);

    await auditLogService.logAction({
      actorId: adminId,
      actorRole: adminRole,
      action: action === 'APPROVE' ? 'REFUND_APPROVED' : ('REFUND_REJECTED' as any),
      targetType: 'refund',
      targetId: refundId,
      targetName: `Refund for Order ${target.orderId}`,
      metadata: { status: target.status, amount: target.amount },
    });

    return target;
  },

  /**
   * Admin records the actual manual mobile money settlement (EVC Plus, Zaad, Sahal, Cash).
   * HIGH-06: Awaits Firestore update first; fails fast without corrupting state if Firestore fails.
   */
  async recordSettlement(
    refundId: string,
    params: {
      settlementType: 'MANUAL_MOBILE_TRANSFER' | 'CASH' | 'STORE_CREDIT';
      settlementReference: string;
      adminNotes?: string;
    },
    adminId: string,
    adminRole: UserRole
  ): Promise<RefundRequest> {
    const isAdmin = adminRole === 'ADMIN' || adminRole === 'SUPER_ADMIN';
    if (!isAdmin) {
      throw new Error('Forbidden: Only administrators can settle refunds');
    }

    const refunds = loadRefunds();
    const target = refunds.find(r => r.id === refundId);
    if (!target) throw new Error('Refund request not found');

    const trimmedRef = params.settlementReference.trim();
    if (!trimmedRef || trimmedRef.length < 4) {
      throw new Error('رقم إشعار / مرجع التحويل المالي مطلوب ويجب أن يحتوي على 4 خانات على الأقل');
    }
    if (target.status === 'REFUNDED') {
      throw new Error('Terminal state: Refund has already been settled and completed');
    }
    if (target.status !== 'REFUND_APPROVED') {
      throw new Error('يجب اعتماد طلب الاسترداد أولاً قبل تسجيل التسوية المالية');
    }

    const now = new Date().toISOString();

    try {
      await updateDoc(doc(db, REFUNDS_COLLECTION, refundId), {
        status: 'REFUNDED',
        settlementType: params.settlementType,
        settlementReference: trimmedRef,
        processedBy: adminId,
        processedAt: now,
        updatedAt: now,
        adminNotes: params.adminNotes || target.adminNotes || '',
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `${REFUNDS_COLLECTION}/${refundId}`);
      throw err;
    }

    target.status = 'REFUNDED';
    target.settlementType = params.settlementType;
    target.settlementReference = trimmedRef;
    target.processedBy = adminId;
    target.processedAt = now;
    target.updatedAt = now;
    if (params.adminNotes) target.adminNotes = params.adminNotes;

    persistRefunds(refunds);

    await auditLogService.logAction({
      actorId: adminId,
      actorRole: adminRole,
      action: 'REFUND_SETTLED' as any,
      targetType: 'refund',
      targetId: refundId,
      targetName: `Refund ${refundId}`,
      metadata: {
        settlementType: params.settlementType,
        settlementReference: params.settlementReference,
        amount: target.amount,
      },
    });

    return target;
  },

  getRefundRequests(): RefundRequest[] {
    return loadRefunds();
  },

  async approveRefund(
    refundId: string,
    adminId: string,
    adminRole: UserRole,
    adminNotes?: string
  ): Promise<RefundRequest> {
    return this.reviewRefund(refundId, 'APPROVE', adminId, adminRole, adminNotes);
  },

  async rejectRefund(
    refundId: string,
    adminId: string,
    adminRole: UserRole,
    adminNotes?: string
  ): Promise<RefundRequest> {
    return this.reviewRefund(refundId, 'REJECT', adminId, adminRole, adminNotes);
  },
};
