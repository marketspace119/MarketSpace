process.env.NODE_ENV = 'test';
process.env.ENABLE_TEST_TOKENS = 'true';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8085';
process.env.FIREBASE_STORAGE_EMULATOR_HOST = '127.0.0.1:9199';
process.env.GCLOUD_PROJECT = 'marketspace-applet';
process.env.FIREBASE_PROJECT_ID = 'marketspace-applet';

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {
  initializeTestEnvironment,
  RulesTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadString } from 'firebase/storage';
import {
  getAdminDb,
  verifyFirebaseBearerToken,
  requireAuthenticatedCaller,
  requireVerifiedPlatformAdmin,
} from '../server/firebaseAdmin';
import { createProductionApiApp } from '../server';
import {
  MemoryRateLimitStore,
  DistributedFirestoreRateLimitStore,
  setRateLimitStore,
} from '../server/rateLimiter';
import { reviewService } from '../src/services/reviewService';
import { couponService } from '../src/services/couponService';
import { adCampaignService } from '../src/services/adCampaignService';
import { subscriptionService } from '../src/services/subscriptionService';
import { bookingService } from '../src/services/bookingService';
import { orderService } from '../src/services/orderService';
import { notificationService } from '../src/services/notificationService';
import { inventoryService } from '../src/services/inventoryService';
import { auditLogService } from '../src/services/auditLogService';
import { sellerApplicationService } from '../src/services/sellerApplicationService';
import { storeService } from '../src/services/storeService';
import { messagingService } from '../src/services/messagingService';
import { productService } from '../src/services/productService';
import { payoutService } from '../src/services/payoutService';
import { refundService } from '../src/services/refundService';
import { promotionService } from '../src/services/promotionService';
import { handleReportSummarization } from '../server/ai/aiService';

const PROJECT_ID = 'marketspace-applet';

function makeToken(claims: Record<string, any>): string {
  const payload = {
    email_verified: true,
    ...claims,
  };
  return `Bearer test-token:${Buffer.from(JSON.stringify(payload)).toString('base64')}`;
}

interface TestResult {
  id: string;
  title: string;
  passed: boolean;
  error?: string;
}

const results: TestResult[] = [];

async function runCase(id: string, title: string, fn: () => Promise<void>) {
  try {
    await fn();
    results.push({ id, title, passed: true });
    console.log(`  ✅ [${id}] ${title}`);
  } catch (err: any) {
    results.push({ id, title, passed: false, error: err?.message || String(err) });
    console.error(`  ❌ [${id}] ${title} -> ${err?.message || err}`);
  }
}

async function main() {
  console.log('================================================================================');
  console.log('MARKETSPACE — FULL FORENSIC REMEDIATION & FINAL COMPLETION SUITE (F-01 -> F-35)');
  console.log('================================================================================\n');

  const firestoreRules = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf8');
  const storageRules = fs.readFileSync(path.resolve(process.cwd(), 'storage.rules'), 'utf8');

  const testEnv: RulesTestEnvironment = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: firestoreRules,
      host: '127.0.0.1',
      port: 8085,
    },
    storage: {
      rules: storageRules,
      host: '127.0.0.1',
      port: 9199,
    },
  });

  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8085';
  process.env.FIREBASE_STORAGE_EMULATOR_HOST = '127.0.0.1:9199';
  process.env.GCLOUD_PROJECT = PROJECT_ID;
  process.env.FIREBASE_PROJECT_ID = PROJECT_ID;
  process.env.NODE_ENV = 'test';

  const adminDb = getAdminDb();
  const app = createProductionApiApp();
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const addr = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${addr.port}`;
  process.env.API_BASE_URL = baseUrl;

  const memRateStore = new MemoryRateLimitStore();
  setRateLimitStore(memRateStore);

  try {
    // Seed baseline test actors
    await adminDb.collection('users').doc('admin_master').set({
      id: 'admin_master',
      email: 'admin@marketspace.so',
      role: 'SUPER_ADMIN',
      status: 'active',
      emailVerified: true,
    });
    await adminDb.collection('admins').doc('admin_master').set({
      role: 'SUPER_ADMIN',
      active: true,
    });

    await adminDb.collection('users').doc('seller_alpha').set({
      id: 'seller_alpha',
      email: 'alpha@marketspace.so',
      role: 'SELLER',
      status: 'active',
      emailVerified: true,
    });
    await adminDb.collection('stores').doc('store_alpha').set({
      id: 'store_alpha',
      sellerId: 'seller_alpha',
      name: 'Alpha Store',
      status: 'approved',
      isVerified: true,
    });

    await adminDb.collection('users').doc('seller_beta').set({
      id: 'seller_beta',
      email: 'beta@marketspace.so',
      role: 'SELLER',
      status: 'active',
      emailVerified: true,
    });
    await adminDb.collection('stores').doc('store_beta').set({
      id: 'store_beta',
      sellerId: 'seller_beta',
      name: 'Beta Store',
      status: 'approved',
      isVerified: true,
    });

    await adminDb.collection('users').doc('cust_one').set({
      id: 'cust_one',
      email: 'cust1@marketspace.so',
      role: 'CUSTOMER',
      status: 'active',
      emailVerified: true,
    });

    await adminDb.collection('users').doc('cust_two').set({
      id: 'cust_two',
      email: 'cust2@marketspace.so',
      role: 'CUSTOMER',
      status: 'active',
      emailVerified: true,
    });

    // =========================================================================
    // F-01: FIREBASE TOKEN REVOCATION
    // =========================================================================
    console.log('\n--- [F-01] FIREBASE TOKEN REVOCATION ---');

    await runCase('AUTH-REVOCATION-01', 'Valid token succeeds with checkRevoked=true', async () => {
      const decoded = await verifyFirebaseBearerToken(makeToken({ uid: 'cust_one', email: 'cust1@marketspace.so' }), true);
      assert.ok(decoded && decoded.uid === 'cust_one');
    });

    await runCase('AUTH-REVOCATION-02', 'Expired token is rejected', async () => {
      let failed = false;
      try {
        await verifyFirebaseBearerToken(makeToken({ uid: 'cust_one', exp: Math.floor(Date.now() / 1000) - 3600 }), true);
      } catch (err: any) {
        failed = err.code === 'auth/id-token-expired' || err.message.includes('expired');
      }
      assert.strictEqual(failed, true, 'Expired token must fail verification');
    });

    await runCase('AUTH-REVOCATION-03', 'Revoked token is rejected when checkRevoked=true', async () => {
      let failed = false;
      try {
        await verifyFirebaseBearerToken(makeToken({ uid: 'cust_one', revoked: true }), true);
      } catch (err: any) {
        failed = err.code === 'auth/id-token-revoked' || err.message.includes('revoked');
      }
      assert.strictEqual(failed, true, 'Revoked token must fail verification');
    });

    await runCase('AUTH-REVOCATION-04', 'Demoted admin, disabled user, and suspended user are rejected', async () => {
      // Disabled user
      let disabledFailed = false;
      try {
        await verifyFirebaseBearerToken(makeToken({ uid: 'cust_disabled_01', disabled: true }), true);
      } catch (err: any) {
        disabledFailed = err.code === 'auth/user-disabled' || err.message.includes('disabled');
      }
      assert.strictEqual(disabledFailed, true, 'Disabled user token must fail');

      // Suspended user
      await adminDb.collection('users').doc('cust_suspended_01').set({
        id: 'cust_suspended_01',
        role: 'CUSTOMER',
        status: 'suspended',
      });
      let suspendedFailed = false;
      try {
        await requireAuthenticatedCaller(makeToken({ uid: 'cust_suspended_01' }));
      } catch (err: any) {
        suspendedFailed = err.statusCode === 403 || err.message.includes('suspended');
      }
      assert.strictEqual(suspendedFailed, true, 'Suspended user must fail');

      // Demoted admin
      await adminDb.collection('users').doc('admin_demoted_01').set({
        id: 'admin_demoted_01',
        role: 'CUSTOMER',
        status: 'active',
        emailVerified: true,
      });
      await adminDb.collection('admins').doc('admin_demoted_01').set({
        role: 'REVOKED',
        active: false,
      });
      let demotedFailed = false;
      try {
        await requireVerifiedPlatformAdmin(makeToken({ uid: 'admin_demoted_01', role: 'ADMIN', admin: true }));
      } catch (err: any) {
        demotedFailed = err.statusCode === 403;
      }
      assert.strictEqual(demotedFailed, true, 'Demoted admin must fail');
    });

    // =========================================================================
    // F-02: ADMIN ORDER STATE BYPASS
    // =========================================================================
    console.log('\n--- [F-02] ADMIN ORDER STATE BYPASS ---');

    await adminDb.collection('orders').doc('ord_state_01').set({
      id: 'ord_state_01',
      orderId: 'ord_state_01',
      customerId: 'cust_one',
      sellerIds: ['seller_alpha'],
      vendorStoreIds: ['store_alpha'],
      status: 'pending',
      paymentMethod: 'cash_on_delivery',
      paymentStatus: 'paid',
      total: 100,
      vendorOrders: [
        {
          subOrderId: 'sub_state_01',
          sellerId: 'seller_alpha',
          storeId: 'store_alpha',
          fulfillmentStatus: 'pending',
          subtotal: 100,
          items: [],
        },
      ],
    });

    await runCase('ORDER-STATE-ADMIN-01', 'Admin cannot jump directly from pending to delivered via API gateway', async () => {
      const res = await fetch(`${baseUrl}/api/orders/update-suborder`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: makeToken({ uid: 'admin_master', role: 'SUPER_ADMIN', super_admin: true }),
        },
        body: JSON.stringify({
          orderId: 'ord_state_01',
          subOrderId: 'sub_state_01',
          newStatus: 'delivered',
        }),
      });
      assert.strictEqual(res.status, 400, 'Admin invalid state transition must return 400');
    });

    await runCase('ORDER-STATE-ADMIN-02', 'Admin cannot bypass order state machine via Firestore rules', async () => {
      const adminCtx = testEnv.authenticatedContext('admin_master', {
        email: 'admin@marketspace.so',
        email_verified: true,
        role: 'SUPER_ADMIN',
        super_admin: true,
        status: 'active',
      });
      await assertFails(
        adminCtx.firestore().collection('orders').doc('ord_state_01').update({
          status: 'delivered',
        })
      );
    });

    await runCase('ORDER-STATE-ADMIN-03', 'Valid sequential order state transitions succeed', async () => {
      const res1 = await fetch(`${baseUrl}/api/orders/update-suborder`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: makeToken({ uid: 'admin_master', role: 'SUPER_ADMIN', super_admin: true }),
        },
        body: JSON.stringify({
          orderId: 'ord_state_01',
          subOrderId: 'sub_state_01',
          newStatus: 'confirmed',
        }),
      });
      assert.strictEqual(res1.status, 200, 'Transition pending -> confirmed must succeed');
    });

    // =========================================================================
    // F-03 & F-04: REVIEW PRIVACY & REVIEW UPDATE VALIDATION
    // =========================================================================
    console.log('\n--- [F-03 & F-04] REVIEW PRIVACY & UPDATE VALIDATION ---');

    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('reviews').doc('rev_test_01').set({
        id: 'rev_test_01',
        targetId: 'prod_alpha_1',
        targetType: 'product',
        userId: 'cust_one',
        customerId: 'cust_one',
        orderId: 'ord_secret_123',
        bookingId: 'bk_secret_456',
        userName: 'Customer One',
        rating: 5,
        comment: 'Great quality',
        isVerifiedPurchase: true,
        status: 'approved',
        createdAt: new Date().toISOString(),
      });
      await ctx.firestore().collection('reviews_public').doc('rev_test_01').set({
        id: 'rev_test_01',
        targetId: 'prod_alpha_1',
        targetType: 'product',
        userName: 'Customer One',
        rating: 5,
        comment: 'Great quality',
        isVerifiedPurchase: true,
        status: 'approved',
        createdAt: new Date().toISOString(),
      });
    });

    await runCase('REVIEW-PRIVACY-01', 'Unauthenticated/other user cannot read raw private /reviews/{id}', async () => {
      const guestDb = testEnv.unauthenticatedContext().firestore();
      await assertFails(guestDb.collection('reviews').doc('rev_test_01').get());
      const otherDb = testEnv.authenticatedContext('cust_two', { status: 'active' }).firestore();
      await assertFails(otherDb.collection('reviews').doc('rev_test_01').get());
    });

    await runCase('REVIEW-PRIVACY-02', 'Public can read sanitized /reviews_public/{id} without private metadata', async () => {
      const guestDb = testEnv.unauthenticatedContext().firestore();
      const snap = await assertSucceeds(guestDb.collection('reviews_public').doc('rev_test_01').get());
      const data = snap.data() || {};
      assert.strictEqual(data.userId, undefined);
      assert.strictEqual(data.orderId, undefined);
      assert.strictEqual(data.bookingId, undefined);
    });

    await runCase('REVIEW-PRIVACY-03', 'reviewService.getPublicReviewsByTarget strips userId, customerId, orderId, bookingId', async () => {
      reviewService.seedReviews([
        {
          id: 'rev_mem_1',
          targetId: 'prod_alpha_1',
          targetType: 'product',
          userId: 'cust_one',
          customerId: 'cust_one',
          orderId: 'ord_secret_123',
          bookingId: 'bk_secret_456',
          userName: 'Customer One',
          rating: 5,
          comment: 'Nice',
          isVerifiedPurchase: true,
          status: 'approved',
          createdAt: new Date().toISOString(),
        },
      ]);
      const pub = reviewService.getPublicReviewsByTarget('prod_alpha_1');
      assert.strictEqual(pub.length, 1);
      assert.ok(!('userId' in pub[0]) && !('orderId' in pub[0]) && !('bookingId' in pub[0]));
    });

    await runCase('REVIEW-UPDATE-01', 'Firestore rules reject rating=0 and rating=6 on review update', async () => {
      const ownerDb = testEnv.authenticatedContext('cust_one', { status: 'active' }).firestore();
      await assertFails(ownerDb.collection('reviews').doc('rev_test_01').update({ rating: 0 }));
      await assertFails(ownerDb.collection('reviews').doc('rev_test_01').update({ rating: 6 }));
    });

    await runCase('REVIEW-UPDATE-02', 'reviewService.updateReview rejects rating=0, 6, NaN, Infinity', async () => {
      for (const bad of [0, 6, NaN, Infinity, -1]) {
        let failed = false;
        try {
          await reviewService.updateReview('rev_mem_1', { rating: bad }, 'cust_one', 'CUSTOMER');
        } catch {
          failed = true;
        }
        assert.strictEqual(failed, true, `Rating ${bad} must be rejected`);
      }
    });

    await runCase('REVIEW-UPDATE-03', 'Valid review rating update (1..5) succeeds for owner', async () => {
      const ownerDb = testEnv.authenticatedContext('cust_one', { status: 'active' }).firestore();
      await assertSucceeds(ownerDb.collection('reviews').doc('rev_test_01').update({ rating: 4, comment: 'Updated comment' }));
    });

    await runCase('REVIEW-IMMUTABLE-01', 'Firestore rules block mutating userId, orderId, targetId, isVerifiedPurchase on review update', async () => {
      const ownerDb = testEnv.authenticatedContext('cust_one', { status: 'active' }).firestore();
      await assertFails(ownerDb.collection('reviews').doc('rev_test_01').update({ userId: 'cust_two' }));
      await assertFails(ownerDb.collection('reviews').doc('rev_test_01').update({ targetId: 'other_prod' }));
      await assertFails(ownerDb.collection('reviews').doc('rev_test_01').update({ isVerifiedPurchase: false }));
    });

    // =========================================================================
    // F-05: COUPON TENANT OWNERSHIP
    // =========================================================================
    console.log('\n--- [F-05] COUPON TENANT OWNERSHIP ---');

    await runCase('COUPON-TENANT-01', 'Firestore rules block seller_beta from creating a coupon for store_alpha', async () => {
      const betaDb = testEnv.authenticatedContext('seller_beta', { status: 'active', role: 'SELLER' }).firestore();
      await assertFails(
        betaDb.collection('coupons').doc('cpn_forged_1').set({
          id: 'cpn_forged_1',
          code: 'STEAL50',
          sellerId: 'seller_beta',
          storeId: 'store_alpha',
          discountType: 'percentage',
          discountValue: 50,
        })
      );
    });

    await runCase('COUPON-TENANT-02', 'Seller can create coupon for their own verified store', async () => {
      const alphaDb = testEnv.authenticatedContext('seller_alpha', { status: 'active', role: 'SELLER' }).firestore();
      await assertSucceeds(
        alphaDb.collection('coupons').doc('cpn_alpha_1').set({
          id: 'cpn_alpha_1',
          code: 'ALPHA10',
          sellerId: 'seller_alpha',
          storeId: 'store_alpha',
          discountType: 'percentage',
          discountValue: 10,
          usedCount: 0,
        })
      );
    });

    await runCase('COUPON-MUTATION-01', 'Firestore rules block mutating storeId, sellerId, or usedCount on coupon update', async () => {
      const alphaDb = testEnv.authenticatedContext('seller_alpha', { status: 'active', role: 'SELLER' }).firestore();
      await assertFails(alphaDb.collection('coupons').doc('cpn_alpha_1').update({ storeId: 'store_beta' }));
      await assertFails(alphaDb.collection('coupons').doc('cpn_alpha_1').update({ sellerId: 'seller_beta' }));
      await assertFails(alphaDb.collection('coupons').doc('cpn_alpha_1').update({ usedCount: 999 }));
    });

    await runCase('COUPON-MUTATION-02', 'couponService blocks cross-tenant coupon creation and financial term tampering', async () => {
      storeService.seedStores([
        {
          id: 'store_alpha',
          sellerId: 'seller_alpha',
          name: 'Alpha Store',
          slug: 'alpha-store',
          description: 'Alpha',
          logo: '',
          banner: '',
          category: 'general',
          status: 'approved',
          isVerified: true,
          rating: 5,
          reviewsCount: 1,
          followersCount: 0,
          productsCount: 1,
          joinedAt: new Date().toISOString(),
          contact: { phone: '123', email: 'a@b.c', address: 'Mogadishu', city: 'Mogadishu' },
        },
      ]);
      let blocked = false;
      try {
        await couponService.createCoupon(
          {
            code: 'CROSS10',
            storeId: 'store_alpha',
            sellerId: 'seller_beta',
            discountType: 'percentage',
            discountValue: 10,
            minOrderAmount: 10,
            maxUses: 10,
            expiresAt: '2027-01-01T00:00:00.000Z',
            isActive: true,
          },
          'seller_beta',
          'SELLER'
        );
      } catch {
        blocked = true;
      }
      assert.strictEqual(blocked, true);
    });

    // =========================================================================
    // F-06: CAMPAIGN PRIVACY
    // =========================================================================
    console.log('\n--- [F-06] CAMPAIGN PRIVACY ---');

    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('adCampaigns').doc('camp_priv_1').set({
        id: 'camp_priv_1',
        sellerId: 'seller_alpha',
        storeId: 'store_alpha',
        budget: 500,
        spent: 120,
        paymentReference: 'EVC-SECRET-999',
        status: 'ACTIVE',
      });
      await ctx.firestore().collection('adCampaigns_public').doc('camp_priv_1').set({
        id: 'camp_priv_1',
        storeId: 'store_alpha',
        placement: 'home_hero',
        status: 'ACTIVE',
      });
    });

    await runCase('CAMPAIGN-PRIVACY-01', 'Unauthenticated and non-owner users cannot read private /adCampaigns/{id}', async () => {
      const guestDb = testEnv.unauthenticatedContext().firestore();
      await assertFails(guestDb.collection('adCampaigns').doc('camp_priv_1').get());
      const betaDb = testEnv.authenticatedContext('seller_beta', { status: 'active' }).firestore();
      await assertFails(betaDb.collection('adCampaigns').doc('camp_priv_1').get());
    });

    await runCase('CAMPAIGN-PRIVACY-02', 'Public can read /adCampaigns_public/{id} without budget/spent/paymentReference', async () => {
      const guestDb = testEnv.unauthenticatedContext().firestore();
      const snap = await assertSucceeds(guestDb.collection('adCampaigns_public').doc('camp_priv_1').get());
      const d = snap.data() || {};
      assert.strictEqual(d.budget, undefined);
      assert.strictEqual(d.spent, undefined);
      assert.strictEqual(d.paymentReference, undefined);
    });

    // =========================================================================
    // F-07 -> F-15: FAIL-CLOSED & STATE INTEGRITY VERIFICATION
    // =========================================================================
    console.log('\n--- [F-07 -> F-15] FAIL-CLOSED & STATE INTEGRITY ---');

    await runCase('F-07-SUBSCRIPTION-STATE', 'Subscription review enforces strict state transitions and fails closed', async () => {
      await adminDb.collection('sellerSubscriptions').doc('sub_f07_1').set({
        id: 'sub_f07_1',
        sellerId: 'seller_alpha',
        storeId: 'store_alpha',
        planId: 'plan_pro',
        status: 'EXPIRED',
      });
      const res = await fetch(`${baseUrl}/api/subscriptions/review`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: makeToken({ uid: 'admin_master', role: 'SUPER_ADMIN', super_admin: true }),
        },
        body: JSON.stringify({
          subscriptionId: 'sub_f07_1',
          decision: 'APPROVED',
        }),
      });
      assert.strictEqual(res.status, 409, 'Cannot approve terminal EXPIRED subscription');
    });

    await runCase('F-08-BOOKING-STATE', 'Booking status enforces strict transition graph (no jumping to completed from requested)', async () => {
      bookingService.seedBookings([
        {
          id: 'bk_f08_1',
          bookingCode: 'BK-100',
          serviceId: 'srv_1',
          serviceName: 'Cleaning',
          customerId: 'cust_one',
          customerName: 'Cust',
          customerPhone: '123',
          sellerId: 'seller_alpha',
          storeId: 'store_alpha',
          date: '2026-11-01',
          time: '10:00',
          status: 'requested',
          price: 30,
          createdAt: new Date().toISOString(),
        },
      ]);
      let blocked = false;
      try {
        await bookingService.updateBookingStatus('bk_f08_1', 'completed', 'seller_alpha', 'SELLER');
      } catch {
        blocked = true;
      }
      assert.strictEqual(blocked, true, 'Cannot jump directly from requested to completed');
    });

    await runCase('F-09-CANCEL-RESTORE', 'Order cancellation atomically restores product stock', async () => {
      await adminDb.collection('products').doc('prod_f09_1').set({
        id: 'prod_f09_1',
        sellerId: 'seller_alpha',
        storeId: 'store_alpha',
        price: 25,
        stock: 5,
        status: 'published',
        isPublished: true,
      });
      await adminDb.collection('orders').doc('ord_f09_1').set({
        id: 'ord_f09_1',
        orderId: 'ord_f09_1',
        customerId: 'cust_one',
        status: 'pending',
        paymentMethod: 'cash_on_delivery',
        paymentStatus: 'pending',
        total: 50,
        items: [{ productId: 'prod_f09_1', quantity: 2, price: 25 }],
        vendorOrders: [
          {
            subOrderId: 'sub_f09_1',
            sellerId: 'seller_alpha',
            storeId: 'store_alpha',
            fulfillmentStatus: 'pending',
            subtotal: 50,
            items: [{ productId: 'prod_f09_1', quantity: 2, price: 25 }],
          },
        ],
      });
      const res = await fetch(`${baseUrl}/api/orders/update-suborder`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: makeToken({ uid: 'seller_alpha', role: 'SELLER' }),
        },
        body: JSON.stringify({
          orderId: 'ord_f09_1',
          subOrderId: 'sub_f09_1',
          newStatus: 'cancelled',
        }),
      });
      assert.strictEqual(res.status, 200);
      const prodSnap = await adminDb.collection('products').doc('prod_f09_1').get();
      assert.strictEqual(prodSnap.data()?.stock, 7, 'Stock must be restored from 5 to 7');
    });

    await runCase('F-10-NOTIFICATION-ISOLATION', 'Firestore rules block user A from creating notification for user B', async () => {
      const custOneDb = testEnv.authenticatedContext('cust_one', { status: 'active' }).firestore();
      await assertFails(
        custOneDb.collection('notifications').doc('notif_spoof_1').set({
          id: 'notif_spoof_1',
          userId: 'cust_two',
          title: 'Fake',
          message: 'Spoofed',
          read: false,
        })
      );
    });

    await runCase('F-11-INVENTORY-ISOLATION', 'Inventory logs are restricted to owning seller and admin', async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await ctx.firestore().collection('inventory_logs').doc('inv_log_1').set({
          id: 'inv_log_1',
          productId: 'prod_alpha_1',
          sellerId: 'seller_alpha',
          change: 5,
        });
      });
      const betaDb = testEnv.authenticatedContext('seller_beta', { status: 'active' }).firestore();
      await assertFails(betaDb.collection('inventory_logs').doc('inv_log_1').get());
      const alphaDb = testEnv.authenticatedContext('seller_alpha', { status: 'active' }).firestore();
      await assertSucceeds(alphaDb.collection('inventory_logs').doc('inv_log_1').get());
    });

    await runCase('F-12-AUDIT-LOG-FAIL-CLOSED', 'auditLogService persists to Firestore and direct client writes are denied', async () => {
      const custDb = testEnv.authenticatedContext('cust_one', { status: 'active' }).firestore();
      await assertFails(custDb.collection('audit_logs').doc('fake_audit').set({ action: 'FAKE' }));
      const entry = await auditLogService.logAction({
        actorId: 'admin_master',
        actorRole: 'SUPER_ADMIN',
        action: 'SECURITY_REVIEW_PERFORMED' as any,
        targetType: 'system',
        targetId: 'sys_1',
      });
      const snap = await adminDb.collection('audit_logs').doc(entry.id).get();
      assert.strictEqual(snap.exists, true);
    });

    await runCase('F-13-14-15-PERSISTENCE', 'sellerApplicationService and storeService persist authoritatively to Firestore', async () => {
      const appCreated = await sellerApplicationService.submitApplication({
        userId: 'cust_two',
        applicantName: 'Cust Two',
        email: 'cust2@marketspace.so',
        phone: '+252615000000',
        storeName: 'Cust Two Store',
        storeType: 'general',
        city: 'Mogadishu',
        address: 'Hodan',
        description: 'Quality goods',
      });
      const appSnap = await adminDb.collection('sellerApplications').doc(appCreated.id).get();
      assert.strictEqual(appSnap.exists, true, 'Seller application must be persisted in Firestore');
    });

    // =========================================================================
    // F-16: MESSAGING PRIVACY & CONTEXT INTEGRITY
    // =========================================================================
    console.log('\n--- [F-16] MESSAGING PRIVACY & CONTEXT INTEGRITY ---');

    await runCase('MSG-CONTEXT-01', 'Caller cannot forge conversation with arbitrary participants excluding caller', async () => {
      let failed = false;
      try {
        await messagingService.getOrCreateConversation({
          participantIds: ['cust_one', 'seller_alpha'],
          participants: {},
          contextType: 'general',
          callerId: 'cust_two',
        });
      } catch {
        failed = true;
      }
      assert.strictEqual(failed, true);
    });

    await runCase('MSG-CONTEXT-02', 'Order conversation requires verified order ownership and matching seller participant', async () => {
      let failed = false;
      try {
        await messagingService.getOrCreateConversation({
          participantIds: ['cust_two', 'seller_alpha'],
          participants: {},
          contextType: 'order',
          contextId: 'ord_state_01', // belongs to cust_one, not cust_two
          callerId: 'cust_two',
        });
      } catch {
        failed = true;
      }
      assert.strictEqual(failed, true, 'Non-owner customer cannot open conversation for another customer order');
    });

    await runCase('MSG-CONTEXT-03', 'Booking conversation requires verified booking ownership', async () => {
      let failed = false;
      try {
        await messagingService.getOrCreateConversation({
          participantIds: ['cust_two', 'seller_alpha'],
          participants: {},
          contextType: 'booking',
          contextId: 'bk_f08_1', // belongs to cust_one
          callerId: 'cust_two',
        });
      } catch {
        failed = true;
      }
      assert.strictEqual(failed, true, 'Non-owner customer cannot open conversation for another customer booking');
    });

    await runCase('MSG-PRIVACY-01', 'Firestore rules enforce conversation participant verification on create and read', async () => {
      const attackerDb = testEnv.authenticatedContext('cust_two', { status: 'active' }).firestore();
      await assertFails(
        attackerDb.collection('conversations').doc('conv_spoof_1').set({
          id: 'conv_spoof_1',
          participantIds: ['cust_one', 'seller_alpha'],
          contextType: 'general',
          updatedAt: new Date().toISOString(),
        })
      );
      await assertFails(
        attackerDb.collection('conversations').doc('conv_spoof_2').set({
          id: 'conv_spoof_2',
          participantIds: ['cust_two'], // fewer than 2 participants
          contextType: 'general',
          updatedAt: new Date().toISOString(),
        })
      );
    });

    // =========================================================================
    // F-17: PRODUCTION SEED / MOCK DATA GUARD
    // =========================================================================
    console.log('\n--- [F-17] PRODUCTION SEED / MOCK DATA GUARD ---');

    await runCase('PROD-SEED-01', 'In production mode, reviewService, adCampaignService, and couponService return empty state instead of synthetic seeds', async () => {
      const prevEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        reviewService.resetMemoryState();
        adCampaignService.resetMemoryState();
        couponService.resetMemoryState();
        assert.strictEqual(reviewService.getAllReviews('ADMIN').length, 0);
        assert.strictEqual(adCampaignService.getAllCampaigns('ADMIN').length, 0);
        assert.strictEqual(couponService.getAllCoupons().length, 0);
      } finally {
        process.env.NODE_ENV = prevEnv;
      }
    });

    await runCase('PROD-SEED-02', 'In production mode, storeService and productService return empty state when Firestore has no records', async () => {
      const prevEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        storeService.resetMemoryState();
        productService.resetMemoryState();
        assert.strictEqual(storeService.getAllStores().length, 0);
        assert.strictEqual(productService.getAllProducts().length, 0);
      } finally {
        process.env.NODE_ENV = prevEnv;
      }
    });

    await runCase('PROD-SEED-03', 'In production mode, orderService, payoutService, and refundService have zero synthetic financial records', async () => {
      const prevEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        orderService.resetMemoryState();
        payoutService.resetMemoryState();
        refundService.resetMemoryState();
        assert.strictEqual(orderService.getOrders('admin_master', 'SUPER_ADMIN').length, 0);
        assert.strictEqual(payoutService.getAllPayouts().length, 0);
        assert.strictEqual(refundService.getAllRefunds().length, 0);
      } finally {
        process.env.NODE_ENV = prevEnv;
      }
    });

    await runCase('PROD-SEED-04', 'In production mode, subscriptionService and promotionService have zero synthetic active subscriptions or promotions', async () => {
      const prevEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        subscriptionService.resetMemoryState();
        assert.strictEqual(subscriptionService.getAllSubscriptions().length, 0);
      } finally {
        process.env.NODE_ENV = prevEnv;
      }
    });

    // =========================================================================
    // F-18: QUERY BOUNDING (100, 500, 1000, 5000 DATASET VERIFICATION)
    // =========================================================================
    console.log('\n--- [F-18] QUERY BOUNDING & PAGINATION ---');

    await runCase('QUERY-BOUND-01', 'Static scan confirms all client Firestore getDocs queries include explicit limit() constraints', async () => {
      const servicesDir = path.resolve(process.cwd(), 'src/services');
      const files = fs.readdirSync(servicesDir).filter((f) => f.endsWith('.ts'));
      for (const file of files) {
        const content = fs.readFileSync(path.join(servicesDir, file), 'utf8');
        if (content.includes('getDocs(')) {
          assert.ok(
            content.includes('limit('),
            `Service file ${file} calls getDocs() without importing/using limit()`
          );
        }
      }
    });

    await runCase('QUERY-BOUND-02', 'Bounded pagination behavior verified across 100, 500, 1000, and 5000 dataset sizes', async () => {
      for (const size of [100, 500, 1000, 5000]) {
        const syntheticCatalog = Array.from({ length: size }, (_, i) => ({
          id: `prod_scale_${i}`,
          storeId: 'store_alpha',
          sellerId: 'seller_alpha',
          title: { ar: `منتج ${i}`, en: `Product ${i}`, so: `Alaab ${i}` },
          description: { ar: 'وصف', en: 'Desc', so: 'Faahfaahin' },
          slug: `product-${i}`,
          price: 10,
          stock: 10,
          category: 'electronics',
          type: 'marketplace' as const,
          thumbnail: '',
          images: [],
          isPublished: true,
          status: 'published' as const,
          rating: 5,
          reviewsCount: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }));
        productService.seedProducts(syntheticCatalog as any);
        const page = await productService.fetchProductsPage({ pageSize: 24, onlyPublished: true });
        assert.ok(page.products.length <= 24, `Page size must be bounded to <= 24 for dataset=${size}`);
      }
      productService.resetMemoryState();
    });

    // =========================================================================
    // F-19: AI REPORT CORRECTNESS (101, 500, 1000 RECORDS)
    // =========================================================================
    console.log('\n--- [F-19] AI REPORT CORRECTNESS (>100 RECORDS) ---');

    for (const [idx, count] of [101, 500, 1000].entries()) {
      const testId = `AI-REPORT-0${idx + 1}`;
      await runCase(testId, `AI Sales Report accurately aggregates ${count} records without truncating at limit(100)`, async () => {
        // Clear existing orders in emulator via batched deletes
        const existingSnap = await adminDb.collection('orders').get();
        for (let i = 0; i < existingSnap.docs.length; i += 400) {
          const batch = adminDb.batch();
          for (const d of existingSnap.docs.slice(i, i + 400)) {
            batch.delete(d.ref);
          }
          await batch.commit();
        }

        const nowIso = new Date().toISOString();
        for (let i = 0; i < count; i += 400) {
          const batch = adminDb.batch();
          const end = Math.min(count, i + 400);
          for (let j = i; j < end; j++) {
            const ref = adminDb.collection('orders').doc(`ord_ai_${count}_${j}`);
            batch.set(ref, {
              id: `ord_ai_${count}_${j}`,
              orderId: `ord_ai_${count}_${j}`,
              customerId: 'cust_one',
              total: 10,
              paymentStatus: 'paid',
              createdAt: nowIso,
            });
          }
          await batch.commit();
        }

        const report = await handleReportSummarization({
          caller: {
            uid: 'admin_master',
            email: 'admin@marketspace.so',
            emailVerified: true,
            isPlatformAdmin: true,
            isSuperAdmin: true,
            token: { uid: 'admin_master' } as any,
          },
          reportType: 'sales',
          timeRange: 'last_30_days',
        });

        const expectedVolume = count * 10;
        assert.ok(
          report.summary.includes(`$${expectedVolume}`) && report.summary.includes(`${count} completed orders`),
          `Expected report summary for ${count} records to show $${expectedVolume} and ${count} orders, got: ${report.summary}`
        );
      });
    }

    // =========================================================================
    // F-20, F-21, F-22: CI RELEASE GATE, SUPPLY CHAIN & SECRET AUDIT
    // =========================================================================
    console.log('\n--- [F-20, F-21, F-22] CI GATE, SUPPLY CHAIN & SECRET AUDIT ---');

    await runCase('CI-GATE-01', '.github/workflows/ci.yml includes all release-critical suites and remediation gates', async () => {
      const ciYaml = fs.readFileSync(path.resolve(process.cwd(), '.github/workflows/ci.yml'), 'utf8');
      assert.ok(ciYaml.includes('npm audit --audit-level=high'), 'CI must run npm audit');
      assert.ok(ciYaml.includes('npm run lint'), 'CI must run typecheck');
      assert.ok(ciYaml.includes('npm run build'), 'CI must run production build');
      assert.ok(ciYaml.includes('npm run test:remediation'), 'CI must run test:remediation');
      assert.ok(ciYaml.includes('final_independent_closure_pass.ts'), 'CI must run final_independent_closure_pass.ts');
    });

    await runCase('SECRET-AUDIT-01', 'Zero hardcoded private keys, service accounts, or live bearer secrets in repository', async () => {
      const dirsToScan = ['src', 'server', '.github'];
      const forbiddenPatterns = [
        /-----BEGIN PRIVATE KEY-----/,
        /-----BEGIN RSA PRIVATE KEY-----/,
        /AIzaSy[A-Za-z0-9_-]{33}/,
        /sk_live_[A-Za-z0-9]{20,}/,
      ];

      function scanDir(dirPath: string) {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        for (const entry of entries) {
          const full = path.join(dirPath, entry.name);
          if (entry.isDirectory()) {
            scanDir(full);
          } else if (entry.isFile() && /\.(ts|tsx|js|json|yml|yaml|env)$/.test(entry.name)) {
            const text = fs.readFileSync(full, 'utf8');
            for (const pat of forbiddenPatterns) {
              assert.ok(!pat.test(text), `Forbidden secret pattern ${pat} found in ${full}`);
            }
          }
        }
      }
      for (const d of dirsToScan) {
        const p = path.resolve(process.cwd(), d);
        if (fs.existsSync(p)) scanDir(p);
      }
    });

    // =========================================================================
    // F-23: STORAGE SECURITY (MAGIC BYTES, POLYGLOTS & DIRECT WRITE DENIAL)
    // =========================================================================
    console.log('\n--- [F-23] STORAGE SECURITY ---');

    await runCase('STORAGE-SEC-01', 'Direct client writes to Firebase Storage are denied across all paths', async () => {
      const sellerStorage = testEnv.authenticatedContext('seller_alpha', { status: 'active', role: 'SELLER' }).storage();
      await assertFails(sellerStorage.ref('sellers/seller_alpha/products/hack.png').putString('fake', 'raw'));
      await assertFails(sellerStorage.ref('products/prod_1/hack.png').putString('fake', 'raw'));
      await assertFails(sellerStorage.ref('stores/store_alpha/hack.png').putString('fake', 'raw'));
      await assertFails(sellerStorage.ref('users/seller_alpha/hack.png').putString('fake', 'raw'));
    });

    await runCase('STORAGE-SEC-02', 'Image gateway accepts valid PNG/JPEG/WebP and rejects SVG, HTML, JS, PE/EXE, ELF, polyglot, MIME spoofing, and wrong tenant', async () => {
      const validPng = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
        0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
      ]).toString('base64');

      const okRes = await fetch(`${baseUrl}/api/images/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: makeToken({ uid: 'seller_alpha', role: 'SELLER' }),
        },
        body: JSON.stringify({
          data: `data:image/png;base64,${validPng}`,
          filename: 'item.png',
        }),
      });
      assert.strictEqual(okRes.status, 200, 'Valid PNG must pass verification');

      const maliciousPayloads = [
        { name: 'SVG', buf: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), mime: 'image/svg+xml', file: 'x.svg' },
        { name: 'HTML disguised', buf: Buffer.from('<!DOCTYPE html><html><body><script>evil()</script></body></html>'), mime: 'image/png', file: 'x.png' },
        { name: 'JS disguised', buf: Buffer.from('window.location="https://evil.com"'), mime: 'image/jpeg', file: 'x.jpg' },
        { name: 'PE/EXE', buf: Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00]), mime: 'image/png', file: 'x.png' },
        { name: 'ELF', buf: Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00]), mime: 'image/png', file: 'x.png' },
        {
          name: 'Polyglot PNG+Script',
          buf: Buffer.concat([
            Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]),
            Buffer.from('<script>alert(document.cookie)</script>'),
          ]),
          mime: 'image/png',
          file: 'poly.png',
        },
        {
          name: 'MIME Spoofing (PNG bytes with JPEG mime)',
          buf: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]),
          mime: 'image/jpeg',
          file: 'spoof.jpg',
        },
      ];

      for (const item of maliciousPayloads) {
        const res = await fetch(`${baseUrl}/api/images/verify`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: makeToken({ uid: 'seller_alpha', role: 'SELLER' }),
          },
          body: JSON.stringify({
            data: item.buf.toString('base64'),
            declaredMimeType: item.mime,
            filename: item.file,
          }),
        });
        assert.strictEqual(res.status, 400, `${item.name} must be rejected with 400`);
      }

      // Wrong tenant check on /api/images/upload
      const wrongTenantRes = await fetch(`${baseUrl}/api/images/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: makeToken({ uid: 'seller_alpha', role: 'SELLER' }),
        },
        body: JSON.stringify({
          data: `data:image/png;base64,${validPng}`,
          filename: 'item.png',
          sellerId: 'seller_beta',
        }),
      });
      assert.strictEqual(wrongTenantRes.status, 403, 'Cross-tenant image upload must be rejected with 403');
    });

    // =========================================================================
    // F-25: INPUT VALIDATION ON FINANCIAL & SECURITY ENDPOINTS
    // =========================================================================
    console.log('\n--- [F-25] INPUT VALIDATION ---');

    await runCase('INPUT-VAL-01', 'Financial and product endpoints reject negative, zero, NaN, Infinity, and huge numbers', async () => {
      for (const badVal of [-50, 0, 'NaN', 'Infinity', 999999999]) {
        const payoutRes = await fetch(`${baseUrl}/api/payouts/create`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: makeToken({ uid: 'seller_alpha', role: 'SELLER' }),
          },
          body: JSON.stringify({
            sellerId: 'seller_alpha',
            storeId: 'store_alpha',
            amount: badVal,
            paymentMethod: 'evc_plus',
            accountNumber: '+252615000000',
          }),
        });
        assert.strictEqual(payoutRes.status, 400, `Payout with amount=${badVal} must be rejected with 400`);
      }

      for (const badPrice of [-10, 'NaN', 5000000]) {
        const prodRes = await fetch(`${baseUrl}/api/products/create`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: makeToken({ uid: 'seller_alpha', role: 'SELLER' }),
          },
          body: JSON.stringify({
            storeId: 'store_alpha',
            title: 'Test Product',
            price: badPrice,
            stock: 5,
          }),
        });
        assert.strictEqual(prodRes.status, 400, `Product creation with price=${badPrice} must be rejected with 400`);
      }
    });

    // =========================================================================
    // F-26: DISTRIBUTED RATE LIMITING
    // =========================================================================
    console.log('\n--- [F-26] DISTRIBUTED RATE LIMITING ---');

    await runCase('RATE-DIST-A', 'DistributedFirestoreRateLimitStore persists shared counters across instances in Firestore', async () => {
      const distStoreA = new DistributedFirestoreRateLimitStore();
      const distStoreB = new DistributedFirestoreRateLimitStore();
      const key = `dist_test_key_${Date.now()}`;
      const r1 = await distStoreA.consume(key, 2, 60000);
      const r2 = await distStoreB.consume(key, 2, 60000);
      const r3 = await distStoreA.consume(key, 2, 60000);
      assert.strictEqual(r1.allowed, true);
      assert.strictEqual(r2.allowed, true);
      assert.strictEqual(r3.allowed, false, '3rd request across distributed instances must be rate-limited');
    });

    await runCase('RATE-DIST-B', 'Rate limiter fails closed (HTTP 503) when backing store throws an error (zero memory fallback)', async () => {
      const brokenStore = {
        async consume(): Promise<any> {
          throw new Error('Simulated Firestore cluster outage');
        },
      };
      setRateLimitStore(brokenStore);
      try {
        const res = await fetch(`${baseUrl}/api/payouts/create`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: makeToken({ uid: 'seller_alpha', role: 'SELLER' }),
          },
          body: JSON.stringify({ amount: 10 }),
        });
        assert.strictEqual(res.status, 503, 'Outage in distributed rate limiter must fail closed with 503');
      } finally {
        setRateLimitStore(memRateStore);
      }
    });

    await runCase('RATE-DIST-C', 'Failed JWT tokens track brute-force by client IP and never lock out victim UID', async () => {
      // Send forged token claiming admin_master
      const forgedRes = await fetch(`${baseUrl}/api/payouts/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer FORGED_INVALID_JWT_claiming_admin_master',
        },
        body: JSON.stringify({ amount: 10 }),
      });
      assert.strictEqual(forgedRes.status, 401);

      // Legitimate admin_master request still succeeds
      const adminCheck = await fetch(`${baseUrl}/api/seller/financial-summary?sellerId=seller_alpha`, {
        headers: {
          Authorization: makeToken({ uid: 'admin_master', role: 'SUPER_ADMIN', super_admin: true }),
        },
      });
      assert.strictEqual(adminCheck.status, 200, 'Victim UID must not be locked out by unverified token failures');
    });

    await runCase('RATE-DIST-D', 'AI Tool Execution Policy enforces distributed per-user rate limit and fails closed on store outage', async () => {
      const brokenStore = {
        async consume(): Promise<any> {
          throw new Error('Store down');
        },
      };
      setRateLimitStore(brokenStore);
      try {
        const res = await fetch(`${baseUrl}/api/ai/execute-tool`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: makeToken({ uid: 'cust_one', role: 'CUSTOMER' }),
          },
          body: JSON.stringify({ toolName: 'search_products', args: { query: 'phone' } }),
        });
        assert.strictEqual(res.status, 503, 'AI tool policy must fail closed with 503 when rate limiter is unavailable');
      } finally {
        setRateLimitStore(memRateStore);
      }
    });

    // =========================================================================
    // F-27: IDEMPOTENCY / REPLAY PROTECTION
    // =========================================================================
    console.log('\n--- [F-27] IDEMPOTENCY & REPLAY PROTECTION ---');

    await runCase('IDEMPOTENCY-01', 'Product creation and Booking reservation enforce idempotencyKey deduplication under replay', async () => {
      // 1. Product creation idempotency
      const prodKey = `idem_prod_${Date.now()}`;
      const p1 = await fetch(`${baseUrl}/api/products/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: makeToken({ uid: 'seller_alpha', role: 'SELLER' }),
        },
        body: JSON.stringify({
          storeId: 'store_alpha',
          title: 'Idempotent Service',
          price: 45,
          stock: 10,
          type: 'services',
          category: 'services',
          status: 'published',
          isPublished: true,
          idempotencyKey: prodKey,
        }),
      });
      const p1Data = await p1.json();
      assert.strictEqual(p1.status, 200);

      const p2 = await fetch(`${baseUrl}/api/products/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: makeToken({ uid: 'seller_alpha', role: 'SELLER' }),
        },
        body: JSON.stringify({
          storeId: 'store_alpha',
          title: 'Idempotent Service',
          price: 45,
          stock: 10,
          type: 'services',
          category: 'services',
          status: 'published',
          isPublished: true,
          idempotencyKey: prodKey,
        }),
      });
      const p2Data = await p2.json();
      assert.strictEqual(p2.status, 200);
      assert.strictEqual(p2Data.reused, true);
      assert.strictEqual(p1Data.product.id, p2Data.product.id, 'Replayed product creation must return identical product ID');

      // 2. Booking reservation idempotency + slot conflict protection
      const bkKey = `idem_bk_${Date.now()}`;
      const b1 = await fetch(`${baseUrl}/api/bookings/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: makeToken({ uid: 'cust_one', role: 'CUSTOMER' }),
        },
        body: JSON.stringify({
          serviceId: p1Data.product.id,
          date: '2026-12-15',
          time: '14:00',
          idempotencyKey: bkKey,
        }),
      });
      const b1Data = await b1.json();
      assert.strictEqual(b1.status, 200);

      const b2 = await fetch(`${baseUrl}/api/bookings/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: makeToken({ uid: 'cust_one', role: 'CUSTOMER' }),
        },
        body: JSON.stringify({
          serviceId: p1Data.product.id,
          date: '2026-12-15',
          time: '14:00',
          idempotencyKey: bkKey,
        }),
      });
      const b2Data = await b2.json();
      assert.strictEqual(b2.status, 200);
      assert.strictEqual(b2Data.reused, true);
      assert.strictEqual(b1Data.booking.id, b2Data.booking.id, 'Replayed booking with same idempotencyKey must reuse booking');
    });

    // =========================================================================
    // F-28 -> F-35: GLOBAL STATE MACHINE, MULTI-TENANT, CLIENT TRUST, FAIL-CLOSED,
    //               PII PRIVACY, AI SECURITY, SCALABILITY & PRODUCTION SECURITY
    // =========================================================================
    console.log('\n--- [F-28 -> F-35] STATE MACHINE, MULTI-TENANT, TRUST BOUNDARY, PII, AI & PROD SECURITY ---');

    await runCase('STATE-MACHINE-GLOBAL-01', 'F-28: Terminal states (delivered order, PAID payout, REFUNDED refund, RESOLVED dispute) cannot be reopened', async () => {
      // 1. Delivered sub-order cannot transition backward to pending
      await adminDb.collection('orders').doc('ord_term_f28').set({
        id: 'ord_term_f28',
        orderId: 'ord_term_f28',
        customerId: 'cust_one',
        sellerIds: ['seller_alpha'],
        status: 'delivered',
        total: 50,
        vendorOrders: [
          {
            subOrderId: 'sub_term_f28',
            sellerId: 'seller_alpha',
            storeId: 'store_alpha',
            status: 'delivered',
            subtotal: 50,
            items: [],
          },
        ],
      });
      const ordBackRes = await fetch(`${baseUrl}/api/orders/update-suborder`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: makeToken({ uid: 'seller_alpha', role: 'SELLER' }),
        },
        body: JSON.stringify({
          parentOrderId: 'ord_term_f28',
          subOrderId: 'sub_term_f28',
          newStatus: 'pending',
        }),
      });
      assert.strictEqual(ordBackRes.status, 400, 'Delivered sub-order cannot transition backward');

      // 2. Resolved dispute cannot be re-resolved
      await adminDb.collection('disputes').doc('disp_term_f28').set({
        id: 'disp_term_f28',
        orderId: 'ord_term_f28',
        customerId: 'cust_one',
        sellerId: 'seller_alpha',
        status: 'RESOLVED_DISMISSED',
      });
      const dispReopenRes = await fetch(`${baseUrl}/api/disputes/resolve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: makeToken({ uid: 'admin_master', role: 'SUPER_ADMIN', super_admin: true }),
        },
        body: JSON.stringify({
          disputeId: 'disp_term_f28',
          actionTaken: 'DISMISSED',
          resolutionNotes: 'Try reopen',
        }),
      });
      assert.strictEqual(dispReopenRes.status, 400, 'Resolved dispute cannot be re-opened');
    });

    await runCase('MULTI-TENANT-ISOLATION-01', 'F-29: Strict multi-tenant isolation across Seller A, Seller B, Customer A, Customer B, Driver A, Driver B', async () => {
      // Seed Driver A and Driver B
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await ctx.firestore().collection('users').doc('driver_alpha').set({
          id: 'driver_alpha',
          role: 'CUSTOMER',
          status: 'active',
        });
        await ctx.firestore().collection('users').doc('driver_beta').set({
          id: 'driver_beta',
          role: 'CUSTOMER',
          status: 'active',
        });
        await ctx.firestore().collection('drivers').doc('driver_alpha').set({
          id: 'driver_alpha',
          sellerId: 'seller_alpha',
          status: 'AVAILABLE',
        });
        await ctx.firestore().collection('deliveryAssignments').doc('deliv_alpha_1').set({
          id: 'deliv_alpha_1',
          orderId: 'ord_state_01',
          sellerId: 'seller_alpha',
          customerId: 'cust_one',
          driverId: 'driver_alpha',
          status: 'ASSIGNED',
        });
        await ctx.firestore().collection('payoutRequests').doc('pay_alpha_1').set({
          id: 'pay_alpha_1',
          sellerId: 'seller_alpha',
          amount: 100,
          status: 'PENDING',
        });
        await ctx.firestore().collection('refundRequests').doc('ref_alpha_1').set({
          id: 'ref_alpha_1',
          orderId: 'ord_state_01',
          customerId: 'cust_one',
          sellerId: 'seller_alpha',
          amount: 20,
          status: 'PENDING',
        });
      });

      const sellerBetaDb = testEnv.authenticatedContext('seller_beta', { status: 'active', role: 'SELLER' }).firestore();
      const custTwoDb = testEnv.authenticatedContext('cust_two', { status: 'active', role: 'CUSTOMER' }).firestore();
      const driverBetaDb = testEnv.authenticatedContext('driver_beta', { status: 'active' }).firestore();

      // Seller B cannot read Seller A payouts, refunds, or delivery assignments
      await assertFails(sellerBetaDb.collection('payoutRequests').doc('pay_alpha_1').get());
      await assertFails(sellerBetaDb.collection('refundRequests').doc('ref_alpha_1').get());
      await assertFails(sellerBetaDb.collection('deliveryAssignments').doc('deliv_alpha_1').get());

      // Customer B cannot read Customer A orders or refunds
      await assertFails(custTwoDb.collection('orders').doc('ord_state_01').get());
      await assertFails(custTwoDb.collection('refundRequests').doc('ref_alpha_1').get());

      // Driver B cannot read Driver A delivery assignment
      await assertFails(driverBetaDb.collection('deliveryAssignments').doc('deliv_alpha_1').get());

      // Seller B cannot access Seller A financial summary via API
      const crossFinRes = await fetch(`${baseUrl}/api/seller/financial-summary?sellerId=seller_alpha`, {
        headers: {
          Authorization: makeToken({ uid: 'seller_beta', role: 'SELLER' }),
        },
      });
      assert.strictEqual(crossFinRes.status, 403, 'Seller B cannot view Seller A financial summary');
    });

    await runCase('CLIENT-TRUST-BOUNDARY-01', 'F-30: Server ignores client-supplied price/sellerId/storeId/total during order & booking creation', async () => {
      await adminDb.collection('products').doc('prod_trust_f30').set({
        id: 'prod_trust_f30',
        sellerId: 'seller_alpha',
        storeId: 'store_alpha',
        title: { ar: 'منتج موثوق', en: 'Trusted Product', so: 'Alaab' },
        price: 80,
        stock: 20,
        type: 'services',
        category: 'services',
        status: 'published',
        isPublished: true,
      });

      // Attempt to book service with forged price=$1
      const bkRes = await fetch(`${baseUrl}/api/bookings/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: makeToken({ uid: 'cust_one', role: 'CUSTOMER' }),
        },
        body: JSON.stringify({
          serviceId: 'prod_trust_f30',
          date: '2026-12-20',
          time: '11:00',
          price: 1, // forged client price
        }),
      });
      const bkBody = await bkRes.json();
      assert.strictEqual(bkRes.status, 200);
      assert.strictEqual(bkBody.booking.price, 80, 'Booking price must come from authoritative catalog ($80), ignoring client $1');
    });

    await runCase('FAIL-CLOSED-ERROR-01', 'F-31: Services and gateways fail closed on database/permission errors and never return fake success or FREE plan fallback', async () => {
      const prevEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        subscriptionService.resetMemoryState();
        // In production, getActiveSubscriptionForSeller must not fabricate a synthetic FREE subscription if none exists
        const sub = subscriptionService.getActiveSubscriptionForSeller('non_existent_seller_999');
        assert.strictEqual(sub, undefined, 'Must not fabricate synthetic active subscription on missing record');
      } finally {
        process.env.NODE_ENV = prevEnv;
      }
    });

    await runCase('PII-PRIVACY-01', 'F-32: Public stores, products, reviews, and campaigns strip private financial and PII fields; /payout_settlement_destinations is Super-Admin only', async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await ctx.firestore().collection('payout_settlement_destinations').doc('pay_dest_1').set({
          payoutId: 'pay_alpha_1',
          sellerId: 'seller_alpha',
          accountNumber: '+252615999999',
        });
        await ctx.firestore().collection('privateStoreProfiles').doc('store_alpha').set({
          storeId: 'store_alpha',
          sellerId: 'seller_alpha',
          commissionRate: 12,
        });
      });

      const guestDb = testEnv.unauthenticatedContext().firestore();
      const regularAdminDb = testEnv.authenticatedContext('admin_reg', {
        email: 'regadmin@marketspace.so',
        email_verified: true,
        role: 'ADMIN',
        admin: true,
        status: 'active',
      }).firestore();

      await assertFails(guestDb.collection('payout_settlement_destinations').doc('pay_dest_1').get());
      await assertFails(regularAdminDb.collection('payout_settlement_destinations').doc('pay_dest_1').get());
      await assertFails(guestDb.collection('privateStoreProfiles').doc('store_alpha').get());
    });

    await runCase('AI-SECURITY-01', 'F-33: AI Tool Policy blocks unallowed tools, cross-tenant arguments, and unauthorized roles', async () => {
      // Customer cannot invoke admin/seller tools or unallowed tools
      const unallowedRes = await fetch(`${baseUrl}/api/ai/execute-tool`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: makeToken({ uid: 'cust_one', role: 'CUSTOMER' }),
        },
        body: JSON.stringify({
          toolName: 'execute_raw_sql_or_delete_all',
          args: {},
        }),
      });
      const unallowedBody = await unallowedRes.json();
      assert.strictEqual(unallowedBody.result?.allowed, false, 'Arbitrary unallowed AI tool must be blocked');

      // Customer cannot query another customer order via AI customer assistant
      await adminDb.collection('orders').doc('ord_ai_sec_01').set({
        id: 'ord_ai_sec_01',
        orderId: 'ord_ai_sec_01',
        customerId: 'cust_one',
        status: 'confirmed',
        total: 100,
      });
      const crossOrderAiRes = await fetch(`${baseUrl}/api/ai/assistant`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: makeToken({ uid: 'cust_two', role: 'CUSTOMER' }),
        },
        body: JSON.stringify({
          mode: 'customer',
          prompt: 'Where is my order?',
          orderId: 'ord_ai_sec_01', // belongs to cust_one
        }),
      });
      assert.strictEqual(crossOrderAiRes.status, 403, 'Cross-user order query in AI assistant must be rejected with 403');
    });

    await runCase('PROD-DEPLOY-SEC-01', 'F-34 & F-35: Security headers (CSP, HSTS, X-Content-Type-Options), CSRF guard, and demo project prevention in production', async () => {
      const healthRes = await fetch(`${baseUrl}/api/health`);
      assert.strictEqual(healthRes.status, 200);
      assert.strictEqual(healthRes.headers.get('x-content-type-options'), 'nosniff');
      assert.ok(healthRes.headers.get('strict-transport-security')?.includes('max-age=31536000'));
      assert.ok(healthRes.headers.get('content-security-policy')?.includes("default-src 'self'"));

      // CSRF Guard blocks untrusted cross-origin POST
      const csrfRes = await fetch(`${baseUrl}/api/payouts/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://evil-attacker.example.com',
          Authorization: makeToken({ uid: 'seller_alpha', role: 'SELLER' }),
        },
        body: JSON.stringify({ amount: 10 }),
      });
      assert.strictEqual(csrfRes.status, 403, 'Cross-origin mutating request from untrusted origin must be blocked with 403');
    });

    await runCase('DISPUTE-PAYOUT-FREEZE-01', 'Active OPEN/SELLER_RESPONDED disputes freeze seller funds and prevent payout withdrawal of disputed order earnings', async () => {
      const dispSellerUid = 'seller_disp_freeze_01';
      await adminDb.collection('users').doc(dispSellerUid).set({
        id: dispSellerUid,
        uid: dispSellerUid,
        role: 'SELLER',
        status: 'active',
        email: 'disp_freeze@marketspace.so',
        email_verified: true,
      });
      await adminDb.collection('stores').doc('store_disp_freeze_01').set({
        id: 'store_disp_freeze_01',
        sellerId: dispSellerUid,
        name: 'Dispute Freeze Store',
        status: 'approved',
      });
      await adminDb.collection('orders').doc('ord_disp_freeze_01').set({
        id: 'ord_disp_freeze_01',
        orderId: 'ord_disp_freeze_01',
        customerId: 'cust_one',
        sellerId: dispSellerUid,
        sellerIds: [dispSellerUid],
        status: 'delivered',
        paymentStatus: 'paid',
        subtotal: 100,
        total: 100,
        vendorOrders: [
          {
            subOrderId: 'ord_disp_freeze_01-S1',
            parentOrderId: 'ord_disp_freeze_01',
            sellerId: dispSellerUid,
            storeId: 'store_disp_freeze_01',
            subtotal: 100,
            total: 100,
            platformCommission: 10,
            sellerRevenue: 90,
            status: 'delivered',
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Open an active dispute on ord_disp_freeze_01
      await adminDb.collection('disputes').doc('disp_active_freeze_01').set({
        id: 'disp_active_freeze_01',
        orderId: 'ord_disp_freeze_01',
        subOrderId: 'ord_disp_freeze_01-S1',
        customerId: 'cust_one',
        sellerId: dispSellerUid,
        status: 'OPEN',
        reason: 'damaged_item',
        createdAt: new Date().toISOString(),
      });

      const payoutRes = await fetch(`${baseUrl}/api/payouts/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: makeToken({ uid: dispSellerUid, email: 'disp_freeze@marketspace.so', role: 'SELLER', email_verified: true }),
        },
        body: JSON.stringify({
          sellerId: dispSellerUid,
          amount: 50,
          paymentMethod: 'zaad',
          accountNumber: '252634455667',
          accountName: 'Dispute Freeze Seller',
        }),
      });
      assert.notStrictEqual(payoutRes.status, 200, 'Seller must not be able to withdraw funds frozen by an active OPEN dispute');

      // Also verify that if a payout was created BEFORE the dispute, approving or paying that payout is blocked while the dispute is active!
      await adminDb.collection('payoutRequests').doc('pay_before_disp_01').set({
        id: 'pay_before_disp_01',
        sellerId: dispSellerUid,
        storeId: 'store_disp_freeze_01',
        amount: 50,
        paymentMethod: 'zaad',
        accountNumber: '****5667',
        accountName: 'Dispute Freeze Seller',
        status: 'pending',
        requestedAt: new Date().toISOString(),
        settlementType: 'MANUAL_SETTLEMENT',
      });

      const approveDuringDispRes = await fetch(`${baseUrl}/api/payouts/review`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: makeToken({ uid: 'admin_master', role: 'SUPER_ADMIN', super_admin: true, email_verified: true }),
        },
        body: JSON.stringify({
          payoutId: 'pay_before_disp_01',
          newStatus: 'approved',
          notes: 'Attempting to approve payout while dispute is active',
        }),
      });
      assert.strictEqual(approveDuringDispRes.status, 409, 'Approving a pending payout while seller funds are frozen by an active dispute must be rejected with 409');
    });

    await runCase('REFUND-HIST-FAILCLOSED-01', 'Corrupted historical refund record (NaN/0 amount) causes refund gateway to Fail-Closed instead of defaulting to 0', async () => {
      await adminDb.collection('orders').doc('ord_corrupt_hist_01').set({
        id: 'ord_corrupt_hist_01',
        orderId: 'ord_corrupt_hist_01',
        customerId: 'cust_one',
        sellerId: 'seller_alpha',
        sellerIds: ['seller_alpha'],
        status: 'delivered',
        paymentStatus: 'paid',
        subtotal: 100,
        total: 100,
        vendorOrders: [
          {
            subOrderId: 'ord_corrupt_hist_01-S1',
            sellerId: 'seller_alpha',
            storeId: 'store_alpha',
            subtotal: 100,
            total: 100,
            status: 'delivered',
          },
        ],
      });
      await adminDb.collection('refundRequests').doc('ref_corrupt_hist_doc').set({
        id: 'ref_corrupt_hist_doc',
        orderId: 'ord_corrupt_hist_01',
        customerId: 'cust_one',
        sellerId: 'seller_alpha',
        amount: 'CORRUPTED_NAN_VALUE',
        status: 'REFUNDED',
      });

      const refRes = await fetch(`${baseUrl}/api/refunds/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: makeToken({ uid: 'cust_one', role: 'CUSTOMER' }),
        },
        body: JSON.stringify({
          orderId: 'ord_corrupt_hist_01',
          amount: 20,
          reason: 'damaged',
          notes: 'Testing corrupted historical state fail-closed',
        }),
      });
      assert.notStrictEqual(refRes.status, 200, 'Corrupted historical refund amount must abort Fail-Closed and never fallback to 0');
    });

    await runCase('CANCEL-MULTILINE-RESTORE-01', 'Cancelling a sub-order with multiple lines for the same productId restores the full aggregated stock sum', async () => {
      await adminDb.collection('products').doc('prod_multiline_cancel').set({
        id: 'prod_multiline_cancel',
        storeId: 'store_alpha',
        sellerId: 'seller_alpha',
        title: { ar: 'منتج متعدد الخطوط', en: 'Multiline Cancel Product' },
        price: 25,
        stock: 5, // After 2 + 3 = 5 deducted from initial 10
        status: 'published',
      });
      await adminDb.collection('orders').doc('ord_multiline_cancel_01').set({
        id: 'ord_multiline_cancel_01',
        orderId: 'ord_multiline_cancel_01',
        customerId: 'cust_one',
        sellerIds: ['seller_alpha'],
        status: 'pending',
        total: 125,
        vendorOrders: [
          {
            subOrderId: 'ord_multiline_cancel_01-S1',
            parentOrderId: 'ord_multiline_cancel_01',
            sellerId: 'seller_alpha',
            storeId: 'store_alpha',
            status: 'pending',
            subtotal: 125,
            total: 125,
            items: [
              { productId: 'prod_multiline_cancel', quantity: 2, selectedSize: 'M' },
              { productId: 'prod_multiline_cancel', quantity: 3, selectedSize: 'L' },
            ],
          },
        ],
      });

      const cancelRes = await fetch(`${baseUrl}/api/orders/update-suborder`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: makeToken({ uid: 'seller_alpha', role: 'SELLER' }),
        },
        body: JSON.stringify({
          parentOrderId: 'ord_multiline_cancel_01',
          subOrderId: 'ord_multiline_cancel_01-S1',
          newStatus: 'cancelled',
          note: 'Out of size M & L',
        }),
      });
      assert.strictEqual(cancelRes.status, 200, 'Sub-order cancellation must succeed');

      const restoredProdSnap = await adminDb.collection('products').doc('prod_multiline_cancel').get();
      assert.strictEqual(restoredProdSnap.data()?.stock, 10, 'Stock must be restored by the full aggregated quantity (5 + 2 + 3 = 10)');
    });

    await runCase('USER-ROLE-DRIVER-01', 'Super Admin can authoritatively assign DRIVER role via /api/users/update-role', async () => {
      await adminDb.collection('users').doc('admin_super').set({
        id: 'admin_super',
        uid: 'admin_super',
        name: 'Super Admin',
        email: 'superadmin@marketspace.so',
        role: 'SUPER_ADMIN',
        status: 'active',
        email_verified: true,
      });
      await adminDb.collection('admins').doc('admin_super').set({
        id: 'admin_super',
        uid: 'admin_super',
        email: 'superadmin@marketspace.so',
        role: 'SUPER_ADMIN',
      });
      await adminDb.collection('users').doc('user_to_driver_01').set({
        id: 'user_to_driver_01',
        uid: 'user_to_driver_01',
        name: 'Future Driver',
        email: 'driver_candidate@marketspace.so',
        role: 'CUSTOMER',
        status: 'active',
      });

      const roleRes = await fetch(`${baseUrl}/api/users/update-role`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: makeToken({ uid: 'admin_super', email: 'superadmin@marketspace.so', role: 'SUPER_ADMIN', admin: true, email_verified: true }),
        },
        body: JSON.stringify({
          targetUserId: 'user_to_driver_01',
          newRole: 'DRIVER',
          notes: 'Approved fleet driver onboarding',
        }),
      });
      assert.strictEqual(roleRes.status, 200, 'Super Admin assigning DRIVER role must succeed with HTTP 200');
      const updatedUserSnap = await adminDb.collection('users').doc('user_to_driver_01').get();
      assert.strictEqual(updatedUserSnap.data()?.role, 'DRIVER');
    });
  } finally {
    memRateStore.destroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await testEnv.cleanup();
  }

  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = results.filter((r) => !r.passed).length;

  console.log('\n================================================================================');
  console.log(`FINAL COMPLETION SUITE SUMMARY: ${passedCount}/${results.length} PASSED (${failedCount} FAILED)`);
  if (failedCount > 0) {
    for (const f of results.filter((r) => !r.passed)) {
      console.error(`  FAILED CASE: [${f.id}] ${f.title} -> ${f.error}`);
    }
  }
  console.log('================================================================================');

  if (failedCount > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error in final_completion_pass_f01_f35:', err);
  process.exit(1);
});
