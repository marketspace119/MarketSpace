import { doc, getDocs, collection, setDoc, updateDoc, query, where } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { ServiceBooking } from '../types';
import { notificationService } from './notificationService';

const BOOKINGS_STORAGE_KEY = 'marketspace_bookings_v1';
const BOOKINGS_COLLECTION = 'bookings';

let memoryBookings: ServiceBooking[] = [];

function initBookings(): ServiceBooking[] {
  if (memoryBookings.length > 0) return memoryBookings;
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(BOOKINGS_STORAGE_KEY);
    memoryBookings = raw ? JSON.parse(raw) : [];
    return memoryBookings;
  } catch (err) {
    console.error('Failed to load bookings', err);
    return [];
  }
}

function persistLocal(bookings: ServiceBooking[]) {
  memoryBookings = bookings;
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(BOOKINGS_STORAGE_KEY, JSON.stringify(bookings));
  } catch (err) {
    console.error('Failed to save bookings', err);
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
        q = collection(db, BOOKINGS_COLLECTION);
      } else if (filter?.customerId) {
        q = query(collection(db, BOOKINGS_COLLECTION), where('customerId', '==', filter.customerId));
      } else if (filter?.sellerId) {
        q = query(collection(db, BOOKINGS_COLLECTION), where('sellerId', '==', filter.sellerId));
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

  createBooking(data: Omit<ServiceBooking, 'id' | 'bookingCode' | 'createdAt' | 'status'>): ServiceBooking {
    const bookings = initBookings();

    // Double-booking conflict validation (Phase 6)
    const hasConflict = bookings.some(
      b =>
        b.sellerId === data.sellerId &&
        b.date === data.date &&
        b.time === data.time &&
        ['requested', 'accepted', 'confirmed', 'scheduled', 'in_progress'].includes(b.status)
    );
    if (hasConflict) {
      throw new Error(`الموعد المطلوب (${data.date} في ${data.time}) محجوز مسبقاً لدى مقدم الخدمة. يرجى اختيار موعد آخر.`);
    }

    const newBooking: ServiceBooking = {
      ...data,
      id: `book_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      bookingCode: `BK-${Math.floor(10000 + Math.random() * 90000)}`,
      status: 'requested',
      createdAt: new Date().toISOString(),
    };

    bookings.unshift(newBooking);
    persistLocal(bookings);

    // Persist to Cloud Firestore with rollback on failure
    setDoc(doc(db, BOOKINGS_COLLECTION, newBooking.id), newBooking).catch(err => {
      console.warn('Could not write booking to Firestore immediately, rolling back local cache:', err);
      const current = initBookings().filter(b => b.id !== newBooking.id);
      persistLocal(current);
    });

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

  updateBookingStatus(
    bookingId: string,
    status: ServiceBooking['status'],
    currentUserId: string,
    userRole: string
  ): ServiceBooking {
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

    const previousStatus = booking.status;
    booking.status = status;
    bookings[index] = booking;
    persistLocal(bookings);

    updateDoc(doc(db, BOOKINGS_COLLECTION, bookingId), { status }).catch(err => {
      // Rollback local cache on Firestore write failure
      booking.status = previousStatus;
      bookings[index] = booking;
      persistLocal(bookings);
      handleFirestoreError(err, OperationType.UPDATE, `${BOOKINGS_COLLECTION}/${bookingId}`);
    });

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

    return booking;
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
   * Cancel booking by customer, service provider, or admin
   */
  cancelBooking(
    bookingId: string,
    actorId: string,
    actorRole: string,
    reason?: string
  ): ServiceBooking {
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

    booking.status = 'cancelled';
    booking.notes = reason ? `${booking.notes || ''} [Cancelled: ${reason}]`.trim() : booking.notes;
    bookings[index] = booking;
    persistLocal(bookings);

    updateDoc(doc(db, BOOKINGS_COLLECTION, bookingId), {
      status: 'cancelled',
      notes: booking.notes,
    }).catch(err => {
      handleFirestoreError(err, OperationType.UPDATE, `${BOOKINGS_COLLECTION}/${bookingId}`);
    });

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

    return booking;
  },

  /**
   * Reschedule booking with double-booking collision protection
   */
  rescheduleBooking(params: {
    bookingId: string;
    newDate: string;
    newTime: string;
    actorId: string;
    actorRole: string;
    reason?: string;
  }): ServiceBooking {
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

    booking.date = params.newDate;
    booking.time = params.newTime;
    booking.status = isCustomer ? 'requested' : 'scheduled';
    booking.notes = params.reason ? `${booking.notes || ''} [Rescheduled: ${params.reason}]`.trim() : booking.notes;

    bookings[index] = booking;
    persistLocal(bookings);

    updateDoc(doc(db, BOOKINGS_COLLECTION, params.bookingId), {
      date: params.newDate,
      time: params.newTime,
      status: booking.status,
      notes: booking.notes,
    }).catch(err => {
      handleFirestoreError(err, OperationType.UPDATE, `${BOOKINGS_COLLECTION}/${params.bookingId}`);
    });

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

    return booking;
  },

  /**
   * Complete booking by provider or admin
   */
  completeBooking(
    bookingId: string,
    actorId: string,
    actorRole: string
  ): ServiceBooking {
    return this.updateBookingStatus(bookingId, 'completed', actorId, actorRole);
  },
};
