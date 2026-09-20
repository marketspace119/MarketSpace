import { doc, getDocs, collection, setDoc, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Coupon, CartItem, UserRole } from '../types';
import { auditLogService } from './auditLogService';

const COUPONS_STORAGE_KEY = 'marketspace_coupons_v1';
const COUPONS_COLLECTION = 'coupons';

export const INITIAL_PLATFORM_COUPONS: Coupon[] = [
  {
    id: 'coupon_welcome10',
    code: 'WELCOME10',
    discountType: 'percentage',
    discountValue: 10, // 10% off
    minOrderAmount: 15.0,
    maxDiscountAmount: 10.0, // max $10 discount
    usageLimit: 1000,
    usedCount: 14,
    perCustomerLimit: 1,
    customerUsage: {},
    active: true,
    startAt: '2026-01-01T00:00:00.000Z',
    expireAt: '2026-12-31T23:59:59.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'system',
  },
  {
    id: 'coupon_som5',
    code: 'SOM5',
    discountType: 'fixed',
    discountValue: 5.0, // $5 off
    minOrderAmount: 30.0,
    usageLimit: 500,
    usedCount: 8,
    perCustomerLimit: 2,
    customerUsage: {},
    active: true,
    startAt: '2026-01-01T00:00:00.000Z',
    expireAt: '2026-12-31T23:59:59.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'system',
  },
];

let memoryCoupons: Coupon[] = [];

function loadCoupons(): Coupon[] {
  if (memoryCoupons.length > 0) return memoryCoupons;
  if (typeof window === 'undefined') return INITIAL_PLATFORM_COUPONS;
  try {
    const raw = localStorage.getItem(COUPONS_STORAGE_KEY);
    memoryCoupons = raw ? JSON.parse(raw) : INITIAL_PLATFORM_COUPONS;
    return memoryCoupons;
  } catch {
    return INITIAL_PLATFORM_COUPONS;
  }
}

function persistCoupons(coupons: Coupon[]) {
  memoryCoupons = coupons;
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(COUPONS_STORAGE_KEY, JSON.stringify(coupons));
  } catch (err) {
    console.error('Failed to save coupons to localStorage', err);
  }
}

export interface CouponValidationResult {
  isValid: boolean;
  discount: number;
  coupon?: Coupon;
  errorReason?: string;
}

export const couponService = {
  async syncWithFirestore(): Promise<Coupon[]> {
    try {
      const snap = await getDocs(collection(db, COUPONS_COLLECTION));
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
      if (coupon.maxDiscountAmount && coupon.maxDiscountAmount > 0) {
        calculatedDiscount = Math.min(calculatedDiscount, coupon.maxDiscountAmount);
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
   * Atomically records coupon usage on successful order completion
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

    try {
      await updateDoc(doc(db, COUPONS_COLLECTION, couponId), {
        usedCount: target.usedCount,
        customerUsage: target.customerUsage || {},
      });
    } catch (err) {
      console.warn('Coupon usage record offline/skipped:', err);
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
    if (!isAdmin && couponData.sellerId !== actorId) {
      throw new Error('Forbidden: Merchants can only create coupons restricted to their own store');
    }

    const cleanCode = couponData.code.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    if (!cleanCode) throw new Error('Invalid coupon code format');

    const coupons = loadCoupons();
    if (coupons.some(c => c.code === cleanCode)) {
      throw new Error(`Coupon with code "${cleanCode}" already exists`);
    }

    const newCoupon: Coupon = {
      ...couponData,
      id: `CPN-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`,
      code: cleanCode,
      discountValue: Math.max(0, Number(couponData.discountValue) || 0),
      minOrderAmount: Math.max(0, Number(couponData.minOrderAmount) || 0),
      usedCount: 0,
      customerUsage: {},
      createdAt: new Date().toISOString(),
      createdBy: actorId,
    };

    coupons.unshift(newCoupon);
    persistCoupons(coupons);

    try {
      await setDoc(doc(db, COUPONS_COLLECTION, newCoupon.id), newCoupon);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `${COUPONS_COLLECTION}/${newCoupon.id}`);
    }

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

    target.active = active;
    persistCoupons(coupons);

    try {
      await updateDoc(doc(db, COUPONS_COLLECTION, couponId), { active });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `${COUPONS_COLLECTION}/${couponId}`);
    }

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
