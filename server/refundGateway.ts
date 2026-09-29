import crypto from 'crypto';
import { getAdminDb, requireAuthenticatedCaller, isCallerPlatformAdmin } from './firebaseAdmin';
import { RefundRequest } from '../src/types';

export interface CreateRefundGatewayRequest {
  orderId: string;
  subOrderId?: string;
  amount: number;
  reason: RefundRequest['reason'];
  notes?: string;
  idempotencyKey?: string;
}

// In-flight mutex per orderId to prevent race conditions during concurrent requests
const inFlightRefundOrders = new Set<string>();

/**
 * Server-Authoritative Refund Processing Gateway (PART 4)
 * Enforces customer authentication, order ownership, authoritative ceiling calculation,
 * and atomic concurrency locking so parallel requests cannot exceed orderTotal.
 */
export async function processRefundGateway(
  payload: CreateRefundGatewayRequest,
  authHeader?: string
): Promise<{ success: boolean; refund: RefundRequest }> {
  // 1. Authenticate Caller
  if (!authHeader) {
    throw new Error('Authentication required: Bearer token is missing');
  }

  const caller = await requireAuthenticatedCaller(authHeader);
  const callerUid = caller.uid;
  const isPlatformAdmin = caller.isPlatformAdmin;

  // 2. Validate Input
  const { orderId, subOrderId, reason, notes } = payload;
  if (!orderId) {
    throw new Error('Order ID is required');
  }

  const requestedAmount = Number(payload.amount);
  if (isNaN(requestedAmount) || requestedAmount <= 0 || !Number.isFinite(requestedAmount)) {
    throw new Error('Invalid refund amount. Amount must be a positive number greater than zero.');
  }

  const validReasons = ['damaged', 'wrong_item', 'not_delivered', 'quality_issue', 'cancelled_service', 'other'];
  if (!validReasons.includes(reason)) {
    throw new Error(`Invalid refund reason. Must be one of: ${validReasons.join(', ')}`);
  }

  const adminDb = getAdminDb();

  // 3. Concurrency Protection (Prevent parallel race conditions on the same order)
  if (inFlightRefundOrders.has(orderId)) {
    throw new Error('A refund request for this order is currently being processed. Please wait.');
  }
  inFlightRefundOrders.add(orderId);

  let authoritativeSellerId = '';
  let authoritativeStoreId = '';
  const now = new Date().toISOString();

  try {
    // 4. Retrieve Order Authoritatively from Firestore (Strict Fail-Closed)
    const orderRef = adminDb.collection('orders').doc(orderId);
    let orderSnap;
    try {
      orderSnap = await orderRef.get();
    } catch (err: any) {
      console.error(`[RefundGateway:Error] Firestore read failure for order ${orderId}:`, err?.message || err);
      throw new Error(`Database read failure: Unable to retrieve order #${orderId}. Operation aborted (Fail-Closed).`);
    }

    if (!orderSnap || !orderSnap.exists) {
      throw new Error(`Order #${orderId} was not found in the authoritative database`);
    }

    const orderData = orderSnap.data() as any;

    // Strict Ownership Enforcement: Customer can only request refunds for their own order
    if (!isPlatformAdmin && orderData.customerId !== callerUid) {
      throw new Error('Forbidden: You can only request refunds for your own orders');
    }

    // Terminal & Unsettled order status checks (OPEN-10)
    if (orderData.status === 'cancelled') {
      throw new Error('Order is already cancelled');
    }
    if (orderData.paymentStatus !== 'paid') {
      throw new Error('Cannot request a refund for an unpaid order. Payment must be confirmed as paid first.');
    }

    // Resolve Authoritative Entity Context & Max Allowed Ceiling
    let maxAllowedCeiling = Number(orderData.total) || 0;

    // Strict multi-vendor subOrderId allocation check (F-08)
    if (Array.isArray(orderData.vendorOrders) && orderData.vendorOrders.length > 1 && !subOrderId) {
      throw new Error('subOrderId is required when requesting a refund on a multi-vendor order to ensure proper vendor allocation.');
    }

    if (subOrderId && Array.isArray(orderData.vendorOrders) && orderData.vendorOrders.length > 0) {
      const vo = orderData.vendorOrders.find((v: any) => v.subOrderId === subOrderId);
      if (!vo) {
        throw new Error(`Sub-order ${subOrderId} not found in this order`);
      }
      authoritativeSellerId = vo.sellerId;
      authoritativeStoreId = vo.storeId;
      maxAllowedCeiling = Number(vo.subtotal || vo.total) || maxAllowedCeiling;
    } else if (Array.isArray(orderData.vendorOrders) && orderData.vendorOrders.length > 0) {
      authoritativeSellerId = orderData.vendorOrders[0].sellerId || '';
      authoritativeStoreId = orderData.vendorOrders[0].storeId || '';
    } else if (Array.isArray(orderData.sellerIds) && orderData.sellerIds.length > 0) {
      authoritativeSellerId = orderData.sellerIds[0];
      authoritativeStoreId = orderData.vendorStoreIds?.[0] || '';
    }

    // Boundary check against ceiling
    if (requestedAmount > maxAllowedCeiling) {
      throw new Error(`Requested refund amount ($${requestedAmount.toFixed(2)}) exceeds allowable total ($${maxAllowedCeiling.toFixed(2)})`);
    }

    // 5. Operation Fingerprint for Idempotency (P0-FIN-01)
    const operationFingerprint = crypto.createHash('sha256').update(
      JSON.stringify({
        callerUid,
        orderId,
        subOrderId: subOrderId || null,
        amount: requestedAmount,
        reason,
      })
    ).digest('hex');

    // 6. Atomic Transaction: Idempotency, Invariant Verification & Execution within One Transaction
    const refundLockRef = adminDb.collection('order_refund_locks').doc(orderId);
    const sellerLockRef = authoritativeSellerId ? adminDb.collection('seller_payout_locks').doc(authoritativeSellerId) : null;
    const refundId = `ref_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const now = new Date().toISOString();

    let idempotencyDocRef: FirebaseFirestore.DocumentReference | null = null;
    if (payload.idempotencyKey) {
      const compositeIdemKey = `${callerUid}:${orderId}:${payload.idempotencyKey}`;
      const idemHash = crypto.createHash('sha256').update(compositeIdemKey).digest('hex');
      idempotencyDocRef = adminDb.collection('refund_idempotency').doc(idemHash);
    }

    // Pre-transaction read: Gather historical settled refunds baseline prior to transaction (Strict Fail-Closed)
    let baselineHistoricalRefunded = 0;
    try {
      const histSnap = await adminDb
        .collection('refundRequests')
        .where('orderId', '==', orderId)
        .get();
      if (!histSnap.empty) {
        histSnap.forEach((d) => {
          const r = d.data();
          if (r.status !== 'REFUND_REJECTED') {
            baselineHistoricalRefunded += (Number(r.amount) || 0);
          }
        });
      }
    } catch (e: any) {
      console.error('[RefundGateway:FailClosed] Historical refunds baseline query failed:', e?.message || e);
      throw new Error(`Database query failure: Unable to verify historical refunds for order #${orderId}. Operation aborted (Fail-Closed).`);
    }

    const result = await adminDb.runTransaction(async (transaction) => {
      // Step 1: Read durable idempotency document inside the transaction (P0-FIN-01)
      if (idempotencyDocRef) {
        const existingIdemDoc = await transaction.get(idempotencyDocRef);
        if (existingIdemDoc.exists) {
          const idemData = existingIdemDoc.data() || {};
          // Check payload fingerprint
          if (idemData.fingerprint && idemData.fingerprint !== operationFingerprint) {
            const conflictErr = new Error(`Idempotency conflict: key '${payload.idempotencyKey}' was previously used with different refund parameters.`);
            (conflictErr as any).statusCode = 409;
            throw conflictErr;
          }
          console.log(`[RefundGateway:Idempotency] Returning previously recorded refund for key ${payload.idempotencyKey}`);
          return idemData.refund;
        }
      }

      // Step 2: Transactional reads of lock documents (strictly transaction.get - P1-11, OPEN-07)
      const lockDoc = await transaction.get(refundLockRef);
      let sellerCurrentRefundReserved = 0;
      if (sellerLockRef) {
        const sellerLockDoc = await transaction.get(sellerLockRef);
        if (sellerLockDoc.exists) {
          sellerCurrentRefundReserved = Number(sellerLockDoc.data()?.totalRefundReserved) || 0;
        }
      }

      let cumulativeRefunded = baselineHistoricalRefunded;
      // Add any locked active amount from lockDoc if more recent
      if (lockDoc.exists) {
        const lockData = lockDoc.data();
        if (typeof lockData?.cumulativeRefunded === 'number' && lockData.cumulativeRefunded > cumulativeRefunded) {
          cumulativeRefunded = lockData.cumulativeRefunded;
        }
      }

      const remainingRefundable = Math.max(0, maxAllowedCeiling - cumulativeRefunded);

      if (requestedAmount > remainingRefundable + 0.001) {
        throw new Error(
          `Requested amount ($${requestedAmount.toFixed(2)}) exceeds remaining refundable balance ($${remainingRefundable.toFixed(2)}) for order #${orderId}`
        );
      }

      const newCumulative = Number((cumulativeRefunded + requestedAmount).toFixed(2));

      // Build authoritative refund object
      const customerName = orderData.customerName || caller.token?.name || 'Customer';
      const customerPhone = orderData.phone || '';

      const newRefund: RefundRequest = {
        id: refundId,
        orderId,
        customerId: callerUid,
        customerName,
        customerPhone,
        sellerId: authoritativeSellerId,
        storeId: authoritativeStoreId,
        amount: requestedAmount,
        reason,
        notes: notes?.trim() || '',
        status: 'REFUND_REQUESTED',
        createdAt: now,
        updatedAt: now,
      };

      if (subOrderId) {
        newRefund.subOrderId = subOrderId;
      }

      // Write lock update
      transaction.set(refundLockRef, {
        orderId,
        maxAllowedCeiling,
        cumulativeRefunded: newCumulative,
        lastRefundId: refundId,
        lastAmount: requestedAmount,
        updatedAt: now,
      });

      if (sellerLockRef) {
        transaction.set(sellerLockRef, {
          sellerId: authoritativeSellerId,
          totalRefundReserved: Number((sellerCurrentRefundReserved + requestedAmount).toFixed(2)),
          lastRefundAt: now,
          lastRefundId: refundId,
          lastOrderRefunded: orderId,
        }, { merge: true });
      }

      // Write refund document
      const refundDocRef = adminDb.collection('refundRequests').doc(refundId);
      transaction.set(refundDocRef, newRefund);

      // Persist durable idempotency record atomically inside the transaction
      if (idempotencyDocRef) {
        transaction.set(idempotencyDocRef, {
          idempotencyKey: payload.idempotencyKey,
          fingerprint: operationFingerprint,
          refund: newRefund,
          orderId,
          callerUid,
          createdAt: now,
        });
      }

      return newRefund;
    });

    console.log(`[RefundGateway:AdminSDK] Refund ${result.id} created atomically for order ${orderId} ($${result.amount}).`);
    return {
      success: true,
      refund: result,
    };
  } catch (err: any) {
    console.error(`[RefundGateway:Error] Failed to process refund for order ${orderId}:`, err?.message || err);
    throw err;
  } finally {
    inFlightRefundOrders.delete(orderId);
  }
}
