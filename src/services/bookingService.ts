import { doc, getDocs, collection, setDoc, updateDoc, query, where } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { ServiceBooking } from '../types';
import { notificationService } from './notificationService';

const BOOKINGS_STORAGE_KEY = 'marketspace_bookings_v1';
const BOOKINGS_COLLECTION = 'bookings';

let memoryBookings: ServiceBooking[] = [];

function initBookings(): ServiceBooking[] {
  if (memoryBookings.length > 0) return memoryBookings;
  if (typeof window === 'undefined') return [];
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
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(BOOKINGS_STORAGE_KEY, JSON.stringify(bookings));
  } catch (err) {
    console.error('Failed to save bookings', err);
  }
}

export const bookingService = {
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
    const newBooking: ServiceBooking = {
      ...data,
      id: `book_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      bookingCode: `BK-${Math.floor(10000 + Math.random() * 90000)}`,
      status: 'requested',
      createdAt: new Date().toISOString(),
    };

    bookings.unshift(newBooking);
    persistLocal(bookings);

    // Persist to Cloud Firestore
    setDoc(doc(db, BOOKINGS_COLLECTION, newBooking.id), newBooking).catch(err => {
      console.warn('Could not write booking to Firestore immediately:', err);
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

    booking.status = status;
    bookings[index] = booking;
    persistLocal(bookings);

    updateDoc(doc(db, BOOKINGS_COLLECTION, bookingId), { status }).catch(err => {
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
};
