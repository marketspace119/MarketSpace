process.env.NODE_ENV = 'test';
process.env.ENABLE_TEST_TOKENS = 'true';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8085';
process.env.FIREBASE_STORAGE_EMULATOR_HOST = '127.0.0.1:9199';

import assert from 'assert';
import * as fs from 'fs';
import { initializeTestEnvironment, assertFails, assertSucceeds, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { ref, uploadBytes, deleteObject, getBytes } from 'firebase/storage';
import { getAdminDb } from '../server/firebaseAdmin';

interface ValidationResult {
  group: string;
  name: string;
  verdict: 'PASS' | 'FAIL' | 'UNVERIFIED';
  runtimeEvidence: string;
}

const validationResults: ValidationResult[] = [];

function recordValidation(r: ValidationResult) {
  validationResults.push(r);
  console.log(`[${r.verdict}] ${r.group} -> ${r.name}`);
  console.log(`       Evidence: ${r.runtimeEvidence}`);
}

export async function runLiveProductionValidationSuite() {
  console.log('================================================================');
  console.log('FINAL PRODUCTION VALIDATION PASS: LIVE FIRESTORE & STORAGE RULES');
  console.log('Runtime Rule Execution on Firebase Emulator with Real Assertions');
  console.log('================================================================\n');

  const firestoreRulesContent = fs.readFileSync('firestore.rules', 'utf8');
  const storageRulesContent = fs.readFileSync('storage.rules', 'utf8');

  const testEnv = await initializeTestEnvironment({
    projectId: 'demo-marketspace-validation',
    firestore: {
      rules: firestoreRulesContent,
      host: '127.0.0.1',
      port: 8085,
    },
    storage: {
      rules: storageRulesContent,
      host: '127.0.0.1',
      port: 9199,
    },
  });

  // Seed required baseline data using security rules disabled context
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();

    await setDoc(doc(db, 'users', 'user_cust_a'), {
      id: 'user_cust_a',
      email: 'cust_a@marketspace.test',
      role: 'CUSTOMER',
      status: 'active',
      isVerified: true,
    });

    await setDoc(doc(db, 'users', 'user_cust_b'), {
      id: 'user_cust_b',
      email: 'cust_b@marketspace.test',
      role: 'CUSTOMER',
      status: 'active',
      isVerified: true,
    });

    await setDoc(doc(db, 'users', 'user_seller_a'), {
      id: 'user_seller_a',
      email: 'seller_a@marketspace.test',
      role: 'SELLER',
      status: 'active',
      isVerified: true,
    });

    await setDoc(doc(db, 'users', 'user_seller_b'), {
      id: 'user_seller_b',
      email: 'seller_b@marketspace.test',
      role: 'SELLER',
      status: 'active',
      isVerified: true,
    });

    await setDoc(doc(db, 'users', 'user_admin'), {
      id: 'user_admin',
      email: 'admin@marketspace.test',
      role: 'ADMIN',
      status: 'active',
      isVerified: true,
    });

    await setDoc(doc(db, 'users', 'user_superadmin'), {
      id: 'user_superadmin',
      email: 'marketspace119@gmail.com',
      role: 'SUPER_ADMIN',
      status: 'active',
      isVerified: true,
    });

    await setDoc(doc(db, 'orders', 'order_001'), {
      id: 'order_001',
      customerId: 'user_cust_a',
      sellerId: 'user_seller_a',
      total: 150,
      status: 'CONFIRMED',
      paymentStatus: 'PAID',
    });

    await setDoc(doc(db, 'audit_logs', 'log_001'), {
      id: 'log_001',
      actorId: 'user_admin',
      action: 'SETTINGS_VIEWED',
      timestamp: new Date().toISOString(),
    });

    await setDoc(doc(db, 'products', 'prod_seller_a'), {
      id: 'prod_seller_a',
      sellerId: 'user_seller_a',
      title: { en: 'Product A' },
      price: 20,
    });
  });

  // Client contexts
  const unauthContext = testEnv.unauthenticatedContext();
  const custAContext = testEnv.authenticatedContext('user_cust_a', { email: 'cust_a@marketspace.test', email_verified: true, role: 'CUSTOMER' });
  const custBContext = testEnv.authenticatedContext('user_cust_b', { email: 'cust_b@marketspace.test', email_verified: true, role: 'CUSTOMER' });
  const sellerAContext = testEnv.authenticatedContext('user_seller_a', { email: 'seller_a@marketspace.test', email_verified: true, role: 'SELLER' });
  const sellerBContext = testEnv.authenticatedContext('user_seller_b', { email: 'seller_b@marketspace.test', email_verified: true, role: 'SELLER' });
  const unverifiedAdminContext = testEnv.authenticatedContext('user_admin_unverified', { email: 'unverified_admin@marketspace.test', email_verified: false, role: 'ADMIN', admin: true });
  const adminContext = testEnv.authenticatedContext('user_admin', { email: 'admin@marketspace.test', email_verified: true, role: 'ADMIN', admin: true });
  const superAdminContext = testEnv.authenticatedContext('user_superadmin', { email: 'marketspace119@gmail.com', email_verified: true, role: 'SUPER_ADMIN', super_admin: true, admin: true });

  const unauthDb = unauthContext.firestore();
  const custADb = custAContext.firestore();
  const custBDb = custBContext.firestore();
  const sellerADb = sellerAContext.firestore();
  const sellerBDb = sellerBContext.firestore();
  const adminDbClient = adminContext.firestore();
  const superAdminDbClient = superAdminContext.firestore();

  // 1. unauthorized Firestore read
  {
    let pass = false;
    let errCode = '';
    try {
      await assertFails(getDoc(doc(unauthDb, 'audit_logs', 'log_001')));
      await assertFails(getDoc(doc(unauthDb, 'users', 'user_cust_a')));
      await assertFails(getDoc(doc(unauthDb, 'orders', 'order_001')));
      pass = true;
      errCode = 'PERMISSION_DENIED evaluated on unauthenticated getDoc for private collections';
    } catch (e: any) {
      errCode = e.message;
    }
    recordValidation({
      group: 'FIRESTORE_RULES',
      name: 'unauthorized Firestore read',
      verdict: pass ? 'PASS' : 'FAIL',
      runtimeEvidence: errCode,
    });
  }

  // 2. unauthorized Firestore create
  {
    let pass = false;
    let errCode = '';
    try {
      // Unauthenticated creating order
      await assertFails(setDoc(doc(unauthDb, 'orders', 'order_evil'), { id: 'order_evil', total: 10 }));
      // Direct client creating payout request (must go through server gateway)
      await assertFails(setDoc(doc(sellerADb, 'payoutRequests', 'payout_evil'), { id: 'payout_evil', amount: 500 }));
      // Direct client creating refund request (must go through server gateway)
      await assertFails(setDoc(doc(custADb, 'refundRequests', 'refund_evil'), { id: 'refund_evil', amount: 50 }));
      pass = true;
      errCode = 'PERMISSION_DENIED: Direct client writes to financial/payout/refund collections blocked';
    } catch (e: any) {
      errCode = e.message;
    }
    recordValidation({
      group: 'FIRESTORE_RULES',
      name: 'unauthorized Firestore create',
      verdict: pass ? 'PASS' : 'FAIL',
      runtimeEvidence: errCode,
    });
  }

  // 3. unauthorized Firestore update
  {
    let pass = false;
    let errCode = '';
    try {
      // Customer A trying to update order total from 150 to 1
      await assertFails(updateDoc(doc(custADb, 'orders', 'order_001'), { total: 1 }));
      // Standard Admin trying to elevate their own role to SUPER_ADMIN
      await assertFails(updateDoc(doc(adminDbClient, 'users', 'user_admin'), { role: 'SUPER_ADMIN' }));
      pass = true;
      errCode = 'PERMISSION_DENIED: Financial tampering & role elevation strictly denied by security rules';
    } catch (e: any) {
      errCode = e.message;
    }
    recordValidation({
      group: 'FIRESTORE_RULES',
      name: 'unauthorized Firestore update',
      verdict: pass ? 'PASS' : 'FAIL',
      runtimeEvidence: errCode,
    });
  }

  // 4. owner isolation
  {
    let pass = false;
    let errCode = '';
    try {
      // Customer B attempting to read Customer A's order
      await assertFails(getDoc(doc(custBDb, 'orders', 'order_001')));
      // Customer B attempting to write to Customer A's userFavorites
      await assertFails(setDoc(doc(custBDb, 'userFavorites', 'user_cust_a'), { userId: 'user_cust_a', productIds: ['p1'] }));
      // Customer A successfully writes to their own userFavorites
      await assertSucceeds(setDoc(doc(custADb, 'userFavorites', 'user_cust_a'), { userId: 'user_cust_a', productIds: ['p1', 'p2'] }));
      // Customer A reads their own userFavorites
      const myFav = await assertSucceeds(getDoc(doc(custADb, 'userFavorites', 'user_cust_a')));
      assert.deepStrictEqual(myFav.data()?.productIds, ['p1', 'p2']);
      // Customer B blocked from reading Customer A's userFavorites
      await assertFails(getDoc(doc(custBDb, 'userFavorites', 'user_cust_a')));
      pass = true;
      errCode = 'PERMISSION_DENIED on cross-customer reads & writes; assertSucceeds on self-owned favorites';
    } catch (e: any) {
      errCode = e.message;
    }
    recordValidation({
      group: 'FIRESTORE_RULES',
      name: 'owner isolation',
      verdict: pass ? 'PASS' : 'FAIL',
      runtimeEvidence: errCode,
    });
  }

  // 5. seller isolation
  {
    let pass = false;
    let errCode = '';
    try {
      // Seller B attempting to modify Seller A's product
      await assertFails(updateDoc(doc(sellerBDb, 'products', 'prod_seller_a'), { price: 1 }));
      // Seller B attempting to delete Seller A's product
      await assertFails(deleteDoc(doc(sellerBDb, 'products', 'prod_seller_a')));
      pass = true;
      errCode = 'PERMISSION_DENIED on cross-seller product update and delete';
    } catch (e: any) {
      errCode = e.message;
    }
    recordValidation({
      group: 'FIRESTORE_RULES',
      name: 'seller isolation',
      verdict: pass ? 'PASS' : 'FAIL',
      runtimeEvidence: errCode,
    });
  }

  // 6. admin isolation
  {
    let pass = false;
    let errCode = '';
    try {
      // Unverified admin attempting to read audit_logs
      const unverifiedAdminDb = unverifiedAdminContext.firestore();
      await assertFails(getDoc(doc(unverifiedAdminDb, 'audit_logs', 'log_001')));
      // Verified admin can read audit_logs
      await assertSucceeds(getDoc(doc(adminDbClient, 'audit_logs', 'log_001')));
      // Standard admin cannot write to platform settings or superadmin registries
      await assertFails(setDoc(doc(adminDbClient, 'admins', 'evil_admin'), { role: 'SUPER_ADMIN' }));
      pass = true;
      errCode = 'Strict email_verified check enforced; standard admin blocked from superadmin documents';
    } catch (e: any) {
      errCode = e.message;
    }
    recordValidation({
      group: 'FIRESTORE_RULES',
      name: 'admin isolation',
      verdict: pass ? 'PASS' : 'FAIL',
      runtimeEvidence: errCode,
    });
  }

  // 7. payout/payment protection
  {
    let pass = false;
    let errCode = '';
    try {
      // Direct client creation of paymentSubmissions
      await assertFails(setDoc(doc(custADb, 'paymentSubmissions', 'sub_001'), { id: 'sub_001', orderId: 'order_001', amount: 150 }));
      // Direct client creation of paymentReferences
      await assertFails(setDoc(doc(custADb, 'paymentReferences', 'ref_001'), { referenceNumber: 'REF001', orderId: 'order_001' }));
      // Direct client creation of payoutRequests
      await assertFails(setDoc(doc(sellerADb, 'payoutRequests', 'pay_001'), { id: 'pay_001', amount: 200 }));
      pass = true;
      errCode = 'PERMISSION_DENIED: All direct client writes to financial collections rejected fail-closed';
    } catch (e: any) {
      errCode = e.message;
    }
    recordValidation({
      group: 'FIRESTORE_RULES',
      name: 'payout/payment protection',
      verdict: pass ? 'PASS' : 'FAIL',
      runtimeEvidence: errCode,
    });
  }

  // 8. audit-log protection
  {
    let pass = false;
    let errCode = '';
    try {
      // Admin attempting to delete audit log
      await assertFails(deleteDoc(doc(adminDbClient, 'audit_logs', 'log_001')));
      // Admin attempting to update audit log
      await assertFails(updateDoc(doc(adminDbClient, 'audit_logs', 'log_001'), { action: 'TAMPERED' }));
      // Customer attempting to write audit log
      await assertFails(setDoc(doc(custADb, 'audit_logs', 'log_fake'), { action: 'FAKE' }));
      pass = true;
      errCode = 'PERMISSION_DENIED: Audit logs are strictly immutable and client-append/delete forbidden';
    } catch (e: any) {
      errCode = e.message;
    }
    recordValidation({
      group: 'FIRESTORE_RULES',
      name: 'audit-log protection',
      verdict: pass ? 'PASS' : 'FAIL',
      runtimeEvidence: errCode,
    });
  }

  // 9. Storage cross-user access
  {
    let pass = false;
    let errCode = '';
    try {
      const custAStorage = custAContext.storage();
      const custBStorage = custBContext.storage();

      const validPng = Buffer.from([
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
        0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
      ]);

      // Direct untrusted client upload is blocked (V3-02 Gateway Enforcement)
      await assertFails(uploadBytes(ref(custAStorage, 'users/user_cust_a/avatar.png'), validPng, { contentType: 'image/png' }));

      // Customer B attempting to overwrite Customer A's avatar is blocked
      await assertFails(uploadBytes(ref(custBStorage, 'users/user_cust_a/avatar.png'), validPng, { contentType: 'image/png' }));

      // Direct Admin client SDK upload is ALSO blocked (must use /api/images/upload -> Admin SDK)
      const adminStorage = adminContext.storage();
      await assertFails(uploadBytes(ref(adminStorage, 'users/user_cust_a/avatar.png'), validPng, { contentType: 'image/png' }));

      // Customer B attempting to delete Customer A's avatar is blocked
      await assertFails(deleteObject(ref(custBStorage, 'users/user_cust_a/avatar.png')));

      pass = true;
      errCode = 'PERMISSION_DENIED: All direct client writes (Customer & Admin) blocked; cross-user deletion blocked';
    } catch (e: any) {
      errCode = e.message;
    }
    recordValidation({
      group: 'STORAGE_RULES',
      name: 'Storage cross-user access',
      verdict: pass ? 'PASS' : 'FAIL',
      runtimeEvidence: errCode,
    });
  }

  // 10. Storage cross-seller access
  {
    let pass = false;
    let errCode = '';
    try {
      const sellerAStorage = sellerAContext.storage();
      const sellerBStorage = sellerBContext.storage();

      const validPng = Buffer.from([
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
        0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
      ]);

      // Direct untrusted seller upload is blocked (V3-02 Gateway Enforcement)
      await assertFails(uploadBytes(ref(sellerAStorage, 'sellers/user_seller_a/products/shoe.png'), validPng, { contentType: 'image/png' }));

      // Seller B attempting to write to Seller A's directory is blocked
      await assertFails(uploadBytes(ref(sellerBStorage, 'sellers/user_seller_a/products/shoe.png'), validPng, { contentType: 'image/png' }));

      // Direct Admin client SDK upload is ALSO blocked (must use /api/images/upload -> Admin SDK)
      const adminStorage = adminContext.storage();
      await assertFails(uploadBytes(ref(adminStorage, 'sellers/user_seller_a/products/shoe.png'), validPng, { contentType: 'image/png' }));

      // Seller B attempting to delete Seller A's asset is blocked
      await assertFails(deleteObject(ref(sellerBStorage, 'sellers/user_seller_a/products/shoe.png')));

      pass = true;
      errCode = 'PERMISSION_DENIED: All direct client writes (Seller & Admin) blocked; cross-seller deletion blocked';
    } catch (e: any) {
      errCode = e.message;
    }
    recordValidation({
      group: 'STORAGE_RULES',
      name: 'Storage cross-seller access',
      verdict: pass ? 'PASS' : 'FAIL',
      runtimeEvidence: errCode,
    });
  }

  // 11. malicious file upload
  {
    let pass = false;
    let errCode = '';
    try {
      const sellerAStorage = sellerAContext.storage();

      // SVG with script payload (image/svg+xml)
      const svgPayload = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
      await assertFails(uploadBytes(ref(sellerAStorage, 'sellers/user_seller_a/products/vector.svg'), svgPayload, { contentType: 'image/svg+xml' }));

      // Disguised HTML payload (text/html)
      const htmlPayload = Buffer.from('<html><body>XSS</body></html>');
      await assertFails(uploadBytes(ref(sellerAStorage, 'sellers/user_seller_a/products/fake.png'), htmlPayload, { contentType: 'text/html' }));

      // Executable file (application/octet-stream)
      const exePayload = Buffer.from([0x4D, 0x5A, 0x90, 0x00]);
      await assertFails(uploadBytes(ref(sellerAStorage, 'sellers/user_seller_a/products/malware.exe'), exePayload, { contentType: 'application/octet-stream' }));

      // Oversized file (> 5MB)
      const oversizedPayload = Buffer.alloc(5 * 1024 * 1024 + 1024, 0xFF);
      await assertFails(uploadBytes(ref(sellerAStorage, 'sellers/user_seller_a/products/huge.jpg'), oversizedPayload, { contentType: 'image/jpeg' }));

      pass = true;
      errCode = 'PERMISSION_DENIED: SVG, text/html, executables, and oversized files rejected by storage rules';
    } catch (e: any) {
      errCode = e.message;
    }
    recordValidation({
      group: 'STORAGE_RULES',
      name: 'malicious file upload',
      verdict: pass ? 'PASS' : 'FAIL',
      runtimeEvidence: errCode,
    });
  }

  // 12. userFollows cross-user isolation
  {
    let pass = false;
    let errCode = '';
    try {
      // Customer A follows store_01
      await assertSucceeds(setDoc(doc(custADb, 'userFollows', 'user_cust_a'), {
        userId: 'user_cust_a',
        storeIds: ['store_01', 'store_02'],
      }));

      // Customer B blocked from tampering with Customer A's follows
      await assertFails(setDoc(doc(custBDb, 'userFollows', 'user_cust_a'), {
        userId: 'user_cust_a',
        storeIds: [],
      }));

      // Customer B blocked from reading Customer A's private follows
      await assertFails(getDoc(doc(custBDb, 'userFollows', 'user_cust_a')));

      pass = true;
      errCode = 'PERMISSION_DENIED on cross-customer follows tampering; assertSucceeds on self-owned document';
    } catch (e: any) {
      errCode = e.message;
    }
    recordValidation({
      group: 'FIRESTORE_RULES',
      name: 'userFollows isolation',
      verdict: pass ? 'PASS' : 'FAIL',
      runtimeEvidence: errCode,
    });
  }

  await testEnv.cleanup();

  console.log('\n================================================================');
  console.log('FINAL PRODUCTION VALIDATION PASS RESULTS TABLE');
  console.log('================================================================');
  console.log('| Group           | Assertion / Invariant            | Verdict | Runtime Evidence |');
  console.log('|-----------------|----------------------------------|---------|------------------|');
  for (const r of validationResults) {
    const groupPad = r.group.padEnd(15);
    const namePad = r.name.padEnd(32);
    const verdPad = r.verdict.padEnd(7);
    console.log(`| ${groupPad} | ${namePad} | ${verdPad} | ${r.runtimeEvidence} |`);
  }
  console.log('================================================================\n');

  const allPassed = validationResults.every(r => r.verdict === 'PASS');
  assert(allPassed, 'All Live Validation Assertions must PASS');
}

if (process.argv[1]?.endsWith('live_production_validation_suite.ts')) {
  runLiveProductionValidationSuite().catch(err => {
    console.error('Validation suite failed:', err);
    process.exit(1);
  });
}
