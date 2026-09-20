import crypto from 'crypto';
import { getAdminDb, verifyFirebaseBearerToken, isCallerPlatformAdmin } from './firebaseAdmin';
import { RefundRequest } from '../src/types';

export interface CreateRefundGatewayRequest {
  orderId: string;
  subOrderId?: string;
  amount: number;
  reason: RefundRequest['reason'];
  notes?: string;
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

  const decoded = await verifyFirebaseBearerToken(authHeader);
  if (!decoded) {
    throw new Error('Authentication failed: Invalid or expired credentials');
  }

  const callerUid = decoded.uid;
  const isPlatformAdmin = isCallerPlatformAdmin(decoded);

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

    // Terminal order status checks
    if (orderData.status === 'cancelled') {
      throw new Error('Order is already cancelled');
    }

    // Resolve Authoritative Entity Context & Max Allowed Ceiling
    let maxAllowedCeiling = Number(orderData.total) || 0;

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

    // 5. Atomic Transaction: Query all active refunds & commit within lock
    const refundLockRef = adminDb.collection('order_refund_locks').doc(orderId);
    const sellerLockRef = authoritativeSellerId ? adminDb.collection('seller_payout_locks').doc(authoritativeSellerId) : null;
    const refundId = `ref_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const now = new Date().toISOString();

    const result = await adminDb.runTransaction(async (transaction) => {
      // Read the order refund lock document and seller payout lock if present
      const lockDoc = await transaction.get(refundLockRef);
      if (sellerLockRef) {
        await transaction.get(sellerLockRef);
      }

      // Query all existing refunds for this order
      const existingRefundsSnap = await adminDb
        .collection('refundRequests')
        .where('orderId', '==', orderId)
        .get();

      let cumulativeRefunded = 0;
      if (!existingRefundsSnap.empty) {
        existingRefundsSnap.forEach((d) => {
          const r = d.data();
          if (r.status !== 'REFUND_REJECTED') {
            cumulativeRefunded += (Number(r.amount) || 0);
          }
        });
      }

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
      const customerName = orderData.customerName || decoded.name || 'Customer';
      const customerPhone = orderData.phone || '';

      const newRefund: RefundRequest = {
        id: refundId,
        orderId,
        subOrderId: subOrderId || undefined,
        customerId: callerUid,
        customerName,
        customerPhone,
        sellerId: authoritativeSellerId,
        storeId: authoritativeStoreId,
        amount: requestedAmount,
        reason,
        notes: notes?.trim() || undefined,
        status: 'REFUND_REQUESTED',
        createdAt: now,
        updatedAt: now,
      };

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
          lastRefundAt: now,
          lastRefundId: refundId,
          lastOrderRefunded: orderId,
        }, { merge: true });
      }

      // Write refund document
      const refundDocRef = adminDb.collection('refundRequests').doc(refundId);
      transaction.set(refundDocRef, newRefund);

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
