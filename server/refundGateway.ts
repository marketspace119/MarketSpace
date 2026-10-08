import crypto from 'crypto';
import { getAdminDb, requireAuthenticatedCaller, requireVerifiedPlatformAdmin, isCallerPlatformAdmin } from './firebaseAdmin';
import { RefundRequest, RefundStatus } from '../src/types';

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

    // Resolve Authoritative Entity Context & Max Allowed Ceiling (Strict Fail-Closed on corrupted total)
    const rawOrderTotalVal = orderData.total;
    const rawOrderTotal = (rawOrderTotalVal === null || rawOrderTotalVal === undefined || rawOrderTotalVal === '' || typeof rawOrderTotalVal === 'boolean')
      ? NaN
      : Number(rawOrderTotalVal);
    if (!Number.isFinite(rawOrderTotal) || isNaN(rawOrderTotal) || rawOrderTotal <= 0) {
      const err = new Error(`Corrupted or unreadable authoritative order total for #${orderId}. Refund aborted (Fail-Closed).`) as any;
      err.statusCode = 503;
      throw err;
    }
    let maxAllowedCeiling = rawOrderTotal;

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
      const rawSubVal = vo.subtotal ?? vo.total;
      const subCeiling = (rawSubVal === null || rawSubVal === undefined || rawSubVal === '' || typeof rawSubVal === 'boolean')
        ? NaN
        : Number(rawSubVal);
      if (!Number.isFinite(subCeiling) || isNaN(subCeiling) || subCeiling <= 0) {
        const err = new Error(`Corrupted sub-order total for #${subOrderId}. Refund aborted (Fail-Closed).`) as any;
        err.statusCode = 503;
        throw err;
      }
      maxAllowedCeiling = subCeiling;
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

    // Pre-transaction read: Gather historical settled refunds baseline prior to transaction (Strict Fail-Closed, zero fallback)
    let baselineHistoricalOrderRefunded = 0;
    let baselineHistoricalSubOrderRefunded = 0;
    try {
      const histSnap = await adminDb
        .collection('refundRequests')
        .where('orderId', '==', orderId)
        .get();
      if (!histSnap.empty) {
        histSnap.forEach((d) => {
          const r = d.data();
          if (!r || typeof r !== 'object') {
            throw new Error(`Corrupted historical refund document (#${d.id}) for order #${orderId}. Fail-Closed.`);
          }
          if (r.status !== 'REFUND_REJECTED' && r.status !== 'REJECTED') {
            const rawHistAmt = r.amount;
            const histAmt = (rawHistAmt === null || rawHistAmt === undefined || rawHistAmt === '' || typeof rawHistAmt === 'boolean')
              ? NaN
              : Number(rawHistAmt);
            if (!Number.isFinite(histAmt) || isNaN(histAmt) || histAmt <= 0) {
              throw new Error(`Corrupted historical refund amount in record #${d.id} for order #${orderId}. Fail-Closed.`);
            }
            baselineHistoricalOrderRefunded += histAmt;
            if (subOrderId && r.subOrderId === subOrderId) {
              baselineHistoricalSubOrderRefunded += histAmt;
            }
          }
        });
      }
    } catch (e: any) {
      console.error('[RefundGateway:FailClosed] Historical refunds baseline query failed:', e?.message || e);
      const failErr = new Error(`Database query failure: Unable to verify historical refunds for order #${orderId}. Operation aborted (Fail-Closed).`) as any;
      failErr.statusCode = 503;
      throw failErr;
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
          const sLockData = sellerLockDoc.data() || {};
          if (sLockData.totalRefundReserved !== undefined) {
            const parsedRes = (sLockData.totalRefundReserved === null || sLockData.totalRefundReserved === '' || typeof sLockData.totalRefundReserved === 'boolean')
              ? NaN
              : Number(sLockData.totalRefundReserved);
            if (!Number.isFinite(parsedRes) || isNaN(parsedRes) || parsedRes < 0) {
              const err = new Error(`Corrupted totalRefundReserved in seller_payout_locks for seller #${authoritativeSellerId}. Fail-Closed.`) as any;
              err.statusCode = 503;
              throw err;
            }
            sellerCurrentRefundReserved = parsedRes;
          }
        }
      }

      let orderCumulativeRefunded = baselineHistoricalOrderRefunded;
      let subOrderCumulativeRefunded = baselineHistoricalSubOrderRefunded;
      const existingSubOrderRefundsMap: Record<string, number> = {};

      // Add any locked active amount from lockDoc if more recent
      if (lockDoc.exists) {
        const lockData = lockDoc.data() || {};
        if (lockData.cumulativeRefunded !== undefined) {
          const parsedCum = (lockData.cumulativeRefunded === null || lockData.cumulativeRefunded === '' || typeof lockData.cumulativeRefunded === 'boolean')
            ? NaN
            : Number(lockData.cumulativeRefunded);
          if (!Number.isFinite(parsedCum) || isNaN(parsedCum) || parsedCum < 0) {
            const err = new Error(`Corrupted cumulativeRefunded in order_refund_locks for order #${orderId}. Fail-Closed.`) as any;
            err.statusCode = 503;
            throw err;
          }
          if (parsedCum > orderCumulativeRefunded) {
            orderCumulativeRefunded = parsedCum;
          }
        }
        if (lockData.subOrderRefunds && typeof lockData.subOrderRefunds === 'object') {
          Object.assign(existingSubOrderRefundsMap, lockData.subOrderRefunds);
          if (subOrderId && existingSubOrderRefundsMap[subOrderId] !== undefined) {
            const lockedSubAmt = Number(existingSubOrderRefundsMap[subOrderId]);
            if (!Number.isFinite(lockedSubAmt) || isNaN(lockedSubAmt) || lockedSubAmt < 0) {
              const err = new Error(`Corrupted subOrderRefunds for subOrder #${subOrderId}. Fail-Closed.`) as any;
              err.statusCode = 503;
              throw err;
            }
            if (lockedSubAmt > subOrderCumulativeRefunded) {
              subOrderCumulativeRefunded = lockedSubAmt;
            }
          }
        }
      }

      const remainingOrderRefundable = Math.max(0, Number((rawOrderTotal - orderCumulativeRefunded).toFixed(2)));
      const remainingSubOrderRefundable = subOrderId
        ? Math.max(0, Number((maxAllowedCeiling - subOrderCumulativeRefunded).toFixed(2)))
        : remainingOrderRefundable;
      const remainingRefundable = Math.min(remainingOrderRefundable, remainingSubOrderRefundable);

      if (requestedAmount > remainingRefundable + 0.001) {
        throw new Error(
          `Requested amount ($${requestedAmount.toFixed(2)}) exceeds remaining refundable balance ($${remainingRefundable.toFixed(2)}) for order #${orderId}`
        );
      }

      const newCumulative = Number((orderCumulativeRefunded + requestedAmount).toFixed(2));
      if (subOrderId) {
        existingSubOrderRefundsMap[subOrderId] = Number((subOrderCumulativeRefunded + requestedAmount).toFixed(2));
      }

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
        maxAllowedCeiling: rawOrderTotal,
        cumulativeRefunded: newCumulative,
        subOrderRefunds: existingSubOrderRefundsMap,
        lastRefundId: refundId,
        lastAmount: requestedAmount,
        updatedAt: now,
      }, { merge: true });

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

export interface ReviewRefundGatewayRequest {
  refundId: string;
  action: 'APPROVE' | 'REJECT';
  adminNotes?: string;
}

/**
 * Authoritative Refund Review Gateway (Finding 4 & Finding 18)
 * Atomically approves or rejects a refund request, updates order refundStatus,
 * and adjusts seller_payout_locks.totalRefundReserved when rejected.
 */
export async function processRefundReviewGateway(
  payload: ReviewRefundGatewayRequest,
  authHeader?: string
): Promise<{ success: boolean; refund: RefundRequest }> {
  const caller = await requireVerifiedPlatformAdmin(authHeader);
  const refundId = (payload.refundId || '').trim();
  const action = payload.action;
  const adminNotes = payload.adminNotes?.trim();

  if (!refundId) {
    const err = new Error('Refund ID is required');
    (err as any).statusCode = 400;
    throw err;
  }
  if (action !== 'APPROVE' && action !== 'REJECT') {
    const err = new Error('Invalid action: must be APPROVE or REJECT');
    (err as any).statusCode = 400;
    throw err;
  }

  const adminDb = getAdminDb();
  const now = new Date().toISOString();

  const updatedRefund = await adminDb.runTransaction(async (transaction) => {
    const refundRef = adminDb.collection('refundRequests').doc(refundId);
    const refundDoc = await transaction.get(refundRef);
    if (!refundDoc.exists) {
      const err = new Error('Refund request not found');
      (err as any).statusCode = 404;
      throw err;
    }

    const prev = refundDoc.data() as RefundRequest;
    if (
      prev.status === 'REFUNDED' ||
      prev.status === 'REFUND_REJECTED' ||
      prev.status === 'REJECTED' ||
      (prev.status as any) === 'completed'
    ) {
      const err = new Error('Terminal state: Settled refunds cannot be modified');
      (err as any).statusCode = 409;
      throw err;
    }

    const orderRef = adminDb.collection('orders').doc(prev.orderId);
    const orderDoc = await transaction.get(orderRef);

    const refundLockRef = adminDb.collection('order_refund_locks').doc(prev.orderId);
    const refundLockDoc = await transaction.get(refundLockRef);

    const sellerLockRef = prev.sellerId ? adminDb.collection('seller_payout_locks').doc(prev.sellerId) : null;
    const sellerLockDoc = sellerLockRef ? await transaction.get(sellerLockRef) : null;

    const nextStatus: RefundStatus = action === 'APPROVE' ? 'REFUND_APPROVED' : 'REFUND_REJECTED';

    const updated: RefundRequest = {
      ...prev,
      status: nextStatus,
      processedBy: caller.uid,
      processedAt: now,
      updatedAt: now,
      adminNotes: adminNotes || prev.adminNotes || '',
    };

    transaction.set(refundRef, updated, { merge: true });

    if (orderDoc.exists) {
      transaction.update(orderRef, {
        refundStatus: action === 'APPROVE' ? 'approved' : 'rejected',
        updatedAt: now,
      });
    }

    // If rejected, release the refund reservation on order_refund_locks and seller_payout_locks
    if (action === 'REJECT') {
      if (refundLockDoc.exists) {
        const rLockData = refundLockDoc.data() || {};
        const currentCumulative = Number(rLockData.cumulativeRefunded) || 0;
        const releasedCumulative = Math.max(0, Number((currentCumulative - prev.amount).toFixed(2)));
        const nextSubOrderRefunds = { ...(rLockData.subOrderRefunds || {}) };
        if (prev.subOrderId && nextSubOrderRefunds[prev.subOrderId] !== undefined) {
          nextSubOrderRefunds[prev.subOrderId] = Math.max(
            0,
            Number(((Number(nextSubOrderRefunds[prev.subOrderId]) || 0) - prev.amount).toFixed(2))
          );
        }
        transaction.set(refundLockRef, {
          cumulativeRefunded: releasedCumulative,
          subOrderRefunds: nextSubOrderRefunds,
          updatedAt: now,
        }, { merge: true });
      }
      if (sellerLockRef && sellerLockDoc && sellerLockDoc.exists) {
        const sLockData = sellerLockDoc.data() || {};
        const currentRefundReserved = Number(sLockData.totalRefundReserved) || 0;
        const releasedRefundReserved = Math.max(0, Number((currentRefundReserved - prev.amount).toFixed(2)));
        transaction.set(sellerLockRef, {
          totalRefundReserved: releasedRefundReserved,
          updatedAt: now,
        }, { merge: true });
      }
    }

    const auditRef = adminDb.collection('audit_logs').doc(`audit_ref_rev_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`);
    transaction.set(auditRef, {
      id: auditRef.id,
      actorId: caller.uid,
      actorRole: caller.isSuperAdmin ? 'SUPER_ADMIN' : 'ADMIN',
      actorEmail: caller.email || '',
      action: action === 'APPROVE' ? 'REFUND_APPROVED' : 'REFUND_REJECTED',
      targetType: 'refund',
      targetId: refundId,
      targetName: `Refund for Order ${prev.orderId}`,
      timestamp: now,
      metadata: { status: nextStatus, amount: prev.amount, orderId: prev.orderId },
    });

    return updated;
  });

  return { success: true, refund: updatedRefund };
}

export interface SettleRefundGatewayRequest {
  refundId: string;
  settlementType: 'MANUAL_MOBILE_TRANSFER' | 'CASH' | 'STORE_CREDIT';
  settlementReference: string;
  adminNotes?: string;
}

/**
 * Authoritative Refund Settlement Gateway (Finding 4 & Finding 18)
 * Atomically settles an approved refund request, updates order refundStatus to 'refunded',
 * and updates seller_financial_ledgers.lifetimeSettledRefunds.
 */
export async function processRefundSettlementGateway(
  payload: SettleRefundGatewayRequest,
  authHeader?: string
): Promise<{ success: boolean; refund: RefundRequest }> {
  const caller = await requireVerifiedPlatformAdmin(authHeader);
  const refundId = (payload.refundId || '').trim();
  const trimmedRef = (payload.settlementReference || '').trim();
  const settlementType = payload.settlementType || 'MANUAL_MOBILE_TRANSFER';
  const adminNotes = payload.adminNotes?.trim();

  if (!refundId) {
    const err = new Error('Refund ID is required');
    (err as any).statusCode = 400;
    throw err;
  }
  if (!trimmedRef || trimmedRef.length < 4) {
    const err = new Error('رقم إشعار / مرجع التحويل المالي مطلوب ويجب أن يحتوي على 4 خانات على الأقل');
    (err as any).statusCode = 400;
    throw err;
  }

  const adminDb = getAdminDb();
  const now = new Date().toISOString();

  const settledRefund = await adminDb.runTransaction(async (transaction) => {
    const refundRef = adminDb.collection('refundRequests').doc(refundId);
    const refundDoc = await transaction.get(refundRef);
    if (!refundDoc.exists) {
      const err = new Error('Refund request not found');
      (err as any).statusCode = 404;
      throw err;
    }

    const prev = refundDoc.data() as RefundRequest;
    if (prev.status === 'REFUNDED') {
      const err = new Error('Terminal state: Refund has already been settled and completed');
      (err as any).statusCode = 409;
      throw err;
    }
    if (prev.status !== 'REFUND_APPROVED' && prev.status !== 'APPROVED') {
      const err = new Error('يجب اعتماد طلب الاسترداد أولاً قبل تسجيل التسوية المالية');
      (err as any).statusCode = 400;
      throw err;
    }

    const orderRef = adminDb.collection('orders').doc(prev.orderId);
    const orderDoc = await transaction.get(orderRef);

    const ledgerRef = prev.sellerId ? adminDb.collection('seller_financial_ledgers').doc(prev.sellerId) : null;
    const ledgerDoc = ledgerRef ? await transaction.get(ledgerRef) : null;

    const updated: RefundRequest = {
      ...prev,
      status: 'REFUNDED',
      settlementType,
      settlementReference: trimmedRef,
      processedBy: caller.uid,
      processedAt: now,
      updatedAt: now,
      adminNotes: adminNotes || prev.adminNotes || '',
    };

    transaction.set(refundRef, updated, { merge: true });

    if (orderDoc.exists) {
      transaction.update(orderRef, {
        refundStatus: 'refunded',
        updatedAt: now,
      });
    }

    // Increment lifetimeSettledRefunds on seller_financial_ledgers atomically
    if (ledgerRef && ledgerDoc && ledgerDoc.exists) {
      const lData = ledgerDoc.data() || {};
      const nextSettledRefunds = Number(((Number(lData.lifetimeSettledRefunds) || 0) + prev.amount).toFixed(2));
      transaction.set(ledgerRef, {
        lifetimeSettledRefunds: nextSettledRefunds,
        version: (Number(lData.version) || 1) + 1,
      }, { merge: true });
    }

    const auditRef = adminDb.collection('audit_logs').doc(`audit_ref_settle_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`);
    transaction.set(auditRef, {
      id: auditRef.id,
      actorId: caller.uid,
      actorRole: caller.isSuperAdmin ? 'SUPER_ADMIN' : 'ADMIN',
      actorEmail: caller.email || '',
      action: 'REFUND_SETTLED',
      targetType: 'refund',
      targetId: refundId,
      targetName: `Refund ${refundId}`,
      timestamp: now,
      metadata: {
        settlementType,
        settlementReference: trimmedRef,
        amount: prev.amount,
        orderId: prev.orderId,
      },
    });

    return updated;
  });

  return { success: true, refund: settledRefund };
}
