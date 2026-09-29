import { doc, getDocs, collection, setDoc, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { OrderDispute, DisputeReason, DisputeRequestedAction, UserRole } from '../types';
import { notificationService } from './notificationService';
import { auditLogService } from './auditLogService';

const DISPUTES_STORAGE_KEY = 'marketspace_disputes_v1';
const DISPUTES_COLLECTION = 'disputes';

let memoryDisputes: OrderDispute[] = [];

function initDisputes(): OrderDispute[] {
  if (memoryDisputes.length > 0) return memoryDisputes;
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(DISPUTES_STORAGE_KEY);
    memoryDisputes = raw ? JSON.parse(raw) : [];
    return memoryDisputes;
  } catch (err) {
    console.error('Failed to load disputes', err);
    return [];
  }
}

function persistLocal(disputes: OrderDispute[]) {
  memoryDisputes = disputes;
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(DISPUTES_STORAGE_KEY, JSON.stringify(disputes));
  } catch (err) {
    console.error('Failed to save disputes to localStorage', err);
  }
}

export const disputeService = {
  resetMemoryState() {
    memoryDisputes = [];
  },

  async syncWithFirestore(): Promise<OrderDispute[]> {
    try {
      const snap = await getDocs(collection(db, DISPUTES_COLLECTION));
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

  createDispute(data: {
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
  }): OrderDispute {
    if (!data.orderId?.trim()) throw new Error('Order ID is required');
    if (!data.customerId?.trim()) throw new Error('Customer ID is required');
    if (!data.description?.trim()) throw new Error('Dispute description cannot be empty');

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

    disputes.unshift(newDispute);
    persistLocal(disputes);

    // Persist to Cloud Firestore
    setDoc(doc(db, DISPUTES_COLLECTION, newDispute.id), newDispute).catch(err => {
      console.warn('Could not write dispute to Firestore immediately:', err);
    });

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

    return newDispute;
  },

  sellerRespond(params: {
    disputeId: string;
    sellerId: string;
    message: string;
    proposedAction?: 'accept_refund' | 'send_replacement' | 'reject';
  }): OrderDispute {
    const disputes = initDisputes();
    const idx = disputes.findIndex(d => d.id === params.disputeId);
    if (idx === -1) throw new Error('Dispute not found');

    const dispute = disputes[idx];
    if (dispute.sellerId !== params.sellerId) {
      throw new Error('Forbidden: You can only respond to disputes against your own store');
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

    disputes[idx] = updated;
    persistLocal(disputes);

    updateDoc(doc(db, DISPUTES_COLLECTION, params.disputeId), {
      status: updated.status,
      sellerResponse: updated.sellerResponse,
      updatedAt: now,
    }).catch(err => {
      handleFirestoreError(err, OperationType.UPDATE, `${DISPUTES_COLLECTION}/${params.disputeId}`);
    });

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

  resolveDispute(params: {
    disputeId: string;
    adminId: string;
    adminRole: UserRole;
    actionTaken: 'REFUND_APPROVED' | 'CLAIM_DISMISSED';
    resolutionNotes: string;
    refundAmount?: number;
  }): OrderDispute {
    const isAdmin = params.adminRole === 'ADMIN' || params.adminRole === 'SUPER_ADMIN';
    if (!isAdmin) {
      throw new Error('Forbidden: Only platform administrators can resolve disputes');
    }

    const disputes = initDisputes();
    const idx = disputes.findIndex(d => d.id === params.disputeId);
    if (idx === -1) throw new Error('Dispute not found');

    const dispute = disputes[idx];
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

    disputes[idx] = updated;
    persistLocal(disputes);

    updateDoc(doc(db, DISPUTES_COLLECTION, params.disputeId), {
      status: updated.status,
      adminResolution: updated.adminResolution,
      updatedAt: now,
    }).catch(err => {
      handleFirestoreError(err, OperationType.UPDATE, `${DISPUTES_COLLECTION}/${params.disputeId}`);
    });

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
  },
};
