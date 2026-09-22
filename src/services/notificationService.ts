import {
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  onSnapshot,
  writeBatch,
} from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { NotificationItem, NotificationEventType, LocalizedString } from '../types';

const NOTIFICATIONS_STORAGE_KEY = 'marketspace_notifications_v1';
const NOTIFICATIONS_COLLECTION = 'notifications';

let memoryNotifications: NotificationItem[] = [];

function loadStorage(): NotificationItem[] {
  if (memoryNotifications.length > 0) return memoryNotifications;
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(NOTIFICATIONS_STORAGE_KEY);
    if (!raw) return [];
    memoryNotifications = JSON.parse(raw);
    return memoryNotifications;
  } catch (err) {
    console.error('Failed to parse notifications storage:', err);
    return [];
  }
}

function persistStorage(items: NotificationItem[]) {
  memoryNotifications = items;
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, JSON.stringify(items));
  } catch (err) {
    console.error('Failed to save notifications to storage:', err);
  }
}

export const notificationService = {
  /**
   * Real-time subscription to user's notifications
   */
  subscribeToUserNotifications(
    userId: string,
    onUpdate: (notifications: NotificationItem[]) => void,
    onError?: (error: Error) => void
  ): () => void {
    if (!userId) {
      onUpdate([]);
      return () => {};
    }

    // Strict identity validation: Ensure Firebase Auth state matches supplied userId before attaching listener
    const currentUid = auth.currentUser?.uid;
    if (!currentUid || currentUid !== userId) {
      return () => {};
    }

    try {
      const q = query(
        collection(db, NOTIFICATIONS_COLLECTION),
        where('userId', '==', userId)
      );

      const unsubscribe = onSnapshot(
        q,
        snapshot => {
          const cloud: NotificationItem[] = [];
          snapshot.forEach(docSnap => {
            cloud.push(docSnap.data() as NotificationItem);
          });
          const sorted = cloud.sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );

          // Update storage cache
          const others = loadStorage().filter(n => n.userId !== userId);
          persistStorage([...others, ...sorted]);
          onUpdate(sorted);
        },
        error => {
          if ((error as any).code === 'permission-denied') {
            console.error('[NotificationService:Security] Permission denied on notifications subscription for user:', userId, error);
            if (onError) onError(error);
            // CRITICAL: Do NOT disguise authorization failures by substituting stale/mock data
            return;
          }
          console.warn('[NotificationService:Network] Notifications snapshot network issue, using cached data:', error);
          const local = loadStorage().filter(n => n.userId === userId);
          onUpdate(local.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
        }
      );

      return unsubscribe;
    } catch (err: any) {
      if (err?.code === 'permission-denied') {
        console.error('[NotificationService:Security] Notifications subscription rejected by security rules:', err);
        if (onError) onError(err);
        return () => {};
      }
      console.warn('Real-time notifications subscription init failed:', err);
      const local = loadStorage().filter(n => n.userId === userId);
      onUpdate(local.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
      return () => {};
    }
  },

  async getNotificationsByUserId(userId: string): Promise<NotificationItem[]> {
    if (!userId) return [];
    try {
      const q = query(
        collection(db, NOTIFICATIONS_COLLECTION),
        where('userId', '==', userId)
      );
      const snapshot = await getDocs(q);
      const items: NotificationItem[] = [];
      snapshot.forEach(docSnap => {
        items.push(docSnap.data() as NotificationItem);
      });
      const sorted = items.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      const others = loadStorage().filter(n => n.userId !== userId);
      persistStorage([...others, ...sorted]);
      return sorted;
    } catch (err) {
      console.warn('Could not fetch notifications from Firestore, using local fallback:', err);
      const local = loadStorage().filter(n => n.userId === userId);
      return local.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
  },

  async markAsRead(id: string): Promise<void> {
    const list = loadStorage();
    const target = list.find(n => n.id === id);
    if (target) {
      target.read = true;
      persistStorage(list);
    }

    const docRef = doc(db, NOTIFICATIONS_COLLECTION, id);
    try {
      await updateDoc(docRef, { read: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `${NOTIFICATIONS_COLLECTION}/${id}`);
    }
  },

  async markAllAsRead(userId: string): Promise<void> {
    const list = loadStorage();
    list.forEach(n => {
      if (n.userId === userId) {
        n.read = true;
      }
    });
    persistStorage(list);

    try {
      const q = query(
        collection(db, NOTIFICATIONS_COLLECTION),
        where('userId', '==', userId),
        where('read', '==', false)
      );
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        const batch = writeBatch(db);
        snapshot.forEach(d => {
          batch.update(d.ref, { read: true });
        });
        await batch.commit();
      }
    } catch (err) {
      console.warn('Mark all as read in Firestore fallback:', err);
    }
  },

  async createNotification(
    notification: Omit<NotificationItem, 'id' | 'createdAt' | 'read'>
  ): Promise<NotificationItem> {
    const id = `notif_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const newNotif: NotificationItem = {
      ...notification,
      id,
      read: false,
      createdAt: new Date().toISOString(),
    };

    const list = loadStorage();
    list.unshift(newNotif);
    persistStorage(list);

    try {
      await setDoc(doc(db, NOTIFICATIONS_COLLECTION, id), newNotif);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `${NOTIFICATIONS_COLLECTION}/${id}`);
    }
    return newNotif;
  },

  /**
   * High-Level Helpers for Unified Event Dispatches
   */
  async notifyOrderEvent(params: {
    userId: string;
    orderId: string;
    eventType: NotificationEventType;
    orderNumber?: string;
    actorName?: string;
  }): Promise<void> {
    const { userId, orderId, eventType, orderNumber } = params;
    const num = orderNumber || orderId;

    let title: LocalizedString = {
      ar: 'تحديث حالة الطلب',
      en: 'Order Status Update',
      so: 'Cusbooneysiinta Dalabka',
    };
    let message: LocalizedString = {
      ar: `تم تحديث حالة الطلب #${num}`,
      en: `Order #${num} status has been updated.`,
      so: `Dalabka #${num} xaaladdiisa waa la cusbooneysiiyay.`,
    };

    if (eventType === 'NEW_ORDER') {
      title = { ar: 'طلب جديد وارد', en: 'New Order Received', so: 'Dalab Cusub' };
      message = {
        ar: `لديك طلب جديد #${num} بانتظار التأكيد والتجهيز`,
        en: `You have received a new order #${num} ready for preparation.`,
        so: `Waxaa kuu soo dhacay dalab cusub #${num} oo diyaar u ah diyaarinta.`,
      };
    } else if (eventType === 'ORDER_CONFIRMED') {
      title = { ar: 'تم تأكيد الطلب', en: 'Order Confirmed', so: 'Dalabka La Xaqiijiyay' };
      message = {
        ar: `تم تأكيد طلبك #${num} وبدأ المتجر في التجهيز`,
        en: `Your order #${num} has been confirmed and preparation started.`,
        so: `Dalabkaaga #${num} waa la xaqiijiyay, diyaarintiina waa bilaabatay.`,
      };
    } else if (eventType === 'ORDER_PREPARING') {
      title = { ar: 'الطلب قيد التجهيز', en: 'Order Preparing', so: 'Dalabka Waa La Diyaarinayaa' };
      message = {
        ar: `يقوم المتجر بتجهيز محتويات طلبك #${num} بعناية`,
        en: `The store is currently preparing your items for order #${num}.`,
        so: `Dukaanku hadda wuxuu diyaarinayaa alaabta dalabkaaga #${num}.`,
      };
    } else if (eventType === 'ORDER_READY') {
      title = { ar: 'الطلب جاهز للاستلام / الشحن', en: 'Order Ready', so: 'Dalabku Waa Diyaar' };
      message = {
        ar: `طلبك #${num} جاهز تماماً وبانتظار التوصيل أو الاستلام`,
        en: `Order #${num} is packed and ready for handover.`,
        so: `Dalabka #${num} waa diyaar waxaana sugayaa gaarsiinta.`,
      };
    } else if (eventType === 'ORDER_OUT_FOR_DELIVERY') {
      title = { ar: 'الطلب في الطريق إليك', en: 'Out for Delivery', so: 'Dalabka Waa Socdaa' };
      message = {
        ar: `المندوب في طريقه إليك الآن لتسليم الطلب #${num}`,
        en: `Your courier is on the way with order #${num}!`,
        so: `Wakiilka keenista wuxuu ku jiraa wadada si uu kuu keeno dalabka #${num}!`,
      };
    } else if (eventType === 'ORDER_DELIVERED') {
      title = { ar: 'تم تسليم الطلب بنجاح', en: 'Order Delivered', so: 'Dalabka Waa La Gaarsiiyay' };
      message = {
        ar: `تم تسليم طلبك #${num} بنجاح. شكراً لتسوقك معنا!`,
        en: `Order #${num} has been delivered successfully. Thank you for shopping with us!`,
        so: `Dalabka #${num} si guul ah ayaa laguugu keenay. Waad ku mahadsan tahay nala adeegashadaada!`,
      };
    } else if (eventType === 'ORDER_CANCELLED') {
      title = { ar: 'تم إلغاء الطلب', en: 'Order Cancelled', so: 'Dalabka Waa La Joojiyay' };
      message = {
        ar: `تم إلغاء الطلب #${num}. يرجى مراجعة تفاصيل الطلب أو التواصل مع الدعم.`,
        en: `Order #${num} has been cancelled. Please check details or contact support.`,
        so: `Dalabka #${num} waa la joojiyay. Fadlan eeg faahfaahinta ama la xiriir caawinta.`,
      };
    }

    await this.createNotification({
      userId,
      type: 'order',
      eventType,
      entityType: 'order',
      entityId: orderId,
      title,
      message,
      link: `/orders/${orderId}`,
    });
  },

  async notifyDeliveryEvent(params: {
    userId: string;
    orderId: string;
    eventType: 'DELIVERY_ASSIGNED' | 'DELIVERY_FAILED' | 'DELIVERY_RESCHEDULED';
    driverName?: string;
    driverPhone?: string;
    failureReason?: string;
  }): Promise<void> {
    const { userId, orderId, eventType, driverName, driverPhone, failureReason } = params;

    let title: LocalizedString = {
      ar: 'تحديث الشحن والتوصيل',
      en: 'Delivery Update',
      so: 'Cusbooneysiinta Gaarsiinta',
    };
    let message: LocalizedString = {
      ar: `تحديث جديد بخصوص توصيل الطلب #${orderId}`,
      en: `A new update has been posted for delivery of order #${orderId}`,
      so: `Cusbooneysiin cusub ayaa ku saabsan gaarsiinta dalabka #${orderId}`,
    };

    if (eventType === 'DELIVERY_ASSIGNED') {
      title = { ar: 'تم تعيين مندوب التوصيل', en: 'Driver Assigned', so: 'Darawal Ayaa Loo Qoondeeyay' };
      message = {
        ar: `تم تعيين المندوب ${driverName || 'المعتمد'} لتوصيل طلبك #${orderId}${driverPhone ? ` (هاتف: ${driverPhone})` : ''}`,
        en: `Driver ${driverName || 'assigned'} has been assigned to deliver order #${orderId}${driverPhone ? ` (Phone: ${driverPhone})` : ''}`,
        so: `Darawalka ${driverName || 'la xushay'} ayaa loo qoondeeyay inuu keeno dalabka #${orderId}`,
      };
    } else if (eventType === 'DELIVERY_FAILED') {
      title = { ar: 'تعذر تسليم الشحنة', en: 'Delivery Attempt Failed', so: 'Gaarsiinta Dalabka Way Fashilantay' };
      message = {
        ar: `تعذر إتمام تسليم الطلب #${orderId}. السبب: ${failureReason || 'العميل غير متاح'}. سيتم التواصل لإعادة التوصيل.`,
        en: `Delivery attempt failed for order #${orderId}. Reason: ${failureReason || 'Customer unavailable'}. We will reschedule shortly.`,
        so: `Lama gaarsiin karin dalabka #${orderId}. Sabab: ${failureReason || 'Macmiilku ma heli karo'}.`,
      };
    } else if (eventType === 'DELIVERY_RESCHEDULED') {
      title = { ar: 'تمت إعادة جدولة التوصيل', en: 'Delivery Rescheduled', so: 'Dib Loo Qorsheeyay Gaarsiinta' };
      message = {
        ar: `تمت إعادة جدولة توصيل طلبك #${orderId}، وسيقوم المندوب بمحاولة التسليم قريباً.`,
        en: `Order #${orderId} delivery has been rescheduled and will be delivered shortly.`,
        so: `Gaarsiinta dalabka #${orderId} dib ayaa loo qorsheeyay.`,
      };
    }

    await this.createNotification({
      userId,
      type: 'delivery',
      eventType,
      entityType: 'delivery',
      entityId: orderId,
      title,
      message,
      link: `/orders/${orderId}`,
    });
  },

  async notifyPaymentEvent(params: {
    userId: string;
    orderId: string;
    eventType: 'PAYMENT_REFERENCE_SUBMITTED' | 'PAYMENT_CONFIRMED' | 'PAYMENT_REJECTED';
    amount?: number;
    method?: string;
  }): Promise<void> {
    const { userId, orderId, eventType, amount, method } = params;

    let title: LocalizedString = { ar: 'إشعار الدفع', en: 'Payment Notification', so: 'Ogeysiis Lacag-bixin' };
    let message: LocalizedString = { ar: `تم استلام تحديث على دفعة الطلب #${orderId}`, en: `Payment update for order #${orderId}`, so: `Cusbooneysiinta lacag-bixinta #${orderId}` };

    if (eventType === 'PAYMENT_REFERENCE_SUBMITTED') {
      title = { ar: 'تم استلام إشعار التحويل', en: 'Payment Receipt Submitted', so: 'Rasiidka Lacag-bixinta La Helay' };
      message = {
        ar: `تم تسجيل رقم الحوالة للطلب #${orderId} وهو قيد المراجعة المالية الآن.`,
        en: `Your transaction reference for order #${orderId} is being reviewed by accounting.`,
        so: `Tixraaca lacag-bixinta dalabka #${orderId} hadda waa la hubinayaa.`,
      };
    } else if (eventType === 'PAYMENT_CONFIRMED') {
      title = { ar: 'تم اعتماد الدفع بنجاح', en: 'Payment Confirmed', so: 'Lacag-bixinta La Xaqiijiyay' };
      message = {
        ar: `تم تأكيد دفعتك بمبلغ $${amount?.toFixed(2) || ''} عبر ${method || 'الجوال'} للطلب #${orderId}.`,
        en: `Your payment of $${amount?.toFixed(2) || ''} via ${method || 'Mobile Money'} for order #${orderId} is verified!`,
        so: `Lacag-bixintaada $${amount?.toFixed(2) || ''} ee dalabka #${orderId} waa la xaqiijiyay!`,
      };
    } else if (eventType === 'PAYMENT_REJECTED') {
      title = { ar: 'تعذر التحقق من الدفعة', en: 'Payment Verification Issue', so: 'Arin Ku Saabsan Lacag-bixinta' };
      message = {
        ar: `لم نتمكن من مطابقة الحوالة للطلب #${orderId}. يرجى مراجعة رقم العملية أو التواصل مع خدمة العملاء.`,
        en: `Could not verify payment reference for order #${orderId}. Please review transaction code or reach support.`,
        so: `Lama xaqiijin karin lacag-bixinta dalabka #${orderId}. Fadlan la xiriir caawinta.`,
      };
    }

    await this.createNotification({
      userId,
      type: 'payment',
      eventType,
      entityType: 'payment',
      entityId: orderId,
      title,
      message,
      link: `/orders/${orderId}`,
    });
  },

  async notifyMessageEvent(params: {
    recipientUserId: string;
    conversationId: string;
    senderName: string;
    textPreview: string;
  }): Promise<void> {
    await this.createNotification({
      userId: params.recipientUserId,
      type: 'message',
      eventType: 'NEW_MESSAGE',
      entityType: 'conversation',
      entityId: params.conversationId,
      title: {
        ar: `رسالة جديدة من ${params.senderName}`,
        en: `New message from ${params.senderName}`,
        so: `Fariin cusub oo ka timid ${params.senderName}`,
      },
      message: {
        ar: params.textPreview.slice(0, 100),
        en: params.textPreview.slice(0, 100),
        so: params.textPreview.slice(0, 100),
      },
      link: `/messages/${params.conversationId}`,
    });
  },

  clearUserCache(): void {
    memoryNotifications = [];
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem(NOTIFICATIONS_STORAGE_KEY);
      } catch {
        // ignore
      }
    }
  },
};
