import { doc, getDocs, collection, setDoc, updateDoc, query, where } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  FeaturedListing,
  PromotionRequest,
  PromotionRequestStatus,
  UserRole,
} from '../types';
import { productService } from './productService';
import { storeService } from './storeService';
import { auditLogService } from './auditLogService';

const FEATURED_STORAGE_KEY = 'marketspace_featured_listings_v1';
const PROMOTIONS_STORAGE_KEY = 'marketspace_promotion_requests_v1';

const FEATURED_COLLECTION = 'featuredListings';
const PROMOTIONS_COLLECTION = 'promotionRequests';

export const INITIAL_FEATURED_LISTINGS: FeaturedListing[] = [
  {
    id: 'feat_store_01',
    targetType: 'store',
    targetId: 'store_cosmetics_01',
    sellerId: 'user_seller_01',
    title: {
      ar: 'متجر الجمال الصومالي الأول',
      en: 'Somali Premier Beauty Store',
      so: 'Dukaanka Quruxda Koowaad ee Soomaaliya',
    },
    placement: 'home_featured',
    priority: 10,
    startAt: '2026-01-01T00:00:00.000Z',
    endAt: '2026-12-31T23:59:59.000Z',
    status: 'active',
    fee: 50.0,
    createdAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'system_admin',
  },
];

export const INITIAL_PROMOTION_REQUESTS: PromotionRequest[] = [
  {
    id: 'promo_req_01',
    productId: 'prod_cosmetics_01',
    productTitle: {
      ar: 'زيت اللبان الصومالي الطبيعي 100%',
      en: '100% Pure Somali Frankincense Essential Oil',
      so: 'Saliidda Maydiga Saafi ah ee Soomaaliyeed',
    },
    sellerId: 'user_seller_01',
    storeId: 'store_cosmetics_01',
    placement: 'category_sponsor',
    budget: 20.0,
    durationDays: 14,
    startAt: '2026-01-01T00:00:00.000Z',
    endAt: '2026-12-31T23:59:59.000Z',
    status: 'ACTIVE',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

let memoryFeatured: FeaturedListing[] = [];
let memoryPromotions: PromotionRequest[] = [];

function loadFeatured(): FeaturedListing[] {
  if (memoryFeatured.length > 0) return memoryFeatured;
  if (typeof window === 'undefined') return INITIAL_FEATURED_LISTINGS;
  try {
    const raw = localStorage.getItem(FEATURED_STORAGE_KEY);
    memoryFeatured = raw ? JSON.parse(raw) : INITIAL_FEATURED_LISTINGS;
    return memoryFeatured;
  } catch {
    return INITIAL_FEATURED_LISTINGS;
  }
}

function persistFeatured(items: FeaturedListing[]) {
  memoryFeatured = items;
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(FEATURED_STORAGE_KEY, JSON.stringify(items));
  } catch (err) {
    console.error('Failed to save featured listings to localStorage', err);
  }
}

function loadPromotions(): PromotionRequest[] {
  if (memoryPromotions.length > 0) return memoryPromotions;
  if (typeof window === 'undefined') return INITIAL_PROMOTION_REQUESTS;
  try {
    const raw = localStorage.getItem(PROMOTIONS_STORAGE_KEY);
    memoryPromotions = raw ? JSON.parse(raw) : INITIAL_PROMOTION_REQUESTS;
    return memoryPromotions;
  } catch {
    return INITIAL_PROMOTION_REQUESTS;
  }
}

function persistPromotions(items: PromotionRequest[]) {
  memoryPromotions = items;
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(PROMOTIONS_STORAGE_KEY, JSON.stringify(items));
  } catch (err) {
    console.error('Failed to save promotion requests to localStorage', err);
  }
}

export const promotionService = {
  async syncWithFirestore(sellerId?: string, isAdmin?: boolean): Promise<void> {
    try {
      const featSnap = await getDocs(collection(db, FEATURED_COLLECTION));
      if (!featSnap.empty) {
        const cloudFeat: FeaturedListing[] = [];
        featSnap.forEach(d => cloudFeat.push(d.data() as FeaturedListing));
        persistFeatured(cloudFeat);
      } else {
        persistFeatured(INITIAL_FEATURED_LISTINGS);
      }

      let promoQ;
      if (isAdmin) {
        promoQ = collection(db, PROMOTIONS_COLLECTION);
      } else if (sellerId) {
        promoQ = query(collection(db, PROMOTIONS_COLLECTION), where('sellerId', '==', sellerId));
      }

      if (promoQ) {
        const promoSnap = await getDocs(promoQ);
        if (!promoSnap.empty) {
          const cloudPromo: PromotionRequest[] = [];
          promoSnap.forEach(d => cloudPromo.push(d.data() as PromotionRequest));
          persistPromotions(cloudPromo);
        } else if (!sellerId) {
          persistPromotions(INITIAL_PROMOTION_REQUESTS);
        }
      }
    } catch (err) {
      console.warn('Promotions Firestore sync offline:', err);
    }
  },

  /* ----------------------------------------------------
   * FEATURED LISTINGS (Admin Authoritative Merchandising)
   * ---------------------------------------------------- */
  getFeaturedListings(): FeaturedListing[] {
    const now = new Date();
    return loadFeatured().filter(
      f => f.status === 'active' && new Date(f.startAt) <= now && new Date(f.endAt) >= now
    );
  },

  getAllFeaturedListings(): FeaturedListing[] {
    return loadFeatured();
  },

  isStoreFeatured(storeId: string): boolean {
    return this.getFeaturedListings().some(
      f => f.targetType === 'store' && f.targetId === storeId
    );
  },

  isProductSponsored(productId: string): boolean {
    const now = new Date();
    return loadPromotions().some(
      p =>
        p.productId === productId &&
        p.status === 'ACTIVE' &&
        (!p.startAt || new Date(p.startAt) <= now) &&
        (!p.endAt || new Date(p.endAt) >= now)
    );
  },

  async createFeaturedListing(
    params: Omit<FeaturedListing, 'id' | 'createdAt'>,
    adminId: string,
    adminRole: UserRole
  ): Promise<FeaturedListing> {
    if (adminRole !== 'ADMIN' && adminRole !== 'SUPER_ADMIN') {
      throw new Error('Forbidden: Only administrators can configure featured merchandising');
    }

    const items = loadFeatured();
    const newListing: FeaturedListing = {
      ...params,
      id: `FEAT-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`,
      createdAt: new Date().toISOString(),
      createdBy: adminId,
    };

    items.unshift(newListing);
    persistFeatured(items);

    try {
      await setDoc(doc(db, FEATURED_COLLECTION, newListing.id), newListing);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `${FEATURED_COLLECTION}/${newListing.id}`);
    }

    await auditLogService.logAction({
      actorId: adminId,
      actorRole: adminRole,
      action: 'FEATURED_LISTING_CREATED' as any,
      targetType: 'featured',
      targetId: newListing.id,
      targetName: `Featured ${newListing.targetType}: ${newListing.targetId}`,
      metadata: { placement: newListing.placement, priority: newListing.priority },
    });

    return newListing;
  },

  /* ----------------------------------------------------
   * PROMOTED PRODUCTS (Merchant Request -> Admin Approval)
   * ---------------------------------------------------- */
  getPromotionsBySeller(sellerId: string): PromotionRequest[] {
    return loadPromotions().filter(p => p.sellerId === sellerId);
  },

  getAllPromotionRequests(): PromotionRequest[] {
    return loadPromotions();
  },

  /**
   * Seller submits a promotion request strictly for THEIR OWN product
   */
  async submitPromotionRequest(params: {
    productId: string;
    sellerId: string;
    storeId: string;
    placement: PromotionRequest['placement'];
    budget: number;
    durationDays: number;
  }): Promise<PromotionRequest> {
    // 1. Strict ownership verification: Seller A cannot promote Seller B product
    const product = productService.getProductById(params.productId);
    if (!product) throw new Error('Product not found');

    const productSellerId = product.sellerId || product.seller?.id;
    if (productSellerId && productSellerId !== params.sellerId) {
      throw new Error('Security Violation: You can only create promotion requests for your own products');
    }

    const now = new Date();
    const newReq: PromotionRequest = {
      id: `PROMO-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`,
      productId: params.productId,
      productTitle: product.title,
      sellerId: params.sellerId,
      storeId: params.storeId,
      placement: params.placement,
      budget: Math.max(5, Number(params.budget) || 10),
      durationDays: Math.max(1, Math.min(90, Math.floor(Number(params.durationDays) || 7))),
      status: 'PENDING_REVIEW', // strictly pending review
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    try {
      await setDoc(doc(db, PROMOTIONS_COLLECTION, newReq.id), newReq);
      const requests = loadPromotions();
      requests.unshift(newReq);
      persistPromotions(requests);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `${PROMOTIONS_COLLECTION}/${newReq.id}`);
      throw err;
    }

    return newReq;
  },

  /**
   * Admin approves or rejects a promotion request
   */
  async reviewPromotionRequest(params: {
    requestId: string;
    status: 'APPROVED' | 'REJECTED';
    adminId: string;
    adminRole: UserRole;
    adminNotes?: string;
    rejectionReason?: string;
  }): Promise<PromotionRequest> {
    if (params.adminRole !== 'ADMIN' && params.adminRole !== 'SUPER_ADMIN') {
      throw new Error('Forbidden: Only administrators can approve promotion placements');
    }

    const requests = loadPromotions();
    const target = requests.find(r => r.id === params.requestId);
    if (!target) throw new Error('Promotion request not found');

    const now = new Date();
    const nowIso = now.toISOString();

    target.status = params.status === 'APPROVED' ? 'ACTIVE' : 'REJECTED';
    target.reviewedBy = params.adminId;
    target.reviewedAt = nowIso;
    target.updatedAt = nowIso;
    if (params.adminNotes) target.adminNotes = params.adminNotes;
    if (params.rejectionReason) target.rejectionReason = params.rejectionReason;

    if (params.status === 'APPROVED') {
      target.startAt = nowIso;
      target.endAt = new Date(now.getTime() + target.durationDays * 24 * 60 * 60 * 1000).toISOString();
    }

    persistPromotions(requests);

    try {
      await updateDoc(doc(db, PROMOTIONS_COLLECTION, target.id), {
        status: target.status,
        reviewedBy: target.reviewedBy,
        reviewedAt: target.reviewedAt,
        updatedAt: target.updatedAt,
        adminNotes: target.adminNotes || '',
        rejectionReason: target.rejectionReason || '',
        startAt: target.startAt || '',
        endAt: target.endAt || '',
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `${PROMOTIONS_COLLECTION}/${target.id}`);
    }

    await auditLogService.logAction({
      actorId: params.adminId,
      actorRole: params.adminRole,
      action: params.status === 'APPROVED' ? 'PROMOTION_APPROVED' as any : 'PROMOTION_REJECTED' as any,
      targetType: 'promotion',
      targetId: target.id,
      targetName: `Promotion for Product ${target.productId}`,
      metadata: { status: target.status, budget: target.budget },
    });

    return target;
  },

  getSellerPromotionRequests(sellerId: string): PromotionRequest[] {
    return this.getPromotionsBySeller(sellerId);
  },

  async requestPromotion(params: {
    productId: string;
    sellerId: string;
    storeId?: string;
    productTitle?: string;
    productImage?: string;
    placement: PromotionRequest['placement'];
    durationDays: number;
    budget?: number;
    paymentMethod?: string;
    paymentReferenceNumber?: string;
    senderPhone?: string;
  }): Promise<PromotionRequest> {
    const budget = params.budget ?? (params.durationDays * 2);
    return this.submitPromotionRequest({
      productId: params.productId,
      sellerId: params.sellerId,
      storeId: params.storeId || '',
      placement: params.placement,
      budget,
      durationDays: params.durationDays,
    });
  },

  async approvePromotion(
    requestId: string,
    adminId: string,
    adminRole: UserRole,
    adminNotes?: string
  ): Promise<PromotionRequest> {
    return this.reviewPromotionRequest({
      requestId,
      status: 'APPROVED',
      adminId,
      adminRole,
      adminNotes,
    });
  },

  async rejectPromotion(
    requestId: string,
    adminId: string,
    adminRole: UserRole,
    rejectionReason?: string
  ): Promise<PromotionRequest> {
    return this.reviewPromotionRequest({
      requestId,
      status: 'REJECTED',
      adminId,
      adminRole,
      rejectionReason,
    });
  },
};
