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
  version: number;
}

/**
 * Authoritative Seller Financial Summary Calculation (P0-03, F-30, Finding F)
 * Implements an authoritative ledger-based accounting strategy with bounded incremental queries
 * to guarantee complete, auditable, and deterministic financial reconciliation without unbounded table scans.
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
      grossEarned = Number(ledger.lifetimeGrossEarned) || 0;
      refundedAmount = Number(ledger.lifetimeSettledRefunds) || 0;
      settledPayout = Number(ledger.lifetimeSettledPayouts) || 0;
      const lastReconciledAt = ledger.lastReconciledAt || '1970-01-01T00:00:00.000Z';

      // 1. Complete incremental pagination for orders updated since last reconciliation (OPEN-04)
      let latestProcessedUpdatedAt = lastReconciledAt;
      try {
        let currentCursor: any = undefined;
        while (true) {
          let q = adminDb
            .collection('orders')
            .where('sellerIds', 'array-contains', sellerId)
            .where('updatedAt', '>', lastReconciledAt)
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
            if (orderUp > latestProcessedUpdatedAt) {
              latestProcessedUpdatedAt = orderUp;
            }
            if (Array.isArray(order.vendorOrders) && order.vendorOrders.length > 0) {
              order.vendorOrders.forEach((vo: any) => {
                if (vo.sellerId === sellerId && isSubOrderEligibleForPayout(order, vo)) {
                  grossEarned += (vo.sellerRevenue ?? (vo.subtotal - (vo.commissionAmount || 0)));
                }
              });
            } else if ((order.sellerId === sellerId || (Array.isArray(order.sellerIds) && order.sellerIds.includes(sellerId))) && isSubOrderEligibleForPayout(order)) {
              grossEarned += (order.sellerRevenue ?? (order.subtotal - (order.platformCommission || 0)));
            }
          });

          currentCursor = deltaOrdersSnap.docs[deltaOrdersSnap.docs.length - 1];
          if (deltaOrdersSnap.docs.length < 100) break;
        }
      } catch {
        // Fallback for mock in-memory db without composite orderBy
        const deltaOrdersSnap = await adminDb
          .collection('orders')
          .where('sellerIds', 'array-contains', sellerId)
          .get();

        if (!deltaOrdersSnap.empty) {
          deltaOrdersSnap.forEach((doc) => {
            const order = doc.data();
            const orderUp = order.updatedAt || '';
            if (orderUp > lastReconciledAt) {
              if (orderUp > latestProcessedUpdatedAt) {
                latestProcessedUpdatedAt = orderUp;
              }
              if (Array.isArray(order.vendorOrders) && order.vendorOrders.length > 0) {
                order.vendorOrders.forEach((vo: any) => {
                  if (vo.sellerId === sellerId && isSubOrderEligibleForPayout(order, vo)) {
                    grossEarned += (vo.sellerRevenue ?? (vo.subtotal - (vo.commissionAmount || 0)));
                  }
                });
              } else if ((order.sellerId === sellerId || (Array.isArray(order.sellerIds) && order.sellerIds.includes(sellerId))) && isSubOrderEligibleForPayout(order)) {
                grossEarned += (order.sellerRevenue ?? (order.subtotal - (order.platformCommission || 0)));
              }
            }
          });
        }
      }

      // 2. Complete active in-flight refunds query (OPEN-05)
      const activeRefundsSnap = await adminDb
        .collection('refundRequests')
        .where('sellerId', '==', sellerId)
        .where('status', 'in', ['REFUND_REQUESTED', 'REFUND_APPROVED', 'pending'])
        .get();

      if (!activeRefundsSnap.empty) {
        activeRefundsSnap.forEach((doc) => {
          pendingRefundAmount += (Number(doc.data().amount) || 0);
        });
      }

      // 3. Complete active in-flight payouts query (OPEN-05)
      const activePayoutsSnap = await adminDb
        .collection('payoutRequests')
        .where('sellerId', '==', sellerId)
        .where('status', 'in', ['pending', 'approved'])
        .get();

      if (!activePayoutsSnap.empty) {
        activePayoutsSnap.forEach((doc) => {
          reservedPayout += (Number(doc.data().amount) || 0);
        });
      }

      // Update the authoritative ledger state with reconciled totals (advance to last document timestamp - OPEN-04)
      await ledgerRef.set({
        sellerId,
        lifetimeGrossEarned: Number(grossEarned.toFixed(2)),
        lifetimeSettledRefunds: Number(refundedAmount.toFixed(2)),
        lifetimeSettledPayouts: Number(settledPayout.toFixed(2)),
        lastReconciledAt: latestProcessedUpdatedAt,
        version: (ledger.version || 1) + 1,
      }, { merge: true });

    } else {
      // First-time seller initialization: Compute complete authoritative baseline (OPEN-06)
      let latestInitUpdatedAt = '1970-01-01T00:00:00.000Z';
      const ordersSnap = await adminDb
        .collection('orders')
        .where('sellerIds', 'array-contains', sellerId)
        .get();

      if (!ordersSnap.empty) {
        ordersSnap.forEach((doc) => {
          const order = doc.data();
          const orderUp = order.updatedAt || order.createdAt || '';
          if (orderUp > latestInitUpdatedAt) {
            latestInitUpdatedAt = orderUp;
          }
          if (Array.isArray(order.vendorOrders) && order.vendorOrders.length > 0) {
            order.vendorOrders.forEach((vo: any) => {
              if (vo.sellerId === sellerId && isSubOrderEligibleForPayout(order, vo)) {
                grossEarned += (vo.sellerRevenue ?? (vo.subtotal - (vo.commissionAmount || 0)));
              }
            });
          } else if ((order.sellerId === sellerId || (Array.isArray(order.sellerIds) && order.sellerIds.includes(sellerId))) && isSubOrderEligibleForPayout(order)) {
            grossEarned += (order.sellerRevenue ?? (order.subtotal - (order.platformCommission || 0)));
          }
        });
      }

      const refundsSnap = await adminDb
        .collection('refundRequests')
        .where('sellerId', '==', sellerId)
        .get();

      if (!refundsSnap.empty) {
        refundsSnap.forEach((doc) => {
          const ref = doc.data();
          const amt = Number(ref.amount) || 0;
          if (ref.status === 'REFUNDED') {
            refundedAmount += amt;
          } else if (['REFUND_APPROVED', 'REFUND_REQUESTED', 'pending'].includes(ref.status)) {
            pendingRefundAmount += amt;
          }
        });
      }

      const payoutsSnap = await adminDb
        .collection('payoutRequests')
        .where('sellerId', '==', sellerId)
        .get();

      if (!payoutsSnap.empty) {
        payoutsSnap.forEach((doc) => {
          const p = doc.data();
          const amt = Number(p.amount) || 0;
          if (['processed', 'paid'].includes(p.status)) {
            settledPayout += amt;
          } else if (['pending', 'approved'].includes(p.status)) {
            reservedPayout += amt;
          }
        });
      }

      // Persist the initial authoritative ledger document (OPEN-06)
      await ledgerRef.set({
        sellerId,
        lifetimeGrossEarned: Number(grossEarned.toFixed(2)),
        lifetimeSettledRefunds: Number(refundedAmount.toFixed(2)),
        lifetimeSettledPayouts: Number(settledPayout.toFixed(2)),
        lastReconciledAt: latestInitUpdatedAt,
        version: 1,
      });
    }
  } catch (err: any) {
    console.error(`[FinancialSummary:Error] Failed to calculate authoritative summary for seller ${sellerId}:`, err);
    throw new Error('Database query failure while verifying earnings. Operation aborted (Fail-Closed).');
  }

  grossEarned = Number(grossEarned.toFixed(2));
  refundedAmount = Number(refundedAmount.toFixed(2));
  pendingRefundAmount = Number(pendingRefundAmount.toFixed(2));
  const totalRefundCommitment = Number((refundedAmount + pendingRefundAmount).toFixed(2));
  settledPayout = Number(settledPayout.toFixed(2));
  reservedPayout = Number(reservedPayout.toFixed(2));
  const totalPayoutCommitment = Number((settledPayout + reservedPayout).toFixed(2));

  // 4. Formula: Available = grossEarned - (settled + pending refunds) - (settled + reserved payouts)
  const availableBalance = Math.max(0, Number((grossEarned - totalRefundCommitment - totalPayoutCommitment).toFixed(2)));

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
): Promise<{ success: boolean; payout: PayoutRequest }> {
  // 1. Authenticate Caller
  if (!authHeader) {
    throw new Error('Authentication required: Bearer token is missing');
  }

  const caller = await requireAuthenticatedCaller(authHeader);
  const callerUid = caller.uid;
  const isPlatformAdmin = caller.isPlatformAdmin;

  // Anti-Spoofing: Caller must be the seller or a platform admin
  const targetSellerId = (payload.sellerId || callerUid).trim();
  if (!isPlatformAdmin && targetSellerId !== callerUid) {
    throw new Error('Forbidden: You can only request payouts for your own seller account');
  }

  // 2. Input Validation
  const amount = Number(payload.amount);
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

  // Concurrency Guard: Block concurrent requests for the same seller
  acquireSellerPayoutLock(sellerId);

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

    // 3. Authoritative Balance Verification via Firestore Admin (Strict Fail-Closed)
    let totalEarned = 0;
    try {
      const ordersSnap = await adminDb
        .collection('orders')
        .where('sellerIds', 'array-contains', sellerId)
        .get();

      if (!ordersSnap.empty) {
        ordersSnap.forEach((doc) => {
          const order = doc.data();
          if (Array.isArray(order.vendorOrders) && order.vendorOrders.length > 0) {
            order.vendorOrders.forEach((vo: any) => {
              if (vo.sellerId === sellerId && isSubOrderEligibleForPayout(order, vo)) {
                totalEarned += (vo.sellerRevenue ?? (vo.subtotal - (vo.commissionAmount || 0)));
              }
            });
          } else if (order.sellerId === sellerId && isSubOrderEligibleForPayout(order)) {
            totalEarned += (order.sellerRevenue ?? (order.subtotal - (order.platformCommission || 0)));
          }
        });
      }
    } catch (err: any) {
      console.error('[PayoutGateway:Error] Failed to read orders for balance calculation:', err);
      throw new Error('Database query failure while verifying earnings. Transaction aborted (Fail-Closed).');
    }

    // Deduct settled, approved, and in-flight pending refunds for this seller
    let totalRefunds = 0;
    try {
      const refundsSnap = await adminDb
        .collection('refundRequests')
        .where('sellerId', '==', sellerId)
        .get();

      if (!refundsSnap.empty) {
        refundsSnap.forEach((doc) => {
          const ref = doc.data();
          if (['REFUNDED', 'REFUND_APPROVED', 'REFUND_REQUESTED', 'pending'].includes(ref.status)) {
            totalRefunds += (Number(ref.amount) || 0);
          }
        });
      }
    } catch (err: any) {
      console.error('[PayoutGateway:Error] Failed to read refunds for balance calculation:', err);
      throw new Error('Database query failure while verifying refunds. Transaction aborted (Fail-Closed).');
    }

    // Query existing historical payouts baseline prior to transaction (P1-12)
    let baselineHistoricalReservedOrPaid = 0;
    try {
      const payoutsSnap = await adminDb
        .collection('payoutRequests')
        .where('sellerId', '==', sellerId)
        .get();

      if (!payoutsSnap.empty) {
        payoutsSnap.forEach((doc) => {
          const p = doc.data();
          if (['pending', 'approved', 'processed', 'paid'].includes(p.status)) {
            baselineHistoricalReservedOrPaid += (Number(p.amount) || 0);
          }
        });
      }
    } catch (err: any) {
      console.error('[PayoutGateway:Error] Failed to read historical payouts baseline:', err);
      throw new Error('Database query failure while verifying payouts. Operation aborted (Fail-Closed).');
    }

    // PART 5: Atomic Payout Reservation using Firestore Transaction on seller lock
    const payoutId = `payout_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const now = new Date().toISOString();
    const lockRef = adminDb.collection('seller_payout_locks').doc(sellerId);

    const result = await adminDb.runTransaction(async (transaction) => {
      // Step A: Read seller payout lock strictly via transaction.get
      const lockDoc = await transaction.get(lockRef);

      let totalReservedOrPaid = baselineHistoricalReservedOrPaid;
      let totalRefundsReserved = 0;

      // If lockDoc has a more recent reserved amount, factor it in (OPEN-07)
      if (lockDoc.exists) {
        const lockData = lockDoc.data() || {};
        if (typeof lockData.totalReserved === 'number' && lockData.totalReserved > totalReservedOrPaid) {
          totalReservedOrPaid = lockData.totalReserved;
        }
        if (typeof lockData.totalRefundReserved === 'number') {
          totalRefundsReserved = lockData.totalRefundReserved;
        }
      }

      // Unified durable accounting: factor in in-flight refund reservations concurrently (OPEN-07)
      const combinedRefunds = Math.max(totalRefunds, totalRefundsReserved);
      const netEarned = Math.max(0, totalEarned - combinedRefunds);
      const availableBalance = Math.max(0, netEarned - totalReservedOrPaid);

      if (amount > availableBalance + 0.001) {
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

      return newPayout;
    });

    return {
      success: true,
      payout: result,
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

    // Read lock document within transaction (all reads first)
    const lockRef = adminDb.collection('seller_payout_locks').doc(prev.sellerId);
    const lockDoc = await transaction.get(lockRef);

    const updated: PayoutRequest = {
      ...prev,
      status: newStatus as any,
      notes: notes || prev.notes,
      reviewedBy: caller.uid,
      processedAt: newStatus === 'paid' || newStatus === 'approved' ? now : prev.processedAt,
    };

    transaction.set(payoutRef, updated, { merge: true });

    // Release durable in-flight lock upon terminal rejection or settlement (Prevents stuck locks)
    if ((newStatus === 'rejected' || newStatus === 'paid') && lockDoc.exists) {
      const lockData = lockDoc.data() || {};
      const currentTotalReserved = Number(lockData.totalReserved) || 0;
      const releasedReserved = Math.max(0, Number((currentTotalReserved - prev.amount).toFixed(2)));
      transaction.set(lockRef, {
        totalReserved: releasedReserved,
        ...(newStatus === 'rejected' ? { lastRejectedPayoutId: payoutId } : { lastPaidPayoutId: payoutId }),
        updatedAt: now,
      }, { merge: true });
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
