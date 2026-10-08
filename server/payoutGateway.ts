import crypto from 'crypto';
import { getAdminDb, requireAuthenticatedCaller, isCallerPlatformAdmin, requireVerifiedPlatformAdmin } from './firebaseAdmin';
import { PayoutRequest } from '../src/types';

export interface SellerFinancialSummary {
  sellerId: string;
  grossEarned: number;
  refundedAmount: number;
  pendingRefundAmount: number;
  totalRefundCommitment: number;
  settledPayout: number;
  reservedPayout: number;
  totalPayoutCommitment: number;
  availableBalance: number;
  calculatedAt: string;
}

/**
 * Safe Deterministic Invariant (F-30):
 * Seller funds must NOT become payout-eligible merely because an order is paid.
 * Payout eligibility requires:
 * 1. Parent order paymentStatus === 'paid'
 * 2. Parent order status !== 'cancelled'
 * 3. If multi-vendor sub-order (vo) is present:
 *    - vo.status !== 'cancelled'
 *    - vo.status must be 'delivered' or 'completed'
 * 4. If single-seller / direct order (no vo):
 *    - order.status must be 'delivered' or 'completed'
 * Pre-delivery states (pending, confirmed, processing, preparing, shipped, out_for_delivery) are NOT payout-eligible.
 */
function applyQueryLimit(q: any, limitCount: number): any {
  if (q && typeof q.limit === 'function') {
    return q.limit(limitCount);
  }
  return q;
}

export function isSubOrderEligibleForPayout(order: any, vo?: any): boolean {
  if (!order) return false;
  const pStatus = (order.paymentStatus || '').toLowerCase();
  if (pStatus !== 'paid') return false;
  const oStatus = (order.status || '').toLowerCase();
  if (oStatus === 'cancelled') return false;

  if (vo) {
    const voStatus = (vo.status || '').toLowerCase();
    if (voStatus === 'cancelled') return false;
    if (voStatus) {
      return voStatus === 'delivered' || voStatus === 'completed';
    }
  }

  return oStatus === 'delivered' || oStatus === 'completed';
}

/**
 * Strict Fail-Closed Numeric Parser (NEW-07)
 * Rejects null, undefined, '', booleans, NaN, Infinity, -Infinity, and non-finite strings.
 */
export function parseStrictPositiveNumber(val: any, fieldName: string): number {
  if (val === null || val === undefined || val === '' || typeof val === 'boolean') {
    throw new Error(`Invalid or missing financial field (${fieldName}). Fail-Closed.`);
  }
  const num = Number(val);
  if (!Number.isFinite(num) || isNaN(num) || num <= 0) {
    throw new Error(`Corrupted non-positive financial field (${fieldName}: ${String(val)}). Fail-Closed.`);
  }
  return num;
}

export function parseStrictNonNegativeNumber(val: any, fieldName: string): number {
  if (val === null || val === undefined || val === '' || typeof val === 'boolean') {
    throw new Error(`Invalid or missing financial field (${fieldName}). Fail-Closed.`);
  }
  const num = Number(val);
  if (!Number.isFinite(num) || isNaN(num) || num < 0) {
    throw new Error(`Corrupted negative or non-finite financial field (${fieldName}: ${String(val)}). Fail-Closed.`);
  }
  return num;
}

/**
 * Robustly calculates seller earnings from an eligible order.
 * Strictly guarantees finite positive numeric output and prevents NaN arithmetic poisoning.
 * Fail-Closed (NEW-07): Throws if an eligible order or sub-order has corrupted financial fields.
 */
export function calculateEarnedFromOrder(order: any, sellerId: string): number {
  if (!order) return 0;
  let earned = 0;
  if (Array.isArray(order.vendorOrders) && order.vendorOrders.length > 0) {
    order.vendorOrders.forEach((vo: any) => {
      if (vo.sellerId === sellerId && isSubOrderEligibleForPayout(order, vo)) {
        if (vo.sellerRevenue !== undefined && vo.sellerRevenue !== null) {
          const rev = parseStrictPositiveNumber(vo.sellerRevenue, `vendorOrder.sellerRevenue (order ${order.id || 'unknown'})`);
          earned += rev;
        } else {
          const rawSub = vo.subtotal !== undefined ? vo.subtotal : vo.total;
          const sub = parseStrictPositiveNumber(rawSub, `vendorOrder.subtotal (order ${order.id || 'unknown'})`);
          const comm = vo.commissionAmount !== undefined && vo.commissionAmount !== null
            ? parseStrictNonNegativeNumber(vo.commissionAmount, `vendorOrder.commissionAmount (order ${order.id || 'unknown'})`)
            : 0;
          const itemEarned = sub - comm;
          if (!Number.isFinite(itemEarned) || itemEarned < 0) {
            throw new Error(`Corrupted net seller revenue calculation for sub-order in order ${order.id || 'unknown'}. Fail-Closed.`);
          }
          earned += itemEarned;
        }
      }
    });
  } else if ((order.sellerId === sellerId || (Array.isArray(order.sellerIds) && order.sellerIds.includes(sellerId))) && isSubOrderEligibleForPayout(order)) {
    if (order.sellerRevenue !== undefined && order.sellerRevenue !== null) {
      const rev = parseStrictPositiveNumber(order.sellerRevenue, `order.sellerRevenue (order ${order.id || 'unknown'})`);
      earned += rev;
    } else {
      const rawSub = order.subtotal !== undefined ? order.subtotal : order.total;
      const sub = parseStrictPositiveNumber(rawSub, `order.subtotal/total (order ${order.id || 'unknown'})`);
      const comm = order.platformCommission !== undefined && order.platformCommission !== null
        ? parseStrictNonNegativeNumber(order.platformCommission, `order.platformCommission (order ${order.id || 'unknown'})`)
        : 0;
      const itemEarned = sub - comm;
      if (!Number.isFinite(itemEarned) || itemEarned < 0) {
        throw new Error(`Corrupted net seller revenue calculation for order ${order.id || 'unknown'}. Fail-Closed.`);
      }
      earned += itemEarned;
    }
  }
  return Number.isFinite(earned) ? Number(earned.toFixed(2)) : 0;
}

/**
 * Single Authoritative Financial Engine (Server-Side)
 * Computes exact earnings, refund commitments, payout commitments, and net available balance.
 * Fail-Closed: Throws on database query failure.
 */
export interface SellerFinancialLedgerDoc {
  sellerId: string;
  lifetimeGrossEarned: number;
  lifetimeSettledRefunds: number;
  lifetimeSettledPayouts: number;
  lastReconciledAt: string;
  reconciledDocIdsAtTimestamp?: string[];
  version: number;
}

/**
 * Authoritative Seller Financial Summary Calculation (P0-03, F-30, Finding F, V3-08)
 * Implements a deterministic ledger cursor combining updatedAt + documentId
 * to guarantee complete, auditable financial reconciliation with identical timestamps.
 */
export async function calculateSellerFinancialSummary(
  sellerId: string,
  customDb?: FirebaseFirestore.Firestore
): Promise<SellerFinancialSummary> {
  const adminDb = customDb || getAdminDb();
  const now = new Date().toISOString();
  const ledgerRef = adminDb.collection('seller_financial_ledgers').doc(sellerId);

  let grossEarned = 0;
  let refundedAmount = 0;
  let pendingRefundAmount = 0;
  let settledPayout = 0;
  let reservedPayout = 0;

  try {
    const ledgerSnap = await ledgerRef.get();

    if (ledgerSnap.exists) {
      const ledger = ledgerSnap.data() as SellerFinancialLedgerDoc;
      grossEarned = ledger.lifetimeGrossEarned !== undefined
        ? parseStrictNonNegativeNumber(ledger.lifetimeGrossEarned, `ledger.lifetimeGrossEarned (${sellerId})`)
        : 0;
      refundedAmount = ledger.lifetimeSettledRefunds !== undefined
        ? parseStrictNonNegativeNumber(ledger.lifetimeSettledRefunds, `ledger.lifetimeSettledRefunds (${sellerId})`)
        : 0;
      settledPayout = ledger.lifetimeSettledPayouts !== undefined
        ? parseStrictNonNegativeNumber(ledger.lifetimeSettledPayouts, `ledger.lifetimeSettledPayouts (${sellerId})`)
        : 0;
      const lastReconciledAt = ledger.lastReconciledAt || '1970-01-01T00:00:00.000Z';
      const previouslyReconciledDocIds: string[] = Array.isArray(ledger.reconciledDocIdsAtTimestamp)
        ? ledger.reconciledDocIdsAtTimestamp
        : [];

      // 1. Complete deterministic incremental reconciliation with cursor safety (V3-08)
      let latestProcessedUpdatedAt = lastReconciledAt;
      let currentProcessedDocIds: string[] = [];

      try {
        let currentCursor: any = undefined;
        while (true) {
          let q = adminDb
            .collection('orders')
            .where('sellerIds', 'array-contains', sellerId)
            .where('updatedAt', '>=', lastReconciledAt)
            .orderBy('updatedAt', 'asc')
            .limit(100);
          if (currentCursor) {
            q = q.startAfter(currentCursor);
          }
          const deltaOrdersSnap = await q.get();
          if (deltaOrdersSnap.empty) break;

          deltaOrdersSnap.forEach((doc) => {
            const order = doc.data();
            const orderUp = order.updatedAt || '';
            const docId = doc.id;

            // Safe cursor deduplication for identical timestamps
            if (orderUp === lastReconciledAt && previouslyReconciledDocIds.includes(docId)) {
              return;
            }

            if (orderUp > latestProcessedUpdatedAt) {
              latestProcessedUpdatedAt = orderUp;
              currentProcessedDocIds = [docId];
            } else if (orderUp === latestProcessedUpdatedAt) {
              currentProcessedDocIds.push(docId);
            }

            grossEarned += calculateEarnedFromOrder(order, sellerId);
          });

          currentCursor = deltaOrdersSnap.docs[deltaOrdersSnap.docs.length - 1];
          if (deltaOrdersSnap.docs.length < 100) break;
        }
      } catch (indexErr: any) {
        if (String(indexErr?.message || '').includes('Fail-Closed')) {
          throw indexErr;
        }
        if (process.env.NODE_ENV === 'production') {
          throw indexErr;
        }
        // Fallback ONLY for local test harness without composite indexes
        const deltaOrdersSnap = await adminDb
          .collection('orders')
          .where('sellerIds', 'array-contains', sellerId)
          .get();

        if (!deltaOrdersSnap.empty) {
          deltaOrdersSnap.forEach((doc) => {
            const order = doc.data();
            const orderUp = order.updatedAt || '';
            const docId = doc.id;

            if (orderUp < lastReconciledAt) return;
            if (orderUp === lastReconciledAt && previouslyReconciledDocIds.includes(docId)) {
              return;
            }

            if (orderUp > latestProcessedUpdatedAt) {
              latestProcessedUpdatedAt = orderUp;
              currentProcessedDocIds = [docId];
            } else if (orderUp === latestProcessedUpdatedAt) {
              currentProcessedDocIds.push(docId);
            }

            grossEarned += calculateEarnedFromOrder(order, sellerId);
          });
        }
      }

      if (latestProcessedUpdatedAt === lastReconciledAt) {
        currentProcessedDocIds = Array.from(new Set([...previouslyReconciledDocIds, ...currentProcessedDocIds]));
      }

      // 2. Complete active in-flight refunds query (OPEN-05, FIN-02, NEW-07 Fail-Closed)
      const activeRefundOrderIds = new Set<string>();
      const activeRefundsSnap = await applyQueryLimit(
        adminDb
          .collection('refundRequests')
          .where('sellerId', '==', sellerId)
          .where('status', 'in', ['REFUND_REQUESTED', 'REFUND_APPROVED', 'pending']),
        200
      ).get();

      if (!activeRefundsSnap.empty) {
        activeRefundsSnap.forEach((doc: any) => {
          const rData = doc.data();
          const rAmt = parseStrictPositiveNumber(rData.amount, `active refund #${doc.id} amount for seller ${sellerId}`);
          pendingRefundAmount += rAmt;
          if (rData.orderId) {
            const rOrderId = String(rData.orderId);
            if (rData.subOrderId) {
              activeRefundOrderIds.add(`${rOrderId}_${rData.subOrderId}`);
            } else {
              activeRefundOrderIds.add(rOrderId);
            }
          }
        });
      }

      // 2b. Active unresolved disputes freeze seller funds for the disputed order (Fail-Closed Dispute Freeze - NEW-06)
      const disputesCol = adminDb.collection('disputes') as any;
      if (disputesCol && typeof disputesCol.where === 'function') {
        const activeDisputesSnap = await applyQueryLimit(
          disputesCol.where('sellerId', '==', sellerId),
          200
        ).get();
        if (activeDisputesSnap && !activeDisputesSnap.empty && Array.isArray(activeDisputesSnap.docs)) {
          for (const dDoc of activeDisputesSnap.docs) {
            const disp = typeof dDoc.data === 'function' ? dDoc.data() : dDoc;
            if (disp && (disp.status === 'OPEN' || disp.status === 'SELLER_RESPONDED')) {
              const dispOrderId = disp.orderId ? String(disp.orderId) : '';
              const dispKey = disp.subOrderId ? `${dispOrderId}_${disp.subOrderId}` : dispOrderId;
              if ((dispOrderId && activeRefundOrderIds.has(dispOrderId)) || (dispKey && activeRefundOrderIds.has(dispKey))) {
                continue;
              }
              if (dispKey) activeRefundOrderIds.add(dispKey);
              const rawDispAmt = disp.disputedAmount !== undefined ? disp.disputedAmount : disp.refundAmount;
              if (rawDispAmt !== undefined && rawDispAmt !== null) {
                const explicitDisputedAmt = parseStrictPositiveNumber(rawDispAmt, `dispute #${dDoc.id || 'unknown'} disputedAmount`);
                pendingRefundAmount += explicitDisputedAmt;
              } else if (dispOrderId) {
                const ordSnap = await adminDb.collection('orders').doc(dispOrderId).get();
                if (ordSnap && ordSnap.exists) {
                  const ordData = ordSnap.data() || {};
                  if (disp.subOrderId && Array.isArray(ordData.vendorOrders)) {
                    const matchedVo = ordData.vendorOrders.find((vo: any) => vo.subOrderId === disp.subOrderId && vo.sellerId === sellerId);
                    if (matchedVo) {
                      const voEarned = matchedVo.sellerRevenue !== undefined && matchedVo.sellerRevenue !== null
                        ? parseStrictPositiveNumber(matchedVo.sellerRevenue, `disputed subOrder sellerRevenue`)
                        : parseStrictPositiveNumber(matchedVo.subtotal ?? matchedVo.total, `disputed subOrder subtotal`);
                      pendingRefundAmount += voEarned;
                      continue;
                    }
                  }
                  const earned = calculateEarnedFromOrder(ordData, sellerId);
                  if (earned > 0) {
                    pendingRefundAmount += earned;
                  } else if (Array.isArray(ordData.vendorOrders) && ordData.vendorOrders.length > 0) {
                    const sellerSubTotal = ordData.vendorOrders
                      .filter((vo: any) => vo.sellerId === sellerId)
                      .reduce((sum: number, vo: any) => sum + parseStrictPositiveNumber(vo.subtotal ?? vo.total, `disputed vendorOrder subtotal`), 0);
                    pendingRefundAmount += sellerSubTotal > 0 ? sellerSubTotal : parseStrictPositiveNumber(ordData.total, `disputed order total`);
                  } else {
                    pendingRefundAmount += parseStrictPositiveNumber(ordData.total, `disputed order total`);
                  }
                }
              }
            }
          }
        }
      }

      // 3. Complete active in-flight payouts query (OPEN-05, FIN-02, NEW-07 Fail-Closed)
      const activePayoutsSnap = await applyQueryLimit(
        adminDb
          .collection('payoutRequests')
          .where('sellerId', '==', sellerId)
          .where('status', 'in', ['pending', 'approved']),
        200
      ).get();

      if (!activePayoutsSnap.empty) {
        activePayoutsSnap.forEach((doc) => {
          const pAmt = parseStrictPositiveNumber(doc.data().amount, `active payout #${doc.id} amount for seller ${sellerId}`);
          reservedPayout += pAmt;
        });
      }

      // Update the authoritative ledger state atomically via runTransaction to prevent concurrent overwrite (Finding 6)
      const updateLedgerFn = async (tx?: any) => {
        const freshLedgerSnap = tx ? await tx.get(ledgerRef) : await ledgerRef.get();
        const freshLedger = freshLedgerSnap.exists ? (freshLedgerSnap.data() as SellerFinancialLedgerDoc) : ledger;
        const nextVersion = (freshLedger.version || 1) + 1;
        const mergedGross = Math.max(Number(grossEarned.toFixed(2)), Number(freshLedger.lifetimeGrossEarned) || 0);
        const mergedRefunds = Math.max(Number(refundedAmount.toFixed(2)), Number(freshLedger.lifetimeSettledRefunds) || 0);
        const mergedPayouts = Math.max(Number(settledPayout.toFixed(2)), Number(freshLedger.lifetimeSettledPayouts) || 0);
        const mergedReconciledAt = latestProcessedUpdatedAt >= (freshLedger.lastReconciledAt || '')
          ? latestProcessedUpdatedAt
          : freshLedger.lastReconciledAt;
        const mergedDocIds = Array.from(new Set([
          ...(Array.isArray(freshLedger.reconciledDocIdsAtTimestamp) ? freshLedger.reconciledDocIdsAtTimestamp : []),
          ...currentProcessedDocIds,
        ]));
        const nextPayload = {
          sellerId,
          lifetimeGrossEarned: mergedGross,
          lifetimeSettledRefunds: mergedRefunds,
          lifetimeSettledPayouts: mergedPayouts,
          lastReconciledAt: mergedReconciledAt,
          reconciledDocIdsAtTimestamp: mergedDocIds,
          version: nextVersion,
        };
        if (tx) {
          tx.set(ledgerRef, nextPayload, { merge: true });
        } else {
          await ledgerRef.set(nextPayload, { merge: true });
        }
      };

      if (typeof adminDb.runTransaction === 'function') {
        await adminDb.runTransaction(updateLedgerFn);
      } else {
        await updateLedgerFn();
      }

    } else {
      // First-time seller initialization: Compute complete authoritative baseline (OPEN-06 & V3-08)
      let latestInitUpdatedAt = '1970-01-01T00:00:00.000Z';
      let initDocIdsAtLatestTimestamp: string[] = [];

      const ordersSnap = await adminDb
        .collection('orders')
        .where('sellerIds', 'array-contains', sellerId)
        .get();

      if (!ordersSnap.empty) {
        ordersSnap.forEach((doc) => {
          const order = doc.data();
          const orderUp = order.updatedAt || order.createdAt || '';
          const docId = doc.id;

          if (orderUp > latestInitUpdatedAt) {
            latestInitUpdatedAt = orderUp;
            initDocIdsAtLatestTimestamp = [docId];
          } else if (orderUp === latestInitUpdatedAt) {
            initDocIdsAtLatestTimestamp.push(docId);
          }

          grossEarned += calculateEarnedFromOrder(order, sellerId);
        });
      }

      const activeRefundOrderIds = new Set<string>();
      const refundsSnap = await applyQueryLimit(
        adminDb
          .collection('refundRequests')
          .where('sellerId', '==', sellerId),
        200
      ).get();

      if (!refundsSnap.empty) {
        refundsSnap.forEach((doc: any) => {
          const ref = doc.data();
          if (ref.status === 'REFUNDED' || ['REFUND_APPROVED', 'REFUND_REQUESTED', 'pending'].includes(ref.status)) {
            const amt = parseStrictPositiveNumber(ref.amount, `historical refund #${doc.id} amount for seller ${sellerId}`);
            const rOrderId = ref.orderId ? String(ref.orderId) : '';
            const rKey = ref.subOrderId ? `${rOrderId}_${ref.subOrderId}` : rOrderId;
            if (ref.status === 'REFUNDED') {
              refundedAmount += amt;
              if (rKey) activeRefundOrderIds.add(rKey);
            } else {
              pendingRefundAmount += amt;
              if (rKey) activeRefundOrderIds.add(rKey);
            }
          }
        });
      }

      // Active unresolved disputes freeze seller funds for the disputed order (Fail-Closed Dispute Freeze - NEW-06)
      const disputesColInit = adminDb.collection('disputes') as any;
      if (disputesColInit && typeof disputesColInit.where === 'function') {
        const activeDisputesSnap = await applyQueryLimit(
          disputesColInit.where('sellerId', '==', sellerId),
          200
        ).get();
        if (activeDisputesSnap && !activeDisputesSnap.empty && Array.isArray(activeDisputesSnap.docs)) {
          for (const dDoc of activeDisputesSnap.docs) {
            const disp = typeof dDoc.data === 'function' ? dDoc.data() : dDoc;
            if (disp && (disp.status === 'OPEN' || disp.status === 'SELLER_RESPONDED')) {
              const dispOrderId = disp.orderId ? String(disp.orderId) : '';
              const dispKey = disp.subOrderId ? `${dispOrderId}_${disp.subOrderId}` : dispOrderId;
              if ((dispOrderId && activeRefundOrderIds.has(dispOrderId)) || (dispKey && activeRefundOrderIds.has(dispKey))) {
                continue;
              }
              if (dispKey) activeRefundOrderIds.add(dispKey);
              const rawDispAmt = disp.disputedAmount !== undefined ? disp.disputedAmount : disp.refundAmount;
              if (rawDispAmt !== undefined && rawDispAmt !== null) {
                const explicitDisputedAmt = parseStrictPositiveNumber(rawDispAmt, `dispute #${dDoc.id || 'unknown'} disputedAmount`);
                pendingRefundAmount += explicitDisputedAmt;
              } else if (dispOrderId) {
                const ordSnap = await adminDb.collection('orders').doc(dispOrderId).get();
                if (ordSnap && ordSnap.exists) {
                  const ordData = ordSnap.data() || {};
                  if (disp.subOrderId && Array.isArray(ordData.vendorOrders)) {
                    const matchedVo = ordData.vendorOrders.find((vo: any) => vo.subOrderId === disp.subOrderId && vo.sellerId === sellerId);
                    if (matchedVo) {
                      const voEarned = matchedVo.sellerRevenue !== undefined && matchedVo.sellerRevenue !== null
                        ? parseStrictPositiveNumber(matchedVo.sellerRevenue, `disputed subOrder sellerRevenue`)
                        : parseStrictPositiveNumber(matchedVo.subtotal ?? matchedVo.total, `disputed subOrder subtotal`);
                      pendingRefundAmount += voEarned;
                      continue;
                    }
                  }
                  const earned = calculateEarnedFromOrder(ordData, sellerId);
                  if (earned > 0) {
                    pendingRefundAmount += earned;
                  } else if (Array.isArray(ordData.vendorOrders) && ordData.vendorOrders.length > 0) {
                    const sellerSubTotal = ordData.vendorOrders
                      .filter((vo: any) => vo.sellerId === sellerId)
                      .reduce((sum: number, vo: any) => sum + parseStrictPositiveNumber(vo.subtotal ?? vo.total, `disputed vendorOrder subtotal`), 0);
                    pendingRefundAmount += sellerSubTotal > 0 ? sellerSubTotal : parseStrictPositiveNumber(ordData.total, `disputed order total`);
                  } else {
                    pendingRefundAmount += parseStrictPositiveNumber(ordData.total, `disputed order total`);
                  }
                }
              }
            }
          }
        }
      }

      const payoutsSnap = await applyQueryLimit(
        adminDb
          .collection('payoutRequests')
          .where('sellerId', '==', sellerId),
        200
      ).get();

      if (!payoutsSnap.empty) {
        payoutsSnap.forEach((doc) => {
          const p = doc.data();
          if (['processed', 'paid', 'pending', 'approved'].includes(p.status)) {
            const amt = parseStrictPositiveNumber(p.amount, `historical payout #${doc.id} amount for seller ${sellerId}`);
            if (['processed', 'paid'].includes(p.status)) {
              settledPayout += amt;
            } else {
              reservedPayout += amt;
            }
          }
        });
      }

      // Persist the initial authoritative ledger document (OPEN-06 & V3-08)
      await ledgerRef.set({
        sellerId,
        lifetimeGrossEarned: Number(grossEarned.toFixed(2)),
        lifetimeSettledRefunds: Number(refundedAmount.toFixed(2)),
        lifetimeSettledPayouts: Number(settledPayout.toFixed(2)),
        lastReconciledAt: latestInitUpdatedAt,
        reconciledDocIdsAtTimestamp: initDocIdsAtLatestTimestamp,
        version: 1,
      });
    }
  } catch (err: any) {
    console.error(`[FinancialSummary:Error] Failed to calculate authoritative summary for seller ${sellerId}:`, err);
    throw new Error('Database query failure while verifying earnings. Operation aborted (Fail-Closed).');
  }

  grossEarned = Number.isFinite(grossEarned) ? Number(grossEarned.toFixed(2)) : 0;
  refundedAmount = Number.isFinite(refundedAmount) ? Number(refundedAmount.toFixed(2)) : 0;
  pendingRefundAmount = Number.isFinite(pendingRefundAmount) ? Number(pendingRefundAmount.toFixed(2)) : 0;
  const totalRefundCommitment = Number((refundedAmount + pendingRefundAmount).toFixed(2));
  settledPayout = Number.isFinite(settledPayout) ? Number(settledPayout.toFixed(2)) : 0;
  reservedPayout = Number.isFinite(reservedPayout) ? Number(reservedPayout.toFixed(2)) : 0;
  const totalPayoutCommitment = Number((settledPayout + reservedPayout).toFixed(2));

  // 4. Formula: Available = grossEarned - (settled + pending refunds) - (settled + reserved payouts)
  const netEarnings = Math.max(0, grossEarned - totalRefundCommitment);
  const rawBalance = netEarnings - totalPayoutCommitment;
  const availableBalance = Number.isFinite(rawBalance) ? Math.max(0, Number(rawBalance.toFixed(2))) : 0;

  return {
    sellerId,
    grossEarned,
    refundedAmount,
    pendingRefundAmount,
    totalRefundCommitment,
    settledPayout,
    reservedPayout,
    totalPayoutCommitment,
    availableBalance,
    calculatedAt: now,
  };
}

/**
 * Gateway endpoint handler for GET /api/seller/financial-summary
 */
export async function getSellerFinancialSummaryGateway(
  sellerId: string,
  authHeader?: string
): Promise<SellerFinancialSummary> {
  if (!sellerId) {
    throw new Error('Seller ID is required');
  }

  if (!authHeader) {
    throw new Error('Authentication required: Bearer token is missing');
  }

  const caller = await requireAuthenticatedCaller(authHeader);
  if (!caller.emailVerified) {
    throw new Error('Forbidden: Access to financial statements requires a verified email address');
  }
  const isPlatformAdmin = caller.isPlatformAdmin;
  if (!isPlatformAdmin && caller.uid !== sellerId) {
    throw new Error('Forbidden: You can only view financial summary for your own seller account');
  }

  const adminDb = getAdminDb();
  return await calculateSellerFinancialSummary(sellerId, adminDb);
}

export interface CreatePayoutGatewayRequest {
  sellerId: string;
  storeId?: string;
  sellerName?: string;
  storeName?: string;
  amount: number;
  paymentMethod: 'zaad' | 'evc_plus' | 'sahall' | 'bank_transfer';
  accountNumber: string;
  accountName: string;
  notes?: string;
  idempotencyKey?: string;
}

// In-flight mutex per sellerId with TTL to prevent simultaneous double-withdrawal race conditions and deadlocks
const IN_FLIGHT_PAYOUT_TTL_MS = 60 * 1000; // 60 seconds TTL
const inFlightSellerPayouts = new Map<string, number>();

function acquireSellerPayoutLock(sellerId: string): void {
  const now = Date.now();
  const existingTime = inFlightSellerPayouts.get(sellerId);
  if (existingTime && (now - existingTime) < IN_FLIGHT_PAYOUT_TTL_MS) {
    throw new Error('A payout request for this seller account is currently being processed. Please wait.');
  }
  inFlightSellerPayouts.set(sellerId, now);
}

function releaseSellerPayoutLock(sellerId: string): void {
  inFlightSellerPayouts.delete(sellerId);
}

export async function processPayoutGateway(
  payload: CreatePayoutGatewayRequest,
  authHeader?: string
): Promise<{ success: boolean; payout: PayoutRequest; replayed?: boolean }> {
  // 1. Authenticate Caller
  if (!authHeader) {
    throw new Error('Authentication required: Bearer token is missing');
  }

  const caller = await requireAuthenticatedCaller(authHeader);
  const callerUid = caller.uid;
  const isPlatformAdmin = caller.isPlatformAdmin;

  // SEC-01: Financial operations (payouts) strictly require verified email
  if (!caller.emailVerified) {
    throw new Error('Forbidden: Payout requests strictly require a verified email address');
  }

  // Anti-Spoofing: Caller must be the seller or a platform admin
  const targetSellerId = (payload.sellerId || callerUid).trim();
  if (!isPlatformAdmin && targetSellerId !== callerUid) {
    throw new Error('Forbidden: You can only request payouts for your own seller account');
  }

  // 2. Input Validation
  const rawAmtVal = payload.amount;
  const amount = (rawAmtVal === null || rawAmtVal === undefined || (rawAmtVal as any) === '' || typeof rawAmtVal === 'boolean')
    ? NaN
    : Number(rawAmtVal);
  if (isNaN(amount) || amount <= 0 || !Number.isFinite(amount)) {
    throw new Error('Invalid payout amount. Amount must be a positive number.');
  }

  if (amount > 50000) {
    throw new Error('Payout request exceeds maximum limit ($50,000)');
  }

  const cleanAccountNumber = payload.accountNumber?.trim();
  if (!cleanAccountNumber || cleanAccountNumber.length < 4) {
    throw new Error('Account number is required and must contain at least 4 digits');
  }

  const cleanAccountName = payload.accountName?.trim();
  if (!cleanAccountName) {
    throw new Error('Account name is required');
  }

  const sellerId = targetSellerId;
  const idempotencyKey = payload.idempotencyKey ? String(payload.idempotencyKey).trim() : '';
  const operationFingerprint = `${sellerId}:${amount.toFixed(2)}:${payload.paymentMethod}:${cleanAccountNumber}`;

  // Concurrency Guard: Block concurrent requests for the same seller
  acquireSellerPayoutLock(sellerId);
  let lockOwned = true;

  try {
    const adminDb = getAdminDb();

    // PART 6: Authoritative Identity Resolution from Firestore (Do not trust client input)
    let authoritativeSellerName = caller.token?.name || 'Merchant';
    try {
      const userSnap = await adminDb.collection('users').doc(sellerId).get();
      if (userSnap.exists) {
        authoritativeSellerName = userSnap.data()?.name || authoritativeSellerName;
      }
    } catch (e) {
      console.warn('[PayoutGateway] Could not read user doc for sellerName:', e);
    }

    let authoritativeStoreId = payload.storeId || '';
    let authoritativeStoreName = payload.storeName || '';
    try {
      const storesSnap = await adminDb.collection('stores').where('sellerId', '==', sellerId).limit(1).get();
      if (!storesSnap.empty) {
        authoritativeStoreId = storesSnap.docs[0].id;
        const storeData = storesSnap.docs[0].data();
        authoritativeStoreName = typeof storeData?.name === 'string' ? storeData.name : (storeData?.name?.ar || storeData?.name?.en || 'Store');
      }
    } catch (e) {
      console.warn('[PayoutGateway] Could not read store doc for storeName:', e);
    }

    // PART 5: Atomic Payout Reservation using Firestore Transaction on seller lock
    const payoutId = `payout_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const now = new Date().toISOString();
    const lockRef = adminDb.collection('seller_payout_locks').doc(sellerId);
    const idempotencyRef = idempotencyKey
      ? adminDb.collection('idempotency_keys').doc(`payout_${sellerId}_${idempotencyKey}`)
      : null;

    // Fast-path idempotency check before computing summary (ensures replayed requests don't fail against their own reserved balance)
    if (idempotencyRef) {
      const preIdemSnap = await idempotencyRef.get();
      if (preIdemSnap.exists) {
        const idemData = preIdemSnap.data() || {};
        if (idemData.fingerprint && idemData.fingerprint !== operationFingerprint) {
          const conflictErr = new Error('Idempotency key conflict: Key already used with different payout parameters.') as any;
          conflictErr.statusCode = 409;
          throw conflictErr;
        }
        const currentLockSnap = await lockRef.get();
        const currentLockData = currentLockSnap.exists ? (currentLockSnap.data() || {}) : {};
        const currentDisputeFrozen = typeof currentLockData.totalDisputeFrozen === 'number' ? currentLockData.totalDisputeFrozen : 0;
        if (currentDisputeFrozen > 0) {
          const checkSum = await calculateSellerFinancialSummary(sellerId, adminDb);
          const otherPayouts = Math.max(0, checkSum.totalPayoutCommitment - amount);
          const availForThis = Math.max(0, checkSum.grossEarned - checkSum.totalRefundCommitment - otherPayouts);
          if (amount > availForThis + 0.001) {
            throw new Error('Cannot replay payout: Seller funds have been frozen by an active dispute.');
          }
        }
        return {
          success: true,
          payout: idemData.payout as PayoutRequest,
          replayed: true,
        };
      }
    }

    // 3. Authoritative Balance Verification via Single Authoritative Engine (FIN-01, FIN-02)
    const summary = await calculateSellerFinancialSummary(sellerId, adminDb);
    const totalEarned = summary.grossEarned;
    const totalRefunds = summary.totalRefundCommitment;
    const baselineHistoricalReservedOrPaid = summary.totalPayoutCommitment;

    let replayedResult = false;
    const result = await adminDb.runTransaction(async (transaction) => {
      // Step A0: Check transactional idempotency key first (all reads before writes)
      if (idempotencyRef) {
        const idemDoc = await transaction.get(idempotencyRef);
        if (idemDoc.exists) {
          const idemData = idemDoc.data() || {};
          if (idemData.fingerprint && idemData.fingerprint !== operationFingerprint) {
            const conflictErr = new Error('Idempotency key conflict: Key already used with different payout parameters.') as any;
            conflictErr.statusCode = 409;
            throw conflictErr;
          }
          // Re-verify that no new dispute froze the seller's funds since idempotency record creation (NEW-06 #9)
          const currentLockSnap = await transaction.get(lockRef);
          const currentLockData = currentLockSnap.exists ? (currentLockSnap.data() || {}) : {};
          const currentDisputeFrozen = typeof currentLockData.totalDisputeFrozen === 'number' ? currentLockData.totalDisputeFrozen : 0;
          if (currentDisputeFrozen > 0 && summary.availableBalance < 0) {
            throw new Error('Cannot replay payout: Seller funds have been frozen by an active dispute.');
          }
          replayedResult = true;
          return idemData.payout as PayoutRequest;
        }
      }

      // Step A: Read seller payout lock strictly via transaction.get
      const lockDoc = await transaction.get(lockRef);

      // Step A2: Transactional active disputes query inside transaction to prevent TOCTOU race condition (NEW-06 #5 & #6)
      let txActiveDisputeFrozen = 0;
      const disputesColTx = adminDb.collection('disputes') as any;
      if (disputesColTx && typeof disputesColTx.where === 'function') {
        const dispQuery = applyQueryLimit(disputesColTx.where('sellerId', '==', sellerId), 200);
        const txDisputesSnap = typeof (transaction as any).get === 'function'
          ? await (transaction as any).get(dispQuery).catch(() => dispQuery.get())
          : await dispQuery.get();
        if (txDisputesSnap && !txDisputesSnap.empty && Array.isArray(txDisputesSnap.docs)) {
          for (const dDoc of txDisputesSnap.docs) {
            const disp = typeof dDoc.data === 'function' ? dDoc.data() : dDoc;
            if (disp && (disp.status === 'OPEN' || disp.status === 'SELLER_RESPONDED')) {
              const rawDispAmt = disp.disputedAmount !== undefined ? disp.disputedAmount : disp.refundAmount;
              if (rawDispAmt !== undefined && rawDispAmt !== null) {
                txActiveDisputeFrozen += parseStrictPositiveNumber(rawDispAmt, `tx dispute #${dDoc.id || 'unknown'} disputedAmount`);
              } else if (disp.orderId) {
                const ordRef = adminDb.collection('orders').doc(String(disp.orderId));
                const ordSnap = await transaction.get(ordRef);
                if (ordSnap && ordSnap.exists) {
                  const ordData = ordSnap.data() || {};
                  if (disp.subOrderId && Array.isArray(ordData.vendorOrders)) {
                    const matchedVo = ordData.vendorOrders.find((vo: any) => vo.subOrderId === disp.subOrderId && vo.sellerId === sellerId);
                    if (matchedVo) {
                      const voEarned = matchedVo.sellerRevenue !== undefined && matchedVo.sellerRevenue !== null
                        ? parseStrictPositiveNumber(matchedVo.sellerRevenue, `disputed subOrder sellerRevenue`)
                        : parseStrictPositiveNumber(matchedVo.subtotal ?? matchedVo.total, `disputed subOrder subtotal`);
                      txActiveDisputeFrozen += voEarned;
                      continue;
                    }
                  }
                  const earned = calculateEarnedFromOrder(ordData, sellerId);
                  txActiveDisputeFrozen += earned > 0 ? earned : parseStrictPositiveNumber(ordData.total, `disputed order total`);
                }
              }
            }
          }
        }
      }

      let totalReservedOrPaid = baselineHistoricalReservedOrPaid;
      let totalRefundsReserved = 0;
      let totalDisputeFrozen = txActiveDisputeFrozen;

      // If lockDoc has a more recent reserved amount, factor it in (OPEN-07 & NEW-06)
      if (lockDoc.exists) {
        const lockData = lockDoc.data() || {};
        if (lockData.totalReserved !== undefined) {
          const parsedReserved = parseStrictNonNegativeNumber(lockData.totalReserved, `seller_payout_locks.totalReserved (${sellerId})`);
          if (parsedReserved > totalReservedOrPaid) {
            totalReservedOrPaid = parsedReserved;
          }
        }
        if (lockData.totalRefundReserved !== undefined) {
          totalRefundsReserved = parseStrictNonNegativeNumber(lockData.totalRefundReserved, `seller_payout_locks.totalRefundReserved (${sellerId})`);
        }
        if (lockData.totalDisputeFrozen !== undefined) {
          const parsedDispFrozen = parseStrictNonNegativeNumber(lockData.totalDisputeFrozen, `seller_payout_locks.totalDisputeFrozen (${sellerId})`);
          totalDisputeFrozen = Math.max(totalDisputeFrozen, parsedDispFrozen);
        }
      }

      // Unified durable accounting: factor in in-flight refund reservations AND active dispute freezes concurrently (OPEN-07 & NEW-06)
      const combinedRefunds = Math.max(totalRefunds, summary.refundedAmount + Math.max(summary.pendingRefundAmount, totalRefundsReserved + totalDisputeFrozen), totalRefundsReserved + totalDisputeFrozen);
      const netEarned = Math.max(0, totalEarned - combinedRefunds);
      const rawBalance = netEarned - totalReservedOrPaid;
      const availableBalance = Number.isFinite(rawBalance) ? Math.max(0, rawBalance) : 0;

      if (!Number.isFinite(availableBalance) || amount > availableBalance + 0.001) {
        throw new Error(
          `قيمة السحب المطلوبة ($${amount.toFixed(2)}) تتجاوز الرصيد المتاح ($${availableBalance.toFixed(2)}). Requested payout amount exceeds verified available balance.`
        );
      }

      const newReserved = Number((totalReservedOrPaid + amount).toFixed(2));

      const maskedAccount = cleanAccountNumber.length > 4
        ? `${'*'.repeat(Math.min(cleanAccountNumber.length - 4, 8))}${cleanAccountNumber.slice(-4)}`
        : `****${cleanAccountNumber.slice(-2)}`;

      const newPayout: PayoutRequest = {
        id: payoutId,
        sellerId,
        storeId: authoritativeStoreId,
        sellerName: authoritativeSellerName,
        storeName: authoritativeStoreName,
        amount,
        paymentMethod: payload.paymentMethod,
        settlementType: 'MANUAL_SETTLEMENT',
        accountNumber: maskedAccount,
        accountName: cleanAccountName,
        status: 'pending',
        requestedAt: now,
        notes: payload.notes?.trim() || undefined,
      };

      // Atomic update of lock doc
      transaction.set(lockRef, {
        sellerId,
        totalReserved: newReserved,
        totalRefundReserved: totalRefundsReserved,
        totalDisputeFrozen,
        lastPayoutId: payoutId,
        lastAmount: amount,
        updatedAt: now,
      }, { merge: true });

      // Atomic persistence of payout doc (with masked account number for seller safety)
      const payoutDocRef = adminDb.collection('payoutRequests').doc(payoutId);
      transaction.set(payoutDocRef, newPayout);

      // P1-PAYOUT-DATA: Persist full destination securely in admin-only settlement store
      const settlementDestRef = adminDb.collection('payout_settlement_destinations').doc(payoutId);
      transaction.set(settlementDestRef, {
        payoutId,
        sellerId,
        paymentMethod: payload.paymentMethod,
        fullAccountNumber: cleanAccountNumber,
        accountName: cleanAccountName,
        createdAt: now,
      });

      if (idempotencyRef) {
        transaction.set(idempotencyRef, {
          idempotencyKey,
          fingerprint: operationFingerprint,
          payout: newPayout,
          sellerId,
          createdAt: now,
        });
      }

      return newPayout;
    });

    return {
      success: true,
      payout: result,
      ...(replayedResult ? { replayed: true } : {}),
    };
  } catch (err: any) {
    console.error(`[PayoutGateway:Error] Failed to process payout for seller ${sellerId}:`, err?.message || err);
    throw err;
  } finally {
    releaseSellerPayoutLock(sellerId);
  }
}

export interface ReviewPayoutPayload {
  payoutId: string;
  newStatus: 'pending' | 'approved' | 'paid' | 'rejected';
  notes?: string;
}

/**
 * Authoritative Payout Review Gateway (P1-RBAC-02)
 * Ensures single authoritative role policy and terminal state immutability.
 */
export async function processPayoutReviewGateway(
  payload: ReviewPayoutPayload,
  authHeader?: string
) {
  const caller = await requireVerifiedPlatformAdmin(authHeader);
  const payoutId = (payload.payoutId || '').trim();
  const newStatus = payload.newStatus;
  const notes = payload.notes?.trim();

  if (!payoutId) {
    const err = new Error('رقم طلب السحب مطلوب.');
    (err as any).statusCode = 400;
    throw err;
  }

  const validStatuses = ['pending', 'approved', 'paid', 'rejected'];
  if (!validStatuses.includes(newStatus)) {
    const err = new Error(`حالة طلب السحب غير صالحة: ${newStatus}`);
    (err as any).statusCode = 400;
    throw err;
  }

  const adminDb = getAdminDb();
  const now = new Date().toISOString();

  // Pre-fetch payout to resolve sellerId and run financial summary outside the outer transaction
  // (Prevents nested transaction lock deadlock on seller_financial_ledgers/{sellerId})
  const prePayoutSnap = await adminDb.collection('payoutRequests').doc(payoutId).get();
  if (!prePayoutSnap.exists) {
    const err = new Error(`طلب السحب ${payoutId} غير موجود.`);
    (err as any).statusCode = 404;
    throw err;
  }
  const prePayout = prePayoutSnap.data() as PayoutRequest;
  const freshSummary = (newStatus === 'approved' || newStatus === 'paid')
    ? await calculateSellerFinancialSummary(prePayout.sellerId, adminDb)
    : null;

  const result = await adminDb.runTransaction(async (transaction) => {
    const payoutRef = adminDb.collection('payoutRequests').doc(payoutId);
    const payoutDoc = await transaction.get(payoutRef);
    if (!payoutDoc.exists) {
      const err = new Error(`طلب السحب ${payoutId} غير موجود.`);
      (err as any).statusCode = 404;
      throw err;
    }

    const prev = payoutDoc.data() as PayoutRequest;

    // State machine integrity check: Terminal states (paid/rejected) are immutable and cannot be reopened
    if (prev.status === 'paid' && newStatus !== 'paid') {
      const err = new Error('Cannot modify terminal paid payout: لا يمكن تعديل طلب سحب مكتمل');
      (err as any).statusCode = 400;
      throw err;
    }
    if (prev.status === 'rejected' && newStatus !== 'rejected') {
      const err = new Error('Cannot modify terminal rejected payout: لا يمكن تعديل طلب سحب مرفوض');
      (err as any).statusCode = 400;
      throw err;
    }

    // Read lock and ledger documents within transaction (all reads first)
    const lockRef = adminDb.collection('seller_payout_locks').doc(prev.sellerId);
    const ledgerRef = adminDb.collection('seller_financial_ledgers').doc(prev.sellerId);
    const lockDoc = await transaction.get(lockRef);
    const ledgerDoc = await transaction.get(ledgerRef);

    // NEW-06: Before approving or paying a pending/approved payout, re-verify available balance
    // including any disputes or refunds created after the payout was initially requested!
    const verifiedPayoutAmount = parseStrictPositiveNumber(prev.amount, `payout #${payoutId} amount`);
    if ((newStatus === 'approved' || newStatus === 'paid') && freshSummary) {
      const lockData = lockDoc.exists ? (lockDoc.data() || {}) : {};
      const lockRefunds = lockData.totalRefundReserved !== undefined
        ? parseStrictNonNegativeNumber(lockData.totalRefundReserved, `seller_payout_locks.totalRefundReserved (${prev.sellerId})`)
        : 0;
      const lockDisputes = lockData.totalDisputeFrozen !== undefined
        ? parseStrictNonNegativeNumber(lockData.totalDisputeFrozen, `seller_payout_locks.totalDisputeFrozen (${prev.sellerId})`)
        : 0;
      const combinedRefunds = Math.max(freshSummary.totalRefundCommitment, lockRefunds + lockDisputes);
      const netEarnedAfterDisputes = Math.max(0, freshSummary.grossEarned - combinedRefunds);
      // Total payout commitment already includes this payout if prev.status is 'pending' or 'approved'
      const otherPayoutsCommitted = Math.max(0, freshSummary.totalPayoutCommitment - (['pending', 'approved'].includes(prev.status) ? verifiedPayoutAmount : 0));
      const availableForThisPayout = Math.max(0, Number((netEarnedAfterDisputes - otherPayoutsCommitted).toFixed(2)));
      if (verifiedPayoutAmount > availableForThisPayout + 0.001) {
        const err = new Error(
          `Cannot ${newStatus} payout ($${verifiedPayoutAmount.toFixed(2)}): Seller funds are frozen by active disputes or refunds (Available: $${availableForThisPayout.toFixed(2)}).`
        ) as any;
        err.statusCode = 409;
        throw err;
      }
    }

    const updated: PayoutRequest = {
      ...prev,
      status: newStatus as any,
      notes: notes || prev.notes,
      reviewedBy: caller.uid,
      processedAt: newStatus === 'paid' || newStatus === 'approved' ? now : prev.processedAt,
    };

    transaction.set(payoutRef, updated, { merge: true });

    // Finding 5: Release durable in-flight lock ONLY upon terminal rejection.
    // When 'paid', totalReserved represents cumulative reserved+paid payouts until reconciled,
    // and we also atomically increment lifetimeSettledPayouts on seller_financial_ledgers so double-withdrawal is impossible!
    if (newStatus === 'rejected' && lockDoc.exists) {
      const lockData = lockDoc.data() || {};
      const currentTotalReserved = lockData.totalReserved !== undefined
        ? parseStrictNonNegativeNumber(lockData.totalReserved, `seller_payout_locks.totalReserved (${prev.sellerId})`)
        : 0;
      const releasedReserved = Math.max(0, Number((currentTotalReserved - verifiedPayoutAmount).toFixed(2)));
      transaction.set(lockRef, {
        totalReserved: releasedReserved,
        lastRejectedPayoutId: payoutId,
        updatedAt: now,
      }, { merge: true });
    } else if (newStatus === 'paid') {
      if (lockDoc.exists) {
        transaction.set(lockRef, {
          lastPaidPayoutId: payoutId,
          updatedAt: now,
        }, { merge: true });
      }
      if (ledgerDoc.exists) {
        const ledgerData = ledgerDoc.data() as SellerFinancialLedgerDoc;
        const currentSettledPayouts = ledgerData.lifetimeSettledPayouts !== undefined
          ? parseStrictNonNegativeNumber(ledgerData.lifetimeSettledPayouts, `ledger.lifetimeSettledPayouts (${prev.sellerId})`)
          : 0;
        const nextSettledPayouts = Number((currentSettledPayouts + verifiedPayoutAmount).toFixed(2));
        transaction.set(ledgerRef, {
          lifetimeSettledPayouts: nextSettledPayouts,
          version: (ledgerData.version || 1) + 1,
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
      action: `PAYOUT_${newStatus.toUpperCase()}`,
      targetType: 'payout',
      targetId: payoutId,
      targetName: `Payout to ${prev.sellerName || prev.accountName} ($${prev.amount})`,
      timestamp: now,
      metadata: { method: prev.paymentMethod, amount: prev.amount, notes },
    });

    return updated;
  });

  return { success: true, payout: result };
}
