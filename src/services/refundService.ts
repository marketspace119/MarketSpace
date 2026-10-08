import { doc, getDocs, collection, updateDoc, query, where, limit } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { RefundRequest, RefundStatus, UserRole } from '../types';
import { auditLogService } from './auditLogService';
import { orderService } from './orderService';

const REFUNDS_STORAGE_KEY = 'marketspace_refund_requests_v1';
const REFUNDS_COLLECTION = 'refundRequests';

// Financial UI Integrity: Zero synthetic refund records.
// Real financial records must strictly originate from authoritative database.
export const INITIAL_REFUNDS: RefundRequest[] = [];

let memoryRefunds: RefundRequest[] = [];

function loadRefunds(): RefundRequest[] {
  if (memoryRefunds.length > 0) return memoryRefunds;
  // F-20: Do not read or trust localStorage for refund authority
  return INITIAL_REFUNDS;
}

function persistRefunds(refunds: RefundRequest[]) {
  memoryRefunds = refunds;
  // F-20: LocalStorage persistence removed for authoritative refund state
}

export const refundService = {
  resetMemoryState() {
    memoryRefunds = [];
  },

  clearUserCache() {
    this.resetMemoryState();
  },

  /**
   * Seed refund requests in memory for deterministic test fixtures and audits
   */
  seedRefunds(refunds: RefundRequest[]) {
    memoryRefunds = [...refunds];
  },

  async syncWithFirestore(filter?: { customerId?: string; sellerId?: string; isAdmin?: boolean }): Promise<RefundRequest[]> {
    try {
      let q;
      if (filter?.isAdmin) {
        q = query(collection(db, REFUNDS_COLLECTION), limit(200));
      } else if (filter?.customerId) {
        q = query(collection(db, REFUNDS_COLLECTION), where('customerId', '==', filter.customerId), limit(200));
      } else if (filter?.sellerId) {
        q = query(collection(db, REFUNDS_COLLECTION), where('sellerId', '==', filter.sellerId), limit(200));
      }

      if (q) {
        const snap = await getDocs(q);
        if (!snap.empty) {
          const cloudRefunds: RefundRequest[] = [];
          snap.forEach(d => cloudRefunds.push(d.data() as RefundRequest));
          persistRefunds(cloudRefunds);
          return cloudRefunds;
        }
      }
    } catch (err) {
      console.warn('Refunds Firestore sync offline:', err);
    }
    return loadRefunds();
  },

  getAllRefunds(): RefundRequest[] {
    return loadRefunds();
  },

  getRefundsBySeller(sellerId: string): RefundRequest[] {
    return loadRefunds().filter(r => r.sellerId === sellerId);
  },

  getRefundsByCustomer(customerId: string): RefundRequest[] {
    return loadRefunds().filter(r => r.customerId === customerId);
  },

  getRefundsByOrder(orderId: string): RefundRequest[] {
    return loadRefunds().filter(r => r.orderId === orderId);
  },

  getRemainingRefundable(orderId: string): number {
    const order = orderService.getOrderById(orderId, undefined, 'ADMIN');
    if (!order) return 0;
    const existingRefunds = this.getRefundsByOrder(orderId).filter(
      r => r.status !== 'REFUND_REJECTED'
    );
    const totalRefundedOrPending = existingRefunds.reduce((sum, r) => sum + r.amount, 0);
    return Math.max(0, order.total - totalRefundedOrPending);
  },

  /**
   * Customer initiates a refund request for an order.
   * Validates order existence, customer ownership, seller assignment, and max allowable amount.
   */
  async requestRefund(params: {
    orderId: string;
    subOrderId?: string;
    customerId: string;
    customerName: string;
    customerPhone: string;
    sellerId?: string;
    storeId?: string;
    amount: number;
    reason: RefundRequest['reason'];
    notes?: string;
  }): Promise<RefundRequest> {
    const amount = Number(params.amount);
    if (isNaN(amount) || !isFinite(amount) || amount <= 0) {
      throw new Error('مبلغ الاسترداد يجب أن يكون رقماً موجباً أكبر من الصفر (Invalid refund amount: must be greater than zero)');
    }

    const order = orderService.getOrderById(params.orderId, params.customerId, 'CUSTOMER');
    if (!order) {
      const anyOrder = orderService.getOrderById(params.orderId, undefined, 'ADMIN');
      if (anyOrder && anyOrder.customerId !== params.customerId) {
        throw new Error('Forbidden: لا يمكنك طلب استرداد لطلب لا يخصك (You cannot request a refund for an order you do not own)');
      }
      throw new Error('الطلب غير موجود (Order not found)');
    }

    if (amount > order.total) {
      throw new Error(`مبلغ الاسترداد المطلوب ($${amount}) يتجاوز إجمالي الطلب ($${order.total}) (Refund amount cannot exceed order total)`);
    }

    const existingRefunds = this.getRefundsByOrder(params.orderId).filter(
      r => r.status !== 'REFUND_REJECTED'
    );
    const totalRefundedOrPending = existingRefunds.reduce((sum, r) => sum + r.amount, 0);
    const remainingRefundable = Math.max(0, order.total - totalRefundedOrPending);

    if (amount > remainingRefundable) {
      throw new Error(`مبلغ الاسترداد المطلوب ($${amount}) يتجاوز الرصيد المتبقي القابل للاسترداد ($${remainingRefundable})`);
    }

    return this.createRefundRequest({
      ...params,
      sellerId: params.sellerId || (order.vendorOrders?.[0]?.sellerId || ''),
      storeId: params.storeId || (order.vendorOrders?.[0]?.storeId || ''),
      notes: params.notes || '',
    });
  },

  async createRefundRequest(params: {
    orderId: string;
    subOrderId?: string;
    customerId?: string;
    customerName?: string;
    customerPhone?: string;
    sellerId?: string;
    storeId?: string;
    amount: number;
    reason: RefundRequest['reason'];
    notes?: string;
  }): Promise<RefundRequest> {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error('UNAUTHENTICATED: Authentication required to submit a refund request (تسجيل الدخول مطلوب لتقديم طلب استرداد)');
    }

    const idToken = await currentUser.getIdToken();
    const baseUrl = typeof window !== 'undefined' ? '' : (process.env.API_BASE_URL || '');
    const res = await fetch(`${baseUrl}/api/refunds/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        orderId: params.orderId,
        subOrderId: params.subOrderId,
        amount: Number(params.amount),
        reason: params.reason,
        notes: params.notes,
      }),
    });

    const data = await res.json();
    if (!res.ok || !data.success || !data.refund) {
      throw new Error(data.error || 'Failed to process refund request');
    }

    const createdRefund: RefundRequest = data.refund;
    const refunds = loadRefunds();
    const existingIndex = refunds.findIndex(r => r.id === createdRefund.id);
    if (existingIndex >= 0) {
      refunds[existingIndex] = createdRefund;
    } else {
      refunds.unshift(createdRefund);
    }
    persistRefunds(refunds);

    return createdRefund;
  },

  async processRefund(params: {
    refundId: string;
    newStatus: RefundStatus;
    adminId: string;
    adminRole?: UserRole;
    settlementReference?: string;
    adminNotes?: string;
  }): Promise<RefundRequest> {
    const adminRole = params.adminRole || 'ADMIN';
    const refunds = loadRefunds();
    const target = refunds.find(r => r.id === params.refundId);
    if (!target) throw new Error('Refund request not found');

    if (
      target.status === 'REFUNDED' ||
      target.status === 'REFUND_REJECTED' ||
      target.status === 'REJECTED' ||
      (target.status as any) === 'completed'
    ) {
      throw new Error('Terminal state: settled refund cannot be modified (تمت تسويته مسبقاً - terminal)');
    }

    if (params.newStatus === 'REFUNDED') {
      const ref = params.settlementReference?.trim() || '';
      if (!ref || ref.length < 4) {
        throw new Error('رقم إشعار / مرجع التحويل المالي مطلوب ويجب أن يحتوي على 4 أحرف على الأقل');
      }
      return this.recordSettlement(
        params.refundId,
        {
          settlementType: 'MANUAL_MOBILE_TRANSFER',
          settlementReference: ref,
          adminNotes: params.adminNotes,
        },
        params.adminId,
        adminRole
      );
    } else {
      const action = params.newStatus === 'REFUND_APPROVED' ? 'APPROVE' : 'REJECT';
      return this.reviewRefund(params.refundId, action, params.adminId, adminRole, params.adminNotes);
    }
  },

  /**
   * Admin approves or rejects refund request via Authoritative Backend Gateway (/api/refunds/review).
   * Finding 4 & Finding 18: Ensures atomic lock release on rejection and order refundStatus synchronization.
   */
  async reviewRefund(
    refundId: string,
    action: 'APPROVE' | 'REJECT',
    adminId: string,
    adminRole: UserRole,
    adminNotes?: string
  ): Promise<RefundRequest> {
    const isAdmin = adminRole === 'ADMIN' || adminRole === 'SUPER_ADMIN';
    if (!isAdmin) {
      throw new Error('Forbidden: Only administrators can review refund disputes');
    }

    const refunds = loadRefunds();
    const target = refunds.find(r => r.id === refundId);
    if (!target) throw new Error('Refund request not found');

    if (
      target.status === 'REFUNDED' ||
      target.status === 'REFUND_REJECTED' ||
      target.status === 'REJECTED' ||
      (target.status as any) === 'completed'
    ) {
      throw new Error('Terminal state: Settled refunds cannot be modified');
    }

    let updatedFromServer: RefundRequest | null = null;
    if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'test') {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
      const res = await fetch('/api/refunds/review', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ refundId, action, adminNotes }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success || !data.refund) {
        throw new Error(data.error || 'Failed to review refund request on authoritative gateway');
      }
      updatedFromServer = data.refund;
    } else {
      const now = new Date().toISOString();
      const nextStatus: RefundStatus = action === 'APPROVE' ? 'REFUND_APPROVED' : 'REFUND_REJECTED';
      try {
        const serverAdminModule = '../../server/firebaseAdmin';
        const { getAdminDb } = await import(/* @vite-ignore */ serverAdminModule);
        const adminDb = getAdminDb();
        if (!adminDb) {
          throw new Error('Database write failure (Fail-Closed): Firestore Admin DB unavailable');
        }
        await adminDb.collection(REFUNDS_COLLECTION).doc(refundId).set({
          ...target,
          status: nextStatus,
          processedBy: adminId,
          processedAt: now,
          updatedAt: now,
          adminNotes: adminNotes || target.adminNotes || '',
        }, { merge: true });

        // Synchronize order refundStatus
        if (target.orderId) {
          orderService.updateOrderRefundStatus(target.orderId, action === 'APPROVE' ? 'approved' : 'rejected');
        }

        // If rejected, release order_refund_locks and seller_payout_locks reservations (Finding 4 & Finding 18)
        if (action === 'REJECT') {
          if (target.orderId) {
            const rLockRef = adminDb.collection('order_refund_locks').doc(target.orderId);
            const rLockSnap = await rLockRef.get();
            if (rLockSnap.exists) {
              const rData = rLockSnap.data() || {};
              const releasedCum = Math.max(0, Number(((Number(rData.cumulativeRefunded) || 0) - target.amount).toFixed(2)));
              await rLockRef.set({ cumulativeRefunded: releasedCum, updatedAt: now }, { merge: true });
            }
          }
          if (target.sellerId) {
            const sLockRef = adminDb.collection('seller_payout_locks').doc(target.sellerId);
            const sLockSnap = await sLockRef.get();
            if (sLockSnap.exists) {
              const sData = sLockSnap.data() || {};
              const releasedRes = Math.max(0, Number(((Number(sData.totalRefundReserved) || 0) - target.amount).toFixed(2)));
              await sLockRef.set({ totalRefundReserved: releasedRes, updatedAt: now }, { merge: true });
            }
          }
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `${REFUNDS_COLLECTION}/${refundId}`);
        throw err;
      }
      updatedFromServer = {
        ...target,
        status: nextStatus,
        processedBy: adminId,
        processedAt: now,
        updatedAt: now,
        adminNotes: adminNotes || target.adminNotes || '',
      };
    }

    Object.assign(target, updatedFromServer);
    persistRefunds(refunds);

    await auditLogService.logAction({
      actorId: adminId,
      actorRole: adminRole,
      action: action === 'APPROVE' ? 'REFUND_APPROVED' : ('REFUND_REJECTED' as any),
      targetType: 'refund',
      targetId: refundId,
      targetName: `Refund for Order ${target.orderId}`,
      metadata: { status: target.status, amount: target.amount },
    });

    return target;
  },

  /**
   * Admin records the actual manual mobile money settlement (EVC Plus, Zaad, Sahal, Cash)
   * via Authoritative Backend Gateway (/api/refunds/settle).
   * Finding 4 & Finding 18: Atomically updates seller_financial_ledgers and order refundStatus.
   */
  async recordSettlement(
    refundId: string,
    params: {
      settlementType: 'MANUAL_MOBILE_TRANSFER' | 'CASH' | 'STORE_CREDIT';
      settlementReference: string;
      adminNotes?: string;
    },
    adminId: string,
    adminRole: UserRole
  ): Promise<RefundRequest> {
    const isAdmin = adminRole === 'ADMIN' || adminRole === 'SUPER_ADMIN';
    if (!isAdmin) {
      throw new Error('Forbidden: Only administrators can settle refunds');
    }

    const refunds = loadRefunds();
    const target = refunds.find(r => r.id === refundId);
    if (!target) throw new Error('Refund request not found');

    const trimmedRef = params.settlementReference.trim();
    if (!trimmedRef || trimmedRef.length < 4) {
      throw new Error('رقم إشعار / مرجع التحويل المالي مطلوب ويجب أن يحتوي على 4 خانات على الأقل');
    }
    if (target.status === 'REFUNDED') {
      throw new Error('Terminal state: Refund has already been settled and completed');
    }
    if (target.status !== 'REFUND_APPROVED') {
      throw new Error('يجب اعتماد طلب الاسترداد أولاً قبل تسجيل التسوية المالية');
    }

    let settledFromServer: RefundRequest | null = null;
    if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'test') {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
      const res = await fetch('/api/refunds/settle', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          refundId,
          settlementType: params.settlementType,
          settlementReference: trimmedRef,
          adminNotes: params.adminNotes,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success || !data.refund) {
        throw new Error(data.error || 'Failed to settle refund request on authoritative gateway');
      }
      settledFromServer = data.refund;
    } else {
      const now = new Date().toISOString();
      try {
        const serverAdminModule = '../../server/firebaseAdmin';
        const { getAdminDb } = await import(/* @vite-ignore */ serverAdminModule);
        const adminDb = getAdminDb();
        if (!adminDb) {
          throw new Error('Database write failure (Fail-Closed): Firestore Admin DB unavailable');
        }
        await adminDb.collection(REFUNDS_COLLECTION).doc(refundId).set({
          ...target,
          status: 'REFUNDED',
          settlementType: params.settlementType,
          settlementReference: trimmedRef,
          processedBy: adminId,
          processedAt: now,
          updatedAt: now,
          adminNotes: params.adminNotes || target.adminNotes || '',
        }, { merge: true });

        if (target.orderId) {
          orderService.updateOrderRefundStatus(target.orderId, 'refunded');
        }

        if (target.sellerId) {
          const ledgerRef = adminDb.collection('seller_financial_ledgers').doc(target.sellerId);
          const ledgerSnap = await ledgerRef.get();
          if (ledgerSnap.exists) {
            const lData = ledgerSnap.data() || {};
            const nextSettledRefunds = Number(((Number(lData.lifetimeSettledRefunds) || 0) + target.amount).toFixed(2));
            await ledgerRef.set({
              lifetimeSettledRefunds: nextSettledRefunds,
              version: (Number(lData.version) || 1) + 1,
            }, { merge: true });
          }
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `${REFUNDS_COLLECTION}/${refundId}`);
        throw err;
      }
      settledFromServer = {
        ...target,
        status: 'REFUNDED',
        settlementType: params.settlementType,
        settlementReference: trimmedRef,
        processedBy: adminId,
        processedAt: now,
        updatedAt: now,
        adminNotes: params.adminNotes || target.adminNotes || '',
      };
    }

    Object.assign(target, settledFromServer);
    persistRefunds(refunds);

    await auditLogService.logAction({
      actorId: adminId,
      actorRole: adminRole,
      action: 'REFUND_SETTLED' as any,
      targetType: 'refund',
      targetId: refundId,
      targetName: `Refund ${refundId}`,
      metadata: {
        settlementType: params.settlementType,
        settlementReference: params.settlementReference,
        amount: target.amount,
      },
    });

    return target;
  },

  getRefundRequests(): RefundRequest[] {
    return loadRefunds();
  },

  async approveRefund(
    refundId: string,
    adminId: string,
    adminRole: UserRole,
    adminNotes?: string
  ): Promise<RefundRequest> {
    return this.reviewRefund(refundId, 'APPROVE', adminId, adminRole, adminNotes);
  },

  async rejectRefund(
    refundId: string,
    adminId: string,
    adminRole: UserRole,
    adminNotes?: string
  ): Promise<RefundRequest> {
    return this.reviewRefund(refundId, 'REJECT', adminId, adminRole, adminNotes);
  },
};
