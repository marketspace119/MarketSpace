import { doc, getDocs, collection, setDoc, updateDoc, query, where } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { SellerPlan, SellerSubscription, SubscriptionStatus, UserRole } from '../types';
import { auditLogService } from './auditLogService';

const PLANS_STORAGE_KEY = 'marketspace_seller_plans_v1';
const SUBSCRIPTIONS_STORAGE_KEY = 'marketspace_seller_subscriptions_v1';

const PLANS_COLLECTION = 'sellerPlans';
const SUBSCRIPTIONS_COLLECTION = 'subscriptions';

export const STANDARD_SELLER_PLANS: SellerPlan[] = [
  {
    id: 'plan_free',
    tier: 'FREE',
    name: {
      ar: 'الباقة المجانية الأساسية',
      en: 'Starter Free Plan',
      so: 'Xirmada Bilaashka ah',
    },
    description: {
      ar: 'خطة انطلاق مثالية للمتاجر الناشئة لتجربة المنصة والبيع بسهولة',
      en: 'Ideal zero-cost launch plan for new merchants to start selling immediately',
      so: 'Qorshe bilaash ah oo loogu talagalay ganacsiyada cusub si ay u bilaabaan',
    },
    price: 0,
    currency: 'USD',
    billingPeriod: 'monthly',
    maxProducts: 10,
    maxImages: 3,
    featuredListingAllowed: false,
    analyticsLevel: 'basic',
    prioritySupport: false,
    customStorefront: false,
    commissionAdjustment: 0,
    active: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'plan_basic',
    tier: 'BASIC',
    name: {
      ar: 'الباقة الفضية (أساسية)',
      en: 'Silver Merchant Plan',
      so: 'Xirmada Qalinka (Aasaasiga)',
    },
    description: {
      ar: 'ميزات محسنة للمتاجر النامية مع متجر مخصص وتخفيض 1% في العمولة',
      en: 'Enhanced visibility for growing merchants with customized storefront and 1% fee discount',
      so: 'Awood dheeraad ah oo leh dukaanka gaarka ah iyo 1% dhimis komishanka',
    },
    price: 15,
    currency: 'USD',
    billingPeriod: 'monthly',
    maxProducts: 50,
    maxImages: 6,
    featuredListingAllowed: false,
    analyticsLevel: 'standard',
    prioritySupport: true,
    customStorefront: true,
    commissionAdjustment: 1, // 1% discount
    active: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'plan_business',
    tier: 'BUSINESS',
    name: {
      ar: 'باقة الأعمال والشركات',
      en: 'Business Growth Plan',
      so: 'Xirmada Ganacsiga Weyn',
    },
    description: {
      ar: 'أهلية الظهور في القوائم المميزة، تحليلات متقدمة، وتخفيض 2% في العمولة',
      en: 'Featured showcase eligibility, advanced analytics, and 2% fee reduction',
      so: 'U qalmida liiska caanka ah, xogta horumarsan, iyo 2% dhimis komishan',
    },
    price: 35,
    currency: 'USD',
    billingPeriod: 'monthly',
    maxProducts: 250,
    maxImages: 10,
    featuredListingAllowed: true,
    analyticsLevel: 'advanced',
    prioritySupport: true,
    customStorefront: true,
    commissionAdjustment: 2, // 2% discount
    active: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'plan_premium',
    tier: 'PREMIUM',
    name: {
      ar: 'الباقة الاحترافية الذهبية',
      en: 'Enterprise VIP Plan',
      so: 'Xirmada Dahabka ee VIP',
    },
    description: {
      ar: 'أقصى عدد من المنتجات، أولوية قصوى، دعم مخصص 24/7، وتخفيض 3% في العمولة',
      en: 'Maximum capacity, top-priority placement, 24/7 VIP support, and 3% fee reduction',
      so: 'Awoodda ugu sarraysa, taageero gaar ah 24/7, iyo 3% dhimis komishan',
    },
    price: 75,
    currency: 'USD',
    billingPeriod: 'monthly',
    maxProducts: 1000,
    maxImages: 15,
    featuredListingAllowed: true,
    analyticsLevel: 'advanced',
    prioritySupport: true,
    customStorefront: true,
    commissionAdjustment: 3, // 3% discount
    active: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

let memoryPlans: SellerPlan[] = [];
let memorySubscriptions: SellerSubscription[] = [];

function loadPlans(): SellerPlan[] {
  if (memoryPlans.length > 0) return memoryPlans;
  if (typeof window === 'undefined') return STANDARD_SELLER_PLANS;
  try {
    const raw = localStorage.getItem(PLANS_STORAGE_KEY);
    memoryPlans = raw ? JSON.parse(raw) : STANDARD_SELLER_PLANS;
    return memoryPlans;
  } catch {
    return STANDARD_SELLER_PLANS;
  }
}

function persistPlans(plans: SellerPlan[]) {
  memoryPlans = plans;
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(PLANS_STORAGE_KEY, JSON.stringify(plans));
  } catch (err) {
    console.error('Failed to save plans to localStorage', err);
  }
}

function loadSubscriptions(): SellerSubscription[] {
  if (memorySubscriptions.length > 0) return memorySubscriptions;
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(SUBSCRIPTIONS_STORAGE_KEY);
    memorySubscriptions = raw ? JSON.parse(raw) : [];
    return memorySubscriptions;
  } catch {
    return [];
  }
}

function persistSubscriptions(subs: SellerSubscription[]) {
  memorySubscriptions = subs;
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SUBSCRIPTIONS_STORAGE_KEY, JSON.stringify(subs));
  } catch (err) {
    console.error('Failed to save subscriptions to localStorage', err);
  }
}

export const subscriptionService = {
  /**
   * Sync plans and subscriptions from Firestore
   */
  async syncWithFirestore(sellerId?: string, isAdmin?: boolean): Promise<void> {
    try {
      const plansSnap = await getDocs(collection(db, PLANS_COLLECTION));
      if (!plansSnap.empty) {
        const cloudPlans: SellerPlan[] = [];
        plansSnap.forEach(d => cloudPlans.push(d.data() as SellerPlan));
        persistPlans(cloudPlans);
      } else {
        persistPlans(STANDARD_SELLER_PLANS);
      }

      let subsQuery;
      if (isAdmin) {
        subsQuery = collection(db, SUBSCRIPTIONS_COLLECTION);
      } else if (sellerId) {
        subsQuery = query(collection(db, SUBSCRIPTIONS_COLLECTION), where('sellerId', '==', sellerId));
      }

      if (subsQuery) {
        const subsSnap = await getDocs(subsQuery);
        if (!subsSnap.empty) {
          const cloudSubs: SellerSubscription[] = [];
          subsSnap.forEach(d => cloudSubs.push(d.data() as SellerSubscription));
          // Merge with existing local subscriptions if sellerId scoped
          if (sellerId && !isAdmin) {
            const current = loadSubscriptions().filter(s => s.sellerId !== sellerId);
            persistSubscriptions([...cloudSubs, ...current]);
          } else {
            persistSubscriptions(cloudSubs);
          }
        }
      }
    } catch (err) {
      console.warn('Subscription sync offline:', err);
    }
  },

  getPlans(): SellerPlan[] {
    return loadPlans();
  },

  getPlanById(planId: string): SellerPlan | undefined {
    return this.getPlans().find(p => p.id === planId);
  },

  getSubscriptions(): SellerSubscription[] {
    return loadSubscriptions();
  },

  getSellerSubscription(sellerId: string): SellerSubscription | undefined {
    const subs = loadSubscriptions();
    return subs.find(s => s.sellerId === sellerId && (s.status === 'ACTIVE' || s.status === 'TRIAL'));
  },

  /**
   * Deterministically returns the active plan for a seller.
   * Defaults safely to the FREE plan if no active subscription exists.
   */
  getSellerEffectivePlan(sellerId: string): SellerPlan {
    const sub = this.getSellerSubscription(sellerId);
    if (sub && sub.status === 'ACTIVE') {
      const plan = this.getPlanById(sub.planId);
      if (plan) return plan;
    }
    // Fallback to FREE plan
    const freePlan = this.getPlans().find(p => p.tier === 'FREE');
    return freePlan || STANDARD_SELLER_PLANS[0];
  },

  /**
   * Seller submits an upgrade or plan selection.
   * IMPORTANT: The seller CANNOT mark it ACTIVE.
   * If price > 0, it is created as TRIAL or requires Admin verification of manual payment reference.
   */
  async requestSubscription(params: {
    sellerId: string;
    storeId: string;
    planId: string;
    paymentMethod?: string;
    paymentReference?: string;
    notes?: string;
  }): Promise<SellerSubscription> {
    const plan = this.getPlanById(params.planId);
    if (!plan) throw new Error('Selected plan does not exist');

    const now = new Date();
    const startDate = now.toISOString();
    const endDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const isFree = plan.tier === 'FREE' || plan.price === 0;
    const initialStatus: SubscriptionStatus = params.paymentReference ? 'PENDING_REVIEW' : 'PENDING_PAYMENT';

    const newSub: SellerSubscription = {
      id: `SUB-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`,
      sellerId: params.sellerId,
      storeId: params.storeId,
      planId: plan.id,
      planTier: plan.tier,
      status: initialStatus,
      billingClassification: isFree ? 'FREE' : 'MANUAL',
      price: plan.price,
      paymentMethod: params.paymentMethod,
      paymentReference: params.paymentReference?.trim(),
      submittedAt: startDate,
      startDate,
      endDate,
      notes: params.notes?.slice(0, 500),
      createdAt: startDate,
      updatedAt: startDate,
    };

    try {
      await setDoc(doc(db, SUBSCRIPTIONS_COLLECTION, newSub.id), newSub);
      const currentSubs = loadSubscriptions();
      // Invalidate existing active subscriptions for this seller
      currentSubs.forEach(s => {
        if (s.sellerId === params.sellerId && s.status === 'ACTIVE') {
          s.status = 'CANCELLED';
          s.updatedAt = startDate;
        }
      });
      currentSubs.unshift(newSub);
      persistSubscriptions(currentSubs);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `${SUBSCRIPTIONS_COLLECTION}/${newSub.id}`);
      throw err;
    }

    return newSub;
  },

  /**
   * Admin authoritative approval for manual mobile money subscription payment (P1-RBAC-01)
   */
  async approveSubscriptionPayment(
    subscriptionId: string,
    adminId: string,
    adminRole: UserRole,
    notes?: string
  ): Promise<SellerSubscription> {
    if (adminRole !== 'ADMIN' && adminRole !== 'SUPER_ADMIN') {
      throw new Error('Forbidden: Only administrators can approve subscription activations');
    }

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
    const res = await fetch(`${baseUrl}/api/subscriptions/review`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        subscriptionId,
        action: 'APPROVE',
        notes,
      }),
    });

    const resData = await res.json().catch(() => ({}));
    if (!res.ok || !resData.success || !resData.subscription) {
      throw new Error(resData.error || `فشل اعتماد الاشتراك عبر البوابة الموثوقة (HTTP ${res.status})`);
    }

    const updatedSub: SellerSubscription = resData.subscription;

    // P1-CONS-01: Update local memory and cache ONLY after authoritative backend write succeeds
    const currentSubs = loadSubscriptions();
    const index = currentSubs.findIndex(s => s.id === subscriptionId);
    if (index !== -1) {
      currentSubs[index] = updatedSub;
    } else {
      currentSubs.unshift(updatedSub);
    }
    persistSubscriptions(currentSubs);

    return updatedSub;
  },

  /**
   * Cancel a subscription (P1-RBAC-01)
   */
  async cancelSubscription(
    subscriptionId: string,
    actorId: string,
    actorRole: UserRole
  ): Promise<SellerSubscription> {
    const isAdmin = actorRole === 'ADMIN' || actorRole === 'SUPER_ADMIN';

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

    if (isAdmin) {
      const baseUrl = typeof window !== 'undefined' ? '' : (process.env.API_BASE_URL || 'http://127.0.0.1:3000');
      const res = await fetch(`${baseUrl}/api/subscriptions/review`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          subscriptionId,
          action: 'CANCEL',
        }),
      });

      const resData = await res.json().catch(() => ({}));
      if (!res.ok || !resData.success || !resData.subscription) {
        throw new Error(resData.error || `فشل إلغاء الاشتراك عبر البوابة الموثوقة (HTTP ${res.status})`);
      }

      const updatedSub: SellerSubscription = resData.subscription;
      const currentSubs = loadSubscriptions();
      const index = currentSubs.findIndex(s => s.id === subscriptionId);
      if (index !== -1) {
        currentSubs[index] = updatedSub;
      }
      persistSubscriptions(currentSubs);
      return updatedSub;
    }

    const currentSubs = loadSubscriptions();
    const target = currentSubs.find(s => s.id === subscriptionId);
    if (!target) throw new Error('Subscription not found');

    if (target.sellerId !== actorId) {
      throw new Error('Forbidden: Cannot cancel another merchant subscription');
    }

    const now = new Date().toISOString();
    target.status = 'CANCELLED';
    target.updatedAt = now;

    try {
      await updateDoc(doc(db, SUBSCRIPTIONS_COLLECTION, subscriptionId), {
        status: 'CANCELLED',
        updatedAt: now,
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `${SUBSCRIPTIONS_COLLECTION}/${subscriptionId}`);
      throw err;
    }

    persistSubscriptions(currentSubs);
    return target;
  },

  getAllSubscriptions(): SellerSubscription[] {
    return loadSubscriptions();
  },

  getSellerActiveSubscription(sellerId: string): SellerSubscription | undefined {
    return this.getSellerSubscription(sellerId);
  },

  async requestSubscriptionUpgrade(params: {
    sellerId: string;
    storeId?: string;
    planId: string;
    paymentMethod?: string;
    paymentReference?: string;
    paymentReferenceNumber?: string;
    senderPhone?: string;
    notes?: string;
  }): Promise<SellerSubscription> {
    return this.requestSubscription({
      ...params,
      storeId: params.storeId || '',
      paymentReference: params.paymentReferenceNumber || params.paymentReference,
      notes: params.senderPhone ? `Sender: ${params.senderPhone}${params.notes ? ` - ${params.notes}` : ''}` : params.notes,
    });
  },

  /**
   * Admin rejection of subscription request
   */
  async rejectSubscription(
    subscriptionId: string,
    adminId: string,
    adminRole: UserRole,
    reason?: string
  ): Promise<SellerSubscription> {
    if (adminRole !== 'ADMIN' && adminRole !== 'SUPER_ADMIN') {
      throw new Error('Forbidden: Only administrators can reject subscriptions');
    }

    const currentSubs = loadSubscriptions();
    const target = currentSubs.find(s => s.id === subscriptionId);
    if (!target) throw new Error('Subscription not found');

    const now = new Date().toISOString();
    target.status = 'CANCELLED';
    target.notes = reason ? `${target.notes || ''} [Rejected: ${reason}]`.trim() : target.notes;
    target.updatedAt = now;

    persistSubscriptions(currentSubs);

    try {
      await updateDoc(doc(db, SUBSCRIPTIONS_COLLECTION, subscriptionId), {
        status: 'CANCELLED',
        notes: target.notes || '',
        updatedAt: now,
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `${SUBSCRIPTIONS_COLLECTION}/${subscriptionId}`);
    }

    await auditLogService.logAction({
      actorId: adminId,
      actorRole: adminRole,
      action: 'SUBSCRIPTION_REJECTED',
      targetType: 'subscription',
      targetId: subscriptionId,
      targetName: `Subscription ${subscriptionId}`,
      metadata: { reason },
    });

    return target;
  },
};
