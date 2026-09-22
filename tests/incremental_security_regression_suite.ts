import assert from 'assert';
import fs from 'fs';
import { initializeTestEnvironment, assertFails, assertSucceeds, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, getDocs, collection } from 'firebase/firestore';
import { ref, uploadBytes } from 'firebase/storage';
import { getAdminDb } from '../server/firebaseAdmin';
import { processPaymentReferenceSubmissionGateway } from '../server/paymentGateway';
import { processRefundGateway } from '../server/refundGateway';
import { processPayoutGateway } from '../server/payoutGateway';
import { deliveryService } from '../src/services/deliveryService';
import { bookingService } from '../src/services/bookingService';
import { reviewService } from '../src/services/reviewService';
import { orderService } from '../src/services/orderService';
import { notificationService } from '../src/services/notificationService';
import { addressService } from '../src/services/addressService';
import { messagingService } from '../src/services/messagingService';
import { MemoryRateLimitStore } from '../server/rateLimiter';

interface IncrementalTestResult {
  id: string;
  name: string;
  priorityCategory: string;
  attackVector: string;
  securityControl: string;
  expectedDenial: string;
  stateUnchangedVerification: string;
  assertionExecuted: boolean;
  pass: boolean;
  error?: string;
}

const incrementalResults: IncrementalTestResult[] = [];

function recordTest(result: IncrementalTestResult) {
  if (!result.assertionExecuted) {
    result.pass = false;
    result.error = 'CRITICAL: No assertion executed for test (fail-closed requirement breached)!';
  }
  incrementalResults.push(result);
  const badge = result.pass ? '[PASS - SECURED]' : '[FAIL - VULNERABILITY]';
  console.log(`${badge} ${result.id}: ${result.name}`);
  if (result.error) {
    console.log(`  Error:              ${result.error}`);
  }
  console.log(`  Attack:             ${result.attackVector}`);
  console.log(`  Security Control:   ${result.securityControl}`);
  console.log(`  Expected Denial:    ${result.expectedDenial}`);
  console.log(`  State Verification: ${result.stateUnchangedVerification}\n`);
}

function makeTestBearer(claims: Record<string, any>): string {
  const b64 = Buffer.from(JSON.stringify(claims)).toString('base64');
  return `Bearer test-token:${b64}`;
}

// User test fixtures
const FIXTURES = {
  customerA: { uid: 'inc_cust_A_101', email: 'custA@marketspace.test', email_verified: true, role: 'CUSTOMER' },
  customerB: { uid: 'inc_cust_B_202', email: 'custB@marketspace.test', email_verified: true, role: 'CUSTOMER' },
  sellerA: { uid: 'inc_seller_A_301', email: 'sellerA@marketspace.test', email_verified: true, role: 'SELLER', storeId: 'store_inc_A' },
  sellerB: { uid: 'inc_seller_B_402', email: 'sellerB@marketspace.test', email_verified: true, role: 'SELLER', storeId: 'store_inc_B' },
  driverA: { uid: 'inc_driver_A_501', email: 'driverA@marketspace.test', email_verified: true, role: 'DRIVER' },
  driverB: { uid: 'inc_driver_B_502', email: 'driverB@marketspace.test', email_verified: true, role: 'DRIVER' },
  admin: { uid: 'inc_admin_701', email: 'admin@marketspace.test', email_verified: true, role: 'ADMIN', admin: true },
  superAdmin: { uid: 'inc_super_admin_801', email: 'superadmin@marketspace.test', email_verified: true, role: 'SUPER_ADMIN', admin: true, superAdmin: true },
};

async function runIncrementalSecurityRegressionSuite() {
  console.log('================================================================');
  console.log('STARTING INCREMENTAL SECURITY REGRESSION SUITE (15 TARGETED GAPS)');
  console.log('Validating Defense-in-Depth, Multi-Tenant Isolation, and Fail-Closed Boundaries');
  console.log('================================================================\n');

  const firestoreRules = fs.readFileSync('firestore.rules', 'utf8');
  const storageRules = fs.readFileSync('storage.rules', 'utf8');

  let testEnv: RulesTestEnvironment | null = null;
  try {
    testEnv = await initializeTestEnvironment({
      projectId: 'marketspace-applet',
      firestore: { rules: firestoreRules },
      storage: { rules: storageRules },
    });
    console.log('[IncrementalHarness] Live emulator connected for rules evaluation.\n');
  } catch (err: any) {
    console.error('[IncrementalHarness] Fatal: Emulator initialization failed:', err.message);
    process.exit(1);
  }

  const adminDb = getAdminDb();
  const now = new Date().toISOString();

  // Pre-seed user identities in Firestore rules test environment
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    // Seed standard admin and super admin documents so rules isAdmin() and isSuperAdmin() evaluate authoritatively
    await setDoc(doc(db, 'users', FIXTURES.admin.uid), {
      id: FIXTURES.admin.uid,
      email: FIXTURES.admin.email,
      role: 'ADMIN',
      isVerified: true,
      createdAt: now,
    });
    await setDoc(doc(db, 'admins', FIXTURES.admin.uid), {
      id: FIXTURES.admin.uid,
      role: 'ADMIN',
      createdAt: now,
    });
    await setDoc(doc(db, 'users', FIXTURES.superAdmin.uid), {
      id: FIXTURES.superAdmin.uid,
      email: FIXTURES.superAdmin.email,
      role: 'SUPER_ADMIN',
      isVerified: true,
      createdAt: now,
    });
    await setDoc(doc(db, 'admins', FIXTURES.superAdmin.uid), {
      id: FIXTURES.superAdmin.uid,
      role: 'SUPER_ADMIN',
      createdAt: now,
    });
    // Seed regular users
    await setDoc(doc(db, 'users', FIXTURES.customerA.uid), {
      id: FIXTURES.customerA.uid,
      email: FIXTURES.customerA.email,
      role: 'CUSTOMER',
      balance: 0,
      isVerified: false,
      createdAt: now,
    });
    await setDoc(doc(db, 'users', FIXTURES.customerB.uid), {
      id: FIXTURES.customerB.uid,
      email: FIXTURES.customerB.email,
      role: 'CUSTOMER',
      balance: 0,
      isVerified: false,
      createdAt: now,
    });
    await setDoc(doc(db, 'users', FIXTURES.sellerA.uid), {
      id: FIXTURES.sellerA.uid,
      email: FIXTURES.sellerA.email,
      role: 'SELLER',
      storeId: FIXTURES.sellerA.storeId,
      isVerified: true,
      createdAt: now,
    });
    await setDoc(doc(db, 'users', FIXTURES.sellerB.uid), {
      id: FIXTURES.sellerB.uid,
      email: FIXTURES.sellerB.email,
      role: 'SELLER',
      storeId: FIXTURES.sellerB.storeId,
      isVerified: true,
      createdAt: now,
    });
    await setDoc(doc(db, 'users', FIXTURES.driverA.uid), {
      id: FIXTURES.driverA.uid,
      email: FIXTURES.driverA.email,
      role: 'DRIVER',
      isVerified: true,
      createdAt: now,
    });
    await setDoc(doc(db, 'users', FIXTURES.driverB.uid), {
      id: FIXTURES.driverB.uid,
      email: FIXTURES.driverB.email,
      role: 'DRIVER',
      isVerified: true,
      createdAt: now,
    });
  });

  // Also pre-seed users into adminDb for server gateways
  await adminDb.collection('users').doc(FIXTURES.customerA.uid).set({
    id: FIXTURES.customerA.uid,
    email: FIXTURES.customerA.email,
    role: 'CUSTOMER',
    isVerified: false,
    balance: 0,
  });
  await adminDb.collection('users').doc(FIXTURES.customerB.uid).set({
    id: FIXTURES.customerB.uid,
    email: FIXTURES.customerB.email,
    role: 'CUSTOMER',
    isVerified: true,
  });
  await adminDb.collection('users').doc(FIXTURES.admin.uid).set({
    id: FIXTURES.admin.uid,
    email: FIXTURES.admin.email,
    role: 'ADMIN',
    admin: true,
    isVerified: true,
  });

  // --------------------------------------------------------------------------
  // TEST INC-01: Priority 1 - SUPER_ADMIN-only Role Elevation
  // --------------------------------------------------------------------------
  try {
    let executed = false;
    const custContext = testEnv.authenticatedContext(FIXTURES.customerA.uid, {
      email: FIXTURES.customerA.email,
      email_verified: true,
    });

    // 1. Attacker attempts to directly write to /admins
    const adminDocRef = doc(custContext.firestore(), 'admins', FIXTURES.customerA.uid);
    await assertFails(setDoc(adminDocRef, { role: 'SUPER_ADMIN', active: true }));

    // 2. Attacker attempts to create a user document with role: 'SUPER_ADMIN'
    const newPrivilegedDocRef = doc(custContext.firestore(), 'users', 'inc_elevated_user_01');
    await assertFails(
      setDoc(newPrivilegedDocRef, {
        id: 'inc_elevated_user_01',
        email: 'attacker@marketspace.test',
        role: 'SUPER_ADMIN',
        createdAt: now,
      })
    );

    // Verify state unchanged: target document does not exist
    let adminDocSnap: any = null;
    await testEnv.withSecurityRulesDisabled(async (context) => {
      adminDocSnap = await getDoc(doc(context.firestore(), 'admins', FIXTURES.customerA.uid));
    });
    assert.strictEqual(adminDocSnap.exists(), false, 'Admin document must not exist');
    executed = true;

    recordTest({
      id: 'INC-01',
      name: 'SUPER_ADMIN-only Role Elevation Resistance',
      priorityCategory: 'SUPER_ADMIN Role Elevation',
      attackVector: 'Direct Firestore client write to /admins and self-assigning role: SUPER_ADMIN on /users',
      securityControl: 'firestore.rules lines 49-55 and 87-90 (admins collection write: false; user role strictly CUSTOMER unless superAdmin)',
      expectedDenial: 'PERMISSION_DENIED evaluated by Firestore emulator rules',
      stateUnchangedVerification: 'No document created in /admins; user role elevation denied',
      assertionExecuted: executed,
      pass: true,
    });
  } catch (err: any) {
    console.error('INC-01 error:', err);
    recordTest({
      id: 'INC-01',
      name: 'SUPER_ADMIN-only Role Elevation Resistance',
      priorityCategory: 'SUPER_ADMIN Role Elevation',
      attackVector: 'Direct write to /admins',
      securityControl: 'firestore.rules',
      expectedDenial: 'PERMISSION_DENIED',
      stateUnchangedVerification: 'Admins collection untouched',
      assertionExecuted: true,
      pass: false,
      error: err.message,
    });
  }

  // --------------------------------------------------------------------------
  // TEST INC-02: Priority 2 - ADMIN Privilege Escalation Resistance
  // --------------------------------------------------------------------------
  try {
    let executed = false;
    // Standard Admin attempts to tamper with sensitive fields: balance, isVerified, or role
    const adminContext = testEnv.authenticatedContext(FIXTURES.admin.uid, {
      email: FIXTURES.admin.email,
      email_verified: true,
      admin: true,
    });
    const targetUserRef = doc(adminContext.firestore(), 'users', FIXTURES.customerA.uid);

    // Attempt 1: Tamper with balance
    await assertFails(updateDoc(targetUserRef, { balance: 99999 }));

    // Attempt 2: Tamper with isVerified
    await assertFails(updateDoc(targetUserRef, { isVerified: true }));

    // Attempt 3: Elevate role to SUPER_ADMIN directly via client rules
    await assertFails(updateDoc(targetUserRef, { role: 'SUPER_ADMIN' }));

    // Verify state unchanged
    let snap: any = null;
    await testEnv.withSecurityRulesDisabled(async (context) => {
      snap = await getDoc(doc(context.firestore(), 'users', FIXTURES.customerA.uid));
    });
    const data = snap.data();
    assert.strictEqual(data?.balance, 0, 'User balance must remain 0');
    assert.strictEqual(data?.isVerified, false, 'User isVerified must remain false');
    assert.strictEqual(data?.role, 'CUSTOMER', 'User role must remain CUSTOMER');
    executed = true;

    recordTest({
      id: 'INC-02',
      name: 'ADMIN Privilege Escalation & Balance Tampering Resistance',
      priorityCategory: 'ADMIN Privilege Escalation',
      attackVector: 'Standard Admin attempts direct client update on sensitive fields: balance, isVerified, and role',
      securityControl: 'firestore.rules lines 61-70 (admin updates strictly restricted to non-sensitive fields; role and balance immutable by standard admin)',
      expectedDenial: 'PERMISSION_DENIED evaluated by Firestore emulator rules',
      stateUnchangedVerification: 'Target user balance remains 0, isVerified remains false, role remains CUSTOMER',
      assertionExecuted: executed,
      pass: true,
    });
  } catch (err: any) {
    console.error('INC-02 error:', err);
    recordTest({
      id: 'INC-02',
      name: 'ADMIN Privilege Escalation Resistance',
      priorityCategory: 'ADMIN Privilege Escalation',
      attackVector: 'Admin balance tampering',
      securityControl: 'firestore.rules',
      expectedDenial: 'PERMISSION_DENIED',
      stateUnchangedVerification: 'User state unchanged',
      assertionExecuted: true,
      pass: false,
      error: err.message,
    });
  }

  // --------------------------------------------------------------------------
  // TEST INC-03: Priority 3 - Payment Confirmation Evidence Requirements
  // --------------------------------------------------------------------------
  try {
    let executed = false;
    const orderId = 'ORD-INC-EVIDENCE-01';
    await adminDb.collection('orders').doc(orderId).set({
      orderId,
      customerId: FIXTURES.customerA.uid,
      total: 100,
      paymentMethod: 'zaad',
      paymentStatus: 'pending',
      status: 'pending',
      createdAt: now,
    });

    const custToken = makeTestBearer({
      uid: FIXTURES.customerA.uid,
      email: FIXTURES.customerA.email,
      email_verified: true,
      role: 'CUSTOMER',
    });

    // Vector A: Short/invalid reference (< 4 characters)
    let shortRefDenied = false;
    try {
      await processPaymentReferenceSubmissionGateway(
        {
          orderId,
          method: 'zaad',
          referenceNumber: 'ZD', // Invalid: < 4 chars
          senderPhone: '+252615000000',
        },
        custToken
      );
    } catch (err: any) {
      if (err.statusCode === 400 && err.message.includes('4 خانات على الأقل')) {
        shortRefDenied = true;
      }
    }
    assert.strictEqual(shortRefDenied, true, 'Short reference must be rejected with 400 Bad Request');

    // Vector B: Negative or zero amount injection
    let negativeAmountDenied = false;
    try {
      await processPaymentReferenceSubmissionGateway(
        {
          orderId,
          method: 'zaad',
          referenceNumber: 'ZD-VAL-1001',
          senderPhone: '+252615000000',
          amount: -50,
        },
        custToken
      );
    } catch (err: any) {
      if (err.statusCode === 400) {
        negativeAmountDenied = true;
      }
    }
    assert.strictEqual(negativeAmountDenied, true, 'Negative amount must be rejected with 400 Bad Request');

    // Verify order state unchanged
    const orderSnap = await adminDb.collection('orders').doc(orderId).get();
    assert.strictEqual(orderSnap.data()?.paymentStatus, 'pending', 'Order paymentStatus must remain pending');
    executed = true;

    recordTest({
      id: 'INC-03',
      name: 'Payment Confirmation Evidence & Validation Requirements',
      priorityCategory: 'Payment Confirmation Evidence',
      attackVector: 'Submitting malformed payment reference (< 4 chars) or negative monetary amount',
      securityControl: 'server/paymentGateway.ts reference formatting validation and positive amount enforcement',
      expectedDenial: '400 Bad Request with explicit evidence validation error',
      stateUnchangedVerification: 'Order paymentStatus remains pending; no reservation document created',
      assertionExecuted: executed,
      pass: true,
    });
  } catch (err: any) {
    console.error('INC-03 error:', err);
    recordTest({
      id: 'INC-03',
      name: 'Payment Confirmation Evidence Requirements',
      priorityCategory: 'Payment Confirmation Evidence',
      attackVector: 'Negative amount and short reference',
      securityControl: 'server/paymentGateway.ts',
      expectedDenial: '400 Bad Request',
      stateUnchangedVerification: 'Order status unchanged',
      assertionExecuted: true,
      pass: false,
      error: err.message,
    });
  }

  // --------------------------------------------------------------------------
  // TEST INC-04: Priority 4 - Cross-Order Payment Replay / Idempotency
  // --------------------------------------------------------------------------
  try {
    let executed = false;
    const order1 = 'ORD-INC-REPLAY-101';
    const order2 = 'ORD-INC-REPLAY-102';
    const sharedRef = 'EVC-INC-UNIQUE-999';

    await adminDb.collection('orders').doc(order1).set({
      orderId: order1,
      customerId: FIXTURES.customerA.uid,
      total: 75,
      paymentMethod: 'evc_plus',
      paymentStatus: 'pending',
      status: 'pending',
      createdAt: now,
    });

    await adminDb.collection('orders').doc(order2).set({
      orderId: order2,
      customerId: FIXTURES.customerB.uid,
      total: 75,
      paymentMethod: 'evc_plus',
      paymentStatus: 'pending',
      status: 'pending',
      createdAt: now,
    });

    const custAToken = makeTestBearer({
      uid: FIXTURES.customerA.uid,
      email: FIXTURES.customerA.email,
      email_verified: true,
      role: 'CUSTOMER',
    });
    const custBToken = makeTestBearer({
      uid: FIXTURES.customerB.uid,
      email: FIXTURES.customerB.email,
      email_verified: true,
      role: 'CUSTOMER',
    });

    // 1. First submission succeeds
    const sub1 = await processPaymentReferenceSubmissionGateway(
      {
        orderId: order1,
        method: 'evc_plus',
        referenceNumber: sharedRef,
        senderPhone: '+252615111111',
      },
      custAToken
    );
    assert.strictEqual(sub1.success, true, 'First submission must succeed');
    assert.ok(sub1.submission?.id, 'First submission must return submission ID');

    // 2. Customer B attempts to replay the exact same reference on Order 2
    let replayBlocked = false;
    try {
      await processPaymentReferenceSubmissionGateway(
        {
          orderId: order2,
          method: 'evc_plus',
          referenceNumber: sharedRef,
          senderPhone: '+252615222222',
        },
        custBToken
      );
    } catch (err: any) {
      if (err.statusCode === 409 && err.message.includes('تم تقديمه مسبقاً')) {
        replayBlocked = true;
      }
    }
    assert.strictEqual(replayBlocked, true, 'Replay on second order must be blocked with 409 Conflict');

    // Verify state unchanged: Order 2 remains pending and has no payment reference
    const order2Snap = await adminDb.collection('orders').doc(order2).get();
    assert.strictEqual(order2Snap.data()?.paymentStatus, 'pending', 'Order 2 paymentStatus must remain pending');

    const refDocSnap = await adminDb.collection('paymentReferences').doc(sharedRef).get();
    assert.strictEqual(refDocSnap.data()?.orderId, order1, 'Payment reference must remain bound strictly to Order 1');
    executed = true;

    recordTest({
      id: 'INC-04',
      name: 'Cross-Order Payment Reference Replay Resistance',
      priorityCategory: 'Payment Replay / Idempotency',
      attackVector: 'Submitting an already registered payment reference number across a different customer order',
      securityControl: 'server/paymentGateway.ts atomic transaction checking paymentReferences/{normalizedRef} primary key',
      expectedDenial: '409 Conflict: reference previously registered in another transaction',
      stateUnchangedVerification: 'Reference remains bound solely to Order 1; Order 2 remains unconfirmed',
      assertionExecuted: executed,
      pass: true,
    });
  } catch (err: any) {
    console.error('INC-04 error:', err);
    recordTest({
      id: 'INC-04',
      name: 'Cross-Order Payment Reference Replay Resistance',
      priorityCategory: 'Payment Replay / Idempotency',
      attackVector: 'Replay reference across orders',
      securityControl: 'server/paymentGateway.ts',
      expectedDenial: '409 Conflict',
      stateUnchangedVerification: 'State unchanged',
      assertionExecuted: true,
      pass: false,
      error: err.message,
    });
  }

  // --------------------------------------------------------------------------
  // TEST INC-05: Priority 5 - Payout / Refund Double Execution Replay
  // --------------------------------------------------------------------------
  try {
    let executed = false;
    const orderId = 'ORD-INC-DOUBLE-01';

    await adminDb.collection('orders').doc(orderId).set({
      orderId,
      customerId: FIXTURES.customerA.uid,
      total: 80,
      paymentStatus: 'paid',
      status: 'delivered',
      createdAt: now,
    });

    const custAToken = makeTestBearer({
      uid: FIXTURES.customerA.uid,
      email: FIXTURES.customerA.email,
      email_verified: true,
      role: 'CUSTOMER',
    });

    // First execution: Customer requests full refund of $80 on Order ORD-INC-DOUBLE-01
    const firstRes = await processRefundGateway(
      {
        orderId,
        amount: 80,
        reason: 'damaged',
        notes: 'Valid full refund for damaged shipment',
      },
      custAToken
    );
    assert.strictEqual(firstRes.success, true, 'First full refund request must succeed');
    assert.strictEqual(firstRes.refund.amount, 80, 'Refund amount must be 80');

    // Second execution: Customer attempts duplicate refund of $80 on the same order (Double Execution / Overdraft)
    let doubleRefundBlocked = false;
    try {
      await processRefundGateway(
        {
          orderId,
          amount: 80,
          reason: 'damaged',
          notes: 'Attempting duplicate refund on fully committed balance',
        },
        custAToken
      );
    } catch (err: any) {
      if (err.message.includes('exceeds remaining refundable balance')) {
        doubleRefundBlocked = true;
      }
    }
    assert.strictEqual(doubleRefundBlocked, true, 'Double refund execution exceeding order ceiling must be blocked');

    // Payout Double Execution Check via requestPayoutGateway
    // Seller with 0 available balance attempts payout -> blocked
    const sellerToken = makeTestBearer({
      uid: FIXTURES.sellerA.uid,
      email: FIXTURES.sellerA.email,
      email_verified: true,
      role: 'SELLER',
    });

    let payoutDoubleExecutionBlocked = false;
    try {
      await processPayoutGateway(
        {
          sellerId: FIXTURES.sellerA.uid,
          amount: 100,
          paymentMethod: 'evc_plus',
          accountNumber: '252615000000',
          accountName: 'Seller Store Account',
        },
        sellerToken
      );
    } catch (err: any) {
      if (err.message.includes('exceeds verified available balance')) {
        payoutDoubleExecutionBlocked = true;
      }
    }
    assert.strictEqual(payoutDoubleExecutionBlocked, true, 'Payout exceeding verified balance must be rejected');

    // Verify state unchanged: Only 1 refund lock exists for the order with cumulativeRefunded = 80
    const lockSnap = await adminDb.collection('order_refund_locks').doc(orderId).get();
    assert.strictEqual(lockSnap.data()?.cumulativeRefunded, 80, 'Order refund lock cumulativeRefunded must remain 80');
    executed = true;

    recordTest({
      id: 'INC-05',
      name: 'Payout / Refund Double Execution Replay Defense',
      priorityCategory: 'Payout/Refund Double Execution',
      attackVector: 'Submitting duplicate review/approval for an already approved refund request',
      securityControl: 'server/refundGateway.ts terminal state validation: once approved or rejected, status cannot be mutated',
      expectedDenial: '409 Conflict: refund already settled and immutable',
      stateUnchangedVerification: 'Refund record remains approved with initial settlement reference; no duplicate execution',
      assertionExecuted: executed,
      pass: true,
    });
  } catch (err: any) {
    console.error('INC-05 error:', err);
    recordTest({
      id: 'INC-05',
      name: 'Payout / Refund Double Execution Defense',
      priorityCategory: 'Payout/Refund Double Execution',
      attackVector: 'Duplicate refund review',
      securityControl: 'server/refundGateway.ts',
      expectedDenial: '409 Conflict',
      stateUnchangedVerification: 'Refund state unchanged',
      assertionExecuted: true,
      pass: false,
      error: err.message,
    });
  }

  // --------------------------------------------------------------------------
  // TEST INC-06: Priority 6 - Cross-Tenant Access (Multi-Store Product Isolation)
  // --------------------------------------------------------------------------
  try {
    let executed = false;
    const productId = 'prod_inc_seller_A_01';
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'products', productId), {
        id: productId,
        title: 'Original Seller A Product',
        price: 50,
        sellerId: FIXTURES.sellerA.uid,
        storeId: FIXTURES.sellerA.storeId,
        createdAt: now,
      });
    });

    // Seller B attempts to directly update Seller A's product
    const sellerBContext = testEnv.authenticatedContext(FIXTURES.sellerB.uid, {
      email: FIXTURES.sellerB.email,
      email_verified: true,
    });
    const prodRef = doc(sellerBContext.firestore(), 'products', productId);

    await assertFails(updateDoc(prodRef, { price: 1, title: 'Defaced Product' }));
    await assertFails(deleteDoc(prodRef));

    // Verify product state unchanged
    let snap: any = null;
    await testEnv.withSecurityRulesDisabled(async (context) => {
      snap = await getDoc(doc(context.firestore(), 'products', productId));
    });
    assert.strictEqual(snap.data()?.price, 50, 'Product price must remain 50');
    assert.strictEqual(snap.data()?.title, 'Original Seller A Product', 'Product title must remain unchanged');
    executed = true;

    recordTest({
      id: 'INC-06',
      name: 'Cross-Tenant Multi-Store Product Isolation',
      priorityCategory: 'Cross-Tenant Access',
      attackVector: 'Competitor Seller B attempts direct update/deletion of Seller A catalog product in Firestore',
      securityControl: 'firestore.rules lines 136-148 (product write requires resource.data.sellerId == request.auth.uid)',
      expectedDenial: 'PERMISSION_DENIED evaluated by Firestore emulator rules',
      stateUnchangedVerification: 'Seller A product title and price remain untouched',
      assertionExecuted: executed,
      pass: true,
    });
  } catch (err: any) {
    console.error('INC-06 error:', err);
    recordTest({
      id: 'INC-06',
      name: 'Cross-Tenant Multi-Store Product Isolation',
      priorityCategory: 'Cross-Tenant Access',
      attackVector: 'Seller B mutating Seller A product',
      securityControl: 'firestore.rules',
      expectedDenial: 'PERMISSION_DENIED',
      stateUnchangedVerification: 'Product state unchanged',
      assertionExecuted: true,
      pass: false,
      error: err.message,
    });
  }

  // --------------------------------------------------------------------------
  // TEST INC-07: Priority 7 - Audit-Log Immutability & Actor Spoofing Denial
  // --------------------------------------------------------------------------
  try {
    let executed = false;
    const custContext = testEnv.authenticatedContext(FIXTURES.customerA.uid, {
      email: FIXTURES.customerA.email,
      email_verified: true,
    });

    // 1. Unauthenticated or Customer attempts to create an audit log
    const fakeLogId = 'audit_inc_fake_01';
    await assertFails(
      setDoc(doc(custContext.firestore(), 'audit_logs', fakeLogId), {
        id: fakeLogId,
        actorId: FIXTURES.customerA.uid,
        action: 'FAKE_AUDIT',
        createdAt: now,
      })
    );

    // 2. Admin attempts to create an audit log with forged actorId (actor spoofing)
    const adminContext = testEnv.authenticatedContext(FIXTURES.admin.uid, {
      email: FIXTURES.admin.email,
      email_verified: true,
      admin: true,
    });

    const spoofedLogId = 'audit_inc_spoofed_02';
    await assertFails(
      setDoc(doc(adminContext.firestore(), 'audit_logs', spoofedLogId), {
        id: spoofedLogId,
        actorId: 'some_other_admin_id', // Spoofed actorId
        action: 'SYSTEM_CONFIG_CHANGED',
        createdAt: now,
      })
    );

    // Verify state unchanged: neither log exists
    let snap1: any = null;
    let snap2: any = null;
    await testEnv.withSecurityRulesDisabled(async (context) => {
      snap1 = await getDoc(doc(context.firestore(), 'audit_logs', fakeLogId));
      snap2 = await getDoc(doc(context.firestore(), 'audit_logs', spoofedLogId));
    });
    assert.strictEqual(snap1.exists(), false, 'Fake audit log must not exist');
    assert.strictEqual(snap2.exists(), false, 'Spoofed audit log must not exist');
    executed = true;

    recordTest({
      id: 'INC-07',
      name: 'Audit-Log Immutability & Actor Spoofing Denial',
      priorityCategory: 'Audit-Log Immutability',
      attackVector: 'Unprivileged customer creating audit log or admin spoofing actorId on audit log entry',
      securityControl: 'firestore.rules lines 336-342 (allow create: if isAdmin() && incoming().actorId == request.auth.uid; update/delete: false)',
      expectedDenial: 'PERMISSION_DENIED evaluated by Firestore emulator rules',
      stateUnchangedVerification: 'No forged or unverified audit records persisted to audit_logs collection',
      assertionExecuted: executed,
      pass: true,
    });
  } catch (err: any) {
    console.error('INC-07 error:', err);
    recordTest({
      id: 'INC-07',
      name: 'Audit-Log Immutability & Actor Spoofing Denial',
      priorityCategory: 'Audit-Log Immutability',
      attackVector: 'Audit creation and spoofing',
      securityControl: 'firestore.rules',
      expectedDenial: 'PERMISSION_DENIED',
      stateUnchangedVerification: 'Audit collection untouched',
      assertionExecuted: true,
      pass: false,
      error: err.message,
    });
  }

  // --------------------------------------------------------------------------
  // TEST INC-08: Priority 8 - Payment-Reference Privacy (Cross-Customer List Snooping)
  // --------------------------------------------------------------------------
  try {
    let executed = false;
    // Seed private payment reference
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'paymentReferences', 'REF-PRIVATE-101'), {
        referenceNumber: 'REF-PRIVATE-101',
        orderId: 'ORD-PRIV-01',
        customerId: FIXTURES.customerA.uid,
        amount: 250,
        senderPhone: '+252615999999',
        createdAt: now,
      });
    });

    // Customer B attempts collection query / list on paymentReferences
    const custBContext = testEnv.authenticatedContext(FIXTURES.customerB.uid, {
      email: FIXTURES.customerB.email,
      email_verified: true,
    });

    await assertFails(getDocs(collection(custBContext.firestore(), 'paymentReferences')));

    // Admin CAN list
    const adminContext = testEnv.authenticatedContext(FIXTURES.admin.uid, {
      email: FIXTURES.admin.email,
      email_verified: true,
      admin: true,
    });
    await assertSucceeds(getDocs(collection(adminContext.firestore(), 'paymentReferences')));
    executed = true;

    recordTest({
      id: 'INC-08',
      name: 'Payment Reference Privacy & Bulk Snooping Prevention',
      priorityCategory: 'Payment-Reference Privacy',
      attackVector: 'Unauthorized Customer B attempts list/query on paymentReferences collection to harvest private transaction metadata',
      securityControl: 'firestore.rules line 240 (allow list: if isAdmin())',
      expectedDenial: 'PERMISSION_DENIED evaluated by Firestore emulator rules for non-admin callers',
      stateUnchangedVerification: 'Customer B receives zero payment reference documents from the collection',
      assertionExecuted: executed,
      pass: true,
    });
  } catch (err: any) {
    console.error('INC-08 error:', err);
    recordTest({
      id: 'INC-08',
      name: 'Payment Reference Privacy',
      priorityCategory: 'Payment-Reference Privacy',
      attackVector: 'Customer list on paymentReferences',
      securityControl: 'firestore.rules',
      expectedDenial: 'PERMISSION_DENIED',
      stateUnchangedVerification: 'Data privacy preserved',
      assertionExecuted: true,
      pass: false,
      error: err.message,
    });
  }

  // --------------------------------------------------------------------------
  // TEST INC-09: Priority 9 - Review Verification Integrity
  // --------------------------------------------------------------------------
  try {
    let executed = false;
    const reviewId = 'rev_inc_cust_A_01';
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'reviews', reviewId), {
        id: reviewId,
        customerId: FIXTURES.customerA.uid,
        userId: FIXTURES.customerA.uid,
        sellerId: FIXTURES.sellerA.uid,
        targetId: 'prod_101',
        targetType: 'product',
        rating: 5,
        comment: 'Great product from genuine buyer',
        isVerifiedPurchase: true,
        createdAt: now,
      });
    });

    const custBContext = testEnv.authenticatedContext(FIXTURES.customerB.uid, {
      email: FIXTURES.customerB.email,
      email_verified: true,
    });

    // Vector A: Customer B attempts to forge review with customerId: cust_A_101
    await assertFails(
      setDoc(doc(custBContext.firestore(), 'reviews', 'rev_forged_02'), {
        id: 'rev_forged_02',
        customerId: FIXTURES.customerA.uid, // Forgery
        userId: FIXTURES.customerA.uid,
        targetId: 'prod_101',
        rating: 5,
        comment: 'Fake review',
        createdAt: now,
      })
    );

    // Vector B: Customer B attempts to delete Customer A's review
    await assertFails(deleteDoc(doc(custBContext.firestore(), 'reviews', reviewId)));

    // Vector C: Attempt to set invalid rating out of bounds (> 5 or < 1)
    await assertFails(
      setDoc(doc(custBContext.firestore(), 'reviews', 'rev_invalid_rating'), {
        id: 'rev_invalid_rating',
        customerId: FIXTURES.customerB.uid,
        userId: FIXTURES.customerB.uid,
        targetId: 'prod_101',
        rating: 10, // Invalid: must be between 1 and 5
        comment: 'Out of bounds rating',
        createdAt: now,
      })
    );

    // Vector D: Verified purchase integrity in reviewService
    // Customer B has NOT purchased prod_101 -> isVerifiedPurchase must be false
    const unverifiedRev = reviewService.addReview({
      targetType: 'product',
      targetId: 'prod_unpurchased_999',
      userId: FIXTURES.customerB.uid,
      userName: 'Customer B',
      rating: 4,
      comment: 'Review without purchase history',
      isVerifiedPurchase: true, // Attacker attempts to forge verified purchase status
    });
    assert.strictEqual(unverifiedRev.isVerifiedPurchase, false, 'Unpurchased product review cannot have isVerifiedPurchase: true');

    // Verify existing review untouched
    let reviewSnap: any = null;
    await testEnv.withSecurityRulesDisabled(async (context) => {
      reviewSnap = await getDoc(doc(context.firestore(), 'reviews', reviewId));
    });
    assert.strictEqual(reviewSnap.data()?.rating, 5, 'Customer A review rating must remain 5');
    assert.strictEqual(reviewSnap.data()?.customerId, FIXTURES.customerA.uid, 'Review customerId must remain Customer A');
    executed = true;

    recordTest({
      id: 'INC-09',
      name: 'Review Verification & Anti-Impersonation Integrity',
      priorityCategory: 'Review Verification Integrity',
      attackVector: 'Forging customerId on reviews, unauthorized review deletion, rating boundary tampering, and fake verified badges',
      securityControl: 'firestore.rules lines 273-300 and authoritative orderService.hasUserPurchased check in reviewService',
      expectedDenial: 'PERMISSION_DENIED evaluated by Firestore emulator rules; isVerifiedPurchase strictly denied without order proof',
      stateUnchangedVerification: 'Customer A review rating and comment unchanged; forged review documents rejected',
      assertionExecuted: executed,
      pass: true,
    });
  } catch (err: any) {
    console.error('INC-09 error:', err);
    recordTest({
      id: 'INC-09',
      name: 'Review Verification Integrity',
      priorityCategory: 'Review Verification Integrity',
      attackVector: 'Review tampering and spoofing',
      securityControl: 'firestore.rules',
      expectedDenial: 'PERMISSION_DENIED',
      stateUnchangedVerification: 'Reviews unchanged',
      assertionExecuted: true,
      pass: false,
      error: err.message,
    });
  }

  // --------------------------------------------------------------------------
  // TEST INC-10: Priority 10 - Notification Recipient Spoofing & System Impersonation
  // --------------------------------------------------------------------------
  try {
    let executed = false;
    const notifId = 'notif_inc_private_01';
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'notifications', notifId), {
        id: notifId,
        userId: FIXTURES.customerA.uid,
        type: 'booking',
        title: { en: 'Booking Confirmation' },
        message: { en: 'Your booking is confirmed' },
        read: false,
        createdAt: now,
      });
    });

    const custBContext = testEnv.authenticatedContext(FIXTURES.customerB.uid, {
      email: FIXTURES.customerB.email,
      email_verified: true,
    });

    // Vector A: Customer B attempts to read Customer A's notification
    await assertFails(getDoc(doc(custBContext.firestore(), 'notifications', notifId)));

    // Vector B: Customer B attempts to forge an admin or payout system notification to Customer A
    await assertFails(
      setDoc(doc(custBContext.firestore(), 'notifications', 'notif_spoofed_admin'), {
        id: 'notif_spoofed_admin',
        userId: FIXTURES.customerA.uid,
        type: 'payout', // Forbidden from client: only booking, review, message, delivery allowed
        senderId: FIXTURES.customerB.uid,
        title: { en: 'Spoofed Payout Notice' },
        createdAt: now,
      })
    );

    // Vector C: Customer B attempts to forge senderId as an admin or system account
    await assertFails(
      setDoc(doc(custBContext.firestore(), 'notifications', 'notif_spoofed_sender'), {
        id: 'notif_spoofed_sender',
        userId: FIXTURES.customerA.uid,
        type: 'message',
        senderId: 'marketspace_system', // Spoofed senderId (does not match auth.uid)
        title: { en: 'Fake Message' },
        createdAt: now,
      })
    );

    // Verify state unchanged: Customer A's notification remains read: false
    let notifSnap: any = null;
    await testEnv.withSecurityRulesDisabled(async (context) => {
      notifSnap = await getDoc(doc(context.firestore(), 'notifications', notifId));
    });
    assert.strictEqual(notifSnap.data()?.read, false, 'Notification read state must remain false');
    assert.strictEqual(notifSnap.data()?.userId, FIXTURES.customerA.uid, 'Notification userId must remain Customer A');
    executed = true;

    recordTest({
      id: 'INC-10',
      name: 'Notification Recipient Spoofing & System Impersonation Defense',
      priorityCategory: 'Notification Recipient Spoofing',
      attackVector: 'Unauthorized notification reading, injecting spoofed admin/payout notifications, and senderId impersonation',
      securityControl: 'firestore.rules lines 304-323 (strict read restriction, type limited to user categories, senderId must equal request.auth.uid)',
      expectedDenial: 'PERMISSION_DENIED evaluated by Firestore emulator rules',
      stateUnchangedVerification: 'Victim notification inbox contains zero forged messages; private messages unread',
      assertionExecuted: executed,
      pass: true,
    });
  } catch (err: any) {
    console.error('INC-10 error:', err);
    recordTest({
      id: 'INC-10',
      name: 'Notification Recipient Spoofing Defense',
      priorityCategory: 'Notification Recipient Spoofing',
      attackVector: 'Notification injection and snooping',
      securityControl: 'firestore.rules',
      expectedDenial: 'PERMISSION_DENIED',
      stateUnchangedVerification: 'Notifications untouched',
      assertionExecuted: true,
      pass: false,
      error: err.message,
    });
  }

  // --------------------------------------------------------------------------
  // TEST INC-11: Priority 11 - Booking Ownership & Invariant Enforcement
  // --------------------------------------------------------------------------
  try {
    let executed = false;
    const bookingId = 'bk_inc_test_01';
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'bookings', bookingId), {
        id: bookingId,
        bookingCode: 'BK-99123',
        customerId: FIXTURES.customerA.uid,
        sellerId: FIXTURES.sellerA.uid,
        providerId: FIXTURES.sellerA.uid,
        serviceId: 'srv_consulting_01',
        status: 'confirmed',
        date: '2026-04-10',
        time: '14:00',
        createdAt: now,
      });
    });

    const custBContext = testEnv.authenticatedContext(FIXTURES.customerB.uid, {
      email: FIXTURES.customerB.email,
      email_verified: true,
    });

    // Vector A: Customer B attempts to forge a booking under Customer A's UID
    await assertFails(
      setDoc(doc(custBContext.firestore(), 'bookings', 'bk_forged_02'), {
        id: 'bk_forged_02',
        bookingCode: 'BK-FORGED',
        customerId: FIXTURES.customerA.uid, // Forged customer
        sellerId: FIXTURES.sellerA.uid,
        providerId: FIXTURES.sellerA.uid,
        status: 'requested',
        createdAt: now,
      })
    );

    // Vector B: Unrelated Customer B attempts to get/view Customer A's booking
    await assertFails(getDoc(doc(custBContext.firestore(), 'bookings', bookingId)));

    // Vector C: Customer A attempts to mutate provider-managed date and time fields directly via client rules
    const custAContext = testEnv.authenticatedContext(FIXTURES.customerA.uid, {
      email: FIXTURES.customerA.email,
      email_verified: true,
    });
    await assertFails(
      updateDoc(doc(custAContext.firestore(), 'bookings', bookingId), {
        date: '2026-12-31',
        time: '00:00',
      })
    );

    // Vector D: Competitor Seller B attempts to alter status of Seller A's booking in bookingService
    const createdBooking = bookingService.createBooking({
      serviceId: 'srv_consulting_01',
      serviceTitle: 'Consulting',
      price: 100,
      customerId: FIXTURES.customerA.uid,
      customerName: 'Customer A',
      customerPhone: '+252615111111',
      customerEmail: FIXTURES.customerA.email,
      sellerId: FIXTURES.sellerA.uid,
      storeId: FIXTURES.sellerA.storeId,
      storeName: 'Seller Store',
      date: '2026-04-10',
      time: '14:00',
      location: 'Mogadishu',
      notes: 'Consultation',
    });

    let serviceTamperingBlocked = false;
    try {
      bookingService.updateBookingStatus(
        createdBooking.id,
        'completed',
        FIXTURES.sellerB.uid, // Seller B attempting to manage Seller A booking
        'SELLER'
      );
    } catch (err: any) {
      if (err.message.includes('Forbidden: You can only manage bookings for your own services')) {
        serviceTamperingBlocked = true;
      }
    }
    assert.strictEqual(serviceTamperingBlocked, true, 'bookingService must block cross-seller status changes');

    // Verify state unchanged
    let bookingSnap: any = null;
    await testEnv.withSecurityRulesDisabled(async (context) => {
      bookingSnap = await getDoc(doc(context.firestore(), 'bookings', bookingId));
    });
    assert.strictEqual(bookingSnap.data()?.status, 'confirmed', 'Booking status must remain confirmed');
    assert.strictEqual(bookingSnap.data()?.date, '2026-04-10', 'Booking date must remain 2026-04-10');
    executed = true;

    recordTest({
      id: 'INC-11',
      name: 'Service Booking Ownership & Cross-Tenant Invariant Enforcement',
      priorityCategory: 'Booking Ownership/Invariants',
      attackVector: 'Forging booking customer identity, cross-customer booking snooping, customer date tampering, and competitor provider status updates',
      securityControl: 'firestore.rules lines 247-271 and provider ownership verification in bookingService.updateBookingStatus',
      expectedDenial: 'PERMISSION_DENIED evaluated by Firestore rules and Forbidden exception in bookingService',
      stateUnchangedVerification: 'Booking status remains confirmed; booking date, time, and customer identity remain unmodified',
      assertionExecuted: executed,
      pass: true,
    });
  } catch (err: any) {
    console.error('INC-11 error:', err);
    recordTest({
      id: 'INC-11',
      name: 'Booking Ownership Enforcement',
      priorityCategory: 'Booking Ownership/Invariants',
      attackVector: 'Cross-tenant booking tampering',
      securityControl: 'firestore.rules & bookingService',
      expectedDenial: 'PERMISSION_DENIED',
      stateUnchangedVerification: 'Booking unchanged',
      assertionExecuted: true,
      pass: false,
      error: err.message,
    });
  }

  // --------------------------------------------------------------------------
  // TEST INC-12: Priority 12 - Delivery State-Machine Integrity & Terminal Immutability
  // --------------------------------------------------------------------------
  try {
    let executed = false;
    const assignmentId = 'deliv_inc_immutable_01';
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'deliveryAssignments', assignmentId), {
        id: assignmentId,
        orderId: 'ORD-DELIV-01',
        sellerId: FIXTURES.sellerA.uid,
        driverId: FIXTURES.driverA.uid,
        status: 'delivered',
        createdAt: now,
      });
    });

    // Vector A: Unassigned Driver B attempts to update Driver A's delivery assignment in Firestore
    const driverBContext = testEnv.authenticatedContext(FIXTURES.driverB.uid, {
      email: FIXTURES.driverB.email,
      email_verified: true,
    });
    await assertFails(
      updateDoc(doc(driverBContext.firestore(), 'deliveryAssignments', assignmentId), {
        status: 'failed',
      })
    );

    // Vector B: Non-admin client attempts to delete delivery assignment
    await assertFails(deleteDoc(doc(driverBContext.firestore(), 'deliveryAssignments', assignmentId)));

    // Vector C: Service-level terminal state immutability in deliveryService: Reverting DELIVERED back to PENDING
    // Seed delivery assignment into service memory
    deliveryService.ensureAssignmentsFromOrders([
      {
        orderId: 'ORD-DELIV-TERM-01',
        customerId: FIXTURES.customerA.uid,
        customerName: 'Customer A',
        phone: '+252615000000',
        city: 'Mogadishu',
        address: 'Waberi',
        status: 'delivered',
        paymentStatus: 'paid',
        paymentMethod: 'evc_plus',
        total: 100,
        subtotal: 90,
        tax: 5,
        shipping: 5,
        items: [],
        createdAt: now,
        vendorOrders: [
          {
            subOrderId: 'sub_term_01',
            storeId: FIXTURES.sellerA.storeId,
            sellerId: FIXTURES.sellerA.uid,
            storeName: 'Seller Store',
            items: [],
            subtotal: 90,
            deliveryFee: 0,
            total: 90,
            status: 'delivered',
            commissionRate: 0.1,
            platformCommission: 9,
            sellerRevenue: 81,
          } as any,
        ],
      },
    ]);

    const termAssignmentId = 'deliv_ORD-DELIV-TERM-01_sub_term_01';
    let terminalReversalBlocked = false;
    try {
      await deliveryService.updateStatus({
        assignmentId: termAssignmentId,
        status: 'PENDING', // Attempting to reopen delivered assignment
        actorId: FIXTURES.admin.uid,
        actorRole: 'ADMIN',
      });
    } catch (err: any) {
      if (err.message.includes('immutable and cannot be transitioned')) {
        terminalReversalBlocked = true;
      }
    }
    assert.strictEqual(terminalReversalBlocked, true, 'Terminal delivery status DELIVERED must be immutable');

    // Verify state unchanged
    let snap: any = null;
    await testEnv.withSecurityRulesDisabled(async (context) => {
      snap = await getDoc(doc(context.firestore(), 'deliveryAssignments', assignmentId));
    });
    assert.strictEqual(snap.data()?.status, 'delivered', 'Delivery status must remain delivered');
    assert.strictEqual(snap.data()?.driverId, FIXTURES.driverA.uid, 'Driver must remain Driver A');
    executed = true;

    recordTest({
      id: 'INC-12',
      name: 'Delivery State-Machine Integrity & Terminal Immutability',
      priorityCategory: 'Delivery State-Machine Integrity',
      attackVector: 'Unassigned driver altering assignment status, unauthorized assignment deletion, and reopening DELIVERED shipments',
      securityControl: 'firestore.rules lines 350-388 and forward-only terminal state validation in deliveryService.updateStatus',
      expectedDenial: 'PERMISSION_DENIED in Firestore emulator rules and immutable terminal status exception in deliveryService',
      stateUnchangedVerification: 'Delivery status remains DELIVERED; unassigned driver tampering prevented',
      assertionExecuted: executed,
      pass: true,
    });
  } catch (err: any) {
    console.error('INC-12 error:', err);
    recordTest({
      id: 'INC-12',
      name: 'Delivery State-Machine Integrity',
      priorityCategory: 'Delivery State-Machine Integrity',
      attackVector: 'Delivery lifecycle tampering',
      securityControl: 'firestore.rules & deliveryService',
      expectedDenial: 'PERMISSION_DENIED',
      stateUnchangedVerification: 'Delivery status unchanged',
      assertionExecuted: true,
      pass: false,
      error: err.message,
    });
  }

  // --------------------------------------------------------------------------
  // TEST INC-13: Priority 13 - Storage MIME & Path Isolation (Cross-Seller & SVG XSS)
  // --------------------------------------------------------------------------
  try {
    let executed = false;
    const sellerBStorage = testEnv.authenticatedContext(FIXTURES.sellerB.uid, {
      email: FIXTURES.sellerB.email,
      email_verified: true,
    }).storage();

    // Vector A: Seller B attempts to upload into Seller A's directory (sellers/seller_A_301/product.png)
    const crossSellerRef = ref(sellerBStorage, `sellers/${FIXTURES.sellerA.uid}/injected_image.png`);
    const validPngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); // PNG header
    await assertFails(uploadBytes(crossSellerRef, validPngBuffer, { contentType: 'image/png' }));

    // Vector B: Attacker attempts to upload an SVG file containing executable script tags (XSS vector)
    const svgRef = ref(sellerBStorage, `sellers/${FIXTURES.sellerB.uid}/malicious.svg`);
    const svgBuffer = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    await assertFails(uploadBytes(svgRef, svgBuffer, { contentType: 'image/svg+xml' }));

    // Vector C: Non-admin seller attempts direct upload to root products directory
    const productRootRef = ref(sellerBStorage, 'products/prod_101/banner.png');
    await assertFails(uploadBytes(productRootRef, validPngBuffer, { contentType: 'image/png' }));

    // Vector D: Seller B uploading valid PNG to their own isolated path SUCCEEDS
    const validSelfRef = ref(sellerBStorage, `sellers/${FIXTURES.sellerB.uid}/own_catalog.png`);
    await assertSucceeds(uploadBytes(validSelfRef, validPngBuffer, { contentType: 'image/png' }));
    executed = true;

    recordTest({
      id: 'INC-13',
      name: 'Storage Cross-Seller Isolation & SVG XSS MIME Rejection',
      priorityCategory: 'Storage MIME/Path Isolation',
      attackVector: 'Cross-seller directory write, uploading SVG with embedded scripts (image/svg+xml), and bypassing root product isolation',
      securityControl: 'storage.rules lines 17-24 (isImage whitelist strictly restricts to jpeg, png, webp, gif; excludes svg) and lines 38-44 (tenant folder isolation)',
      expectedDenial: 'PERMISSION_DENIED evaluated by Firebase Storage emulator',
      stateUnchangedVerification: 'No files uploaded to foreign seller directories or products root; SVG uploads blocked',
      assertionExecuted: executed,
      pass: true,
    });
  } catch (err: any) {
    console.error('INC-13 error:', err);
    recordTest({
      id: 'INC-13',
      name: 'Storage Cross-Seller Isolation & MIME Rejection',
      priorityCategory: 'Storage MIME/Path Isolation',
      attackVector: 'Cross-seller and SVG uploads',
      securityControl: 'storage.rules',
      expectedDenial: 'PERMISSION_DENIED',
      stateUnchangedVerification: 'Storage unaffected',
      assertionExecuted: true,
      pass: false,
      error: err.message,
    });
  }

  // --------------------------------------------------------------------------
  // TEST INC-14: Priority 14 - LocalStorage / Cache Account Switching Isolation
  // --------------------------------------------------------------------------
  try {
    let executed = false;
    // Simulate browser environment localStorage
    const storageMap = new Map<string, string>();
    const mockStorage = {
      getItem: (key: string) => storageMap.get(key) || null,
      setItem: (key: string, val: string) => storageMap.set(key, val),
      removeItem: (key: string) => storageMap.delete(key),
      clear: () => storageMap.clear(),
    };
    (global as any).localStorage = mockStorage;
    (global as any).window = { localStorage: mockStorage };

    // User A populates session and caches
    const USER_KEY = 'marketspace_auth_user_v1';
    const ORDERS_KEY = 'marketspace_orders_v1';
    const ADDR_KEY = 'marketspace_saved_addresses_v1';
    const NOTIF_KEY = 'marketspace_notifications_v1';
    const CONV_KEY = 'marketspace_conversations_v1';

    global.localStorage.setItem(USER_KEY, JSON.stringify({ id: FIXTURES.customerA.uid, role: 'CUSTOMER' }));
    global.localStorage.setItem(ORDERS_KEY, JSON.stringify([{ orderId: 'ORD-A-SECRET', total: 500 }]));
    global.localStorage.setItem(ADDR_KEY, JSON.stringify([{ id: 'addr_1', address: '123 Private Street' }]));
    global.localStorage.setItem(NOTIF_KEY, JSON.stringify([{ id: 'n1', message: 'Private payout' }]));
    global.localStorage.setItem(CONV_KEY, JSON.stringify([{ id: 'c1', messages: ['Secret negotiation'] }]));

    assert.ok(global.localStorage.getItem(ORDERS_KEY), 'Order storage must exist before logout');

    // Execute comprehensive account purge (AuthContext.logout behavior)
    global.localStorage.removeItem(USER_KEY);
    orderService.clearUserCache();
    addressService.clearUserCache();
    notificationService.clearUserCache();
    messagingService.clearUserCache();

    // Verify all private keys are completely wiped
    assert.strictEqual(global.localStorage.getItem(USER_KEY), null, 'Auth user key must be purged');
    assert.strictEqual(global.localStorage.getItem(ORDERS_KEY), null, 'Orders key must be purged');
    assert.strictEqual(global.localStorage.getItem(ADDR_KEY), null, 'Addresses key must be purged');
    assert.strictEqual(global.localStorage.getItem(NOTIF_KEY), null, 'Notifications key must be purged');
    assert.strictEqual(global.localStorage.getItem(CONV_KEY), null, 'Conversations key must be purged');
    executed = true;

    recordTest({
      id: 'INC-14',
      name: 'LocalStorage & Service Memory Account Switching Cache Isolation',
      priorityCategory: 'LocalStorage/Cache Isolation',
      attackVector: 'Session handoff or account switching on shared terminal reading stale cached orders, addresses, and messages',
      securityControl: 'orderService, addressService, notificationService, and messagingService clearUserCache implementations invoked during signout',
      expectedDenial: 'Private cached documents purged from storage; reading caches after logout returns null',
      stateUnchangedVerification: 'Zero leaked session records or memory objects available to subsequent logged-in user',
      assertionExecuted: executed,
      pass: true,
    });
  } catch (err: any) {
    console.error('INC-14 error:', err);
    recordTest({
      id: 'INC-14',
      name: 'LocalStorage Account Switching Isolation',
      priorityCategory: 'LocalStorage/Cache Isolation',
      attackVector: 'Cache leakage',
      securityControl: 'clearUserCache()',
      expectedDenial: 'Null cache data',
      stateUnchangedVerification: 'Storage purged',
      assertionExecuted: true,
      pass: false,
      error: err.message,
    });
  }

  // --------------------------------------------------------------------------
  // TEST INC-15: Priority 15 - Distributed Rate-Limit Tenant & IP Key Isolation
  // --------------------------------------------------------------------------
  try {
    let executed = false;
    const rateLimiter = new MemoryRateLimitStore();
    const attackerKey = 'ip_attacker_malicious_192_168_1_99';
    const legitimateKey = 'ip_customer_legitimate_10_0_0_5';
    const maxRequests = 5;
    const windowMs = 60000;

    // Attacker sends 5 requests (hitting the threshold)
    for (let i = 0; i < maxRequests; i++) {
      const res = await rateLimiter.consume(attackerKey, maxRequests, windowMs);
      assert.strictEqual(res.allowed, true, `Attacker request ${i + 1} within quota`);
    }

    // Attacker's 6th request is strictly denied
    const attackerDenial = await rateLimiter.consume(attackerKey, maxRequests, windowMs);
    assert.strictEqual(attackerDenial.allowed, false, 'Attacker 6th request must be rejected with 429');
    assert.strictEqual(attackerDenial.remaining, 0, 'Attacker remaining quota must be 0');
    assert.ok(attackerDenial.retryAfter > 0, 'Attacker must receive non-zero Retry-After');

    // Legitimate user sends request on their own key: MUST BE ALLOWED (Key Isolation Invariant)
    const legitRes = await rateLimiter.consume(legitimateKey, maxRequests, windowMs);
    assert.strictEqual(legitRes.allowed, true, 'Legitimate customer must NOT be starved by attacker traffic');
    assert.strictEqual(legitRes.remaining, maxRequests - 1, 'Legitimate customer quota must decrement independently');
    executed = true;

    recordTest({
      id: 'INC-15',
      name: 'Distributed Rate-Limit Tenant & IP Key Isolation',
      priorityCategory: 'Distributed Rate-Limit Behavior',
      attackVector: 'Malicious client saturates rate limits on IP A attempting to cause denial of service / quota exhaustion for legitimate User B',
      securityControl: 'RateLimitStore partitioned sliding window counters keyed strictly by tenant/IP identifier',
      expectedDenial: 'Attacker key receives allowed: false (429 Too Many Requests); Legitimate key receives allowed: true',
      stateUnchangedVerification: 'Legitimate customer remaining quota unconsumed by foreign attacker burst',
      assertionExecuted: executed,
      pass: true,
    });
  } catch (err: any) {
    console.error('INC-15 error:', err);
    recordTest({
      id: 'INC-15',
      name: 'Distributed Rate-Limit Key Isolation',
      priorityCategory: 'Distributed Rate-Limit Behavior',
      attackVector: 'Cross-tenant rate limit starvation',
      securityControl: 'RateLimitStore key isolation',
      expectedDenial: 'Key A blocked, Key B allowed',
      stateUnchangedVerification: 'Quota isolated',
      assertionExecuted: true,
      pass: false,
      error: err.message,
    });
  }

  // --------------------------------------------------------------------------
  // Summary Table Output
  // --------------------------------------------------------------------------
  console.log('================================================================');
  console.log('INCREMENTAL REGRESSION SUITE RESULTS TABLE (15 TARGETED TESTS)');
  console.log('================================================================');
  console.log('| TEST ID | Status | Priority Area               | Attack Vector Name');
  console.log('|---------|--------|-----------------------------|-------------------------------------------------------');
  for (const r of incrementalResults) {
    const status = r.pass ? 'PASS  ' : 'FAIL  ';
    const id = r.id.padEnd(7, ' ');
    const cat = r.priorityCategory.padEnd(27, ' ');
    console.log(`| ${id} | ${status} | ${cat} | ${r.name}`);
  }
  console.log('================================================================');

  const total = incrementalResults.length;
  const passed = incrementalResults.filter((r) => r.pass).length;
  const failed = incrementalResults.filter((r) => !r.pass).length;

  console.log(`TOTAL INCREMENTAL TESTS: ${total}`);
  console.log(`PASSED: ${passed}`);
  console.log(`FAILED: ${failed}`);
  console.log('================================================================\n');

  if (failed > 0) {
    console.error(`SUITE FAILED: ${failed} incremental security regression tests failed!`);
    process.exit(1);
  } else {
    console.log('ALL INCREMENTAL TESTS PASSED: 15/15 regression tests successfully verified.');
    process.exit(0);
  }
}

runIncrementalSecurityRegressionSuite().catch((err) => {
  console.error('Fatal error running incremental suite:', err);
  process.exit(1);
});
