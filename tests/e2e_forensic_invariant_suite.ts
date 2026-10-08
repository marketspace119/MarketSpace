process.env.NODE_ENV = 'test';
process.env.ENABLE_TEST_TOKENS = 'true';

import assert from 'assert';
import { processOrderCreationGateway } from '../server/orderGateway';
import {
  processPayoutGateway,
  processPayoutReviewGateway,
  calculateSellerFinancialSummary,
} from '../server/payoutGateway';
import { processSubscriptionReviewGateway } from '../server/subscriptionGateway';
import { getAdminDb, setAdminDbForTesting, VerifiedCaller } from '../server/firebaseAdmin';

interface TestResult {
  id: string;
  name: string;
  category: string;
  passed: boolean;
  error?: string;
  details?: string;
}

const results: TestResult[] = [];

function recordTest(res: TestResult) {
  results.push(res);
  const status = res.passed ? '[PASS]' : '[FAIL]';
  console.log(`${status} ${res.id}: ${res.name}`);
  if (res.details) {
    console.log(`  Details: ${res.details}`);
  }
  if (res.error) {
    console.log(`  Error:   ${res.error}`);
  }
}

// In-memory Firestore mock for rigorous isolated regression testing
class MockMemoryFirestore {
  private store: Map<string, Map<string, any>> = new Map();

  private getCol(name: string): Map<string, any> {
    if (!this.store.has(name)) {
      this.store.set(name, new Map());
    }
    return this.store.get(name)!;
  }

  collection(name: string) {
    const col = this.getCol(name);
    return {
      doc: (id: string) => {
        const docRef = {
          id,
          get: async () => {
            const data = col.get(id);
            return {
              exists: data !== undefined,
              id,
              data: () => (data ? JSON.parse(JSON.stringify(data)) : undefined),
            };
          },
          set: async (data: any, options?: { merge?: boolean }) => {
            if (options?.merge && col.has(id)) {
              col.set(id, { ...col.get(id), ...data });
            } else {
              col.set(id, JSON.parse(JSON.stringify(data)));
            }
          },
          update: async (data: any) => {
            if (!col.has(id)) {
              throw new Error(`Document ${id} does not exist for update`);
            }
            col.set(id, { ...col.get(id), ...data });
          },
          delete: async () => {
            col.delete(id);
          },
        };
        return docRef;
      },
      where: (field: string, op: string, val: any) => {
        const createQuery = (filters: Array<{ field: string; op: string; val: any }>) => ({
          where: (f2: string, op2: string, val2: any) => createQuery([...filters, { field: f2, op: op2, val: val2 }]),
          orderBy: () => ({
            limit: (n: number) => ({
              get: async () => executeQuery(filters, n),
            }),
            get: async () => executeQuery(filters),
          }),
          limit: (n: number) => ({
            get: async () => executeQuery(filters, n),
          }),
          get: async () => executeQuery(filters),
        });

        const executeQuery = (filters: Array<{ field: string; op: string; val: any }>, limitNum?: number) => {
          let docs = Array.from(col.entries()).map(([id, d]) => ({
            id,
            ref: this.collection(name).doc(id),
            data: () => JSON.parse(JSON.stringify(d)),
          }));

          for (const f of filters) {
            docs = docs.filter(d => {
              const data = d.data();
              const fieldValue = data[f.field];
              if (f.op === '==') return fieldValue === f.val;
              if (f.op === 'array-contains') return Array.isArray(fieldValue) && fieldValue.includes(f.val);
              if (f.op === '>') return fieldValue > f.val;
              if (f.op === '<') return fieldValue < f.val;
              if (f.op === 'in') return Array.isArray(f.val) && f.val.includes(fieldValue);
              return true;
            });
          }

          if (limitNum !== undefined) {
            docs = docs.slice(0, limitNum);
          }

          return {
            empty: docs.length === 0,
            docs,
            forEach: (cb: any) => docs.forEach(cb),
          };
        };

        return createQuery([{ field, op, val }]);
      },
      orderBy: () => ({
        limit: () => ({
          get: async () => ({ docs: [], empty: true, forEach: () => {} }),
        }),
      }),
      limit: () => ({
        get: async () => ({ docs: [], empty: true, forEach: () => {} }),
      }),
      get: async () => {
        const docs = Array.from(col.entries()).map(([id, d]) => ({
          id,
          ref: this.collection(name).doc(id),
          data: () => JSON.parse(JSON.stringify(d)),
        }));
        return {
          empty: docs.length === 0,
          docs,
          forEach: (cb: any) => docs.forEach(cb),
        };
      },
    };
  }

  async runTransaction(updateFunction: (transaction: any) => Promise<any>): Promise<any> {
    const transaction = {
      get: async (docRef: any) => await docRef.get(),
      set: (docRef: any, data: any, options?: any) => docRef.set(data, options),
      update: (docRef: any, data: any) => docRef.update(data),
      delete: (docRef: any) => docRef.delete(),
    };
    return await updateFunction(transaction);
  }
}

async function runE2EForensicInvariantSuite() {
  console.log('================================================================');
  console.log('RUNNING MANDATORY E2E FORENSIC INVARIANT SUITE');
  console.log('Testing: Stock Aggregation, Stuck Locks, Entitlements, & Concurrency');
  console.log('================================================================\n');

  const useEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
  const mockDb = useEmulator ? (getAdminDb() as any) : new MockMemoryFirestore();
  if (!useEmulator) {
    setAdminDbForTesting(mockDb);
  }
  console.log(`Execution Mode: ${useEmulator ? 'EMULATOR RUNTIME (' + process.env.FIRESTORE_EMULATOR_HOST + ')' : 'IN-MEMORY MOCK'}\n`);

  // Setup platform defaults
  await mockDb.collection('platformSettings').doc('default').set({
    defaultCommissionRate: 10,
    storeCommissionRate: 10,
  });

  // Setup super admin user profile
  await mockDb.collection('users').doc('superadmin_fixture_01').set({
    id: 'superadmin_fixture_01',
    role: 'SUPER_ADMIN',
    email: 'marketspace119@gmail.com',
    email_verified: true,
    status: 'active',
  });

  // Test 1: Duplicate Product Lines in Single Order Cannot Oversell Stock
  try {
    const testProductId = 'prod_oversell_check_01';
    await mockDb.collection('products').doc(testProductId).set({
      id: testProductId,
      title: { en: 'Limited Stock Widget', ar: 'منتج محدود الكمية' },
      price: 25,
      stock: 5,
      sellerId: 'seller_oversell_01',
      storeId: 'store_oversell_01',
      category: 'electronics',
      isActive: true,
    });

    await mockDb.collection('stores').doc('store_oversell_01').set({
      id: 'store_oversell_01',
      sellerId: 'seller_oversell_01',
      name: { en: 'Widget Store' },
      deliveryFee: 0,
    });

    let oversellThrew = false;
    try {
      // Order contains two line items for the same product, requesting 3 + 3 = 6 units when stock is only 5
      await processOrderCreationGateway({
        customerName: 'Test Customer',
        phone: '+252615000000',
        city: 'Mogadishu',
        address: 'Wadajir',
        paymentMethod: 'cash_on_delivery',
        items: [
          {
            productId: testProductId,
            productSnapshot: {
              id: testProductId,
              price: 25,
              stock: 5,
              sellerId: 'seller_oversell_01',
              storeId: 'store_oversell_01',
              title: { en: 'Limited Stock Widget' } as any,
            } as any,
            quantity: 3,
            selectedOptions: { color: 'Blue' },
          },
          {
            productId: testProductId,
            productSnapshot: {
              id: testProductId,
              price: 25,
              stock: 5,
              sellerId: 'seller_oversell_01',
              storeId: 'store_oversell_01',
              title: { en: 'Limited Stock Widget' } as any,
            } as any,
            quantity: 3,
            selectedOptions: { color: 'Red' },
          },
        ],
      });
    } catch (e: any) {
      if (e.message && e.message.includes('Insufficient stock')) {
        oversellThrew = true;
      } else {
        throw e;
      }
    }

    assert(oversellThrew, 'Duplicate line items for the same product must be aggregated and rejected when sum > stock');
    recordTest({
      id: 'E2E-01-DUPLICATE-PRODUCT-STOCK',
      name: 'Duplicate product lines aggregate stock check & prevent overselling',
      category: 'INVENTORY_INTEGRITY',
      passed: true,
      details: 'Correctly aggregated 3 + 3 = 6 units against stock of 5 and threw Insufficient stock.',
    });
  } catch (err: any) {
    recordTest({
      id: 'E2E-01-DUPLICATE-PRODUCT-STOCK',
      name: 'Duplicate product lines aggregate stock check & prevent overselling',
      category: 'INVENTORY_INTEGRITY',
      passed: false,
      error: err.message || String(err),
    });
  }

  // Test 2: Payout Rejection Releases Lock and Restores Available Balance (No Stuck Lock)
  try {
    const testSellerId = 'seller_payout_lock_test_01';
    const lockRef = mockDb.collection('seller_payout_locks').doc(testSellerId);
    await lockRef.set({
      sellerId: testSellerId,
      totalReserved: 150,
      updatedAt: new Date().toISOString(),
    });

    const payoutId = 'payout_test_reject_01';
    await mockDb.collection('payoutRequests').doc(payoutId).set({
      id: payoutId,
      sellerId: testSellerId,
      amount: 150,
      status: 'pending',
      requestedAt: new Date().toISOString(),
    });

    // Super Admin reviews and rejects the payout
    const testBearer = `Bearer test-token:${Buffer.from(JSON.stringify({
      uid: 'superadmin_fixture_01',
      email: 'marketspace119@gmail.com',
      email_verified: true,
      role: 'SUPER_ADMIN',
      super_admin: true,
    })).toString('base64')}`;

    await processPayoutReviewGateway(
      {
        payoutId,
        newStatus: 'rejected',
        notes: 'Invalid bank account number provided',
      },
      testBearer
    );

    const updatedLock = await lockRef.get();
    const updatedReserved = updatedLock.data()?.totalReserved;
    assert.strictEqual(updatedReserved, 0, 'Rejected payout must decrement lock totalReserved back to 0');

    recordTest({
      id: 'E2E-02-PAYOUT-REJECT-RELEASE-LOCK',
      name: 'Durable in-flight payout lock released upon rejection (No stuck lock)',
      category: 'FINANCIAL_INTEGRITY',
      passed: true,
      details: 'Lock totalReserved decremented from 150 to 0 on rejection, allowing seller to withdraw again.',
    });
  } catch (err: any) {
    recordTest({
      id: 'E2E-02-PAYOUT-REJECT-RELEASE-LOCK',
      name: 'Durable in-flight payout lock released upon rejection (No stuck lock)',
      category: 'FINANCIAL_INTEGRITY',
      passed: false,
      error: err.message || String(err),
    });
  }

  // Test 3: Subscription Approval Supersedes Prior Active Subscriptions
  try {
    const testSubSellerId = 'seller_sub_supersede_01';
    const sub1Id = 'sub_active_old_01';
    const sub2Id = 'sub_active_new_02';

    await mockDb.collection('subscriptions').doc(sub1Id).set({
      id: sub1Id,
      sellerId: testSubSellerId,
      storeId: 'store_sub_01',
      planTier: 'growth',
      price: 0,
      status: 'ACTIVE',
      startDate: new Date().toISOString(),
    });

    await mockDb.collection('subscriptions').doc(sub2Id).set({
      id: sub2Id,
      sellerId: testSubSellerId,
      storeId: 'store_sub_01',
      planTier: 'enterprise',
      price: 0,
      status: 'PENDING_REVIEW',
    });

    await mockDb.collection('stores').doc('store_sub_01').set({
      id: 'store_sub_01',
      sellerId: testSubSellerId,
      currentPlanTier: 'growth',
    });

    const testBearer = `Bearer test-token:${Buffer.from(JSON.stringify({
      uid: 'superadmin_fixture_01',
      email: 'marketspace119@gmail.com',
      email_verified: true,
      role: 'SUPER_ADMIN',
      super_admin: true,
    })).toString('base64')}`;

    await processSubscriptionReviewGateway(
      {
        subscriptionId: sub2Id,
        action: 'APPROVE',
        notes: 'Upgraded to enterprise',
      },
      testBearer
    );

    const oldSubDoc = await mockDb.collection('subscriptions').doc(sub1Id).get();
    const newSubDoc = await mockDb.collection('subscriptions').doc(sub2Id).get();
    const storeDoc = await mockDb.collection('stores').doc('store_sub_01').get();

    assert.strictEqual(oldSubDoc.data()?.status, 'EXPIRED', 'Prior active subscription must be expired');
    assert.strictEqual(newSubDoc.data()?.status, 'ACTIVE', 'New subscription must become active');
    assert.strictEqual(storeDoc.data()?.currentPlanTier, 'enterprise', 'Store plan tier must be synchronized to enterprise');

    recordTest({
      id: 'E2E-03-SUBSCRIPTION-SUPERSEDE-ENTITLEMENT',
      name: 'Subscription approval supersedes prior active subscriptions & synchronizes store tier',
      category: 'MARKETPLACE_INTEGRITY',
      passed: true,
      details: 'Old subscription transitioned to EXPIRED, new subscription activated, store tier set to enterprise.',
    });
  } catch (err: any) {
    recordTest({
      id: 'E2E-03-SUBSCRIPTION-SUPERSEDE-ENTITLEMENT',
      name: 'Subscription approval supersedes prior active subscriptions & synchronizes store tier',
      category: 'MARKETPLACE_INTEGRITY',
      passed: false,
      error: err.message || String(err),
    });
  }

  // Test 4: Refund & Payout Concurrent Accounting Isolation
  try {
    const testSellerId = 'seller_concurrent_ref_pay_01';
    await mockDb.collection('users').doc(testSellerId).set({
      id: testSellerId,
      role: 'SELLER',
      email: 'seller@concurrent.test',
      email_verified: true,
      status: 'active',
    });

    const lockRef = mockDb.collection('seller_payout_locks').doc(testSellerId);
    await lockRef.set({
      sellerId: testSellerId,
      totalReserved: 0,
      totalRefundReserved: 100, // $100 reserved for in-flight refund
      updatedAt: new Date().toISOString(),
    });

    // Seller has $150 lifetime gross earned and 0 settled payouts
    await mockDb.collection('seller_financial_ledgers').doc(testSellerId).set({
      sellerId: testSellerId,
      lifetimeGrossEarned: 150,
      lifetimeSettledRefunds: 0,
      lifetimeSettledPayouts: 0,
      lastReconciledAt: new Date().toISOString(),
      version: 1,
    });

    await mockDb.collection('stores').doc('store_concurrent_01').set({
      id: 'store_concurrent_01',
      sellerId: testSellerId,
      name: { en: 'Concurrent Store' },
    });

    // Seller attempts to withdraw $100.
    // Net earned = $150 - $100 (reserved refund) = $50.
    // A $100 withdrawal MUST be rejected because the available balance is only $50!
    let overdrawRejected = false;
    try {
      const testBearer = `Bearer test-token:${Buffer.from(JSON.stringify({
        uid: testSellerId,
        email: 'seller@concurrent.test',
        email_verified: true,
        role: 'SELLER',
      })).toString('base64')}`;

      await processPayoutGateway(
        {
          sellerId: testSellerId,
          amount: 100,
          paymentMethod: 'zaad',
          accountNumber: '252634000000',
          accountName: 'Concurrent Seller',
        },
        testBearer
      );
    } catch (e: any) {
      if (e.message && e.message.includes('تتجاوز الرصيد المتاح')) {
        overdrawRejected = true;
      } else {
        throw e;
      }
    }

    assert(overdrawRejected, 'Payout request exceeding net balance after in-flight refund reservation must be rejected');

    recordTest({
      id: 'E2E-04-REFUND-PAYOUT-CONCURRENCY-ISOLATION',
      name: 'In-flight refund reservation prevents payout over-withdrawal (OCC TOCTOU protection)',
      category: 'FINANCIAL_INTEGRITY',
      passed: true,
      details: 'Payout of $100 rejected when gross $150 is constrained by $100 in-flight refund reservation.',
    });
  } catch (err: any) {
    recordTest({
      id: 'E2E-04-REFUND-PAYOUT-CONCURRENCY-ISOLATION',
      name: 'In-flight refund reservation prevents payout over-withdrawal (OCC TOCTOU protection)',
      category: 'FINANCIAL_INTEGRITY',
      passed: false,
      error: err.message || String(err),
    });
  }

  console.log('\n================================================================');
  console.log(`TOTAL E2E FORENSIC TESTS: ${results.length}`);
  const passedCount = results.filter(r => r.passed).length;
  const failedCount = results.filter(r => !r.passed).length;
  console.log(`PASSED: ${passedCount}`);
  console.log(`FAILED: ${failedCount}`);
  console.log('================================================================');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runE2EForensicInvariantSuite().catch(err => {
  console.error('Fatal suite failure:', err);
  process.exit(1);
});
