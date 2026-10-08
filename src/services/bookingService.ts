import { doc, getDoc, getDocs, collection, setDoc, updateDoc, query, where, runTransaction, limit } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType, cleanForFirestore } from '../lib/firebase';
import { ServiceBooking } from '../types';
import { notificationService } from './notificationService';

const BOOKINGS_STORAGE_KEY = 'marketspace_bookings_v1';
const BOOKINGS_COLLECTION = 'bookings';

let memoryBookings: ServiceBooking[] = [];
const activeBookingSlotLocks = new Set<string>();

function initBookings(): ServiceBooking[] {
  if (memoryBookings.length > 0) return memoryBookings;
  // F-20: Do not read or trust localStorage for booking authority
  return memoryBookings;
}

function persistLocal(bookings: ServiceBooking[]) {
  memoryBookings = bookings;
  // F-20: LocalStorage persistence removed for authoritative booking state
}

async function persistBookingMutationToFirestore(bookingId: string, payload: Record<string, any>): Promise<void> {
  if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'test') {
    await updateDoc(doc(db, BOOKINGS_COLLECTION, bookingId), cleanForFirestore(payload));
  } else {
    const serverAdminModule = '../../server/firebaseAdmin';
    const { getAdminDb } = await import(/* @vite-ignore */ serverAdminModule);
    const adminDb = getAdminDb();
    if (!adminDb) {
      throw new Error('Database write failure (Fail-Closed): Firestore Admin DB unavailable for booking persistence');
    }
    await adminDb.collection(BOOKINGS_COLLECTION).doc(bookingId).set(cleanForFirestore(payload), { merge: true });
  }
}

export const ALLOWED_BOOKING_TRANSITIONS: Record<ServiceBooking['status'], ServiceBooking['status'][]> = {
  requested: ['accepted', 'confirmed', 'cancelled'],
  accepted: ['scheduled', 'in_progress', 'cancelled'],
  confirmed: ['scheduled', 'in_progress', 'cancelled'],
  scheduled: ['in_progress', 'completed', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: [], // Terminal
  cancelled: [], // Terminal
};

export const bookingService = {
  resetMemoryState() {
    memoryBookings = [];
  },
  seedBookings(bookings: ServiceBooking[]) {
    memoryBookings = [...bookings];
  },
  async syncWithFirestore(filter?: { customerId?: string; sellerId?: string; isAdmin?: boolean }): Promise<ServiceBooking[]> {
    try {
      let q;
      if (filter?.isAdmin) {
        q = query(collection(db, BOOKINGS_COLLECTION), limit(200));
      } else if (filter?.customerId) {
        q = query(collection(db, BOOKINGS_COLLECTION), where('customerId', '==', filter.customerId), limit(200));
      } else if (filter?.sellerId) {
        q = query(collection(db, BOOKINGS_COLLECTION), where('sellerId', '==', filter.sellerId), limit(200));
      }

      if (q) {
        const snap = await getDocs(q);
        if (!snap.empty) {
          const cloudBookings: ServiceBooking[] = [];
          snap.forEach(d => cloudBookings.push(d.data() as ServiceBooking));
          persistLocal(cloudBookings);
          return cloudBookings;
        }
      }
    } catch (err) {
      console.warn('Firestore bookings sync offline/skipped:', err);
    }
    return initBookings();
  },

  async createBooking(data: Omit<ServiceBooking, 'id' | 'bookingCode' | 'createdAt' | 'status'>): Promise<ServiceBooking> {
    const slotLockKey = `${data.sellerId}_${data.date}_${data.time}`
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .toLowerCase();

    if (activeBookingSlotLocks.has(slotLockKey)) {
      throw new Error(`الموعد المطلوب (${data.date} في ${data.time}) قيد الحجز حالياً لدى مقدم الخدمة.`);
    }
    activeBookingSlotLocks.add(slotLockKey);

    try {
      if (!this.isTimeslotAvailable(data.sellerId, data.date, data.time)) {
        throw new Error(`الموعد المطلوب (${data.date} في ${data.time}) محجوز مسبقاً لدى مقدم الخدمة. يرجى اختيار موعد آخر.`);
      }

      // Production / Client: Delegate directly to trusted backend gateway (/api/bookings/create)
      // Server enforces atomic slot reservation, active service check, and authoritative pricing
      const currentUser = auth.currentUser;
      if (currentUser) {
        try {
          const idToken = await currentUser.getIdToken();
          const res = await fetch('/api/bookings/create', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${idToken}`,
            },
            body: JSON.stringify({
              serviceId: data.serviceId,
              sellerId: data.sellerId,
              date: data.date,
              time: data.time,
              customerName: data.customerName,
              customerPhone: data.customerPhone,
              notes: data.notes,
            }),
          });
          const resData = await res.json();
          if (!res.ok || !resData.success) {
            throw new Error(resData.error || 'Failed to create booking');
          }
          const createdBooking: ServiceBooking = resData.booking;
          const bookings = initBookings();
          bookings.unshift(createdBooking);
          persistLocal(bookings);
          return createdBooking;
        } catch (err: any) {
          // Re-throw server errors directly
          throw err;
        }
      }

      const cleanDate = (data.date || '').replace(/[^a-zA-Z0-9]/g, '-');
      const cleanTime = (data.time || '').replace(/[^a-zA-Z0-9]/g, '-');
      const slotId = `${data.sellerId}_${cleanDate}_${cleanTime}`;

      // Authoritative Service verification in local/test environment
      let authoritativePrice = data.price;
      try {
        const prodDoc = await getDoc(doc(db, 'products', data.serviceId));
        if (prodDoc.exists()) {
          const prodData = prodDoc.data();
          if (prodData.sellerId && prodData.sellerId !== data.sellerId) {
            throw new Error('Service does not belong to specified provider');
          }
          if (prodData.isPublished === false || prodData.status === 'suspended' || prodData.status === 'rejected') {
            throw new Error('Service is not active or available for booking');
          }
          if (typeof prodData.price === 'number') {
            authoritativePrice = prodData.price;
          }
        }
      } catch (err: any) {
        if (err.message?.includes('does not belong') || err.message?.includes('not active')) {
          throw err;
        }
      }

      const newBooking: ServiceBooking = {
        ...data,
        price: authoritativePrice,
        id: `book_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        bookingCode: `BK-${Math.floor(10000 + Math.random() * 90000)}`,
        status: 'requested',
        createdAt: new Date().toISOString(),
      };

      // Authoritative persistence to Firestore BEFORE local cache update (F-09: Fail-Closed)
      try {
        if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'test') {
          await setDoc(doc(db, BOOKINGS_COLLECTION, newBooking.id), cleanForFirestore(newBooking));
        } else {
          const serverAdminModule = '../../server/firebaseAdmin';
          const { getAdminDb } = await import(/* @vite-ignore */ serverAdminModule);
          const adminDb = getAdminDb();
          if (adminDb) {
            await adminDb.collection('booking_slots').doc(slotId).set({
              slotId,
              sellerId: data.sellerId,
              date: data.date,
              time: data.time,
              bookingId: newBooking.id,
              customerId: data.customerId,
              status: 'booked',
              createdAt: newBooking.createdAt,
              updatedAt: newBooking.createdAt,
            });
            await adminDb.collection(BOOKINGS_COLLECTION).doc(newBooking.id).set(cleanForFirestore(newBooking));
          }
        }
      } catch (err: any) {
        handleFirestoreError(err, OperationType.CREATE, `${BOOKINGS_COLLECTION}/${newBooking.id}`);
        throw new Error(`Database write failure (Fail-Closed): Unable to persist booking to Firestore (${err?.message || err})`);
      }

      const bookings = initBookings();
      bookings.unshift(newBooking);
      persistLocal(bookings);

      // Notify Service Provider
      notificationService.createNotification({
        userId: data.sellerId,
        type: 'booking',
        title: {
          ar: `حجز خدمة جديد #${newBooking.bookingCode}`,
          en: `New Service Booking #${newBooking.bookingCode}`,
          so: `Ballan adeeg cusub #${newBooking.bookingCode}`,
        },
        message: {
          ar: `طلب حجز جديد من ${data.customerName} بتاريخ ${data.date} ${data.time}`,
          en: `New booking request from ${data.customerName} for ${data.date} ${data.time}`,
          so: `Codsiga ballanta cusub ee ${data.customerName} taariikhda ${data.date} ${data.time}`,
        },
        link: `/seller/bookings`,
      }).catch(() => {});

      return newBooking;
    } finally {
      activeBookingSlotLocks.delete(slotLockKey);
    }
  },

  getBookingById(bookingId: string): ServiceBooking | undefined {
    const bookings = initBookings();
    return bookings.find(b => b.id === bookingId);
  },

  getBookingsBySellerId(sellerId: string, currentUserId?: string, userRole?: string): ServiceBooking[] {
    const isAdmin = userRole === 'ADMIN' || userRole === 'SUPER_ADMIN';
    if (!isAdmin && currentUserId && currentUserId !== sellerId) {
      throw new Error('Forbidden: You can only access bookings for your own provider account');
    }

    const bookings = initBookings();
    return bookings.filter(b => b.sellerId === sellerId);
  },

  getAllBookings(currentUserId?: string, userRole?: string): ServiceBooking[] {
    const bookings = initBookings();
    const isAdmin = userRole === 'ADMIN' || userRole === 'SUPER_ADMIN';
    if (isAdmin) {
      return bookings;
    }
    if (currentUserId) {
      return bookings.filter(b => b.customerId === currentUserId);
    }
    return [];
  },

  async updateBookingStatus(
    bookingId: string,
    status: ServiceBooking['status'],
    currentUserId: string,
    userRole: string
  ): Promise<ServiceBooking> {
    const bookings = initBookings();
    const index = bookings.findIndex(b => b.id === bookingId);
    if (index === -1) throw new Error('Booking not found');

    const booking = bookings[index];
    const isAdmin = userRole === 'ADMIN' || userRole === 'SUPER_ADMIN';
    if (!isAdmin && booking.sellerId !== currentUserId) {
      throw new Error('Forbidden: You can only manage bookings for your own services');
    }

    // Section 6: Enforce valid state machine transition
    const allowed = ALLOWED_BOOKING_TRANSITIONS[booking.status] || [];
    if (!allowed.includes(status)) {
      throw new Error(`Illegal booking status transition: cannot transition from "${booking.status}" to "${status}". Allowed transitions: ${allowed.join(', ') || 'none (terminal state)'}`);
    }

    const updatedAt = new Date().toISOString();

    // F-09: Authoritative Firestore write MUST succeed BEFORE updating local state (Fail-Closed)
    try {
      await persistBookingMutationToFirestore(bookingId, { status, updatedAt });
    } catch (err: any) {
      handleFirestoreError(err, OperationType.UPDATE, `${BOOKINGS_COLLECTION}/${bookingId}`);
      throw new Error(`Database write failure (Fail-Closed): Unable to update booking status in Firestore (${err?.message || err})`);
    }

    const updatedBooking: ServiceBooking = {
      ...booking,
      status,
    };
    bookings[index] = updatedBooking;
    persistLocal(bookings);

    // Notify Customer about status change
    notificationService.createNotification({
      userId: booking.customerId,
      type: 'booking',
      title: {
        ar: `تحديث حالة الحجز #${booking.bookingCode}`,
        en: `Booking Status Update #${booking.bookingCode}`,
        so: `Cusboonaysiinta heerka ballanta #${booking.bookingCode}`,
      },
      message: {
        ar: `تم تغيير حالة حجزك إلى: ${status}`,
        en: `Your booking status has been updated to: ${status}`,
        so: `Xaaladda ballantaada waxaa loo beddelay: ${status}`,
      },
      link: `/account/bookings`,
    }).catch(() => {});

    return { ...updatedBooking };
  },

  isTimeslotAvailable(sellerId: string, date: string, time: string): boolean {
    const bookings = initBookings();
    const conflict = bookings.some(
      b =>
        b.sellerId === sellerId &&
        b.date === date &&
        b.time === time &&
        ['requested', 'accepted', 'confirmed', 'scheduled', 'in_progress'].includes(b.status)
    );
    return !conflict;
  },

  getAvailableTimeslots(sellerId: string, date: string): string[] {
    const STANDARD_SLOTS = ['09:00', '10:00', '11:00', '12:00', '14:00', '15:00', '16:00', '17:00'];
    const bookings = initBookings();
    const bookedTimes = new Set(
      bookings
        .filter(
          b =>
            b.sellerId === sellerId &&
            b.date === date &&
            ['requested', 'accepted', 'confirmed', 'scheduled', 'in_progress'].includes(b.status)
        )
        .map(b => b.time)
    );
    return STANDARD_SLOTS.filter(slot => !bookedTimes.has(slot));
  },

  /**
   * Cancel booking by customer, service provider, or admin (F-09: Firestore-first)
   */
  async cancelBooking(
    bookingId: string,
    actorId: string,
    actorRole: string,
    reason?: string
  ): Promise<ServiceBooking> {
    const bookings = initBookings();
    const index = bookings.findIndex(b => b.id === bookingId);
    if (index === -1) throw new Error('Booking not found');

    const booking = bookings[index];
    const isAdmin = actorRole === 'ADMIN' || actorRole === 'SUPER_ADMIN';
    const isCustomer = booking.customerId === actorId;
    const isProvider = booking.sellerId === actorId;

    if (!isAdmin && !isCustomer && !isProvider) {
      throw new Error('Forbidden: You can only cancel bookings associated with your account');
    }

    if (booking.status === 'completed' || booking.status === 'cancelled') {
      throw new Error(`Cannot cancel booking in terminal "${booking.status}" state`);
    }

    if (isCustomer && !isAdmin && !isProvider && !['requested', 'accepted', 'confirmed'].includes(booking.status)) {
      throw new Error(`Customer cannot cancel booking once it is in "${booking.status}" state`);
    }

    const nextNotes = reason ? `${booking.notes || ''} [Cancelled: ${reason}]`.trim() : booking.notes;
    const updatedAt = new Date().toISOString();
    const cleanDate = (booking.date || '').replace(/[^a-zA-Z0-9]/g, '-');
    const cleanTime = (booking.time || '').replace(/[^a-zA-Z0-9]/g, '-');
    const slotKey = `${booking.sellerId}_${cleanDate}_${cleanTime}`;

    // F-09: Authoritative Firestore write MUST succeed BEFORE updating local state
    try {
      await persistBookingMutationToFirestore(bookingId, {
        status: 'cancelled',
        ...(nextNotes !== undefined ? { notes: nextNotes } : {}),
        updatedAt,
      });
      // Release booking_slots lock in Firestore so the slot can be booked again
      if (typeof window === 'undefined') {
        try {
          const serverAdminModule = '../../server/firebaseAdmin';
          const { getAdminDb } = await import(/* @vite-ignore */ serverAdminModule);
          const adminDb = getAdminDb();
          await adminDb.collection('booking_slots').doc(slotKey).set({
            status: 'cancelled',
            updatedAt,
          }, { merge: true });
        } catch {}
      }
    } catch (err: any) {
      handleFirestoreError(err, OperationType.UPDATE, `${BOOKINGS_COLLECTION}/${bookingId}`);
      throw new Error(`Database write failure (Fail-Closed): Unable to cancel booking in Firestore (${err?.message || err})`);
    }

    const updatedBooking: ServiceBooking = {
      ...booking,
      status: 'cancelled',
      notes: nextNotes,
    };
    bookings[index] = updatedBooking;
    persistLocal(bookings);

    const notifyRecipient = isCustomer ? booking.sellerId : booking.customerId;
    notificationService.createNotification({
      userId: notifyRecipient,
      type: 'booking',
      title: {
        ar: `تم إلغاء الحجز #${booking.bookingCode}`,
        en: `Booking #${booking.bookingCode} Cancelled`,
        so: `Ballantii #${booking.bookingCode} waa la joojiyay`,
      },
      message: {
        ar: `تم إلغاء حجز الخدمة: ${reason || 'بواسطة الطرف الآخر'}`,
        en: `Service booking cancelled: ${reason || 'by the other party'}`,
        so: `Ballantii adeegga waa la joojiyay: ${reason || 'dhanka kale'}`,
      },
      link: isCustomer ? `/seller/bookings` : `/account/bookings`,
    }).catch(() => {});

    return updatedBooking;
  },

  /**
   * Reschedule booking with double-booking collision protection (F-09: Firestore-first)
   */
  async rescheduleBooking(params: {
    bookingId: string;
    newDate: string;
    newTime: string;
    actorId: string;
    actorRole: string;
    reason?: string;
  }): Promise<ServiceBooking> {
    const bookings = initBookings();
    const index = bookings.findIndex(b => b.id === params.bookingId);
    if (index === -1) throw new Error('Booking not found');

    const booking = bookings[index];
    const isAdmin = params.actorRole === 'ADMIN' || params.actorRole === 'SUPER_ADMIN';
    const isCustomer = booking.customerId === params.actorId;
    const isProvider = booking.sellerId === params.actorId;

    if (!isAdmin && !isCustomer && !isProvider) {
      throw new Error('Forbidden: You can only reschedule bookings associated with your account');
    }

    if (booking.status === 'completed' || booking.status === 'cancelled') {
      throw new Error(`Cannot reschedule booking in terminal "${booking.status}" state`);
    }

    // Double-booking collision protection
    const cleanNewDate = (params.newDate || '').replace(/[^a-zA-Z0-9]/g, '-');
    const cleanNewTime = (params.newTime || '').replace(/[^a-zA-Z0-9]/g, '-');
    const newSlotKey = `${booking.sellerId}_${cleanNewDate}_${cleanNewTime}`;
    const cleanOldDate = (booking.date || '').replace(/[^a-zA-Z0-9]/g, '-');
    const cleanOldTime = (booking.time || '').replace(/[^a-zA-Z0-9]/g, '-');
    const oldSlotKey = `${booking.sellerId}_${cleanOldDate}_${cleanOldTime}`;

    if (activeBookingSlotLocks.has(newSlotKey)) {
      throw new Error(`الموعد الجديد (${params.newDate} في ${params.newTime}) قيد الحجز حالياً.`);
    }
    activeBookingSlotLocks.add(newSlotKey);

    try {
      const conflict = bookings.some(
        b =>
          b.id !== params.bookingId &&
          b.sellerId === booking.sellerId &&
          b.date === params.newDate &&
          b.time === params.newTime &&
          ['requested', 'accepted', 'confirmed', 'scheduled', 'in_progress'].includes(b.status)
      );
      if (conflict) {
        throw new Error(`الموعد الجديد (${params.newDate} في ${params.newTime}) غير متاح ومحجوز مسبقاً.`);
      }

      const nextStatus: ServiceBooking['status'] = isCustomer ? 'requested' : 'scheduled';
      const nextNotes = params.reason ? `${booking.notes || ''} [Rescheduled: ${params.reason}]`.trim() : booking.notes;
      const updatedAt = new Date().toISOString();

      // F-09: Authoritative Firestore write MUST succeed BEFORE updating local state
      try {
        await persistBookingMutationToFirestore(params.bookingId, {
          date: params.newDate,
          time: params.newTime,
          status: nextStatus,
          ...(nextNotes !== undefined ? { notes: nextNotes } : {}),
          updatedAt,
        });
        if (typeof window === 'undefined' && newSlotKey !== oldSlotKey) {
          try {
            const serverAdminModule = '../../server/firebaseAdmin';
            const { getAdminDb } = await import(/* @vite-ignore */ serverAdminModule);
            const adminDb = getAdminDb();
            await adminDb.collection('booking_slots').doc(oldSlotKey).set({
              status: 'cancelled',
              updatedAt,
            }, { merge: true });
            await adminDb.collection('booking_slots').doc(newSlotKey).set({
              id: newSlotKey,
              bookingId: booking.id,
              sellerId: booking.sellerId,
              customerId: booking.customerId,
              date: params.newDate,
              time: params.newTime,
              status: 'booked',
              updatedAt,
            });
          } catch {}
        }
      } catch (err: any) {
        handleFirestoreError(err, OperationType.UPDATE, `${BOOKINGS_COLLECTION}/${params.bookingId}`);
        throw new Error(`Database write failure (Fail-Closed): Unable to reschedule booking in Firestore (${err?.message || err})`);
      }

      const updatedBooking: ServiceBooking = {
        ...booking,
        date: params.newDate,
        time: params.newTime,
        status: nextStatus,
        notes: nextNotes,
      };

      bookings[index] = updatedBooking;
      persistLocal(bookings);

      const notifyRecipient = isCustomer ? booking.sellerId : booking.customerId;
      notificationService.createNotification({
        userId: notifyRecipient,
        type: 'booking',
        title: {
          ar: `تم إعادة جدولة الحجز #${booking.bookingCode}`,
          en: `Booking #${booking.bookingCode} Rescheduled`,
          so: `Waqtiga ballanta #${booking.bookingCode} waa la beddelay`,
        },
        message: {
          ar: `تم تحديد موعد جديد: ${params.newDate} في ${params.newTime}`,
          en: `New timeslot: ${params.newDate} at ${params.newTime}`,
          so: `Waqti cusub: ${params.newDate} saacadda ${params.newTime}`,
        },
        link: isCustomer ? `/seller/bookings` : `/account/bookings`,
      }).catch(() => {});

      return updatedBooking;
    } finally {
      activeBookingSlotLocks.delete(newSlotKey);
    }
  },

  /**
   * Complete booking by provider or admin (F-09: Firestore-first)
   */
  async completeBooking(
    bookingId: string,
    actorId: string,
    actorRole: string
  ): Promise<ServiceBooking> {
    return await this.updateBookingStatus(bookingId, 'completed', actorId, actorRole);
  },
};
