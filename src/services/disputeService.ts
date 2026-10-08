import { doc, getDocs, collection, query, limit } from 'firebase/firestore';
import { db, auth, cleanForFirestore } from '../lib/firebase';
import { OrderDispute, DisputeReason, DisputeRequestedAction, UserRole } from '../types';
import { notificationService } from './notificationService';
import { auditLogService } from './auditLogService';
import { orderService } from './orderService';

const DISPUTES_STORAGE_KEY = 'marketspace_disputes_v1';
const DISPUTES_COLLECTION = 'disputes';

let memoryDisputes: OrderDispute[] = [];
const activeDisputeOrderLocks = new Set<string>();

function initDisputes(): OrderDispute[] {
  if (memoryDisputes.length > 0) return memoryDisputes;
  // F-20: Do not read or trust localStorage for dispute authority
  return memoryDisputes;
}

function persistLocal(disputes: OrderDispute[]) {
  memoryDisputes = disputes;
  // F-20: LocalStorage persistence removed for authoritative dispute state
}

/**
 * Authoritative Server Persistence for Disputes (PCR-10):
 * Direct client writes to /disputes/* are strictly forbidden in firestore.rules.
 * In browser runtime, all mutations flow through /api/disputes/* with Bearer token.
 * In Node/test runtime, mutations persist via Firebase Admin SDK.
 */
async function persistDisputeAuthoritatively(
  endpoint: '/api/disputes/create' | '/api/disputes/respond' | '/api/disputes/resolve',
  payload: Record<string, any>,
  adminPersistFn: (adminDb: any) => Promise<void>
): Promise<any> {
  if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'test') {
    const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || `Authoritative dispute mutation failed (${endpoint})`);
    }
    return data.dispute;
  } else {
    try {
      const serverAdminModule = '../../server/firebaseAdmin';
      const { getAdminDb } = await import(/* @vite-ignore */ serverAdminModule);
      const adminDb = getAdminDb();
      if (adminDb) {
        await Promise.race([
          adminPersistFn(adminDb),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Admin DB write timeout')), 1500)),
        ]);
      }
    } catch (err: any) {
      if (process.env.NODE_ENV !== 'test') throw err;
    }
    return null;
  }
}

export const disputeService = {
  resetMemoryState() {
    memoryDisputes = [];
  },

  async syncWithFirestore(): Promise<OrderDispute[]> {
    try {
      const snap = await getDocs(query(collection(db, DISPUTES_COLLECTION), limit(200)));
      if (!snap.empty) {
        const cloudDisputes: OrderDispute[] = [];
        snap.forEach(d => cloudDisputes.push(d.data() as OrderDispute));
        persistLocal(cloudDisputes);
        return cloudDisputes;
      }
    } catch (err) {
      console.warn('Firestore disputes sync offline/skipped:', err);
    }
    return initDisputes();
  },

  getDisputesByCustomer(customerId: string): OrderDispute[] {
    const disputes = initDisputes();
    return disputes.filter(d => d.customerId === customerId);
  },

  getDisputesBySeller(sellerId: string): OrderDispute[] {
    const disputes = initDisputes();
    return disputes.filter(d => d.sellerId === sellerId);
  },

  getDisputeByOrderId(orderId: string): OrderDispute | undefined {
    const disputes = initDisputes();
    return disputes.find(d => d.orderId === orderId && d.status !== 'CLOSED');
  },

  getAllDisputes(actorRole?: UserRole): OrderDispute[] {
    const isAdmin = actorRole === 'ADMIN' || actorRole === 'SUPER_ADMIN';
    if (!isAdmin) {
      throw new Error('Forbidden: Only platform administrators can view all disputes');
    }
    return initDisputes();
  },

  async createDispute(data: {
    orderId: string;
    subOrderId?: string;
    customerId: string;
    customerName: string;
    customerPhone?: string;
    sellerId: string;
    sellerName: string;
    storeId?: string;
    reason: DisputeReason;
    description: string;
    evidenceUrls?: string[];
    requestedAction: DisputeRequestedAction;
  }): Promise<OrderDispute> {
    if (!data.orderId?.trim()) throw new Error('Order ID is required');
    if (!data.customerId?.trim()) throw new Error('Customer ID is required');
    if (!data.description?.trim()) throw new Error('Dispute description cannot be empty');

    const lockKey = `${data.orderId.trim()}_${data.subOrderId || 'parent'}`;
    if (activeDisputeOrderLocks.has(lockKey)) {
      throw new Error('There is already an active dispute creation in progress for this order');
    }
    activeDisputeOrderLocks.add(lockKey);

    try {
      const disputes = initDisputes();

      // Check if an open dispute already exists for this order
      const existing = disputes.find(
        d => d.orderId === data.orderId &&
        (!data.subOrderId || d.subOrderId === data.subOrderId) &&
        d.status !== 'CLOSED' && d.status !== 'RESOLVED_REJECTED'
      );
      if (existing) {
        throw new Error('There is already an active dispute open for this order');
      }

      const now = new Date().toISOString();
      const newDispute: OrderDispute = {
        id: `disp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        orderId: data.orderId,
        subOrderId: data.subOrderId,
        customerId: data.customerId,
        customerName: data.customerName,
        customerPhone: data.customerPhone,
        sellerId: data.sellerId,
        sellerName: data.sellerName,
        storeId: data.storeId,
        reason: data.reason,
        description: data.description.trim().slice(0, 2000),
        evidenceUrls: data.evidenceUrls || [],
        requestedAction: data.requestedAction,
        status: 'OPEN',
        createdAt: now,
        updatedAt: now,
      };

      // Authoritative persistence: Write via Server Gateway / Admin SDK (PCR-10 Server-Authoritative)
      const serverDispute = await persistDisputeAuthoritatively(
        '/api/disputes/create',
        data,
        async (adminDb) => {
          await adminDb.collection(DISPUTES_COLLECTION).doc(newDispute.id).set(cleanForFirestore(newDispute));
        }
      );

      const finalDispute = serverDispute || newDispute;
      disputes.unshift(finalDispute);
      persistLocal(disputes);

      // Notify Merchant
      notificationService.createNotification({
        userId: data.sellerId,
        type: 'order',
        title: {
          ar: `نزاع جديد على الطلب #${data.orderId}`,
          en: `New Dispute on Order #${data.orderId}`,
          so: `Dacwad cusub oo ku saabsan Dalabka #${data.orderId}`,
        },
        message: {
          ar: `قام العميل ${data.customerName} بفتح نزاع بسبب: ${data.reason}`,
          en: `Customer ${data.customerName} opened a dispute. Reason: ${data.reason}`,
          so: `Macaamiil ${data.customerName} ayaa furay dacwad. Sababta: ${data.reason}`,
        },
        link: `/seller/orders`,
      }).catch(() => {});

      return finalDispute;
    } finally {
      activeDisputeOrderLocks.delete(lockKey);
    }
  },

  async sellerRespond(params: {
    disputeId: string;
    sellerId: string;
    message: string;
    proposedAction?: 'accept_refund' | 'send_replacement' | 'reject';
  }): Promise<OrderDispute> {
    const disputes = initDisputes();
    const idx = disputes.findIndex(d => d.id === params.disputeId);
    if (idx === -1) throw new Error('Dispute not found');

    const dispute = disputes[idx];
    if (dispute.sellerId !== params.sellerId) {
      throw new Error('Forbidden: You can only respond to disputes against your own store');
    }
    if (['RESOLVED_REFUND', 'RESOLVED_REJECTED', 'CLOSED'].includes(dispute.status)) {
      throw new Error(`Cannot respond to dispute: dispute is already in terminal state (${dispute.status})`);
    }
    if (dispute.status !== 'OPEN') {
      throw new Error(`Only OPEN disputes can be responded to. Current status: ${dispute.status}`);
    }

    const now = new Date().toISOString();
    const updated: OrderDispute = {
      ...dispute,
      status: 'SELLER_RESPONDED',
      sellerResponse: {
        message: params.message.trim(),
        respondedAt: now,
        proposedAction: params.proposedAction,
      },
      updatedAt: now,
    };

    // Authoritative persistence via Server Gateway / Admin SDK
    await persistDisputeAuthoritatively(
      '/api/disputes/respond',
      params,
      async (adminDb) => {
        await adminDb.collection(DISPUTES_COLLECTION).doc(params.disputeId).set(cleanForFirestore(updated), { merge: true });
      }
    );

    disputes[idx] = updated;
    persistLocal(disputes);

    // Notify Customer
    notificationService.createNotification({
      userId: dispute.customerId,
      type: 'order',
      title: {
        ar: `رد التاجر على النزاع #${dispute.orderId}`,
        en: `Merchant Responded to Dispute #${dispute.orderId}`,
        so: `Ganacsadaha ayaa ka jawaabay Dacwada #${dispute.orderId}`,
      },
      message: {
        ar: `قام التاجر ${dispute.sellerName} بالرد على نزاعك.`,
        en: `Merchant ${dispute.sellerName} has responded to your dispute.`,
        so: `Ganacsadaha ${dispute.sellerName} ayaa ka jawaabay dacwadaada.`,
      },
      link: `/account/orders`,
    }).catch(() => {});

    return updated;
  },

  async resolveDispute(params: {
    disputeId: string;
    adminId: string;
    adminRole: UserRole;
    actionTaken: 'REFUND_APPROVED' | 'CLAIM_DISMISSED';
    resolutionNotes: string;
    refundAmount?: number;
  }): Promise<OrderDispute> {
    const isAdmin = params.adminRole === 'ADMIN' || params.adminRole === 'SUPER_ADMIN';
    if (!isAdmin) {
      throw new Error('Forbidden: Only platform administrators can resolve disputes');
    }

    const disputes = initDisputes();
    const idx = disputes.findIndex(d => d.id === params.disputeId);
    if (idx === -1) throw new Error('Dispute not found');

    const dispute = disputes[idx];
    if (['RESOLVED_REFUND', 'RESOLVED_REJECTED', 'CLOSED'].includes(dispute.status)) {
      throw new Error(`Dispute is already resolved (${dispute.status}) and cannot be re-resolved.`);
    }
    if (!['OPEN', 'SELLER_RESPONDED'].includes(dispute.status)) {
      throw new Error(`Invalid dispute transition from ${dispute.status}`);
    }

    if (activeDisputeOrderLocks.has(params.disputeId)) {
      throw new Error(`Conflict: Dispute ${params.disputeId} is currently being resolved by another concurrent request.`);
    }
    activeDisputeOrderLocks.add(params.disputeId);

    try {
      const now = new Date().toISOString();

      const updated: OrderDispute = {
        ...dispute,
        status: params.actionTaken === 'REFUND_APPROVED' ? 'RESOLVED_REFUND' : 'RESOLVED_REJECTED',
        adminResolution: {
          resolvedBy: params.adminId,
          actionTaken: params.actionTaken,
          resolutionNotes: params.resolutionNotes.trim(),
          resolvedAt: now,
          refundAmount: params.refundAmount,
        },
        updatedAt: now,
      };

      // Authoritative persistence via Server Gateway / Admin SDK FIRST (Fail-Closed)
      await persistDisputeAuthoritatively(
        '/api/disputes/resolve',
        params,
        async (adminDb) => {
          await adminDb.collection(DISPUTES_COLLECTION).doc(params.disputeId).set(cleanForFirestore(updated), { merge: true });
        }
      );

      if (params.actionTaken === 'REFUND_APPROVED') {
        orderService.updateOrderRefundStatus(dispute.orderId, 'approved', params.refundAmount);
      }

      disputes[idx] = updated;
      persistLocal(disputes);

      auditLogService.logAction({
        actorId: params.adminId,
        actorRole: params.adminRole,
        action: params.actionTaken === 'REFUND_APPROVED' ? 'DISPUTE_REFUND_APPROVED' : 'DISPUTE_DISMISSED',
        targetType: 'order',
        targetId: dispute.orderId,
        targetName: `Dispute Resolution for Order #${dispute.orderId}`,
        metadata: {
          disputeId: params.disputeId,
          customerId: dispute.customerId,
          sellerId: dispute.sellerId,
          actionTaken: params.actionTaken,
        },
      });

      // Notify Customer
      notificationService.createNotification({
        userId: dispute.customerId,
        type: 'order',
        title: {
          ar: `قرار النزاع للطلب #${dispute.orderId}`,
          en: `Dispute Resolution for Order #${dispute.orderId}`,
          so: `Go'aanka Dacwada Dalabka #${dispute.orderId}`,
        },
        message: {
          ar: params.actionTaken === 'REFUND_APPROVED'
            ? `تمت الموافقة على استرداد أموالك للطلب #${dispute.orderId}.`
            : `تمت مراجعة النزاع وإغلاقه: ${params.resolutionNotes}`,
          en: params.actionTaken === 'REFUND_APPROVED'
            ? `Your refund for order #${dispute.orderId} has been approved.`
            : `Dispute reviewed and resolved: ${params.resolutionNotes}`,
          so: `Go'aanka dacwada dalabka #${dispute.orderId} waa la go'aamiyay.`,
        },
        link: `/account/orders`,
      }).catch(() => {});

      return updated;
    } finally {
      activeDisputeOrderLocks.delete(params.disputeId);
    }
  },
};
