import { collection, doc, getDocs, setDoc, updateDoc, query, where } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  DeliveryAssignment,
  DeliveryAssignmentStatus,
  DeliveryType,
  DriverProfile,
  DriverStatus,
  Vehicle,
  OrderDetails,
} from '../types';
import { auditLogService } from './auditLogService';
import { notificationService } from './notificationService';
import { orderService } from './orderService';

const DELIVERY_STORAGE_KEY = 'marketspace_delivery_assignments_v1';
const DRIVERS_STORAGE_KEY = 'marketspace_drivers_v1';
const VEHICLES_STORAGE_KEY = 'marketspace_vehicles_v1';

const DELIVERY_COLLECTION = 'deliveryAssignments';
const DRIVERS_COLLECTION = 'drivers';
const VEHICLES_COLLECTION = 'vehicles';

let memoryAssignments: DeliveryAssignment[] = [];
let memoryDrivers: DriverProfile[] = [];
let memoryVehicles: Vehicle[] = [];

// Seed Demo Drivers
const INITIAL_DEMO_DRIVERS: DriverProfile[] = [
  {
    id: 'drv_demo_01',
    name: 'Ahmed Shire (Demo)',
    phone: '+252 61 511 2233',
    email: 'ahmed.driver@demo.marketspace.so',
    status: 'AVAILABLE',
    vehicleId: 'veh_demo_01',
    vehicleType: 'motorcycle',
    plateNumber: 'MG-4421',
    currentZone: 'Hodan, Mogadishu',
    rating: 4.9,
    totalDeliveries: 142,
    isDemo: true,
    createdAt: '2026-01-10T10:00:00.000Z',
    updatedAt: '2026-03-01T08:00:00.000Z',
  },
  {
    id: 'drv_demo_02',
    name: 'Hassan Farah (Demo)',
    phone: '+252 61 522 3344',
    email: 'hassan.driver@demo.marketspace.so',
    status: 'AVAILABLE',
    vehicleId: 'veh_demo_02',
    vehicleType: 'van',
    plateNumber: 'MG-8819',
    currentZone: 'Waberi, Mogadishu',
    rating: 4.8,
    totalDeliveries: 98,
    isDemo: true,
    createdAt: '2026-01-15T11:00:00.000Z',
    updatedAt: '2026-03-01T08:00:00.000Z',
  },
  {
    id: 'drv_demo_03',
    name: 'Jama Ali (Demo)',
    phone: '+252 61 533 4455',
    email: 'jama.driver@demo.marketspace.so',
    status: 'AVAILABLE',
    vehicleId: 'veh_demo_03',
    vehicleType: 'motorcycle',
    plateNumber: 'MG-1205',
    currentZone: 'Hamar Weyne, Mogadishu',
    rating: 5.0,
    totalDeliveries: 215,
    isDemo: true,
    createdAt: '2026-01-20T09:00:00.000Z',
    updatedAt: '2026-03-01T08:00:00.000Z',
  },
  {
    id: 'drv_demo_04',
    name: 'Mustafa Nur (Demo)',
    phone: '+252 61 544 5566',
    email: 'mustafa.driver@demo.marketspace.so',
    status: 'OFFLINE',
    vehicleId: 'veh_demo_04',
    vehicleType: 'car',
    plateNumber: 'MG-9302',
    currentZone: 'Kaaran, Mogadishu',
    rating: 4.6,
    totalDeliveries: 45,
    isDemo: true,
    createdAt: '2026-02-01T14:00:00.000Z',
    updatedAt: '2026-03-01T08:00:00.000Z',
  },
];

const INITIAL_DEMO_VEHICLES: Vehicle[] = [
  {
    id: 'veh_demo_01',
    type: 'motorcycle',
    plateNumber: 'MG-4421',
    model: 'Honda Ace 125',
    status: 'ACTIVE',
    assignedDriverId: 'drv_demo_01',
    isDemo: true,
    createdAt: '2026-01-10T10:00:00.000Z',
  },
  {
    id: 'veh_demo_02',
    type: 'van',
    plateNumber: 'MG-8819',
    model: 'Toyota HiAce Cold-Chain',
    status: 'ACTIVE',
    assignedDriverId: 'drv_demo_02',
    isDemo: true,
    createdAt: '2026-01-15T11:00:00.000Z',
  },
  {
    id: 'veh_demo_03',
    type: 'motorcycle',
    plateNumber: 'MG-1205',
    model: 'Yamaha YBR 125',
    status: 'ACTIVE',
    assignedDriverId: 'drv_demo_03',
    isDemo: true,
    createdAt: '2026-01-20T09:00:00.000Z',
  },
  {
    id: 'veh_demo_04',
    type: 'car',
    plateNumber: 'MG-9302',
    model: 'Toyota Corolla Delivery',
    status: 'ACTIVE',
    assignedDriverId: 'drv_demo_04',
    isDemo: true,
    createdAt: '2026-02-01T14:00:00.000Z',
  },
];

function initAssignments(): DeliveryAssignment[] {
  if (memoryAssignments.length > 0) return memoryAssignments;
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(DELIVERY_STORAGE_KEY);
    if (!raw) return [];
    memoryAssignments = JSON.parse(raw);
    return memoryAssignments;
  } catch (err) {
    console.error('Failed to load delivery assignments:', err);
    return [];
  }
}

function persistAssignments(items: DeliveryAssignment[]) {
  memoryAssignments = items;
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(DELIVERY_STORAGE_KEY, JSON.stringify(items));
  } catch (err) {
    console.error('Failed to persist delivery assignments:', err);
  }
}

function initDrivers(): DriverProfile[] {
  if (memoryDrivers.length > 0) return memoryDrivers;
  if (typeof window === 'undefined') return INITIAL_DEMO_DRIVERS;
  try {
    const raw = localStorage.getItem(DRIVERS_STORAGE_KEY);
    if (!raw) {
      persistDrivers(INITIAL_DEMO_DRIVERS);
      return INITIAL_DEMO_DRIVERS;
    }
    memoryDrivers = JSON.parse(raw);
    return memoryDrivers;
  } catch (err) {
    return INITIAL_DEMO_DRIVERS;
  }
}

function persistDrivers(items: DriverProfile[]) {
  memoryDrivers = items;
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(DRIVERS_STORAGE_KEY, JSON.stringify(items));
  } catch (err) {
    console.error('Failed to persist drivers:', err);
  }
}

function initVehicles(): Vehicle[] {
  if (memoryVehicles.length > 0) return memoryVehicles;
  if (typeof window === 'undefined') return INITIAL_DEMO_VEHICLES;
  try {
    const raw = localStorage.getItem(VEHICLES_STORAGE_KEY);
    if (!raw) {
      persistVehicles(INITIAL_DEMO_VEHICLES);
      return INITIAL_DEMO_VEHICLES;
    }
    memoryVehicles = JSON.parse(raw);
    return memoryVehicles;
  } catch (err) {
    return INITIAL_DEMO_VEHICLES;
  }
}

function persistVehicles(items: Vehicle[]) {
  memoryVehicles = items;
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(VEHICLES_STORAGE_KEY, JSON.stringify(items));
  } catch (err) {
    console.error('Failed to persist vehicles:', err);
  }
}

// Normalizer for status (handles legacy lowercase and uppercase)
export function normalizeDeliveryStatus(
  status?: string
): DeliveryAssignmentStatus {
  if (!status) return 'PENDING';
  const upper = status.toUpperCase();
  if (upper === 'PENDING_FULFILLMENT' || upper === 'PENDING') return 'PENDING';
  if (upper === 'ASSIGNED') return 'ASSIGNED';
  if (upper === 'PREPARING') return 'PREPARING';
  if (upper === 'READY') return 'READY';
  if (upper === 'PICKED_UP' || upper === 'SHIPPED') return 'PICKED_UP';
  if (upper === 'OUT_FOR_DELIVERY') return 'OUT_FOR_DELIVERY';
  if (upper === 'DELIVERED') return 'DELIVERED';
  if (upper === 'FAILED') return 'FAILED';
  if (upper === 'RESCHEDULED') return 'RESCHEDULED';
  if (upper === 'CANCELLED') return 'CANCELLED';
  return 'PENDING';
}

export const deliveryService = {
  /**
   * Seed assignments in memory for deterministic test fixtures and audits
   */
  seedAssignments(assignments: DeliveryAssignment[]) {
    memoryAssignments = [...assignments];
  },

  async syncWithFirestore(filter?: { sellerId?: string; customerId?: string; isAdmin?: boolean }): Promise<DeliveryAssignment[]> {
    try {
      let q;
      if (filter?.isAdmin) {
        q = collection(db, DELIVERY_COLLECTION);
      } else if (filter?.sellerId) {
        q = query(collection(db, DELIVERY_COLLECTION), where('sellerId', '==', filter.sellerId));
      } else if (filter?.customerId) {
        q = query(collection(db, DELIVERY_COLLECTION), where('customerId', '==', filter.customerId));
      }

      if (q) {
        const snap = await getDocs(q);
        if (!snap.empty) {
          const cloud: DeliveryAssignment[] = [];
          snap.forEach(d => cloud.push(d.data() as DeliveryAssignment));
          persistAssignments(cloud);
          return cloud;
        }
      }
    } catch (err) {
      console.warn('Delivery Firestore sync offline:', err);
    }
    return initAssignments();
  },

  getAllAssignments(): DeliveryAssignment[] {
    return initAssignments();
  },

  getAssignmentById(id: string): DeliveryAssignment | undefined {
    return initAssignments().find(a => a.id === id);
  },

  getAssignmentsByOrderId(orderId: string): DeliveryAssignment[] {
    return initAssignments().filter(a => a.orderId === orderId);
  },

  getAssignmentBySubOrderId(subOrderId: string): DeliveryAssignment | undefined {
    return initAssignments().find(a => a.subOrderId === subOrderId);
  },

  getAssignmentsByStore(storeId: string): DeliveryAssignment[] {
    return initAssignments().filter(a => a.storeId === storeId);
  },

  getUnassignedAssignments(): DeliveryAssignment[] {
    return initAssignments().filter(
      a =>
        !a.assignedDriver &&
        a.deliveryType !== 'CUSTOMER_PICKUP' &&
        a.deliveryType !== 'pickup' &&
        a.status !== 'DELIVERED' &&
        a.status !== 'delivered' &&
        a.status !== 'CANCELLED' &&
        a.status !== 'cancelled'
    );
  },

  /**
   * Driver & Fleet Operations
   */
  getDrivers(): DriverProfile[] {
    return initDrivers();
  },

  getAvailableDrivers(): DriverProfile[] {
    return initDrivers().filter(d => d.status === 'AVAILABLE');
  },

  getDriverById(id: string): DriverProfile | undefined {
    return initDrivers().find(d => d.id === id);
  },

  addDriver(
    data: Omit<DriverProfile, 'id' | 'createdAt' | 'updatedAt' | 'totalDeliveries' | 'rating'>,
    actorId: string,
    actorRole: string
  ): DriverProfile {
    const drivers = initDrivers();
    const id = `drv_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();
    const newDriver: DriverProfile = {
      ...data,
      id,
      rating: 5.0,
      totalDeliveries: 0,
      createdAt: now,
      updatedAt: now,
    };

    drivers.unshift(newDriver);
    persistDrivers(drivers);

    auditLogService.logAction({
      actorId,
      actorRole: actorRole as any,
      action: 'DRIVER_CREATED',
      targetType: 'delivery',
      targetId: id,
      targetName: newDriver.name,
      metadata: { phone: newDriver.phone, status: newDriver.status },
    });

    setDoc(doc(db, DRIVERS_COLLECTION, id), newDriver).catch(err => {
      console.warn('Failed to save driver to Firestore:', err);
    });

    return newDriver;
  },

  updateDriverStatus(
    driverId: string,
    status: DriverStatus,
    actorId: string,
    actorRole: string
  ): DriverProfile {
    const drivers = initDrivers();
    const index = drivers.findIndex(d => d.id === driverId);
    if (index === -1) throw new Error('Driver not found');

    const prev = drivers[index];
    const updated: DriverProfile = {
      ...prev,
      status,
      updatedAt: new Date().toISOString(),
    };

    drivers[index] = updated;
    persistDrivers(drivers);

    auditLogService.logAction({
      actorId,
      actorRole: actorRole as any,
      action: 'DRIVER_STATUS_UPDATED',
      targetType: 'delivery',
      targetId: driverId,
      targetName: prev.name,
      metadata: { previousStatus: prev.status, newStatus: status },
    });

    setDoc(doc(db, DRIVERS_COLLECTION, driverId), updated, { merge: true }).catch(err => {
      console.warn('Failed to update driver in Firestore:', err);
    });

    return updated;
  },

  getVehicles(): Vehicle[] {
    return initVehicles();
  },

  addVehicle(data: Omit<Vehicle, 'id' | 'createdAt'>): Vehicle {
    const vehicles = initVehicles();
    const id = `veh_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const newVeh: Vehicle = {
      ...data,
      id,
      createdAt: new Date().toISOString(),
    };
    vehicles.unshift(newVeh);
    persistVehicles(vehicles);

    setDoc(doc(db, VEHICLES_COLLECTION, id), newVeh).catch(err => {
      console.warn('Failed to save vehicle in Firestore:', err);
    });

    return newVeh;
  },

  /**
   * Syncs orders into authoritative delivery assignments
   */
  ensureAssignmentsFromOrders(orders: OrderDetails[]): DeliveryAssignment[] {
    const assignments = initAssignments();
    let updated = false;

    orders.forEach(order => {
      if (order.vendorOrders && order.vendorOrders.length > 0) {
        order.vendorOrders.forEach(vendor => {
          const assignmentId = `deliv_${order.orderId}_${vendor.subOrderId}`;
          const existing = assignments.find(a => a.id === assignmentId);
          if (!existing) {
            let initialStatus: DeliveryAssignmentStatus = 'PENDING';
            if (vendor.status === 'preparing') initialStatus = 'PREPARING';
            if (vendor.status === 'ready') initialStatus = 'READY';
            if (vendor.status === 'shipped') initialStatus = 'PICKED_UP';
            if (vendor.status === 'delivered') initialStatus = 'DELIVERED';
            if (vendor.status === 'cancelled') initialStatus = 'CANCELLED';

            const newAssignment: DeliveryAssignment = {
              id: assignmentId,
              orderId: order.orderId,
              subOrderId: vendor.subOrderId,
              storeId: vendor.storeId,
              storeName: vendor.storeName,
              sellerId: vendor.sellerId,
              customerId: order.customerId,
              customerName: order.customerName,
              customerPhone: order.phone,
              city: order.city,
              address: order.address,
              deliveryType: 'PLATFORM_DELIVERY',
              assignedDriver: null,
              trackingCode: vendor.trackingNumber || order.deliveryTrackingCode,
              trackingNumber: vendor.trackingNumber || order.deliveryTrackingCode,
              status: initialStatus,
              timestamps: {
                created: order.createdAt || new Date().toISOString(),
                dispatched: vendor.status === 'shipped' ? new Date().toISOString() : undefined,
                delivered: vendor.status === 'delivered' ? new Date().toISOString() : undefined,
              },
            };
            assignments.push(newAssignment);
            updated = true;
          }
        });
      }
    });

    if (updated) {
      persistAssignments(assignments);
    }
    return assignments;
  },

  /**
   * Assign or Reassign Driver
   * Enforces strict fail-closed Firestore synchronization before updating local memory.
   */
  async assignDriver(params: {
    assignmentId: string;
    deliveryType: DeliveryType;
    driverId?: string;
    driverName: string | null;
    driverPhone?: string;
    vehicleInfo?: string;
    actorId: string;
    actorRole: string;
  }): Promise<DeliveryAssignment> {
    const assignments = initAssignments();
    const index = assignments.findIndex(a => a.id === params.assignmentId);
    if (index === -1) throw new Error('Delivery assignment not found');

    const prev = assignments[index];
    const isAdmin = params.actorRole === 'ADMIN' || params.actorRole === 'SUPER_ADMIN';
    const isSeller = params.actorRole === 'SELLER' || params.actorRole === 'RESTAURANT';

    // Anti-Cross-Seller Tampering Guard
    if (isSeller && prev.sellerId !== params.actorId) {
      throw new Error('Forbidden: You can only assign drivers to your own deliveries');
    }
    if (!isAdmin && !isSeller) {
      throw new Error('Forbidden: Only authorized sellers or admins can assign drivers');
    }

    const now = new Date().toISOString();

    // Prevent assigning offline/suspended driver if driverId is given
    if (params.driverId) {
      const driver = this.getDriverById(params.driverId);
      if (driver && (driver.status === 'OFFLINE' || driver.status === 'SUSPENDED')) {
        throw new Error(`Cannot assign driver with status ${driver.status}`);
      }
    }

    const isReassignment = !!prev.assignedDriver && prev.assignedDriver !== params.driverName;
    const newStatus: DeliveryAssignmentStatus = params.driverName ? 'ASSIGNED' : prev.status;

    const updated: DeliveryAssignment = {
      ...prev,
      deliveryType: params.deliveryType,
      driverId: params.driverId || prev.driverId,
      assignedDriver: params.driverName,
      driverPhone: params.driverPhone || prev.driverPhone,
      vehicleInfo: params.vehicleInfo || prev.vehicleInfo,
      status: newStatus,
      timestamps: {
        ...prev.timestamps,
        assignedAt: params.driverName ? now : prev.timestamps.assignedAt,
      },
      updatedAt: now,
    };

    // Await authoritative Firestore update first (Fail-Closed)
    try {
      await setDoc(doc(db, DELIVERY_COLLECTION, params.assignmentId), updated, { merge: true });
    } catch (err: any) {
      handleFirestoreError(err, OperationType.UPDATE, `${DELIVERY_COLLECTION}/${params.assignmentId}`);
      throw err;
    }

    // Only update local memory after Firestore write succeeds
    // Await authoritative Firestore update first (Fail-Closed)
    try {
      await setDoc(doc(db, DELIVERY_COLLECTION, params.assignmentId), updated, { merge: true });
    } catch (err: any) {
      handleFirestoreError(err, OperationType.UPDATE, `${DELIVERY_COLLECTION}/${params.assignmentId}`);
      throw err;
    }

    // Only commit to local memory after Firestore write succeeds
    assignments[index] = updated;
    persistAssignments(assignments);

    // Audit log
    auditLogService.logAction({
      actorId: params.actorId,
      actorRole: params.actorRole as any,
      action: isReassignment ? 'DELIVERY_REASSIGNED' : 'DELIVERY_ASSIGNED',
      targetType: 'delivery',
      targetId: params.assignmentId,
      targetName: `Order ${prev.orderId}`,
      metadata: {
        driver: params.driverName,
        deliveryType: params.deliveryType,
        previousDriver: prev.assignedDriver,
      },
    });

    // Notify customer
    if (updated.customerId && params.driverName) {
      notificationService.notifyDeliveryEvent({
        userId: updated.customerId,
        orderId: updated.orderId,
        eventType: 'DELIVERY_ASSIGNED',
        driverName: params.driverName,
        driverPhone: params.driverPhone,
      });
    }

    return updated;
  },

  /**
   * Transition Status with Strict Role Authorization & Validation
   * Enforces strict fail-closed Firestore synchronization before updating local memory.
   */
  async updateStatus(params: {
    assignmentId: string;
    status: DeliveryAssignmentStatus;
    actorId: string;
    actorRole: string;
    notes?: string;
    failureReason?: string;
    proof?: {
      type: 'recipient_confirmation' | 'photo' | 'signature' | 'manual_verification';
      url?: string;
      recipientName?: string;
      recipientConfirmation?: string;
    };
  }): Promise<DeliveryAssignment> {
    const assignments = initAssignments();
    const index = assignments.findIndex(a => a.id === params.assignmentId);
    if (index === -1) throw new Error('Delivery assignment not found');

    const prev = assignments[index];
    const currentNorm = normalizeDeliveryStatus(prev.status);
    const targetNorm = normalizeDeliveryStatus(params.status);

    // Strict Authorization Rules
    const isCustomer = params.actorRole === 'CUSTOMER';
    const isAdmin = params.actorRole === 'ADMIN' || params.actorRole === 'SUPER_ADMIN';
    const isSeller = params.actorRole === 'SELLER' || params.actorRole === 'RESTAURANT';

    if (isCustomer) {
      throw new Error('Customers do not have authority to alter delivery operational status');
    }

    // Anti-Cross-Seller Tampering Guard
    if (isSeller && prev.sellerId !== params.actorId) {
      throw new Error('Forbidden: You can only update delivery status for your own store shipments');
    }

    // Role lifecycle capability checks
    if (!isAdmin) {
      if (isSeller) {
        const allowedForSeller = ['PREPARING', 'READY', 'CANCELLED'];
        if (prev.deliveryType === 'SELLER_DELIVERY' || prev.deliveryType === 'seller_delivery') {
          allowedForSeller.push('OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED');
        }
        if (!allowedForSeller.includes(targetNorm)) {
          throw new Error(`Sellers cannot transition directly to ${targetNorm} under platform fulfillment`);
        }
      }
    }

    // Prevent impossible jumps (e.g. PENDING directly to DELIVERED)
    if (currentNorm === 'PENDING' && targetNorm === 'DELIVERED') {
      throw new Error('Invalid lifecycle jump: order must be prepared and dispatched before delivery');
    }

    const now = new Date().toISOString();
    const timestamps = { ...prev.timestamps };

    if (targetNorm === 'PREPARING') timestamps.preparing = now;
    if (targetNorm === 'READY') timestamps.ready = now;
    if (targetNorm === 'PICKED_UP') timestamps.pickedUpAt = now;
    if (targetNorm === 'OUT_FOR_DELIVERY') {
      timestamps.outForDelivery = now;
      timestamps.outForDeliveryAt = now;
    }
    if (targetNorm === 'DELIVERED') {
      timestamps.delivered = now;
      timestamps.deliveredAt = now;
    }
    if (targetNorm === 'FAILED') {
      timestamps.failed = now;
      timestamps.failedAt = now;
    }
    if (targetNorm === 'CANCELLED') timestamps.cancelled = now;
    if (targetNorm === 'RESCHEDULED') timestamps.rescheduledAt = now;

    const updated: DeliveryAssignment = {
      ...prev,
      status: targetNorm,
      timestamps,
      notes: params.notes || prev.notes,
      failureReason: targetNorm === 'FAILED' ? params.failureReason || 'customer_unavailable' : prev.failureReason,
      failedBy: targetNorm === 'FAILED' ? params.actorId : prev.failedBy,
      deliveryProofType: params.proof?.type || prev.deliveryProofType,
      deliveryProofUrl: params.proof?.url || prev.deliveryProofUrl,
      recipientName: params.proof?.recipientName || prev.recipientName,
      recipientConfirmation: params.proof?.recipientConfirmation || prev.recipientConfirmation,
      completedAt: targetNorm === 'DELIVERED' ? now : prev.completedAt,
      updatedAt: now,
    };

    // Await authoritative Firestore update first (Fail-Closed)
    try {
      await setDoc(doc(db, DELIVERY_COLLECTION, params.assignmentId), updated, { merge: true });
    } catch (err: any) {
      handleFirestoreError(err, OperationType.UPDATE, `${DELIVERY_COLLECTION}/${params.assignmentId}`);
      throw err;
    }

    // Only commit to local memory after Firestore write succeeds
    assignments[index] = updated;
    persistAssignments(assignments);

    // Audit log
    auditLogService.logAction({
      actorId: params.actorId,
      actorRole: params.actorRole as any,
      action:
        targetNorm === 'FAILED'
          ? 'DELIVERY_FAILED'
          : targetNorm === 'RESCHEDULED'
          ? 'DELIVERY_RESCHEDULED'
          : 'DELIVERY_STATUS_CHANGED',
      targetType: 'delivery',
      targetId: params.assignmentId,
      targetName: `Order ${prev.orderId}`,
      metadata: {
        fromStatus: currentNorm,
        toStatus: targetNorm,
        failureReason: params.failureReason,
      },
    });

    // Notify Customer if applicable
    if (updated.customerId) {
      if (targetNorm === 'OUT_FOR_DELIVERY') {
        notificationService.notifyOrderEvent({
          userId: updated.customerId,
          orderId: updated.orderId,
          eventType: 'ORDER_OUT_FOR_DELIVERY',
        });
      } else if (targetNorm === 'DELIVERED') {
        notificationService.notifyOrderEvent({
          userId: updated.customerId,
          orderId: updated.orderId,
          eventType: 'ORDER_DELIVERED',
        });
      } else if (targetNorm === 'FAILED') {
        notificationService.notifyDeliveryEvent({
          userId: updated.customerId,
          orderId: updated.orderId,
          eventType: 'DELIVERY_FAILED',
          failureReason: params.failureReason,
        });
      } else if (targetNorm === 'RESCHEDULED') {
        notificationService.notifyDeliveryEvent({
          userId: updated.customerId,
          orderId: updated.orderId,
          eventType: 'DELIVERY_RESCHEDULED',
        });
      }
    }

    return updated;
  },

  async updateAssignmentStatus(params: {
    assignmentId: string;
    status: DeliveryAssignmentStatus;
    actorId: string;
    actorRole: string;
    notes?: string;
    failureReason?: string;
  }): Promise<DeliveryAssignment> {
    return this.updateStatus(params);
  },

  /**
   * Reschedule a Failed Delivery
   */
  async rescheduleDelivery(params: {
    assignmentId: string;
    actorId: string;
    actorRole: string;
    notes?: string;
  }): Promise<DeliveryAssignment> {
    return this.updateStatus({
      assignmentId: params.assignmentId,
      status: 'RESCHEDULED',
      actorId: params.actorId,
      actorRole: params.actorRole,
      notes: params.notes,
    });
  },

  /**
   * Operational Delay and Issue Detection
   */
  getDeliveryAlerts(): {
    overduePreparation: DeliveryAssignment[];
    delayedInTransit: DeliveryAssignment[];
    failedPendingAction: DeliveryAssignment[];
  } {
    const all = initAssignments();
    const now = Date.now();

    const overduePreparation: DeliveryAssignment[] = [];
    const delayedInTransit: DeliveryAssignment[] = [];
    const failedPendingAction: DeliveryAssignment[] = [];

    all.forEach(a => {
      const status = normalizeDeliveryStatus(a.status);
      if (status === 'FAILED') {
        failedPendingAction.push(a);
      } else if (status === 'PREPARING') {
        const prepStart = a.timestamps.preparing ? new Date(a.timestamps.preparing).getTime() : 0;
        if (prepStart > 0 && now - prepStart > 45 * 60 * 1000) {
          overduePreparation.push(a);
        }
      } else if (status === 'OUT_FOR_DELIVERY') {
        const outStart = a.timestamps.outForDeliveryAt
          ? new Date(a.timestamps.outForDeliveryAt).getTime()
          : a.timestamps.outForDelivery
          ? new Date(a.timestamps.outForDelivery).getTime()
          : 0;
        if (outStart > 0 && now - outStart > 60 * 60 * 1000) {
          delayedInTransit.push(a);
        }
      }
    });

    return {
      overduePreparation,
      delayedInTransit,
      failedPendingAction,
    };
  },

  async createAssignment(
    data: Omit<DeliveryAssignment, 'id' | 'timestamps'>,
    actorRole?: string
  ): Promise<DeliveryAssignment> {
    const isAdmin = actorRole === 'ADMIN' || actorRole === 'SUPER_ADMIN';
    if (!isAdmin && data.orderId) {
      const order = orderService.getOrderById(data.orderId);
      if (order) {
        const ownsOrder =
          order.vendorOrders?.some(vo => vo.sellerId === data.sellerId) ||
          (order.sellerIds && order.sellerIds.includes(data.sellerId));
        if (!ownsOrder) {
          throw new Error('Forbidden: You do not own this order and cannot create delivery assignments for it');
        }
      }
    }

    const id = `deliv_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();
    const newAssignment: DeliveryAssignment = {
      ...data,
      id,
      timestamps: {
        created: now,
      },
      createdAt: now,
      updatedAt: now,
    };

    try {
      await setDoc(doc(db, DELIVERY_COLLECTION, id), newAssignment);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `${DELIVERY_COLLECTION}/${id}`);
      throw err;
    }

    const assignments = initAssignments();
    assignments.unshift(newAssignment);
    persistAssignments(assignments);

    return newAssignment;
  },
};
