import { CommissionPolicy, CommissionPolicyRule, CommissionResolution, UserRole } from '../types';
import { platformSettingsService } from './platformSettingsService';
import { storeService } from './storeService';
import { subscriptionService } from './subscriptionService';

const DEFAULT_GLOBAL_COMMISSION_RATE = 10; // 10% standard

const DEFAULT_SELLER_TYPE_RATES: Record<string, number> = {
  restaurant: 6, // 6% for food & beverage
  service: 8,    // 8% for professional services
  store: 10,     // 10% standard retail
  classified: 5, // 5% for ads & classifieds
};

const DEFAULT_CATEGORY_RATES: Record<string, number> = {
  electronics: 7,
  digital: 5,
  cosmetics: 9,
  fashion: 10,
  groceries: 6,
  automotive: 8,
};

export const commissionService = {
  /**
   * Retrieves the current active commission policy configured by Super Admin
   */
  getPolicy(): CommissionPolicy {
    const settings = platformSettingsService.getSettings();
    return {
      globalRate: settings.defaultCommissionRate ?? DEFAULT_GLOBAL_COMMISSION_RATE,
      sellerTypeRates: settings.sellerTypeCommissionRates ?? DEFAULT_SELLER_TYPE_RATES,
      categoryRates: settings.categoryCommissionRates ?? DEFAULT_CATEGORY_RATES,
      sellerSpecificRates: {}, // Dynamic lookup from Store models
    };
  },

  getPolicies(): CommissionPolicyRule[] {
    const policy = this.getPolicy();
    const list: CommissionPolicyRule[] = [
      {
        id: 'global_default',
        level: 'GLOBAL',
        targetName: 'العمولة الافتراضية للمنصة (Global Default)',
        ratePercent: policy.globalRate,
        isActive: true,
      },
    ];
    Object.entries(policy.sellerTypeRates).forEach(([type, rate]) => {
      list.push({
        id: `type_${type}`,
        level: 'SELLER_TYPE',
        targetId: type,
        targetName: `نوع المتجر: ${type}`,
        ratePercent: Number(rate),
        isActive: true,
      });
    });
    Object.entries(policy.categoryRates).forEach(([cat, rate]) => {
      list.push({
        id: `cat_${cat}`,
        level: 'CATEGORY',
        targetId: cat,
        targetName: `تصنيف: ${cat}`,
        ratePercent: Number(rate),
        isActive: true,
      });
    });
    return list;
  },

  /**
   * Deterministic Commission Resolution Engine:
   * Priority Order:
   *   1. Seller-specific (explicit store.commissionRate)
   *   2. Category-specific (categoryCommissionRates[category])
   *   3. Seller-type-specific (sellerTypeCommissionRates[sellerType])
   *   4. Global (defaultCommissionRate)
   *
   * Then applies seller plan adjustment (e.g. Business tier -2% discount)
   * Returns an immutable financial snapshot.
   */
  resolveRate(params: {
    sellerId: string;
    storeId: string;
    sellerType?: string;
    category?: string;
  }): CommissionResolution {
    const policy = this.getPolicy();
    const store = storeService.getStoreById(params.storeId);

    let baseRate = policy.globalRate;
    let source: CommissionResolution['source'] = 'global';

    // 1. Seller-specific priority
    if (store && typeof store.commissionRate === 'number' && store.commissionRate >= 0) {
      baseRate = store.commissionRate;
      source = 'seller_specific';
    }
    // 2. Category-specific priority
    else if (params.category && policy.categoryRates[params.category] !== undefined) {
      baseRate = policy.categoryRates[params.category];
      source = 'category';
    }
    // 3. Seller-type-specific priority
    else if (params.sellerType && policy.sellerTypeRates[params.sellerType] !== undefined) {
      baseRate = policy.sellerTypeRates[params.sellerType];
      source = 'seller_type';
    }
    // 4. Global fallback
    else {
      baseRate = policy.globalRate;
      source = 'global';
    }

    // Check Seller Subscription Plan for commission reduction
    const activePlan = subscriptionService.getSellerEffectivePlan(params.sellerId);
    const planDiscount = activePlan ? Math.max(0, activePlan.commissionAdjustment || 0) : 0;

    // Effective rate bounded between 0% and 50%
    const effectiveRate = Number(Math.max(0, Math.min(50, baseRate - planDiscount)).toFixed(2));

    return {
      effectiveRate,
      source,
      baseRate,
      planDiscount,
    };
  },

  /**
   * Set commission rate policy
   * HIGH-07: Strictly enforced for SUPER_ADMIN role only. No automatic escalation from ADMIN.
   */
  async updatePlatformSettings(
    settings: { defaultCommissionRate?: number },
    actorId: string,
    actorRole: UserRole
  ): Promise<{ defaultCommissionRate: number }> {
    if (actorRole !== 'SUPER_ADMIN') {
      throw new Error('Forbidden: Only Super Administrators have authority to modify commission policies');
    }
    const rate = settings.defaultCommissionRate ?? 10;
    await this.setPolicy({ level: 'GLOBAL', ratePercent: rate }, actorId, actorRole);
    return { defaultCommissionRate: rate };
  },

  async setPolicy(
    params: {
      level: 'GLOBAL' | 'SELLER_TYPE' | 'CATEGORY';
      targetId?: string;
      targetName?: string;
      ratePercent: number;
      isActive?: boolean;
    },
    actorId: string,
    actorRole: UserRole
  ): Promise<void> {
    if (actorRole !== 'SUPER_ADMIN') {
      throw new Error('Forbidden: Only Super Administrators have authority to modify commission policies');
    }

    const settings = platformSettingsService.getSettings();
    if (params.level === 'GLOBAL') {
      await platformSettingsService.updateSettings(
        { defaultCommissionRate: params.ratePercent },
        actorId,
        actorRole
      );
    } else if (params.level === 'SELLER_TYPE' && params.targetId) {
      const existing = settings.sellerTypeCommissionRates || {};
      await platformSettingsService.updateSettings(
        { sellerTypeCommissionRates: { ...existing, [params.targetId]: params.ratePercent } },
        actorId,
        actorRole
      );
    } else if (params.level === 'CATEGORY' && params.targetId) {
      const existing = settings.categoryCommissionRates || {};
      await platformSettingsService.updateSettings(
        { categoryCommissionRates: { ...existing, [params.targetId]: params.ratePercent } },
        actorId,
        actorRole
      );
    }
  },
};
