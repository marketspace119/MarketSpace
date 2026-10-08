import { collection, doc, getDoc, getDocs, setDoc, updateDoc, query, where, limit } from 'firebase/firestore';
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
const activeAssignmentLocks = new Set<string>();

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

function isProductionEnvironment(): boolean {
  if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'production') return true;
  if (typeof import.meta !== 'undefined' && (import.meta as any).env?.PROD) return true;
  return false;
}

function initAssignments(): DeliveryAssignment[] {
  if (memoryAssignments.length > 0) return memoryAssignments;
  // F-20: Do not read or trust localStorage for delivery assignment authority
  return memoryAssignments;
}

function persistAssignments(items: DeliveryAssignment[]) {
  memoryAssignments = items;
  // F-20: LocalStorage persistence removed for authoritative delivery assignments
}

function initDrivers(): DriverProfile[] {
  if (memoryDrivers.length > 0) return memoryDrivers;
  if (isProductionEnvironment()) return [];
  // F-20: Do not read or trust localStorage for driver authority
  memoryDrivers = [...INITIAL_DEMO_DRIVERS];
  return memoryDrivers;
}

function persistDrivers(items: DriverProfile[]) {
  memoryDrivers = items;
  // F-20: LocalStorage persistence removed for authoritative drivers
}

function initVehicles(): Vehicle[] {
  if (memoryVehicles.length > 0) return memoryVehicles;
  if (isProductionEnvironment()) return [];
  // F-20: Do not read or trust localStorage for vehicle authority
  memoryVehicles = [...INITIAL_DEMO_VEHICLES];
  return memoryVehicles;
}

function persistVehicles(items: Vehicle[]) {
  memoryVehicles = items;
  // F-20: LocalStorage persistence removed for authoritative vehicles
}

async function persistDeliveryDocToFirestore(collectionName: string, docId: string, payload: Record<string, any>, merge = true): Promise<void> {
  const cleanPayload = cleanForFirestore(payload);
  if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'test') {
    await setDoc(doc(db, collectionName, docId), cleanPayload, merge ? { merge: true } : {});
  } else {
    const serverAdminModule = '../../server/firebaseAdmin';
    const { getAdminDb } = await import(/* @vite-ignore */ serverAdminModule);
    const adminDb = getAdminDb();
    if (!adminDb) {
      throw new Error(`Database write failure (Fail-Closed): Firestore Admin DB unavailable for ${collectionName}/${docId}`);
    }
    await adminDb.collection(collectionName).doc(docId).set(cleanPayload, merge ? { merge: true } : {});
  }
}

// Sanitizes undefined fields so Firestore document serialization never throws unsupported field value errors
function cleanForFirestore<T extends Record<string, any>>(obj: T): any {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(item => cleanForFirestore(item));
  const cleaned: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) {
      cleaned[k] = typeof v === 'object' && v !== null ? cleanForFirestore(v) : v;
    }
  }
  return cleaned;
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
  resetMemoryState() {
    memoryAssignments = [];
    memoryDrivers = [];
    memoryVehicles = [];
  },
  /**
   * Seed assignments in memory for deterministic test fixtures and audits
   */
  seedAssignments(assignments: DeliveryAssignment[]) {
    memoryAssignments = [...assignments];
  },

  seedDrivers(drivers: DriverProfile[]) {
    memoryDrivers = [...drivers];
  },

  async syncWithFirestore(filter?: { sellerId?: string; customerId?: string; isAdmin?: boolean }): Promise<DeliveryAssignment[]> {
    try {
      let q;
      if (filter?.isAdmin) {
        q = query(collection(db, DELIVERY_COLLECTION), limit(200));
      } else if (filter?.sellerId) {
        q = query(collection(db, DELIVERY_COLLECTION), where('sellerId', '==', filter.sellerId), limit(200));
      } else if (filter?.customerId) {
        q = query(collection(db, DELIVERY_COLLECTION), where('customerId', '==', filter.customerId), limit(200));
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

  getAssignmentsBySeller(sellerId: string): DeliveryAssignment[] {
    return initAssignments().filter(a => a.sellerId === sellerId);
  },

  getAssignmentsByDriver(driverId: string): DeliveryAssignment[] {
    return initAssignments().filter(
      a => a.driverId === driverId || a.assignedDriver === driverId
    );
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

  async fetchDriverById(id: string): Promise<DriverProfile | undefined> {
    try {
      const snap = await getDoc(doc(db, DRIVERS_COLLECTION, id));
      if (snap.exists()) {
        const d = snap.data() as DriverProfile;
        const drivers = initDrivers();
        const idx = drivers.findIndex(x => x.id === id);
        if (idx !== -1) {
          drivers[idx] = d;
        } else {
          drivers.push(d);
        }
        persistDrivers(drivers);
        return d;
      }
    } catch (e) {
      console.warn('fetchDriverById error:', e);
    }
    return this.getDriverById(id);
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

    persistDeliveryDocToFirestore(DRIVERS_COLLECTION, id, newDriver, false).catch(err => {
      console.warn('Failed to save driver to Firestore:', err);
    });

    return newDriver;
  },

  async updateDriverStatus(
    driverId: string,
    status: DriverStatus,
    actorId: string,
    actorRole: string
  ): Promise<DriverProfile> {
    const isAdmin = actorRole === 'ADMIN' || actorRole === 'SUPER_ADMIN';
    const isDriverSelf = actorId === driverId;
    if (!isAdmin && !isDriverSelf) {
      throw new Error('Forbidden: You can only update your own driver status');
    }

    if (!['AVAILABLE', 'OFFLINE', 'ON_DELIVERY', 'BUSY'].includes(status)) {
      throw new Error('Invalid driver status');
    }

    const now = new Date().toISOString();

    // F-10: Update Firestore authoritatively FIRST (Strictly Fail-Closed).
    try {
      await persistDeliveryDocToFirestore(DRIVERS_COLLECTION, driverId, {
        status,
        updatedAt: now,
      }, true);
    } catch (err: any) {
      handleFirestoreError(err, OperationType.UPDATE, `${DRIVERS_COLLECTION}/${driverId}`);
      throw new Error(`Database write failure (Fail-Closed): Unable to update driver status in Firestore (${err?.message || err})`);
    }

    const drivers = initDrivers();
    const index = drivers.findIndex(d => d.id === driverId);
    let updated: DriverProfile;
    if (index !== -1) {
      updated = {
        ...drivers[index],
        status,
        updatedAt: now,
      };
      drivers[index] = updated;
    } else {
      updated = {
        id: driverId,
        name: 'Driver',
        phone: '',
        status,
        rating: 5.0,
        totalDeliveries: 0,
        createdAt: now,
        updatedAt: now,
      } as DriverProfile;
      drivers.push(updated);
    }
    persistDrivers(drivers);

    auditLogService.logAction({
      actorId,
      actorRole: actorRole as any,
      action: 'DRIVER_STATUS_UPDATED',
      targetType: 'delivery',
      targetId: driverId,
      targetName: updated.name,
      metadata: { previousStatus: index !== -1 ? drivers[index].status : 'unknown', newStatus: status },
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

    persistDeliveryDocToFirestore(VEHICLES_COLLECTION, id, newVeh, false).catch(err => {
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
              deliveryFee: vendor.deliveryFee || (order as any).deliveryFee || 3.5,
              driverEarnings: Math.round(((vendor.deliveryFee || (order as any).deliveryFee || 3.5) * 0.85) * 100) / 100,
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
    allowReassign?: boolean;
  }): Promise<DeliveryAssignment> {
    if (activeAssignmentLocks.has(params.assignmentId)) {
      const conflictErr = new Error(`Conflict: Delivery assignment "${params.assignmentId}" is currently being modified by another concurrent request.`) as any;
      conflictErr.statusCode = 409;
      throw conflictErr;
    }
    activeAssignmentLocks.add(params.assignmentId);

    try {
      const assignments = initAssignments();
      const index = assignments.findIndex(a => a.id === params.assignmentId);
      if (index === -1) throw new Error('Delivery assignment not found');

      const prev = assignments[index];
      const isAdmin = params.actorRole === 'ADMIN' || params.actorRole === 'SUPER_ADMIN';
      const isSeller = params.actorRole === 'SELLER' || params.actorRole === 'RESTAURANT';

      // Terminal-state protection: Cannot assign/reassign drivers to DELIVERED or CANCELLED deliveries
      if (prev.status === 'DELIVERED' || prev.status === 'CANCELLED') {
        const termErr = new Error(`Conflict: Cannot assign driver to delivery in terminal state (${prev.status}).`) as any;
        termErr.statusCode = 409;
        throw termErr;
      }

      // Concurrent duplicate assignment protection unless explicit reassignment is requested (allowReassign === true)
      if (prev.status === 'ASSIGNED' && prev.driverId && params.allowReassign !== true) {
        const dupErr = new Error(`Conflict: Delivery "${params.assignmentId}" is already assigned to driver "${prev.driverId}".`) as any;
        dupErr.statusCode = 409;
        throw dupErr;
      }

      // Anti-Cross-Seller Tampering Guard
      if (isSeller && prev.sellerId !== params.actorId) {
        throw new Error('Forbidden: You can only assign drivers to your own deliveries');
      }
      if (!isAdmin && !isSeller) {
        throw new Error('Forbidden: Only authorized sellers or admins can assign drivers');
      }

      const now = new Date().toISOString();

      // Section 7: Server-side driver existence, active status, and tenant authorization checks
      let resolvedDriverName = params.driverName;
      let resolvedDriverPhone = params.driverPhone;
      let resolvedVehicleInfo = params.vehicleInfo;

      if (params.driverId) {
        const driver = this.getDriverById(params.driverId);
        if (!driver) {
          throw new Error(`Driver not found: Driver "${params.driverId}" does not exist in registry.`);
        }
        if (driver.status === 'OFFLINE' || driver.status === 'SUSPENDED') {
          throw new Error(`Cannot assign driver with status ${driver.status}`);
        }
        if ((driver as any).sellerId && isSeller && (driver as any).sellerId !== params.actorId) {
          throw new Error('Forbidden: Driver belongs to a different seller or organization');
        }
        // Authoritative population
        resolvedDriverName = driver.name;
        resolvedDriverPhone = driver.phone;
        resolvedVehicleInfo = driver.plateNumber || driver.vehicleType || params.vehicleInfo;
      }

      const isReassignment = !!prev.assignedDriver && prev.assignedDriver !== resolvedDriverName;
      const newStatus: DeliveryAssignmentStatus = resolvedDriverName ? 'ASSIGNED' : prev.status;

      const updated: DeliveryAssignment = {
        ...prev,
        deliveryType: params.deliveryType,
        driverId: params.driverId || prev.driverId,
        assignedDriver: resolvedDriverName,
        driverName: resolvedDriverName || undefined,
        driverPhone: resolvedDriverPhone || prev.driverPhone,
        vehicleInfo: resolvedVehicleInfo || prev.vehicleInfo,
        status: newStatus,
        timestamps: {
          ...prev.timestamps,
          assignedAt: resolvedDriverName ? now : prev.timestamps.assignedAt,
        },
        updatedAt: now,
      };

      // F-10: Await authoritative Firestore update FIRST (Strictly Fail-Closed, no memory fallback on failure)
      try {
        await persistDeliveryDocToFirestore(DELIVERY_COLLECTION, params.assignmentId, updated, true);
      } catch (err: any) {
        handleFirestoreError(err, OperationType.UPDATE, `${DELIVERY_COLLECTION}/${params.assignmentId}`);
        throw new Error(`Database write failure (Fail-Closed): Unable to assign driver in Firestore (${err?.message || err})`);
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
    } finally {
      activeAssignmentLocks.delete(params.assignmentId);
    }
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
    if (activeAssignmentLocks.has(params.assignmentId)) {
      const conflictErr = new Error(`Conflict: Delivery assignment "${params.assignmentId}" is currently being modified by another concurrent request.`) as any;
      conflictErr.statusCode = 409;
      throw conflictErr;
    }
    activeAssignmentLocks.add(params.assignmentId);

    try {
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
      const isDriver = params.actorRole === 'DRIVER';

      if (isCustomer) {
        throw new Error('Customers do not have authority to alter delivery operational status');
      }

      if (!isAdmin && !isSeller && !isDriver) {
        throw new Error('Unauthorized: You do not have permissions to modify delivery status');
      }

      // Anti-Cross-Seller Tampering Guard
      if (isSeller && prev.sellerId !== params.actorId) {
        throw new Error('Forbidden: You can only update delivery status for your own store shipments');
      }

      // Driver isolation and capability guard
      if (isDriver) {
        const isAssigned =
          prev.driverId === params.actorId ||
          prev.assignedDriver === params.actorId ||
          (prev.driverName && prev.driverName.toLowerCase().includes(params.actorId.toLowerCase()));
        if (!isAssigned) {
          throw new Error('Forbidden: You can only update deliveries that are assigned to you');
        }
        const allowedForDriver = ['PICKED_UP', 'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED'];
        if (!allowedForDriver.includes(targetNorm)) {
          throw new Error(`Drivers can only update transit and completion statuses (${allowedForDriver.join(', ')})`);
        }
      }

      // Role lifecycle capability checks
      if (!isAdmin) {
        if (isSeller) {
          const allowedForSeller = ['PREPARING', 'READY', 'CANCELLED'];
          if (
            prev.deliveryType === 'SELLER_DELIVERY' ||
            prev.deliveryType === 'seller_delivery'
          ) {
            allowedForSeller.push('OUT_FOR_DELIVERY', 'PICKED_UP', 'DELIVERED', 'FAILED');
          }
          if (!allowedForSeller.includes(targetNorm)) {
            throw new Error(`Sellers cannot transition directly to ${targetNorm} under platform fulfillment`);
          }
        }
      }

      // Terminal state protection: deliveries once DELIVERED or CANCELLED cannot be reopened
      if ((currentNorm === 'DELIVERED' || currentNorm === 'CANCELLED') && targetNorm !== currentNorm) {
        throw new Error(`Terminal delivery status '${currentNorm}' is immutable and cannot be transitioned to '${targetNorm}'`);
      }

      // F-10: Strict step-by-step state transition enforcement
      const ALLOWED_TRANSITIONS: Partial<Record<DeliveryAssignmentStatus, DeliveryAssignmentStatus[]>> = {
        PENDING: ['ASSIGNED', 'PREPARING', 'READY', 'CANCELLED'],
        ASSIGNED: ['PREPARING', 'READY', 'PICKED_UP', 'CANCELLED'],
        PREPARING: ['READY', 'CANCELLED'],
        READY: ['PICKED_UP', 'OUT_FOR_DELIVERY', 'CANCELLED'],
        PICKED_UP: ['OUT_FOR_DELIVERY', 'FAILED', 'CANCELLED'],
        OUT_FOR_DELIVERY: ['DELIVERED', 'FAILED'],
        FAILED: ['ASSIGNED', 'RESCHEDULED', 'CANCELLED'],
        RESCHEDULED: ['ASSIGNED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'CANCELLED'],
        DELIVERED: [],
        CANCELLED: [],
      };

      const validNextStates = ALLOWED_TRANSITIONS[currentNorm] || [];
      if (targetNorm !== currentNorm && !validNextStates.includes(targetNorm)) {
        throw new Error(
          `Invalid delivery lifecycle transition from '${currentNorm}' to '${targetNorm}'. Allowed transitions: ${validNextStates.join(', ') || 'none (terminal state)'}`
        );
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

      // F-10: Await authoritative Firestore update FIRST (Strictly Fail-Closed, no memory fallback on failure)
      try {
        await persistDeliveryDocToFirestore(DELIVERY_COLLECTION, params.assignmentId, updated, true);
      } catch (err: any) {
        handleFirestoreError(err, OperationType.UPDATE, `${DELIVERY_COLLECTION}/${params.assignmentId}`);
        throw new Error(`Database write failure (Fail-Closed): Unable to update delivery status in Firestore (${err?.message || err})`);
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

      // Synchronize authoritative order fulfillment status with orderService
      if (targetNorm === 'DELIVERED') {
        try {
          orderService.updateOrderStatus(prev.orderId, 'delivered', params.actorId, params.actorRole);
        } catch (err) {
          console.warn(`[DeliveryService] Order status sync warning for ${prev.orderId}:`, err);
        }
      } else if (targetNorm === 'OUT_FOR_DELIVERY' || targetNorm === 'PICKED_UP') {
        try {
          orderService.updateOrderStatus(prev.orderId, 'shipped', params.actorId, params.actorRole);
        } catch (err) {
          console.warn(`[DeliveryService] Order status sync warning for ${prev.orderId}:`, err);
        }
      }

      return updated;
    } finally {
      activeAssignmentLocks.delete(params.assignmentId);
    }
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
      await persistDeliveryDocToFirestore(DELIVERY_COLLECTION, id, newAssignment, false);
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
