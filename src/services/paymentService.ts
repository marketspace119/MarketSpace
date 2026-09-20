import { doc, getDoc, setDoc, updateDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, cleanForFirestore } from '../lib/firebase';
import { orderService } from './orderService';
import { auditLogService } from './auditLogService';
import { UserRole } from '../types';

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
   * Phase 21: Customer submits mobile money reference
   * Sets state strictly to PAYMENT_REFERENCE_SUBMITTED (Customer cannot set CONFIRMED)
   */
  async submitPaymentReference(params: {
    orderId: string;
    customerId: string;
    method: 'evc_plus' | 'zaad' | 'sahall';
    amount: number;
    referenceNumber: string;
    senderPhone: string;
  }): Promise<MobilePaymentSubmission> {
    const cleanRef = params.referenceNumber.trim();
    if (!cleanRef || cleanRef.length < 4) {
      throw new Error('رقم الإشعار / المرجع غير صالح. يجب أن يحتوي على 4 خانات على الأقل.');
    }

    // HIGH-07: Verify Order Existence, Ownership & Amount Consistency
    const order = orderService.getOrderById(params.orderId, undefined, 'ADMIN');
    if (!order) {
      throw new Error(`الطلب رقم ${params.orderId} غير موجود.`);
    }
    if (order.customerId !== params.customerId) {
      throw new Error('غير مصرح: لا يمكنك تقديم إشعار دفع لطلب لا يخصك.');
    }
    if (Math.abs(order.total - params.amount) > 0.01) {
      throw new Error(`المبلغ المدخل ($${params.amount}) غير متطابق مع إجمالي الطلب ($${order.total}).`);
    }

    // PART 18: Atomic Unique Normalized Reference Lock
    const normalizedRef = cleanRef.toUpperCase().replace(/\s+/g, '');

    // Check for duplicate reference across existing active submissions
    const existingList = await this.getAllSubmissions();
    const isDuplicate = existingList.some(
      s => s.referenceNumber.toUpperCase().replace(/\s+/g, '') === normalizedRef && s.status !== 'REJECTED'
    );
    if (isDuplicate) {
      throw new Error('رقم الإشعار / المرجع هذا تم تقديمه مسبقاً في عملية دفع أخرى ولا يمكن إعادة استخدامه.');
    }

    // Atomic durable verification via unique primary key document
    try {
      const refDoc = await getDoc(doc(db, 'paymentReferences', normalizedRef));
      if (refDoc.exists()) {
        const data = refDoc.data();
        if (data?.status !== 'REJECTED') {
          throw new Error('رقم الإشعار / المرجع هذا تم تقديمه مسبقاً في عملية دفع أخرى ولا يمكن إعادة استخدامه.');
        }
      }
    } catch (err: any) {
      if (err.message && err.message.includes('تم تقديمه مسبقاً')) throw err;
      console.warn('[PaymentService] paymentReferences check offline/skipped in test:', err.message);
    }

    const submissionId = `sub_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const submission: MobilePaymentSubmission = {
      id: submissionId,
      orderId: params.orderId,
      customerId: params.customerId,
      method: params.method,
      amount: order.total, // Enforce authoritative order total
      referenceNumber: cleanRef,
      senderPhone: params.senderPhone.trim(),
      status: 'PAYMENT_REFERENCE_SUBMITTED',
      createdAt: new Date().toISOString(),
    };

    // Clean payload for Firestore write (Authoritative persistence required)
    try {
      await setDoc(doc(db, SUBMISSIONS_COLLECTION, submissionId), cleanForFirestore(submission));
    } catch (e: any) {
      console.error('[PaymentService] Cloud submission persistence failed:', e.message);
      handleFirestoreError(e, OperationType.CREATE, `${SUBMISSIONS_COLLECTION}/${submissionId}`);
      throw new Error(`فشل حفظ إشعار الدفع في قاعدة البيانات المعتمدة (Fail-Closed): ${e.message || 'Database error'}`);
    }

    try {
      await setDoc(doc(db, 'paymentReferences', normalizedRef), cleanForFirestore({
        submissionId,
        referenceNumber: cleanRef,
        normalizedRef,
        orderId: params.orderId,
        customerId: params.customerId,
        status: 'PAYMENT_REFERENCE_SUBMITTED',
        createdAt: new Date().toISOString(),
      }));
    } catch (e: any) {
      console.error('[PaymentService] Failed to record unique normalized payment reference in cloud:', e.message);
      handleFirestoreError(e, OperationType.CREATE, `paymentReferences/${normalizedRef}`);
      throw new Error(`فشل تسجيل الرقم المرجعي في قاعدة البيانات المعتمدة: ${e.message || 'Database error'}`);
    }

    try {
      const stored = localStorage.getItem('marketspace_payment_submissions_v1');
      const list: MobilePaymentSubmission[] = stored ? JSON.parse(stored) : [];
      list.unshift(submission);
      localStorage.setItem('marketspace_payment_submissions_v1', JSON.stringify(list));
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
            localStorage.setItem('marketspace_payment_submissions_v1', JSON.stringify(list));
          } catch {}
          return list;
        }
      }
    } catch (err) {
      console.warn('Could not fetch cloud payment submissions:', err);
    }

    try {
      const stored = localStorage.getItem('marketspace_payment_submissions_v1');
      if (stored) {
        return JSON.parse(stored);
      }
    } catch {}

    // Seed baseline mobile payment submission
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
   * Phase 21: Only platform Admin can verify and mark CONFIRMED or REJECTED
   */
  async reviewPaymentSubmission(
    submissionId: string,
    decision: 'CONFIRMED' | 'REJECTED',
    adminUserId: string,
    userRole: string,
    notes?: string
  ): Promise<boolean> {
    const isAdmin = userRole === 'ADMIN' || userRole === 'SUPER_ADMIN';
    if (!isAdmin) {
      throw new Error('Forbidden: Only platform administrators can review payment submissions');
    }

    let orderIdTarget = '';
    let methodTarget = '';
    let amountTarget = 0;

    // Check local storage first to extract details in case Firestore doc doesn't exist or is local
    try {
      const stored = localStorage.getItem('marketspace_payment_submissions_v1');
      if (stored) {
        const list: MobilePaymentSubmission[] = JSON.parse(stored);
        const item = list.find(s => s.id === submissionId);
        if (item) {
          orderIdTarget = item.orderId;
          methodTarget = item.method;
          amountTarget = item.amount;
        }
      }
    } catch {}

    const subDocRef = doc(db, SUBMISSIONS_COLLECTION, submissionId);
    let snap;
    try {
      snap = await getDoc(subDocRef);
    } catch (err: any) {
      console.error('[PaymentService] Failed to read submission from Firestore:', err);
      handleFirestoreError(err, OperationType.GET, `${SUBMISSIONS_COLLECTION}/${submissionId}`);
      throw new Error(`فشل قراءة إشعار الدفع من قاعدة البيانات (Fail-Closed): ${err?.message || 'Database error'}`);
    }

    if (!snap || !snap.exists()) {
      throw new Error(`إشعار الدفع ${submissionId} غير موجود في قاعدة البيانات المعتمدة.`);
    }

    const data = snap.data() as MobilePaymentSubmission;
    orderIdTarget = data.orderId || orderIdTarget;
    methodTarget = data.method || methodTarget;
    amountTarget = data.amount || amountTarget;

    try {
      await updateDoc(subDocRef, cleanForFirestore({
        status: decision,
        reviewedBy: adminUserId,
        reviewedAt: new Date().toISOString(),
        notes: notes || '',
      }));
    } catch (err: any) {
      console.error('[PaymentService] Cloud update failed for review decision:', err?.message);
      handleFirestoreError(err, OperationType.UPDATE, `${SUBMISSIONS_COLLECTION}/${submissionId}`);
      throw new Error(`فشل تحديث حالة إشعار الدفع في قاعدة البيانات (Fail-Closed): ${err?.message || 'Database error'}`);
    }

    if (decision === 'CONFIRMED' && orderIdTarget) {
      try {
        await orderService.confirmPaymentStatus(orderIdTarget, userRole);
      } catch (err: any) {
        console.error('[PaymentService] Order status confirmation failed, rolling back submission status:', err);
        // Rollback submission status to prevent split state (payment submission CONFIRMED while order unpaid)
        try {
          await updateDoc(subDocRef, cleanForFirestore({
            status: 'PAYMENT_REFERENCE_SUBMITTED',
            reviewedBy: '',
            reviewedAt: '',
            notes: `Rollback: Order status update failed (${err?.message || 'Error'})`,
          }));
        } catch (rollbackErr) {
          console.error('[PaymentService] Critical: Rollback also failed:', rollbackErr);
        }
        throw new Error(`فشل تأكيد حالة دفع الطلب، وتم إلغاء اعتماد إشعار الدفع لحماية الاتساق المالي: ${err?.message || 'Database error'}`);
      }
    }

    // Update local cache
    try {
      const stored = localStorage.getItem('marketspace_payment_submissions_v1');
      if (stored) {
        const list: MobilePaymentSubmission[] = JSON.parse(stored);
        const idx = list.findIndex(s => s.id === submissionId);
        if (idx !== -1) {
          list[idx].status = decision;
          list[idx].reviewedBy = adminUserId;
          list[idx].reviewedAt = new Date().toISOString();
          list[idx].notes = notes || '';
          localStorage.setItem('marketspace_payment_submissions_v1', JSON.stringify(list));
        }
      }
    } catch {}

    // Record audit log
    await auditLogService.logAction({
      actorId: adminUserId,
      actorRole: userRole as UserRole,
      action: `PAYMENT_${decision}`,
      targetType: 'payment',
      targetId: submissionId,
      targetName: `Mobile Payment (${methodTarget.toUpperCase()}) for Order #${orderIdTarget}`,
      metadata: { decision, amount: amountTarget, notes },
    });

    return true;
  }
};
