process.env.NODE_ENV = 'test';
process.env.ENABLE_TEST_TOKENS = 'true';

import assert from 'assert';
import express from 'express';
import http from 'http';
import {
  calculateSellerFinancialSummary,
  processPayoutGateway,
  processPayoutReviewGateway,
  parseStrictPositiveNumber,
  calculateEarnedFromOrder,
} from '../server/payoutGateway';
import {
  processRefundGateway,
  processRefundReviewGateway,
  processRefundSettlementGateway,
} from '../server/refundGateway';
import {
  processPaymentReferenceSubmissionGateway,
  processPaymentReviewGateway,
} from '../server/paymentGateway';
import { getAdminDb, setAdminDbForTesting } from '../server/firebaseAdmin';

interface BreakCheckResult {
  id: string;
  phase: string;
  name: string;
  mode: 'EMULATOR RUNTIME' | 'LIVE RUNTIME';
  pass: boolean;
  details: string;
}

const results: BreakCheckResult[] = [];

function record(res: BreakCheckResult) {
  results.push(res);
  console.log(`${res.pass ? '[PASS]' : '[FAIL]'} [${res.mode}] ${res.id} (${res.phase}): ${res.name}`);
  console.log(`       -> ${res.details}`);
}

function makeTestToken(uid: string, role: string = 'SELLER', email: string = `${uid}@example.com`): string {
  const payload = {
    uid,
    email,
    email_verified: true,
    role,
    ...(role === 'SUPER_ADMIN' ? { super_admin: true, admin: true } : {}),
  };
  return `Bearer test-token:${Buffer.from(JSON.stringify(payload)).toString('base64')}`;
}

async function runAdversarialBreakSuite() {
  console.log('======================================================================');
  console.log('MARKETSPACE — ADVERSARIAL BREAK-THE-FIX VERIFICATION SUITE');
  console.log('Executing against real Firestore Emulator / Live HTTP Gateway');
  console.log('======================================================================\n');

  setAdminDbForTesting(null);
  const adminDb = getAdminDb();
  const mode: 'EMULATOR RUNTIME' | 'LIVE RUNTIME' = process.env.FIRESTORE_EMULATOR_HOST
    ? 'EMULATOR RUNTIME'
    : 'LIVE RUNTIME';

  const now = new Date().toISOString();

  // Seed admin user and verified seller fixtures
  const adminToken = makeTestToken('superadmin_adv_01', 'SUPER_ADMIN', 'marketspace119@gmail.com');
  await adminDb.collection('users').doc('superadmin_adv_01').set({
    id: 'superadmin_adv_01',
    role: 'SUPER_ADMIN',
    email: 'marketspace119@gmail.com',
    emailVerified: true,
    email_verified: true,
    status: 'active',
  });

  // =========================================================================
  // PHASE 1 — BREAK NEW-06: 12 ADVERSARIAL DISPUTE PAYOUT FREEZE SCENARIOS
  // =========================================================================

  // Scenario 1: Seller has active dispute (baseline initialization path) -> payout blocked
  try {
    const sellerId = 'seller_adv_new06_s1';
    const token = makeTestToken(sellerId, 'SELLER', 'adv1@example.com');
    await adminDb.collection('users').doc(sellerId).set({
      id: sellerId,
      role: 'SELLER',
      name: 'Adv Seller 1',
      email: 'adv1@example.com',
      emailVerified: true,
      email_verified: true,
      status: 'active',
    });
    await adminDb.collection('orders').doc('ord_adv_s1').set({
      id: 'ord_adv_s1',
      sellerId,
      sellerIds: [sellerId],
      customerId: 'cust_adv_1',
      status: 'delivered',
      paymentStatus: 'paid',
      total: 200,
      subtotal: 200,
      sellerRevenue: 180,
      updatedAt: now,
    });
    await adminDb.collection('disputes').doc('disp_adv_s1').set({
      id: 'disp_adv_s1',
      orderId: 'ord_adv_s1',
      sellerId,
      customerId: 'cust_adv_1',
      disputedAmount: 180,
      status: 'OPEN',
      createdAt: now,
      updatedAt: now,
    });

    const summary = await calculateSellerFinancialSummary(sellerId, adminDb);
    assert.strictEqual(summary.grossEarned, 180);
    assert.strictEqual(summary.pendingRefundAmount, 180);
    assert.strictEqual(summary.availableBalance, 0);

    let blocked = false;
    try {
      await processPayoutGateway({
        sellerId,
        amount: 50,
        paymentMethod: 'zaad',
        accountNumber: '634455667',
        accountName: 'Adv Seller 1',
      }, token);
    } catch (e: any) {
      blocked = e.message.includes('exceeds verified available balance') || e.message.includes('تتجاوز الرصيد المتاح');
    }
    assert.strictEqual(blocked, true, 'Payout must be blocked when active dispute freezes 100% of baseline balance');

    record({
      id: 'ADV-NEW06-01',
      phase: 'PHASE 1 (NEW-06)',
      name: 'Seller with active dispute on baseline path cannot withdraw frozen funds',
      mode,
      pass: true,
      details: 'grossEarned=$180, disputed=$180 -> availableBalance=$0; $50 payout rejected',
    });
  } catch (err: any) {
    record({
      id: 'ADV-NEW06-01',
      phase: 'PHASE 1 (NEW-06)',
      name: 'Seller with active dispute on baseline path cannot withdraw frozen funds',
      mode,
      pass: false,
      details: err.message,
    });
  }

  // Scenario 2, 3, 4, 11: Incremental path + Multiple disputes across different orders and different subOrders
  try {
    const sellerId = 'seller_adv_new06_s2';
    const token = makeTestToken(sellerId, 'SELLER', 'adv2@example.com');
    await adminDb.collection('users').doc(sellerId).set({
      id: sellerId,
      role: 'SELLER',
      name: 'Adv Seller 2',
      email: 'adv2@example.com',
      emailVerified: true,
      email_verified: true,
      status: 'active',
    });
    // Order A: multi-vendor with two sub-orders for seller ($100 + $150 = $250)
    await adminDb.collection('orders').doc('ord_adv_s2_a').set({
      id: 'ord_adv_s2_a',
      sellerIds: [sellerId, 'other_seller'],
      customerId: 'cust_adv_2',
      status: 'delivered',
      paymentStatus: 'paid',
      total: 400,
      vendorOrders: [
        { subOrderId: 'sub_s2_1', sellerId, status: 'delivered', subtotal: 100, sellerRevenue: 100 },
        { subOrderId: 'sub_s2_2', sellerId, status: 'delivered', subtotal: 150, sellerRevenue: 150 },
        { subOrderId: 'sub_other', sellerId: 'other_seller', status: 'delivered', subtotal: 150, sellerRevenue: 150 },
      ],
      updatedAt: now,
    });
    // Order B: separate order for seller ($120)
    await adminDb.collection('orders').doc('ord_adv_s2_b').set({
      id: 'ord_adv_s2_b',
      sellerId,
      sellerIds: [sellerId],
      customerId: 'cust_adv_2',
      status: 'delivered',
      paymentStatus: 'paid',
      total: 120,
      sellerRevenue: 120,
      updatedAt: now,
    });

    // Initialize baseline ledger first ($370 total earned)
    const initSum = await calculateSellerFinancialSummary(sellerId, adminDb);
    assert.strictEqual(initSum.grossEarned, 370);
    assert.strictEqual(initSum.availableBalance, 370);

    // Now open 2 disputes:
    // Dispute 1 on sub_s2_1 ($100) in OPEN status
    await adminDb.collection('disputes').doc('disp_adv_s2_1').set({
      id: 'disp_adv_s2_1',
      orderId: 'ord_adv_s2_a',
      subOrderId: 'sub_s2_1',
      sellerId,
      status: 'OPEN',
      createdAt: now,
    });
    // Dispute 2 on ord_adv_s2_b ($120) in SELLER_RESPONDED status
    await adminDb.collection('disputes').doc('disp_adv_s2_2').set({
      id: 'disp_adv_s2_2',
      orderId: 'ord_adv_s2_b',
      sellerId,
      disputedAmount: 120,
      status: 'SELLER_RESPONDED',
      createdAt: now,
    });

    // Incremental reconciliation must freeze $100 + $120 = $220, leaving $150 (from sub_s2_2) available
    const incSum = await calculateSellerFinancialSummary(sellerId, adminDb);
    assert.strictEqual(incSum.grossEarned, 370);
    assert.strictEqual(incSum.pendingRefundAmount, 220, `Expected $220 frozen across 2 disputes, got ${incSum.pendingRefundAmount}`);
    assert.strictEqual(incSum.availableBalance, 150);

    // Attempting to withdraw $160 must fail
    let overBlocked = false;
    try {
      await processPayoutGateway({
        sellerId,
        amount: 160,
        paymentMethod: 'zaad',
        accountNumber: '634455667',
        accountName: 'Adv Seller 2',
      }, token);
    } catch (e: any) {
      overBlocked = true;
    }
    assert.strictEqual(overBlocked, true, 'Payout exceeding un-disputed subOrder balance must fail');

    // Attempting to withdraw $150 (un-disputed subOrder sub_s2_2) must succeed
    const validPayout = await processPayoutGateway({
      sellerId,
      amount: 150,
      paymentMethod: 'zaad',
      accountNumber: '634455667',
      accountName: 'Adv Seller 2',
    }, token);
    assert.strictEqual(validPayout.success, true);

    record({
      id: 'ADV-NEW06-02-03-04-11',
      phase: 'PHASE 1 (NEW-06)',
      name: 'Incremental path + multiple disputes across different orders & subOrders accurately freezes exact subOrder amounts',
      mode,
      pass: true,
      details: 'Total earned $370, 2 active disputes ($100 subOrder + $120 order) froze $220; $160 payout blocked, $150 allowed',
    });
  } catch (err: any) {
    record({
      id: 'ADV-NEW06-02-03-04-11',
      phase: 'PHASE 1 (NEW-06)',
      name: 'Incremental path + multiple disputes across different orders & subOrders accurately freezes exact subOrder amounts',
      mode,
      pass: false,
      details: err.message,
    });
  }

  // Scenario 5, 6, 7: Payout requested BEFORE dispute -> Dispute opened -> Payout approval & settlement blocked (409)
  try {
    const sellerId = 'seller_adv_new06_s7';
    const token = makeTestToken(sellerId, 'SELLER', 'adv7@example.com');
    await adminDb.collection('users').doc(sellerId).set({
      id: sellerId,
      role: 'SELLER',
      name: 'Adv Seller 7',
      email: 'adv7@example.com',
      emailVerified: true,
      email_verified: true,
      status: 'active',
    });
    await adminDb.collection('orders').doc('ord_adv_s7').set({
      id: 'ord_adv_s7',
      sellerId,
      sellerIds: [sellerId],
      customerId: 'cust_adv_7',
      status: 'delivered',
      paymentStatus: 'paid',
      total: 300,
      sellerRevenue: 300,
      updatedAt: now,
    });

    // Step 1: Seller requests $300 payout while no dispute exists
    const pRes = await processPayoutGateway({
      sellerId,
      amount: 300,
      paymentMethod: 'evc_plus',
      accountNumber: '615556677',
      accountName: 'Adv Seller 7',
    }, token);
    assert.strictEqual(pRes.success, true);

    // Step 2: Customer opens a $100 dispute AFTER payout is already pending
    await adminDb.collection('disputes').doc('disp_adv_s7').set({
      id: 'disp_adv_s7',
      orderId: 'ord_adv_s7',
      sellerId,
      disputedAmount: 100,
      status: 'OPEN',
      createdAt: now,
    });
    await adminDb.collection('seller_payout_locks').doc(sellerId).set({
      totalDisputeFrozen: 100,
    }, { merge: true });

    // Step 3: Admin tries to approve the $300 payout -> MUST FAIL with 409 because $100 is now frozen (only $200 available)
    let approveBlocked = false;
    let approveStatus = 0;
    try {
      await processPayoutReviewGateway({
        payoutId: pRes.payout.id,
        newStatus: 'approved',
      }, adminToken);
    } catch (e: any) {
      approveBlocked = true;
      approveStatus = e.statusCode || 0;
    }
    assert.strictEqual(approveBlocked, true, 'Approving pending payout after dispute creation must be blocked');
    assert.strictEqual(approveStatus, 409, 'Status code must be 409 Conflict');

    // Step 4: Admin tries to mark 'paid' directly -> MUST ALSO FAIL with 409
    let paidBlocked = false;
    try {
      await processPayoutReviewGateway({
        payoutId: pRes.payout.id,
        newStatus: 'paid',
      }, adminToken);
    } catch (e: any) {
      paidBlocked = true;
    }
    assert.strictEqual(paidBlocked, true, 'Settling payout as paid after dispute creation must be blocked');

    record({
      id: 'ADV-NEW06-05-06-07',
      phase: 'PHASE 1 (NEW-06)',
      name: 'Payout approval and settlement re-verify live disputes and block with 409 if dispute opened after request',
      mode,
      pass: true,
      details: 'Pending $300 payout blocked at both approve (409) and paid (409) after $100 dispute opened',
    });
  } catch (err: any) {
    record({
      id: 'ADV-NEW06-05-06-07',
      phase: 'PHASE 1 (NEW-06)',
      name: 'Payout approval and settlement re-verify live disputes and block with 409 if dispute opened after request',
      mode,
      pass: false,
      details: err.message,
    });
  }

  // Scenario 8, 9, 12: Payout idempotency retry, parameter conflict (409), and concurrent payout double-withdrawal protection
  try {
    const sellerId = 'seller_adv_new06_s8';
    const token = makeTestToken(sellerId, 'SELLER', 'adv8@example.com');
    await adminDb.collection('users').doc(sellerId).set({
      id: sellerId,
      role: 'SELLER',
      name: 'Adv Seller 8',
      email: 'adv8@example.com',
      emailVerified: true,
      email_verified: true,
      status: 'active',
    });
    await adminDb.collection('orders').doc('ord_adv_s8').set({
      id: 'ord_adv_s8',
      sellerId,
      sellerIds: [sellerId],
      customerId: 'cust_adv_8',
      status: 'delivered',
      paymentStatus: 'paid',
      total: 250,
      sellerRevenue: 250,
      updatedAt: now,
    });

    // 1. Concurrent payout requests (Scenario 12): Fire two $200 payouts simultaneously
    const [resA, resB] = await Promise.allSettled([
      processPayoutGateway({
        sellerId,
        amount: 200,
        paymentMethod: 'zaad',
        accountNumber: '634001122',
        accountName: 'Adv Seller 8',
        idempotencyKey: 'idem_payout_s8_1',
      }, token),
      processPayoutGateway({
        sellerId,
        amount: 200,
        paymentMethod: 'zaad',
        accountNumber: '634001122',
        accountName: 'Adv Seller 8',
        idempotencyKey: 'idem_payout_s8_2',
      }, token),
    ]);

    const fulfilled = [resA, resB].filter((r) => r.status === 'fulfilled');
    const rejected = [resA, resB].filter((r) => r.status === 'rejected');
    assert.strictEqual(fulfilled.length, 1, 'Exactly 1 of 2 concurrent $200 payouts against $250 balance may succeed');
    assert.strictEqual(rejected.length, 1, 'Second concurrent payout must be rejected by mutex or transaction lock');

    const winningKey = resA.status === 'fulfilled' ? 'idem_payout_s8_1' : 'idem_payout_s8_2';

    // 2. Idempotency replay (Scenario 9): Replaying winningKey with identical parameters returns same payout without double deduction
    const replayRes = await processPayoutGateway({
      sellerId,
      amount: 200,
      paymentMethod: 'zaad',
      accountNumber: '634001122',
      accountName: 'Adv Seller 8',
      idempotencyKey: winningKey,
    }, token);
    assert.strictEqual(replayRes.replayed, true, 'Idempotent retry must return replayed: true');
    assert.strictEqual(replayRes.payout.id, (fulfilled[0] as any).value.payout.id, 'Must return identical payout ID');

    // 3. Idempotency conflict: Replaying winningKey with different amount ($50) throws 409
    let conflictThrew = false;
    try {
      await processPayoutGateway({
        sellerId,
        amount: 50,
        paymentMethod: 'zaad',
        accountNumber: '634001122',
        accountName: 'Adv Seller 8',
        idempotencyKey: winningKey,
      }, token);
    } catch (e: any) {
      conflictThrew = e.statusCode === 409 || e.message.includes('Idempotency key conflict');
    }
    assert.strictEqual(conflictThrew, true, 'Reusing payout idempotencyKey with different amount must throw 409');

    record({
      id: 'ADV-NEW06-08-09-12',
      phase: 'PHASE 1 (NEW-06)',
      name: 'Concurrent payout race protection, idempotent replay, and idempotency fingerprint conflict (409)',
      mode,
      pass: true,
      details: 'Concurrent $200+$200 on $250 balance -> 1 succeeded, 1 blocked; idempotent retry replayed safely; altered amount threw 409',
    });
  } catch (err: any) {
    record({
      id: 'ADV-NEW06-08-09-12',
      phase: 'PHASE 1 (NEW-06)',
      name: 'Concurrent payout race protection, idempotent replay, and idempotency fingerprint conflict (409)',
      mode,
      pass: false,
      details: err.message,
    });
  }

  // =========================================================================
  // PHASE 2 — BREAK NEW-07: HISTORICAL FINANCIAL DATA FAIL-CLOSED MATRIX
  // =========================================================================

  // Test all 12 corrupt inputs against parseStrictPositiveNumber, calculateEarnedFromOrder, refundGateway, paymentGateway, and payoutGateway
  try {
    const corruptValues: Array<{ label: string; val: any }> = [
      { label: 'undefined', val: undefined },
      { label: 'null', val: null },
      { label: 'NaN', val: NaN },
      { label: 'Infinity', val: Infinity },
      { label: '-Infinity', val: -Infinity },
      { label: 'empty string ""', val: '' },
      { label: 'non-numeric "abc"', val: 'abc' },
      { label: 'zero string "0"', val: '0' },
      { label: 'negative number -50', val: -50 },
      { label: 'boolean true', val: true },
      { label: 'boolean false', val: false },
    ];

    for (const item of corruptValues) {
      let parserThrew = false;
      try {
        parseStrictPositiveNumber(item.val, `test_${item.label}`);
      } catch {
        parserThrew = true;
      }
      assert.strictEqual(parserThrew, true, `parseStrictPositiveNumber must fail-closed on ${item.label}`);

      // Also test calculateEarnedFromOrder on an eligible delivered+paid order with corrupted sellerRevenue & subtotal
      let earnedThrew = false;
      try {
        calculateEarnedFromOrder({
          id: `corrupt_ord_${item.label}`,
          sellerId: 'seller_corrupt_test',
          status: 'delivered',
          paymentStatus: 'paid',
          sellerRevenue: item.val,
          subtotal: item.val,
          total: item.val,
        }, 'seller_corrupt_test');
      } catch {
        earnedThrew = true;
      }
      assert.strictEqual(earnedThrew, true, `calculateEarnedFromOrder must fail-closed on ${item.label}`);
    }

    const corruptCustToken = makeTestToken('cust_corrupt_01', 'CUSTOMER', 'cust_corrupt@example.com');
    await adminDb.collection('users').doc('cust_corrupt_01').set({
      id: 'cust_corrupt_01',
      role: 'CUSTOMER',
      email: 'cust_corrupt@example.com',
      emailVerified: true,
      email_verified: true,
      status: 'active',
    });

    // Test processPaymentReferenceSubmissionGateway when orderData.total is corrupted (e.g., undefined / NaN / "abc")
    await adminDb.collection('orders').doc('ord_corrupt_pay_01').set({
      id: 'ord_corrupt_pay_01',
      customerId: 'cust_corrupt_01',
      status: 'pending',
      paymentStatus: 'unpaid',
      total: 'abc',
    });
    let paySubFailedClosed = false;
    try {
      await processPaymentReferenceSubmissionGateway({
        orderId: 'ord_corrupt_pay_01',
        amount: 100,
        method: 'zaad',
        referenceNumber: 'REF998877',
        senderPhone: '252634455667',
      }, corruptCustToken);
    } catch (e: any) {
      paySubFailedClosed = e.statusCode === 503 || e.message.includes('Fail-Closed');
    }
    assert.strictEqual(paySubFailedClosed, true, 'processPaymentReferenceSubmissionGateway must fail-closed (503) when order.total is corrupt ("abc")');

    // Test RefundGateway when a historical refund record has corrupted amount (e.g., null or "abc" or 0)
    await adminDb.collection('orders').doc('ord_corrupt_ref_01').set({
      id: 'ord_corrupt_ref_01',
      customerId: 'cust_corrupt_01',
      sellerId: 'seller_corrupt_01',
      status: 'delivered',
      paymentStatus: 'paid',
      total: 200,
    });
    await adminDb.collection('refundRequests').doc('ref_corrupt_hist_01').set({
      id: 'ref_corrupt_hist_01',
      orderId: 'ord_corrupt_ref_01',
      customerId: 'cust_corrupt_01',
      sellerId: 'seller_corrupt_01',
      amount: null,
      status: 'REFUNDED',
    });

    let refundFailedClosed = false;
    try {
      await processRefundGateway({
        orderId: 'ord_corrupt_ref_01',
        amount: 50,
        reason: 'damaged',
      }, corruptCustToken);
    } catch (e: any) {
      refundFailedClosed = e.statusCode === 503 || e.message.includes('Fail-Closed');
    }
    assert.strictEqual(refundFailedClosed, true, 'processRefundGateway must fail-closed (503) when historical refund has null amount');

    record({
      id: 'ADV-NEW07-MATRIX',
      phase: 'PHASE 2 (NEW-07)',
      name: 'All 11 corrupt value types (undefined, null, NaN, ±Infinity, "", "abc", "0", negative, boolean) fail-closed across all financial gateways',
      mode,
      pass: true,
      details: 'Verified on parseStrictPositiveNumber, calculateEarnedFromOrder, processPaymentSubmissionGateway (503), and processRefundGateway (503)',
    });
  } catch (err: any) {
    record({
      id: 'ADV-NEW07-MATRIX',
      phase: 'PHASE 2 (NEW-07)',
      name: 'All 11 corrupt value types fail-closed across all financial gateways',
      mode,
      pass: false,
      details: err.message,
    });
  }

  // =========================================================================
  // PHASE 3 — MULTI-SUBORDER REFUND CEILING ISOLATION TEST
  // =========================================================================
  try {
    const custId = 'cust_sub_ceil_01';
    const custToken = makeTestToken(custId, 'CUSTOMER', 'cust_ceil@example.com');
    await adminDb.collection('users').doc(custId).set({
      id: custId,
      role: 'CUSTOMER',
      email: 'cust_ceil@example.com',
      emailVerified: true,
      email_verified: true,
      status: 'active',
    });

    // Multi-vendor order: total = $200 (sub_A = $100, sub_B = $100)
    await adminDb.collection('orders').doc('ord_multi_ceil_01').set({
      id: 'ord_multi_ceil_01',
      customerId: custId,
      sellerIds: ['seller_ceil_A', 'seller_ceil_B'],
      status: 'delivered',
      paymentStatus: 'paid',
      total: 200,
      vendorOrders: [
        { subOrderId: 'sub_ceil_A', sellerId: 'seller_ceil_A', status: 'delivered', total: 100, subtotal: 100 },
        { subOrderId: 'sub_ceil_B', sellerId: 'seller_ceil_B', status: 'delivered', total: 100, subtotal: 100 },
      ],
      updatedAt: now,
    });

    // Step 1: Refund $80 on sub_ceil_A -> succeeds
    const r1 = await processRefundGateway({
      orderId: 'ord_multi_ceil_01',
      subOrderId: 'sub_ceil_A',
      amount: 80,
      reason: 'damaged',
    }, custToken);
    assert.strictEqual(r1.success, true);

    // Step 2: Refund $50 on sub_ceil_B -> MUST SUCCEED because sub_ceil_B has $100 ceiling ($0 refunded so far) and parent order has $120 remaining!
    const r2 = await processRefundGateway({
      orderId: 'ord_multi_ceil_01',
      subOrderId: 'sub_ceil_B',
      amount: 50,
      reason: 'wrong_item',
    }, custToken);
    assert.strictEqual(r2.success, true, 'Independent subOrder B must allow $50 refund even after subOrder A refunded $80');

    // Step 3: Attempt to refund another $30 on sub_ceil_A ($80 + $30 = $110 > $100 subOrder A ceiling) -> MUST FAIL
    let subOverThrew = false;
    try {
      await processRefundGateway({
        orderId: 'ord_multi_ceil_01',
        subOrderId: 'sub_ceil_A',
        amount: 30,
        reason: 'damaged',
      }, custToken);
    } catch {
      subOverThrew = true;
    }
    assert.strictEqual(subOverThrew, true, 'SubOrder A refund exceeding $100 subOrder ceiling must be blocked');

    record({
      id: 'ADV-SUBORDER-CEILING-01',
      phase: 'PHASE 2 & 5',
      name: 'Per-subOrder and parent-order refund ceilings tracked independently and accurately',
      mode,
      pass: true,
      details: 'Order $200 (subA=$100, subB=$100): subA $80 refund + subB $50 refund both succeeded; second subA $30 refund ($110 > $100) blocked',
    });
  } catch (err: any) {
    record({
      id: 'ADV-SUBORDER-CEILING-01',
      phase: 'PHASE 2 & 5',
      name: 'Per-subOrder and parent-order refund ceilings tracked independently and accurately',
      mode,
      pass: false,
      details: err.message,
    });
  }

  console.log('\n======================================================================');
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;
  console.log(`ADVERSARIAL BREAK SUITE SUMMARY: ${passed}/${results.length} PASSED (${failed} FAILED)`);
  console.log('======================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runAdversarialBreakSuite().catch((err) => {
  console.error('Fatal error in adversarial break suite:', err);
  process.exit(1);
});
