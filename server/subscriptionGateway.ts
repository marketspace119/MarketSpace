import crypto from 'crypto';
import { getAdminDb, requireVerifiedPlatformAdmin } from './firebaseAdmin';
import { SellerSubscription, SubscriptionStatus } from '../src/types';

export interface ReviewSubscriptionPayload {
  subscriptionId: string;
  action: 'APPROVE' | 'REJECT' | 'CANCEL';
  notes?: string;
}

export async function processSubscriptionReviewGateway(
  payload: ReviewSubscriptionPayload,
  authHeader?: string
) {
  const caller = await requireVerifiedPlatformAdmin(authHeader);
  const subscriptionId = (payload.subscriptionId || '').trim();
  const action = payload.action;
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
    const subRef = adminDb.collection('subscriptions').doc(subscriptionId);
    const subDoc = await transaction.get(subRef);
    if (!subDoc.exists) {
      const err = new Error(`الاشتراك ${subscriptionId} غير موجود.`);
      (err as any).statusCode = 404;
      throw err;
    }

    const prev = subDoc.data() as SellerSubscription;

    let newStatus: SubscriptionStatus;
    if (action === 'APPROVE') {
      if (prev.status === 'ACTIVE') {
        const err = new Error('الاشتراك نشط بالفعل.');
        (err as any).statusCode = 400;
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
      if (prev.price && prev.price > 0 && !prev.paymentReferenceNumber) {
        const err = new Error('لا يمكن تفعيل اشتراك مدفوع دون إرفاق وتأكيد الرقم المرجعي للتحويل المالي.');
        (err as any).statusCode = 400;
        throw err;
      }

      newStatus = 'ACTIVE';

      // Supersede any existing ACTIVE subscriptions for this seller to prevent overlapping entitlements
      const activeSubsSnap = await adminDb
        .collection('subscriptions')
        .where('sellerId', '==', prev.sellerId)
        .where('status', '==', 'ACTIVE')
        .get();

      if (!activeSubsSnap.empty) {
        for (const docSnap of activeSubsSnap.docs) {
          if (docSnap.id !== subscriptionId) {
            const oldSubRef = docSnap.ref || adminDb.collection('subscriptions').doc(docSnap.id);
            transaction.set(oldSubRef, {
              status: 'EXPIRED',
              supersededBy: subscriptionId,
              updatedAt: now,
            }, { merge: true });
          }
        }
      }
    } else {
      newStatus = 'CANCELLED';
    }

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
