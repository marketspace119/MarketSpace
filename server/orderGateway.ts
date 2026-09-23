import crypto from 'crypto';
import { getAdminDb, verifyFirebaseBearerToken, getServerIdentityInfo, isCallerSuperAdmin, isCallerPlatformAdmin } from './firebaseAdmin';
import { seedProducts } from '../src/data/seedProducts';
import { seedStores } from '../src/data/seedStores';
import { INITIAL_PLATFORM_COUPONS } from '../src/services/couponService';
import { CartItem, OrderDetails, Product, VendorSubOrder } from '../src/types';

const FREE_SHIPPING_STORE_THRESHOLD = 50.0;
const DEFAULT_STORE_DELIVERY_FEE = 2.0;
const DEFAULT_COMMISSION_RATE = 10.0;

// Transient in-flight locking with TTL to prevent simultaneous race conditions and deadlocks
const IN_FLIGHT_LOCK_TTL_MS = 60 * 1000; // 60 seconds TTL
const inFlightRequests = new Map<string, number>();

function acquireInFlightLock(key: string): void {
  const now = Date.now();
  const existingTime = inFlightRequests.get(key);
  if (existingTime && (now - existingTime) < IN_FLIGHT_LOCK_TTL_MS) {
    throw new Error('A concurrent order request with this idempotency key is currently processing. Please wait.');
  }
  inFlightRequests.set(key, now);
}

function releaseInFlightLock(key: string): void {
  inFlightRequests.delete(key);
}

export interface GatewayOrderRequest {
  items: Array<{
    productId: string;
    quantity: number;
    selectedOptions?: Record<string, string>;
    selectedAddons?: Array<{ id: string; name?: string; price?: number }>;
    productSnapshot?: Product;
  }>;
  customerName: string;
  phone: string;
  email?: string;
  city: string;
  address: string;
  paymentMethod: 'cash_on_delivery' | 'cod' | 'evc_plus' | 'zaad' | 'sahall' | 'card';
  notes?: string;
  customerId?: string;
  couponCode?: string;
  idempotencyKey?: string;
}

/**
 * Fetch product by ID authoritatively using Firestore Admin DB catalog only.
 * Fail-Closed: Never trust client snapshot or browser prices.
 */
async function getAuthoritativeProduct(productId: string): Promise<Product | null> {
  let snap;
  try {
    const adminDb = getAdminDb();
    snap = await adminDb.collection('products').doc(productId).get();
  } catch (err: any) {
    console.error(`[OrderGateway:Error] Firestore read failure for product ${productId}:`, err?.message || err);
    throw new Error(`Database read failure: Unable to verify product ${productId} authoritatively.`);
  }

  if (snap && snap.exists) {
    return snap.data() as Product;
  }

  return null;
}

/**
 * Fetch store by ID authoritatively using Admin DB or verified catalog
 */
async function getAuthoritativeStore(storeId: string) {
  let snap;
  try {
    const adminDb = getAdminDb();
    snap = await adminDb.collection('stores').doc(storeId).get();
  } catch (err: any) {
    console.error(`[OrderGateway:Error] Firestore read failure for store ${storeId}:`, err?.message || err);
    throw new Error(`Database read failure: Unable to retrieve store #${storeId}. Transaction aborted (Fail-Closed).`);
  }

  if (snap && snap.exists) {
    const data = snap.data();
    if (data?.status === 'suspended' || data?.status === 'rejected' || data?.status === 'inactive') {
      throw new Error(`Store #${storeId} is currently ${data.status} and cannot accept orders`);
    }
    return { ...data, id: snap.id };
  }

  const found = seedStores.find(s => s.id === storeId);
  if (found) {
    if (found.status === 'suspended' || found.status === 'rejected') {
      throw new Error(`Store #${storeId} is currently ${found.status} and cannot accept orders`);
    }
    return found;
  }

  throw new Error(`Store #${storeId} not found in authoritative database. Transaction aborted (Fail-Closed).`);
}

/**
 * Fetch coupon by code authoritatively using Admin DB or verified catalog
 */
async function getAuthoritativeCoupon(code: string) {
  const normalized = code.trim().toUpperCase();
  let snap;
  try {
    const adminDb = getAdminDb();
    snap = await adminDb.collection('coupons').where('code', '==', normalized).limit(1).get();
  } catch (err: any) {
    console.error(`[OrderGateway:Error] Firestore read failure for coupon ${code}:`, err?.message || err);
    throw new Error(`Database read failure: Unable to verify coupon #${code}. Transaction aborted (Fail-Closed).`);
  }

  if (snap && !snap.empty) {
    const docData = snap.docs[0].data();
    return { ...docData, _docId: snap.docs[0].id };
  }

  const found = INITIAL_PLATFORM_COUPONS.find(c => c.code.toUpperCase() === normalized);
  return found || null;
}

/**
 * PART 14: Single Source of Truth Commission Resolution
 * Priority:
 *  1. Store Custom Override (store.commissionRate)
 *  2. Category Specific Rate (categoryRates[category])
 *  3. Seller Type Rate (sellerTypeRates[sellerType])
 *  4. Global Platform Rate (platformSettings.defaultCommissionRate)
 */
async function resolveAuthoritativeCommissionRate(
  store: any,
  sellerType: string,
  category?: string
): Promise<{ rate: number; policySource: string }> {
  // 1. Store Custom Override
  if (store && typeof store.commissionRate === 'number' && store.commissionRate >= 0) {
    return { rate: store.commissionRate, policySource: 'seller_specific' };
  }

  let globalRate = DEFAULT_COMMISSION_RATE;
  let sellerTypeRates: Record<string, number> = {
    restaurant: 6,
    service: 8,
    store: 10,
    classified: 5,
  };
  let categoryRates: Record<string, number> = {
    electronics: 7,
    digital: 5,
    cosmetics: 9,
    fashion: 10,
    groceries: 6,
    automotive: 8,
  };

  try {
    const adminDb = getAdminDb();
    const settingsSnap = await adminDb.collection('platformSettings').doc('default').get();
    if (settingsSnap.exists) {
      const data = settingsSnap.data();
      if (typeof data?.defaultCommissionRate === 'number') {
        globalRate = data.defaultCommissionRate;
      }
      if (data?.sellerTypeCommissionRates) {
        sellerTypeRates = { ...sellerTypeRates, ...data.sellerTypeCommissionRates };
      }
      if (data?.categoryCommissionRates) {
        categoryRates = { ...categoryRates, ...data.categoryCommissionRates };
      }
    }
  } catch (err: any) {
    console.error('[OrderGateway:Error] Failed to read platformSettings for commission resolution:', err);
    throw new Error('Database error while querying authoritative commission policy. Transaction aborted (Fail-Closed).');
  }

  // 2. Category Rate
  if (category && categoryRates[category] !== undefined) {
    return { rate: categoryRates[category], policySource: 'category' };
  }

  // 3. Seller Type Rate
  if (sellerType && sellerTypeRates[sellerType] !== undefined) {
    return { rate: sellerTypeRates[sellerType], policySource: 'seller_type' };
  }

  // 4. Global Platform Rate
  return { rate: globalRate, policySource: 'global' };
}

/**
 * Trusted Order Processing Gateway Execution
 * Enforces real server authentication, customer UID verification, server-side pricing, and Admin SDK writes.
 */
export async function processOrderGateway(
  payload: GatewayOrderRequest,
  authHeader?: string
): Promise<{ order: OrderDetails; reused?: boolean }> {
  // 1. Authenticate Caller
  let verifiedCustomerId: string;
  let isGuestOrder = true;

  if (authHeader) {
    const decoded = await verifyFirebaseBearerToken(authHeader);
    if (decoded) {
      verifiedCustomerId = decoded.uid;
      isGuestOrder = false;

      // Anti-Spoofing Check: If client sent a different customerId in the body, ignore and override it!
      if (payload.customerId && payload.customerId !== verifiedCustomerId) {
        console.warn(
          `[OrderGateway:Security] Overriding spoofed customerId "${payload.customerId}" with authenticated UID "${verifiedCustomerId}"`
        );
      }
    } else {
      throw new Error('Authentication failed: Missing or invalid credentials');
    }
  } else {
    // Guest Checkout Validation
    if (!payload.customerName?.trim() || !payload.phone?.trim() || !payload.city?.trim() || !payload.address?.trim()) {
      throw new Error('Guest checkout requires complete delivery information (name, phone, city, address)');
    }

    // Securely derive customer identifier for guest
    const guestHash = crypto
      .createHash('sha256')
      .update(`${payload.phone.trim()}_${payload.city.trim()}`)
      .digest('hex')
      .slice(0, 12);
    verifiedCustomerId = `guest_${guestHash}`;
  }

  // 2. Caller-Scoped Idempotency Setup
  const idempotencyCompositeKey = payload.idempotencyKey
    ? `${verifiedCustomerId}:${payload.idempotencyKey}`
    : undefined;
  const idempotencyDocKey = idempotencyCompositeKey
    ? crypto.createHash('sha256').update(idempotencyCompositeKey).digest('hex')
    : undefined;

  // In-flight concurrent request deduplication
  if (idempotencyCompositeKey) {
    acquireInFlightLock(idempotencyCompositeKey);
  }

  // 3. Validate essential customer fields
  if (!payload.items || !Array.isArray(payload.items) || payload.items.length === 0) {
    throw new Error('Cart cannot be empty');
  }
  if (!payload.customerName || !payload.customerName.trim()) {
    throw new Error('Customer full name is required');
  }
  if (!payload.phone || !payload.phone.trim()) {
    throw new Error('Customer phone number is required');
  }
  if (!payload.city || !payload.city.trim()) {
    throw new Error('Delivery city is required');
  }
  if (!payload.address || !payload.address.trim()) {
    throw new Error('Delivery address is required');
  }
  if (!payload.paymentMethod) {
    throw new Error('Payment method is required');
  }
  if (payload.paymentMethod === 'card') {
    throw new Error('Card payments are temporarily unavailable awaiting PCI gateway certification');
  }

  const now = new Date().toISOString();
  const parentOrderId = `ord_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

  // 4. Server-Side Catalog Verification (Product-by-Product)
  const verifiedOrderItems: CartItem[] = [];
  const itemsByStore: Record<string, CartItem[]> = {};

  for (const clientItem of payload.items) {
    const product = await getAuthoritativeProduct(clientItem.productId);
    if (!product) {
      throw new Error(`Product not found: ${clientItem.productId}`);
    }

    if (product.status && product.status !== 'published' && product.status !== 'approved') {
      throw new Error(`Product "${product.title?.en || product.title}" is currently not available`);
    }

    const qty = Math.max(1, Math.min(999, Math.floor(Number(clientItem.quantity) || 1)));

    // Stock verification
    if (product.stock !== undefined && product.stock < qty) {
      const prodTitle = typeof product.title === 'string' ? product.title : product.title?.en || product.title?.ar || product.id;
      throw new Error(`Insufficient stock for "${prodTitle}". Requested: ${qty}, In Stock: ${product.stock}`);
    }

    // Authoritative pricing: NEVER use client price
    const unitPrice = Math.max(0, Number(product.price) || 0);

    // Verify Addons from catalog
    let verifiedAddonsTotal = 0;
    const verifiedSelectedAddons: Array<{ id: string; name: { ar: string; en: string; so: string }; price: number }> = [];

    if (clientItem.selectedAddons && Array.isArray(clientItem.selectedAddons)) {
      for (const clientAddon of clientItem.selectedAddons) {
        const catalogAddon = product.addons?.find(a => a.id === clientAddon.id);
        if (catalogAddon) {
          const addonPrice = Math.max(0, Number(catalogAddon.price) || 0);
          verifiedAddonsTotal += addonPrice;
          const addonNameObj = typeof catalogAddon.name === 'object' && catalogAddon.name !== null
            ? catalogAddon.name
            : { ar: String(catalogAddon.name), en: String(catalogAddon.name), so: String(catalogAddon.name) };
          verifiedSelectedAddons.push({
            id: catalogAddon.id,
            name: addonNameObj,
            price: addonPrice,
          });
        }
      }
    }

    const storeId = product.storeId || (
      product.type === 'restaurants' || product.type === 'restaurant-products'
        ? 'store_restaurant_01'
        : product.type === 'services'
        ? 'store_service_01'
        : product.type === 'used' || product.type === 'ads'
        ? 'store_classified_01'
        : 'store_cosmetics_01'
    );
    const sellerId = product.sellerId || (
      storeId === 'store_restaurant_01'
        ? 'user_restaurant_01'
        : storeId === 'store_service_01'
        ? 'user_service_01'
        : storeId === 'store_classified_01'
        ? 'user_classified_01'
        : 'user_seller_01'
    );

    const orderItem: CartItem = {
      id: `${product.id}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      product: {
        ...product,
        price: unitPrice, // Strictly enforce authoritative catalog price
      },
      quantity: qty,
      selectedColor: clientItem.selectedOptions?.color,
      selectedSize: clientItem.selectedOptions?.size,
      selectedAddons: verifiedSelectedAddons.length > 0 ? (verifiedSelectedAddons as any) : undefined,
      storeId,
      sellerId,
    };

    verifiedOrderItems.push(orderItem);

    if (!itemsByStore[storeId]) {
      itemsByStore[storeId] = [];
    }
    itemsByStore[storeId].push(orderItem);
  }

  // 5. Server-Side Multi-Vendor Sub-Orders & Commission Calculations
  const vendorOrders: VendorSubOrder[] = [];
  let serverCalculatedSubtotal = 0;
  let serverCalculatedShipping = 0;

  let storeIndex = 1;
  for (const [storeId, storeItems] of Object.entries(itemsByStore)) {
    const store = await getAuthoritativeStore(storeId);

    // Verify cross-seller store isolation: Product seller must match store seller
    if (store?.sellerId && storeItems.some(it => it.sellerId && it.sellerId !== store.sellerId && it.sellerId !== 'seller_system')) {
      throw new Error(`Security isolation error: Product seller does not match store owner for store #${storeId}`);
    }

    const storeSubtotal = storeItems.reduce((sum, it) => {
      const base = Number(it.product.price) || 0;
      const addons = it.selectedAddons?.reduce((aSum, a) => aSum + (Number(a.price) || 0), 0) || 0;
      return sum + (base + addons) * it.quantity;
    }, 0);
    serverCalculatedSubtotal += storeSubtotal;

    // Authoritative Delivery Fee: Store delivery fee or free shipping over threshold
    const isFreeShipping = storeSubtotal >= FREE_SHIPPING_STORE_THRESHOLD;
    const storeDeliveryFee = isFreeShipping
      ? 0
      : (typeof store?.deliveryFee === 'number' ? store.deliveryFee : DEFAULT_STORE_DELIVERY_FEE);
    serverCalculatedShipping += storeDeliveryFee;

    // Authoritative 4-Tier Commission calculation (PART 14)
    const storeSellerType = (store?.sellerType as any) || 'store';
    const storeCategory = storeItems[0]?.product?.category;
    const { rate: commissionRate, policySource } = await resolveAuthoritativeCommissionRate(
      store,
      storeSellerType,
      storeCategory
    );
    const platformCommission = Number(((storeSubtotal * commissionRate) / 100).toFixed(2));
    const sellerRevenue = Number((storeSubtotal - platformCommission).toFixed(2));

    const subOrderId = `${parentOrderId}-S${storeIndex++}`;
    const sellerId = store?.sellerId || (storeItems[0].product.sellerId || 'seller_system');
    const sellerType = storeSellerType;

    vendorOrders.push({
      subOrderId,
      parentOrderId,
      storeId,
      storeName: (typeof store?.name === 'string' ? store.name : store?.name?.en) || 'MarketSpace Store',
      sellerId,
      sellerType,
      items: storeItems,
      subtotal: Number(storeSubtotal.toFixed(2)),
      deliveryFee: Number(storeDeliveryFee.toFixed(2)),
      total: Number((storeSubtotal + storeDeliveryFee).toFixed(2)),
      commissionRate,
      effectiveCommissionRate: commissionRate,
      commissionPolicyUsed: policySource as any,
      platformCommission,
      sellerRevenue,
      discount: 0,
      status: 'pending',
      sellerPhone: store?.phone,
      sellerWhatsapp: store?.whatsapp,
    });
  }

  // 6. Server-Side Coupon Verification (Fail-Closed)
  let serverCalculatedDiscount = 0;
  let verifiedCouponCode: string | undefined = undefined;
  let verifiedCouponDocId: string | undefined = undefined;

  if (payload.couponCode && payload.couponCode.trim()) {
    const coupon = await getAuthoritativeCoupon(payload.couponCode.trim());
    if (!coupon) {
      throw new Error(`Coupon code '${payload.couponCode}' is invalid or does not exist`);
    }
    if (!coupon.active) {
      throw new Error(`Coupon code '${payload.couponCode}' is inactive`);
    }
    const isStarted = !coupon.startAt || new Date(coupon.startAt).getTime() <= Date.now();
    if (!isStarted) {
      throw new Error(`Coupon code '${payload.couponCode}' is not yet valid`);
    }
    const isNotExpired = !coupon.expireAt || new Date(coupon.expireAt).getTime() >= Date.now();
    if (!isNotExpired) {
      throw new Error(`Coupon code '${payload.couponCode}' has expired`);
    }
    // Scope verification: check seller, store, and category restrictions
    let eligibleItems = verifiedOrderItems;
    if (coupon.sellerId) {
      eligibleItems = eligibleItems.filter(it => it.sellerId === coupon.sellerId || it.product.sellerId === coupon.sellerId);
      if (eligibleItems.length === 0) {
        throw new Error(`Coupon '${payload.couponCode}' is not applicable to any items in this order`);
      }
    }
    if (coupon.storeId) {
      eligibleItems = eligibleItems.filter(it => it.storeId === coupon.storeId);
      if (eligibleItems.length === 0) {
        throw new Error(`Coupon '${payload.couponCode}' is only valid for store #${coupon.storeId}`);
      }
    }
    if (coupon.applicableCategory) {
      eligibleItems = eligibleItems.filter(it => it.product.category === coupon.applicableCategory);
      if (eligibleItems.length === 0) {
        throw new Error(`Coupon '${payload.couponCode}' is only valid for category '${coupon.applicableCategory}'`);
      }
    }

    const eligibleSubtotal = eligibleItems.reduce((sum, it) => {
      const base = Number(it.product.price) || 0;
      const addons = it.selectedAddons?.reduce((aSum, a) => aSum + (Number(a.price) || 0), 0) || 0;
      return sum + (base + addons) * it.quantity;
    }, 0);

    const meetsMinOrder = !coupon.minOrderAmount || eligibleSubtotal >= coupon.minOrderAmount;
    if (!meetsMinOrder) {
      throw new Error(`Minimum eligible order amount of $${coupon.minOrderAmount} required for coupon '${payload.couponCode}'`);
    }
    if (typeof coupon.usageLimit === 'number' && coupon.usageLimit > 0) {
      const usedCount = Number(coupon.usedCount) || 0;
      if (usedCount >= coupon.usageLimit) {
        throw new Error(`Coupon '${payload.couponCode}' usage limit has been reached`);
      }
    }
    if (verifiedCustomerId && typeof coupon.perCustomerLimit === 'number' && coupon.perCustomerLimit > 0) {
      const customerUses = (coupon.customerUsage && coupon.customerUsage[verifiedCustomerId]) || 0;
      if (customerUses >= coupon.perCustomerLimit) {
        throw new Error(`Coupon '${payload.couponCode}' per-customer usage limit exceeded`);
      }
    }

    let discount = 0;
    if (coupon.discountType === 'percentage') {
      discount = (eligibleSubtotal * (Number(coupon.discountValue) || 0)) / 100;
      if (coupon.maxDiscountAmount && discount > coupon.maxDiscountAmount) {
        discount = coupon.maxDiscountAmount;
      }
    } else {
      discount = Number(coupon.discountValue) || 0;
    }

    serverCalculatedDiscount = Math.min(eligibleSubtotal, Number(discount.toFixed(2)));
    verifiedCouponCode = coupon.code;
    verifiedCouponDocId = (coupon as any)._docId;

    if (coupon.storeId || coupon.sellerId) {
      const targetVendorOrder = vendorOrders.find(
        vo => (coupon.storeId && vo.storeId === coupon.storeId) || (coupon.sellerId && vo.sellerId === coupon.sellerId)
      );
      if (targetVendorOrder) {
        targetVendorOrder.discount = serverCalculatedDiscount;
        targetVendorOrder.total = Math.max(0, Number((targetVendorOrder.subtotal + targetVendorOrder.deliveryFee - serverCalculatedDiscount).toFixed(2)));
      }
    }
  }

  // 7. Server-Side Final Grand Total
  serverCalculatedSubtotal = Number(serverCalculatedSubtotal.toFixed(2));
  serverCalculatedShipping = Number(serverCalculatedShipping.toFixed(2));
  const serverCalculatedTax = 0;
  const serverCalculatedTotal = Math.max(
    0.01,
    Number((serverCalculatedSubtotal + serverCalculatedShipping + serverCalculatedTax - serverCalculatedDiscount).toFixed(2))
  );

  const sellerIds = Array.from(new Set(vendorOrders.map(v => v.sellerId)));
  const vendorStoreIds = Array.from(new Set(vendorOrders.map(v => v.storeId)));
  const normalizedPaymentMethod = payload.paymentMethod === 'cod' ? 'cash_on_delivery' : payload.paymentMethod;

  const finalOrder: OrderDetails = {
    orderId: parentOrderId,
    customerId: verifiedCustomerId,
    sellerIds,
    vendorStoreIds,
    customerName: payload.customerName.trim(),
    phone: payload.phone.trim(),
    ...(payload.email?.trim() ? { email: payload.email.trim() } : {}),
    city: payload.city.trim(),
    address: payload.address.trim(),
    paymentMethod: normalizedPaymentMethod,
    paymentStatus: 'pending',
    ...(payload.notes?.trim() ? { notes: payload.notes.slice(0, 1000) } : {}),
    items: verifiedOrderItems,
    vendorOrders,
    subtotal: serverCalculatedSubtotal,
    shipping: serverCalculatedShipping,
    tax: serverCalculatedTax,
    discount: serverCalculatedDiscount,
    ...(verifiedCouponCode ? { couponCode: verifiedCouponCode } : {}),
    total: serverCalculatedTotal,
    createdAt: now,
    status: 'pending',
  };

  // Helper to remove any undefined fields recursively for Firestore compliance
  const sanitizeForFirestore = (obj: any): any => {
    return JSON.parse(JSON.stringify(obj));
  };

  const cleanOrderPayload = sanitizeForFirestore(finalOrder);

  // 8. Atomic Inventory Decrement, Durable Idempotency & Order Creation via Firebase Admin SDK
  const adminDb = getAdminDb();
  const orderRef = adminDb.collection('orders').doc(finalOrder.orderId);

  try {
    const result = await adminDb.runTransaction(async (transaction) => {
      // Step 1: All Transactional Reads FIRST
      // 1a. Durable idempotency read
      if (idempotencyDocKey) {
        const idempRef = adminDb.collection('idempotency_keys').doc(idempotencyDocKey);
        const idempDoc = await transaction.get(idempRef);
        if (idempDoc.exists) {
          const idempData = idempDoc.data();
          if (idempData?.order) {
            console.log(`[OrderGateway:Idempotency] Returning durable cached order for key hash: ${idempotencyDocKey}`);
            return { order: idempData.order as OrderDetails, reused: true };
          }
        }
      }

      // 1b. Product stock reads
      const productDocsToUpdate: Array<{ ref: FirebaseFirestore.DocumentReference; newStock: number }> = [];
      for (const it of verifiedOrderItems) {
        if (it.product.stock !== undefined) {
          const prodRef = adminDb.collection('products').doc(it.product.id);
          const prodDoc = await transaction.get(prodRef);
          if (prodDoc.exists) {
            const currentStock = prodDoc.data()?.stock;
            if (typeof currentStock === 'number') {
              if (currentStock < it.quantity) {
                throw new Error(`Insufficient stock for product "${it.product.title?.en || it.product.id}"`);
              }
              productDocsToUpdate.push({
                ref: prodRef,
                newStock: currentStock - it.quantity,
              });
            }
          }
        }
      }

      // 1c. Coupon read & atomic invariant verification inside transaction
      let couponDocToUpdate: { ref: FirebaseFirestore.DocumentReference; newCount: number; newCustUsage: Record<string, number> } | null = null;
      if (verifiedCouponDocId) {
        const couponRef = adminDb.collection('coupons').doc(verifiedCouponDocId);
        const couponDoc = await transaction.get(couponRef);
        if (couponDoc.exists) {
          const cData = couponDoc.data() || {};
          if (cData.active === false) {
            throw new Error(`Coupon '${verifiedCouponCode}' is inactive`);
          }
          const currentCount = Number(cData.usedCount) || 0;
          if (typeof cData.usageLimit === 'number' && cData.usageLimit > 0 && currentCount >= cData.usageLimit) {
            throw new Error(`Coupon '${verifiedCouponCode}' usage limit has been reached`);
          }
          const currentCustUsage = { ...(cData.customerUsage || {}) };
          if (verifiedCustomerId && typeof cData.perCustomerLimit === 'number' && cData.perCustomerLimit > 0) {
            const customerUses = currentCustUsage[verifiedCustomerId] || 0;
            if (customerUses >= cData.perCustomerLimit) {
              throw new Error(`Coupon '${verifiedCouponCode}' per-customer usage limit exceeded`);
            }
          }
          if (verifiedCustomerId) {
            currentCustUsage[verifiedCustomerId] = (currentCustUsage[verifiedCustomerId] || 0) + 1;
          }
          couponDocToUpdate = {
            ref: couponRef,
            newCount: currentCount + 1,
            newCustUsage: currentCustUsage,
          };
        }
      }

      // Step 2: All Transactional Writes SECOND
      // 2a. Update product stocks
      for (const p of productDocsToUpdate) {
        transaction.update(p.ref, {
          stock: p.newStock,
          updatedAt: now,
        });
      }

      // 2b. Update coupon usage
      if (couponDocToUpdate) {
        transaction.update(couponDocToUpdate.ref, {
          usedCount: couponDocToUpdate.newCount,
          customerUsage: couponDocToUpdate.newCustUsage,
          updatedAt: now,
        });
      }

      // 2c. Write authoritative order
      transaction.set(orderRef, cleanOrderPayload);

      // 2d. Write durable idempotency key record
      if (idempotencyDocKey) {
        const idempRef = adminDb.collection('idempotency_keys').doc(idempotencyDocKey);
        transaction.set(idempRef, {
          customerId: verifiedCustomerId,
          orderId: finalOrder.orderId,
          order: cleanOrderPayload,
          createdAt: now,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        });
      }

      return { order: finalOrder, reused: false };
    });

    console.log(`[OrderGateway:AdminSDK] Order ${result.order.orderId} committed atomically via Admin SDK.`);
    return result;
  } catch (adminErr: any) {
    if (adminErr?.message?.includes('Insufficient stock')) {
      throw adminErr;
    }

    const identity = getServerIdentityInfo();
    console.error(
      `[OrderGateway:AdminSDK:Error] Firestore transaction failed: ${adminErr?.message || adminErr}. ` +
      `GCP SA '${identity.serviceAccountEmail}' requires 'roles/datastore.user' on project '${identity.projectId}'.`
    );

    throw new Error(
      `Order processing failed: Unable to commit order to durable database. (${adminErr?.message || 'Database error'})`
    );
  } finally {
    if (idempotencyCompositeKey) {
      releaseInFlightLock(idempotencyCompositeKey);
    }
  }
}

export interface SubOrderUpdateRequest {
  parentOrderId: string;
  subOrderId: string;
  newStatus: string;
  trackingNumber?: string;
  note?: string;
}

/**
 * PART 12: Trusted Sub-Order Fulfillment Gateway
 * Enforces strict seller isolation and financial immutability.
 * Sellers cannot modify subtotal, total, platformCommission, sellerRevenue, or items.
 */
export async function processSubOrderUpdateGateway(
  payload: SubOrderUpdateRequest,
  authHeader?: string
): Promise<{ success: boolean; updatedVendorOrders: any[] }> {
  if (!authHeader) {
    throw new Error('Authentication required: Missing Authorization Bearer token');
  }
  const decoded = await verifyFirebaseBearerToken(authHeader);
  if (!decoded) {
    throw new Error('Authentication failed: Invalid or expired Firebase ID token');
  }

  const { parentOrderId, subOrderId, newStatus, trackingNumber, note } = payload;
  if (!parentOrderId || !subOrderId || !newStatus) {
    throw new Error('Missing required fields: parentOrderId, subOrderId, newStatus');
  }

  let snap;
  try {
    const adminDb = getAdminDb();
    const orderRef = adminDb.collection('orders').doc(parentOrderId);
    snap = await orderRef.get();
  } catch (err: any) {
    console.error('[OrderGateway:Error] Firestore read failed for suborder update:', err?.message || err);
    throw new Error(`Database read failure: Unable to retrieve parent order ${parentOrderId}. Operation aborted (Fail-Closed).`);
  }

  if (!snap || !snap.exists) {
    throw new Error(`Order ${parentOrderId} not found in authoritative database`);
  }

  const orderData = snap.data() as any;
  const vendorOrders = orderData.vendorOrders || [];
  const subIndex = vendorOrders.findIndex((s: any) => s.subOrderId === subOrderId);

  if (subIndex === -1) {
    throw new Error(`Sub-order ${subOrderId} not found in order ${parentOrderId}`);
  }

  const subOrder = vendorOrders[subIndex];
  const callerUid = decoded.uid;
  const isSuperAdminUser = isCallerSuperAdmin(decoded);
  const isAdminUser = isCallerPlatformAdmin(decoded);

  // Strict Tenant Isolation: Only the sub-order seller or an admin can update fulfillment status
  if (!isAdminUser && subOrder.sellerId !== callerUid) {
    throw new Error('Forbidden: You can only update sub-orders for your own store');
  }

  // Forward-only state machine (Terminal state protection)
  if (subOrder.status === 'delivered' && newStatus !== 'delivered') {
    throw new Error('Terminal state violation: Delivered sub-orders cannot be reopened');
  }
  if (subOrder.status === 'cancelled' && newStatus !== 'cancelled') {
    throw new Error('Terminal state violation: Cancelled sub-orders cannot be reactivated');
  }

  // IMMUTABILITY OF FINANCIAL FIELDS:
  // Clone the sub-order preserving subtotal, total, platformCommission, sellerRevenue, commissionRate, deliveryFee, items, etc.
  const updatedSubOrder = {
    ...subOrder,
    status: newStatus,
    ...(trackingNumber ? { trackingNumber } : {}),
  };

  const now = new Date().toISOString();
  const historyEntry = {
    status: newStatus,
    timestamp: now,
    actor: callerUid,
    note: note || `Sub-order status updated to ${newStatus}`,
  };

  updatedSubOrder.statusHistory = [...(updatedSubOrder.statusHistory || []), historyEntry];
  const updatedVendorOrders = [...vendorOrders];
  updatedVendorOrders[subIndex] = updatedSubOrder;

  let nextOrderStatus = orderData.status;
  const allDelivered = updatedVendorOrders.every((s: any) => s.status === 'delivered' || s.status === 'completed');
  const allCancelled = updatedVendorOrders.length > 0 && updatedVendorOrders.every((s: any) => s.status === 'cancelled');
  if (allDelivered) {
    nextOrderStatus = 'delivered';
  } else if (allCancelled) {
    nextOrderStatus = 'cancelled';
  } else if (updatedVendorOrders.some((s: any) =>
    s.status === 'preparing' ||
    s.status === 'in_progress' ||
    s.status === 'ready' ||
    s.status === 'shipped' ||
    s.status === 'out_for_delivery'
  )) {
    nextOrderStatus = 'processing';
  }

  const updatedStatusHistory = [...(orderData.statusHistory || []), historyEntry];

  try {
    const adminDb = getAdminDb();
    const orderRef = adminDb.collection('orders').doc(parentOrderId);
    await orderRef.update({
      status: nextOrderStatus,
      vendorOrders: updatedVendorOrders,
      statusHistory: updatedStatusHistory,
      ...(trackingNumber ? { deliveryTrackingCode: trackingNumber } : {}),
      updatedAt: now,
    });
  } catch (err: any) {
    console.error('[OrderGateway:Error] Firestore update failed for suborder status:', err?.message || err);
    throw new Error('Database write failure: Unable to persist sub-order status update. Operation aborted (Fail-Closed).');
  }

  return { success: true, updatedVendorOrders };
}
