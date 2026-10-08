import crypto from 'crypto';
import { getAdminDb, verifyFirebaseBearerToken, getServerIdentityInfo, isCallerSuperAdmin, isCallerPlatformAdmin, assertUserAccountActive, requireAuthenticatedCaller } from './firebaseAdmin';
import { CartItem, OrderDetails, Product, VendorSubOrder } from '../src/types';
import {
  MASTER_PAYMENT_METHODS,
  normalizePaymentMethod,
  isValidPaymentMethod,
  MasterPaymentMethod,
} from '../src/constants/paymentMethods';

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
  paymentMethod: string;
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
 * Fetch store by ID authoritatively using Admin DB only.
 * Fail-Closed: Never fallback to seed/synthetic data in financial operations.
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
    // Enforce active/approved lifecycle state
    if (data?.status !== 'approved' && data?.status !== 'active') {
      throw new Error(`Store #${storeId} is currently "${data?.status || 'unapproved'}" and cannot accept orders. Only approved stores may participate in transactions.`);
    }
    return { ...data, id: snap.id };
  }

  throw new Error(`Store #${storeId} not found in authoritative database. Transaction aborted (Fail-Closed).`);
}

/**
 * Fetch coupon by code authoritatively using Admin DB only.
 * Fail-Closed: Never fallback to static/untracked coupons in financial checkout.
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

  return null;
}

export interface AuthoritativeSellerPlan {
  id: string;
  tier: 'FREE' | 'BASIC' | 'BUSINESS' | 'PREMIUM';
  maxProducts: number;
  commissionAdjustment: number;
  active: boolean;
}

export const AUTHORITATIVE_SELLER_PLANS: Record<string, AuthoritativeSellerPlan> = {
  plan_free: { id: 'plan_free', tier: 'FREE', maxProducts: 10, commissionAdjustment: 0, active: true },
  FREE: { id: 'plan_free', tier: 'FREE', maxProducts: 10, commissionAdjustment: 0, active: true },
  plan_basic: { id: 'plan_basic', tier: 'BASIC', maxProducts: 50, commissionAdjustment: 1, active: true },
  BASIC: { id: 'plan_basic', tier: 'BASIC', maxProducts: 50, commissionAdjustment: 1, active: true },
  plan_business: { id: 'plan_business', tier: 'BUSINESS', maxProducts: 250, commissionAdjustment: 2, active: true },
  BUSINESS: { id: 'plan_business', tier: 'BUSINESS', maxProducts: 250, commissionAdjustment: 2, active: true },
  plan_premium: { id: 'plan_premium', tier: 'PREMIUM', maxProducts: 1000, commissionAdjustment: 3, active: true },
  PREMIUM: { id: 'plan_premium', tier: 'PREMIUM', maxProducts: 1000, commissionAdjustment: 3, active: true },
};

/**
 * Authoritative Server-Side Subscription & Plan Resolver (Single Source of Truth: SERVER)
 * Validates active status, plan ID, plan status, expiry, commissionAdjustment, store ownership, and seller ownership.
 * Never trusts client-side localStorage or memory caches.
 */
export async function resolveAuthoritativeSellerSubscription(
  sellerId: string,
  storeId?: string
): Promise<AuthoritativeSellerPlan> {
  if (!sellerId) {
    return AUTHORITATIVE_SELLER_PLANS.plan_free;
  }

  try {
    const adminDb = getAdminDb();
    const subsCol = adminDb.collection('subscriptions') as any;
    if (!subsCol || typeof subsCol.where !== 'function') {
      return AUTHORITATIVE_SELLER_PLANS.plan_free;
    }

    const snap = await subsCol.where('sellerId', '==', sellerId).get();
    if (!snap || snap.empty || !Array.isArray(snap.docs)) {
      return AUTHORITATIVE_SELLER_PLANS.plan_free;
    }

    const nowMs = Date.now();
    let bestPlan: AuthoritativeSellerPlan | null = null;
    let bestTimestamp = -1;

    for (const docSnap of snap.docs) {
      const sub = typeof docSnap.data === 'function' ? docSnap.data() : docSnap;
      if (!sub || typeof sub !== 'object') continue;

      // 1. Seller ownership check
      if (sub.sellerId !== sellerId) continue;

      // 2. Store ownership check (if subscription is scoped to a storeId)
      if (sub.storeId && storeId && sub.storeId !== storeId) continue;

      // 3. Active subscription status check
      const statusStr = String(sub.status || '').toLowerCase();
      if (statusStr !== 'active') continue;

      // 4. Expiry check (reject expired or malformed end dates)
      const rawExpiry = sub.endDate || sub.expiresAt;
      if (rawExpiry !== undefined && rawExpiry !== null && rawExpiry !== '') {
        const expiryMs = new Date(rawExpiry).getTime();
        if (!Number.isFinite(expiryMs) || isNaN(expiryMs) || expiryMs <= nowMs) {
          continue;
        }
      }

      // 5. Plan ID & Plan Status check
      const rawPlanKey = String(sub.planId || sub.planTier || '');
      const canonicalPlan = AUTHORITATIVE_SELLER_PLANS[rawPlanKey];
      if (!canonicalPlan || !canonicalPlan.active) {
        // Check if custom plan document exists in Firestore sellerPlans collection
        let resolvedCustom: AuthoritativeSellerPlan | null = null;
        if (rawPlanKey && typeof adminDb.collection === 'function') {
          try {
            const planDoc = await adminDb.collection('sellerPlans').doc(rawPlanKey).get();
            if (planDoc && planDoc.exists) {
              const pData = planDoc.data() || {};
              const adj = Number(pData.commissionAdjustment);
              const maxP = Number(pData.maxProducts);
              if (
                pData.active !== false &&
                Number.isFinite(adj) &&
                adj >= 0 &&
                adj <= 50 &&
                Number.isFinite(maxP) &&
                maxP > 0
              ) {
                resolvedCustom = {
                  id: rawPlanKey,
                  tier: (pData.tier || 'BASIC') as any,
                  maxProducts: Math.floor(maxP),
                  commissionAdjustment: adj,
                  active: true,
                };
              }
            }
          } catch {
            // Malformed or unreadable custom plan fails closed to free plan
          }
        }
        if (!resolvedCustom) continue;

        const createdMs = new Date(sub.updatedAt || sub.startDate || sub.createdAt || 0).getTime() || 0;
        if (createdMs >= bestTimestamp) {
          bestTimestamp = createdMs;
          bestPlan = resolvedCustom;
        }
        continue;
      }

      // Validate if subscription overrides commissionAdjustment with malformed value
      if (sub.commissionAdjustment !== undefined) {
        const subAdj = Number(sub.commissionAdjustment);
        if (!Number.isFinite(subAdj) || isNaN(subAdj) || subAdj < 0 || subAdj > 50) {
          continue; // Malformed plan payload rejected
        }
      }

      const createdMs = new Date(sub.updatedAt || sub.startDate || sub.createdAt || 0).getTime() || 0;
      if (createdMs >= bestTimestamp) {
        bestTimestamp = createdMs;
        bestPlan = canonicalPlan;
      }
    }

    return bestPlan || AUTHORITATIVE_SELLER_PLANS.plan_free;
  } catch (err) {
    console.warn('[OrderGateway:Subscription] Falling back to FREE plan due to lookup error:', err);
    return AUTHORITATIVE_SELLER_PLANS.plan_free;
  }
}

/**
 * PART 14: Single Source of Truth Commission Resolution (Server-Authoritative)
 * Priority:
 *  1. Store Custom Override (store.commissionRate)
 *  2. Category Specific Rate (categoryRates[category])
 *  3. Seller Type Rate (sellerTypeRates[sellerType])
 *  4. Global Platform Rate (platformSettings.defaultCommissionRate)
 * Then subtracts verified active subscription commissionAdjustment:
 *  effectiveRate = clamp(baseRate - planDiscount, 0, 50)
 */
export async function resolveAuthoritativeCommissionRate(
  store: any,
  sellerType: string,
  category?: string,
  sellerId?: string
): Promise<{
  rate: number;
  baseRate: number;
  appliedDiscount: number;
  appliedPlanId: string;
  policySource: string;
}> {
  let baseRate = DEFAULT_COMMISSION_RATE;
  let policySource = 'global';

  const clampCommission = (r: number): number => {
    if (typeof r !== 'number' || !Number.isFinite(r) || isNaN(r)) return DEFAULT_COMMISSION_RATE;
    return Math.min(50, Math.max(0, r));
  };

  // 1. Store Custom Override (Bounded strictly between 0% and 50% - F-03)
  if (store && typeof store.commissionRate === 'number' && Number.isFinite(store.commissionRate) && store.commissionRate >= 0) {
    baseRate = Math.min(50, Math.max(0, store.commissionRate));
    policySource = 'seller_specific';
  } else {
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
      } else {
        // In production, missing authoritative settings MUST fail closed (OPEN-09)
        if (process.env.NODE_ENV === 'production') {
          throw new Error('Authoritative platform settings document (platformSettings/default) is missing. Cannot resolve commission rate (Fail-Closed).');
        }
      }
    } catch (err: any) {
      console.error('[OrderGateway:Error] Failed to read platformSettings for commission resolution:', err);
      throw new Error('Database error while querying authoritative commission policy. Transaction aborted (Fail-Closed).');
    }

    // 2. Category Rate
    if (category && categoryRates[category] !== undefined) {
      baseRate = clampCommission(categoryRates[category]);
      policySource = 'category';
    }
    // 3. Seller Type Rate
    else if (sellerType && sellerTypeRates[sellerType] !== undefined) {
      baseRate = clampCommission(sellerTypeRates[sellerType]);
      policySource = 'seller_type';
    }
    // 4. Global Platform Rate
    else {
      baseRate = clampCommission(globalRate);
      policySource = 'global';
    }
  }

  // 5. Apply Authoritative Subscription Plan Commission Discount
  const effectiveSellerId = sellerId || store?.sellerId || '';
  const effectiveStoreId = store?.id || store?.storeId;
  const activePlan = await resolveAuthoritativeSellerSubscription(effectiveSellerId, effectiveStoreId);
  const planDiscount = Math.max(0, Math.min(50, Number(activePlan.commissionAdjustment) || 0));

  const rawEffective = baseRate - planDiscount;
  const effectiveRate = Math.min(50, Math.max(0, Number(rawEffective.toFixed(2))));

  return {
    rate: effectiveRate,
    baseRate,
    appliedDiscount: planDiscount,
    appliedPlanId: activePlan.id,
    policySource,
  };
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
      // P0-AUTH-02: Universal check to enforce active, non-suspended account status
      await assertUserAccountActive(decoded.uid);
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
  const normalizedPaymentMethod = normalizePaymentMethod(payload.paymentMethod);
  if (!normalizedPaymentMethod) {
    throw new Error(`Invalid or unsupported payment method: ${payload.paymentMethod || 'empty'}. Supported: ${MASTER_PAYMENT_METHODS.join(', ')}`);
  }
  if (normalizedPaymentMethod === 'card') {
    throw new Error('Card payments are temporarily unavailable awaiting PCI gateway certification');
  }

  const now = new Date().toISOString();
  const parentOrderId = `ord_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

  // 4. Server-Side Catalog Verification (Product-by-Product)
  const verifiedOrderItems: CartItem[] = [];
  const itemsByStore: Record<string, CartItem[]> = {};

  // Aggregate requested quantities per product ID to prevent multi-line overselling
  const aggregateQuantitiesByProduct = new Map<string, number>();
  for (const it of payload.items) {
    const rawPid = it.productId || (it as any).product?.id || (it as any).id;
    if (rawPid) {
      const q = Math.max(1, Math.min(999, Math.floor(Number(it.quantity) || 1)));
      aggregateQuantitiesByProduct.set(rawPid, (aggregateQuantitiesByProduct.get(rawPid) || 0) + q);
    }
  }

  for (const clientItem of payload.items) {
    const rawProductId = clientItem.productId || (clientItem as any).product?.id || (clientItem as any).id;
    if (!rawProductId) {
      throw new Error(`Product not found: undefined`);
    }
    const product = await getAuthoritativeProduct(rawProductId);
    if (!product) {
      throw new Error(`Product not found: ${rawProductId}`);
    }

    if (product.status && product.status !== 'published' && product.status !== 'approved') {
      throw new Error(`Product "${product.title?.en || product.title}" is currently not available`);
    }

    const qty = Math.max(1, Math.min(999, Math.floor(Number(clientItem.quantity) || 1)));

    // Stock verification: check aggregate quantity across all lines for this product
    const totalProductRequested = aggregateQuantitiesByProduct.get(rawProductId) || qty;
    if (product.stock !== undefined && product.stock < totalProductRequested) {
      const prodTitle = typeof product.title === 'string' ? product.title : product.title?.en || product.title?.ar || product.id;
      throw new Error(`Insufficient stock for "${prodTitle}". Requested: ${totalProductRequested}, In Stock: ${product.stock}`);
    }

    // Authoritative pricing: NEVER use client price. Fail closed on malformed prices (F-27).
    if (typeof product.price !== 'number' || isNaN(product.price) || !Number.isFinite(product.price) || product.price < 0) {
      throw new Error(`Corrupted catalog price for product "${product.id}". Transaction aborted (Fail-Closed).`);
    }
    const unitPrice = product.price;

    // Verify Addons from catalog
    let verifiedAddonsTotal = 0;
    const verifiedSelectedAddons: Array<{ id: string; name: { ar: string; en: string; so: string }; price: number }> = [];

    if (clientItem.selectedAddons && Array.isArray(clientItem.selectedAddons)) {
      for (const clientAddon of clientItem.selectedAddons) {
        const catalogAddon = product.addons?.find(a => a.id === clientAddon.id);
        if (catalogAddon) {
          const addonPrice = typeof catalogAddon.price === 'number' && Number.isFinite(catalogAddon.price) && catalogAddon.price >= 0
            ? catalogAddon.price
            : 0;
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

    // Authoritative store and seller isolation (F-28): Missing storeId or sellerId fails closed!
    const storeId = product.storeId;
    const sellerId = product.sellerId;
    if (!storeId || !sellerId) {
      throw new Error(`Authoritative seller/store relationship missing for product "${product.id}". Transaction aborted.`);
    }

    // Section 10: Server-side validation of product options (color, size) against catalog definitions
    let verifiedColor: string | undefined = undefined;
    if (clientItem.selectedOptions?.color) {
      const cleanColor = String(clientItem.selectedOptions.color).trim().slice(0, 50);
      if (product.colors && Array.isArray(product.colors) && product.colors.length > 0) {
        const matched = product.colors.find(c => {
          const cName = typeof c === 'object' && c !== null
            ? (typeof c.name === 'object' ? `${c.name.en} ${c.name.ar} ${c.name.so}` : String((c as any).name || ''))
            : String(c);
          const cCode = typeof c === 'object' && c !== null && ((c as any).code || (c as any).hex) ? String((c as any).code || (c as any).hex) : '';
          return cName.toLowerCase().includes(cleanColor.toLowerCase()) || (cCode && cCode.toLowerCase() === cleanColor.toLowerCase());
        });
        if (!matched) {
          throw new Error(`Invalid color option "${cleanColor}" selected for product "${product.id}". Allowed colors: ${product.colors.map(c => typeof c === 'object' ? (c.name?.en || (c as any).name || (c as any).code || (c as any).hex) : c).join(', ')}`);
        }
      }
      verifiedColor = cleanColor;
    }

    let verifiedSize: string | undefined = undefined;
    if (clientItem.selectedOptions?.size) {
      const cleanSize = String(clientItem.selectedOptions.size).trim().slice(0, 50);
      if (product.sizes && Array.isArray(product.sizes) && product.sizes.length > 0) {
        const matched = product.sizes.find(s => s.toLowerCase() === cleanSize.toLowerCase());
        if (!matched) {
          throw new Error(`Invalid size option "${cleanSize}" selected for product "${product.id}". Allowed sizes: ${product.sizes.join(', ')}`);
        }
      }
      verifiedSize = cleanSize;
    }

    const orderItem: CartItem = {
      id: `${product.id}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      product: {
        ...product,
        price: unitPrice, // Strictly enforce authoritative catalog price
      },
      quantity: qty,
      selectedColor: verifiedColor,
      selectedSize: verifiedSize,
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

    // Authoritative Delivery Fee: Store delivery fee or free shipping over threshold (Strictly non-negative & finite - F-04)
    const isFreeShipping = storeSubtotal >= FREE_SHIPPING_STORE_THRESHOLD;
    const rawDeliveryFee = typeof store?.deliveryFee === 'number' && Number.isFinite(store.deliveryFee)
      ? store.deliveryFee
      : DEFAULT_STORE_DELIVERY_FEE;
    const storeDeliveryFee = isFreeShipping ? 0 : Math.max(0, Math.min(500, rawDeliveryFee));
    serverCalculatedShipping += storeDeliveryFee;

    // Authoritative 4-Tier Commission + Subscription Plan Discount calculation (PART 14)
    const subOrderId = `${parentOrderId}-S${storeIndex++}`;
    const sellerId = store?.sellerId || (storeItems[0].product.sellerId || 'seller_system');
    const storeSellerType = (store?.sellerType as any) || 'store';
    const storeCategory = storeItems[0]?.product?.category;
    const { rate: effectiveCommissionRate, baseRate, policySource } = await resolveAuthoritativeCommissionRate(
      { ...store, id: storeId },
      storeSellerType,
      storeCategory,
      sellerId
    );
    const roundedStoreSubtotal = Number(storeSubtotal.toFixed(2));
    const platformCommission = Number(((roundedStoreSubtotal * effectiveCommissionRate) / 100).toFixed(2));
    const sellerRevenue = Number((roundedStoreSubtotal - platformCommission).toFixed(2));
    const sellerType = storeSellerType;

    vendorOrders.push({
      subOrderId,
      parentOrderId,
      storeId,
      storeName: (typeof store?.name === 'string' ? store.name : store?.name?.en) || 'MarketSpace Store',
      sellerId,
      sellerType,
      items: storeItems,
      subtotal: roundedStoreSubtotal,
      deliveryFee: Number(storeDeliveryFee.toFixed(2)),
      total: Number((roundedStoreSubtotal + storeDeliveryFee).toFixed(2)),
      commissionRate: baseRate,
      effectiveCommissionRate,
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
      const maxCap = Number((coupon as any).maxDiscountAmount ?? (coupon as any).maxDiscount) || 0;
      if (maxCap > 0 && discount > maxCap) {
        discount = maxCap;
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
  const productIds = Array.from(new Set(verifiedOrderItems.map(it => it.product?.id || (it as any).productId).filter(Boolean)));
  const finalOrder: OrderDetails & { productIds?: string[] } = {
    orderId: parentOrderId,
    customerId: verifiedCustomerId,
    sellerIds,
    vendorStoreIds,
    productIds,
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

      // 1b. Product stock reads (Aggregated per product ID to prevent duplicate product overselling)
      const productQuantities = new Map<string, { totalQty: number; title: string }>();
      for (const it of verifiedOrderItems) {
        if (it.product && it.product.id && it.product.stock !== undefined) {
          const pid = it.product.id;
          const current = productQuantities.get(pid) || {
            totalQty: 0,
            title: it.product.title?.en || it.product.id,
          };
          current.totalQty += it.quantity;
          productQuantities.set(pid, current);
        }
      }

      const productDocsToUpdate: Array<{ ref: FirebaseFirestore.DocumentReference; newStock: number }> = [];
      for (const [prodId, req] of productQuantities.entries()) {
        const prodRef = adminDb.collection('products').doc(prodId);
        const prodDoc = await transaction.get(prodRef);
        if (prodDoc.exists) {
          const currentStock = prodDoc.data()?.stock;
          if (typeof currentStock === 'number') {
            if (currentStock < req.totalQty) {
              throw new Error(`Insufficient stock for product "${req.title}". Available: ${currentStock}, Requested: ${req.totalQty}`);
            }
            productDocsToUpdate.push({
              ref: prodRef,
              newStock: currentStock - req.totalQty,
            });
          }
        }
      }

      // 1c. Coupon read & atomic invariant verification inside transaction (P1-08 & P1-09)
      let couponDocToUpdate: { ref: FirebaseFirestore.DocumentReference; newCount: number; newCustUsage: Record<string, number> } | null = null;
      let couponUsageLedgerToSet: { ref: FirebaseFirestore.DocumentReference; data: Record<string, any> } | null = null;

      if (verifiedCouponDocId) {
        const couponRef = adminDb.collection('coupons').doc(verifiedCouponDocId);
        const couponDoc = await transaction.get(couponRef);
        if (!couponDoc.exists) {
          throw new Error(`Authoritative coupon document not found for '${verifiedCouponCode}'. Transaction aborted (Fail-Closed).`);
        }
        const cData = couponDoc.data() || {};
        if (cData.active === false) {
          throw new Error(`Coupon '${verifiedCouponCode}' is inactive`);
        }
        if (cData.startAt && new Date(cData.startAt).getTime() > Date.now()) {
          throw new Error(`Coupon '${verifiedCouponCode}' is not yet active`);
        }
        if (cData.expireAt && new Date(cData.expireAt).getTime() < Date.now()) {
          throw new Error(`Coupon '${verifiedCouponCode}' has expired`);
        }
        if (typeof cData.minOrderAmount === 'number' && cData.minOrderAmount > 0 && serverCalculatedSubtotal < cData.minOrderAmount) {
          throw new Error(`Order subtotal does not meet the minimum required for coupon '${verifiedCouponCode}'`);
        }
        // Authoritative verification that discount type and value have not changed concurrently
        const authoritativeDiscountType = cData.discountType || 'percentage';
        const authoritativeDiscountValue = Number(cData.discountValue) || 0;
        let recomputedDiscount = 0;
        if (authoritativeDiscountType === 'percentage') {
          recomputedDiscount = (serverCalculatedSubtotal * authoritativeDiscountValue) / 100;
          const maxCap = Number(cData.maxDiscountAmount ?? cData.maxDiscount) || 0;
          if (maxCap > 0) {
            recomputedDiscount = Math.min(recomputedDiscount, maxCap);
          }
        } else {
          recomputedDiscount = Math.min(serverCalculatedSubtotal, authoritativeDiscountValue);
        }
        recomputedDiscount = Number(recomputedDiscount.toFixed(2));
        if (Math.abs(recomputedDiscount - serverCalculatedDiscount) > 0.01) {
          throw new Error(`Coupon terms changed concurrently for '${verifiedCouponCode}'. Please retry checkout.`);
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

          // P1-09: Isolated atomic ledger entry per usage to prevent monolithic document bloat
          const usageDocId = `use_${verifiedCouponDocId}_${verifiedCustomerId}_${Date.now()}`;
          const usageLedgerRef = adminDb.collection('couponUsages').doc(usageDocId);
          couponUsageLedgerToSet = {
            ref: usageLedgerRef,
            data: {
              id: usageDocId,
              couponId: verifiedCouponDocId,
              couponCode: verifiedCouponCode,
              customerId: verifiedCustomerId,
              orderId: finalOrder.orderId,
              usedAt: now,
            },
          };
        }

      // Step 2: All Transactional Writes SECOND
      // 2a. Update product stocks
      for (const p of productDocsToUpdate) {
        transaction.update(p.ref, {
          stock: p.newStock,
          updatedAt: now,
        });
      }

      // 2b. Update coupon usage & write to ledger
      if (couponDocToUpdate) {
        transaction.update(couponDocToUpdate.ref, {
          usedCount: couponDocToUpdate.newCount,
          customerUsage: couponDocToUpdate.newCustUsage,
          updatedAt: now,
        });
      }
      if (couponUsageLedgerToSet) {
        transaction.set(couponUsageLedgerToSet.ref, couponUsageLedgerToSet.data);
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
  parentOrderId?: string;
  orderId?: string;
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
  const caller = await requireAuthenticatedCaller(authHeader);

  const parentOrderId = payload.parentOrderId || payload.orderId;
  const { subOrderId, newStatus, trackingNumber, note } = payload;
  if (!parentOrderId || !subOrderId || !newStatus) {
    throw new Error('Missing required fields: parentOrderId, subOrderId, newStatus');
  }

  const adminDb = getAdminDb();
  const orderRef = adminDb.collection('orders').doc(parentOrderId);

  try {
    const result = await adminDb.runTransaction(async (transaction) => {
      const snap = await transaction.get(orderRef);
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
      const callerUid = caller.uid;
      const isAdminUser = caller.isPlatformAdmin;

      // Strict Tenant Isolation: Only the sub-order seller or an admin can update fulfillment status
      if (!isAdminUser && subOrder.sellerId !== callerUid) {
        throw new Error('Forbidden: You can only update sub-orders for your own store');
      }

      // Forward-only state machine (Terminal state protection and transition enforcement - F-06)
      const validSubOrderStatuses = [
        'pending', 'confirmed', 'preparing', 'ready', 'shipped', 'out_for_delivery', 'delivered', 'cancelled'
      ];
      if (!validSubOrderStatuses.includes(newStatus)) {
        throw new Error(`Invalid sub-order status "${newStatus}". Must be one of: ${validSubOrderStatuses.join(', ')}`);
      }

      const currentStatus = subOrder.status || 'pending';

      if (currentStatus === 'delivered' && newStatus !== 'delivered') {
        throw new Error('Terminal state violation: Delivered sub-orders cannot be reopened');
      }
      if (currentStatus === 'cancelled' && newStatus !== 'cancelled') {
        throw new Error('Terminal state violation: Cancelled sub-orders cannot be reactivated');
      }

      const ALLOWED_SUBORDER_TRANSITIONS: Record<string, string[]> = {
        pending: ['confirmed', 'preparing', 'processing', 'cancelled'],
        confirmed: ['preparing', 'processing', 'ready', 'cancelled'],
        processing: ['preparing', 'ready', 'shipped', 'out_for_delivery', 'cancelled'],
        preparing: ['ready', 'shipped', 'out_for_delivery', 'cancelled'],
        ready: ['shipped', 'out_for_delivery', 'cancelled'],
        shipped: ['out_for_delivery', 'delivered', 'cancelled'],
        out_for_delivery: ['delivered', 'cancelled'],
        delivered: [],
        cancelled: [],
      };

      if (currentStatus !== newStatus) {
        const allowed = ALLOWED_SUBORDER_TRANSITIONS[currentStatus] || [];
        if (!allowed.includes(newStatus)) {
          throw new Error(`Invalid forward transition from "${currentStatus}" to "${newStatus}". Allowed transitions: ${allowed.length ? allowed.join(', ') : 'none'}`);
        }
      }

      // Step 2: Pre-read products to restore stock if sub-order is being cancelled (All reads before writes)
      // Aggregate quantities per productId first so multi-line items of the same product restore the full sum!
      const productsToRestore: Array<{ ref: FirebaseFirestore.DocumentReference; currentStock: number; restoreQty: number }> = [];
      if (newStatus === 'cancelled' && currentStatus !== 'cancelled' && Array.isArray(subOrder.items)) {
        const restoreQtyByProduct = new Map<string, number>();
        for (const it of subOrder.items) {
          const pId = it.productId || (it as any).product?.id || (it as any).id;
          if (pId) {
            const q = Math.max(1, Math.min(999, Math.floor(Number(it.quantity) || 1)));
            restoreQtyByProduct.set(String(pId), (restoreQtyByProduct.get(String(pId)) || 0) + q);
          }
        }
        for (const [pId, totalRestoreQty] of restoreQtyByProduct.entries()) {
          const pRef = adminDb.collection('products').doc(pId);
          const pSnap = await transaction.get(pRef);
          if (pSnap.exists) {
            const pData = pSnap.data();
            const currentStock = typeof pData?.stock === 'number' ? pData.stock : 0;
            productsToRestore.push({ ref: pRef, currentStock, restoreQty: totalRestoreQty });
          }
        }
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

      // Restore product catalog stock for cancelled items atomically
      for (const p of productsToRestore) {
        const newStock = p.currentStock + p.restoreQty;
        transaction.update(p.ref, {
          stock: newStock,
          updatedAt: now,
          lastInventoryAudit: {
            orderId: parentOrderId,
            subOrderId,
            action: 'RESTORE_CANCELLED',
            quantity: p.restoreQty,
            previousStock: p.currentStock,
            newStock,
            timestamp: now,
            reason: note || 'Sub-order cancelled by merchant/admin',
          },
        });
      }

      transaction.update(orderRef, {
        status: nextOrderStatus,
        vendorOrders: updatedVendorOrders,
        statusHistory: updatedStatusHistory,
        ...(trackingNumber ? { deliveryTrackingCode: trackingNumber } : {}),
        updatedAt: now,
      });

      return { success: true, updatedVendorOrders };
    });

    return result;
  } catch (err: any) {
    if (err?.message?.includes('Forbidden') || err?.message?.includes('Terminal') || err?.message?.includes('Invalid') || err?.message?.includes('not found')) {
      throw err;
    }
    console.error('[OrderGateway:Error] Firestore transaction failed for suborder update:', err?.message || err);
    throw new Error('Database write failure: Unable to persist sub-order status update. Operation aborted (Fail-Closed).');
  }
}

export const processOrderCreationGateway = processOrderGateway;

export interface GatewayProductCreateRequest {
  id?: string;
  storeId: string;
  sellerId?: string;
  title: { ar?: string; en?: string; so?: string } | string;
  description?: { ar?: string; en?: string; so?: string } | string;
  slug?: string;
  sku?: string;
  price: number;
  oldPrice?: number;
  currency?: string;
  stock: number;
  lowStockThreshold?: number;
  category?: string;
  categories?: string[];
  tags?: string[];
  type?: string;
  thumbnail?: string;
  images?: string[];
  isOffer?: boolean;
  isPublished?: boolean;
  status?: string;
  prepTimeMinutes?: number;
  dietaryTags?: string[];
  sizes?: string[];
  colors?: string[];
  addons?: any[];
}

/**
 * Authoritative Product Creation Gateway (PRODUCT-PERSIST & QUOTA Enforcement)
 * Enforces:
 *  - Authentication & active user verification
 *  - Seller & store ownership verification
 *  - Atomic subscription plan maxProducts quota check inside transaction
 *  - Price & stock finite bounds validation
 *  - Status lifecycle validation
 *  - Fail-closed Firestore write (never returns fake success on DB failure)
 */
export async function processProductCreationGateway(
  payload: GatewayProductCreateRequest & { idempotencyKey?: string },
  authHeader?: string
): Promise<{ success: boolean; product: any; reused?: boolean }> {
  const caller = await requireAuthenticatedCaller(authHeader);

  if (!payload || typeof payload !== 'object') {
    const err = new Error('Invalid product creation payload') as any;
    err.statusCode = 400;
    throw err;
  }

  const storeId = String(payload.storeId || '').trim();
  if (!storeId) {
    const err = new Error('storeId is required to create a product') as any;
    err.statusCode = 400;
    throw err;
  }

  // Price validation
  const rawPrice = Number(payload.price);
  if (payload.price === undefined || payload.price === null || payload.price === ('' as any) || !Number.isFinite(rawPrice) || isNaN(rawPrice) || rawPrice < 0 || rawPrice > 1000000) {
    const err = new Error('Invalid product price: price must be a finite non-negative number (max $1,000,000)') as any;
    err.statusCode = 400;
    throw err;
  }
  const validatedPrice = Number(rawPrice.toFixed(2));

  // Stock validation
  const rawStock = Number(payload.stock ?? 0);
  if (!Number.isFinite(rawStock) || isNaN(rawStock) || rawStock < 0 || rawStock > 1000000) {
    const err = new Error('Invalid product stock: stock must be a finite non-negative number (max 1,000,000)') as any;
    err.statusCode = 400;
    throw err;
  }
  const validatedStock = Math.floor(rawStock);

  const cleanIdempotencyKey = typeof payload.idempotencyKey === 'string' ? payload.idempotencyKey.trim() : '';
  if (payload.idempotencyKey !== undefined && (!cleanIdempotencyKey || cleanIdempotencyKey.length < 4 || cleanIdempotencyKey.length > 128)) {
    const err = new Error('Invalid idempotencyKey: must be between 4 and 128 characters') as any;
    err.statusCode = 400;
    throw err;
  }

  // Title validation
  const titleObj = typeof payload.title === 'string'
    ? { ar: payload.title.trim(), en: payload.title.trim(), so: payload.title.trim() }
    : {
        ar: String(payload.title?.ar || payload.title?.en || '').trim(),
        en: String(payload.title?.en || payload.title?.ar || '').trim(),
        so: String(payload.title?.so || payload.title?.en || payload.title?.ar || '').trim(),
      };
  if (!titleObj.ar && !titleObj.en) {
    const err = new Error('Product title is required') as any;
    err.statusCode = 400;
    throw err;
  }

  // Status lifecycle validation
  const allowedStatuses = ['draft', 'pending', 'pending_review', 'hidden', 'published', 'approved'];
  const requestedStatus = String(payload.status || 'published').toLowerCase();
  if (!allowedStatuses.includes(requestedStatus)) {
    const err = new Error(`Invalid product status '${payload.status}'. Allowed statuses: ${allowedStatuses.join(', ')}`) as any;
    err.statusCode = 400;
    throw err;
  }

  const adminDb = getAdminDb();

  // 1. Authoritative Store & Ownership Lookup
  let storeData: any = null;
  try {
    const storeDoc = await adminDb.collection('stores').doc(storeId).get();
    if (!storeDoc.exists) {
      const err = new Error(`Store #${storeId} not found`) as any;
      err.statusCode = 404;
      throw err;
    }
    storeData = storeDoc.data() || {};
  } catch (err: any) {
    if (err.statusCode) throw err;
    const dbErr = new Error(`Database read failure while verifying store #${storeId}: ${err?.message || err}`) as any;
    dbErr.statusCode = 503;
    throw dbErr;
  }

  if (storeData.status === 'suspended' || storeData.status === 'banned' || storeData.status === 'rejected') {
    const err = new Error(`Cannot create product: Store #${storeId} is currently ${storeData.status}`) as any;
    err.statusCode = 403;
    throw err;
  }

  const authoritativeSellerId = storeData.sellerId;
  if (!authoritativeSellerId) {
    const err = new Error(`Store #${storeId} has no valid owner sellerId`) as any;
    err.statusCode = 400;
    throw err;
  }

  if (!caller.isPlatformAdmin && caller.uid !== authoritativeSellerId) {
    const err = new Error(`Forbidden: You can only create products for your own store (#${storeId})`) as any;
    err.statusCode = 403;
    throw err;
  }

  if (payload.sellerId && payload.sellerId !== authoritativeSellerId && !caller.isPlatformAdmin) {
    const err = new Error('Forbidden: sellerId mismatch with authoritative store owner') as any;
    err.statusCode = 403;
    throw err;
  }

  // 2. Authoritative Subscription Plan Quota Resolution
  const activePlan = await resolveAuthoritativeSellerSubscription(authoritativeSellerId, storeId);
  const maxProducts = activePlan.maxProducts || 10;

  const now = new Date().toISOString();
  const productId = payload.id && String(payload.id).trim()
    ? String(payload.id).trim()
    : `prod_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

  const descObj = typeof payload.description === 'string'
    ? { ar: payload.description, en: payload.description, so: payload.description }
    : {
        ar: String(payload.description?.ar || payload.description?.en || ''),
        en: String(payload.description?.en || payload.description?.ar || ''),
        so: String(payload.description?.so || payload.description?.en || payload.description?.ar || ''),
      };

  const newProduct: any = {
    id: productId,
    storeId,
    sellerId: authoritativeSellerId,
    title: titleObj,
    description: descObj,
    slug: payload.slug || titleObj.en.toLowerCase().replace(/[^a-z0-9]+/g, '-') || `prod-${Date.now()}`,
    sku: payload.sku || `SKU-${Date.now()}`,
    price: validatedPrice,
    oldPrice: payload.oldPrice !== undefined ? Math.max(0, Number(payload.oldPrice) || 0) : 0,
    currency: payload.currency || 'USD',
    stock: validatedStock,
    lowStockThreshold: Math.max(0, Math.floor(Number(payload.lowStockThreshold ?? 5) || 5)),
    category: payload.category || 'general',
    categories: Array.isArray(payload.categories) ? payload.categories : [payload.category || 'general'],
    tags: Array.isArray(payload.tags) ? payload.tags : [payload.category || 'general'],
    type: payload.type || 'marketplace',
    thumbnail: payload.thumbnail || (Array.isArray(payload.images) && payload.images[0]) || '',
    images: Array.isArray(payload.images) ? payload.images : (payload.thumbnail ? [payload.thumbnail] : []),
    isOffer: Boolean(payload.isOffer),
    status: requestedStatus,
    isPublished: payload.isPublished !== undefined ? Boolean(payload.isPublished) : requestedStatus === 'published',
    rating: 0,
    reviewsCount: 0,
    createdAt: now,
    updatedAt: now,
  };

  const initialHistoryEntry = {
    id: `inv_init_${Date.now()}`,
    date: now,
    previousStock: 0,
    newStock: validatedStock,
    change: validatedStock,
    reason: 'restock',
    actor: caller.uid,
  };

  // 3. Atomic Quota Enforcement & Product Persistence Transaction
  const productRef = adminDb.collection('products').doc(productId);
  const quotaLockRef = adminDb.collection('store_product_quotas').doc(storeId);
  const idemLockRef = cleanIdempotencyKey
    ? adminDb.collection('product_idempotency_locks').doc(`${caller.uid}_${cleanIdempotencyKey}`)
    : null;
  let reusedExistingProduct: any = null;

  try {
    await adminDb.runTransaction(async (transaction) => {
      if (idemLockRef) {
        const idemSnap = await transaction.get(idemLockRef);
        if (idemSnap.exists) {
          const idemData = idemSnap.data() || {};
          if (idemData.product) {
            reusedExistingProduct = idemData.product;
            return;
          }
        }
      }

      // Read quota lock document to serialize concurrent product creations for the same store
      await transaction.get(quotaLockRef);

      // Query authoritative product count in Firestore
      const productsCol = adminDb.collection('products') as any;
      let currentCount = 0;
      if (typeof productsCol.where === 'function') {
        const q = productsCol.where('storeId', '==', storeId);
        const snap = typeof (transaction as any).get === 'function'
          ? await (transaction as any).get(q)
          : await q.get();
        if (snap) {
          currentCount = typeof snap.size === 'number'
            ? snap.size
            : Array.isArray(snap.docs)
              ? snap.docs.length
              : 0;
        }
      }

      if (currentCount >= maxProducts) {
        const quotaErr = new Error(
          `لقد بلغت الحد الأقصى للمنتجات المسموح بها (${maxProducts}) في باقتك الحالية (${activePlan.tier}). يرجى ترقية الباقة لتتمكن من إضافة المزيد من المنتجات. (Product quota exceeded: ${currentCount}/${maxProducts})`
        ) as any;
        quotaErr.statusCode = 403;
        throw quotaErr;
      }

      transaction.set(quotaLockRef, {
        storeId,
        sellerId: authoritativeSellerId,
        productCount: currentCount + 1,
        maxProducts,
        planId: activePlan.id,
        updatedAt: now,
      });

      const cleanProduct = JSON.parse(JSON.stringify(newProduct));
      transaction.set(productRef, cleanProduct);
      if (idemLockRef) {
        transaction.set(idemLockRef, {
          idempotencyKey: cleanIdempotencyKey,
          sellerId: caller.uid,
          productId,
          product: cleanProduct,
          createdAt: now,
        });
      }
    });
  } catch (err: any) {
    if (err.statusCode) {
      throw err;
    }
    console.error('[ProductGateway:Error] Fatal Firestore transaction failure during product creation:', err?.message || err);
    const dbErr = new Error(`Database write failure (Fail-Closed): Unable to persist product to Firestore. (${err?.message || 'Transaction failed'})`) as any;
    dbErr.statusCode = 503;
    throw dbErr;
  }

  if (reusedExistingProduct) {
    return {
      success: true,
      product: reusedExistingProduct,
      reused: true,
    };
  }

  return {
    success: true,
    product: newProduct,
  };
}

export interface ProductUpdateGatewayRequest {
  productId: string;
  updates: Partial<Product>;
}

/**
 * Authoritative Product Update & Status Moderation Gateway (PCR-13 Remediation)
 * Enforces ownership/admin privileges, field sanitization, price/stock bounds,
 * and atomic Firestore persistence.
 * Strictly Fail-Closed: Throws HTTP 503 if Firestore write fails; never returns false success.
 */
export async function processProductUpdateGateway(
  payload: ProductUpdateGatewayRequest,
  authHeader?: string
): Promise<{ success: boolean; product: Product }> {
  const caller = await requireAuthenticatedCaller(authHeader);
  const productId = String(payload?.productId || '').trim();
  if (!productId) {
    const err = new Error('productId is required') as any;
    err.statusCode = 400;
    throw err;
  }

  const rawUpdates = payload?.updates || {};
  const adminDb = getAdminDb();
  const productRef = adminDb.collection('products').doc(productId);
  const now = new Date().toISOString();

  try {
    const updatedProduct = await adminDb.runTransaction(async (transaction) => {
      const snap = await transaction.get(productRef);
      if (!snap.exists) {
        const err = new Error(`Product #${productId} not found`) as any;
        err.statusCode = 404;
        throw err;
      }

      const existing = snap.data() as Product;
      if (!caller.isPlatformAdmin && existing.sellerId !== caller.uid) {
        const err = new Error('Forbidden: You can only edit your own products') as any;
        err.statusCode = 403;
        throw err;
      }

      const safeUpdates: Record<string, any> = { ...rawUpdates };
      delete safeUpdates.id;
      delete safeUpdates.createdAt;

      if (!caller.isPlatformAdmin) {
        delete safeUpdates.sellerId;
        delete safeUpdates.storeId;
        delete safeUpdates.rating;
        delete safeUpdates.reviewsCount;
        if (safeUpdates.status !== undefined) {
          const allowedSellerStatuses = ['draft', 'pending', 'pending_review', 'published', 'hidden'];
          const reqStatus = String(safeUpdates.status).toLowerCase();
          if (!allowedSellerStatuses.includes(reqStatus)) {
            const err = new Error(`Forbidden: Seller cannot set product status to '${safeUpdates.status}'`) as any;
            err.statusCode = 403;
            throw err;
          }
          safeUpdates.status = reqStatus;
        }
      }

      if (safeUpdates.price !== undefined) {
        const numPrice = Number(safeUpdates.price);
        if (!Number.isFinite(numPrice) || isNaN(numPrice) || numPrice <= 0 || numPrice > 1000000) {
          const err = new Error('Invalid product price: must be between $0.01 and $1,000,000') as any;
          err.statusCode = 400;
          throw err;
        }
        safeUpdates.price = Number(numPrice.toFixed(2));
      }

      let nextHistory = Array.isArray(existing.inventoryHistory) ? [...existing.inventoryHistory] : [];
      let newInventoryLogEntry: any = null;
      if (safeUpdates.stock !== undefined) {
        const numStock = Number(safeUpdates.stock);
        if (!Number.isFinite(numStock) || isNaN(numStock) || numStock < 0 || numStock > 1000000) {
          const err = new Error('Invalid product stock: must be a non-negative integer') as any;
          err.statusCode = 400;
          throw err;
        }
        const safeStock = Math.floor(numStock);
        const oldStock = Number(existing.stock) || 0;
        if (safeStock !== oldStock) {
          newInventoryLogEntry = {
            id: `inv_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`,
            productId,
            sellerId: existing.sellerId,
            date: now,
            previousStock: oldStock,
            newStock: safeStock,
            change: safeStock - oldStock,
            reason: 'manual_update',
            actor: caller.uid,
          };
          nextHistory = [
            newInventoryLogEntry,
            ...nextHistory,
          ];
        }
        safeUpdates.stock = safeStock;
      }

      const merged: Product = {
        ...existing,
        ...safeUpdates,
        id: productId,
        updatedAt: now,
      };
      delete (merged as any).inventoryHistory;
      delete (merged as any).salesCount;

      transaction.set(productRef, JSON.parse(JSON.stringify(merged)), { merge: true });
      if (newInventoryLogEntry) {
        const invLogRef = adminDb.collection('inventory_logs').doc(newInventoryLogEntry.id);
        transaction.set(invLogRef, newInventoryLogEntry);
      }
      return {
        ...merged,
        inventoryHistory: nextHistory,
      };
    });

    return {
      success: true,
      product: updatedProduct,
    };
  } catch (err: any) {
    if (err.statusCode) throw err;
    console.error('[ProductGateway:UpdateError] Fatal Firestore transaction failure during product update:', err?.message || err);
    const dbErr = new Error(`Database write failure (Fail-Closed): Unable to update product in Firestore. (${err?.message || 'Transaction failed'})`) as any;
    dbErr.statusCode = 503;
    throw dbErr;
  }
}

/**
 * Authoritative Product Deletion Gateway (PCR-13 Remediation)
 * Strictly Fail-Closed: Throws HTTP 503 if Firestore delete fails; never returns false success.
 */
export async function processProductDeleteGateway(
  payload: { productId: string },
  authHeader?: string
): Promise<{ success: boolean; productId: string }> {
  const caller = await requireAuthenticatedCaller(authHeader);
  const productId = String(payload?.productId || '').trim();
  if (!productId) {
    const err = new Error('productId is required') as any;
    err.statusCode = 400;
    throw err;
  }

  const adminDb = getAdminDb();
  const productRef = adminDb.collection('products').doc(productId);

  try {
    await adminDb.runTransaction(async (transaction) => {
      const snap = await transaction.get(productRef);
      if (!snap.exists) {
        const err = new Error(`Product #${productId} not found`) as any;
        err.statusCode = 404;
        throw err;
      }
      const existing = snap.data() as Product;
      if (!caller.isPlatformAdmin && existing.sellerId !== caller.uid) {
        const err = new Error('Forbidden: You can only delete your own products') as any;
        err.statusCode = 403;
        throw err;
      }
      transaction.delete(productRef);
    });

    return {
      success: true,
      productId,
    };
  } catch (err: any) {
    if (err.statusCode) throw err;
    console.error('[ProductGateway:DeleteError] Fatal Firestore transaction failure during product deletion:', err?.message || err);
    const dbErr = new Error(`Database write failure (Fail-Closed): Unable to delete product in Firestore. (${err?.message || 'Transaction failed'})`) as any;
    dbErr.statusCode = 503;
    throw dbErr;
  }
}

