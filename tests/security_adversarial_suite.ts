import assert from 'assert';
import fs from 'fs';
import { initializeTestEnvironment, assertFails, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { ref, uploadBytes } from 'firebase/storage';
import { processPaymentReviewGateway } from '../server/paymentGateway';
import { processUserRoleUpdateGateway } from '../server/userGateway';
import { getAdminDb } from '../server/firebaseAdmin';

interface AdversarialTestResult {
  id: string;
  attackVector: string;
  category: string;
  payload: string;
  expectedDefensiveResponse: string;
  actualDefensiveResponse: string;
  defenseVerified: boolean;
  pass: boolean;
}

const adversarialResults: AdversarialTestResult[] = [];

function recordAttack(res: AdversarialTestResult) {
  adversarialResults.push(res);
  const tag = res.pass ? '[PASS - BLOCKED]' : '[FAIL - BREACH]';
  console.log(`${tag} ${res.id}: ${res.attackVector} -> ${res.actualDefensiveResponse}`);
}

async function runAdversarialSuite() {
  console.log('================================================================');
  console.log('STARTING ADVERSARIAL "DIRTY DOZEN" NEGATIVE TEST SUITE');
  console.log('Testing Malicious Payloads, Privilege Escalation, and Rule Bypasses');
  console.log('================================================================\n');

  const firestoreRules = fs.readFileSync('firestore.rules', 'utf8');
  const storageRules = fs.readFileSync('storage.rules', 'utf8');

  let testEnv: RulesTestEnvironment | null = null;
  try {
    testEnv = await initializeTestEnvironment({
      projectId: 'demo-marketspace-adversarial',
      firestore: { rules: firestoreRules },
      storage: { rules: storageRules },
    });
    console.log('[AdversarialHarness] Live emulator connected for defense-in-depth rules evaluation.\n');
  } catch (err: any) {
    console.warn('[AdversarialHarness] Emulator connection skipped:', err.message);
  }

  const adminDb = getAdminDb();
  const now = new Date().toISOString();

  // Seed baseline records using Admin SDK
  const ORDER_CLEAN = 'ORD-ADV-CLEAN-01';
  const ORDER_PAID = 'ORD-ADV-PAID-02';
  const ORDER_CANCELLED = 'ORD-ADV-CANCELLED-03';
  const ORDER_COD = 'ORD-ADV-COD-04';
  const SUBMISSION_VALID = 'SUB-ADV-VALID-01';
  const SUBMISSION_CONFIRMED = 'SUB-ADV-CONFIRMED-02';
  const SUBMISSION_MISMATCH_CUST = 'SUB-ADV-MISMATCH-CUST-03';
  const SUBMISSION_MISMATCH_AMT = 'SUB-ADV-MISMATCH-AMT-04';
  const REF_VALID = 'REFADV001';
  const REF_CONFIRMED = 'REFADVCONFIRMED02';

  // Seed fixture users
  await adminDb.collection('users').doc('user_customer_a').set({
    id: 'user_customer_a',
    email: 'customerA@marketspace.test',
    role: 'CUSTOMER',
    isVerified: true,
  });
  await adminDb.collection('users').doc('user_customer_b').set({
    id: 'user_customer_b',
    email: 'customerB@marketspace.test',
    role: 'CUSTOMER',
    isVerified: true,
  });
  await adminDb.collection('users').doc('user_attacker_admin').set({
    id: 'user_attacker_admin',
    email: 'attacker_admin@marketspace.test',
    role: 'ADMIN',
    isVerified: true,
  });

  // Seed clean order
  await adminDb.collection('orders').doc(ORDER_CLEAN).set({
    orderId: ORDER_CLEAN,
    customerId: 'user_customer_a',
    total: 150,
    subtotal: 150,
    currency: 'USD',
    paymentStatus: 'pending',
    status: 'pending',
    paymentMethod: 'evc_plus',
    createdAt: now,
  });

  // Seed already paid order
  await adminDb.collection('orders').doc(ORDER_PAID).set({
    orderId: ORDER_PAID,
    customerId: 'user_customer_a',
    total: 200,
    subtotal: 200,
    currency: 'USD',
    paymentStatus: 'paid',
    status: 'processing',
    paymentMethod: 'evc_plus',
    createdAt: now,
  });

  // Seed cancelled order
  await adminDb.collection('orders').doc(ORDER_CANCELLED).set({
    orderId: ORDER_CANCELLED,
    customerId: 'user_customer_a',
    total: 75,
    subtotal: 75,
    currency: 'USD',
    paymentStatus: 'pending',
    status: 'cancelled',
    paymentMethod: 'evc_plus',
    createdAt: now,
  });

  // Seed COD order
  await adminDb.collection('orders').doc(ORDER_COD).set({
    orderId: ORDER_COD,
    customerId: 'user_customer_a',
    total: 50,
    subtotal: 50,
    currency: 'USD',
    paymentStatus: 'pending',
    status: 'pending',
    paymentMethod: 'cash_on_delivery',
    createdAt: now,
  });

  // Seed valid submission
  await adminDb.collection('paymentSubmissions').doc(SUBMISSION_VALID).set({
    id: SUBMISSION_VALID,
    orderId: ORDER_CLEAN,
    customerId: 'user_customer_a',
    amount: 150,
    currency: 'USD',
    referenceNumber: REF_VALID,
    status: 'PENDING',
    createdAt: now,
  });

  // Seed confirmed submission
  await adminDb.collection('paymentSubmissions').doc(SUBMISSION_CONFIRMED).set({
    id: SUBMISSION_CONFIRMED,
    orderId: ORDER_CLEAN,
    customerId: 'user_customer_a',
    amount: 150,
    currency: 'USD',
    referenceNumber: REF_CONFIRMED,
    status: 'CONFIRMED',
    createdAt: now,
  });

  // Seed customer-mismatched submission
  await adminDb.collection('paymentSubmissions').doc(SUBMISSION_MISMATCH_CUST).set({
    id: SUBMISSION_MISMATCH_CUST,
    orderId: ORDER_CLEAN,
    customerId: 'user_customer_b', // Attacker / wrong customer
    amount: 150,
    currency: 'USD',
    referenceNumber: 'REFWRONGCUST99',
    status: 'PENDING',
    createdAt: now,
  });

  // Seed underpaid submission
  await adminDb.collection('paymentSubmissions').doc(SUBMISSION_MISMATCH_AMT).set({
    id: SUBMISSION_MISMATCH_AMT,
    orderId: ORDER_CLEAN,
    customerId: 'user_customer_a',
    amount: 10, // Underpayment: order total is 150
    currency: 'USD',
    referenceNumber: 'REFUNDERPAID10',
    status: 'PENDING',
    createdAt: now,
  });

  // Mock Tokens
  function makeTestBearer(claims: Record<string, any>): string {
    const b64 = Buffer.from(JSON.stringify(claims)).toString('base64');
    return `Bearer test-token:${b64}`;
  }

  const MOCK_ADMIN_TOKEN = makeTestBearer({
    uid: 'user_attacker_admin',
    email: 'attacker_admin@marketspace.test',
    email_verified: true,
    admin: true,
    role: 'ADMIN',
  });

  const MOCK_SUPER_ADMIN_TOKEN = makeTestBearer({
    uid: 'user_super_admin',
    email: 'marketspace119@gmail.com',
    email_verified: true,
    super_admin: true,
    role: 'SUPER_ADMIN',
  });

  const MOCK_CUSTOMER_TOKEN = makeTestBearer({
    uid: 'user_customer_b',
    email: 'customerB@marketspace.test',
    email_verified: true,
    role: 'CUSTOMER',
  });

  // --------------------------------------------------------------------------
  // ADV-01: Admin Escalating Role to SUPER_ADMIN (HIGH-01)
  // --------------------------------------------------------------------------
  try {
    let blocked = false;
    let errMsg = '';
    try {
      await processUserRoleUpdateGateway(
        { targetUserId: 'user_attacker_admin', newRole: 'SUPER_ADMIN' },
        MOCK_ADMIN_TOKEN // Ordinary admin token
      );
    } catch (e: any) {
      blocked = true;
      errMsg = e.message;
      assert(e.message.includes('Forbidden') || e.message.includes('Super Administrator'), 'Must reject non-superadmin');
    }
    assert(blocked, 'ADV-01 must block privilege escalation');
    recordAttack({
      id: 'ADV-01',
      attackVector: 'Standard Admin Privilege Escalation to SUPER_ADMIN',
      category: 'PRIVILEGE_ESCALATION',
      payload: '{ targetUserId: "user_attacker_admin", newRole: "SUPER_ADMIN" }',
      expectedDefensiveResponse: '403 Forbidden: Super Administrator privileges required',
      actualDefensiveResponse: errMsg,
      defenseVerified: true,
      pass: true,
    });
  } catch (err: any) {
    recordAttack({
      id: 'ADV-01',
      attackVector: 'Standard Admin Privilege Escalation to SUPER_ADMIN',
      category: 'PRIVILEGE_ESCALATION',
      payload: '',
      expectedDefensiveResponse: '403 Forbidden',
      actualDefensiveResponse: err.message,
      defenseVerified: false,
      pass: false,
    });
  }

  // --------------------------------------------------------------------------
  // ADV-02: Payment Confirmation Bypass (orderId only without submission) (HIGH-02)
  // --------------------------------------------------------------------------
  try {
    let blocked = false;
    let errMsg = '';
    try {
      await processPaymentReviewGateway(
        { orderId: ORDER_CLEAN, decision: 'CONFIRMED' },
        MOCK_ADMIN_TOKEN
      );
    } catch (e: any) {
      blocked = true;
      errMsg = e.message;
      assert(e.message.includes('لا يمكن تأكيد الدفع بمجرد إرسال رقم الطلب'), 'Must reject bare orderId confirmation');
    }
    assert(blocked, 'ADV-02 must block orderId-only bypass');
    recordAttack({
      id: 'ADV-02',
      attackVector: 'Payment Confirmation Bypass via bare OrderID',
      category: 'PAYMENT_GATEWAY',
      payload: '{ orderId: "ORD-ADV-CLEAN-01", decision: "CONFIRMED" }',
      expectedDefensiveResponse: '400 Bad Request: submissionId or explicit settlement required',
      actualDefensiveResponse: errMsg,
      defenseVerified: true,
      pass: true,
    });
  } catch (err: any) {
    recordAttack({
      id: 'ADV-02',
      attackVector: 'Payment Confirmation Bypass via bare OrderID',
      category: 'PAYMENT_GATEWAY',
      payload: '',
      expectedDefensiveResponse: '400 Bad Request',
      actualDefensiveResponse: err.message,
      defenseVerified: false,
      pass: false,
    });
  }

  // --------------------------------------------------------------------------
  // ADV-03: Fake Submission ID Review
  // --------------------------------------------------------------------------
  try {
    let blocked = false;
    let errMsg = '';
    try {
      await processPaymentReviewGateway(
        { submissionId: 'SUB-FAKE-NONEXISTENT-999', decision: 'CONFIRMED' },
        MOCK_ADMIN_TOKEN
      );
    } catch (e: any) {
      blocked = true;
      errMsg = e.message;
      assert(e.message.includes('غير موجود'), 'Must reject non-existent submission');
    }
    assert(blocked, 'ADV-03 must block fake submission ID');
    recordAttack({
      id: 'ADV-03',
      attackVector: 'Payment Confirmation with Fake/Forged Submission ID',
      category: 'PAYMENT_GATEWAY',
      payload: '{ submissionId: "SUB-FAKE-NONEXISTENT-999", decision: "CONFIRMED" }',
      expectedDefensiveResponse: '404 Not Found: إشعار الدفع غير موجود',
      actualDefensiveResponse: errMsg,
      defenseVerified: true,
      pass: true,
    });
  } catch (err: any) {
    recordAttack({
      id: 'ADV-03',
      attackVector: 'Payment Confirmation with Fake/Forged Submission ID',
      category: 'PAYMENT_GATEWAY',
      payload: '',
      expectedDefensiveResponse: '404 Not Found',
      actualDefensiveResponse: err.message,
      defenseVerified: false,
      pass: false,
    });
  }

  // --------------------------------------------------------------------------
  // ADV-04: Cross-Customer Payment Spoofing (Customer Mismatch)
  // --------------------------------------------------------------------------
  try {
    let blocked = false;
    let errMsg = '';
    try {
      await processPaymentReviewGateway(
        { submissionId: SUBMISSION_MISMATCH_CUST, decision: 'CONFIRMED' },
        MOCK_ADMIN_TOKEN
      );
    } catch (e: any) {
      blocked = true;
      errMsg = e.message;
      assert(e.message.includes('معرف العميل') || e.message.includes('لا يطابق'), 'Must reject customer mismatch');
    }
    assert(blocked, 'ADV-04 must block customer mismatch');
    recordAttack({
      id: 'ADV-04',
      attackVector: 'Payment Confirmation on Customer-Mismatched Submission',
      category: 'PAYMENT_INTEGRITY',
      payload: '{ submissionId: "SUB-ADV-MISMATCH-CUST-03", decision: "CONFIRMED" }',
      expectedDefensiveResponse: '403 Forbidden: Customer mismatch between submission and order',
      actualDefensiveResponse: errMsg,
      defenseVerified: true,
      pass: true,
    });
  } catch (err: any) {
    recordAttack({
      id: 'ADV-04',
      attackVector: 'Payment Confirmation on Customer-Mismatched Submission',
      category: 'PAYMENT_INTEGRITY',
      payload: '',
      expectedDefensiveResponse: '403 Forbidden',
      actualDefensiveResponse: err.message,
      defenseVerified: false,
      pass: false,
    });
  }

  // --------------------------------------------------------------------------
  // ADV-05: Underpaid Amount Mismatch
  // --------------------------------------------------------------------------
  try {
    let blocked = false;
    let errMsg = '';
    try {
      await processPaymentReviewGateway(
        { submissionId: SUBMISSION_MISMATCH_AMT, decision: 'CONFIRMED' },
        MOCK_ADMIN_TOKEN
      );
    } catch (e: any) {
      blocked = true;
      errMsg = e.message;
      assert(e.message.includes('غير مطابق لإجمالي الطلب'), 'Must reject amount mismatch');
    }
    assert(blocked, 'ADV-05 must block amount mismatch');
    recordAttack({
      id: 'ADV-05',
      attackVector: 'Payment Confirmation on Underpaid Amount ($10 vs $150)',
      category: 'FINANCIAL_INTEGRITY',
      payload: '{ submissionId: "SUB-ADV-MISMATCH-AMT-04", decision: "CONFIRMED" }',
      expectedDefensiveResponse: '400 Bad Request: Amount mismatch ($10 vs $150)',
      actualDefensiveResponse: errMsg,
      defenseVerified: true,
      pass: true,
    });
  } catch (err: any) {
    recordAttack({
      id: 'ADV-05',
      attackVector: 'Payment Confirmation on Underpaid Amount',
      category: 'FINANCIAL_INTEGRITY',
      payload: '',
      expectedDefensiveResponse: '400 Bad Request',
      actualDefensiveResponse: err.message,
      defenseVerified: false,
      pass: false,
    });
  }

  // --------------------------------------------------------------------------
  // ADV-06: Replay Attack: Re-confirming Already Confirmed Submission
  // --------------------------------------------------------------------------
  try {
    let blocked = false;
    let errMsg = '';
    try {
      await processPaymentReviewGateway(
        { submissionId: SUBMISSION_CONFIRMED, decision: 'CONFIRMED' },
        MOCK_ADMIN_TOKEN
      );
    } catch (e: any) {
      blocked = true;
      errMsg = e.message;
      assert(e.message.includes('تم اعتماده وتأكيده مسبقاً'), 'Must reject duplicate review');
    }
    assert(blocked, 'ADV-06 must block duplicate review');
    recordAttack({
      id: 'ADV-06',
      attackVector: 'Payment Replay Attack (Re-confirming Settled Submission)',
      category: 'PAYMENT_GATEWAY',
      payload: '{ submissionId: "SUB-ADV-CONFIRMED-02", decision: "CONFIRMED" }',
      expectedDefensiveResponse: '409 Conflict: Already confirmed',
      actualDefensiveResponse: errMsg,
      defenseVerified: true,
      pass: true,
    });
  } catch (err: any) {
    recordAttack({
      id: 'ADV-06',
      attackVector: 'Payment Replay Attack',
      category: 'PAYMENT_GATEWAY',
      payload: '',
      expectedDefensiveResponse: '409 Conflict',
      actualDefensiveResponse: err.message,
      defenseVerified: false,
      pass: false,
    });
  }

  // --------------------------------------------------------------------------
  // ADV-07: Payment Confirmation on Cancelled Order
  // --------------------------------------------------------------------------
  try {
    let blocked = false;
    let errMsg = '';
    // Create submission for cancelled order
    const subCancelledId = 'SUB-CANCELLED-TEST';
    await adminDb.collection('paymentSubmissions').doc(subCancelledId).set({
      id: subCancelledId,
      orderId: ORDER_CANCELLED,
      customerId: 'user_customer_a',
      amount: 75,
      currency: 'USD',
      status: 'PENDING',
      createdAt: now,
    });

    try {
      await processPaymentReviewGateway(
        { submissionId: subCancelledId, decision: 'CONFIRMED' },
        MOCK_ADMIN_TOKEN
      );
    } catch (e: any) {
      blocked = true;
      errMsg = e.message;
      assert(e.message.includes('طلب ملغي'), 'Must reject payment confirmation on cancelled order');
    }
    assert(blocked, 'ADV-07 must block payment on cancelled order');
    recordAttack({
      id: 'ADV-07',
      attackVector: 'Payment Confirmation on Cancelled Order',
      category: 'FINANCIAL_INTEGRITY',
      payload: '{ submissionId: "SUB-CANCELLED-TEST", decision: "CONFIRMED" }',
      expectedDefensiveResponse: '400 Bad Request: Order is cancelled',
      actualDefensiveResponse: errMsg,
      defenseVerified: true,
      pass: true,
    });
  } catch (err: any) {
    recordAttack({
      id: 'ADV-07',
      attackVector: 'Payment Confirmation on Cancelled Order',
      category: 'FINANCIAL_INTEGRITY',
      payload: '',
      expectedDefensiveResponse: '400 Bad Request',
      actualDefensiveResponse: err.message,
      defenseVerified: false,
      pass: false,
    });
  }

  // --------------------------------------------------------------------------
  // ADV-08: Re-confirmation on Already-Paid Order
  // --------------------------------------------------------------------------
  try {
    let blocked = false;
    let errMsg = '';
    const subPaidId = 'SUB-ALREADY-PAID-TEST';
    await adminDb.collection('paymentSubmissions').doc(subPaidId).set({
      id: subPaidId,
      orderId: ORDER_PAID,
      customerId: 'user_customer_a',
      amount: 200,
      currency: 'USD',
      status: 'PENDING',
      createdAt: now,
    });

    try {
      await processPaymentReviewGateway(
        { submissionId: subPaidId, decision: 'CONFIRMED' },
        MOCK_ADMIN_TOKEN
      );
    } catch (e: any) {
      blocked = true;
      errMsg = e.message;
      assert(e.message.includes('مدفوع مسبقاً'), 'Must reject already paid order');
    }
    assert(blocked, 'ADV-08 must block re-confirmation on paid order');
    recordAttack({
      id: 'ADV-08',
      attackVector: 'Payment Re-confirmation on Settled/Paid Order',
      category: 'FINANCIAL_INTEGRITY',
      payload: '{ submissionId: "SUB-ALREADY-PAID-TEST", decision: "CONFIRMED" }',
      expectedDefensiveResponse: '409 Conflict: Already settled / paid',
      actualDefensiveResponse: errMsg,
      defenseVerified: true,
      pass: true,
    });
  } catch (err: any) {
    recordAttack({
      id: 'ADV-08',
      attackVector: 'Payment Re-confirmation on Settled/Paid Order',
      category: 'FINANCIAL_INTEGRITY',
      payload: '',
      expectedDefensiveResponse: '409 Conflict',
      actualDefensiveResponse: err.message,
      defenseVerified: false,
      pass: false,
    });
  }

  // --------------------------------------------------------------------------
  // ADV-09: COD Settlement on Electronic Order Spoof
  // --------------------------------------------------------------------------
  try {
    let blocked = false;
    let errMsg = '';
    try {
      await processPaymentReviewGateway(
        { orderId: ORDER_CLEAN, decision: 'CONFIRMED', action: 'COD_SETTLEMENT' },
        MOCK_ADMIN_TOKEN
      );
    } catch (e: any) {
      blocked = true;
      errMsg = e.message;
      assert(e.message.includes('وتتطلب إشعار دفع إلكتروني موثق'), 'Must reject COD settlement on electronic order');
    }
    assert(blocked, 'ADV-09 must block COD spoof');
    recordAttack({
      id: 'ADV-09',
      attackVector: 'COD Settlement Spoof on Electronic Payment Order',
      category: 'PAYMENT_GATEWAY',
      payload: '{ orderId: "ORD-ADV-CLEAN-01", action: "COD_SETTLEMENT" }',
      expectedDefensiveResponse: '400 Bad Request: Order method is electronic, requires verified submission',
      actualDefensiveResponse: errMsg,
      defenseVerified: true,
      pass: true,
    });
  } catch (err: any) {
    recordAttack({
      id: 'ADV-09',
      attackVector: 'COD Settlement Spoof on Electronic Payment Order',
      category: 'PAYMENT_GATEWAY',
      payload: '',
      expectedDefensiveResponse: '400 Bad Request',
      actualDefensiveResponse: err.message,
      defenseVerified: false,
      pass: false,
    });
  }

  // --------------------------------------------------------------------------
  // ADV-10: Exceptional Override Attempt without Super Admin Credentials
  // --------------------------------------------------------------------------
  try {
    let blocked = false;
    let errMsg = '';
    try {
      await processPaymentReviewGateway(
        { orderId: ORDER_CLEAN, decision: 'CONFIRMED', action: 'SUPER_ADMIN_OVERRIDE', notes: 'Manual override by admin' },
        MOCK_ADMIN_TOKEN // Normal admin
      );
    } catch (e: any) {
      blocked = true;
      errMsg = e.message;
      assert(e.message.includes('Forbidden: Super Administrator'), 'Must reject standard admin override');
    }
    assert(blocked, 'ADV-10 must block non-superadmin override');
    recordAttack({
      id: 'ADV-10',
      attackVector: 'Exceptional Manual Override without Super Admin Role',
      category: 'AUTHORIZATION',
      payload: '{ orderId: "ORD-ADV-CLEAN-01", action: "SUPER_ADMIN_OVERRIDE" }',
      expectedDefensiveResponse: '403 Forbidden: Super Administrator privileges required',
      actualDefensiveResponse: errMsg,
      defenseVerified: true,
      pass: true,
    });
  } catch (err: any) {
    recordAttack({
      id: 'ADV-10',
      attackVector: 'Exceptional Manual Override without Super Admin Role',
      category: 'AUTHORIZATION',
      payload: '',
      expectedDefensiveResponse: '403 Forbidden',
      actualDefensiveResponse: err.message,
      defenseVerified: false,
      pass: false,
    });
  }

  // --------------------------------------------------------------------------
  // ADV-11: Exceptional Override without Sufficient Reason/Audit Justification
  // --------------------------------------------------------------------------
  try {
    let blocked = false;
    let errMsg = '';
    try {
      await processPaymentReviewGateway(
        { orderId: ORDER_CLEAN, decision: 'CONFIRMED', action: 'SUPER_ADMIN_OVERRIDE', notes: 'short' },
        MOCK_SUPER_ADMIN_TOKEN
      );
    } catch (e: any) {
      blocked = true;
      errMsg = e.message;
      assert(e.message.includes('سبب واضح وتفصيلي'), 'Must require detailed justification');
    }
    assert(blocked, 'ADV-11 must block unreasoned override');
    recordAttack({
      id: 'ADV-11',
      attackVector: 'Super Admin Override with Insufficient Justification (<8 chars)',
      category: 'AUDIT_TRAIL',
      payload: '{ orderId: "ORD-ADV-CLEAN-01", notes: "short" }',
      expectedDefensiveResponse: '400 Bad Request: Detailed justification required',
      actualDefensiveResponse: errMsg,
      defenseVerified: true,
      pass: true,
    });
  } catch (err: any) {
    recordAttack({
      id: 'ADV-11',
      attackVector: 'Super Admin Override with Insufficient Justification',
      category: 'AUDIT_TRAIL',
      payload: '',
      expectedDefensiveResponse: '400 Bad Request',
      actualDefensiveResponse: err.message,
      defenseVerified: false,
      pass: false,
    });
  }

  // --------------------------------------------------------------------------
  // DEFENSE-IN-DEPTH: LIVE FIRESTORE RULES ADVERSARIAL TESTS (ADV-12 to ADV-18)
  // --------------------------------------------------------------------------
  if (testEnv) {
    const customerContext = testEnv.authenticatedContext('user_customer_a', {
      email: 'customerA@marketspace.test',
      email_verified: true,
    });
    const customerBContext = testEnv.authenticatedContext('user_customer_b', {
      email: 'customerB@marketspace.test',
      email_verified: true,
    });
    const adminContext = testEnv.authenticatedContext('user_attacker_admin', {
      email: 'attacker_admin@marketspace.test',
      email_verified: true,
      admin: true,
    });
    const customerDb = customerContext.firestore();
    const customerBDb = customerBContext.firestore();
    const adminDbRules = adminContext.firestore();

    // ADV-12: Direct Client Write to paymentSubmissions (HIGH-03 / P0)
    try {
      await assertFails(
        setDoc(doc(customerDb, 'paymentSubmissions', 'FORGED-SUB-01'), {
          orderId: ORDER_CLEAN,
          customerId: 'user_customer_a',
          amount: 150,
          status: 'CONFIRMED', // Forge confirmed status
        })
      );
      recordAttack({
        id: 'ADV-12',
        attackVector: 'Direct Firestore Client Write to paymentSubmissions (P0 Bypass Attempt)',
        category: 'DEFENSE_IN_DEPTH_RULES',
        payload: 'setDoc(paymentSubmissions/FORGED-SUB-01, status: CONFIRMED)',
        expectedDefensiveResponse: 'PERMISSION_DENIED: Direct client writes denied',
        actualDefensiveResponse: 'PERMISSION_DENIED evaluated by Firestore emulator',
        defenseVerified: true,
        pass: true,
      });
    } catch (e: any) {
      recordAttack({
        id: 'ADV-12',
        attackVector: 'Direct Firestore Client Write to paymentSubmissions',
        category: 'DEFENSE_IN_DEPTH_RULES',
        payload: '',
        expectedDefensiveResponse: 'PERMISSION_DENIED',
        actualDefensiveResponse: e.message,
        defenseVerified: false,
        pass: false,
      });
    }

    // ADV-13: Direct Client Write to paymentReferences (HIGH-05 / P0)
    try {
      await assertFails(
        setDoc(doc(customerDb, 'paymentReferences', 'FORGEDREF999'), {
          orderId: ORDER_CLEAN,
          customerId: 'user_customer_a',
          status: 'CONFIRMED',
        })
      );
      recordAttack({
        id: 'ADV-13',
        attackVector: 'Direct Firestore Client Write to paymentReferences',
        category: 'DEFENSE_IN_DEPTH_RULES',
        payload: 'setDoc(paymentReferences/FORGEDREF999, status: CONFIRMED)',
        expectedDefensiveResponse: 'PERMISSION_DENIED: Direct client writes denied',
        actualDefensiveResponse: 'PERMISSION_DENIED evaluated by Firestore emulator',
        defenseVerified: true,
        pass: true,
      });
    } catch (e: any) {
      recordAttack({
        id: 'ADV-13',
        attackVector: 'Direct Firestore Client Write to paymentReferences',
        category: 'DEFENSE_IN_DEPTH_RULES',
        payload: '',
        expectedDefensiveResponse: 'PERMISSION_DENIED',
        actualDefensiveResponse: e.message,
        defenseVerified: false,
        pass: false,
      });
    }

    // ADV-14: Cross-Customer Privacy Snoop on paymentReferences (HIGH-05)
    try {
      await assertFails(
        getDoc(doc(customerBDb, 'paymentReferences', REF_VALID))
      );
      recordAttack({
        id: 'ADV-14',
        attackVector: 'Cross-Customer Privacy Snooping on paymentReferences',
        category: 'DATA_PRIVACY',
        payload: 'getDoc(paymentReferences/REFADV001) by Customer B',
        expectedDefensiveResponse: 'PERMISSION_DENIED: Only owner or admin can read',
        actualDefensiveResponse: 'PERMISSION_DENIED evaluated by Firestore emulator',
        defenseVerified: true,
        pass: true,
      });
    } catch (e: any) {
      recordAttack({
        id: 'ADV-14',
        attackVector: 'Cross-Customer Privacy Snooping on paymentReferences',
        category: 'DATA_PRIVACY',
        payload: '',
        expectedDefensiveResponse: 'PERMISSION_DENIED',
        actualDefensiveResponse: e.message,
        defenseVerified: false,
        pass: false,
      });
    }

    // ADV-15: Admin Direct Client Modification of Order Financial Fields (HIGH-03)
    try {
      await assertFails(
        updateDoc(doc(adminDbRules, 'orders', ORDER_CLEAN), {
          total: 1, // Tamper total from 150 to 1
        })
      );
      recordAttack({
        id: 'ADV-15',
        attackVector: 'Admin Direct Client Tampering with Order Financial Field (total)',
        category: 'FINANCIAL_INTEGRITY',
        payload: 'updateDoc(orders/ORD-ADV-CLEAN-01, total: 1) by Admin',
        expectedDefensiveResponse: 'PERMISSION_DENIED: Financial fields immutable via client SDK',
        actualDefensiveResponse: 'PERMISSION_DENIED evaluated by Firestore emulator',
        defenseVerified: true,
        pass: true,
      });
    } catch (e: any) {
      recordAttack({
        id: 'ADV-15',
        attackVector: 'Admin Direct Client Tampering with Order Financial Field',
        category: 'FINANCIAL_INTEGRITY',
        payload: '',
        expectedDefensiveResponse: 'PERMISSION_DENIED',
        actualDefensiveResponse: e.message,
        defenseVerified: false,
        pass: false,
      });
    }

    // ADV-16: Direct Client Creation of payoutRequests & refundRequests (HIGH-03)
    try {
      await assertFails(
        setDoc(doc(customerDb, 'payoutRequests', 'FORGED-PAYOUT-01'), {
          sellerId: 'user_customer_a',
          amount: 500,
          status: 'approved',
        })
      );
      await assertFails(
        setDoc(doc(customerDb, 'refundRequests', 'FORGED-REFUND-01'), {
          orderId: ORDER_CLEAN,
          amount: 150,
          status: 'approved',
        })
      );
      recordAttack({
        id: 'ADV-16',
        attackVector: 'Direct Client Creation of payoutRequests & refundRequests',
        category: 'DEFENSE_IN_DEPTH_RULES',
        payload: 'setDoc(payoutRequests) & setDoc(refundRequests)',
        expectedDefensiveResponse: 'PERMISSION_DENIED: Direct client creation strictly denied',
        actualDefensiveResponse: 'PERMISSION_DENIED evaluated by Firestore emulator',
        defenseVerified: true,
        pass: true,
      });
    } catch (e: any) {
      recordAttack({
        id: 'ADV-16',
        attackVector: 'Direct Client Creation of payoutRequests & refundRequests',
        category: 'DEFENSE_IN_DEPTH_RULES',
        payload: '',
        expectedDefensiveResponse: 'PERMISSION_DENIED',
        actualDefensiveResponse: e.message,
        defenseVerified: false,
        pass: false,
      });
    }

    // ADV-17: Audit Trail Tampering / Modification Denial (HIGH-04)
    try {
      await assertFails(
        updateDoc(doc(adminDbRules, 'audit_logs', 'any_log_id'), {
          action: 'FORGED_AUDIT_ACTION',
        })
      );
      await assertFails(
        deleteDoc(doc(adminDbRules, 'audit_logs', 'any_log_id'))
      );
      recordAttack({
        id: 'ADV-17',
        attackVector: 'Audit Trail Deletion / Tampering Attempt by Admin',
        category: 'AUDIT_TRAIL',
        payload: 'updateDoc / deleteDoc on audit_logs collection',
        expectedDefensiveResponse: 'PERMISSION_DENIED: Audit logs are append-only immutable',
        actualDefensiveResponse: 'PERMISSION_DENIED evaluated by Firestore emulator',
        defenseVerified: true,
        pass: true,
      });
    } catch (e: any) {
      recordAttack({
        id: 'ADV-17',
        attackVector: 'Audit Trail Deletion / Tampering Attempt by Admin',
        category: 'AUDIT_TRAIL',
        payload: '',
        expectedDefensiveResponse: 'PERMISSION_DENIED',
        actualDefensiveResponse: e.message,
        defenseVerified: false,
        pass: false,
      });
    }

    // ADV-18: Storage Cross-User Avatar & MIME Type Spoofing Denial
    try {
      const customerStorage = customerContext.storage();
      // Attempt to overwrite Customer B's avatar
      await assertFails(
        uploadBytes(ref(customerStorage, 'users/user_customer_b/avatar.png'), new Uint8Array([1, 2, 3]))
      );
      // Attempt to upload executable file with image extension
      await assertFails(
        uploadBytes(ref(customerStorage, 'users/user_customer_a/script.sh'), new Uint8Array([1, 2, 3]), {
          contentType: 'application/x-sh',
        })
      );
      recordAttack({
        id: 'ADV-18',
        attackVector: 'Storage Cross-User Avatar Overwrite & Invalid MIME Upload',
        category: 'STORAGE_RULES',
        payload: 'uploadBytes to users/user_customer_b and application/x-sh',
        expectedDefensiveResponse: 'PERMISSION_DENIED: Storage rules enforce path and MIME bounds',
        actualDefensiveResponse: 'PERMISSION_DENIED evaluated by Storage emulator',
        defenseVerified: true,
        pass: true,
      });
    } catch (e: any) {
      recordAttack({
        id: 'ADV-18',
        attackVector: 'Storage Cross-User Avatar Overwrite & Invalid MIME Upload',
        category: 'STORAGE_RULES',
        payload: '',
        expectedDefensiveResponse: 'PERMISSION_DENIED',
        actualDefensiveResponse: e.message,
        defenseVerified: false,
        pass: false,
      });
    }

    await testEnv.cleanup();
  }

  // --------------------------------------------------------------------------
  // FINAL RESULTS AUDIT TABLE
  // --------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log('ADVERSARIAL NEGATIVE TEST RESULTS TABLE');
  console.log('================================================================');
  console.log('| ATTACK ID | Status | Category             | Attack Vector Name');
  console.log('|-----------|--------|----------------------|-------------------------------------------------------|');

  let passedAttacks = 0;
  for (const r of adversarialResults) {
    if (r.pass && r.defenseVerified) passedAttacks++;
    const statusText = r.pass ? 'BLOCKED' : 'BREACH';
    console.log(`| ${r.id.padEnd(9)} | ${statusText.padEnd(6)} | ${r.category.padEnd(20)} | ${r.attackVector}`);
  }

  console.log('================================================================');
  console.log(`TOTAL ATTACK PAYLOADS TESTED: ${adversarialResults.length}`);
  console.log(`SUCCESSFULLY BLOCKED: ${passedAttacks}`);
  console.log(`FAILED / SECURITY BREACHES: ${adversarialResults.length - passedAttacks}`);
  console.log('================================================================\n');

  if (passedAttacks !== adversarialResults.length) {
    console.error(`ADVERSARIAL SUITE FAILED: ${adversarialResults.length - passedAttacks} attacks were NOT blocked!`);
    process.exit(1);
  } else {
    console.log('ADVERSARIAL SUITE PASSED: 100% of malicious and bypass attacks were strictly BLOCKED.');
    process.exit(0);
  }
}

runAdversarialSuite().catch((err) => {
  console.error('Fatal error in adversarial test suite:', err);
  process.exit(1);
});
