import { doc, getDocs, collection, setDoc, query, where } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType, cleanForFirestore } from '../lib/firebase';
import { PayoutRequest, PayoutStatus, UserRole } from '../types';
import { auditLogService } from './auditLogService';
import { orderService } from './orderService';
import { normalizePayout } from '../lib/dataNormalization';

const PAYOUTS_STORAGE_KEY = 'marketspace_payouts_v1';
const PAYOUTS_COLLECTION = 'payoutRequests';

const seedPayouts: PayoutRequest[] = [
  {
    id: 'pay_01',
    sellerId: 'user_seller_01',
    storeId: 'store_cosmetics_01',
    sellerName: 'Mustafa Cosmetics',
    storeName: 'متجر مصطفى لمستحضرات التجميل',
    amount: 150.0,
    paymentMethod: 'zaad',
    settlementType: 'MANUAL_SETTLEMENT',
    accountNumber: '+252 63 4112233',
    accountName: 'Mustafa Cosmetics Sole',
    status: 'paid',
    requestedAt: '2025-02-15T10:00:00Z',
    processedAt: '2025-02-15T14:30:00Z',
    notes: 'تم التحويل يدوياً وتسوية المعاملة عبر خدمة زاد (Ref: ZAD-98231)',
  },
  {
    id: 'pay_02',
    sellerId: 'user_restaurant_01',
    storeId: 'store_restaurant_01',
    sellerName: 'Chef Sultan',
    storeName: 'مطعم الشيف سلطان',
    amount: 280.0,
    paymentMethod: 'evc_plus',
    settlementType: 'MANUAL_SETTLEMENT',
    accountNumber: '+252 61 2112233',
    accountName: 'Sultan Food Services',
    status: 'pending',
    requestedAt: new Date(Date.now() - 3600000 * 24).toISOString(),
    notes: 'طلب سحب أرباح مبيعات الأسبوع المنصرم',
  },
];

let memoryPayouts: PayoutRequest[] = [];

function initPayouts(): PayoutRequest[] {
  if (memoryPayouts.length > 0) return memoryPayouts;
  if (typeof window === 'undefined') return seedPayouts;
  try {
    const raw = localStorage.getItem(PAYOUTS_STORAGE_KEY);
    if (!raw) {
      const normalizedSeeds = seedPayouts.map(normalizePayout);
      localStorage.setItem(PAYOUTS_STORAGE_KEY, JSON.stringify(normalizedSeeds));
      memoryPayouts = normalizedSeeds;
      return normalizedSeeds;
    }
    const parsed = JSON.parse(raw);
    memoryPayouts = Array.isArray(parsed) ? parsed.map(normalizePayout) : seedPayouts.map(normalizePayout);
    return memoryPayouts;
  } catch (err) {
    console.error('Failed to parse payouts from localStorage:', err);
    const normalizedSeeds = seedPayouts.map(normalizePayout);
    memoryPayouts = normalizedSeeds;
    return normalizedSeeds;
  }
}

function persistLocal(payouts: PayoutRequest[]) {
  const normalized = payouts.map(normalizePayout);
  memoryPayouts = normalized;
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(PAYOUTS_STORAGE_KEY, JSON.stringify(normalized));
  } catch (err) {
    console.error('Failed to save payouts to localStorage:', err);
  }
}

export const payoutService = {
  /**
   * Seed payout requests in memory for deterministic test fixtures and audits
   */
  seedPayouts(payouts: PayoutRequest[]) {
    memoryPayouts = payouts.map(normalizePayout);
  },

  async syncWithFirestore(sellerId?: string, isAdmin?: boolean): Promise<PayoutRequest[]> {
    try {
      let q;
      if (isAdmin) {
        q = collection(db, PAYOUTS_COLLECTION);
      } else if (sellerId) {
        q = query(collection(db, PAYOUTS_COLLECTION), where('sellerId', '==', sellerId));
      }

      if (q) {
        const snap = await getDocs(q);
        if (!snap.empty) {
          const cloud: PayoutRequest[] = [];
          snap.forEach(d => {
            const raw = d.data() as Record<string, any>;
            cloud.push(normalizePayout({
              ...raw,
              id: d.id || raw.id,
              settlementType: raw.settlementType || 'MANUAL_SETTLEMENT',
            }));
          });
          persistLocal(cloud);
          return cloud;
        }
      }
    } catch (err) {
      console.warn('Firestore payouts offline/skipped:', err);
    }
    return initPayouts();
  },

  getPayoutRequestsBySeller(sellerId: string): PayoutRequest[] {
    const payouts = initPayouts();
    return payouts.filter(p => p.sellerId === sellerId).map(normalizePayout);
  },

  getAllPayouts(): PayoutRequest[] {
    return initPayouts().map(normalizePayout);
  },

  /**
   * Authoritatively fetches seller financial summary from the single source of truth server API.
   * FIN-01 / FIN-02: Prevents client-side balance drift and unbounded reads.
   */
  async getFinancialSummary(sellerId: string): Promise<any> {
    const currentUser = auth.currentUser;
    const token = currentUser ? await currentUser.getIdToken() : '';
    const res = await fetch(`/api/seller/financial-summary?sellerId=${encodeURIComponent(sellerId)}`, {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });

    const data = await res.json();
    if (!res.ok || !data.success || !data.summary) {
      throw new Error(data.error || 'Failed to fetch authoritative financial summary');
    }
    return data.summary;
  },

  async createPayoutRequest(
    data: Omit<PayoutRequest, 'id' | 'requestedAt' | 'status' | 'settlementType'>
  ): Promise<PayoutRequest> {
    if (!data.amount || isNaN(data.amount) || data.amount <= 0) {
      throw new Error('Amount must be greater than zero');
    }
    if (data.amount > 50000) {
      throw new Error('Maximum payout request limit exceeded ($50,000)');
    }
    if (!data.accountNumber || !data.accountNumber.trim()) {
      throw new Error('Account number is required');
    }

    // Production / Authoritative: Delegate directly to secure server gateway with authenticated token
    // The server calculates the balance authoritatively within its lock/transaction (FIN-01, FIN-02)
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error('UNAUTHENTICATED: Authentication required to request a payout (يجب تسجيل الدخول لطلب سحب الأرباح)');
    }

    const idToken = await currentUser.getIdToken();
    const res = await fetch('/api/payouts/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify(data),
    });
    const resData = await res.json();
    if (!res.ok || !resData.success || !resData.payout) {
      throw new Error(resData.error || 'فشل في معالجة طلب السحب عبر البوابة الموثوقة');
    }
    const createdPayout: PayoutRequest = resData.payout;
    const payouts = initPayouts();
    payouts.unshift(createdPayout);
    persistLocal(payouts);
    return createdPayout;
  },

  async updatePayoutStatus(
    payoutId: string,
    newStatus: PayoutStatus,
    notes?: string,
    actorId: string = 'admin_701',
    actorRole: UserRole = 'ADMIN'
  ): Promise<PayoutRequest> {
    return this.reviewPayout({
      payoutId,
      newStatus,
      actorId,
      actorRole,
      notes,
    });
  },

  async reviewPayout(params: {
    payoutId: string;
    newStatus: PayoutStatus;
    actorId: string;
    actorRole: UserRole;
    notes?: string;
  }): Promise<PayoutRequest> {
    const isAdmin = params.actorRole === 'ADMIN' || params.actorRole === 'SUPER_ADMIN';
    if (!isAdmin) {
      throw new Error('Forbidden: Only platform administrators can review and settle payout requests');
    }

    const payouts = initPayouts();
    const index = payouts.findIndex(p => p.id === params.payoutId);
    if (index === -1) throw new Error('Payout request not found');

    const prev = payouts[index];
    // State machine integrity check
    if (prev.status === 'paid' && params.newStatus !== 'paid') {
      throw new Error('Cannot modify terminal paid payout: لا يمكن تعديل طلب سحب مكتمل');
    }
    if (prev.status === 'rejected' && params.newStatus !== 'rejected') {
      throw new Error('Cannot modify terminal rejected payout: لا يمكن تعديل طلب سحب مرفوض');
    }

    const now = new Date().toISOString();
    const updated: PayoutRequest = {
      ...prev,
      status: params.newStatus,
      notes: params.notes || prev.notes,
      reviewedBy: params.actorId,
      processedAt: params.newStatus === 'paid' || params.newStatus === 'approved' ? now : prev.processedAt,
    };

    // SEC-02: Durable Firestore write strictly Fail-Closed.
    // NEVER swallow PERMISSION_DENIED or any database authorization errors!
    try {
      await setDoc(doc(db, PAYOUTS_COLLECTION, params.payoutId), cleanForFirestore(updated), { merge: true });
    } catch (err: any) {
      console.error('[PayoutService:Error] Authoritative Firestore payout write failed (Fail-Closed):', err?.message);
      handleFirestoreError(err, OperationType.UPDATE, `${PAYOUTS_COLLECTION}/${params.payoutId}`);
      throw err;
    }

    // Update local display cache ONLY after authoritative write succeeds
    payouts[index] = updated;
    persistLocal(payouts);

    await auditLogService.logAction({
      actorId: params.actorId,
      actorRole: params.actorRole,
      action: `PAYOUT_${params.newStatus.toUpperCase()}`,
      targetType: 'payout',
      targetId: params.payoutId,
      targetName: `Payout to ${prev.sellerName || prev.accountName} ($${prev.amount})`,
      metadata: { method: prev.paymentMethod, amount: prev.amount, notes: params.notes },
    });

    return updated;
  },
};
