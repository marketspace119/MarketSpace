import crypto from 'crypto';
import { getAdminDb, verifyFirebaseBearerToken, isCallerPlatformAdmin } from './firebaseAdmin';
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
 * Single Authoritative Financial Engine (Server-Side)
 * Computes exact earnings, refund commitments, payout commitments, and net available balance.
 * Fail-Closed: Throws on database query failure.
 */
export async function calculateSellerFinancialSummary(
  sellerId: string,
  adminDb: FirebaseFirestore.Firestore
): Promise<SellerFinancialSummary> {
  const now = new Date().toISOString();

  // 1. Authoritative Gross Earnings (Only paid, non-cancelled orders)
  let grossEarned = 0;
  try {
    const ordersSnap = await adminDb
      .collection('orders')
      .where('sellerIds', 'array-contains', sellerId)
      .get();

    if (!ordersSnap.empty) {
      ordersSnap.forEach((doc) => {
        const order = doc.data();
        if (order.paymentStatus === 'paid' && order.status !== 'cancelled') {
          if (Array.isArray(order.vendorOrders)) {
            order.vendorOrders.forEach((vo: any) => {
              if (vo.sellerId === sellerId) {
                grossEarned += (vo.sellerRevenue ?? (vo.subtotal - (vo.commissionAmount || 0)));
              }
            });
          }
        }
      });
    }
  } catch (err: any) {
    console.error(`[FinancialSummary:Error] Failed to read orders for seller ${sellerId}:`, err);
    throw new Error('Database query failure while verifying earnings. Operation aborted (Fail-Closed).');
  }

  grossEarned = Number(grossEarned.toFixed(2));

  // 2. Authoritative Refund Commitments
  let refundedAmount = 0;
  let pendingRefundAmount = 0;
  try {
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
  } catch (err: any) {
    console.error(`[FinancialSummary:Error] Failed to read refunds for seller ${sellerId}:`, err);
    throw new Error('Database query failure while verifying refunds. Operation aborted (Fail-Closed).');
  }

  refundedAmount = Number(refundedAmount.toFixed(2));
  pendingRefundAmount = Number(pendingRefundAmount.toFixed(2));
  const totalRefundCommitment = Number((refundedAmount + pendingRefundAmount).toFixed(2));

  // 3. Authoritative Payout Commitments
  let settledPayout = 0;
  let reservedPayout = 0;
  try {
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
  } catch (err: any) {
    console.error(`[FinancialSummary:Error] Failed to read payouts for seller ${sellerId}:`, err);
    throw new Error('Database query failure while verifying payouts. Operation aborted (Fail-Closed).');
  }

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

  const decoded = await verifyFirebaseBearerToken(authHeader);
  if (!decoded) {
    throw new Error('Authentication failed: Invalid or expired credentials');
  }

  const isPlatformAdmin = isCallerPlatformAdmin(decoded);
  if (!isPlatformAdmin && decoded.uid !== sellerId) {
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

// In-flight mutex per sellerId to prevent simultaneous double-withdrawal race conditions
const inFlightSellerPayouts = new Set<string>();

export async function processPayoutGateway(
  payload: CreatePayoutGatewayRequest,
  authHeader?: string
): Promise<{ success: boolean; payout: PayoutRequest }> {
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

  // Anti-Spoofing: Caller must be the seller or a platform admin
  if (!isPlatformAdmin && callerUid !== payload.sellerId) {
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

  const sellerId = payload.sellerId;

  // Concurrency Guard: Block concurrent requests for the same seller
  if (inFlightSellerPayouts.has(sellerId)) {
    throw new Error('A payout request for this seller account is currently being processed. Please wait.');
  }
  inFlightSellerPayouts.add(sellerId);

  try {
    const adminDb = getAdminDb();

    // PART 6: Authoritative Identity Resolution from Firestore (Do not trust client input)
    let authoritativeSellerName = decoded.name || 'Merchant';
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
          if (order.paymentStatus === 'paid' && order.status !== 'cancelled') {
            if (Array.isArray(order.vendorOrders)) {
              order.vendorOrders.forEach((vo: any) => {
                if (vo.sellerId === sellerId) {
                  totalEarned += (vo.sellerRevenue ?? (vo.subtotal - (vo.commissionAmount || 0)));
                }
              });
            }
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

    // PART 5: Atomic Payout Reservation using Firestore Transaction on seller lock
    const payoutId = `payout_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const now = new Date().toISOString();
    const lockRef = adminDb.collection('seller_payout_locks').doc(sellerId);

    const result = await adminDb.runTransaction(async (transaction) => {
      // Step A: Read seller payout lock
      const lockDoc = await transaction.get(lockRef);

      // Step B: Query existing payouts
      const payoutsSnap = await adminDb
        .collection('payoutRequests')
        .where('sellerId', '==', sellerId)
        .get();

      let totalReservedOrPaid = 0;
      if (!payoutsSnap.empty) {
        payoutsSnap.forEach((doc) => {
          const p = doc.data();
          if (['pending', 'approved', 'processed', 'paid'].includes(p.status)) {
            totalReservedOrPaid += (Number(p.amount) || 0);
          }
        });
      }

      // If lockDoc has a more recent reserved amount, factor it in
      if (lockDoc.exists) {
        const lockData = lockDoc.data();
        if (typeof lockData?.totalReserved === 'number' && lockData.totalReserved > totalReservedOrPaid) {
          totalReservedOrPaid = lockData.totalReserved;
        }
      }

      const netEarned = Math.max(0, totalEarned - totalRefunds);
      const availableBalance = Math.max(0, netEarned - totalReservedOrPaid);

      if (amount > availableBalance + 0.001) {
        throw new Error(
          `Requested payout amount ($${amount.toFixed(2)}) exceeds verified available balance ($${availableBalance.toFixed(2)})`
        );
      }

      const newReserved = Number((totalReservedOrPaid + amount).toFixed(2));

      const newPayout: PayoutRequest = {
        id: payoutId,
        sellerId,
        storeId: authoritativeStoreId,
        sellerName: authoritativeSellerName,
        storeName: authoritativeStoreName,
        amount,
        paymentMethod: payload.paymentMethod,
        settlementType: 'MANUAL_SETTLEMENT',
        accountNumber: cleanAccountNumber,
        accountName: cleanAccountName,
        status: 'pending',
        requestedAt: now,
        notes: payload.notes?.trim() || undefined,
      };

      // Atomic update of lock doc
      transaction.set(lockRef, {
        sellerId,
        totalReserved: newReserved,
        lastPayoutId: payoutId,
        lastAmount: amount,
        updatedAt: now,
      });

      // Atomic persistence of payout doc
      const payoutDocRef = adminDb.collection('payoutRequests').doc(payoutId);
      transaction.set(payoutDocRef, newPayout);

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
    inFlightSellerPayouts.delete(sellerId);
  }
}
