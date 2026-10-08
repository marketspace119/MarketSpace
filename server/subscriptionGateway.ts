import crypto from 'crypto';
import { getAdminDb, requireVerifiedPlatformAdmin } from './firebaseAdmin';
import { SellerSubscription, SubscriptionStatus } from '../src/types';

export interface ReviewSubscriptionPayload {
  subscriptionId: string;
  action?: 'APPROVE' | 'REJECT' | 'CANCEL';
  decision?: 'APPROVE' | 'APPROVED' | 'REJECT' | 'REJECTED' | 'CANCEL' | 'CANCELLED';
  notes?: string;
}

export async function processSubscriptionReviewGateway(
  payload: ReviewSubscriptionPayload,
  authHeader?: string
) {
  const caller = await requireVerifiedPlatformAdmin(authHeader);
  const subscriptionId = (payload.subscriptionId || '').trim();
  const rawAction = String(payload.action || payload.decision || '').toUpperCase();
  const action =
    rawAction === 'APPROVED'
      ? 'APPROVE'
      : rawAction === 'REJECTED'
      ? 'REJECT'
      : rawAction === 'CANCELLED'
      ? 'CANCEL'
      : (rawAction as 'APPROVE' | 'REJECT' | 'CANCEL');
  const notes = payload.notes?.trim();

  if (!subscriptionId) {
    const err = new Error('رقم الاشتراك مطلوب.');
    (err as any).statusCode = 400;
    throw err;
  }

  const validActions = ['APPROVE', 'REJECT', 'CANCEL'];
  if (!validActions.includes(action)) {
    const err = new Error(`إجراء الاشتراك غير صالح: ${action}`);
    (err as any).statusCode = 400;
    throw err;
  }

  const adminDb = getAdminDb();
  const now = new Date().toISOString();

  const result = await adminDb.runTransaction(async (transaction) => {
    let subRef = adminDb.collection('subscriptions').doc(subscriptionId);
    let subDoc = await transaction.get(subRef);
    if (!subDoc.exists) {
      const aliasRef = adminDb.collection('sellerSubscriptions').doc(subscriptionId);
      const aliasDoc = await transaction.get(aliasRef);
      if (aliasDoc.exists) {
        subRef = aliasRef;
        subDoc = aliasDoc;
      }
    }
    if (!subDoc.exists) {
      const err = new Error(`الاشتراك ${subscriptionId} غير موجود.`);
      (err as any).statusCode = 404;
      throw err;
    }

    const prev = subDoc.data() as SellerSubscription;

    // Acquire per-seller subscription lock inside transaction to serialize concurrent approvals
    const subLockRef = adminDb.collection('seller_subscription_locks').doc(prev.sellerId || 'unknown_seller');
    await transaction.get(subLockRef);

    // F-07 & F-28: Terminal state protection — EXPIRED, CANCELLED, or REJECTED subscriptions cannot be reopened
    if (['EXPIRED', 'CANCELLED', 'REJECTED'].includes(prev.status)) {
      const err = new Error(`Terminal subscription state violation: Cannot modify subscription in terminal state ${prev.status}`);
      (err as any).statusCode = 409;
      throw err;
    }

    let newStatus: SubscriptionStatus;
    const docsToSupersede: FirebaseFirestore.DocumentReference[] = [];
    if (action === 'APPROVE') {
      if (prev.status === 'ACTIVE') {
        const err = new Error('الاشتراك نشط بالفعل.');
        (err as any).statusCode = 409;
        throw err;
      }

      // P1-18: Verify catalog plan definition and payment reference
      if (prev.planId) {
        const planRef = adminDb.collection('sellerPlans').doc(prev.planId);
        const planDoc = await transaction.get(planRef);
        if (planDoc.exists) {
          const planData = planDoc.data();
          if (typeof planData?.price === 'number' && typeof prev.price === 'number' && planData.price !== prev.price) {
            const err = new Error('خطأ في تسعير الاشتراك: السعر المطلوب لا يتطابق مع تسعيرة الخطة المعتمدة في النظام.');
            (err as any).statusCode = 400;
            throw err;
          }
        }
      }

      // Require verified payment proof if subscription has a non-zero price
      const refNum = prev.paymentReferenceNumber || prev.paymentReference;
      if (prev.price && prev.price > 0 && !refNum) {
        const err = new Error('لا يمكن تفعيل اشتراك مدفوع دون إرفاق وتأكيد الرقم المرجعي للتحويل المالي.');
        (err as any).statusCode = 400;
        throw err;
      }

      newStatus = 'ACTIVE';

      // Supersede any existing ACTIVE/active subscriptions for this seller in both collections (all reads before writes)
      for (const colName of ['subscriptions', 'sellerSubscriptions']) {
        const colObj = adminDb.collection(colName) as any;
        if (colObj && typeof colObj.where === 'function') {
          const sellerSubsSnap = await colObj.where('sellerId', '==', prev.sellerId).get();
          if (sellerSubsSnap && !sellerSubsSnap.empty && Array.isArray(sellerSubsSnap.docs)) {
            for (const docSnap of sellerSubsSnap.docs) {
              const sData = typeof docSnap.data === 'function' ? docSnap.data() : docSnap;
              const st = String(sData?.status || '').toUpperCase();
              if (docSnap.id !== subscriptionId && st === 'ACTIVE') {
                docsToSupersede.push(docSnap.ref || adminDb.collection(colName).doc(docSnap.id));
              }
            }
          }
        }
      }
    } else {
      newStatus = 'CANCELLED';
    }

    for (const oldSubRef of docsToSupersede) {
      transaction.set(oldSubRef, {
        status: 'EXPIRED',
        supersededBy: subscriptionId,
        updatedAt: now,
      }, { merge: true });
    }

    transaction.set(subLockRef, {
      sellerId: prev.sellerId,
      activeSubscriptionId: action === 'APPROVE' ? subscriptionId : null,
      lastAction: action,
      updatedAt: now,
    }, { merge: true });

    const updated: Partial<SellerSubscription> = {
      ...prev,
      status: newStatus,
      updatedAt: now,
      notes: notes || prev.notes || '',
    };

    if (action === 'APPROVE') {
      updated.approvedBy = caller.uid;
      updated.approvedAt = now;
      updated.startDate = now;
      updated.endDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    }

    transaction.set(subRef, updated, { merge: true });

    // Synchronize seller store plan entitlement
    if (prev.storeId) {
      const storeRef = adminDb.collection('stores').doc(prev.storeId);
      if (action === 'APPROVE') {
        transaction.set(storeRef, {
          currentPlanId: prev.planId || subscriptionId,
          currentPlanTier: prev.planTier,
          updatedAt: now,
        }, { merge: true });
      } else if (action === 'CANCEL') {
        transaction.set(storeRef, {
          currentPlanTier: 'free',
          updatedAt: now,
        }, { merge: true });
      }
    }

    // Server-Authoritative Audit Log
    const auditLogRef = adminDb.collection('audit_logs').doc(`audit_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`);
    transaction.set(auditLogRef, {
      id: auditLogRef.id,
      actorId: caller.uid,
      actorRole: caller.isSuperAdmin ? 'SUPER_ADMIN' : 'ADMIN',
      actorEmail: caller.email,
      action: `SUBSCRIPTION_${action}`,
      targetType: 'subscription',
      targetId: subscriptionId,
      targetName: `Plan ${prev.planTier} for Seller ${prev.sellerId}`,
      timestamp: now,
      metadata: { price: prev.price, tier: prev.planTier, notes },
    });

    return updated as SellerSubscription;
  });

  return { success: true, subscription: result };
}
