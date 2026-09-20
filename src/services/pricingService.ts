import { CartItem, Product } from '../types';
import { storeService } from './storeService';
import { commissionService } from './commissionService';
import { couponService } from './couponService';

export interface StoreOrderCalculation {
  storeId: string;
  storeName: string;
  sellerId: string;
  sellerType: string;
  items: CartItem[];
  itemsCount: number;
  subtotal: number;
  deliveryFee: number;
  total: number;
  commissionRate: number;
  effectiveCommissionRate: number;
  commissionPolicyUsed: 'seller_specific' | 'category' | 'seller_type' | 'global';
  platformCommission: number;
  sellerRevenue: number;
  discount: number;
  couponCode?: string;
}

export interface UnifiedOrderPricing {
  subtotal: number;
  shipping: number;
  tax: number;
  discount: number;
  couponCode?: string;
  grandTotal: number;
  totalItems: number;
  storeBreakdown: Record<string, StoreOrderCalculation>;
  storeBreakdownList: StoreOrderCalculation[];
  freeShippingThreshold: number;
  remainingForFreeShipping: number;
  couponValidation?: {
    isValid: boolean;
    errorReason?: string;
  };
}

export const FREE_SHIPPING_STORE_THRESHOLD = 50.0;
export const DEFAULT_STORE_DELIVERY_FEE = 2.0;

export const pricingService = {
  /**
   * Authoritative item line price calculation (base + addons) * quantity
   */
  calculateItemTotal(item: CartItem): number {
    const qty = Math.max(1, Math.min(999, Math.floor(Number(item.quantity) || 1)));
    const basePrice = Math.max(0, Number(item.product.price) || 0);
    const addonsTotal = item.selectedAddons?.reduce((sum, addon) => {
      return sum + Math.max(0, Number(addon.price) || 0);
    }, 0) || 0;
    return Number(((basePrice + addonsTotal) * qty).toFixed(2));
  },

  /**
   * Unified calculation used across CartContext, CartPage, orderService, and Receipts
   */
  calculateCartTotals(
    items: CartItem[],
    couponCode?: string,
    customerId?: string
  ): UnifiedOrderPricing {
    if (!items || items.length === 0) {
      return {
        subtotal: 0,
        shipping: 0,
        tax: 0,
        discount: 0,
        grandTotal: 0,
        totalItems: 0,
        storeBreakdown: {},
        storeBreakdownList: [],
        freeShippingThreshold: FREE_SHIPPING_STORE_THRESHOLD,
        remainingForFreeShipping: FREE_SHIPPING_STORE_THRESHOLD,
      };
    }

    // 1. Group items by store
    const storeMap: Record<string, CartItem[]> = {};
    let totalItems = 0;

    items.forEach(item => {
      const storeId = item.storeId || item.product.storeId || 'store_cosmetics_01';
      if (!storeMap[storeId]) {
        storeMap[storeId] = [];
      }
      storeMap[storeId].push(item);
      totalItems += Math.max(1, Math.floor(Number(item.quantity) || 1));
    });

    const storeBreakdown: Record<string, StoreOrderCalculation> = {};
    const storeBreakdownList: StoreOrderCalculation[] = [];

    let cumulativeSubtotal = 0;
    let cumulativeShipping = 0;

    // Calculate raw subtotals first
    const rawStoreSubtotals: Record<string, number> = {};
    Object.entries(storeMap).forEach(([storeId, storeItems]) => {
      const sub = Number(
        storeItems.reduce((acc, it) => acc + this.calculateItemTotal(it), 0).toFixed(2)
      );
      rawStoreSubtotals[storeId] = sub;
      cumulativeSubtotal += sub;
    });

    // 2. Authoritative Coupon Verification
    let appliedDiscount = 0;
    let cleanCouponCode: string | undefined = undefined;
    let couponValidationResult: { isValid: boolean; errorReason?: string } | undefined = undefined;

    if (couponCode && couponCode.trim()) {
      const validation = couponService.validateCoupon({
        code: couponCode.trim(),
        customerId,
        items,
        subtotal: cumulativeSubtotal,
      });

      couponValidationResult = {
        isValid: validation.isValid,
        errorReason: validation.errorReason,
      };

      if (validation.isValid) {
        appliedDiscount = validation.discount;
        cleanCouponCode = validation.coupon?.code || couponCode.trim().toUpperCase();
      }
    }

    // 3. Store Breakdown and Deterministic Commission Hierarchy
    Object.entries(storeMap).forEach(([storeId, storeItems]) => {
      const store = storeService.getStoreById(storeId);
      const sellerId =
        store?.sellerId ||
        storeItems[0]?.sellerId ||
        storeItems[0]?.product.sellerId ||
        'user_seller_01';
      const sellerType = store?.sellerType || storeItems[0]?.product.type || 'store';
      const itemCategory = storeItems[0]?.product.category;

      // Deterministic Commission Priority Engine
      const commissionRes = commissionService.resolveRate({
        sellerId,
        storeId,
        sellerType,
        category: itemCategory,
      });

      const storeSubtotal = rawStoreSubtotals[storeId] || 0;

      // Apportion coupon discount proportionally across stores
      const storeShare = cumulativeSubtotal > 0 ? storeSubtotal / cumulativeSubtotal : 0;
      const storeDiscount = Number((appliedDiscount * storeShare).toFixed(2));

      // Shipping rule
      const configuredFee =
        store?.deliveryFee !== undefined ? Number(store.deliveryFee) : DEFAULT_STORE_DELIVERY_FEE;
      const deliveryFee =
        storeSubtotal >= FREE_SHIPPING_STORE_THRESHOLD || storeSubtotal === 0
          ? 0
          : Math.max(0, configuredFee);

      const storeTotal = Math.max(0, Number((storeSubtotal - storeDiscount + deliveryFee).toFixed(2)));

      // Commission snapshot
      const platformCommission = Number(
        ((storeSubtotal * commissionRes.effectiveRate) / 100).toFixed(2)
      );
      const sellerRevenue = Math.max(
        0,
        Number((storeSubtotal - storeDiscount - platformCommission).toFixed(2))
      );

      const calc: StoreOrderCalculation = {
        storeId,
        storeName:
          store?.name ||
          (storeItems[0]?.product.type === 'restaurants' ? 'Restaurant' : 'MarketSpace Store'),
        sellerId,
        sellerType,
        items: storeItems,
        itemsCount: storeItems.reduce((sum, it) => sum + (it.quantity || 1), 0),
        subtotal: storeSubtotal,
        deliveryFee,
        total: storeTotal,
        commissionRate: commissionRes.baseRate,
        effectiveCommissionRate: commissionRes.effectiveRate,
        commissionPolicyUsed: commissionRes.source,
        platformCommission,
        sellerRevenue,
        discount: storeDiscount,
        couponCode: cleanCouponCode,
      };

      storeBreakdown[storeId] = calc;
      storeBreakdownList.push(calc);
      cumulativeShipping += deliveryFee;
    });

    cumulativeSubtotal = Number(cumulativeSubtotal.toFixed(2));
    cumulativeShipping = Number(cumulativeShipping.toFixed(2));
    const tax = 0;
    const grandTotal = Math.max(
      0,
      Number((cumulativeSubtotal - appliedDiscount + cumulativeShipping + tax).toFixed(2))
    );

    const remainingForFreeShipping = Math.max(
      0,
      Number((FREE_SHIPPING_STORE_THRESHOLD - cumulativeSubtotal).toFixed(2))
    );

    return {
      subtotal: cumulativeSubtotal,
      shipping: cumulativeShipping,
      tax,
      discount: appliedDiscount,
      couponCode: cleanCouponCode,
      grandTotal,
      totalItems,
      storeBreakdown,
      storeBreakdownList,
      freeShippingThreshold: FREE_SHIPPING_STORE_THRESHOLD,
      remainingForFreeShipping,
      couponValidation: couponValidationResult,
    };
  },
};

