import { doc, getDocs, collection, setDoc, updateDoc, query, limit } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { AdCampaign, AdCampaignStatus, AdPlacement, UserRole } from '../types';
import { auditLogService } from './auditLogService';

const CAMPAIGNS_STORAGE_KEY = 'marketspace_ad_campaigns_v1';
const CAMPAIGNS_COLLECTION = 'campaigns';

export const INITIAL_AD_CAMPAIGNS: AdCampaign[] = [
  {
    id: 'camp_eid_01',
    advertiserId: 'user_seller_01',
    advertiserName: 'Bilan Cosmetics Ltd.',
    placement: 'home_banner',
    title: {
      ar: 'عروض الموسم: مستحضرات العناية الفاخرة',
      en: 'Season Deals: Premium Organic Care',
      so: 'Qiimo Dhimis: Daryeelka Dabiiciga ah',
    },
    description: {
      ar: 'شحن سريع ومجاني داخل مقديشو على جميع باقات اللبان والمستحضرات التجميلية',
      en: 'Fast, certified delivery across Mogadishu on all organic essentials',
      so: 'Gaarsiin degdeg ah oo Muqdisho gudaheeda ah',
    },
    creativeUrl: 'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=1200&q=80',
    targetUrl: '/shop?category=cosmetics',
    budget: 80.0,
    spent: 24.5,
    startAt: '2026-01-01T00:00:00.000Z',
    endAt: '2026-12-31T23:59:59.000Z',
    status: 'ACTIVE',
    billingClassification: 'MANUAL',
    paymentReference: 'EVC-7729104',
    paymentVerified: true,
    reviewedBy: 'system_admin',
    reviewedAt: '2026-01-01T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'camp_elec_02',
    advertiserId: 'user_seller_02',
    advertiserName: 'Mogadishu Tech & Solar',
    placement: 'shop_listing',
    title: {
      ar: 'أنظمة الطاقة الشمسية والإلكترونيات',
      en: 'Solar Inverters & High-Tech Accessories',
      so: 'Cadceedda iyo Qalabka Elektarooniga',
    },
    description: {
      ar: 'ضمان رسمي لمدة عامين مع فحص فني مجاني للتركيب في الصومال',
      en: 'Official 2-year warranty with complimentary installation support',
      so: 'Damaanad 2 sano ah iyo rakibaad xirfad leh',
    },
    creativeUrl: 'https://images.unsplash.com/photo-1509391365360-2e959784a276?w=1200&q=80',
    targetUrl: '/shop?category=electronics',
    budget: 120.0,
    spent: 45.0,
    startAt: '2026-01-01T00:00:00.000Z',
    endAt: '2026-12-31T23:59:59.000Z',
    status: 'ACTIVE',
    billingClassification: 'MANUAL',
    paymentReference: 'ZAAD-883901',
    paymentVerified: true,
    reviewedBy: 'system_admin',
    reviewedAt: '2026-01-01T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

let memoryCampaigns: AdCampaign[] = [];

function isProductionEnvironment(): boolean {
  if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'production') return true;
  if (typeof import.meta !== 'undefined' && (import.meta as any).env?.PROD) return true;
  return false;
}

function loadCampaigns(): AdCampaign[] {
  if (memoryCampaigns.length > 0) return memoryCampaigns;
  if (isProductionEnvironment()) {
    memoryCampaigns = [];
    return memoryCampaigns;
  }
  // F-20: Do not read or trust localStorage for campaign authority
  memoryCampaigns = [...INITIAL_AD_CAMPAIGNS];
  return memoryCampaigns;
}

function persistCampaigns(campaigns: AdCampaign[]) {
  memoryCampaigns = campaigns;
  // F-20: LocalStorage persistence removed for authoritative campaign state
}

async function persistCampaignToFirestore(id: string, payload: Record<string, any>, merge = true): Promise<void> {
  const cleanPayload = JSON.parse(JSON.stringify(payload));
  if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'test') {
    await setDoc(doc(db, CAMPAIGNS_COLLECTION, id), cleanPayload, merge ? { merge: true } : {});
  } else {
    const serverAdminModule = '../../server/firebaseAdmin';
    const { getAdminDb } = await import(/* @vite-ignore */ serverAdminModule);
    const adminDb = getAdminDb();
    if (!adminDb) {
      throw new Error('Database write failure (Fail-Closed): Firestore Admin DB unavailable for campaign persistence');
    }
    await adminDb.collection(CAMPAIGNS_COLLECTION).doc(id).set(cleanPayload, merge ? { merge: true } : {});
  }
}

export const adCampaignService = {
  resetMemoryState(): void {
    memoryCampaigns = [];
  },

  async syncWithFirestore(): Promise<AdCampaign[]> {
    try {
      const snap = await getDocs(query(collection(db, CAMPAIGNS_COLLECTION), limit(200)));
      if (!snap.empty) {
        const cloudCampaigns: AdCampaign[] = [];
        snap.forEach(d => cloudCampaigns.push(d.data() as AdCampaign));
        persistCampaigns(cloudCampaigns);
        return cloudCampaigns;
      } else if (!isProductionEnvironment()) {
        persistCampaigns(INITIAL_AD_CAMPAIGNS);
      }
    } catch (err) {
      console.warn('Ad campaigns Firestore sync offline:', err);
    }
    return loadCampaigns();
  },

  getAllCampaigns(): AdCampaign[] {
    return loadCampaigns();
  },

  getActiveCampaignsByPlacement(placement: AdPlacement): AdCampaign[] {
    const now = new Date();
    return loadCampaigns().filter(
      c =>
        c.placement === placement &&
        c.status === 'ACTIVE' &&
        new Date(c.startAt) <= now &&
        new Date(c.endAt) >= now
    );
  },

  getCampaignsByAdvertiser(advertiserId: string): AdCampaign[] {
    return loadCampaigns().filter(c => c.advertiserId === advertiserId);
  },

  /**
   * Advertiser creates a campaign proposal.
   * Status is strictly DRAFT or PENDING_REVIEW; advertiser CANNOT mark it APPROVED or ACTIVE.
   */
  async submitCampaign(params: {
    advertiserId: string;
    advertiserName: string;
    placement: AdPlacement;
    title: AdCampaign['title'];
    description?: AdCampaign['description'];
    creativeUrl: string;
    targetUrl: string;
    budget: number;
    durationDays: number;
    paymentReference?: string;
  }): Promise<AdCampaign> {
    const now = new Date();
    const duration = Math.max(1, Math.min(365, Math.floor(Number(params.durationDays) || 30)));
    const startAt = now.toISOString();
    const endAt = new Date(now.getTime() + duration * 24 * 60 * 60 * 1000).toISOString();

    const newCampaign: AdCampaign = {
      id: `CAMP-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`,
      advertiserId: params.advertiserId,
      sellerId: params.advertiserId,
      advertiserName: params.advertiserName,
      placement: params.placement,
      title: params.title,
      description: params.description,
      creativeUrl: params.creativeUrl,
      targetUrl: params.targetUrl,
      budget: Math.max(10, Number(params.budget) || 25),
      spent: 0,
      startAt,
      endAt,
      status: 'PENDING_REVIEW', // strictly pending review
      billingClassification: 'MANUAL',
      paymentReference: params.paymentReference?.trim(),
      paymentVerified: false,
      createdAt: startAt,
      updatedAt: startAt,
    };

    // F-13: Authoritative Firestore write MUST succeed BEFORE updating local state
    try {
      await persistCampaignToFirestore(newCampaign.id, newCampaign, false);
    } catch (err: any) {
      handleFirestoreError(err, OperationType.CREATE, `${CAMPAIGNS_COLLECTION}/${newCampaign.id}`);
      throw new Error(`Database write failure (Fail-Closed): Unable to submit campaign to Firestore (${err?.message || err})`);
    }

    const campaigns = loadCampaigns();
    campaigns.unshift(newCampaign);
    persistCampaigns(campaigns);

    return newCampaign;
  },

  /**
   * Admin approves, pauses, or rejects a campaign (F-13: Firestore-first)
   */
  async updateCampaignStatus(
    campaignId: string,
    newStatus: AdCampaignStatus,
    adminId: string,
    adminRole: UserRole,
    paymentVerified?: boolean
  ): Promise<AdCampaign> {
    if (adminRole !== 'ADMIN' && adminRole !== 'SUPER_ADMIN') {
      throw new Error('Forbidden: Only administrators can alter campaign approvals and billing status');
    }

    const campaigns = loadCampaigns();
    const index = campaigns.findIndex(c => c.id === campaignId);
    if (index === -1) throw new Error('Campaign not found');

    const prev = campaigns[index];
    const now = new Date().toISOString();
    const nextPaymentVerified = paymentVerified !== undefined ? paymentVerified : prev.paymentVerified;

    const updated: AdCampaign = {
      ...prev,
      status: newStatus,
      updatedAt: now,
      reviewedBy: adminId,
      reviewedAt: now,
      paymentVerified: nextPaymentVerified,
    };

    // F-13: Authoritative Firestore write MUST succeed BEFORE mutating local state (Fail-Closed)
    try {
      await persistCampaignToFirestore(
        campaignId,
        {
          status: updated.status,
          updatedAt: now,
          reviewedBy: adminId,
          reviewedAt: now,
          paymentVerified: updated.paymentVerified,
        },
        true
      );
    } catch (err: any) {
      handleFirestoreError(err, OperationType.UPDATE, `${CAMPAIGNS_COLLECTION}/${campaignId}`);
      throw new Error(`Database write failure (Fail-Closed): Unable to update campaign status in Firestore (${err?.message || err})`);
    }

    campaigns[index] = updated;
    persistCampaigns(campaigns);

    await auditLogService.logAction({
      actorId: adminId,
      actorRole: adminRole,
      action: newStatus === 'APPROVED' ? 'CAMPAIGN_APPROVED' : newStatus === 'REJECTED' ? 'CAMPAIGN_REJECTED' : 'CAMPAIGN_PAUSED',
      targetType: 'campaign',
      targetId: campaignId,
      targetName: `Campaign ${updated.id}`,
      metadata: { newStatus, budget: updated.budget },
    });

    return updated;
  },

  /**
   * Track ad impression
   */
  recordImpression(campaignId: string): void {
    const campaigns = loadCampaigns();
    const target = campaigns.find(c => c.id === campaignId);
    if (!target) return;

    target.impressions = (target.impressions || 0) + 1;
    persistCampaigns(campaigns);

    persistCampaignToFirestore(campaignId, {
      impressions: target.impressions,
    }, true).catch(err => {
      console.warn('Impression metric update offline:', err);
    });
  },

  /**
   * Track ad click
   */
  recordClick(campaignId: string): void {
    const campaigns = loadCampaigns();
    const target = campaigns.find(c => c.id === campaignId);
    if (!target) return;

    target.clicks = (target.clicks || 0) + 1;
    persistCampaigns(campaigns);

    persistCampaignToFirestore(campaignId, {
      clicks: target.clicks,
    }, true).catch(err => {
      console.warn('Click metric update offline:', err);
    });
  },
};
