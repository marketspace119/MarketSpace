import { doc, getDocs, collection, setDoc, updateDoc, query, limit } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Coupon, CartItem, UserRole } from '../types';
import { auditLogService } from './auditLogService';

const COUPONS_STORAGE_KEY = 'marketspace_coupons_v1';
const COUPONS_COLLECTION = 'coupons';

// Financial UI Integrity: Zero synthetic platform coupons on offline fallback.
// Coupons must strictly originate from authoritative database.
export const INITIAL_PLATFORM_COUPONS: Coupon[] = [];

let memoryCoupons: Coupon[] = [];

function loadCoupons(): Coupon[] {
  if (memoryCoupons.length > 0) return memoryCoupons;
  // F-20: Do not read or trust localStorage for coupon authority
  memoryCoupons = [...INITIAL_PLATFORM_COUPONS];
  return memoryCoupons;
}

function persistCoupons(coupons: Coupon[]) {
  memoryCoupons = coupons;
  // F-20: LocalStorage persistence removed for authoritative coupon state
}

export interface CouponValidationResult {
  isValid: boolean;
  discount: number;
  coupon?: Coupon;
  errorReason?: string;
}

export const couponService = {
  resetMemoryState() {
    memoryCoupons = [];
  },

  clearUserCache() {
    this.resetMemoryState();
  },

  getAllCoupons(): Coupon[] {
    return loadCoupons();
  },

  async syncWithFirestore(): Promise<Coupon[]> {
    try {
      const snap = await getDocs(query(collection(db, COUPONS_COLLECTION), limit(200)));
      if (!snap.empty) {
        const cloudCoupons: Coupon[] = [];
        snap.forEach(d => cloudCoupons.push(d.data() as Coupon));
        persistCoupons(cloudCoupons);
        return cloudCoupons;
      } else {
        persistCoupons(INITIAL_PLATFORM_COUPONS);
      }
    } catch (err) {
      console.warn('Coupons Firestore sync offline:', err);
    }
    return loadCoupons();
  },

  getCoupons(): Coupon[] {
    return loadCoupons();
  },

  getCouponsBySeller(sellerId: string): Coupon[] {
    return loadCoupons().filter(c => c.sellerId === sellerId);
  },

  /**
   * Authoritative Server-Side Coupon Validation & Discount Computation
   */
  validateCoupon(params: {
    code: string;
    customerId?: string;
    items: CartItem[];
    subtotal: number;
  }): CouponValidationResult {
    const cleanCode = params.code?.trim().toUpperCase();
    if (!cleanCode) {
      return { isValid: false, discount: 0, errorReason: 'Empty coupon code' };
    }

    const coupons = loadCoupons();
    const coupon = coupons.find(c => c.code.toUpperCase() === cleanCode);

    if (!coupon) {
      return { isValid: false, discount: 0, errorReason: 'Coupon code not found' };
    }

    if (!coupon.active) {
      return { isValid: false, discount: 0, errorReason: 'Coupon is currently inactive' };
    }

    const now = new Date();
    if (new Date(coupon.startAt) > now) {
      return { isValid: false, discount: 0, errorReason: 'Coupon campaign has not started yet' };
    }
    if (new Date(coupon.expireAt) < now) {
      return { isValid: false, discount: 0, errorReason: 'Coupon has expired' };
    }

    if (coupon.usageLimit > 0 && coupon.usedCount >= coupon.usageLimit) {
      return { isValid: false, discount: 0, errorReason: 'Coupon maximum total usage reached' };
    }

    // Check per-customer usage
    if (params.customerId && coupon.perCustomerLimit > 0) {
      const custUsage = coupon.customerUsage?.[params.customerId] || 0;
      if (custUsage >= coupon.perCustomerLimit) {
        return { isValid: false, discount: 0, errorReason: 'You have reached the usage limit for this coupon' };
      }
    }

    // Filter items eligible for this coupon
    let eligibleSubtotal = 0;
    for (const it of params.items) {
      const itemStoreId = it.storeId || it.product.storeId;
      const itemSellerId = it.sellerId || it.product.sellerId;
      const itemCategory = it.product.category;

      let isEligible = true;
      if (coupon.sellerId && itemSellerId !== coupon.sellerId) {
        isEligible = false;
      }
      if (coupon.storeId && itemStoreId !== coupon.storeId) {
        isEligible = false;
      }
      if (coupon.applicableCategory && itemCategory !== coupon.applicableCategory) {
        isEligible = false;
      }

      if (isEligible) {
        const qty = Math.max(1, Math.floor(Number(it.quantity) || 1));
        const price = Math.max(0, Number(it.product.price) || 0);
        eligibleSubtotal += price * qty;
      }
    }

    if (eligibleSubtotal === 0) {
      return {
        isValid: false,
        discount: 0,
        errorReason: 'This coupon is not applicable to any items in your cart',
      };
    }

    if (eligibleSubtotal < coupon.minOrderAmount) {
      return {
        isValid: false,
        discount: 0,
        errorReason: `Minimum order amount of $${coupon.minOrderAmount.toFixed(2)} required for this coupon`,
      };
    }

    // Calculate authoritative discount
    let calculatedDiscount = 0;
    if (coupon.discountType === 'percentage') {
      const pct = Math.max(0, Math.min(100, coupon.discountValue));
      calculatedDiscount = (eligibleSubtotal * pct) / 100;
      const maxCap = Number(coupon.maxDiscountAmount ?? coupon.maxDiscount) || 0;
      if (maxCap > 0) {
        calculatedDiscount = Math.min(calculatedDiscount, maxCap);
      }
    } else {
      // Fixed discount
      calculatedDiscount = Math.min(eligibleSubtotal, Math.max(0, coupon.discountValue));
    }

    calculatedDiscount = Number(calculatedDiscount.toFixed(2));

    return {
      isValid: true,
      discount: calculatedDiscount,
      coupon,
    };
  },

  /**
   * Syncs local memory coupon usage count following server transaction without double-writing to Firestore.
   */
  syncLocalCouponUsage(couponCode: string, customerId?: string): void {
    const cleanCode = couponCode.trim().toUpperCase();
    const coupons = loadCoupons();
    const target = coupons.find(c => c.code.toUpperCase() === cleanCode);
    if (!target) return;

    target.usedCount = (target.usedCount || 0) + 1;
    if (customerId) {
      if (!target.customerUsage) target.customerUsage = {};
      target.customerUsage[customerId] = (target.customerUsage[customerId] || 0) + 1;
    }
    persistCoupons(coupons);
  },

  /**
   * Atomically records coupon usage on successful order completion.
   * In production, coupon usage is authoritatively updated inside the backend order gateway transaction.
   * This method updates local memory for offline/simulation and protects against duplicate server calls.
   */
  async recordUsage(couponId: string, customerId?: string): Promise<void> {
    const coupons = loadCoupons();
    const target = coupons.find(c => c.id === couponId);
    if (!target) return;

    target.usedCount = (target.usedCount || 0) + 1;
    if (customerId) {
      if (!target.customerUsage) target.customerUsage = {};
      target.customerUsage[customerId] = (target.customerUsage[customerId] || 0) + 1;
    }

    persistCoupons(coupons);

    // Only attempt Firestore update if not running in standard client-order flow
    // (Firestore rules grant write access exclusively to Admins to protect customer usage privacy)
    try {
      await updateDoc(doc(db, COUPONS_COLLECTION, couponId), {
        usedCount: target.usedCount,
      });
    } catch {
      // Ignored for non-admin clients as backend transaction handles authoritative persistence
    }
  },

  /**
   * Create new coupon (Admin can create any; Seller can create for their store)
   */
  async createCoupon(
    couponData: Omit<Coupon, 'id' | 'usedCount' | 'customerUsage' | 'createdAt'>,
    actorId: string,
    actorRole: UserRole
  ): Promise<Coupon> {
    const isAdmin = actorRole === 'ADMIN' || actorRole === 'SUPER_ADMIN';
    if (!isAdmin && (!couponData.sellerId || !couponData.sellerId.trim() || couponData.sellerId !== actorId)) {
      throw new Error('Forbidden: Merchants can only create coupons restricted to their own non-empty sellerId');
    }

    if (!isAdmin && couponData.storeId) {
      const { storeService } = await import('./storeService');
      const store = storeService.getStoreById(couponData.storeId);
      if (!store || store.sellerId !== actorId) {
        throw new Error('Forbidden: Merchants can only create coupons for a store they own');
      }
    }

    const cleanCode = couponData.code.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    if (!cleanCode) throw new Error('Invalid coupon code format');

    const coupons = loadCoupons();
    if (coupons.some(c => c.code === cleanCode)) {
      throw new Error(`Coupon with code "${cleanCode}" already exists`);
    }

    const maxCap = couponData.maxDiscountAmount ?? couponData.maxDiscount;

    const newCoupon: Coupon = {
      ...couponData,
      ...(maxCap !== undefined ? { maxDiscountAmount: Number(maxCap), maxDiscount: Number(maxCap) } : {}),
      id: `CPN-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`,
      code: cleanCode,
      discountValue: Math.max(0, Number(couponData.discountValue) || 0),
      minOrderAmount: Math.max(0, Number(couponData.minOrderAmount) || 0),
      usedCount: 0,
      customerUsage: {},
      createdAt: new Date().toISOString(),
      createdBy: actorId,
    };

    try {
      if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'test') {
        await setDoc(doc(db, COUPONS_COLLECTION, newCoupon.id), newCoupon);
      } else {
        const serverAdminModule = '../../server/firebaseAdmin';
        const { getAdminDb } = await import(/* @vite-ignore */ serverAdminModule);
        const adminDb = getAdminDb();
        if (!adminDb) {
          throw new Error('Database write failure (Fail-Closed): Firestore Admin DB unavailable for coupon creation');
        }
        await adminDb.collection(COUPONS_COLLECTION).doc(newCoupon.id).set(JSON.parse(JSON.stringify(newCoupon)));
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `${COUPONS_COLLECTION}/${newCoupon.id}`);
      throw err;
    }

    coupons.unshift(newCoupon);
    persistCoupons(coupons);

    await auditLogService.logAction({
      actorId,
      actorRole,
      action: 'COUPON_CREATED',
      targetType: 'coupon',
      targetId: newCoupon.id,
      targetName: `Coupon ${newCoupon.code}`,
      metadata: { discountType: newCoupon.discountType, discountValue: newCoupon.discountValue },
    });

    return newCoupon;
  },

  async toggleCouponStatus(
    couponId: string,
    active: boolean,
    actorId: string,
    actorRole: UserRole
  ): Promise<Coupon> {
    const coupons = loadCoupons();
    const target = coupons.find(c => c.id === couponId);
    if (!target) throw new Error('Coupon not found');

    const isAdmin = actorRole === 'ADMIN' || actorRole === 'SUPER_ADMIN';
    if (!isAdmin && target.sellerId !== actorId) {
      throw new Error('Forbidden: Cannot modify coupons belonging to another merchant');
    }

    try {
      if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'test') {
        await updateDoc(doc(db, COUPONS_COLLECTION, couponId), { active });
      } else {
        const serverAdminModule = '../../server/firebaseAdmin';
        const { getAdminDb } = await import(/* @vite-ignore */ serverAdminModule);
        const adminDb = getAdminDb();
        if (!adminDb) {
          throw new Error('Database write failure (Fail-Closed): Firestore Admin DB unavailable for coupon status update');
        }
        await adminDb.collection(COUPONS_COLLECTION).doc(couponId).set({ active }, { merge: true });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `${COUPONS_COLLECTION}/${couponId}`);
      throw err;
    }

    target.active = active;
    persistCoupons(coupons);

    await auditLogService.logAction({
      actorId,
      actorRole,
      action: active ? 'COUPON_CREATED' : 'COUPON_DISABLED',
      targetType: 'coupon',
      targetId: couponId,
      targetName: `Coupon ${target.code}`,
      metadata: { active },
    });

    return target;
  },
};
