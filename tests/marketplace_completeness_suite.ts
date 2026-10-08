process.env.NODE_ENV = 'test';
if (typeof (global as any).localStorage === 'undefined') {
  const store: Record<string, string> = {};
  (global as any).localStorage = {
    getItem: (key: string) => store[key] !== undefined ? store[key] : null,
    setItem: (key: string, value: string) => { store[key] = String(value); },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { Object.keys(store).forEach(k => delete store[k]); },
  };
}

/**
 * MARKETPLACE PRODUCT COMPLETENESS & FUNCTIONAL CLOSURE SUITE
 * Rigorously verifies all functional marketplace domains, multi-vendor isolation,
 * driver portal lifecycle, dispute workflows, and end-to-end customer journeys.
 */

import { deliveryService } from '../src/services/deliveryService';
import { disputeService } from '../src/services/disputeService';
import { bookingService } from '../src/services/bookingService';
import { orderService } from '../src/services/orderService';
import { reviewService } from '../src/services/reviewService';
import { pricingService } from '../src/services/pricingService';
import { commissionService } from '../src/services/commissionService';
import { subscriptionService } from '../src/services/subscriptionService';
import { productService } from '../src/services/productService';
import { storeService } from '../src/services/storeService';
import { setAdminDbForTesting } from '../server/firebaseAdmin';
import { db } from '../src/lib/firebase';
import { disableNetwork } from 'firebase/firestore';
import { CartItem, Product, DeliveryAssignment } from '../src/types';

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  const memCols = new Map<string, Map<string, any>>();
  const getCol = (name: string) => {
    if (!memCols.has(name)) memCols.set(name, new Map());
    return memCols.get(name)!;
  };
  setAdminDbForTesting({
    collection: (name: string) => ({
      doc: (id: string) => ({
        id,
        get: async () => {
          const d = getCol(name).get(id);
          return { exists: d !== undefined, id, data: () => d };
        },
        set: async (data: any, opts?: any) => {
          const prev = getCol(name).get(id) || {};
          getCol(name).set(id, opts?.merge ? { ...prev, ...data } : data);
        },
        update: async (data: any) => {
          const prev = getCol(name).get(id) || {};
          getCol(name).set(id, { ...prev, ...data });
        },
        delete: async () => {
          getCol(name).delete(id);
        },
      }),
    }),
  });
}

async function runCompletenessSuite() {
  await disableNetwork(db).catch(() => {});
  console.log('================================================================');
  console.log('MARKETPLACE PRODUCT COMPLETENESS + FUNCTIONAL CLOSURE TEST SUITE');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testId: string, desc: string) {
    if (condition) {
      console.log(`[PASS] ${testId}: ${desc}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testId}: ${desc}`);
      failed++;
    }
  }

  // -------------------------------------------------------------
  // TEST-FC01: Multi-Vendor Cart Separation & Sub-Order Splitting
  // -------------------------------------------------------------
  try {
    const mockItems: CartItem[] = [
      {
        id: 'cart_item_1',
        product: {
          id: 'prod_seller_a_1',
          sellerId: 'seller_alpha',
          storeId: 'store_alpha',
          title: { ar: 'منتج أ', en: 'Product A' },
          price: 50,
          currency: 'USD',
          stock: 10,
        } as Product,
        quantity: 2,
      },
      {
        id: 'cart_item_2',
        product: {
          id: 'prod_seller_b_1',
          sellerId: 'seller_beta',
          storeId: 'store_beta',
          title: { ar: 'منتج ب', en: 'Product B' },
          price: 30,
          currency: 'USD',
          stock: 10,
        } as Product,
        quantity: 1,
      },
    ];

    const subOrders = orderService.splitOrderForVendors(mockItems, 10, 5, 'Zaad');
    const isSplitCorrectly =
      subOrders.length === 2 &&
      subOrders.some(s => s.sellerId === 'seller_alpha' && s.subtotal === 100) &&
      subOrders.some(s => s.sellerId === 'seller_beta' && s.subtotal === 30);

    assert(
      isSplitCorrectly,
      'TEST-FC01',
      'Multi-vendor checkout accurately partitions cart items into isolated vendor sub-orders'
    );
  } catch (err: any) {
    assert(false, 'TEST-FC01', `Cart separation error: ${err.message}`);
  }

  // -------------------------------------------------------------
  // TEST-FC02: Seller Delivery Driver Assignment & Isolation
  // -------------------------------------------------------------
  try {
    deliveryService.resetMemoryState();
    const testAssignment: DeliveryAssignment = {
      id: 'deliv_test_alpha_01',
      orderId: 'ord_test_01',
      subOrderId: 'sub_test_01',
      storeId: 'store_alpha',
      storeName: 'Alpha Store',
      sellerId: 'seller_alpha',
      customerId: 'cust_01',
      customerName: 'Customer One',
      customerPhone: '+252 61 111 2222',
      city: 'Mogadishu',
      address: 'Hodan District',
      deliveryType: 'PLATFORM_DELIVERY',
      assignedDriver: null,
      status: 'PENDING',
      trackingCode: 'TRK-ALPHA-01',
      timestamps: {
        created: new Date().toISOString(),
      },
    };
    deliveryService.seedAssignments([testAssignment]);

    // Competitor seller Beta attempts to assign driver to Alpha's delivery -> Must be rejected
    let crossSellerBlocked = false;
    try {
      await deliveryService.assignDriver({
        assignmentId: 'deliv_test_alpha_01',
        deliveryType: 'PLATFORM_DELIVERY',
        driverId: 'drv_demo_01',
        driverName: 'Ahmed Shire',
        actorId: 'seller_beta',
        actorRole: 'SELLER',
      });
    } catch (err: any) {
      if (err.message.includes('Forbidden')) crossSellerBlocked = true;
    }

    // Authorized seller Alpha assigns driver -> Must succeed
    const assigned = await deliveryService.assignDriver({
      assignmentId: 'deliv_test_alpha_01',
      deliveryType: 'PLATFORM_DELIVERY',
      driverId: 'drv_demo_01',
      driverName: 'Ahmed Shire',
      actorId: 'seller_alpha',
      actorRole: 'SELLER',
    });

    const isAssigned =
      crossSellerBlocked &&
      assigned.driverId === 'drv_demo_01' &&
      assigned.driverName.includes('Ahmed Shire') &&
      assigned.status === 'ASSIGNED';

    assert(
      isAssigned,
      'TEST-FC02',
      'Seller assigns driver to own shipment while cross-seller tampering is strictly blocked'
    );
  } catch (err: any) {
    assert(false, 'TEST-FC02', `Seller driver assignment error: ${err.message}`);
  }

  // -------------------------------------------------------------
  // TEST-FC03: Driver Role Lifecycle & Transit State Transitions
  // -------------------------------------------------------------
  try {
    // Assigned driver drv_demo_01 transitions to PICKED_UP
    const pickedUp = await deliveryService.updateStatus({
      assignmentId: 'deliv_test_alpha_01',
      status: 'PICKED_UP',
      actorId: 'drv_demo_01',
      actorRole: 'DRIVER',
    });

    // Assigned driver transitions to OUT_FOR_DELIVERY
    const outForDelivery = await deliveryService.updateStatus({
      assignmentId: 'deliv_test_alpha_01',
      status: 'OUT_FOR_DELIVERY',
      actorId: 'drv_demo_01',
      actorRole: 'DRIVER',
    });

    // Assigned driver marks DELIVERED with recipient proof
    const delivered = await deliveryService.updateStatus({
      assignmentId: 'deliv_test_alpha_01',
      status: 'DELIVERED',
      actorId: 'drv_demo_01',
      actorRole: 'DRIVER',
      proof: {
        type: 'recipient_confirmation',
        recipientName: 'Customer One',
        recipientConfirmation: 'Hand delivered to recipient',
      },
    });

    const isDelivered =
      pickedUp.status === 'PICKED_UP' &&
      outForDelivery.status === 'OUT_FOR_DELIVERY' &&
      delivered.status === 'DELIVERED' &&
      delivered.timestamps?.delivered !== undefined;

    assert(
      isDelivered,
      'TEST-FC03',
      'Assigned courier successfully advances shipment lifecycle from PICKED_UP to DELIVERED'
    );
  } catch (err: any) {
    assert(false, 'TEST-FC03', `Driver lifecycle error: ${err.message}`);
  }

  // -------------------------------------------------------------
  // TEST-FC04: Anti-Spoofing: Unassigned Driver Tampering Blocked
  // -------------------------------------------------------------
  try {
    const testAssignment2: DeliveryAssignment = {
      id: 'deliv_test_beta_02',
      orderId: 'ord_test_02',
      subOrderId: 'sub_test_02',
      storeId: 'store_beta',
      storeName: 'Beta Store',
      sellerId: 'seller_beta',
      customerId: 'cust_02',
      customerName: 'Customer Two',
      customerPhone: '+252 61 222 3333',
      city: 'Mogadishu',
      address: 'Waberi District',
      deliveryType: 'PLATFORM_DELIVERY',
      assignedDriver: 'drv_demo_02', // Assigned to Hassan Farah
      driverId: 'drv_demo_02',
      driverName: 'Hassan Farah',
      status: 'PICKED_UP',
      trackingCode: 'TRK-BETA-02',
      timestamps: {
        created: new Date().toISOString(),
        pickedUpAt: new Date().toISOString(),
      },
    };
    deliveryService.seedAssignments([testAssignment2]);

    let unauthorizedDriverBlocked = false;
    try {
      // Driver Ahmed (drv_demo_01) tries to mark Hassan's shipment as DELIVERED -> Must fail
      await deliveryService.updateStatus({
        assignmentId: 'deliv_test_beta_02',
        status: 'DELIVERED',
        actorId: 'drv_demo_01',
        actorRole: 'DRIVER',
      });
    } catch (err: any) {
      if (err.message.includes('Forbidden')) unauthorizedDriverBlocked = true;
    }

    assert(
      unauthorizedDriverBlocked,
      'TEST-FC04',
      'Strict driver tenant isolation blocks unauthorized drivers from updating another driver delivery'
    );
  } catch (err: any) {
    assert(false, 'TEST-FC04', `Driver anti-spoofing error: ${err.message}`);
  }

  // -------------------------------------------------------------
  // TEST-FC05: End-to-End Dispute Workflow (Customer -> Seller -> Admin)
  // -------------------------------------------------------------
  try {
    orderService.seedOrders([
      {
        orderId: 'ord_test_dispute_01',
        customerId: 'cust_dispute_01',
        customerName: 'Fatima Ali',
        phone: '+252 61 777 8888',
        sellerId: 'seller_alpha',
        sellerIds: ['seller_alpha'],
        storeId: 'store_alpha',
        status: 'delivered',
        paymentStatus: 'paid',
        paymentMethod: 'cash_on_delivery',
        items: [],
        subtotal: 50,
        deliveryFee: 0,
        total: 50,
        createdAt: new Date().toISOString(),
      } as any,
    ]);

    // 1. Customer creates dispute
    const dispute = await disputeService.createDispute({
      orderId: 'ord_test_dispute_01',
      subOrderId: 'sub_disp_01',
      customerId: 'cust_dispute_01',
      customerName: 'Fatima Ali',
      customerPhone: '+252 61 777 8888',
      sellerId: 'seller_alpha',
      sellerName: 'Mustafa Store',
      storeId: 'store_alpha',
      reason: 'damaged_item',
      description: 'The perfume bottle was damaged during shipping.',
      requestedAction: 'full_refund',
    });

    const isCreated = dispute.status === 'OPEN' && dispute.reason === 'damaged_item';

    // 2. Seller reviews and responds
    const responded = await disputeService.sellerRespond({
      disputeId: dispute.id,
      sellerId: 'seller_alpha',
      message: 'We apologize for the damaged item. We approve a full refund.',
      proposedAction: 'accept_refund',
    });

    const isSellerResponded =
      responded.sellerResponse !== undefined &&
      responded.sellerResponse.proposedAction === 'accept_refund' &&
      responded.status === 'SELLER_RESPONDED';

    // 3. Admin resolves dispute with approved refund
    const resolved = await disputeService.resolveDispute({
      disputeId: dispute.id,
      adminId: 'admin_01',
      adminRole: 'ADMIN',
      actionTaken: 'REFUND_APPROVED',
      resolutionNotes: 'Approved full refund after seller agreement.',
      refundAmount: 50.0,
    });

    const isResolved =
      resolved.status === 'RESOLVED_REFUND' &&
      resolved.adminResolution?.actionTaken === 'REFUND_APPROVED' &&
      resolved.adminResolution?.refundAmount === 50.0;

    assert(
      isCreated && isSellerResponded && isResolved,
      'TEST-FC05',
      'Full dispute lifecycle (Customer filing -> Seller response & proposal -> Admin resolution) closes seamlessly'
    );
  } catch (err: any) {
    assert(false, 'TEST-FC05', `Dispute lifecycle error: ${err.message}`);
  }

  // -------------------------------------------------------------
  // TEST-FC06: Service Marketplace Booking & Timeslot Availability
  // -------------------------------------------------------------
  try {
    const bookingDate = '2026-10-15';
    const timeslot = '10:00';
    const providerSellerId = 'user_service_01';

    const isInitiallyAvailable = bookingService.isTimeslotAvailable(providerSellerId, bookingDate, timeslot);

    const newBooking = await bookingService.createBooking({
      serviceId: 'serv_tech_consult',
      serviceTitle: 'IT Infrastructure Consultation',
      sellerId: providerSellerId,
      storeId: 'store_service_01',
      storeName: 'Eng. Hassan Tech',
      customerId: 'cust_booker_01',
      customerName: 'Abdi Hassan',
      customerPhone: '+252 61 888 9999',
      date: bookingDate,
      time: timeslot,
      location: 'Online / Remote',
      price: 120,
    });

    const isNowBlocked = !bookingService.isTimeslotAvailable(providerSellerId, bookingDate, timeslot);
    const retrievedByCustomer = bookingService.getAllBookings('cust_booker_01');

    const bookingWorkflowValid =
      isInitiallyAvailable &&
      newBooking.bookingCode.startsWith('BK-') &&
      isNowBlocked &&
      retrievedByCustomer.some(b => b.id === newBooking.id);

    assert(
      bookingWorkflowValid,
      'TEST-FC06',
      'Service marketplace enforces timeslot collision avoidance and enables customer booking tracking'
    );
  } catch (err: any) {
    assert(false, 'TEST-FC06', `Service booking error: ${err.message}`);
  }

  // -------------------------------------------------------------
  // TEST-FC07: Driver Availability Toggle
  // -------------------------------------------------------------
  try {
    const driverId = 'drv_demo_01';
    const updatedOffline = await deliveryService.updateDriverStatus(driverId, 'OFFLINE', driverId, 'DRIVER');
    const updatedOnline = await deliveryService.updateDriverStatus(driverId, 'AVAILABLE', driverId, 'DRIVER');

    const statusToggleValid =
      updatedOffline.status === 'OFFLINE' && updatedOnline.status === 'AVAILABLE';

    assert(
      statusToggleValid,
      'TEST-FC07',
      'Courier shift status toggle (AVAILABLE <-> OFFLINE) updates authoritative state correctly'
    );
  } catch (err: any) {
    assert(false, 'TEST-FC07', `Driver status toggle error: ${err.message}`);
  }

  // -------------------------------------------------------------
  // TEST-FC08: Commission & Multi-Vendor Payout Split Invariance
  // -------------------------------------------------------------
  try {
    const subtotal = 100;
    const commissionPercent = 10;
    const split = commissionService.calculateCommission(subtotal, commissionPercent);

    const isMathValid =
      split.platformFee === 10 &&
      split.sellerNet === 90 &&
      split.platformFee + split.sellerNet === subtotal;

    assert(
      isMathValid,
      'TEST-FC08',
      'Authoritative commission calculation guarantees platformFee + sellerNet === subtotal'
    );
  } catch (err: any) {
    assert(false, 'TEST-FC08', `Commission math error: ${err.message}`);
  }

  console.log('\n================================================================');
  console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runCompletenessSuite().catch(err => {
  console.error('Test suite failed fatally:', err);
  process.exit(1);
});
