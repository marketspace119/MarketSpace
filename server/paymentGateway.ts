import { getAdminDb, requireAuthenticatedCaller, requireVerifiedPlatformAdmin, requireVerifiedSuperAdmin } from './firebaseAdmin';

export interface SubmitPaymentReferencePayload {
  orderId: string;
  method: 'evc_plus' | 'zaad' | 'sahall';
  amount?: number;
  referenceNumber: string;
  senderPhone: string;
  customerId?: string;
  paymentStatus?: string;
}

export interface ReviewPaymentSubmissionPayload {
  submissionId?: string;
  orderId?: string;
  decision: 'CONFIRMED' | 'REJECTED';
  notes?: string;
  action?: string;
  forceOverride?: boolean;
  superAdminAction?: boolean;
}

// In-flight mutex for concurrency control across concurrent same-reference submissions
const inFlightPaymentReferences = new Set<string>();

/**
 * Server-authoritative, atomic payment reference submission gateway.
 * Enforces uniqueness via primary key document `paymentReferences/{normalizedReference}`
 * inside an atomic Firestore transaction.
 */
export async function processPaymentReferenceSubmissionGateway(
  payload: SubmitPaymentReferencePayload,
  authHeader?: string
) {
  const caller = await requireAuthenticatedCaller(authHeader);

  const cleanRef = (payload.referenceNumber || '').trim();
  if (!cleanRef || cleanRef.length < 4) {
    const err = new Error('رقم الإشعار / المرجع غير صالح. يجب أن يحتوي على 4 خانات على الأقل.');
    (err as any).statusCode = 400;
    throw err;
  }

  const normalizedRef = cleanRef.toUpperCase().replace(/\s+/g, '');
  const orderId = (payload.orderId || '').trim();
  if (!orderId) {
    const err = new Error('رقم الطلب مطلوب لإرسال إشعار الدفع.');
    (err as any).statusCode = 400;
    throw err;
  }

  // Evidence validation: Reject non-positive or malformed amount inputs
  if (payload.amount !== undefined) {
    const num = Number(payload.amount);
    if (isNaN(num) || num <= 0) {
      const err = new Error('المبلغ المدخل غير صالح. يجب أن يكون قيمة رقمية موجبة.');
      (err as any).statusCode = 400;
      throw err;
    }
  }

  // Anti-Spoofing: If client attempts to send an altered customerId, strictly verify against token UID
  if (payload.customerId && payload.customerId !== caller.uid && !caller.isPlatformAdmin) {
    const err = new Error('غير مصرح: لا يمكنك تقديم إشعار دفع لطلب لا يخصك (Anti-Spoofing)');
    (err as any).statusCode = 403;
    throw err;
  }

  // Concurrency check: Reject concurrent requests attempting the exact same reference
  if (inFlightPaymentReferences.has(normalizedRef)) {
    const err = new Error(`رقم الإشعار / المرجع '${cleanRef}' قيد المعالجة حالياً.`);
    (err as any).statusCode = 409;
    throw err;
  }
  inFlightPaymentReferences.add(normalizedRef);

  const adminDb = getAdminDb();
  const now = new Date().toISOString();
  const submissionId = `sub_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

  const refDocRef = adminDb.collection('paymentReferences').doc(normalizedRef);
  const orderDocRef = adminDb.collection('orders').doc(orderId);
  const subDocRef = adminDb.collection('paymentSubmissions').doc(submissionId);

  try {
    const submission = await adminDb.runTransaction(async (transaction) => {
      // 1. Read: Anti-replay uniqueness check on primary key document
      const refDoc = await transaction.get(refDocRef);
      if (refDoc.exists) {
        const refData = refDoc.data();
        if (refData?.status !== 'REJECTED') {
          const err = new Error(`رقم الإشعار / المرجع '${cleanRef}' تم تقديمه مسبقاً في عملية دفع أخرى ولا يمكن إعادة استخدامه.`);
          (err as any).statusCode = 409;
          throw err;
        }
      }

      // 2. Read: Authoritative order verification (ownership & amount match)
      const orderDoc = await transaction.get(orderDocRef);
      if (!orderDoc.exists) {
        const err = new Error(`الطلب رقم ${orderId} غير موجود.`);
        (err as any).statusCode = 404;
        throw err;
      }

      const orderData = orderDoc.data() || {};
      if (orderData.customerId !== caller.uid && !caller.isPlatformAdmin) {
        const err = new Error('غير مصرح: لا يمكنك تقديم إشعار دفع لطلب لا يخصك.');
        (err as any).statusCode = 403;
        throw err;
      }

      // Replay prevention: Order already paid
      if (orderData.paymentStatus === 'paid') {
        const err = new Error('الطلب مدفوع مسبقاً ولا يمكن تقديم إشعار دفع جديد له.');
        (err as any).statusCode = 409;
        throw err;
      }

      // Enforce authoritative order amount if client supplied an altered amount
      if (payload.amount !== undefined && Number(payload.amount) > 0) {
        if (Math.abs(orderData.total - Number(payload.amount)) > 0.01) {
          const err = new Error(`المبلغ المدخل ($${payload.amount}) غير متطابق مع إجمالي الطلب المعتمد ($${orderData.total}).`);
          (err as any).statusCode = 400;
          throw err;
        }
      }

      // 3. Write: Create unique reservation
      transaction.set(refDocRef, {
        normalizedRef,
        referenceNumber: cleanRef,
        orderId,
        customerId: caller.uid, // Authoritative UID derived strictly from token
        amount: orderData.total, // Authoritative amount derived strictly from order
        method: payload.method,
        senderPhone: payload.senderPhone || '',
        status: 'PENDING',
        createdAt: now,
        updatedAt: now,
      });

      // 4. Write: Create authoritative submission document
      // Strictly ignore any client-provided paymentStatus
      const subRecord = {
        id: submissionId,
        orderId,
        customerId: caller.uid, // Authoritative UID
        method: payload.method,
        amount: orderData.total, // Authoritative total
        referenceNumber: cleanRef,
        senderPhone: payload.senderPhone || '',
        status: 'PAYMENT_REFERENCE_SUBMITTED', // Customer cannot set CONFIRMED
        createdAt: now,
      };

      transaction.set(subDocRef, subRecord);
      return subRecord;
    });

    console.log(`[PaymentGateway:AdminSDK] Payment reference ${normalizedRef} registered atomically for order ${orderId}`);
    return { success: true, submission };
  } finally {
    inFlightPaymentReferences.delete(normalizedRef);
  }
}

/**
 * Server-authoritative, atomic payment review gateway.
 * Confirms or rejects a payment submission and atomically updates the order payment status,
 * ensuring no split-state, no unverified orderId bypass, and strict verification.
 */
export async function processPaymentReviewGateway(
  payload: ReviewPaymentSubmissionPayload,
  authHeader?: string
) {
  const caller = await requireVerifiedPlatformAdmin(authHeader);

  const { submissionId, orderId: directOrderId, decision, notes, action, forceOverride, superAdminAction } = payload;

  if (decision !== 'CONFIRMED' && decision !== 'REJECTED') {
    const err = new Error('Invalid decision. Must be CONFIRMED or REJECTED.');
    (err as any).statusCode = 400;
    throw err;
  }

  // HIGH-02: Prevent confirming payment merely by knowing orderId without proof or authorized settlement
  if (!submissionId && !action) {
    const err = new Error('لا يمكن تأكيد الدفع بمجرد إرسال رقم الطلب دون إشعار دفع موثق (submissionId) أو تحديد مسار التسوية المعتمد (COD_SETTLEMENT أو SUPER_ADMIN_OVERRIDE).');
    (err as any).statusCode = 400;
    throw err;
  }

  // Super Admin Enforcement: Actions flagged as SUPER_ADMIN_OVERRIDE or forceOverride require Super Admin
  const requiresSuperAdmin =
    action === 'SUPER_ADMIN_OVERRIDE' ||
    forceOverride === true ||
    superAdminAction === true;

  if (requiresSuperAdmin && !caller.isSuperAdmin) {
    const err = new Error('Forbidden: Super Administrator privileges required for exceptional manual payment override');
    (err as any).statusCode = 403;
    throw err;
  }

  if (requiresSuperAdmin && (!notes || notes.trim().length < 8)) {
    const err = new Error('يجب كتابة سبب واضح وتفصيلي (8 أحرف على الأقل) للموافقة الاستثنائية من مدير النظام.');
    (err as any).statusCode = 400;
    throw err;
  }

  const adminDb = getAdminDb();
  const now = new Date().toISOString();

  const result = await adminDb.runTransaction(async (transaction) => {
    let targetOrderId = directOrderId || '';
    let cleanRef = '';
    let normalizedRef = '';
    let amount = 0;
    let subDocRef: FirebaseFirestore.DocumentReference | null = null;
    let subData: any = null;

    if (submissionId) {
      subDocRef = adminDb.collection('paymentSubmissions').doc(submissionId);
      const subDoc = await transaction.get(subDocRef);
      if (!subDoc.exists) {
        const err = new Error(`إشعار الدفع ${submissionId} غير موجود.`);
        (err as any).statusCode = 404;
        throw err;
      }

      subData = subDoc.data() || {};
      if (directOrderId && subData.orderId !== directOrderId) {
        const err = new Error(`رقم الطلب في الطلب (${directOrderId}) لا يطابق رقم الطلب في إشعار الدفع (${subData.orderId}).`);
        (err as any).statusCode = 400;
        throw err;
      }

      targetOrderId = subData.orderId;
      cleanRef = subData.referenceNumber || '';
      normalizedRef = cleanRef.toUpperCase().replace(/\s+/g, '');
      amount = subData.amount || 0;

      // Replay prevention: Already confirmed submission
      if (subData.status === 'CONFIRMED' && !caller.isSuperAdmin) {
        const err = new Error(`إشعار الدفع ${submissionId} تم اعتماده وتأكيده مسبقاً ولا يمكن تكرار تأكيده.`);
        (err as any).statusCode = 409;
        throw err;
      }
    } else if (action === 'COD_SETTLEMENT') {
      if (!targetOrderId) {
        const err = new Error('رقم الطلب مطلوب لتسوية الدفع عند الاستلام.');
        (err as any).statusCode = 400;
        throw err;
      }
    } else if (requiresSuperAdmin) {
      if (!targetOrderId) {
        const err = new Error('رقم الطلب مطلوب لتنفيذ التجاوز الإداري الاستثنائي.');
        (err as any).statusCode = 400;
        throw err;
      }
    } else {
      const err = new Error('إجراء تأكيد الدفع غير صالح.');
      (err as any).statusCode = 400;
      throw err;
    }

    // Read: Target Order document
    const orderDocRef = adminDb.collection('orders').doc(targetOrderId);
    const orderDoc = await transaction.get(orderDocRef);
    if (!orderDoc.exists) {
      const err = new Error(`الطلب المرتبط ${targetOrderId} غير موجود.`);
      (err as any).statusCode = 404;
      throw err;
    }

    const orderData = orderDoc.data() || {};

    // Invariant: Cancelled order cannot be confirmed for payment
    if (orderData.status === 'cancelled') {
      const err = new Error(`لا يمكن تأكيد الدفع لطلب ملغي (${targetOrderId}).`);
      (err as any).statusCode = 400;
      throw err;
    }

    // Invariant: Already paid/settled order cannot be re-confirmed
    if (decision === 'CONFIRMED' && orderData.paymentStatus === 'paid') {
      const err = new Error(`الطلب ${targetOrderId} مدفوع مسبقاً ومسوى بالفعل ولا يمكن إعادة تأكيده.`);
      (err as any).statusCode = 409;
      throw err;
    }

    // Invariant: If submissionId was supplied, verify customer, amount, currency, and reference
    if (subData) {
      if (subData.customerId && orderData.customerId && subData.customerId !== orderData.customerId) {
        const err = new Error(`معرف العميل في إشعار الدفع لا يطابق صاحب الطلب.`);
        (err as any).statusCode = 403;
        throw err;
      }

      const subAmount = Number(subData.amount);
      const orderTotal = Number(orderData.total);
      if (isNaN(subAmount) || Math.abs(subAmount - orderTotal) > 0.01) {
        const err = new Error(`مبلغ إشعار الدفع ($${subAmount}) غير مطابق لإجمالي الطلب المعتمد ($${orderTotal}).`);
        (err as any).statusCode = 400;
        throw err;
      }

      if (subData.currency && orderData.currency && subData.currency.toUpperCase() !== orderData.currency.toUpperCase()) {
        const err = new Error(`عملة إشعار الدفع (${subData.currency}) لا تطابق عملة الطلب (${orderData.currency}).`);
        (err as any).statusCode = 400;
        throw err;
      }
    }

    // Invariant: If COD_SETTLEMENT, verify paymentMethod is cash_on_delivery
    if (action === 'COD_SETTLEMENT') {
      const method = (orderData.paymentMethod || '').toLowerCase();
      if (method !== 'cash_on_delivery' && method !== 'cod') {
        const err = new Error(`طريقة دفع الطلب هي (${orderData.paymentMethod}) وتتطلب إشعار دفع إلكتروني موثق وليس تسوية عند الاستلام.`);
        (err as any).statusCode = 400;
        throw err;
      }
    }

    amount = amount || orderData.total || 0;

    let refDocRef: FirebaseFirestore.DocumentReference | null = null;
    let refDoc: FirebaseFirestore.DocumentSnapshot | null = null;
    if (normalizedRef) {
      refDocRef = adminDb.collection('paymentReferences').doc(normalizedRef);
      refDoc = await transaction.get(refDocRef);
      if (refDoc.exists) {
        const refData = refDoc.data() || {};
        if (refData.orderId && refData.orderId !== targetOrderId) {
          const err = new Error(`رقم المرجع (${cleanRef}) مرتبط بطلب آخر (${refData.orderId}).`);
          (err as any).statusCode = 409;
          throw err;
        }
        if (refData.status === 'CONFIRMED' && !caller.isSuperAdmin) {
          const err = new Error(`رقم المرجع (${cleanRef}) تم اعتماده وتأكيده مسبقاً.`);
          (err as any).statusCode = 409;
          throw err;
        }
      }
    }

    // Capture before state for authoritative audit trail
    const beforeState = {
      orderPaymentStatus: orderData.paymentStatus,
      orderStatus: orderData.status,
      submissionStatus: subData?.status || null,
      referenceStatus: refDoc?.exists ? (refDoc.data()?.status || null) : null,
    };

    // Atomic Mutations:
    if (subDocRef) {
      transaction.update(subDocRef, {
        status: decision,
        reviewedBy: caller.uid,
        reviewedAt: now,
        notes: notes || '',
      });
    }

    if (decision === 'CONFIRMED') {
      const updatedVendorOrders = Array.isArray(orderData.vendorOrders)
        ? orderData.vendorOrders.map((vo: any) => ({ ...vo, paymentStatus: 'paid' }))
        : orderData.vendorOrders;

      transaction.update(orderDocRef, {
        paymentStatus: 'paid',
        status: orderData.status === 'pending' ? 'confirmed' : orderData.status,
        ...(updatedVendorOrders ? { vendorOrders: updatedVendorOrders } : {}),
        updatedAt: now,
      });

      if (refDocRef && refDoc?.exists) {
        transaction.update(refDocRef, {
          status: 'CONFIRMED',
          updatedAt: now,
        });
      }
    } else {
      // REJECTED
      if (refDocRef && refDoc?.exists) {
        transaction.update(refDocRef, {
          status: 'REJECTED',
          updatedAt: now,
        });
      }
    }

    const afterState = {
      orderPaymentStatus: decision === 'CONFIRMED' ? 'paid' : orderData.paymentStatus,
      orderStatus: decision === 'CONFIRMED' && orderData.status === 'pending' ? 'confirmed' : orderData.status,
      submissionStatus: decision,
      referenceStatus: decision,
    };

    // Authoritative Audit Logging (Derived strictly from verified caller token)
    const auditLogRef = adminDb.collection('audit_logs').doc();
    transaction.set(auditLogRef, {
      id: auditLogRef.id,
      actorId: caller.uid,
      actorRole: caller.isSuperAdmin ? 'SUPER_ADMIN' : 'ADMIN',
      actorEmail: caller.email || '',
      action: decision === 'CONFIRMED'
        ? (action === 'SUPER_ADMIN_OVERRIDE' ? 'SUPER_ADMIN_PAYMENT_OVERRIDE' : (action === 'COD_SETTLEMENT' ? 'COD_PAYMENT_SETTLED' : 'PAYMENT_CONFIRMED'))
        : 'PAYMENT_REJECTED',
      targetType: 'payment',
      targetId: submissionId || targetOrderId,
      targetName: `Payment for Order #${targetOrderId}`,
      resourceType: 'payment',
      resourceId: targetOrderId,
      beforeState,
      afterState,
      reason: notes || action || 'Standard verified review',
      metadata: {
        submissionId: submissionId || null,
        orderId: targetOrderId,
        decision,
        amount,
        referenceNumber: cleanRef,
        notes: notes || '',
        action: action || 'STANDARD_REVIEW',
      },
      timestamp: now,
    });

    return {
      submissionId: submissionId || null,
      orderId: targetOrderId,
      decision,
      reviewedBy: caller.uid,
      reviewedAt: now,
    };
  });

  console.log(`[PaymentGateway:AdminSDK] Payment for order ${result.orderId} reviewed as ${decision} atomically.`);
  return { success: true, result };
}

