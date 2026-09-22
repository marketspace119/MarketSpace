import { collection, getDocs, query, where } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { orderService } from './orderService';

export type PaymentMethodType = 'cash_on_delivery' | 'evc_plus' | 'zaad' | 'sahall' | 'card';

export type PaymentIntegrationStatus =
  | 'MANUAL_ON_DELIVERY'       // Real operational method: Cash collected upon delivery
  | 'MANUAL_MOBILE_TRANSFER'   // Operational: Merchant confirms transaction code manually
  | 'MOCK_UI_ONLY';            // Simulation: Awaiting production payment gateway credentials

export type PaymentStatus = 'pending' | 'authorized' | 'paid' | 'failed' | 'refunded';

export type MobileMoneyPaymentState =
  | 'PENDING_PAYMENT'
  | 'PAYMENT_REFERENCE_SUBMITTED'
  | 'UNDER_REVIEW'
  | 'CONFIRMED'
  | 'REJECTED';

export interface MobilePaymentSubmission {
  id: string;
  orderId: string;
  customerId: string;
  method: 'evc_plus' | 'zaad' | 'sahall';
  amount: number;
  referenceNumber: string;
  senderPhone: string;
  status: MobileMoneyPaymentState;
  reviewedBy?: string;
  reviewedAt?: string;
  notes?: string;
  createdAt: string;
}

export interface PaymentMethodConfig {
  id: PaymentMethodType;
  name: { ar: string; en: string; so: string };
  category: 'cash' | 'mobile_money' | 'card';
  integrationStatus: PaymentIntegrationStatus;
  description: { ar: string; en: string; so: string };
  requiresManualVerification: boolean;
  supportedCurrencies: string[];
}

export const PAYMENT_METHODS: Record<PaymentMethodType, PaymentMethodConfig> = {
  cash_on_delivery: {
    id: 'cash_on_delivery',
    name: { ar: 'الدفع عند الاستلام (COD)', en: 'Cash on Delivery', so: 'Lacag bixinta marka la helo' },
    category: 'cash',
    integrationStatus: 'MANUAL_ON_DELIVERY',
    description: {
      ar: 'يتم دفع المبلغ نقداً لمندوب التوصيل فور استلام الطلب وفحصه.',
      en: 'Pay in cash directly to the delivery courier upon receiving and verifying your order.',
      so: 'Lacagta caddaanka ah sii wakiilka gaarsiinta markaad hesho dalabkaaga.'
    },
    requiresManualVerification: false,
    supportedCurrencies: ['USD', 'SOS']
  },
  evc_plus: {
    id: 'evc_plus',
    name: { ar: 'EVC Plus (Hormuud)', en: 'EVC Plus', so: 'EVC Plus' },
    category: 'mobile_money',
    integrationStatus: 'MANUAL_MOBILE_TRANSFER',
    description: {
      ar: 'تحويل يدوي عبر رقم التاجر المعتمد. يتم التحقق من رقم العملية يدوياً قبل الشحن.',
      en: 'Manual transfer to verified merchant number. Transaction ID is manually confirmed before dispatch.',
      so: 'Wareejin toos ah lambarka ganacsadaha. Waxaa lagu xaqiijiyaa lambarka wareejinta.'
    },
    requiresManualVerification: true,
    supportedCurrencies: ['USD']
  },
  zaad: {
    id: 'zaad',
    name: { ar: 'Zaad Service (Telesom)', en: 'Zaad Service', so: 'Adeegga Zaad' },
    category: 'mobile_money',
    integrationStatus: 'MANUAL_MOBILE_TRANSFER',
    description: {
      ar: 'دفع عبر خدمة زاد للهاتف المحمول بتحويل مباشر لرقم التاجر.',
      en: 'Payment via Zaad mobile service by direct transfer to merchant number.',
      so: 'Lacag bixin adeege Zaad oo toos loogu diro lambarka ganacsadaha.'
    },
    requiresManualVerification: true,
    supportedCurrencies: ['USD']
  },
  sahall: {
    id: 'sahall',
    name: { ar: 'Sahal (Golis)', en: 'Sahal Service', so: 'Adeegga Sahal' },
    category: 'mobile_money',
    integrationStatus: 'MANUAL_MOBILE_TRANSFER',
    description: {
      ar: 'دفع عبر محفظة سهل للهاتف المحمول بتحويل مباشر لرقم التاجر.',
      en: 'Payment via Sahal mobile wallet by direct transfer to merchant number.',
      so: 'Lacag bixin jeebka Sahal oo toos loogu diro lambarka ganacsadaha.'
    },
    requiresManualVerification: true,
    supportedCurrencies: ['USD']
  },
  card: {
    id: 'card',
    name: { ar: 'البطاقة المصرفية (Visa / MasterCard)', en: 'Credit / Debit Card', so: 'Kaarka Bangiga' },
    category: 'card',
    integrationStatus: 'MOCK_UI_ONLY',
    description: {
      ar: 'واجهة تجريبية — بانتظار تفعيل بوابة دفع بنكية معتمدة (مثل Stripe أو بنك محلي).',
      en: 'Demo UI — Awaiting official PCI-compliant payment gateway credentials.',
      so: 'Muuqaal tijaabo ah — Waxaa la sugayaa furaha rasmiga ah ee bangiga.'
    },
    requiresManualVerification: true,
    supportedCurrencies: ['USD']
  }
};

export interface PaymentIntentResult {
  paymentId: string;
  orderId: string;
  amount: number;
  currency: string;
  method: PaymentMethodType;
  status: PaymentStatus;
  integrationClassification: PaymentIntegrationStatus;
  instructions?: string;
  requiresClientRedirect: boolean;
}

/**
 * Clean PaymentProvider abstraction interface for external gateway integration
 */
export interface PaymentProvider {
  createPayment(orderId: string, amount: number, currency: string): Promise<PaymentIntentResult>;
  verifyPayment(paymentId: string): Promise<{ isPaid: boolean; rawDetails?: unknown }>;
  refundPayment(paymentId: string, amount?: number): Promise<{ success: boolean }>;
}

const SUBMISSIONS_COLLECTION = 'paymentSubmissions';

export const paymentService = {
  getAvailableMethods(): PaymentMethodConfig[] {
    return Object.values(PAYMENT_METHODS);
  },

  getMethodConfig(method: PaymentMethodType): PaymentMethodConfig {
    return PAYMENT_METHODS[method] || PAYMENT_METHODS.cash_on_delivery;
  },

  /**
   * Authoritative payment processing abstraction.
   * Client-side NEVER sets paymentStatus = 'paid' directly for electronic gateways.
   */
  async initializePayment(orderId: string, amount: number, method: PaymentMethodType): Promise<PaymentIntentResult> {
    const config = PAYMENT_METHODS[method];
    const paymentId = `pay_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    if (config.integrationStatus === 'MANUAL_ON_DELIVERY') {
      return {
        paymentId,
        orderId,
        amount,
        currency: 'USD',
        method,
        status: 'pending',
        integrationClassification: config.integrationStatus,
        instructions: 'سيدفع العميل نقداً عند الاستلام لمندوب التوصيل.',
        requiresClientRedirect: false,
      };
    }

    if (config.integrationStatus === 'MANUAL_MOBILE_TRANSFER') {
      return {
        paymentId,
        orderId,
        amount,
        currency: 'USD',
        method,
        status: 'pending',
        integrationClassification: config.integrationStatus,
        instructions: 'يرجى تحويل المبلغ لرقم الحساب التجاري المرفق وتأكيد رقم الحوالة.',
        requiresClientRedirect: false,
      };
    }

    // MOCK_UI_ONLY (Card)
    return {
      paymentId,
      orderId,
      amount,
      currency: 'USD',
      method,
      status: 'pending',
      integrationClassification: 'MOCK_UI_ONLY',
      instructions: 'معاملة تجريبية — لا توجد بوابة دفع بنكية متصلة حالياً.',
      requiresClientRedirect: false,
    };
  },

  /**
   * Phase 21: Customer submits mobile money reference via Trusted Backend Gateway (/api/payments/submit-reference)
   * The server derives customerId from verified Firebase ID token and executes an atomic Admin SDK transaction.
   */
  async submitPaymentReference(params: {
    orderId: string;
    customerId?: string;
    method: 'evc_plus' | 'zaad' | 'sahall';
    amount?: number;
    referenceNumber: string;
    senderPhone: string;
    idToken?: string;
  }): Promise<MobilePaymentSubmission> {
    const cleanRef = (params.referenceNumber || '').trim();
    if (!cleanRef || cleanRef.length < 4) {
      throw new Error('رقم الإشعار / المرجع غير صالح. يجب أن يحتوي على 4 خانات على الأقل.');
    }

    // Client-side fail-fast pre-validation (authoritatively re-checked on backend gateway)
    const order = orderService.getOrderById(params.orderId, undefined, 'ADMIN');
    if (!order) {
      throw new Error(`الطلب رقم ${params.orderId} غير موجود (Order not found).`);
    }
    if (params.customerId && order.customerId && order.customerId !== params.customerId) {
      throw new Error('غير مصرح: لا يمكنك تقديم إشعار دفع لطلب لا يخصك (Forbidden / Unauthorized ownership mismatch).');
    }
    if (params.amount !== undefined && Math.abs(order.total - params.amount) > 0.01) {
      throw new Error(`المبلغ المدخل ($${params.amount}) غير متطابق مع إجمالي الطلب ($${order.total}).`);
    }

    let token = params.idToken;
    if (!token && auth?.currentUser) {
      try {
        token = await auth.currentUser.getIdToken();
      } catch (e) {
        console.warn('[PaymentService] Could not get currentUser ID token:', e);
      }
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const baseUrl = typeof window !== 'undefined' ? '' : (process.env.API_BASE_URL || 'http://127.0.0.1:3000');
    const res = await fetch(`${baseUrl}/api/payments/submit-reference`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        orderId: params.orderId,
        method: params.method,
        referenceNumber: cleanRef,
        senderPhone: params.senderPhone,
        ...(params.amount !== undefined ? { amount: params.amount } : {}),
        ...(params.customerId ? { customerId: params.customerId } : {}),
      }),
    });

    const resData = await res.json().catch(() => ({}));
    if (!res.ok || !resData.success || !resData.submission) {
      throw new Error(resData.error || `فشل تقديم إشعار الدفع عبر البوابة الموثوقة (HTTP ${res.status})`);
    }

    const submission: MobilePaymentSubmission = resData.submission;

    // Display-only local cache (Never authoritative; display cache only)
    try {
      if (typeof localStorage !== 'undefined') {
        const stored = localStorage.getItem('marketspace_payment_submissions_v1');
        const list: MobilePaymentSubmission[] = stored ? JSON.parse(stored) : [];
        list.unshift(submission);
        localStorage.setItem('marketspace_payment_submissions_v1', JSON.stringify(list));
      }
    } catch (e) {
      console.warn('Local payment submission cache error', e);
    }

    return submission;
  },

  async getAllSubmissions(currentUserId?: string, isAdmin?: boolean): Promise<MobilePaymentSubmission[]> {
    try {
      let q;
      if (isAdmin) {
        q = collection(db, SUBMISSIONS_COLLECTION);
      } else if (currentUserId) {
        q = query(collection(db, SUBMISSIONS_COLLECTION), where('customerId', '==', currentUserId));
      }

      if (q) {
        const snap = await getDocs(q);
        if (!snap.empty) {
          const list: MobilePaymentSubmission[] = [];
          snap.forEach(d => list.push(d.data() as MobilePaymentSubmission));
          list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          try {
            if (typeof localStorage !== 'undefined') {
              localStorage.setItem('marketspace_payment_submissions_v1', JSON.stringify(list));
            }
          } catch {}
          return list;
        }
      }
    } catch (err) {
      console.warn('Could not fetch cloud payment submissions:', err);
    }

    try {
      if (typeof localStorage !== 'undefined') {
        const stored = localStorage.getItem('marketspace_payment_submissions_v1');
        if (stored) {
          return JSON.parse(stored);
        }
      }
    } catch {}

    // Seed baseline mobile payment submission for preview display
    const seed: MobilePaymentSubmission[] = [
      {
        id: 'sub_seed_01',
        orderId: 'ORD-2025-8819',
        customerId: 'user_customer_01',
        method: 'zaad',
        amount: 85.0,
        referenceNumber: 'ZAAD-4919028',
        senderPhone: '+252 63 4919028',
        status: 'PAYMENT_REFERENCE_SUBMITTED',
        createdAt: new Date(Date.now() - 3600000 * 5).toISOString(),
      },
      {
        id: 'sub_seed_02',
        orderId: 'ORD-2025-7120',
        customerId: 'user_customer_02',
        method: 'evc_plus',
        amount: 42.5,
        referenceNumber: 'EVC-8821034',
        senderPhone: '+252 61 5544332',
        status: 'CONFIRMED',
        createdAt: new Date(Date.now() - 3600000 * 28).toISOString(),
        reviewedBy: 'user_admin_01',
        reviewedAt: new Date(Date.now() - 3600000 * 27).toISOString(),
        notes: 'تم التحقق من استلام المبلغ في الحساب التجاري',
      },
    ];
    return seed;
  },

  /**
   * Phase 21: Only platform Admin can verify and mark CONFIRMED or REJECTED.
   * Authoritatively processed via Trusted Backend Gateway (/api/payments/review).
   * Runs in an atomic Firestore transaction via Admin SDK.
   */
  async reviewPaymentSubmission(
    submissionId: string,
    decision: 'CONFIRMED' | 'REJECTED',
    adminUserId?: string,
    userRole?: string,
    notes?: string,
    idToken?: string
  ): Promise<boolean> {
    let token = idToken;
    if (!token && auth?.currentUser) {
      try {
        token = await auth.currentUser.getIdToken();
      } catch (e) {
        console.warn('[PaymentService] Could not get currentUser ID token:', e);
      }
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const baseUrl = typeof window !== 'undefined' ? '' : (process.env.API_BASE_URL || 'http://127.0.0.1:3000');
    const res = await fetch(`${baseUrl}/api/payments/review`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        submissionId,
        decision,
        notes,
      }),
    });

    const resData = await res.json().catch(() => ({}));
    if (!res.ok || !resData.success) {
      // Fail-closed: Never update local state or mark confirmed on server failure
      throw new Error(resData.error || `فشل اعتماد إشعار الدفع عبر البوابة الموثوقة (HTTP ${res.status})`);
    }

    // Update display cache ONLY AFTER server authoritative transaction succeeds
    try {
      if (typeof localStorage !== 'undefined') {
        const stored = localStorage.getItem('marketspace_payment_submissions_v1');
        if (stored) {
          const list: MobilePaymentSubmission[] = JSON.parse(stored);
          const idx = list.findIndex(s => s.id === submissionId);
          if (idx !== -1) {
            list[idx].status = decision;
            list[idx].reviewedBy = resData.result?.reviewedBy || adminUserId || '';
            list[idx].reviewedAt = resData.result?.reviewedAt || new Date().toISOString();
            list[idx].notes = notes || '';
            localStorage.setItem('marketspace_payment_submissions_v1', JSON.stringify(list));
          }
        }
      }
    } catch {}

    return true;
  },
};
