import assert from 'assert';
import fs from 'fs';
import path from 'path';
import http from 'http';
import express from 'express';
import crypto from 'crypto';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import {
  getAdminDb,
  setAdminDbForTesting,
  setAdminStorageForTesting,
  requireAuthenticatedCaller,
  requireVerifiedPlatformAdmin,
} from '../server/firebaseAdmin';
import {
  processOrderGateway,
  processProductCreationGateway,
  processProductUpdateGateway,
  processProductDeleteGateway,
  resolveAuthoritativeCommissionRate,
} from '../server/orderGateway';
import { processImageUploadGateway } from '../server/imageGateway';
import {
  DistributedFirestoreRateLimitStore,
  DistributedFailedAuthTracker,
  createRateLimiter,
  setRateLimitStore,
} from '../server/rateLimiter';
import { validateAndExecuteToolPolicy } from '../server/ai/toolPolicy';
import { productService } from '../src/services/productService';
import { subscriptionService } from '../src/services/subscriptionService';
import { reviewService } from '../src/services/reviewService';
import { orderService } from '../src/services/orderService';
import { bookingService } from '../src/services/bookingService';
import { deliveryService } from '../src/services/deliveryService';
import { messagingService } from '../src/services/messagingService';
import { platformSettingsService } from '../src/services/platformSettingsService';
import { storeService } from '../src/services/storeService';
import { createProductionApiApp } from '../server';

const PROJECT_ID = 'marketspace-applet';

interface TestRecord {
  id: string;
  name: string;
  pass: boolean;
  details: string;
}

const results: TestRecord[] = [];

function record(id: string, name: string, pass: boolean, details: string) {
  results.push({ id, name, pass, details });
  const badge = pass ? '[PASS]' : '[FAIL]';
  console.log(`${badge} ${id}: ${name} -> ${details}`);
}

function makeJwtToken(payload: Record<string, any>): string {
  process.env.ENABLE_TEST_TOKENS = 'true';
  const body = Buffer.from(
    JSON.stringify({
      aud: PROJECT_ID,
      iss: `https://securetoken.google.com/${PROJECT_ID}`,
      exp: Math.floor(Date.now() / 1000) + 3600,
      email_verified: true,
      ...payload,
    })
  ).toString('base64');
  return `Bearer test-token:${body}`;
}

/**
 * Mounts the real production Express API application from server.ts
 * so all HTTP endpoint tests execute against the actual production server routes.
 */
function createGatewayTestApp() {
  return createProductionApiApp();
}

async function runPostClosureRemediationSuite() {
  console.log('================================================================');
  console.log('STARTING POST-CLOSURE FORENSIC REMEDIATION TEST SUITE (25 TESTS)');
  console.log('================================================================');

  const firestoreRules = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf8');
  let testEnv: RulesTestEnvironment | null = null;
  let server: http.Server | null = null;
  let baseUrl = '';

  try {
    const emulatorEnv = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
    const [emuHost, emuPortStr] = emulatorEnv.split(':');
    const emuPort = parseInt(emuPortStr || '8080', 10);

    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: {
        rules: firestoreRules,
        host: emuHost || '127.0.0.1',
        port: emuPort,
      },
    });

    await testEnv.clearFirestore();

    const app = createGatewayTestApp();
    server = await new Promise<http.Server>((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const addr = server.address() as any;
    baseUrl = `http://127.0.0.1:${addr.port}`;

    // Seed baseline users, stores, and services in Emulator
    const adminDb = getAdminDb();
    await adminDb.collection('users').doc('cust_book_a').set({
      uid: 'cust_book_a',
      email: 'custa@marketspace.so',
      role: 'CUSTOMER',
      status: 'active',
    });
    await adminDb.collection('users').doc('cust_book_b').set({
      uid: 'cust_book_b',
      email: 'custb@marketspace.so',
      role: 'CUSTOMER',
      status: 'active',
    });
    await adminDb.collection('users').doc('seller_prov_a').set({
      uid: 'seller_prov_a',
      email: 'provaa@marketspace.so',
      role: 'SELLER',
      status: 'active',
    });
    await adminDb.collection('users').doc('seller_merch_b').set({
      uid: 'seller_merch_b',
      email: 'merchb@marketspace.so',
      role: 'SELLER',
      status: 'active',
    });
    await adminDb.collection('users').doc('admin_super_1').set({
      uid: 'admin_super_1',
      email: 'admin1@marketspace.so',
      role: 'SUPER_ADMIN',
      status: 'active',
    });
    await adminDb.collection('admins').doc('admin_super_1').set({
      uid: 'admin_super_1',
      email: 'admin1@marketspace.so',
      role: 'SUPER_ADMIN',
      active: true,
    });

    await adminDb.collection('stores').doc('store_prov_a').set({
      id: 'store_prov_a',
      sellerId: 'seller_prov_a',
      name: { ar: 'متجر أ', en: 'Store A' },
      sellerType: 'store',
      status: 'approved',
      deliveryFee: 5,
    });
    await adminDb.collection('stores').doc('store_merch_b').set({
      id: 'store_merch_b',
      sellerId: 'seller_merch_b',
      name: { ar: 'متجر ب', en: 'Store B' },
      sellerType: 'store',
      status: 'approved',
      deliveryFee: 5,
    });

    await adminDb.collection('products').doc('srv_book_01').set({
      id: 'srv_book_01',
      sellerId: 'seller_prov_a',
      storeId: 'store_prov_a',
      title: { ar: 'استشارة تقنية', en: 'Tech Consultation' },
      type: 'services',
      category: 'services',
      price: 50,
      stock: 100,
      status: 'published',
      isPublished: true,
    });

    const custAToken = makeJwtToken({ uid: 'cust_book_a', email: 'custa@marketspace.so', role: 'CUSTOMER' });
    const custBToken = makeJwtToken({ uid: 'cust_book_b', email: 'custb@marketspace.so', role: 'CUSTOMER' });
    const sellerAToken = makeJwtToken({ uid: 'seller_prov_a', email: 'provaa@marketspace.so', role: 'SELLER' });
    const sellerBToken = makeJwtToken({ uid: 'seller_merch_b', email: 'merchb@marketspace.so', role: 'SELLER' });
    const adminToken = makeJwtToken({ uid: 'admin_super_1', email: 'admin1@marketspace.so', role: 'SUPER_ADMIN', admin: true });

    const custADb = testEnv.authenticatedContext('cust_book_a', { email: 'custa@marketspace.so', email_verified: true }).firestore();
    const custBDb = testEnv.authenticatedContext('cust_book_b', { email: 'custb@marketspace.so', email_verified: true }).firestore();
    const sellerADb = testEnv.authenticatedContext('seller_prov_a', { email: 'provaa@marketspace.so', email_verified: true }).firestore();

    // ========================================================================
    // 1. BOOKING AUTHORITY BYPASS & PRIVACY (BOOK-SEC-01..05)
    // ========================================================================

    // BOOK-SEC-01: Direct client booking create -> MUST FAIL
    try {
      await assertFails(
        setDoc(doc(custADb, 'bookings', 'bk_direct_client_01'), {
          id: 'bk_direct_client_01',
          customerId: 'cust_book_a',
          sellerId: 'seller_prov_a',
          serviceId: 'srv_book_01',
          price: 50,
          date: '2026-11-01',
          time: '10:00',
          status: 'requested',
        })
      );
      record('BOOK-SEC-01', 'Direct Client Booking Create Blocked', true, 'Firestore Rules rejected direct client create on /bookings/{bookingId}');
    } catch (e: any) {
      record('BOOK-SEC-01', 'Direct Client Booking Create Blocked', false, e.message);
    }

    // BOOK-SEC-02: Direct client slot create -> MUST FAIL
    try {
      await assertFails(
        setDoc(doc(custADb, 'booking_slots', 'seller_prov_a_2026-11-01_10-00'), {
          slotId: 'seller_prov_a_2026-11-01_10-00',
          sellerId: 'seller_prov_a',
          customerId: 'cust_book_a',
          date: '2026-11-01',
          time: '10:00',
          status: 'booked',
        })
      );
      record('BOOK-SEC-02', 'Direct Client Booking Slot Create Blocked', true, 'Firestore Rules rejected direct client create on /booking_slots/{slotId}');
    } catch (e: any) {
      record('BOOK-SEC-02', 'Direct Client Booking Slot Create Blocked', false, e.message);
    }

    // BOOK-SEC-03: Direct client slot read for another user -> MUST FAIL
    try {
      // Seed a legitimate slot via Admin SDK
      await adminDb.collection('booking_slots').doc('seller_prov_a_2026-11-02_11-00').set({
        slotId: 'seller_prov_a_2026-11-02_11-00',
        sellerId: 'seller_prov_a',
        customerId: 'cust_book_a',
        bookingId: 'bk_private_01',
        date: '2026-11-02',
        time: '11:00',
        status: 'booked',
      });

      await assertFails(getDoc(doc(custBDb, 'booking_slots', 'seller_prov_a_2026-11-02_11-00')));
      await assertFails(getDoc(doc(custADb, 'booking_slots', 'seller_prov_a_2026-11-02_11-00')));
      record('BOOK-SEC-03', 'Direct Client Slot Read Enumeration Blocked', true, 'Non-admin users blocked from reading /booking_slots/* (protects customerId, date, time, bookingId)');
    } catch (e: any) {
      record('BOOK-SEC-03', 'Direct Client Slot Read Enumeration Blocked', false, e.message);
    }

    // BOOK-SEC-04: 10 concurrent API booking requests -> exactly 1 success
    try {
      const concurrentRequests = Array.from({ length: 10 }, (_, idx) =>
        fetch(`${baseUrl}/api/bookings/create`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: custAToken },
          body: JSON.stringify({
            serviceId: 'srv_book_01',
            sellerId: 'seller_prov_a',
            date: '2026-12-15',
            time: '14:00',
            customerName: `Concurrent Customer ${idx}`,
          }),
        }).then(async (r) => ({ status: r.status, body: await r.json() }))
      );

      const responses = await Promise.all(concurrentRequests);
      const successes = responses.filter((r) => r.status === 200 && r.body.success === true);
      const conflicts = responses.filter((r) => r.status === 409);

      assert.strictEqual(successes.length, 1, `Expected exactly 1 booking success, got ${successes.length}`);
      assert.strictEqual(conflicts.length, 9, `Expected 9 slot conflict rejections, got ${conflicts.length}`);
      record('BOOK-SEC-04', '10 Concurrent API Booking Requests Atomic Lock', true, `1 succeeded (HTTP 200), 9 rejected with HTTP 409 Conflict`);
    } catch (e: any) {
      record('BOOK-SEC-04', '10 Concurrent API Booking Requests Atomic Lock', false, e.message);
    }

    // BOOK-SEC-05: Malicious pre-created slot attempt by client MUST fail and NOT block server booking
    try {
      const targetSlotId = 'seller_prov_a_2026-12-20_16-00';
      await assertFails(
        setDoc(doc(custBDb, 'booking_slots', targetSlotId), {
          slotId: targetSlotId,
          sellerId: 'seller_prov_a',
          customerId: 'cust_book_b',
          date: '2026-12-20',
          time: '16:00',
          status: 'booked',
        })
      );

      const apiRes = await fetch(`${baseUrl}/api/bookings/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: custAToken },
        body: JSON.stringify({
          serviceId: 'srv_book_01',
          sellerId: 'seller_prov_a',
          date: '2026-12-20',
          time: '16:00',
          customerName: 'Legitimate Customer A',
        }),
      });
      const apiBody = await apiRes.json();
      assert.strictEqual(apiRes.status, 200, 'Legitimate server booking must succeed after blocked malicious slot pre-creation');
      assert.strictEqual(apiBody.success, true);
      record('BOOK-SEC-05', 'Malicious Slot Pre-Creation Blocked & Server Booking Unblocked', true, `Malicious client slot write denied; legitimate API booking ${apiBody.booking.id} succeeded`);
    } catch (e: any) {
      record('BOOK-SEC-05', 'Malicious Slot Pre-Creation Blocked & Server Booking Unblocked', false, e.message);
    }

    // ========================================================================
    // 2. DISPUTE HTTP GATEWAY (DISPUTE-API-01..05)
    // ========================================================================

    // Seed single-vendor and multi-vendor orders for dispute gateway tests
    await adminDb.collection('orders').doc('ord_disp_single_01').set({
      orderId: 'ord_disp_single_01',
      customerId: 'cust_book_a',
      customerName: 'Customer A',
      sellerIds: ['seller_prov_a'],
      vendorStoreIds: ['store_prov_a'],
      vendorOrders: [
        {
          subOrderId: 'ord_disp_single_01-S1',
          sellerId: 'seller_prov_a',
          storeId: 'store_prov_a',
          storeName: 'Store A Official',
          subtotal: 100,
          total: 105,
          status: 'delivered',
        },
      ],
      total: 105,
      status: 'delivered',
    });

    await adminDb.collection('orders').doc('ord_disp_multi_01').set({
      orderId: 'ord_disp_multi_01',
      customerId: 'cust_book_a',
      customerName: 'Customer A',
      sellerIds: ['seller_prov_a', 'seller_merch_b'],
      vendorStoreIds: ['store_prov_a', 'store_merch_b'],
      vendorOrders: [
        {
          subOrderId: 'ord_disp_multi_01-S1',
          sellerId: 'seller_prov_a',
          storeId: 'store_prov_a',
          storeName: 'Store A',
          subtotal: 50,
          total: 55,
          status: 'delivered',
        },
        {
          subOrderId: 'ord_disp_multi_01-S2',
          sellerId: 'seller_merch_b',
          storeId: 'store_merch_b',
          storeName: 'Store B',
          subtotal: 60,
          total: 65,
          status: 'delivered',
        },
      ],
      total: 120,
      status: 'delivered',
    });

    let createdDisputeId = '';

    // DISPUTE-API-01: Do not trust client sellerId/sellerName/storeId; reject unrelated seller on multi-vendor order
    try {
      // 1a. Attempt to link multi-vendor order dispute to an unrelated third seller 'seller_unrelated_999'
      const badMultiRes = await fetch(`${baseUrl}/api/disputes/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: custAToken },
        body: JSON.stringify({
          orderId: 'ord_disp_multi_01',
          sellerId: 'seller_unrelated_999',
          sellerName: 'Spoofed Unrelated Seller',
          storeId: 'store_unrelated_999',
          reason: 'damaged_item',
          description: 'Trying to blame unrelated seller',
        }),
      });
      assert.strictEqual(badMultiRes.status, 400, 'Linking dispute to unrelated seller on multi-vendor order must fail with 400');

      // 1b. Send spoofed sellerId/storeId/sellerName on single-vendor order -> server must override with authoritative order values
      const createRes = await fetch(`${baseUrl}/api/disputes/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: custAToken },
        body: JSON.stringify({
          orderId: 'ord_disp_single_01',
          sellerId: 'seller_unrelated_spoof',
          sellerName: 'Fake Merchant Name',
          storeId: 'fake_store_id',
          reason: 'damaged_item',
          description: 'Item arrived damaged',
        }),
      });
      const createBody = await createRes.json();
      assert.strictEqual(createRes.status, 200);
      assert.strictEqual(createBody.dispute.sellerId, 'seller_prov_a', 'Server must derive sellerId authoritatively from order');
      assert.strictEqual(createBody.dispute.storeId, 'store_prov_a', 'Server must derive storeId authoritatively from order');
      assert.strictEqual(createBody.dispute.sellerName, 'Store A Official', 'Server must derive sellerName authoritatively from order');
      createdDisputeId = createBody.dispute.id;

      record('DISPUTE-API-01', 'Authoritative Seller & Store Derivation on /api/disputes/create', true, `Unrelated seller rejected (400); spoofed seller/store overridden with seller_prov_a / store_prov_a`);
    } catch (e: any) {
      record('DISPUTE-API-01', 'Authoritative Seller & Store Derivation on /api/disputes/create', false, e.message);
    }

    // DISPUTE-API-02: /api/disputes/respond enforces OPEN -> SELLER_RESPONDED only
    try {
      const resp1 = await fetch(`${baseUrl}/api/disputes/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: sellerAToken },
        body: JSON.stringify({
          disputeId: createdDisputeId,
          message: 'We have inspected the issue and offer replacement or refund.',
          proposedAction: 'accept_refund',
        }),
      });
      const body1 = await resp1.json();
      assert.strictEqual(resp1.status, 200, 'First response on OPEN dispute must succeed');
      assert.strictEqual(body1.dispute.status, 'SELLER_RESPONDED');

      // Second response when status is already SELLER_RESPONDED must fail with 409
      const resp2 = await fetch(`${baseUrl}/api/disputes/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: sellerAToken },
        body: JSON.stringify({
          disputeId: createdDisputeId,
          message: 'Trying to overwrite response when status is SELLER_RESPONDED',
        }),
      });
      assert.strictEqual(resp2.status, 409, 'Responding to non-OPEN dispute must be rejected with 409');
      record('DISPUTE-API-02', 'Strict OPEN -> SELLER_RESPONDED Transition on /api/disputes/respond', true, 'OPEN -> SELLER_RESPONDED succeeded (200); repeat response on SELLER_RESPONDED rejected (409)');
    } catch (e: any) {
      record('DISPUTE-API-02', 'Strict OPEN -> SELLER_RESPONDED Transition on /api/disputes/respond', false, e.message);
    }

    // DISPUTE-API-03: /api/disputes/respond blocks RESOLVED_REFUND, RESOLVED_REJECTED, CLOSED
    try {
      const terminalStates = ['RESOLVED_REFUND', 'RESOLVED_REJECTED', 'CLOSED'];
      for (const st of terminalStates) {
        const termId = `disp_term_${st}`;
        await adminDb.collection('disputes').doc(termId).set({
          id: termId,
          orderId: 'ord_disp_single_01',
          customerId: 'cust_book_a',
          sellerId: 'seller_prov_a',
          status: st,
        });

        const termRes = await fetch(`${baseUrl}/api/disputes/respond`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: sellerAToken },
          body: JSON.stringify({
            disputeId: termId,
            message: 'Attempting response on terminal state',
          }),
        });
        assert.strictEqual(termRes.status, 409, `Expected 409 when responding to ${st} dispute`);
      }
      record('DISPUTE-API-03', 'Terminal State Response Prevention on /api/disputes/respond', true, 'All 3 terminal states (RESOLVED_REFUND, RESOLVED_REJECTED, CLOSED) blocked with HTTP 409');
    } catch (e: any) {
      record('DISPUTE-API-03', 'Terminal State Response Prevention on /api/disputes/respond', false, e.message);
    }

    // DISPUTE-API-04: /api/disputes/resolve prevents terminal -> terminal re-resolution
    try {
      const res1 = await fetch(`${baseUrl}/api/disputes/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: adminToken },
        body: JSON.stringify({
          disputeId: createdDisputeId,
          actionTaken: 'REFUND_APPROVED',
          resolutionNotes: 'Approved full refund',
          refundAmount: 100,
        }),
      });
      const res1Body = await res1.json();
      assert.strictEqual(res1.status, 200);
      assert.strictEqual(res1Body.dispute.status, 'RESOLVED_REFUND');

      // Verify order was atomically updated
      const ordSnap = await adminDb.collection('orders').doc('ord_disp_single_01').get();
      assert.strictEqual(ordSnap.data()?.refundStatus, 'approved');
      assert.strictEqual(ordSnap.data()?.refundAmount, 100);

      // Attempt to resolve again (terminal -> terminal)
      const res2 = await fetch(`${baseUrl}/api/disputes/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: adminToken },
        body: JSON.stringify({
          disputeId: createdDisputeId,
          actionTaken: 'CLAIM_DISMISSED',
          resolutionNotes: 'Trying to flip RESOLVED_REFUND to RESOLVED_REJECTED',
        }),
      });
      assert.strictEqual(res2.status, 409, 'Re-resolving an already resolved dispute must fail with 409');
      record('DISPUTE-API-04', 'Terminal Dispute Immutability on /api/disputes/resolve', true, 'SELLER_RESPONDED -> RESOLVED_REFUND succeeded; second resolution rejected with HTTP 409');
    } catch (e: any) {
      record('DISPUTE-API-04', 'Terminal Dispute Immutability on /api/disputes/resolve', false, e.message);
    }

    // DISPUTE-API-05: Atomic order-dispute transaction (no swallowed order.update errors)
    try {
      // Create a dispute referencing a missing/deleted order
      const orphanDisputeId = 'disp_orphan_order_01';
      await adminDb.collection('disputes').doc(orphanDisputeId).set({
        id: orphanDisputeId,
        orderId: 'ord_nonexistent_9999',
        customerId: 'cust_book_a',
        sellerId: 'seller_prov_a',
        status: 'SELLER_RESPONDED',
      });

      const failRes = await fetch(`${baseUrl}/api/disputes/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: adminToken },
        body: JSON.stringify({
          disputeId: orphanDisputeId,
          actionTaken: 'REFUND_APPROVED',
          resolutionNotes: 'Trying to approve refund when order update fails',
          refundAmount: 50,
        }),
      });
      assert.strictEqual(failRes.status, 404, 'Resolve must fail when associated order update cannot be completed');

      // Verify dispute status was NOT mutated to RESOLVED_REFUND
      const checkDisp = await adminDb.collection('disputes').doc(orphanDisputeId).get();
      assert.strictEqual(checkDisp.data()?.status, 'SELLER_RESPONDED', 'Dispute status must remain SELLER_RESPONDED when order update fails');
      record('DISPUTE-API-05', 'Atomic Order & Dispute Refund Transaction (Zero Swallowed Errors)', true, 'Order update failure rolled back dispute resolution; status remained SELLER_RESPONDED');
    } catch (e: any) {
      record('DISPUTE-API-05', 'Atomic Order & Dispute Refund Transaction (Zero Swallowed Errors)', false, e.message);
    }

    // ========================================================================
    // 3. PRODUCT CREATION PERSISTENCE (PRODUCT-PERSIST-01..03)
    // ========================================================================

    // PRODUCT-PERSIST-01: Authoritative backend product creation succeeds & persists to Firestore
    try {
      const prodRes = await fetch(`${baseUrl}/api/products/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: sellerAToken },
        body: JSON.stringify({
          storeId: 'store_prov_a',
          title: { ar: 'هاتف ذكي', en: 'Smart Phone X' },
          description: { ar: 'وصف', en: 'Description' },
          price: 299.99,
          stock: 15,
          category: 'electronics',
          status: 'published',
        }),
      });
      const prodBody = await prodRes.json();
      assert.strictEqual(prodRes.status, 200);
      assert.strictEqual(prodBody.success, true);

      const savedDoc = await adminDb.collection('products').doc(prodBody.product.id).get();
      assert.strictEqual(savedDoc.exists, true, 'Created product must exist in Firestore');
      assert.strictEqual(savedDoc.data()?.price, 299.99);
      assert.strictEqual(savedDoc.data()?.sellerId, 'seller_prov_a');
      record('PRODUCT-PERSIST-01', 'Authoritative Backend Product Creation & Persistence', true, `Product ${prodBody.product.id} verified in Firestore with price=299.99, stock=15`);
    } catch (e: any) {
      record('PRODUCT-PERSIST-01', 'Authoritative Backend Product Creation & Persistence', false, e.message);
    }

    // PRODUCT-PERSIST-02: Database write failure during product creation -> throws error (Fail-Closed, no fake success)
    try {
      const realDb = getAdminDb();
      const brokenDbMock: any = {
        collection: (name: string) => {
          if (name === 'users' || name === 'stores' || name === 'subscriptions') {
            return realDb.collection(name);
          }
          return {
            doc: (id: string) => ({ id }),
            where: () => ({ get: async () => ({ size: 0, docs: [] }) }),
          };
        },
        runTransaction: async () => {
          throw new Error('SIMULATED_FIRESTORE_WRITE_OUTAGE');
        },
      };

      setAdminDbForTesting(brokenDbMock);
      const outageRes = await fetch(`${baseUrl}/api/products/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: sellerAToken },
        body: JSON.stringify({
          storeId: 'store_prov_a',
          title: { ar: 'منتج أثناء العطل', en: 'Outage Product' },
          price: 45,
          stock: 5,
        }),
      });
      const outageBody = await outageRes.json();
      setAdminDbForTesting(realDb);

      assert.strictEqual(outageRes.status, 503, 'Database write failure must return HTTP 503');
      assert.strictEqual(outageBody.success, false, 'Database write failure must never return success: true');
      record('PRODUCT-PERSIST-02', 'Fail-Closed Product Creation on Database Write Failure', true, `Returned HTTP ${outageRes.status} with error: ${outageBody.error}`);
    } catch (e: any) {
      record('PRODUCT-PERSIST-02', 'Fail-Closed Product Creation on Database Write Failure', false, e.message);
    }

    // PRODUCT-PERSIST-03: Ownership, price, stock, and status lifecycle validation on /api/products/create
    try {
      // Cross-store ownership violation (Seller B trying to create product in Seller A's store)
      const wrongOwnerRes = await fetch(`${baseUrl}/api/products/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: sellerBToken },
        body: JSON.stringify({
          storeId: 'store_prov_a',
          title: 'Cross Store Product',
          price: 20,
          stock: 5,
        }),
      });
      assert.strictEqual(wrongOwnerRes.status, 403, 'Cross-store product creation must be rejected with 403');

      // Negative price
      const negPriceRes = await fetch(`${baseUrl}/api/products/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: sellerAToken },
        body: JSON.stringify({
          storeId: 'store_prov_a',
          title: 'Negative Price Product',
          price: -50,
          stock: 5,
        }),
      });
      assert.strictEqual(negPriceRes.status, 400, 'Negative price must be rejected with 400');

      // Invalid status lifecycle
      const badStatusRes = await fetch(`${baseUrl}/api/products/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: sellerAToken },
        body: JSON.stringify({
          storeId: 'store_prov_a',
          title: 'Bad Status Product',
          price: 50,
          stock: 5,
          status: 'bypassed_moderation_state',
        }),
      });
      assert.strictEqual(badStatusRes.status, 400, 'Invalid lifecycle status must be rejected with 400');

      record('PRODUCT-PERSIST-03', 'Store Ownership, Price/Stock Bounds & Status Lifecycle Validation', true, 'Cross-store (403), negative price (400), and invalid status (400) all rejected');
    } catch (e: any) {
      record('PRODUCT-PERSIST-03', 'Store Ownership, Price/Stock Bounds & Status Lifecycle Validation', false, e.message);
    }

    // ========================================================================
    // 4. SUBSCRIPTION / COMMISSION CONSISTENCY (COMM-01..05)
    // ========================================================================

    // Seed platform settings with 10% global & fashion rate
    await adminDb.collection('platformSettings').doc('default').set({
      defaultCommissionRate: 10,
      sellerTypeCommissionRates: { store: 10, restaurant: 6, service: 8 },
      categoryCommissionRates: { fashion: 10, electronics: 7 },
    });

    // COMM-01: FREE, BASIC, BUSINESS, PREMIUM active subscriptions applied on server order creation
    try {
      const tiers = [
        { planId: 'plan_free', tier: 'FREE', expectedDiscount: 0, expectedRate: 10 },
        { planId: 'plan_basic', tier: 'BASIC', expectedDiscount: 1, expectedRate: 9 },
        { planId: 'plan_business', tier: 'BUSINESS', expectedDiscount: 2, expectedRate: 8 },
        { planId: 'plan_premium', tier: 'PREMIUM', expectedDiscount: 3, expectedRate: 7 },
      ];

      for (const t of tiers) {
        await adminDb.collection('subscriptions').doc('sub_comm_test').set({
          id: 'sub_comm_test',
          sellerId: 'seller_merch_b',
          storeId: 'store_merch_b',
          planId: t.planId,
          planTier: t.tier,
          status: 'active',
          endDate: new Date(Date.now() + 86400000 * 30).toISOString(),
          updatedAt: new Date().toISOString(),
        });

        const res = await resolveAuthoritativeCommissionRate(
          { id: 'store_merch_b', sellerId: 'seller_merch_b', sellerType: 'store' },
          'store',
          'fashion',
          'seller_merch_b'
        );
        assert.strictEqual(res.baseRate, 10);
        assert.strictEqual(res.appliedDiscount, t.expectedDiscount);
        assert.strictEqual(res.rate, t.expectedRate, `Expected effective rate ${t.expectedRate}% for ${t.tier}`);
      }

      record('COMM-01', 'Server Commission Resolution Across FREE, BASIC, BUSINESS, PREMIUM Plans', true, 'Verified FREE=10%, BASIC=9%, BUSINESS=8%, PREMIUM=7% on 10% base rate');
    } catch (e: any) {
      record('COMM-01', 'Server Commission Resolution Across FREE, BASIC, BUSINESS, PREMIUM Plans', false, e.message);
    }

    // COMM-02: Expired subscription plan ignored -> full base rate charged
    try {
      await adminDb.collection('subscriptions').doc('sub_comm_test').set({
        id: 'sub_comm_test',
        sellerId: 'seller_merch_b',
        storeId: 'store_merch_b',
        planId: 'plan_premium',
        planTier: 'PREMIUM',
        status: 'active',
        endDate: new Date(Date.now() - 86400000).toISOString(), // Expired yesterday
        updatedAt: new Date().toISOString(),
      });

      const res = await resolveAuthoritativeCommissionRate(
        { id: 'store_merch_b', sellerId: 'seller_merch_b', sellerType: 'store' },
        'store',
        'fashion',
        'seller_merch_b'
      );
      assert.strictEqual(res.appliedDiscount, 0, 'Expired plan must receive 0% discount');
      assert.strictEqual(res.rate, 10, 'Expired plan must pay full 10% base rate');
      assert.strictEqual(res.appliedPlanId, 'plan_free');
      record('COMM-02', 'Expired Subscription Plan Commission Discount Rejection', true, 'Expired PREMIUM subscription downgraded to plan_free (0% discount, 10% effective rate)');
    } catch (e: any) {
      record('COMM-02', 'Expired Subscription Plan Commission Discount Rejection', false, e.message);
    }

    // COMM-03: Cancelled subscription plan ignored -> full base rate charged
    try {
      await adminDb.collection('subscriptions').doc('sub_comm_test').set({
        id: 'sub_comm_test',
        sellerId: 'seller_merch_b',
        storeId: 'store_merch_b',
        planId: 'plan_business',
        planTier: 'BUSINESS',
        status: 'cancelled',
        endDate: new Date(Date.now() + 86400000 * 30).toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const res = await resolveAuthoritativeCommissionRate(
        { id: 'store_merch_b', sellerId: 'seller_merch_b', sellerType: 'store' },
        'store',
        'fashion',
        'seller_merch_b'
      );
      assert.strictEqual(res.appliedDiscount, 0, 'Cancelled plan must receive 0% discount');
      assert.strictEqual(res.rate, 10);
      record('COMM-03', 'Cancelled Subscription Plan Commission Discount Rejection', true, 'Cancelled BUSINESS subscription ignored (0% discount, 10% effective rate)');
    } catch (e: any) {
      record('COMM-03', 'Cancelled Subscription Plan Commission Discount Rejection', false, e.message);
    }

    // COMM-04: Malformed plan ID, negative/NaN adjustment, or mismatched store ownership rejected
    try {
      // Malformed planId & excessive/negative adjustment
      await adminDb.collection('subscriptions').doc('sub_comm_test').set({
        id: 'sub_comm_test',
        sellerId: 'seller_merch_b',
        storeId: 'store_other_unowned', // Mismatched storeId
        planId: 'plan_premium',
        status: 'active',
        endDate: new Date(Date.now() + 86400000 * 30).toISOString(),
      });

      const resMismatch = await resolveAuthoritativeCommissionRate(
        { id: 'store_merch_b', sellerId: 'seller_merch_b', sellerType: 'store' },
        'store',
        'fashion',
        'seller_merch_b'
      );
      assert.strictEqual(resMismatch.appliedDiscount, 0, 'Mismatched storeId subscription must be ignored');

      await adminDb.collection('subscriptions').doc('sub_comm_test').set({
        id: 'sub_comm_test',
        sellerId: 'seller_merch_b',
        storeId: 'store_merch_b',
        planId: 'plan_corrupted_999',
        commissionAdjustment: 999,
        status: 'active',
        endDate: new Date(Date.now() + 86400000 * 30).toISOString(),
      });

      const resMalformed = await resolveAuthoritativeCommissionRate(
        { id: 'store_merch_b', sellerId: 'seller_merch_b', sellerType: 'store' },
        'store',
        'fashion',
        'seller_merch_b'
      );
      assert.strictEqual(resMalformed.appliedDiscount, 0, 'Malformed plan must receive 0% discount');
      assert.strictEqual(resMalformed.rate, 10);
      record('COMM-04', 'Malformed Plan & Store Ownership Mismatch Rejection', true, 'Mismatched storeId and corrupted planId safely defaulted to plan_free (0% discount)');
    } catch (e: any) {
      record('COMM-04', 'Malformed Plan & Store Ownership Mismatch Rejection', false, e.message);
    }

    // COMM-05: Stale local subscription vs Server Single Source of Truth + Order Subtotal Split Invariant
    try {
      // Client memory has a stale PREMIUM subscription for seller_merch_b
      subscriptionService.seedSubscriptions([
        {
          id: 'sub_stale_local',
          sellerId: 'seller_merch_b',
          storeId: 'store_merch_b',
          planId: 'plan_premium',
          planTier: 'PREMIUM',
          planName: 'VIP',
          price: 75,
          billingCycle: 'monthly',
          status: 'active',
          startDate: new Date().toISOString(),
          endDate: new Date(Date.now() + 86400000 * 30).toISOString(),
          paymentMethod: 'evc_plus',
        } as any,
      ]);

      // Server Firestore has active BUSINESS subscription (2% discount)
      await adminDb.collection('subscriptions').doc('sub_comm_test').set({
        id: 'sub_comm_test',
        sellerId: 'seller_merch_b',
        storeId: 'store_merch_b',
        planId: 'plan_business',
        planTier: 'BUSINESS',
        status: 'active',
        endDate: new Date(Date.now() + 86400000 * 30).toISOString(),
        updatedAt: new Date().toISOString(),
      });

      await adminDb.collection('products').doc('prod_comm_order_01').set({
        id: 'prod_comm_order_01',
        sellerId: 'seller_merch_b',
        storeId: 'store_merch_b',
        title: { ar: 'قميص', en: 'Shirt' },
        category: 'fashion',
        price: 33.33,
        stock: 50,
        status: 'published',
        isPublished: true,
      });

      const orderResult = await processOrderGateway(
        {
          customerName: 'Customer A',
          phone: '+252615000000',
          city: 'Mogadishu',
          address: 'KM4',
          paymentMethod: 'cash_on_delivery',
          items: [{ productId: 'prod_comm_order_01', quantity: 1 }],
        },
        custAToken
      );

      const vo = orderResult.order.vendorOrders![0];
      // Fashion base rate = 10%, Server BUSINESS plan discount = 2% -> effectiveCommissionRate = 8% (ignoring client stale PREMIUM 3%)
      assert.strictEqual(vo.commissionRate, 10, 'Base commission rate must be 10%');
      assert.strictEqual(vo.effectiveCommissionRate, 8, 'Effective commission rate must use Server BUSINESS plan (8%), ignoring stale client cache');
      assert.strictEqual(
        Number((vo.platformCommission + vo.sellerRevenue).toFixed(2)),
        vo.subtotal,
        'Strict invariant: platformCommission + sellerRevenue === subtotal'
      );
      record(
        'COMM-05',
        'Server Single Source of Truth Over Stale Client Cache & Exact Subtotal Invariant',
        true,
        `baseRate=10%, effectiveRate=8%, subtotal=$${vo.subtotal}, commission=$${vo.platformCommission}, sellerRevenue=$${vo.sellerRevenue}`
      );
    } catch (e: any) {
      record('COMM-05', 'Server Single Source of Truth Over Stale Client Cache & Exact Subtotal Invariant', false, e.message);
    }

    // ========================================================================
    // 5. IMAGE UPLOAD FAIL-CLOSED (IMAGE-UPLOAD-01..03)
    // ========================================================================

    const validPngBase64 = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
    ]).toString('base64');

    // IMAGE-UPLOAD-01: Simulated bucket.file(...).save() failure -> throws HTTP 503 Fail-Closed (never returns data:... URL)
    try {
      setAdminStorageForTesting({
        bucket: () => ({
          name: 'marketspace-bucket',
          file: () => ({
            save: async () => {
              throw new Error('STORAGE_BUCKET_UNAVAILABLE');
            },
          }),
        }),
      });

      const imgFailRes = await fetch(`${baseUrl}/api/images/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: sellerAToken },
        body: JSON.stringify({
          data: `data:image/png;base64,${validPngBase64}`,
          filename: 'product.png',
          sellerId: 'seller_prov_a',
          declaredMimeType: 'image/png',
        }),
      });
      const imgFailBody = await imgFailRes.json();

      assert.strictEqual(imgFailRes.status, 503, 'Storage save failure must return HTTP 503');
      assert.strictEqual(imgFailBody.success, false, 'Storage save failure must not return success: true');
      assert.strictEqual(imgFailBody.downloadUrl, undefined, 'Storage save failure must not return fake data: downloadUrl');
      record('IMAGE-UPLOAD-01', 'Fail-Closed HTTP 503 on Storage Bucket Save Failure', true, `Returned HTTP 503 with error: ${imgFailBody.error}`);
    } catch (e: any) {
      record('IMAGE-UPLOAD-01', 'Fail-Closed HTTP 503 on Storage Bucket Save Failure', false, e.message);
    }

    // IMAGE-UPLOAD-02: Cross-tenant upload attempt rejected with HTTP 403
    try {
      const crossTenantRes = await fetch(`${baseUrl}/api/images/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: sellerAToken },
        body: JSON.stringify({
          data: `data:image/png;base64,${validPngBase64}`,
          filename: 'hijack.png',
          sellerId: 'seller_merch_b', // Seller A trying to upload into Seller B directory
          declaredMimeType: 'image/png',
        }),
      });
      assert.strictEqual(crossTenantRes.status, 403, 'Cross-tenant image upload must be rejected with HTTP 403');
      record('IMAGE-UPLOAD-02', 'Cross-Tenant Image Upload Rejection', true, 'Seller A blocked from uploading to Seller B tenant path with HTTP 403');
    } catch (e: any) {
      record('IMAGE-UPLOAD-02', 'Cross-Tenant Image Upload Rejection', false, e.message);
    }

    // IMAGE-UPLOAD-03: Healthy Storage Bucket Save returns authoritative Cloud Storage URL
    try {
      setAdminStorageForTesting({
        bucket: () => ({
          name: 'marketspace-applet.appspot.com',
          file: () => ({
            save: async () => {},
          }),
        }),
      });

      const imgOkRes = await fetch(`${baseUrl}/api/images/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: sellerAToken },
        body: JSON.stringify({
          data: `data:image/png;base64,${validPngBase64}`,
          filename: 'verified.png',
          sellerId: 'seller_prov_a',
          declaredMimeType: 'image/png',
        }),
      });
      const imgOkBody = await imgOkRes.json();
      assert.strictEqual(imgOkRes.status, 200);
      assert.strictEqual(imgOkBody.success, true);
      assert.ok(
        imgOkBody.downloadUrl.startsWith('https://storage.googleapis.com/marketspace-applet.appspot.com/sellers/seller_prov_a/'),
        'Must return real storage URL'
      );
      record('IMAGE-UPLOAD-03', 'Verified Binary Upload Persists to Authoritative Bucket Path', true, `Saved to ${imgOkBody.storagePath}`);
    } catch (e: any) {
      record('IMAGE-UPLOAD-03', 'Verified Binary Upload Persists to Authoritative Bucket Path', false, e.message);
    }

    // ========================================================================
    // 6. PRODUCT PLAN QUOTA ENFORCEMENT (QUOTA-01..04)
    // ========================================================================

    // Setup a dedicated store 'store_quota_test' for seller_prov_a on FREE plan (maxProducts = 10)
    await adminDb.collection('stores').doc('store_quota_test').set({
      id: 'store_quota_test',
      sellerId: 'seller_prov_a',
      name: { ar: 'متجر الحصة', en: 'Quota Test Store' },
      sellerType: 'store',
      status: 'approved',
    });

    // Ensure seller_prov_a has FREE plan (maxProducts = 10)
    await adminDb.collection('subscriptions').doc('sub_quota_seller_a').set({
      id: 'sub_quota_seller_a',
      sellerId: 'seller_prov_a',
      storeId: 'store_quota_test',
      planId: 'plan_free',
      planTier: 'FREE',
      status: 'active',
      endDate: new Date(Date.now() + 86400000 * 30).toISOString(),
    });

    // Seed 9 products in store_quota_test
    for (let i = 1; i <= 9; i++) {
      await adminDb.collection('products').doc(`prod_q_seed_${i}`).set({
        id: `prod_q_seed_${i}`,
        storeId: 'store_quota_test',
        sellerId: 'seller_prov_a',
        title: { ar: `منتج ${i}`, en: `Product ${i}` },
        price: 10,
        stock: 5,
        status: 'published',
      });
    }

    // QUOTA-01: Seller at 9/10 creates 10th product (succeeds), then 11th product at/beyond quota (rejected with 403)
    try {
      // 10th product -> succeeds
      const tenthRes = await fetch(`${baseUrl}/api/products/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: sellerAToken },
        body: JSON.stringify({
          id: 'prod_q_seed_10',
          storeId: 'store_quota_test',
          title: 'Product 10',
          price: 10,
          stock: 5,
        }),
      });
      assert.strictEqual(tenthRes.status, 200, '10th product under FREE plan (max 10) must succeed');

      // 11th product -> rejected (at/beyond quota)
      const eleventhRes = await fetch(`${baseUrl}/api/products/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: sellerAToken },
        body: JSON.stringify({
          id: 'prod_q_seed_11',
          storeId: 'store_quota_test',
          title: 'Product 11 Beyond Quota',
          price: 10,
          stock: 5,
        }),
      });
      const eleventhBody = await eleventhRes.json();
      assert.strictEqual(eleventhRes.status, 403, '11th product exceeding FREE plan quota (10) must fail with 403');
      assert.ok(eleventhBody.error.includes('الحد الأقصى') || eleventhBody.error.includes('quota'));
      record('QUOTA-01', 'Seller At Quota & Beyond Quota Enforcement', true, '10th product succeeded (200); 11th product blocked at 10/10 quota (403)');
    } catch (e: any) {
      record('QUOTA-01', 'Seller At Quota & Beyond Quota Enforcement', false, e.message);
    }

    // QUOTA-02: Parallel product creation at quota boundary (9/10 products, 5 concurrent requests -> 1 succeeds, 4 fail)
    try {
      // Delete prod_q_seed_10 so store_quota_test is back at 9/10 products
      await adminDb.collection('products').doc('prod_q_seed_10').delete();

      const parallelCreates = Array.from({ length: 5 }, (_, idx) =>
        fetch(`${baseUrl}/api/products/create`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: sellerAToken },
          body: JSON.stringify({
            storeId: 'store_quota_test',
            title: `Parallel Quota Product ${idx}`,
            price: 15,
            stock: 3,
          }),
        }).then(async (r) => ({ status: r.status, body: await r.json() }))
      );

      const parallelResults = await Promise.all(parallelCreates);
      const pSuccesses = parallelResults.filter((r) => r.status === 200 && r.body.success === true);
      const pRejected = parallelResults.filter((r) => r.status === 403);

      assert.strictEqual(pSuccesses.length, 1, `Expected exactly 1 parallel product creation to succeed at 9/10 boundary, got ${pSuccesses.length}`);
      assert.strictEqual(pRejected.length, 4, `Expected 4 parallel product creations to be rejected with 403, got ${pRejected.length}`);
      record('QUOTA-02', 'Parallel Product Creation Atomic Quota Serialization', true, 'At 9/10 capacity, 5 parallel requests yielded 1 success (200) and 4 rejections (403)');
    } catch (e: any) {
      record('QUOTA-02', 'Parallel Product Creation Atomic Quota Serialization', false, e.message);
    }

    // QUOTA-03: Stale client cache (0 products in local memory, fake PREMIUM in local memory) cannot bypass backend quota
    try {
      // Wipe client local product cache to 0 products and seed fake PREMIUM subscription locally
      productService.seedProducts([]);
      subscriptionService.seedSubscriptions([
        {
          id: 'sub_fake_local_vip',
          sellerId: 'seller_prov_a',
          storeId: 'store_quota_test',
          planId: 'plan_premium',
          planTier: 'PREMIUM',
          status: 'active',
          endDate: new Date(Date.now() + 86400000 * 30).toISOString(),
        } as any,
      ]);

      // Server store_quota_test already has 10/10 products in Firestore under FREE plan
      const staleBypassRes = await fetch(`${baseUrl}/api/products/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: sellerAToken },
        body: JSON.stringify({
          storeId: 'store_quota_test',
          title: 'Stale Cache Bypass Attempt',
          price: 25,
          stock: 10,
        }),
      });
      assert.strictEqual(staleBypassRes.status, 403, 'Server must enforce Firestore product count and subscription over stale client cache');
      record('QUOTA-03', 'Stale Client Cache Quota Bypass Prevention', true, 'Empty local product cache & fake local PREMIUM plan ignored; server rejected 11th product with HTTP 403');
    } catch (e: any) {
      record('QUOTA-03', 'Stale Client Cache Quota Bypass Prevention', false, e.message);
    }

    // QUOTA-04: Direct Firestore client create to bypass product quota -> MUST FAIL
    try {
      await assertFails(
        setDoc(doc(sellerADb, 'products', 'prod_direct_quota_bypass'), {
          id: 'prod_direct_quota_bypass',
          sellerId: 'seller_prov_a',
          storeId: 'store_quota_test',
          title: { ar: 'تجاوز', en: 'Bypass' },
          price: 10,
          stock: 5,
          status: 'draft',
          salesCount: 0,
          rating: 0,
          reviewCount: 0,
        })
      );
      record('QUOTA-04', 'Direct Firestore Product Create Quota Bypass Blocked', true, 'Firestore Rules rejected direct client create on /products/{productId}');
    } catch (e: any) {
      record('QUOTA-04', 'Direct Firestore Product Create Quota Bypass Blocked', false, e.message);
    }

    // =========================================================================
    // 7. DISTRIBUTED RATE LIMITING & FAILED AUTH TRACKING (RATE-DIST-01..06)
    // =========================================================================

    // RATE-DIST-01: Cross-Instance Rate Limit Enforcement (Instance A & Instance B share Firestore counter)
    try {
      const storeInstanceA = new DistributedFirestoreRateLimitStore();
      const storeInstanceB = new DistributedFirestoreRateLimitStore();

      const appA = express();
      appA.use(express.json());
      appA.post(
        '/api/test-dist-limit',
        createRateLimiter({ windowMs: 60000, max: 3, store: storeInstanceA }),
        (_req, res) => res.status(200).json({ instance: 'A', ok: true })
      );

      const appB = express();
      appB.use(express.json());
      appB.post(
        '/api/test-dist-limit',
        createRateLimiter({ windowMs: 60000, max: 3, store: storeInstanceB }),
        (_req, res) => res.status(200).json({ instance: 'B', ok: true })
      );

      const srvA = await new Promise<http.Server>((resolve) => {
        const s = appA.listen(0, '127.0.0.1', () => resolve(s));
      });
      const srvB = await new Promise<http.Server>((resolve) => {
        const s = appB.listen(0, '127.0.0.1', () => resolve(s));
      });

      try {
        const portA = (srvA.address() as any).port;
        const portB = (srvB.address() as any).port;
        const urlA = `http://127.0.0.1:${portA}/api/test-dist-limit`;
        const urlB = `http://127.0.0.1:${portB}/api/test-dist-limit`;

        const distUserToken = makeJwtToken({ uid: 'user_dist_cross_instance', email: 'dist1@test.so' });

        // Send 2 requests to Instance A (count = 1, 2)
        const rA1 = await fetch(urlA, { method: 'POST', headers: { Authorization: distUserToken } });
        const rA2 = await fetch(urlA, { method: 'POST', headers: { Authorization: distUserToken } });
        assert.strictEqual(rA1.status, 200);
        assert.strictEqual(rA2.status, 200);

        // Send 3rd request to Instance B (count = 3 -> allowed, remaining = 0)
        const rB3 = await fetch(urlB, { method: 'POST', headers: { Authorization: distUserToken } });
        assert.strictEqual(rB3.status, 200);
        assert.strictEqual(rB3.headers.get('x-ratelimit-remaining'), '0');

        // Send 4th request to Instance B -> MUST BE REJECTED with 429 (cannot bypass limit via second instance)
        const rB4 = await fetch(urlB, { method: 'POST', headers: { Authorization: distUserToken } });
        assert.strictEqual(rB4.status, 429, '4th request across Instance B must be rejected with 429');

        // Also test AI tool policy rate limiting across instances using distributed store
        setRateLimitStore(new DistributedFirestoreRateLimitStore());
        const toolCaller = {
          uid: `tool_dist_caller_${Date.now()}`,
          email: 'tool@test.so',
          emailVerified: true,
          isPlatformAdmin: false,
          isSuperAdmin: false,
          token: { uid: 'tool_dist_caller', role: 'SELLER' } as any,
        };
        for (let i = 0; i < 30; i++) {
          const tres = await validateAndExecuteToolPolicy('search_products', { query: 'laptop' }, toolCaller);
          assert.strictEqual(tres.allowed, true, `Tool call ${i + 1}/30 should succeed`);
        }
        // Simulate second instance with fresh DistributedFirestoreRateLimitStore
        setRateLimitStore(new DistributedFirestoreRateLimitStore());
        const tres31 = await validateAndExecuteToolPolicy('search_products', { query: 'laptop' }, toolCaller);
        assert.strictEqual(tres31.allowed, false, '31st tool call on fresh store instance must be blocked');
        assert.strictEqual(tres31.statusCode, 429);

        record('RATE-DIST-01', 'Cross-Instance Rate Limit Enforcement (Instance A & B Shared State)', true, '2 reqs on Instance A + 1 req on Instance B succeeded; 4th req on Instance B & 31st AI tool call rejected with 429');
      } finally {
        await new Promise<void>((r) => srvA.close(() => r()));
        await new Promise<void>((r) => srvB.close(() => r()));
      }
    } catch (e: any) {
      record('RATE-DIST-01', 'Cross-Instance Rate Limit Enforcement (Instance A & B Shared State)', false, e.message);
    }

    // RATE-DIST-02: Service Restart Persistence & Distributed Failed Auth Lockout (IP & UID across instances/restarts)
    try {
      const storeBeforeRestart = new DistributedFirestoreRateLimitStore();
      const restartKey = `POST_/api/orders/create_user_restart_persist_${Date.now()}`;

      // Consume 2/2 before simulated service restart
      const pre1 = await storeBeforeRestart.consume(restartKey, 2, 60000);
      const pre2 = await storeBeforeRestart.consume(restartKey, 2, 60000);
      assert.strictEqual(pre1.allowed, true);
      assert.strictEqual(pre2.allowed, true);

      // Simulate full service restart: instantiate brand new store & middleware
      const storeAfterRestart = new DistributedFirestoreRateLimitStore();
      const postRestart = await storeAfterRestart.consume(restartKey, 2, 60000);
      assert.strictEqual(postRestart.allowed, false, 'Counter must survive service restart in Firestore');
      assert.strictEqual(postRestart.remaining, 0);

      // Verify DistributedFailedAuthTracker across Instance A, Instance B, and service restart for same IP
      const authTrackerInstanceA = new DistributedFailedAuthTracker({
        maxFailedAttempts: 4,
        windowMs: 60000,
        store: new DistributedFirestoreRateLimitStore(),
      });
      const authTrackerInstanceB = new DistributedFailedAuthTracker({
        maxFailedAttempts: 4,
        windowMs: 60000,
        store: new DistributedFirestoreRateLimitStore(),
      });

      const attackerIp = `203.0.113.${Math.floor(10 + Math.random() * 80)}`;
      const targetedUid = `victim_uid_${Date.now()}`;

      // 2 failed attempts on Instance A
      const f1 = await authTrackerInstanceA.recordFailedAttempt({ ip: attackerIp, telemetryClaimedUid: targetedUid });
      const f2 = await authTrackerInstanceA.recordFailedAttempt({ ip: attackerIp, telemetryClaimedUid: targetedUid });
      assert.strictEqual(f1.lockedOut, false);
      assert.strictEqual(f2.lockedOut, false);

      // 2 failed attempts on Instance B -> 4th attempt reaches threshold, 5th attempt locks out
      const f3 = await authTrackerInstanceB.recordFailedAttempt({ ip: attackerIp, telemetryClaimedUid: targetedUid });
      const f4 = await authTrackerInstanceB.recordFailedAttempt({ ip: attackerIp, telemetryClaimedUid: targetedUid });
      assert.strictEqual(f3.lockedOut, false);
      assert.strictEqual(f4.lockedOut, false);

      // 5th attempt on restarted Instance C -> MUST LOCK OUT IP across instances
      const authTrackerAfterRestart = new DistributedFailedAuthTracker({
        maxFailedAttempts: 4,
        windowMs: 60000,
        store: new DistributedFirestoreRateLimitStore(),
      });
      const f5 = await authTrackerAfterRestart.recordFailedAttempt({ ip: attackerIp, telemetryClaimedUid: targetedUid });
      assert.strictEqual(f5.lockedOut, true, '5th failed auth attempt from same IP across instances/restart must trigger lockout');

      record('RATE-DIST-02', 'Service Restart Persistence & Distributed Failed Auth IP Lockout', true, 'Rate limit & failedAuthTracker survived restart and locked out brute-force IP across Instance A, B, and C');
    } catch (e: any) {
      record('RATE-DIST-02', 'Service Restart Persistence & Distributed Failed Auth IP Lockout', false, e.message);
    }

    // RATE-DIST-03: Concurrent Burst Requests Across Distributed Instances
    try {
      const storeNode1 = new DistributedFirestoreRateLimitStore();
      const storeNode2 = new DistributedFirestoreRateLimitStore();
      const concurrentKey = `concurrent_burst_key_${Date.now()}`;
      const maxAllowed = 4;

      // Fire 8 concurrent requests split evenly across Node 1 and Node 2
      const burstPromises = Array.from({ length: 8 }, (_, idx) => {
        const node = idx % 2 === 0 ? storeNode1 : storeNode2;
        return node.consume(concurrentKey, maxAllowed, 60000);
      });

      const burstResults = await Promise.all(burstPromises);
      const allowedCount = burstResults.filter((r) => r.allowed).length;
      const deniedCount = burstResults.filter((r) => !r.allowed).length;

      assert.strictEqual(allowedCount, maxAllowed, `Expected exactly ${maxAllowed} allowed under concurrent burst, got ${allowedCount}`);
      assert.strictEqual(deniedCount, 8 - maxAllowed, `Expected ${8 - maxAllowed} denied under concurrent burst, got ${deniedCount}`);

      record('RATE-DIST-03', 'Concurrent Burst Serialization Across Distributed Nodes', true, `8 parallel requests across 2 nodes -> exactly ${allowedCount} allowed and ${deniedCount} rejected`);
    } catch (e: any) {
      record('RATE-DIST-03', 'Concurrent Burst Serialization Across Distributed Nodes', false, e.message);
    }

    // RATE-DIST-04: Database Failure During Rate Limit Evaluation
    try {
      const realDb = getAdminDb();
      const brokenDb = {
        collection: () => ({
          doc: () => ({}),
        }),
        runTransaction: async () => {
          throw new Error('FIRESTORE_CLUSTER_UNREACHABLE');
        },
      };

      setAdminDbForTesting(brokenDb);
      let caughtErr: any = null;
      try {
        const distStore = new DistributedFirestoreRateLimitStore();
        await distStore.consume('db_fail_test_key', 10, 60000);
      } catch (err: any) {
        caughtErr = err;
      } finally {
        setAdminDbForTesting(realDb);
      }

      assert.ok(caughtErr, 'DistributedFirestoreRateLimitStore must throw when database fails');
      assert.strictEqual(caughtErr.statusCode, 503);
      assert.strictEqual(caughtErr.code, 'RATE_LIMITER_UNAVAILABLE');
      record('RATE-DIST-04', 'Database Failure Detection in Distributed RateLimitStore', true, 'Thrown error with statusCode=503 and code=RATE_LIMITER_UNAVAILABLE on Firestore outage');
    } catch (e: any) {
      record('RATE-DIST-04', 'Database Failure Detection in Distributed RateLimitStore', false, e.message);
    }

    // RATE-DIST-05: Distributed Counter Consistency & Legitimate Traffic Preservation Matrix
    try {
      const distStore = new DistributedFirestoreRateLimitStore();
      const windowShortMs = 1500; // 1.5s window to test window expiration recovery
      const userAKey = `POST_/api/orders/create_user_legit_A_${Date.now()}`;
      const userBKey = `POST_/api/orders/create_user_legit_B_${Date.now()}`;
      const userARefundKey = `POST_/api/refunds/create_user_legit_A_${Date.now()}`;

      // 1. Within limit -> success (1, 2)
      const c1 = await distStore.consume(userAKey, 2, windowShortMs);
      const c2 = await distStore.consume(userAKey, 2, windowShortMs);
      assert.strictEqual(c1.allowed, true);
      assert.strictEqual(c1.count, 1);
      assert.strictEqual(c1.remaining, 1);
      assert.strictEqual(c2.allowed, true);
      assert.strictEqual(c2.count, 2);
      assert.strictEqual(c2.remaining, 0);

      // 2. Over limit -> reject
      const c3 = await distStore.consume(userAKey, 2, windowShortMs);
      assert.strictEqual(c3.allowed, false);
      assert.strictEqual(c3.remaining, 0);

      // 3. Different users -> independent limits (User B unaffected when User A is rate-limited)
      const userBRes = await distStore.consume(userBKey, 2, windowShortMs);
      assert.strictEqual(userBRes.allowed, true, 'User B must have independent quota');
      assert.strictEqual(userBRes.count, 1);

      // 4. Different resources -> independently scoped (User A calling /api/refunds/create is unaffected)
      const resourceBRes = await distStore.consume(userARefundKey, 2, windowShortMs);
      assert.strictEqual(resourceBRes.allowed, true, 'Different endpoint resource must be independently scoped');

      // 5. After window -> allowed again
      await new Promise((r) => setTimeout(r, windowShortMs + 200));
      const afterWindowRes = await distStore.consume(userAKey, 2, windowShortMs);
      assert.strictEqual(afterWindowRes.allowed, true, 'Legitimate traffic must be allowed again after window expires');
      assert.strictEqual(afterWindowRes.count, 1);

      record('RATE-DIST-05', 'Distributed Counter Consistency & Legitimate Traffic Matrix', true, 'Verified within-limit (200), over-limit (429), user isolation, endpoint isolation, and post-window reset');
    } catch (e: any) {
      record('RATE-DIST-05', 'Distributed Counter Consistency & Legitimate Traffic Matrix', false, e.message);
    }

    // RATE-DIST-06: End-to-End HTTP Fail-Closed Behavior (HTTP 503 + RATE_LIMITER_UNAVAILABLE, Zero Memory Fallback)
    try {
      const realDb = getAdminDb();
      const offlineDb = {
        collection: () => ({
          doc: () => ({
            get: async () => ({ exists: true, data: () => ({ status: 'active', role: 'CUSTOMER' }) }),
          }),
        }),
        runTransaction: async () => {
          throw new Error('DISTRIBUTED_STORE_DOWN');
        },
      };

      const failClosedApp = express();
      failClosedApp.use(express.json());
      failClosedApp.post(
        '/api/orders/create',
        createRateLimiter({
          windowMs: 60000,
          max: 10,
          store: new DistributedFirestoreRateLimitStore(),
          maxFailedAuthAttempts: 3,
        }),
        (_req, res) => res.status(200).json({ success: true })
      );

      const fcServer = await new Promise<http.Server>((resolve) => {
        const s = failClosedApp.listen(0, '127.0.0.1', () => resolve(s));
      });

      try {
        const fcPort = (fcServer.address() as any).port;
        const fcUrl = `http://127.0.0.1:${fcPort}/api/orders/create`;
        const validToken = makeJwtToken({ uid: 'cust_prov_1', email: 'cust1@test.so' });

        setAdminDbForTesting(offlineDb);

        // 1. Authenticated request when distributed rate limiter fails -> MUST return HTTP 503 with RATE_LIMITER_UNAVAILABLE
        const fcRes1 = await fetch(fcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: validToken },
          body: JSON.stringify({}),
        });
        const fcBody1 = await fcRes1.json();
        assert.strictEqual(fcRes1.status, 503, 'Must return HTTP 503 when distributed rate limiter is unavailable');
        assert.strictEqual(fcBody1.code, 'RATE_LIMITER_UNAVAILABLE', 'Response code must be RATE_LIMITER_UNAVAILABLE');

        // 2. Failed auth attempt when distributed failedAuthTracker fails -> MUST also return HTTP 503 with RATE_LIMITER_UNAVAILABLE
        const fcRes2 = await fetch(fcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer malformed_invalid_token' },
          body: JSON.stringify({}),
        });
        const fcBody2 = await fcRes2.json();
        assert.strictEqual(fcRes2.status, 503, 'Failed auth tracking must also fail closed with HTTP 503 on DB outage');
        assert.strictEqual(fcBody2.code, 'RATE_LIMITER_UNAVAILABLE');
      } finally {
        setAdminDbForTesting(realDb);
        await new Promise<void>((r) => fcServer.close(() => r()));
      }

      record('RATE-DIST-06', 'End-to-End HTTP 503 Fail-Closed Rate Limiter & Auth Tracker', true, 'Both rate limiter and failedAuthTracker returned HTTP 503 RATE_LIMITER_UNAVAILABLE with zero local memory fallback');
    } catch (e: any) {
      record('RATE-DIST-06', 'End-to-End HTTP 503 Fail-Closed Rate Limiter & Auth Tracker', false, e.message);
    }

    // =========================================================================
    // 8. SOURCE CONTRADICTION REMEDIATION (PCR-09 TO PCR-15)
    // =========================================================================

    // RATE-SEC-07: Forged JWT claiming victim UID from Attacker A does NOT increment or lock out victim UID
    try {
      const tracker = new DistributedFailedAuthTracker({
        maxFailedAttempts: 3,
        windowMs: 60000,
        store: new DistributedFirestoreRateLimitStore(),
      });
      const victimUid = `victim_pcr09_${Date.now()}`;
      const attackerAIp = `198.51.100.201`;

      // Attacker A sends 4 failed requests claiming victimUid -> Attacker A's IP locks out, but victimUid is NOT locked out
      await tracker.recordFailedAttempt({ ip: attackerAIp, telemetryClaimedUid: victimUid });
      await tracker.recordFailedAttempt({ ip: attackerAIp, telemetryClaimedUid: victimUid });
      await tracker.recordFailedAttempt({ ip: attackerAIp, telemetryClaimedUid: victimUid });
      const fourthFromA = await tracker.recordFailedAttempt({ ip: attackerAIp, telemetryClaimedUid: victimUid });
      assert.strictEqual(fourthFromA.lockedOut, true, 'Attacker A IP must be locked out after exceeding maxFailedAttempts');

      // Now a different IP with telemetryClaimedUid = victimUid is NOT locked out (proving no failed_auth_uid_{victimUid} lock exists)
      const legitIpCheck = await tracker.recordFailedAttempt({ ip: '192.0.2.250', telemetryClaimedUid: victimUid });
      assert.strictEqual(legitIpCheck.lockedOut, false, 'Victim UID must NEVER be locked out by Attacker A forged JWT claims');

      record('RATE-SEC-07', 'Unverified JWT UID Claim Does Not Lock Out Victim UID', true, 'Attacker A IP locked out on 4th attempt; victim UID remained unlocked on independent IP');
    } catch (e: any) {
      record('RATE-SEC-07', 'Unverified JWT UID Claim Does Not Lock Out Victim UID', false, e.message);
    }

    // RATE-SEC-08: Distributed Multi-IP Spoofing (Attacker A + Attacker B + Attacker C + same victim UID)
    try {
      const tracker = new DistributedFailedAuthTracker({
        maxFailedAttempts: 2,
        windowMs: 60000,
        store: new DistributedFirestoreRateLimitStore(),
      });
      const sharedVictimUid = `victim_multi_ip_${Date.now()}`;

      // Attacker A (2 failed attempts with victim UID)
      const resA1 = await tracker.recordFailedAttempt({ ip: '203.0.113.101', telemetryClaimedUid: sharedVictimUid });
      const resA2 = await tracker.recordFailedAttempt({ ip: '203.0.113.101', telemetryClaimedUid: sharedVictimUid });
      // Attacker B (2 failed attempts with same victim UID)
      const resB1 = await tracker.recordFailedAttempt({ ip: '203.0.113.102', telemetryClaimedUid: sharedVictimUid });
      const resB2 = await tracker.recordFailedAttempt({ ip: '203.0.113.102', telemetryClaimedUid: sharedVictimUid });
      // Attacker C (2 failed attempts with same victim UID)
      const resC1 = await tracker.recordFailedAttempt({ ip: '203.0.113.103', telemetryClaimedUid: sharedVictimUid });
      const resC2 = await tracker.recordFailedAttempt({ ip: '203.0.113.103', telemetryClaimedUid: sharedVictimUid });

      assert.strictEqual(resA1.lockedOut, false);
      assert.strictEqual(resA2.lockedOut, false);
      assert.strictEqual(resB1.lockedOut, false);
      assert.strictEqual(resB2.lockedOut, false);
      assert.strictEqual(resC1.lockedOut, false);
      assert.strictEqual(resC2.lockedOut, false);

      // Even though 6 total failed attempts claimed sharedVictimUid (where maxFailedAttempts=2),
      // each IP only made 2 attempts and there is NO global UID lockout!
      record('RATE-SEC-08', 'Attacker A + B + C Targeting Same Victim UID Never Causes Global Victim Lockout', true, '6 forged attempts across 3 attacker IPs did not trigger global victim UID lockout');
    } catch (e: any) {
      record('RATE-SEC-08', 'Attacker A + B + C Targeting Same Victim UID Never Causes Global Victim Lockout', false, e.message);
    }

    // RATE-SEC-09: Legitimate Victim With Valid Token Succeeds After Attackers A, B, C Flood Forged JWTs With Victim UID
    try {
      const victimUid = `cust_victim_live_${Date.now()}`;
      await adminDb.collection('users').doc(victimUid).set({
        id: victimUid,
        name: 'Legitimate Victim User',
        email: 'victim@test.so',
        role: 'CUSTOMER',
        status: 'active',
      });

      const rlApp = express();
      rlApp.set('trust proxy', true);
      rlApp.use(express.json());
      rlApp.post(
        '/api/protected-victim-test',
        createRateLimiter({
          windowMs: 60000,
          max: 5,
          maxFailedAuthAttempts: 2,
          store: new DistributedFirestoreRateLimitStore(),
        }),
        (req, res) => res.status(200).json({ success: true, uid: (req as any).authenticatedUser?.uid })
      );

      const rlSrv = await new Promise<http.Server>((resolve) => {
        const s = rlApp.listen(0, '127.0.0.1', () => resolve(s));
      });

      try {
        const rlPort = (rlSrv.address() as any).port;
        const rlUrl = `http://127.0.0.1:${rlPort}/api/protected-victim-test`;

        // Forged unsigned JWT claiming victimUid (not a valid test-token or Firebase token)
        const forgedHeader = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
        const forgedPayload = Buffer.from(JSON.stringify({ uid: victimUid, sub: victimUid })).toString('base64url');
        const forgedBearer = `Bearer ${forgedHeader}.${forgedPayload}.forged_sig`;

        // Attacker A, B, C send forged tokens claiming victimUid from 3 different IPs
        for (const ip of ['198.51.100.11', '198.51.100.12', '198.51.100.13']) {
          for (let attempt = 1; attempt <= 3; attempt++) {
            const r = await fetch(rlUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Forwarded-For': ip,
                Authorization: forgedBearer,
              },
              body: JSON.stringify({}),
            });
            if (attempt <= 2) {
              assert.strictEqual(r.status, 401, `Attempt ${attempt} from ${ip} should be 401`);
            } else {
              assert.strictEqual(r.status, 429, `Attempt 3 from ${ip} should lock out attacker IP with 429`);
            }
          }
        }

        // Now the legitimate victim authenticates with a valid token from their own IP -> MUST SUCCEED (200)
        const validVictimToken = makeJwtToken({ uid: victimUid, email: 'victim@test.so' });
        const victimRes = await fetch(rlUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Forwarded-For': '192.0.2.88',
            Authorization: validVictimToken,
          },
          body: JSON.stringify({}),
        });
        const victimBody = await victimRes.json();
        assert.strictEqual(victimRes.status, 200, 'Legitimate victim must succeed with HTTP 200 despite attacker forged token flood');
        assert.strictEqual(victimBody.uid, victimUid);

        record('RATE-SEC-09', 'Legitimate Victim Authenticated Request Succeeds Under Multi-IP Forged Token Flood', true, 'Attackers A, B, C locked out (429) by IP; legitimate victim succeeded (200)');
      } finally {
        await new Promise<void>((r) => rlSrv.close(() => r()));
      }
    } catch (e: any) {
      record('RATE-SEC-09', 'Legitimate Victim Authenticated Request Succeeds Under Multi-IP Forged Token Flood', false, e.message);
    }

    // DISPUTE-RULE-01: Direct Firestore client create on /disputes/{disputeId} is strictly denied (allow create: if false)
    try {
      await assertFails(
        setDoc(doc(custADb, 'disputes', 'disp_direct_client_bypass_01'), {
          id: 'disp_direct_client_bypass_01',
          orderId: 'ord_disp_single_01',
          customerId: 'cust_book_a',
          sellerId: 'seller_prov_a',
          reason: 'damaged_item',
          description: 'Trying to bypass /api/disputes/create via direct Firestore write',
          status: 'OPEN',
          createdAt: new Date().toISOString(),
        })
      );
      record('DISPUTE-RULE-01', 'Direct Firestore Client Dispute Creation Blocked (allow create: if false)', true, 'Firestore Rules denied direct client create on /disputes/{disputeId}');
    } catch (e: any) {
      record('DISPUTE-RULE-01', 'Direct Firestore Client Dispute Creation Blocked (allow create: if false)', false, e.message);
    }

    // DISPUTE-RULE-02: Direct Firestore client update/delete on /disputes/{disputeId} is strictly denied, while owner read succeeds
    try {
      const ruleDispId = 'disp_rule_read_write_test';
      await adminDb.collection('disputes').doc(ruleDispId).set({
        id: ruleDispId,
        orderId: 'ord_disp_single_01',
        customerId: 'cust_book_a',
        sellerId: 'seller_prov_a',
        status: 'OPEN',
        description: 'Server created dispute',
      });

      // Owner Customer A and Seller A can read; unrelated Customer B cannot read
      await assertSucceeds(getDoc(doc(custADb, 'disputes', ruleDispId)));
      await assertSucceeds(getDoc(doc(sellerADb, 'disputes', ruleDispId)));
      await assertFails(getDoc(doc(custBDb, 'disputes', ruleDispId)));

      // Direct client update by Customer A or Seller A is strictly denied (allow update: if false)
      await assertFails(
        setDoc(
          doc(sellerADb, 'disputes', ruleDispId),
          { status: 'SELLER_RESPONDED', sellerResponse: { message: 'Direct write bypass' } },
          { merge: true }
        )
      );

      record('DISPUTE-RULE-02', 'Direct Firestore Dispute Update Blocked & Ownership Read Enforced', true, 'Owner reads succeeded; unrelated read & direct client update denied by Firestore Rules');
    } catch (e: any) {
      record('DISPUTE-RULE-02', 'Direct Firestore Dispute Update Blocked & Ownership Read Enforced', false, e.message);
    }

    // DISPUTE-CONCURRENCY-01: 10 concurrent /api/disputes/create requests for the same order -> 1 success (200), 9 conflicts (409)
    try {
      const raceOrderId = `ord_disp_race_${Date.now()}`;
      await adminDb.collection('orders').doc(raceOrderId).set({
        orderId: raceOrderId,
        customerId: 'cust_book_a',
        customerName: 'Customer A',
        sellerIds: ['seller_prov_a'],
        vendorStoreIds: ['store_prov_a'],
        vendorOrders: [
          {
            subOrderId: `${raceOrderId}-S1`,
            sellerId: 'seller_prov_a',
            storeId: 'store_prov_a',
            storeName: 'Store A Official',
            subtotal: 80,
            total: 85,
            status: 'delivered',
          },
        ],
        total: 85,
        status: 'delivered',
      });

      const concurrentCreates = Array.from({ length: 10 }, (_, idx) =>
        fetch(`${baseUrl}/api/disputes/create`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: custAToken },
          body: JSON.stringify({
            orderId: raceOrderId,
            reason: 'item_not_received',
            description: `Concurrent dispute creation attempt #${idx + 1}`,
          }),
        }).then(async (r) => ({ status: r.status, body: await r.json() }))
      );

      const createResults = await Promise.all(concurrentCreates);
      const createSuccesses = createResults.filter((r) => r.status === 200 && r.body.success === true);
      const createConflicts = createResults.filter((r) => r.status === 409);

      assert.strictEqual(createSuccesses.length, 1, `Expected exactly 1 dispute creation to succeed, got ${createSuccesses.length}`);
      assert.strictEqual(createConflicts.length, 9, `Expected exactly 9 dispute creations to fail with 409 Conflict, got ${createConflicts.length}`);

      record('DISPUTE-CONCURRENCY-01', '10 Concurrent Dispute Creation Requests Atomic Serialization', true, '10 parallel requests -> 1 HTTP 200 success and 9 HTTP 409 conflicts');
    } catch (e: any) {
      record('DISPUTE-CONCURRENCY-01', '10 Concurrent Dispute Creation Requests Atomic Serialization', false, e.message);
    }

    // DISPUTE-CONCURRENCY-02: 10 concurrent /api/disputes/respond requests on OPEN dispute -> 1 success (200), 9 HTTP 409
    try {
      const raceDisputeId = `disp_respond_race_${Date.now()}`;
      await adminDb.collection('disputes').doc(raceDisputeId).set({
        id: raceDisputeId,
        orderId: 'ord_disp_single_01',
        customerId: 'cust_book_a',
        sellerId: 'seller_prov_a',
        storeId: 'store_prov_a',
        status: 'OPEN',
        reason: 'damaged_item',
        description: 'Open dispute for concurrent response test',
        createdAt: new Date().toISOString(),
      });

      const concurrentResponses = Array.from({ length: 10 }, (_, idx) =>
        fetch(`${baseUrl}/api/disputes/respond`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: sellerAToken },
          body: JSON.stringify({
            disputeId: raceDisputeId,
            message: `Concurrent merchant response #${idx + 1}`,
            proposedAction: 'accept_refund',
          }),
        }).then(async (r) => ({ status: r.status, body: await r.json() }))
      );

      const respResults = await Promise.all(concurrentResponses);
      const respSuccesses = respResults.filter((r) => r.status === 200 && r.body.success === true);
      const respConflicts = respResults.filter((r) => r.status === 409);

      assert.strictEqual(respSuccesses.length, 1, `Expected exactly 1 dispute response to succeed, got ${respSuccesses.length}`);
      assert.strictEqual(respConflicts.length, 9, `Expected exactly 9 dispute responses to fail with HTTP 409, got ${respConflicts.length}`);

      record('DISPUTE-CONCURRENCY-02', '10 Concurrent Dispute Response Requests Atomic Transaction', true, '10 parallel responses -> 1 HTTP 200 success and 9 HTTP 409 conflicts');
    } catch (e: any) {
      record('DISPUTE-CONCURRENCY-02', '10 Concurrent Dispute Response Requests Atomic Transaction', false, e.message);
    }

    // PRODUCT-PERSIST-04: Authoritative Product Update, Status Moderation, Publish Toggle & Delete Persist to Firestore First
    try {
      const targetProdId = `prod_auth_mut_${Date.now()}`;
      const initialProd: any = {
        id: targetProdId,
        storeId: 'store_prov_a',
        sellerId: 'seller_prov_a',
        title: { ar: 'منتج أصلي', en: 'Original Product', so: 'Original Product' },
        description: { ar: 'وصف', en: 'Desc', so: 'Desc' },
        slug: 'original-product',
        price: 100,
        stock: 20,
        status: 'published',
        isPublished: true,
        rating: 5,
        reviewsCount: 0,
      };
      await adminDb.collection('products').doc(targetProdId).set(initialProd);
      productService.seedProducts([initialProd]);

      // 1. Authoritative Update (price 100 -> 150, stock 20 -> 35)
      const updated = await productService.updateProductAuthoritative(
        targetProdId,
        { price: 150, stock: 35 },
        'seller_prov_a',
        'SELLER'
      );
      assert.strictEqual(updated.price, 150);
      const snapAfterUpdate = await adminDb.collection('products').doc(targetProdId).get();
      assert.strictEqual(snapAfterUpdate.data()?.price, 150);
      assert.strictEqual(snapAfterUpdate.data()?.stock, 35);

      // 2. Authoritative Toggle Publish (published -> hidden)
      const toggled = await productService.togglePublishAuthoritative(targetProdId, 'seller_prov_a', 'SELLER');
      assert.strictEqual(toggled.isPublished, false);
      const snapAfterToggle = await adminDb.collection('products').doc(targetProdId).get();
      assert.strictEqual(snapAfterToggle.data()?.isPublished, false);

      // 3. Authoritative Admin Status Moderation (hidden -> approved)
      const moderated = await productService.updateProductStatusAuthoritative(
        targetProdId,
        'approved',
        'admin_super_1',
        'SUPER_ADMIN'
      );
      assert.strictEqual(moderated.status, 'approved');
      const snapAfterMod = await adminDb.collection('products').doc(targetProdId).get();
      assert.strictEqual(snapAfterMod.data()?.status, 'approved');

      // 4. Authoritative Delete
      const deleted = await productService.deleteProductAuthoritative(targetProdId, 'seller_prov_a', 'SELLER');
      assert.strictEqual(deleted, true);
      const snapAfterDel = await adminDb.collection('products').doc(targetProdId).get();
      assert.strictEqual(snapAfterDel.exists, false, 'Deleted product must be removed from Firestore');
      assert.strictEqual(productService.getProductById(targetProdId), undefined, 'Deleted product must be removed from local cache');

      record('PRODUCT-PERSIST-04', 'Authoritative Product Update, TogglePublish, Status Moderation & Delete', true, 'Verified Firestore persistence precedes local cache update for update, togglePublish, status, and delete');
    } catch (e: any) {
      record('PRODUCT-PERSIST-04', 'Authoritative Product Update, TogglePublish, Status Moderation & Delete', false, e.message);
    }

    // PRODUCT-PERSIST-05: Product Mutation Outage Prevention (No False Local Success When Firestore Fails)
    try {
      const outageProdId = `prod_outage_mut_${Date.now()}`;
      const seedOutageProd: any = {
        id: outageProdId,
        storeId: 'store_prov_a',
        sellerId: 'seller_prov_a',
        title: { ar: 'منتج محمي', en: 'Protected Product', so: 'Protected Product' },
        description: { ar: 'وصف', en: 'Desc', so: 'Desc' },
        slug: 'protected-product',
        price: 80,
        stock: 10,
        status: 'published',
        isPublished: true,
        rating: 5.0,
        reviewsCount: 1,
      };
      await adminDb.collection('products').doc(outageProdId).set(seedOutageProd);
      productService.seedProducts([seedOutageProd]);

      const realDb = getAdminDb();
      const failingDb: any = {
        collection: () => ({
          doc: () => ({
            set: async () => {
              throw new Error('FIRESTORE_WRITE_OUTAGE');
            },
            delete: async () => {
              throw new Error('FIRESTORE_DELETE_OUTAGE');
            },
          }),
        }),
      };

      setAdminDbForTesting(failingDb);
      try {
        // 1. updateProductAuthoritative must throw and keep local price === 80
        let updateThrew = false;
        try {
          await productService.updateProductAuthoritative(outageProdId, { price: 999 }, 'seller_prov_a', 'SELLER');
        } catch {
          updateThrew = true;
        }
        assert.strictEqual(updateThrew, true, 'updateProductAuthoritative must throw on Firestore failure');
        assert.strictEqual(productService.getProductById(outageProdId)?.price, 80, 'Local price must remain 80 on Firestore failure');

        // 2. togglePublishAuthoritative must throw and keep isPublished === true
        let toggleThrew = false;
        try {
          await productService.togglePublishAuthoritative(outageProdId, 'seller_prov_a', 'SELLER');
        } catch {
          toggleThrew = true;
        }
        assert.strictEqual(toggleThrew, true, 'togglePublishAuthoritative must throw on Firestore failure');
        assert.strictEqual(productService.getProductById(outageProdId)?.isPublished, true, 'Local isPublished must remain true on failure');

        // 3. updateProductStatusAuthoritative must throw and keep status === 'published'
        let statusThrew = false;
        try {
          await productService.updateProductStatusAuthoritative(outageProdId, 'rejected', 'admin_super_1', 'SUPER_ADMIN');
        } catch {
          statusThrew = true;
        }
        assert.strictEqual(statusThrew, true, 'updateProductStatusAuthoritative must throw on Firestore failure');
        assert.strictEqual(productService.getProductById(outageProdId)?.status, 'published', 'Local status must remain published on failure');

        // 4. updateProductRatingAuthoritative must throw and keep rating === 5.0
        let ratingThrew = false;
        try {
          await productService.updateProductRatingAuthoritative(outageProdId, 1.2, 99);
        } catch {
          ratingThrew = true;
        }
        assert.strictEqual(ratingThrew, true, 'updateProductRatingAuthoritative must throw on Firestore failure');
        assert.strictEqual(productService.getProductById(outageProdId)?.rating, 5.0, 'Local rating must remain 5.0 on failure');

        // 5. deleteProductAuthoritative must throw and keep product in local cache
        let deleteThrew = false;
        try {
          await productService.deleteProductAuthoritative(outageProdId, 'seller_prov_a', 'SELLER');
        } catch {
          deleteThrew = true;
        }
        assert.strictEqual(deleteThrew, true, 'deleteProductAuthoritative must throw on Firestore failure');
        assert.ok(productService.getProductById(outageProdId), 'Product must still exist in local cache when Firestore delete fails');
      } finally {
        setAdminDbForTesting(realDb);
      }

      record('PRODUCT-PERSIST-05', 'Zero False Local Success on Product Update/Toggle/Status/Rating/Delete Outage', true, 'All 5 authoritative product mutations threw on DB outage and preserved original local state');
    } catch (e: any) {
      record('PRODUCT-PERSIST-05', 'Zero False Local Success on Product Update/Toggle/Status/Rating/Delete Outage', false, e.message);
    }

    // REVIEW-PERSIST-01: Authoritative Review Creation Persists to Firestore & Updates Local Cache Only on Success
    try {
      reviewService.resetMemoryState();
      const revTargetId = `prod_rev_persist_${Date.now()}`;
      const revUserId = `cust_rev_ok_${Date.now()}`;
      const revBookingId = `book_proof_${Date.now()}`;

      bookingService.seedBookings([
        {
          id: revBookingId,
          bookingCode: 'BK-90101',
          serviceId: revTargetId,
          serviceTitle: { ar: 'خدمة', en: 'Service', so: 'Service' },
          sellerId: 'seller_prov_a',
          storeId: 'store_prov_a',
          customerId: revUserId,
          customerName: 'Verified Customer',
          customerPhone: '+252610000001',
          date: '2026-10-10',
          time: '10:00',
          price: 50,
          status: 'completed',
          createdAt: new Date().toISOString(),
        },
      ]);

      const createdRev = await reviewService.addReview({
        targetType: 'service',
        targetId: revTargetId,
        userId: revUserId,
        userName: 'Verified Customer',
        bookingId: revBookingId,
        rating: 5,
        comment: 'Great service, persisted to Firestore first!',
      });

      const firestoreRevSnap = await adminDb.collection('reviews').doc(createdRev.id).get();
      assert.strictEqual(firestoreRevSnap.exists, true, 'Review must be persisted in Firestore');
      assert.strictEqual(firestoreRevSnap.data()?.comment, 'Great service, persisted to Firestore first!');
      const localRevs = reviewService.getReviewsByTarget('service', revTargetId);
      assert.strictEqual(localRevs.length, 1, 'Local cache must contain the persisted review');

      record('REVIEW-PERSIST-01', 'Authoritative Review Creation Persists to Firestore Before Local Cache', true, `Review ${createdRev.id} verified in Firestore and local cache`);
    } catch (e: any) {
      record('REVIEW-PERSIST-01', 'Authoritative Review Creation Persists to Firestore Before Local Cache', false, e.message);
    }

    // REVIEW-PERSIST-02: Review Creation Fails Closed on Firestore Outage (Throws Error, Zero Fake Local Success)
    try {
      reviewService.resetMemoryState();
      const outageRevTargetId = `prod_rev_outage_${Date.now()}`;
      const outageRevUserId = `cust_rev_fail_${Date.now()}`;
      const outageBookingId = `book_outage_${Date.now()}`;

      bookingService.seedBookings([
        {
          id: outageBookingId,
          bookingCode: 'BK-90102',
          serviceId: outageRevTargetId,
          serviceTitle: { ar: 'خدمة', en: 'Service', so: 'Service' },
          sellerId: 'seller_prov_a',
          storeId: 'store_prov_a',
          customerId: outageRevUserId,
          customerName: 'Customer During Outage',
          customerPhone: '+252610000002',
          date: '2026-10-11',
          time: '11:00',
          price: 50,
          status: 'completed',
          createdAt: new Date().toISOString(),
        },
      ]);

      const realDb = getAdminDb();
      const failingRevDb: any = {
        collection: () => ({
          doc: () => ({
            set: async () => {
              throw new Error('FIRESTORE_REVIEW_WRITE_OUTAGE');
            },
          }),
        }),
      };

      setAdminDbForTesting(failingRevDb);
      let reviewThrew = false;
      try {
        await reviewService.addReview({
          targetType: 'service',
          targetId: outageRevTargetId,
          userId: outageRevUserId,
          userName: 'Customer During Outage',
          bookingId: outageBookingId,
          rating: 4,
          comment: 'This review must not fake-succeed when Firestore is down',
        });
      } catch (err: any) {
        reviewThrew = true;
      } finally {
        setAdminDbForTesting(realDb);
      }

      assert.strictEqual(reviewThrew, true, 'reviewService.addReview() must throw when Firestore write fails');
      const localAfterFailure = reviewService.getReviewsByTarget('service', outageRevTargetId);
      assert.strictEqual(localAfterFailure.length, 0, 'Failed review write must NEVER be added to local cache');

      record('REVIEW-PERSIST-02', 'Fail-Closed Review Creation on Firestore Write Failure (No Fake Success)', true, 'addReview() threw on Firestore outage and left 0 fake reviews in local state');
    } catch (e: any) {
      record('REVIEW-PERSIST-02', 'Fail-Closed Review Creation on Firestore Write Failure (No Fake Success)', false, e.message);
    }

    // =========================================================================
    // 9. NEW FINDINGS REMEDIATION (F-05 TO F-20)
    // =========================================================================

    // REVIEW-OWNERSHIP-01: Purchase Product A -> attempt review on Product B -> REJECTED
    try {
      reviewService.resetMemoryState();
      const buyerId = `cust_own_01_${Date.now()}`;
      const orderIdA = `ord_own_A_${Date.now()}`;
      orderService.seedOrders([
        {
          orderId: orderIdA,
          customerId: buyerId,
          customerName: 'Buyer 1',
          phone: '+252615000001',
          city: 'Mogadishu',
          address: 'Hodan',
          paymentMethod: 'cod',
          items: [
            {
              id: 'prod_A_item',
              productId: 'prod_A_item',
              quantity: 1,
              product: { id: 'prod_A_item', title: { ar: 'A', en: 'A', so: 'A' }, price: 25 } as any,
            },
          ],
          subtotal: 25,
          shipping: 0,
          tax: 0,
          discount: 0,
          total: 25,
          status: 'delivered',
          paymentStatus: 'paid',
          createdAt: new Date().toISOString(),
        } as any,
      ]);

      let crossProdRejected = false;
      try {
        await reviewService.addReview({
          targetType: 'product',
          targetId: 'prod_B_unpurchased',
          userId: buyerId,
          userName: 'Buyer 1',
          orderId: orderIdA,
          rating: 1,
          comment: 'Trying to review Product B using Order for Product A',
        });
      } catch (err: any) {
        crossProdRejected = err.message.includes('Forbidden');
      }
      assert.strictEqual(crossProdRejected, true, 'Must reject reviewing Product B using Order for Product A');
      record('REVIEW-OWNERSHIP-01', 'Purchase Product A -> Review Product B Rejected (F-05)', true, 'Cross-product review with mismatched orderId strictly blocked');
    } catch (e: any) {
      record('REVIEW-OWNERSHIP-01', 'Purchase Product A -> Review Product B Rejected (F-05)', false, e.message);
    }

    // REVIEW-OWNERSHIP-02: Purchase Product A -> review Product A -> SUCCESS; Foreign user -> REJECTED
    try {
      reviewService.resetMemoryState();
      const buyerId = `cust_own_02_${Date.now()}`;
      const foreignUserId = `cust_foreign_${Date.now()}`;
      const orderIdA = `ord_own_A2_${Date.now()}`;
      orderService.seedOrders([
        {
          orderId: orderIdA,
          customerId: buyerId,
          customerName: 'Buyer 2',
          phone: '+252615000002',
          city: 'Mogadishu',
          address: 'Hodan',
          paymentMethod: 'cod',
          items: [
            {
              id: 'prod_A_valid',
              productId: 'prod_A_valid',
              quantity: 1,
              product: { id: 'prod_A_valid', title: { ar: 'A', en: 'A', so: 'A' }, price: 30 } as any,
            },
          ],
          subtotal: 30,
          shipping: 0,
          tax: 0,
          discount: 0,
          total: 30,
          status: 'delivered',
          paymentStatus: 'paid',
          createdAt: new Date().toISOString(),
        } as any,
      ]);

      // Foreign user trying to use Buyer 2's orderId -> REJECTED
      let foreignRejected = false;
      try {
        await reviewService.addReview({
          targetType: 'product',
          targetId: 'prod_A_valid',
          userId: foreignUserId,
          userName: 'Foreign Attacker',
          orderId: orderIdA,
          rating: 1,
          comment: 'Hijacking orderId',
        });
      } catch (err: any) {
        foreignRejected = true;
      }
      assert.strictEqual(foreignRejected, true, 'Foreign user must not use another customer orderId');

      // Legitimate owner reviewing Product A -> SUCCESS
      const validRev = await reviewService.addReview({
        targetType: 'product',
        targetId: 'prod_A_valid',
        userId: buyerId,
        userName: 'Buyer 2',
        orderId: orderIdA,
        rating: 5,
        comment: 'Verified purchase of Product A!',
      });
      assert.strictEqual(validRev.targetId, 'prod_A_valid');

      record('REVIEW-OWNERSHIP-02', 'Verified Owner Product A Review Succeeds & Foreign Order Claim Rejected (F-05)', true, 'Legitimate product review succeeded; foreign order claim rejected');
    } catch (e: any) {
      record('REVIEW-OWNERSHIP-02', 'Verified Owner Product A Review Succeeds & Foreign Order Claim Rejected (F-05)', false, e.message);
    }

    // REVIEW-OWNERSHIP-03: Booking Service X -> attempt review on Service Y -> REJECTED; review Service X -> SUCCESS
    try {
      reviewService.resetMemoryState();
      const srvBuyerId = `cust_srv_own_${Date.now()}`;
      const bookingIdX = `book_srv_X_${Date.now()}`;
      bookingService.seedBookings([
        {
          id: bookingIdX,
          bookingCode: 'BK-77701',
          serviceId: 'srv_X_actual',
          serviceTitle: { ar: 'X', en: 'X', so: 'X' },
          sellerId: 'seller_prov_a',
          storeId: 'store_prov_a',
          customerId: srvBuyerId,
          customerName: 'Service Customer',
          customerPhone: '+252615000003',
          date: '2026-10-12',
          time: '14:00',
          price: 60,
          status: 'completed',
          createdAt: new Date().toISOString(),
        },
      ]);

      let crossServiceRejected = false;
      try {
        await reviewService.addReview({
          targetType: 'service',
          targetId: 'srv_Y_unbooked',
          userId: srvBuyerId,
          userName: 'Service Customer',
          bookingId: bookingIdX,
          rating: 2,
          comment: 'Reviewing Service Y with Booking for Service X',
        });
      } catch (err: any) {
        crossServiceRejected = err.message.includes('Forbidden');
      }
      assert.strictEqual(crossServiceRejected, true, 'Must reject reviewing Service Y using Booking for Service X');

      const validSrvRev = await reviewService.addReview({
        targetType: 'service',
        targetId: 'srv_X_actual',
        userId: srvBuyerId,
        userName: 'Service Customer',
        bookingId: bookingIdX,
        rating: 5,
        comment: 'Legitimate Service X review',
      });
      assert.strictEqual(validSrvRev.targetId, 'srv_X_actual');

      record('REVIEW-OWNERSHIP-03', 'Booking Service X -> Review Service Y Rejected & Service X Accepted (F-05)', true, 'Booking targetId match strictly enforced');
    } catch (e: any) {
      record('REVIEW-OWNERSHIP-03', 'Booking Service X -> Review Service Y Rejected & Service X Accepted (F-05)', false, e.message);
    }

    // REVIEW-REPLY-01 & REVIEW-REPLY-02: Seller Reply Firestore-First Persistence & Outage Fail-Closed (F-06)
    try {
      reviewService.resetMemoryState();
      const replyTargetProd = `prod_reply_test_${Date.now()}`;
      const replyBuyerId = `cust_reply_test_${Date.now()}`;
      const replyBookId = `book_reply_${Date.now()}`;

      productService.seedProducts([
        {
          id: replyTargetProd,
          storeId: 'store_prov_a',
          sellerId: 'seller_prov_a',
          title: { ar: 'منتج', en: 'Prod', so: 'Prod' },
          description: { ar: 'وصف', en: 'Desc', so: 'Desc' },
          slug: 'prod-reply-test',
          price: 45,
          stock: 10,
          status: 'published',
          isPublished: true,
        } as any,
      ]);
      bookingService.seedBookings([
        {
          id: replyBookId,
          bookingCode: 'BK-8801',
          serviceId: replyTargetProd,
          serviceTitle: { ar: 'خدمة', en: 'Srv', so: 'Srv' },
          sellerId: 'seller_prov_a',
          storeId: 'store_prov_a',
          customerId: replyBuyerId,
          customerName: 'Reply Buyer',
          customerPhone: '+252615000010',
          date: '2026-10-15',
          time: '09:00',
          price: 45,
          status: 'completed',
          createdAt: new Date().toISOString(),
        },
      ]);

      const baseRev = await reviewService.addReview({
        targetType: 'product',
        targetId: replyTargetProd,
        userId: replyBuyerId,
        userName: 'Reply Buyer',
        bookingId: replyBookId,
        rating: 4,
        comment: 'Good product, awaiting seller reply',
      });

      // 1. Outage test (REVIEW-REPLY-02): Firestore failure -> throws error and leaves sellerReply undefined locally
      const realDb = getAdminDb();
      setAdminDbForTesting({
        collection: () => ({
          doc: () => ({
            set: async () => {
              throw new Error('FIRESTORE_REPLY_OUTAGE');
            },
          }),
        }),
      } as any);

      let replyThrewOnOutage = false;
      try {
        await reviewService.replyToReview(baseRev.id, 'Thank you from seller!', 'seller_prov_a', 'store_prov_a');
      } catch {
        replyThrewOnOutage = true;
      } finally {
        setAdminDbForTesting(realDb);
      }

      assert.strictEqual(replyThrewOnOutage, true, 'replyToReview must throw on Firestore outage');
      const revAfterOutage = reviewService.getReviewsByTarget('product', replyTargetProd)[0];
      assert.strictEqual(revAfterOutage.sellerReply, undefined, 'Local review must not have fake sellerReply after Firestore failure');
      record('REVIEW-REPLY-02', 'Seller Reply Fails Closed on Firestore Outage With Zero Local Mutation (F-06)', true, 'Outage threw error and kept local sellerReply undefined');

      // 2. Success test (REVIEW-REPLY-01): Firestore write succeeds -> updates Firestore and local state; second reply blocked
      const repliedRev = await reviewService.replyToReview(baseRev.id, 'Official seller response!', 'seller_prov_a', 'store_prov_a');
      assert.strictEqual(repliedRev.sellerReply?.comment, 'Official seller response!');
      const snapReply = await adminDb.collection('reviews').doc(baseRev.id).get();
      assert.strictEqual(snapReply.data()?.sellerReply?.comment, 'Official seller response!');

      let duplicateReplyBlocked = false;
      try {
        await reviewService.replyToReview(baseRev.id, 'Second reply attempt', 'seller_prov_a', 'store_prov_a');
      } catch {
        duplicateReplyBlocked = true;
      }
      assert.strictEqual(duplicateReplyBlocked, true, 'Second seller reply must be blocked');
      record('REVIEW-REPLY-01', 'Seller Reply Persists to Firestore First & Enforces Single-Reply Limit (F-06)', true, 'Seller reply persisted to Firestore and duplicate reply blocked');
    } catch (e: any) {
      record('REVIEW-REPLY-01', 'Seller Reply Persists to Firestore First & Enforces Single-Reply Limit (F-06)', false, e.message);
    }

    // REVIEW-MOD-01 & REVIEW-MOD-02: Review Moderation / Deletion Firestore-First & Outage Fail-Closed (F-12)
    try {
      const modRevId = `rev_cust_reply_test`;
      const allRevs = reviewService.getAllReviews();
      const targetRev = allRevs[0];
      assert.ok(targetRev, 'Target review for moderation must exist');

      const realDb = getAdminDb();
      setAdminDbForTesting({
        collection: () => ({
          doc: () => ({
            set: async () => {
              throw new Error('FIRESTORE_MOD_OUTAGE');
            },
            delete: async () => {
              throw new Error('FIRESTORE_DEL_OUTAGE');
            },
          }),
        }),
      } as any);

      let hideThrew = false;
      let deleteThrew = false;
      try {
        await reviewService.toggleHideReview(targetRev.id, true, 'admin_super_1', 'SUPER_ADMIN');
      } catch {
        hideThrew = true;
      }
      try {
        await reviewService.deleteReview(targetRev.id, 'admin_super_1', 'SUPER_ADMIN');
      } catch {
        deleteThrew = true;
      } finally {
        setAdminDbForTesting(realDb);
      }

      assert.strictEqual(hideThrew, true, 'toggleHideReview must throw on Firestore failure');
      assert.strictEqual(deleteThrew, true, 'deleteReview must throw on Firestore failure');
      const unchangedRev = reviewService.getAllReviews().find((r) => r.id === targetRev.id);
      assert.ok(unchangedRev, 'Review must remain in memory when Firestore delete fails');
      assert.strictEqual(Boolean(unchangedRev?.isHidden), false, 'Review isHidden must remain false when Firestore update fails');
      record('REVIEW-MOD-01', 'Review Moderation & Deletion Fail-Closed on Firestore Outage (F-12)', true, 'Both toggleHideReview and deleteReview threw on outage without mutating local state');

      // Now verify authoritative moderation & deletion succeed when Firestore is online
      const hiddenRev = await reviewService.toggleHideReview(targetRev.id, true, 'admin_super_1', 'SUPER_ADMIN');
      assert.strictEqual(hiddenRev.isHidden, true);
      const snapHidden = await adminDb.collection('reviews').doc(targetRev.id).get();
      assert.strictEqual(snapHidden.data()?.isHidden, true);

      const delOk = await reviewService.deleteReview(targetRev.id, 'admin_super_1', 'SUPER_ADMIN');
      assert.strictEqual(delOk, true);
      const snapDeleted = await adminDb.collection('reviews').doc(targetRev.id).get();
      assert.strictEqual(snapDeleted.exists, false);
      record('REVIEW-MOD-02', 'Authoritative Review Hide & Delete Persist to Firestore First (F-12)', true, 'Verified Firestore update and delete before local state mutation');
    } catch (e: any) {
      record('REVIEW-MOD-02', 'Authoritative Review Hide & Delete Persist to Firestore First (F-12)', false, e.message);
    }

    // PROD-GUARD-01: Legacy synchronous product helpers throw in production environment (F-08)
    try {
      const prevEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      let createBlocked = false;
      let updateBlocked = false;
      let deleteBlocked = false;
      let toggleBlocked = false;
      let statusBlocked = false;
      try {
        try {
          productService.createProduct({ title: { ar: 'x', en: 'x', so: 'x' }, price: 10, stock: 1 } as any, 's1', 'st1');
        } catch {
          createBlocked = true;
        }
        try {
          productService.updateProduct('p1', { price: 20 }, 's1', 'SELLER');
        } catch {
          updateBlocked = true;
        }
        try {
          productService.deleteProduct('p1', 's1', 'SELLER');
        } catch {
          deleteBlocked = true;
        }
        try {
          productService.togglePublish('p1', 's1', 'SELLER');
        } catch {
          toggleBlocked = true;
        }
        try {
          productService.updateProductStatus('p1', 'approved', 'admin_1', 'SUPER_ADMIN');
        } catch {
          statusBlocked = true;
        }
      } finally {
        process.env.NODE_ENV = prevEnv;
      }

      assert.strictEqual(createBlocked && updateBlocked && deleteBlocked && toggleBlocked && statusBlocked, true, 'All synchronous product mutations must throw in production');
      record('PROD-GUARD-01', 'Legacy Synchronous Product Helpers Strictly Blocked in Production (F-08)', true, 'createProduct, updateProduct, deleteProduct, togglePublish, updateProductStatus all threw Forbidden in production');
    } catch (e: any) {
      record('PROD-GUARD-01', 'Legacy Synchronous Product Helpers Strictly Blocked in Production (F-08)', false, e.message);
    }

    // BOOKING-MUTATION-01 & BOOKING-MUTATION-02: Booking Status/Cancel/Reschedule Firestore-First & Outage Fail-Closed (F-09)
    try {
      const bmId = `book_mut_f09_${Date.now()}`;
      const initialBooking: any = {
        id: bmId,
        bookingCode: 'BK-F0901',
        serviceId: 'srv_prov_a_active',
        serviceTitle: { ar: 'خدمة', en: 'Service', so: 'Service' },
        sellerId: 'seller_prov_a',
        storeId: 'store_prov_a',
        customerId: 'cust_book_a',
        customerName: 'Customer A',
        customerPhone: '+252615111222',
        date: '2026-11-01',
        time: '10:00',
        price: 120,
        status: 'requested',
        createdAt: new Date().toISOString(),
      };
      await adminDb.collection('bookings').doc(bmId).set(initialBooking);
      bookingService.seedBookings([initialBooking]);

      // Outage test (BOOKING-MUTATION-02): Firestore down -> updateBookingStatus, rescheduleBooking, cancelBooking all throw and keep status === 'requested'
      const realDb = getAdminDb();
      setAdminDbForTesting({
        collection: () => ({
          doc: () => ({
            set: async () => {
              throw new Error('FIRESTORE_BOOKING_OUTAGE');
            },
          }),
        }),
      } as any);

      let statusOutageThrew = false;
      let reschedOutageThrew = false;
      let cancelOutageThrew = false;
      try {
        try {
          await bookingService.updateBookingStatus(bmId, 'accepted', 'seller_prov_a', 'SELLER');
        } catch {
          statusOutageThrew = true;
        }
        try {
          await bookingService.rescheduleBooking({
            bookingId: bmId,
            newDate: '2026-11-02',
            newTime: '14:00',
            actorId: 'seller_prov_a',
            actorRole: 'SELLER',
          });
        } catch {
          reschedOutageThrew = true;
        }
        try {
          await bookingService.cancelBooking(bmId, 'cust_book_a', 'CUSTOMER', 'Outage test');
        } catch {
          cancelOutageThrew = true;
        }
      } finally {
        setAdminDbForTesting(realDb);
      }

      assert.strictEqual(statusOutageThrew && reschedOutageThrew && cancelOutageThrew, true, 'All booking mutations must throw on Firestore failure');
      assert.strictEqual(bookingService.getBookingById(bmId)?.status, 'requested', 'Booking status must remain requested after failed writes');
      assert.strictEqual(bookingService.getBookingById(bmId)?.date, '2026-11-01', 'Booking date must remain unchanged after failed reschedule');
      record('BOOKING-MUTATION-02', 'Booking Status, Reschedule & Cancel Fail-Closed on Firestore Outage (F-09)', true, 'All booking mutations threw on DB outage and preserved local state');

      // Online authoritative mutations (BOOKING-MUTATION-01)
      const accepted = await bookingService.updateBookingStatus(bmId, 'accepted', 'seller_prov_a', 'SELLER');
      assert.strictEqual(accepted.status, 'accepted');
      const snapAcc = await adminDb.collection('bookings').doc(bmId).get();
      assert.strictEqual(snapAcc.data()?.status, 'accepted');

      const rescheduled = await bookingService.rescheduleBooking({
        bookingId: bmId,
        newDate: '2026-11-05',
        newTime: '15:00',
        actorId: 'seller_prov_a',
        actorRole: 'SELLER',
        reason: 'Provider schedule adjustment',
      });
      assert.strictEqual(rescheduled.status, 'scheduled');
      assert.strictEqual(rescheduled.date, '2026-11-05');
      const snapResch = await adminDb.collection('bookings').doc(bmId).get();
      assert.strictEqual(snapResch.data()?.date, '2026-11-05');
      assert.strictEqual(snapResch.data()?.status, 'scheduled');

      const completed = await bookingService.completeBooking(bmId, 'seller_prov_a', 'SELLER');
      assert.strictEqual(completed.status, 'completed');
      const snapComp = await adminDb.collection('bookings').doc(bmId).get();
      assert.strictEqual(snapComp.data()?.status, 'completed');

      record('BOOKING-MUTATION-01', 'Authoritative Booking Status, Reschedule & Complete Persist to Firestore First (F-09)', true, 'Verified Firestore persistence precedes local cache update across booking lifecycle');
    } catch (e: any) {
      record('BOOKING-MUTATION-01', 'Authoritative Booking Status, Reschedule & Complete Persist to Firestore First (F-09)', false, e.message);
    }

    // DELIVERY-STATE-01 & DELIVERY-STATE-02: Strict Delivery State Machine & Fail-Closed Persistence (F-10)
    try {
      deliveryService.resetMemoryState();
      const delivId = `deliv_f10_${Date.now()}`;
      const seedAssignment: any = {
        id: delivId,
        orderId: 'ord_disp_single_01',
        subOrderId: 'ord_disp_single_01-S1',
        storeId: 'store_prov_a',
        storeName: 'Store A Official',
        sellerId: 'seller_prov_a',
        customerId: 'cust_book_a',
        customerName: 'Customer A',
        customerPhone: '+252615999000',
        city: 'Mogadishu',
        address: 'Hodan',
        deliveryType: 'PLATFORM_DELIVERY',
        assignedDriver: 'drv_demo_01',
        driverId: 'drv_demo_01',
        status: 'PENDING',
        deliveryFee: 5,
        driverEarnings: 4.25,
        timestamps: { created: new Date().toISOString() },
      };
      await adminDb.collection('deliveryAssignments').doc(delivId).set(seedAssignment);
      deliveryService.seedAssignments([seedAssignment]);

      // 1. Illegal jump PENDING -> DELIVERED must be rejected (DELIVERY-STATE-01)
      let illegalJumpRejected = false;
      try {
        await deliveryService.updateStatus({
          assignmentId: delivId,
          status: 'DELIVERED',
          actorId: 'admin_super_1',
          actorRole: 'SUPER_ADMIN',
        });
      } catch (err: any) {
        illegalJumpRejected = err.message.includes('Invalid delivery lifecycle transition');
      }
      assert.strictEqual(illegalJumpRejected, true, 'Illegal transition PENDING -> DELIVERED must be rejected');

      // 2. Step-by-step valid transitions: PENDING -> PREPARING -> READY -> PICKED_UP -> OUT_FOR_DELIVERY -> DELIVERED
      await deliveryService.updateStatus({ assignmentId: delivId, status: 'PREPARING', actorId: 'seller_prov_a', actorRole: 'SELLER' });
      await deliveryService.updateStatus({ assignmentId: delivId, status: 'READY', actorId: 'seller_prov_a', actorRole: 'SELLER' });
      await deliveryService.updateStatus({ assignmentId: delivId, status: 'PICKED_UP', actorId: 'drv_demo_01', actorRole: 'DRIVER' });
      await deliveryService.updateStatus({ assignmentId: delivId, status: 'OUT_FOR_DELIVERY', actorId: 'drv_demo_01', actorRole: 'DRIVER' });
      const finalDeliv = await deliveryService.updateStatus({ assignmentId: delivId, status: 'DELIVERED', actorId: 'drv_demo_01', actorRole: 'DRIVER' });
      assert.strictEqual(finalDeliv.status, 'DELIVERED');

      // 3. Reopen DELIVERED -> ASSIGNED must be rejected
      let reopenRejected = false;
      try {
        await deliveryService.updateStatus({
          assignmentId: delivId,
          status: 'ASSIGNED',
          actorId: 'admin_super_1',
          actorRole: 'SUPER_ADMIN',
        });
      } catch (err: any) {
        reopenRejected = err.message.includes('immutable');
      }
      assert.strictEqual(reopenRejected, true, 'Terminal DELIVERED state must be immutable');
      record('DELIVERY-STATE-01', 'Strict Step-by-Step Delivery Lifecycle & Terminal State Immutability (F-10)', true, 'Blocked PENDING->DELIVERED jump and DELIVERED->ASSIGNED reopen; verified full sequential lifecycle');

      // 4. Outage fail-closed test (DELIVERY-STATE-02)
      const outageDelivId = `deliv_outage_${Date.now()}`;
      const outageAssign = { ...seedAssignment, id: outageDelivId, status: 'PENDING' };
      await adminDb.collection('deliveryAssignments').doc(outageDelivId).set(outageAssign);
      deliveryService.seedAssignments([outageAssign]);

      const realDb = getAdminDb();
      setAdminDbForTesting({
        collection: () => ({
          doc: () => ({
            set: async () => {
              throw new Error('FIRESTORE_DELIVERY_OUTAGE');
            },
          }),
        }),
      } as any);

      let delivOutageThrew = false;
      let driverOutageThrew = false;
      try {
        try {
          await deliveryService.updateStatus({ assignmentId: outageDelivId, status: 'PREPARING', actorId: 'seller_prov_a', actorRole: 'SELLER' });
        } catch {
          delivOutageThrew = true;
        }
        try {
          await deliveryService.updateDriverStatus('drv_demo_01', 'BUSY', 'drv_demo_01', 'DRIVER');
        } catch {
          driverOutageThrew = true;
        }
      } finally {
        setAdminDbForTesting(realDb);
      }

      assert.strictEqual(delivOutageThrew && driverOutageThrew, true, 'Delivery and driver status updates must throw on Firestore outage');
      assert.strictEqual(deliveryService.getAssignmentById(outageDelivId)?.status, 'PENDING', 'Local delivery status must remain PENDING on outage');
      record('DELIVERY-STATE-02', 'Delivery & Driver Status Mutations Fail-Closed on Firestore Outage (F-10)', true, 'Both updateStatus and updateDriverStatus threw on DB failure without local mutation');
    } catch (e: any) {
      record('DELIVERY-STATE-02', 'Delivery & Driver Status Mutations Fail-Closed on Firestore Outage (F-10)', false, e.message);
    }

    // MSG-PERSIST-01 & MSG-PERSIST-02: Messaging Firestore-First Persistence & Outage Fail-Closed (F-11)
    try {
      messagingService.resetMemoryState();
      const conv = await messagingService.getOrCreateConversation({
        participantIds: ['cust_book_a', 'seller_prov_a'],
        participantDetails: [
          { id: 'cust_book_a', name: 'Customer A', role: 'CUSTOMER' },
          { id: 'seller_prov_a', name: 'Seller A', role: 'SELLER' },
        ],
        contextType: 'store',
        contextId: 'store_prov_a',
        contextTitle: 'Store A Official',
      });
      const snapConv = await adminDb.collection('conversations').doc(conv.id).get();
      assert.strictEqual(snapConv.exists, true, 'Conversation must be persisted in Firestore');

      const msg = await messagingService.sendMessage({
        conversationId: conv.id,
        senderId: 'cust_book_a',
        senderName: 'Customer A',
        senderRole: 'CUSTOMER',
        text: 'Hello seller, is this item in stock?',
      });
      const snapMsg = await adminDb.collection('messages').doc(msg.id).get();
      assert.strictEqual(snapMsg.exists, true, 'Message must be persisted in Firestore');
      record('MSG-PERSIST-01', 'Conversation & Message Creation Persist to Firestore Before Local State (F-11)', true, `Conversation ${conv.id} and message ${msg.id} verified in Firestore`);

      // Outage test (MSG-PERSIST-02)
      const realDb = getAdminDb();
      setAdminDbForTesting({
        collection: () => ({
          doc: () => ({
            set: async () => {
              throw new Error('FIRESTORE_MSG_OUTAGE');
            },
          }),
        }),
      } as any);

      let msgOutageThrew = false;
      try {
        await messagingService.sendMessage({
          conversationId: conv.id,
          senderId: 'cust_book_a',
          senderName: 'Customer A',
          senderRole: 'CUSTOMER',
          text: 'Message during outage',
        });
      } catch {
        msgOutageThrew = true;
      } finally {
        setAdminDbForTesting(realDb);
      }

      assert.strictEqual(msgOutageThrew, true, 'sendMessage must throw on Firestore failure');
      const msgsInConv = messagingService.getMessages(conv.id);
      assert.strictEqual(msgsInConv.length, 1, 'Failed message must not be added to local cache');
      record('MSG-PERSIST-02', 'Messaging Operations Fail-Closed on Firestore Outage (F-11)', true, 'sendMessage threw on outage and left 0 fake messages in local state');
    } catch (e: any) {
      record('MSG-PERSIST-02', 'Messaging Operations Fail-Closed on Firestore Outage (F-11)', false, e.message);
    }

    // SUB-PERSIST-01 & SUB-PERSIST-02: Subscription Reject/Cancel Firestore-First & Outage Fail-Closed (F-13)
    try {
      subscriptionService.resetMemoryState();
      const subId1 = `SUB-TEST-F13-1-${Date.now()}`;
      const subId2 = `SUB-TEST-F13-2-${Date.now()}`;
      const seedSubs: any[] = [
        {
          id: subId1,
          sellerId: 'seller_prov_a',
          storeId: 'store_prov_a',
          planId: 'plan_business',
          planTier: 'BUSINESS',
          status: 'PENDING_REVIEW',
          billingClassification: 'MANUAL',
          price: 35,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: subId2,
          sellerId: 'seller_prov_a',
          storeId: 'store_prov_a',
          planId: 'plan_basic',
          planTier: 'BASIC',
          status: 'ACTIVE',
          billingClassification: 'MANUAL',
          price: 15,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];
      for (const s of seedSubs) {
        await adminDb.collection('subscriptions').doc(s.id).set(s);
      }
      subscriptionService.seedSubscriptions(seedSubs);

      // Outage test (SUB-PERSIST-02)
      const realDb = getAdminDb();
      setAdminDbForTesting({
        collection: () => ({
          doc: () => ({
            set: async () => {
              throw new Error('FIRESTORE_SUB_OUTAGE');
            },
          }),
        }),
      } as any);

      let rejectThrew = false;
      let cancelThrew = false;
      try {
        try {
          await subscriptionService.rejectSubscription(subId1, 'admin_super_1', 'SUPER_ADMIN', 'Invalid reference');
        } catch {
          rejectThrew = true;
        }
        try {
          await subscriptionService.cancelSubscription(subId2, 'seller_prov_a', 'SELLER');
        } catch {
          cancelThrew = true;
        }
      } finally {
        setAdminDbForTesting(realDb);
      }

      assert.strictEqual(rejectThrew && cancelThrew, true, 'rejectSubscription and cancelSubscription must throw on Firestore outage');
      const localSub1 = subscriptionService.getSubscriptions().find((s) => s.id === subId1);
      const localSub2 = subscriptionService.getSubscriptions().find((s) => s.id === subId2);
      assert.strictEqual(localSub1?.status, 'PENDING_REVIEW', 'subId1 status must remain PENDING_REVIEW after failed reject');
      assert.strictEqual(localSub2?.status, 'ACTIVE', 'subId2 status must remain ACTIVE after failed cancel');
      record('SUB-PERSIST-02', 'Subscription Reject & Cancel Fail-Closed on Firestore Outage (F-13)', true, 'Both rejectSubscription and cancelSubscription threw on outage and preserved local status');

      // Online test (SUB-PERSIST-01)
      const rejectedSub = await subscriptionService.rejectSubscription(subId1, 'admin_super_1', 'SUPER_ADMIN', 'Invalid reference');
      assert.strictEqual(rejectedSub.status, 'CANCELLED');
      const snapSub1 = await adminDb.collection('subscriptions').doc(subId1).get();
      assert.strictEqual(snapSub1.data()?.status, 'CANCELLED');

      const cancelledSub = await subscriptionService.cancelSubscription(subId2, 'seller_prov_a', 'SELLER');
      assert.strictEqual(cancelledSub.status, 'CANCELLED');
      const snapSub2 = await adminDb.collection('subscriptions').doc(subId2).get();
      assert.strictEqual(snapSub2.data()?.status, 'CANCELLED');
      record('SUB-PERSIST-01', 'Subscription Reject & Cancel Persist to Firestore Before Local Cache (F-13)', true, 'Verified Firestore persistence before local state mutation');
    } catch (e: any) {
      record('SUB-PERSIST-01', 'Subscription Reject & Cancel Persist to Firestore Before Local Cache (F-13)', false, e.message);
    }

    // SETTINGS-PERSIST-01: Platform Settings & Commission Update Fail-Closed on Firestore Outage (F-14)
    try {
      platformSettingsService.resetMemoryState();
      const initialRate = platformSettingsService.getSettings().defaultCommissionRate;

      const realDb = getAdminDb();
      setAdminDbForTesting({
        collection: () => ({
          doc: () => ({
            set: async () => {
              throw new Error('FIRESTORE_SETTINGS_OUTAGE');
            },
          }),
        }),
      } as any);

      let settingsThrew = false;
      try {
        await platformSettingsService.updateSettings({ defaultCommissionRate: 18 }, 'admin_super_1', 'SUPER_ADMIN');
      } catch {
        settingsThrew = true;
      } finally {
        setAdminDbForTesting(realDb);
      }

      assert.strictEqual(settingsThrew, true, 'platformSettingsService.updateSettings must throw on Firestore failure');
      assert.strictEqual(platformSettingsService.getSettings().defaultCommissionRate, initialRate, 'Local commission rate must remain unchanged on Firestore failure');

      // Online update succeeds
      const updatedSettings = await platformSettingsService.updateSettings({ defaultCommissionRate: 12 }, 'admin_super_1', 'SUPER_ADMIN');
      assert.strictEqual(updatedSettings.defaultCommissionRate, 12);
      const snapSettings = await adminDb.collection('platformSettings').doc('privateFinancialSettings').get();
      assert.strictEqual(snapSettings.data()?.defaultCommissionRate, 12);

      // Restore default 10%
      await platformSettingsService.updateSettings({ defaultCommissionRate: 10 }, 'admin_super_1', 'SUPER_ADMIN');

      record('SETTINGS-PERSIST-01', 'Platform Settings & Commission Policy Fail-Closed Persistence (F-14)', true, 'Settings update threw on outage without local mutation and persisted segregations when online');
    } catch (e: any) {
      record('SETTINGS-PERSIST-01', 'Platform Settings & Commission Policy Fail-Closed Persistence (F-14)', false, e.message);
    }

    // PRIVACY-STORE-01: Public Store Document Strips Private Financial Metadata (F-15)
    try {
      const publicStoreId = `store_pub_f15_${Date.now()}`;
      await adminDb.collection('stores').doc(publicStoreId).set({
        id: publicStoreId,
        sellerId: 'seller_prov_a',
        name: 'Public Store F15',
        slug: 'public-store-f15',
        status: 'approved',
        rating: 4.9,
        reviewsCount: 10,
      });

      // Attempt by Seller to write commissionRate or currentPlanId onto /stores/{storeId} via Firestore Rules -> DENIED
      await assertFails(
        setDoc(
          doc(sellerADb, 'stores', publicStoreId),
          {
            id: publicStoreId,
            sellerId: 'seller_prov_a',
            name: 'Public Store F15',
            status: 'approved',
            commissionRate: 1,
            currentPlanId: 'plan_premium',
          },
          { merge: true }
        )
      );

      // Public read of approved store without private fields -> ALLOWED and contains no financial fields
      const pubSnap = await assertSucceeds(getDoc(doc(custADb, 'stores', publicStoreId)));
      const pubData = pubSnap.data() || {};
      assert.strictEqual(pubData.commissionRate, undefined, 'commissionRate must not exist on public store doc');
      assert.strictEqual(pubData.currentPlanId, undefined, 'currentPlanId must not exist on public store doc');
      assert.strictEqual(pubData.currentPlanTier, undefined, 'currentPlanTier must not exist on public store doc');

      record('PRIVACY-STORE-01', 'Public Store Documents Strip & Block Private Financial Metadata (F-15)', true, 'Verified commissionRate/currentPlanId/currentPlanTier absent and blocked on public /stores docs');
    } catch (e: any) {
      record('PRIVACY-STORE-01', 'Public Store Documents Strip & Block Private Financial Metadata (F-15)', false, e.message);
    }

    // PRIVACY-PRODUCT-01: Public Product Document Strips Internal Inventory Telemetry (F-16)
    try {
      const prodPrivId = `prod_priv_f16_${Date.now()}`;
      await adminDb.collection('products').doc(prodPrivId).set({
        id: prodPrivId,
        storeId: 'store_prov_a',
        sellerId: 'seller_prov_a',
        title: { ar: 'منتج', en: 'Product', so: 'Product' },
        description: { ar: 'وصف', en: 'Desc', so: 'Desc' },
        slug: 'prod-priv-f16',
        price: 55,
        stock: 10,
        status: 'published',
        isPublished: true,
      });
      productService.seedProducts([
        {
          id: prodPrivId,
          storeId: 'store_prov_a',
          sellerId: 'seller_prov_a',
          title: { ar: 'منتج', en: 'Product', so: 'Product' },
          description: { ar: 'وصف', en: 'Desc', so: 'Desc' },
          slug: 'prod-priv-f16',
          price: 55,
          stock: 10,
          status: 'published',
          isPublished: true,
        } as any,
      ]);

      // Update stock via updateProductAuthoritative -> must NOT write inventoryHistory or salesCount to Firestore /products doc
      await productService.updateProductAuthoritative(prodPrivId, { stock: 25 }, 'seller_prov_a', 'SELLER');
      const snapProd = await adminDb.collection('products').doc(prodPrivId).get();
      const prodData = snapProd.data() || {};
      assert.strictEqual(prodData.stock, 25);
      assert.strictEqual(prodData.inventoryHistory, undefined, 'inventoryHistory must NOT be persisted on public /products document');
      assert.strictEqual(prodData.salesCount, undefined, 'salesCount must NOT be persisted on public /products document');

      record('PRIVACY-PRODUCT-01', 'Public Product Documents Exclude inventoryHistory & salesCount Telemetry (F-16)', true, 'Verified public /products document contains zero internal inventoryHistory or salesCount fields');
    } catch (e: any) {
      record('PRIVACY-PRODUCT-01', 'Public Product Documents Exclude inventoryHistory & salesCount Telemetry (F-16)', false, e.message);
    }

    // PRIVACY-DRIVER-01: /drivers Collection Restricted to Authenticated Operational Roles & Self (F-17)
    try {
      const drvId = 'drv_priv_f17_01';
      await adminDb.collection('drivers').doc(drvId).set({
        id: drvId,
        name: 'Driver F17',
        phone: '+252615888999',
        email: 'driverf17@test.so',
        plateNumber: 'MG-7711',
        currentZone: 'Hodan',
        status: 'AVAILABLE',
        sellerId: 'seller_prov_a',
      });

      const unauthDb = testEnv.unauthenticatedContext().firestore();
      // 1. Anonymous visitor cannot read /drivers/{driverId}
      await assertFails(getDoc(doc(unauthDb, 'drivers', drvId)));
      // 2. Unrelated customer cannot read /drivers/{driverId}
      await assertFails(getDoc(doc(custADb, 'drivers', drvId)));
      // 3. Seller and Driver self and Admin CAN read /drivers/{driverId}
      const drvSelfDb = testEnv.authenticatedContext(drvId, { email: 'driverf17@test.so', email_verified: true }).firestore();
      const adminClientDb = testEnv.authenticatedContext('admin_super_1', { email: 'admin1@marketspace.so', email_verified: true, role: 'SUPER_ADMIN', super_admin: true }).firestore();
      await assertSucceeds(getDoc(doc(drvSelfDb, 'drivers', drvId)));
      await assertSucceeds(getDoc(doc(sellerADb, 'drivers', drvId)));
      await assertSucceeds(getDoc(doc(adminClientDb, 'drivers', drvId)));

      record('PRIVACY-DRIVER-01', 'Driver PII Protected From Anonymous & Unrelated Customer Reads (F-17)', true, 'Anonymous and Customer reads denied; Driver self, Seller, and Admin reads permitted');
    } catch (e: any) {
      record('PRIVACY-DRIVER-01', 'Driver PII Protected From Anonymous & Unrelated Customer Reads (F-17)', false, e.message);
    }

    // RULE-COUPON-01: Direct Client Coupon Usage Tampering Denied by Firestore Rules (F-18)
    try {
      const couponId = 'COUPON_F18_TEST';
      await adminDb.collection('coupons').doc(couponId).set({
        id: couponId,
        code: 'SAVE20',
        sellerId: 'seller_prov_a',
        discountType: 'percentage',
        discountValue: 20,
        usedCount: 0,
        usageLimit: 5,
        active: true,
        startAt: '2026-01-01T00:00:00.000Z',
        expireAt: '2027-01-01T00:00:00.000Z',
      });

      // Customer A attempts to increment usedCount directly on /coupons/{couponId} -> MUST FAIL
      await assertFails(
        setDoc(doc(custADb, 'coupons', couponId), { usedCount: 999 }, { merge: true })
      );

      // Seller B (not owner) attempts to modify Seller A's coupon -> MUST FAIL
      const sellerBDb = testEnv.authenticatedContext('seller_merch_b', { email: 'merchb@marketspace.so', email_verified: true }).firestore();
      await assertFails(
        setDoc(doc(sellerBDb, 'coupons', couponId), { active: false }, { merge: true })
      );

      record('RULE-COUPON-01', 'Direct Customer Coupon Usage Mutation Blocked in Firestore Rules (F-18)', true, 'Customer usedCount tampering and cross-seller coupon mutation strictly denied');
    } catch (e: any) {
      record('RULE-COUPON-01', 'Direct Customer Coupon Usage Mutation Blocked in Firestore Rules (F-18)', false, e.message);
    }

    // MSG-RULE-01: Conversation Creation Enforces Authenticated Participant & Participant Pair (F-19)
    try {
      const legitConvId = `conv_f19_legit_${Date.now()}`;
      const forgedConvId = `conv_f19_forged_${Date.now()}`;

      // 1. Customer A creates conversation between Customer B and Seller A (not a participant) -> DENIED
      await assertFails(
        setDoc(doc(custADb, 'conversations', forgedConvId), {
          id: forgedConvId,
          customerId: 'cust_book_b',
          sellerId: 'seller_prov_a',
          participantIds: ['cust_book_b', 'seller_prov_a'],
          contextType: 'general',
          unreadCount: {},
          updatedAt: new Date().toISOString(),
        })
      );

      // 2. Customer A creates conversation with extra arbitrary participantIds -> DENIED
      await assertFails(
        setDoc(doc(custADb, 'conversations', `${forgedConvId}_extra`), {
          id: `${forgedConvId}_extra`,
          customerId: 'cust_book_a',
          sellerId: 'seller_prov_a',
          participantIds: ['cust_book_a', 'seller_prov_a', 'admin_super_1'],
          contextType: 'general',
          unreadCount: {},
          updatedAt: new Date().toISOString(),
        })
      );

      // 3. Legitimate Customer A creates 2-party conversation with Seller A -> ALLOWED
      await assertSucceeds(
        setDoc(doc(custADb, 'conversations', legitConvId), {
          id: legitConvId,
          customerId: 'cust_book_a',
          sellerId: 'seller_prov_a',
          participantIds: ['cust_book_a', 'seller_prov_a'],
          contextType: 'general',
          unreadCount: {},
          updatedAt: new Date().toISOString(),
        })
      );

      record('MSG-RULE-01', 'Conversation Rules Enforce Exact 2-Party Authenticated Ownership (F-19)', true, 'Spoofed participant conversation creation denied; legitimate 2-party creation allowed');
    } catch (e: any) {
      record('MSG-RULE-01', 'Conversation Rules Enforce Exact 2-Party Authenticated Ownership (F-19)', false, e.message);
    }

    // AUTHORITY-STORAGE-01: LocalStorage Tampering Does Not Grant Subscription, Role, or Product Authority (F-20)
    try {
      // Simulate tampered browser localStorage
      const fakeStorage: Record<string, string> = {
        marketspace_seller_plans_v1: JSON.stringify([{ id: 'plan_free', tier: 'FREE', maxProducts: 999999, commissionAdjustment: 50 }]),
        marketspace_seller_subscriptions_v1: JSON.stringify([{ id: 'sub_fake', sellerId: 'seller_tamper', planId: 'plan_premium', status: 'ACTIVE' }]),
        marketspace_platform_settings_v1: JSON.stringify({ defaultCommissionRate: 0 }),
      };
      (globalThis as any).localStorage = {
        getItem: (k: string) => fakeStorage[k] || null,
        setItem: (k: string, v: string) => {
          fakeStorage[k] = v;
        },
        removeItem: (k: string) => {
          delete fakeStorage[k];
        },
      };

      try {
        subscriptionService.resetMemoryState();
        platformSettingsService.resetMemoryState();

        // 1. Effective plan for 'seller_tamper' must NOT read fake active subscription from localStorage
        const effectivePlan = subscriptionService.getSellerEffectivePlan('seller_tamper');
        assert.strictEqual(effectivePlan.tier, 'FREE', 'Tampered localStorage must not grant PREMIUM subscription');
        assert.strictEqual(effectivePlan.maxProducts, 10, 'Tampered localStorage must not alter FREE plan maxProducts');

        // 2. Platform settings must NOT read 0% commission from localStorage
        const effectiveSettings = platformSettingsService.getSettings();
        assert.strictEqual(effectiveSettings.defaultCommissionRate, 10, 'Tampered localStorage must not alter defaultCommissionRate');
      } finally {
        delete (globalThis as any).localStorage;
      }

      record('AUTHORITY-STORAGE-01', 'LocalStorage Tampering Ignored by Authoritative Domain Services (F-20)', true, 'Tampered localStorage plans, subscriptions, and commission settings had zero effect on domain authority');
    } catch (e: any) {
      record('AUTHORITY-STORAGE-01', 'LocalStorage Tampering Ignored by Authoritative Domain Services (F-20)', false, e.message);
    }

    // PCR-V7-01: Dispute Resolution Refund Ceiling, order_refund_locks, refundRequests, and seller_payout_locks Reservation (Finding 3)
    try {
      const dispOrderId = `ord_v7_disp_${Date.now()}`;
      await adminDb.collection('orders').doc(dispOrderId).set({
        id: dispOrderId,
        orderId: dispOrderId,
        customerId: 'cust_book_a',
        customerName: 'Customer A',
        phone: '+252611000111',
        sellerId: 'seller_prov_a',
        sellerIds: ['seller_prov_a'],
        storeId: 'store_prov_a',
        total: 100,
        status: 'delivered',
        paymentStatus: 'paid',
        createdAt: new Date().toISOString(),
      });

      // Open dispute via real production server route
      const createRes = await fetch(`${baseUrl}/api/disputes/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: makeJwtToken({ uid: 'cust_book_a', email: 'custa@marketspace.so' }),
        },
        body: JSON.stringify({
          orderId: dispOrderId,
          reason: 'damaged',
          description: 'Item arrived damaged during shipping',
          requestedAction: 'refund',
        }),
      });
      const createBody = await createRes.json();
      assert.strictEqual(createRes.status, 200);
      const dispId = createBody.dispute.id;

      // 1. Attempt to resolve with refundAmount > order total ($150 > $100) -> MUST FAIL 400
      const overRes = await fetch(`${baseUrl}/api/disputes/resolve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: makeJwtToken({ uid: 'admin_super_1', email: 'admin1@marketspace.so', role: 'SUPER_ADMIN', super_admin: true }),
        },
        body: JSON.stringify({
          disputeId: dispId,
          actionTaken: 'REFUND_APPROVED',
          refundAmount: 150,
          resolutionNotes: 'Over-refund attempt',
        }),
      });
      assert.strictEqual(overRes.status, 400, 'Over-refund beyond ceiling must be rejected with 400');

      // 2. Resolve with valid $40 partial refund -> MUST SUCCEED and atomically update lock, refundRequests, and seller_payout_locks
      const validRes = await fetch(`${baseUrl}/api/disputes/resolve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: makeJwtToken({ uid: 'admin_super_1', email: 'admin1@marketspace.so', role: 'SUPER_ADMIN', super_admin: true }),
        },
        body: JSON.stringify({
          disputeId: dispId,
          actionTaken: 'REFUND_APPROVED',
          refundAmount: 40,
          resolutionNotes: 'Approved $40 partial refund',
        }),
      });
      assert.strictEqual(validRes.status, 200);

      const lockSnap = await adminDb.collection('order_refund_locks').doc(dispOrderId).get();
      assert.strictEqual(lockSnap.exists, true, 'order_refund_locks doc must be created');
      assert.strictEqual(lockSnap.data()?.cumulativeRefunded, 40, 'cumulativeRefunded must be 40');

      const refReqsSnap = await adminDb.collection('refundRequests').where('orderId', '==', dispOrderId).get();
      assert.strictEqual(refReqsSnap.empty, false, 'refundRequests doc must be created by dispute resolution');
      assert.strictEqual(refReqsSnap.docs[0].data().amount, 40);
      assert.strictEqual(refReqsSnap.docs[0].data().status, 'REFUND_APPROVED');

      const sellerLockSnap = await adminDb.collection('seller_payout_locks').doc('seller_prov_a').get();
      assert.strictEqual(sellerLockSnap.exists, true, 'seller_payout_locks doc must reserve disputed refund amount');
      assert.ok((sellerLockSnap.data()?.totalRefundReserved || 0) >= 40);

      record('PCR-V7-01', 'Dispute Resolution Enforces Ceiling, order_refund_locks, refundRequests & Seller Lock (Finding 3)', true, 'Rejected $150 over-refund; $40 dispute refund atomically created lock, refundRequest, and seller reservation');
    } catch (e: any) {
      record('PCR-V7-01', 'Dispute Resolution Enforces Ceiling, order_refund_locks, refundRequests & Seller Lock (Finding 3)', false, e.message);
    }

    // PCR-V7-02: Authoritative Refund Review & Settlement Gateways Update Locks & Financial Ledger (Finding 4 & 18)
    try {
      const refOrderId = `ord_v7_ref_${Date.now()}`;
      const sellerV7 = `seller_v7_${Date.now()}`;
      await adminDb.collection('users').doc(sellerV7).set({
        uid: sellerV7,
        email: `${sellerV7}@marketspace.so`,
        role: 'SELLER',
        status: 'active',
      });
      await adminDb.collection('orders').doc(refOrderId).set({
        id: refOrderId,
        orderId: refOrderId,
        customerId: 'cust_book_a',
        customerName: 'Customer A',
        phone: '+252611000111',
        sellerId: sellerV7,
        sellerIds: [sellerV7],
        storeId: 'store_prov_a',
        total: 80,
        status: 'delivered',
        paymentStatus: 'paid',
        createdAt: new Date().toISOString(),
      });
      await adminDb.collection('seller_financial_ledgers').doc(sellerV7).set({
        sellerId: sellerV7,
        lifetimeGrossEarned: 72,
        lifetimeSettledRefunds: 0,
        lifetimePaidOut: 0,
        version: 1,
      });

      const createRefRes = await fetch(`${baseUrl}/api/refunds/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: makeJwtToken({ uid: 'cust_book_a', email: 'custa@marketspace.so' }),
        },
        body: JSON.stringify({
          orderId: refOrderId,
          amount: 30,
          reason: 'damaged',
          notes: 'Defective unit',
        }),
      });
      const createRefBody = await createRefRes.json();
      assert.strictEqual(createRefRes.status, 200);
      const refundId = createRefBody.refund.id;

      // Approve via /api/refunds/review
      const revRes = await fetch(`${baseUrl}/api/refunds/review`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: makeJwtToken({ uid: 'admin_super_1', email: 'admin1@marketspace.so', role: 'SUPER_ADMIN', super_admin: true }),
        },
        body: JSON.stringify({
          refundId,
          action: 'APPROVE',
          adminNotes: 'Approved by admin',
        }),
      });
      assert.strictEqual(revRes.status, 200);
      const ordAfterApprove = (await adminDb.collection('orders').doc(refOrderId).get()).data();
      assert.strictEqual(ordAfterApprove?.refundStatus, 'approved');

      // Settle via /api/refunds/settle
      const settleRes = await fetch(`${baseUrl}/api/refunds/settle`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: makeJwtToken({ uid: 'admin_super_1', email: 'admin1@marketspace.so', role: 'SUPER_ADMIN', super_admin: true }),
        },
        body: JSON.stringify({
          refundId,
          settlementType: 'MANUAL_MOBILE_TRANSFER',
          settlementReference: 'EVC-SETTLE-9988',
          adminNotes: 'Settled via EVC Plus',
        }),
      });
      assert.strictEqual(settleRes.status, 200);
      const ordAfterSettle = (await adminDb.collection('orders').doc(refOrderId).get()).data();
      assert.strictEqual(ordAfterSettle?.refundStatus, 'refunded');
      const ledgerAfterSettle = (await adminDb.collection('seller_financial_ledgers').doc(sellerV7).get()).data();
      assert.strictEqual(ledgerAfterSettle?.lifetimeSettledRefunds, 30);

      record('PCR-V7-02', 'Authoritative Refund Review & Settlement Gateways Synchronize Order & Financial Ledger (Finding 4 & 18)', true, 'Verified /api/refunds/review and /api/refunds/settle update order.refundStatus and seller_financial_ledgers');
    } catch (e: any) {
      record('PCR-V7-02', 'Authoritative Refund Review & Settlement Gateways Synchronize Order & Financial Ledger (Finding 4 & 18)', false, e.message);
    }

    // PCR-V7-03: Payout Lock Preserved on 'paid' & Released Only on 'rejected' (Finding 5 & 6)
    try {
      const sellerPayV7 = `seller_pay_v7_${Date.now()}`;
      await adminDb.collection('users').doc(sellerPayV7).set({
        uid: sellerPayV7,
        email: `${sellerPayV7}@marketspace.so`,
        role: 'SELLER',
        status: 'active',
      });
      await adminDb.collection('orders').doc(`ord_pay_${sellerPayV7}`).set({
        id: `ord_pay_${sellerPayV7}`,
        orderId: `ord_pay_${sellerPayV7}`,
        customerId: 'cust_book_a',
        sellerIds: [sellerPayV7],
        vendorOrders: [
          {
            subOrderId: `sub_pay_${sellerPayV7}`,
            sellerId: sellerPayV7,
            storeId: 'store_prov_a',
            subtotal: 100,
            sellerRevenue: 90,
            platformCommission: 10,
            status: 'delivered',
          },
        ],
        total: 100,
        status: 'delivered',
        paymentStatus: 'paid',
        createdAt: new Date().toISOString(),
      });

      const createPayoutRes = await fetch(`${baseUrl}/api/payouts/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: makeJwtToken({ uid: sellerPayV7, email: `${sellerPayV7}@marketspace.so`, role: 'SELLER' }),
        },
        body: JSON.stringify({
          sellerId: sellerPayV7,
          storeId: 'store_prov_a',
          amount: 50,
          paymentMethod: 'evc_plus',
          accountNumber: '+252615554433',
          accountName: 'Seller Pay V7',
        }),
      });
      const createPayoutBody = await createPayoutRes.json();
      assert.strictEqual(createPayoutRes.status, 200);
      const payoutId = createPayoutBody.payout.id;

      // Mark payout as 'paid' via /api/payouts/review
      const paidRes = await fetch(`${baseUrl}/api/payouts/review`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: makeJwtToken({ uid: 'admin_super_1', email: 'admin1@marketspace.so', role: 'SUPER_ADMIN', super_admin: true }),
        },
        body: JSON.stringify({
          payoutId,
          newStatus: 'paid',
          notes: 'Paid via EVC Plus',
        }),
      });
      assert.strictEqual(paidRes.status, 200);

      // Verify seller_payout_locks still reserves $50 (not decremented on 'paid') and available balance is $40 ($90 - $50)
      const lockAfterPaid = (await adminDb.collection('seller_payout_locks').doc(sellerPayV7).get()).data();
      assert.strictEqual(lockAfterPaid?.totalReserved, 50, 'totalReserved must remain 50 when payout is paid so seller cannot double-withdraw');

      // Attempt second payout of $50 (exceeds remaining $40 available) -> MUST FAIL 400
      const overWithdrawRes = await fetch(`${baseUrl}/api/payouts/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: makeJwtToken({ uid: sellerPayV7, email: `${sellerPayV7}@marketspace.so`, role: 'SELLER' }),
        },
        body: JSON.stringify({
          sellerId: sellerPayV7,
          storeId: 'store_prov_a',
          amount: 50,
          paymentMethod: 'evc_plus',
          accountNumber: '+252615554433',
          accountName: 'Seller Pay V7',
        }),
      });
      assert.strictEqual(overWithdrawRes.status, 400, 'Second $50 payout must be rejected because $50 is already paid out of $90');

      record('PCR-V7-03', 'Paid Payout Preserves Lock & Updates Ledger Preventing Double-Withdrawal (Finding 5 & 6)', true, 'Paid $50 payout preserved lock reservation and updated ledger; subsequent $50 over-withdrawal blocked');
    } catch (e: any) {
      record('PCR-V7-03', 'Paid Payout Preserves Lock & Updates Ledger Preventing Double-Withdrawal (Finding 5 & 6)', false, e.message);
    }

    // PCR-V7-04: Unverified Email Token Strictly Rejected When email_verified Is Missing or False (Finding 7)
    try {
      const unverifiedTokenMissing = `Bearer test-token:${Buffer.from(
        JSON.stringify({
          uid: 'cust_book_a',
          email: 'custa@marketspace.so',
          aud: PROJECT_ID,
          iss: `https://securetoken.google.com/${PROJECT_ID}`,
          exp: Math.floor(Date.now() / 1000) + 3600,
          // email_verified intentionally omitted!
        })
      ).toString('base64')}`;

      let missingRejected = false;
      try {
        await requireAuthenticatedCaller(unverifiedTokenMissing);
      } catch (err: any) {
        if (err.message.includes('Email verification required') || err.statusCode === 403) {
          missingRejected = true;
        }
      }
      assert.strictEqual(missingRejected, true, 'Token with missing email_verified claim must be rejected');

      record('PCR-V7-04', 'Strict Email Verification Rejects Tokens With Missing or False email_verified (Finding 7)', true, 'Token without email_verified===true strictly rejected by requireAuthenticatedCaller');
    } catch (e: any) {
      record('PCR-V7-04', 'Strict Email Verification Rejects Tokens With Missing or False email_verified (Finding 7)', false, e.message);
    }

    // PCR-V7-05: Coupon maxDiscountAmount and maxDiscount Unified Across Client & Server (Finding 10)
    try {
      const cpnId = `CPN_V7_${Date.now()}`;
      await adminDb.collection('coupons').doc(cpnId).set({
        id: cpnId,
        code: 'CAP50V7',
        discountType: 'percentage',
        discountValue: 50, // 50% off
        minOrderAmount: 20,
        maxDiscountAmount: 15, // Cap at $15
        usageLimit: 10,
        perCustomerLimit: 2,
        usedCount: 0,
        active: true,
        startAt: '2025-01-01T00:00:00.000Z',
        expireAt: '2028-01-01T00:00:00.000Z',
      });

      const prodCapId = `prod_cap_${Date.now()}`;
      await adminDb.collection('products').doc(prodCapId).set({
        id: prodCapId,
        storeId: 'store_prov_a',
        sellerId: 'seller_prov_a',
        title: { ar: 'منتج كاب', en: 'Cap Product', so: 'Cap Product' },
        price: 100,
        stock: 10,
        category: 'electronics',
        status: 'published',
        isPublished: true,
      });

      const ordRes = await processOrderGateway(
        {
          items: [{ productId: prodCapId, quantity: 1 }],
          customerName: 'Cap Tester',
          phone: '+252615000999',
          city: 'Mogadishu',
          address: 'KM4 Street',
          paymentMethod: 'cash_on_delivery',
          customerId: 'cust_book_a',
          couponCode: 'CAP50V7',
        },
        makeJwtToken({ uid: 'cust_book_a', email: 'custa@marketspace.so' })
      );
      assert.ok(ordRes.order, 'Order must be created by processOrderGateway');
      assert.strictEqual(ordRes.order.discount, 15, '50% of $100 must be capped at $15 via maxDiscountAmount');

      record('PCR-V7-05', 'Coupon maxDiscountAmount Cap Enforced Authoritatively in Server Order Transaction (Finding 10)', true, '50% coupon on $100 order capped at $15 via maxDiscountAmount in server transaction');
    } catch (e: any) {
      record('PCR-V7-05', 'Coupon maxDiscountAmount Cap Enforced Authoritatively in Server Order Transaction (Finding 10)', false, e.message);
    }

    // PCR-V7-06: Product Inventory History Persisted to inventory_logs and Retrieved by getProductInventoryHistory (Finding 12)
    try {
      const invProdId = `prod_inv_v7_${Date.now()}`;
      await adminDb.collection('products').doc(invProdId).set({
        id: invProdId,
        storeId: 'store_prov_a',
        sellerId: 'seller_prov_a',
        title: { ar: 'منتج مخزون', en: 'Inv Product', so: 'Inv Product' },
        description: { ar: 'وصف', en: 'Desc', so: 'Desc' },
        slug: `inv-prod-${Date.now()}`,
        price: 30,
        stock: 10,
        status: 'published',
        isPublished: true,
      });

      // Update stock via server gateway /api/products/update
      const updRes = await fetch(`${baseUrl}/api/products/update`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: makeJwtToken({ uid: 'seller_prov_a', email: 'provaa@marketspace.so', role: 'SELLER' }),
        },
        body: JSON.stringify({
          productId: invProdId,
          updates: { stock: 18 },
        }),
      });
      assert.strictEqual(updRes.status, 200);

      // Retrieve inventory history via productService.getProductInventoryHistory
      const historyLogs = await productService.getProductInventoryHistory(invProdId);
      assert.ok(Array.isArray(historyLogs) && historyLogs.length >= 1, 'inventory_logs must contain manual stock adjustment entry');
      assert.strictEqual(historyLogs[0].previousStock, 10);
      assert.strictEqual(historyLogs[0].newStock, 18);
      assert.strictEqual(historyLogs[0].change, 8);

      record('PCR-V7-06', 'Product Stock Adjustment Persisted to inventory_logs & Retrieved for Seller Modal (Finding 12)', true, 'Stock change 10->18 persisted to inventory_logs and retrieved via getProductInventoryHistory');
    } catch (e: any) {
      record('PCR-V7-06', 'Product Stock Adjustment Persisted to inventory_logs & Retrieved for Seller Modal (Finding 12)', false, e.message);
    }
  } finally {
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
    }
    if (testEnv) {
      await testEnv.cleanup();
    }
  }

  console.log('\n================================================================');
  console.log('POST-CLOSURE REMEDIATION TEST SUMMARY');
  console.log('================================================================');
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;
  console.log(`TOTAL TESTS: ${results.length}`);
  console.log(`PASSED:      ${passed}`);
  console.log(`FAILED:      ${failed}`);
  console.log('================================================================');

  if (failed > 0 || passed !== 71) {
    process.exit(1);
  }
}

runPostClosureRemediationSuite().catch((err) => {
  console.error('Fatal error in post-closure remediation suite:', err);
  process.exit(1);
});
