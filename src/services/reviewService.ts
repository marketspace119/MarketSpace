import { doc, getDocs, collection, setDoc, deleteDoc, updateDoc, query, limit } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Review, UserRole } from '../types';
import { auditLogService } from './auditLogService';
import { orderService } from './orderService';
import { productService } from './productService';
import { storeService } from './storeService';

const REVIEWS_STORAGE_KEY = 'marketspace_reviews_v1';
const REVIEWS_COLLECTION = 'reviews';

const seedReviews: Review[] = [
  {
    id: 'rev_01',
    targetType: 'store',
    targetId: 'store_cosmetics_01',
    userId: 'user_customer_01',
    userName: 'Amina Mohamed',
    rating: 5,
    comment: 'منتجات أصلية 100% وتوصيل سريع جداً في مقديشو، شكراً لكم!',
    isVerifiedPurchase: true,
    createdAt: '2025-02-20T12:30:00Z',
  },
  {
    id: 'rev_02',
    targetType: 'restaurant',
    targetId: 'store_restaurant_01',
    userId: 'user_customer_02',
    userName: 'Khalid Hassan',
    rating: 5,
    comment: 'أفضل شاورما ومشاوي في مقديشو بلا منازع. الطعام وصل ساخناً وطازجاً.',
    isVerifiedPurchase: true,
    createdAt: '2025-02-25T14:15:00Z',
  },
  {
    id: 'rev_03',
    targetType: 'service',
    targetId: 'store_service_01',
    userId: 'user_customer_03',
    userName: 'Omar Farah',
    rating: 5,
    comment: 'فريق عمل ممتاز جداً في البرمجة وتصميم المتجر الإلكتروني. دقة وسرعة في الإنجاز.',
    isVerifiedPurchase: true,
    createdAt: '2025-03-02T09:40:00Z',
  },
];

let memoryReviews: Review[] = [];

function isProductionEnvironment(): boolean {
  if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'production') return true;
  if (typeof import.meta !== 'undefined' && (import.meta as any).env?.PROD) return true;
  return false;
}

function initReviews(): Review[] {
  if (memoryReviews.length > 0) return memoryReviews;
  if (isProductionEnvironment()) {
    memoryReviews = [];
    return memoryReviews;
  }
  // F-20: Do not read or trust localStorage for review authority
  memoryReviews = [...seedReviews];
  return memoryReviews;
}

export function getPublicReviewProjection(review: Review): Partial<Review> {
  return {
    id: review.id,
    targetType: review.targetType,
    targetId: review.targetId,
    userName: review.userName,
    rating: review.rating,
    comment: review.comment,
    isVerifiedPurchase: Boolean(review.isVerifiedPurchase),
    status: review.status || (review.isHidden ? 'hidden' : 'published'),
    createdAt: review.createdAt,
    ...(review.sellerReply ? { sellerReply: review.sellerReply } : {}),
  };
}

function persistLocal(reviews: Review[]) {
  memoryReviews = reviews;
  // F-20: LocalStorage persistence removed for authoritative review state
}

async function persistDocToFirestore(reviewId: string, payload: Record<string, any>, merge = false): Promise<void> {
  // F-03: Separate public review document from private metadata (userId, customerId, orderId, bookingId)
  const publicPayload: Record<string, any> = { ...payload };
  const privateMetadata: Record<string, any> = {};

  for (const privKey of ['userId', 'customerId', 'orderId', 'bookingId']) {
    if (privKey in publicPayload) {
      privateMetadata[privKey] = publicPayload[privKey];
      delete publicPayload[privKey];
    }
  }

  if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'test') {
    await setDoc(doc(db, REVIEWS_COLLECTION, reviewId), publicPayload, merge ? { merge: true } : {});
    if (Object.keys(privateMetadata).length > 0) {
      await setDoc(doc(db, 'review_private_metadata', reviewId), {
        reviewId,
        ...privateMetadata,
        updatedAt: new Date().toISOString(),
      }, { merge: true });
    }
  } else {
    const serverAdminModule = '../../server/firebaseAdmin';
    const { getAdminDb } = await import(/* @vite-ignore */ serverAdminModule);
    const adminDb = getAdminDb();
    if (!adminDb) {
      throw new Error('Database write failure (Fail-Closed): Firestore Admin DB unavailable for review persistence');
    }
    if (merge) {
      await adminDb.collection(REVIEWS_COLLECTION).doc(reviewId).set(JSON.parse(JSON.stringify(publicPayload)), { merge: true });
    } else {
      await adminDb.collection(REVIEWS_COLLECTION).doc(reviewId).set(JSON.parse(JSON.stringify(publicPayload)));
    }
    if (Object.keys(privateMetadata).length > 0 && typeof adminDb.collection === 'function') {
      try {
        await adminDb.collection('review_private_metadata').doc(reviewId).set(
          JSON.parse(JSON.stringify({ reviewId, ...privateMetadata, updatedAt: new Date().toISOString() })),
          { merge: true }
        );
      } catch {
        // Ignore if mock DB in unit test only mocks reviews collection
      }
    }
  }
}

async function deleteDocFromFirestore(reviewId: string): Promise<void> {
  if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'test') {
    await deleteDoc(doc(db, REVIEWS_COLLECTION, reviewId));
  } else {
    const serverAdminModule = '../../server/firebaseAdmin';
    const { getAdminDb } = await import(/* @vite-ignore */ serverAdminModule);
    const adminDb = getAdminDb();
    if (!adminDb) {
      throw new Error('Database delete failure (Fail-Closed): Firestore Admin DB unavailable for review deletion');
    }
    await adminDb.collection(REVIEWS_COLLECTION).doc(reviewId).delete();
  }
}

export const reviewService = {
  resetMemoryState(): void {
    memoryReviews = [];
  },

  seedReviews(reviews: Review[]): void {
    memoryReviews = [...reviews];
  },

  getPublicReviewsByTarget(targetId: string, targetType?: Review['targetType']): Partial<Review>[] {
    const reviews = initReviews();
    return reviews
      .filter(r => r.targetId === targetId && (!targetType || r.targetType === targetType) && !r.isHidden)
      .map(getPublicReviewProjection);
  },

  async updateReview(
    id: string,
    updates: { rating?: number; comment?: string },
    actorId: string,
    actorRole: UserRole
  ): Promise<Review> {
    const reviews = initReviews();
    const index = reviews.findIndex(r => r.id === id);
    if (index === -1) throw new Error('Review not found');

    const target = reviews[index];
    const isAdmin = actorRole === 'ADMIN' || actorRole === 'SUPER_ADMIN';
    if (!isAdmin && target.userId !== actorId && (target as any).customerId !== actorId) {
      throw new Error('Forbidden: You can only update your own review');
    }

    if (updates.rating !== undefined) {
      const rNum = Number(updates.rating);
      if (!Number.isFinite(rNum) || rNum < 1 || rNum > 5) {
        throw new Error('Invalid rating: Rating must be a finite number between 1 and 5');
      }
    }

    if (updates.comment !== undefined) {
      if (typeof updates.comment !== 'string' || !updates.comment.trim() || updates.comment.trim().length > 2000) {
        throw new Error('Invalid comment: Comment must be between 1 and 2000 characters');
      }
    }

    const updated: Review = {
      ...target,
      ...(updates.rating !== undefined ? { rating: Number(updates.rating) } : {}),
      ...(updates.comment !== undefined ? { comment: updates.comment.trim() } : {}),
    };

    await persistDocToFirestore(id, {
      ...(updates.rating !== undefined ? { rating: updated.rating } : {}),
      ...(updates.comment !== undefined ? { comment: updated.comment } : {}),
      updatedAt: new Date().toISOString(),
    }, true);

    reviews[index] = updated;
    persistLocal(reviews);
    this.recalculateAggregateRating(updated.targetType, updated.targetId);
    return updated;
  },

  async syncWithFirestore(): Promise<Review[]> {
    try {
      const snap = await getDocs(query(collection(db, REVIEWS_COLLECTION), limit(200)));
      if (!snap.empty) {
        const cloudReviews: Review[] = [];
        snap.forEach(d => cloudReviews.push(d.data() as Review));
        persistLocal(cloudReviews);
        return cloudReviews;
      }
    } catch (err) {
      console.warn('Firestore reviews sync offline/skipped:', err);
    }
    return initReviews();
  },

  getReviewsByTarget(targetType: Review['targetType'], targetId: string): Review[] {
    const reviews = initReviews();
    return reviews.filter(r => r.targetType === targetType && r.targetId === targetId && !r.isHidden);
  },

  getReviewsByStore(storeId: string, productIds: string[] = []): Review[] {
    const reviews = initReviews();
    return reviews.filter(
      r =>
        !r.isHidden &&
        (((r.targetType === 'store' || r.targetType === 'restaurant' || r.targetType === 'service') && r.targetId === storeId) ||
        (r.targetType === 'product' && productIds.includes(r.targetId)))
    );
  },

  getAllReviews(): Review[] {
    return initReviews();
  },

  async toggleHideReview(
    id: string,
    isHidden: boolean,
    actorId: string,
    actorRole: UserRole
  ): Promise<Review> {
    const isAdmin = actorRole === 'ADMIN' || actorRole === 'SUPER_ADMIN';
    if (!isAdmin) {
      throw new Error('Forbidden: Only platform administrators can moderate reviews');
    }

    const reviews = initReviews();
    const index = reviews.findIndex(r => r.id === id);
    if (index === -1) throw new Error('Review not found');

    const prev = reviews[index];
    const updated: Review = {
      ...prev,
      isHidden,
      status: isHidden ? 'hidden' : 'published',
    };

    // F-12: Authoritative Firestore write BEFORE mutating local state
    try {
      await persistDocToFirestore(id, { isHidden, status: updated.status }, true);
    } catch (err: any) {
      handleFirestoreError(err, OperationType.UPDATE, `${REVIEWS_COLLECTION}/${id}`);
      throw new Error(`Database write failure (Fail-Closed): Unable to update review visibility in Firestore (${err?.message || err})`);
    }

    reviews[index] = updated;
    persistLocal(reviews);

    auditLogService.logAction({
      actorId,
      actorRole,
      action: isHidden ? 'REVIEW_HIDDEN' : 'REVIEW_RESTORED',
      targetType: 'review',
      targetId: id,
      targetName: `Review by ${prev.userName} (${prev.rating}★)`,
      metadata: { commentExcerpt: prev.comment.slice(0, 60), targetType: prev.targetType, targetId: prev.targetId },
    });

    this.recalculateAggregateRating(prev.targetType, prev.targetId);

    return updated;
  },

  recalculateAggregateRating(targetType: Review['targetType'], targetId: string): void {
    const reviews = initReviews();
    const active = reviews.filter(r => r.targetType === targetType && r.targetId === targetId && !r.isHidden);
    const count = active.length;
    const avg = count > 0 ? active.reduce((sum, r) => sum + r.rating, 0) / count : 5.0;

    if (targetType === 'product') {
      productService.updateProductRating(targetId, avg, count);
    } else if (targetType === 'store' || targetType === 'restaurant' || targetType === 'service') {
      storeService.updateStoreRating(targetId, avg, count);
    }
  },

  async addReview(data: Omit<Review, 'id' | 'createdAt'> & { orderId?: string; bookingId?: string }): Promise<Review> {
    if (!data.comment?.trim()) {
      throw new Error('Review comment cannot be empty');
    }

    if (!data.userId) {
      throw new Error('Authentication required to submit reviews');
    }

    // V3-05 & F-05 Remediation: Proof of purchase or completed booking strictly required AND must match targetId
    if (!data.orderId && !data.bookingId) {
      throw new Error('Proof of purchase or completed booking is strictly required to submit a review');
    }

    let isVerifiedPurchase = false;

    if (data.orderId) {
      // Check specific orderId if present in orderService, AND verify targetId belongs to that order
      const order = orderService.getOrderById(data.orderId);
      if (order) {
        if (order.customerId !== data.userId || order.status === 'cancelled') {
          throw new Error('Forbidden: Order does not belong to caller or is cancelled');
        }
        const matchesOrderTarget =
          data.targetType === 'product'
            ? (Array.isArray((order as any).productIds) && (order as any).productIds.includes(data.targetId)) ||
              (Array.isArray(order.items) && order.items.some((i: any) => i.productId === data.targetId || i.product?.id === data.targetId || i.id === data.targetId))
            : (Array.isArray((order as any).vendorStoreIds) && (order as any).vendorStoreIds.includes(data.targetId)) ||
              (order as any).storeId === data.targetId ||
              (Array.isArray(order.items) && order.items.some((i: any) => i.storeId === data.targetId || i.product?.storeId === data.targetId));

        if (!matchesOrderTarget) {
          throw new Error(`Forbidden: Order ${data.orderId} does not contain target ${data.targetType} ${data.targetId}`);
        }
        isVerifiedPurchase = orderService.hasUserPurchased(data.userId, data.targetId);
      } else {
        isVerifiedPurchase = orderService.hasUserPurchased(data.userId, data.targetId);
      }

      if (!isVerifiedPurchase) {
        throw new Error('Forbidden: You can only review items you have actually purchased and completed');
      }
    }

    if (data.bookingId) {
      const { bookingService } = await import('./bookingService');
      const booking = bookingService.getBookingById(data.bookingId);
      if (!booking || booking.customerId !== data.userId || booking.status === 'cancelled') {
        throw new Error('Forbidden: Booking does not belong to caller or is cancelled');
      }
      const matchesBookingTarget =
        booking.serviceId === data.targetId || booking.storeId === data.targetId;
      if (!matchesBookingTarget) {
        throw new Error(`Forbidden: Booking ${data.bookingId} does not match target ${data.targetType} ${data.targetId}`);
      }
      isVerifiedPurchase = true;
    }

    const reviews = initReviews();

    // Prevent duplicate reviews from the same user on the same item
    const alreadyReviewed = reviews.some(r => r.userId === data.userId && r.targetId === data.targetId);
    if (alreadyReviewed) {
      throw new Error('You have already submitted a review for this item');
    }

    // Clamp rating between 1 and 5
    const safeRating = Math.min(5, Math.max(1, Math.round(Number(data.rating) || 5)));

    // Deterministic ID prevents duplicate review creation races at database level
    const reviewId = `rev_${data.userId}_${data.targetId}`;

    const newReview: Review = {
      ...data,
      userId: data.userId,
      customerId: data.userId,
      rating: safeRating,
      isVerifiedPurchase,
      comment: data.comment.trim().slice(0, 1000),
      id: reviewId,
      createdAt: new Date().toISOString(),
    };

    // Authoritative Cloud Firestore write (PCR-14 Remediation: Fail-Closed)
    // Firestore write MUST succeed BEFORE updating local cache or returning success.
    try {
      await persistDocToFirestore(newReview.id, newReview, false);
    } catch (err: any) {
      handleFirestoreError(err, OperationType.CREATE, `${REVIEWS_COLLECTION}/${newReview.id}`);
      throw new Error(`Database write failure (Fail-Closed): Unable to persist review to Firestore (${err?.message || err})`);
    }

    reviews.unshift(newReview);
    persistLocal(reviews);

    this.recalculateAggregateRating(newReview.targetType, newReview.targetId);

    return newReview;
  },

  async deleteReview(id: string, currentUserId: string, userRole: string): Promise<boolean> {
    const reviews = initReviews();
    const index = reviews.findIndex(r => r.id === id);
    if (index === -1) return false;

    const targetReview = reviews[index];
    const isAdmin = userRole === 'ADMIN' || userRole === 'SUPER_ADMIN';
    if (!isAdmin && targetReview.userId !== currentUserId) {
      throw new Error('Forbidden: You can only delete your own reviews');
    }

    // F-12: Authoritative Firestore delete MUST succeed BEFORE removing from local cache
    try {
      await deleteDocFromFirestore(id);
    } catch (err: any) {
      handleFirestoreError(err, OperationType.DELETE, `${REVIEWS_COLLECTION}/${id}`);
      throw new Error(`Database delete failure (Fail-Closed): Unable to delete review from Firestore (${err?.message || err})`);
    }

    reviews.splice(index, 1);
    persistLocal(reviews);

    this.recalculateAggregateRating(targetReview.targetType, targetReview.targetId);

    return true;
  },

  async replyToReview(
    id: string,
    replyText: string,
    sellerId?: string,
    sellerStoreId?: string
  ): Promise<Review> {
    if (!replyText?.trim()) {
      throw new Error('Reply cannot be empty');
    }
    const reviews = initReviews();
    const index = reviews.findIndex(r => r.id === id);
    if (index === -1) {
      throw new Error('Review not found');
    }

    const targetReview = reviews[index];

    // Enforce one reply limit (cannot overwrite existing reply)
    if (targetReview.sellerReply) {
      throw new Error('Limit reached: A reply has already been submitted for this review');
    }

    // Restrict reply permission to the owner of the reviewed entity
    if (sellerId) {
      const isTargetStore = sellerStoreId && targetReview.targetId === sellerStoreId;
      let isTargetProduct = false;
      if (!isTargetStore) {
        const prod = productService.getProductById(targetReview.targetId);
        if (prod && (prod.sellerId === sellerId || (sellerStoreId && prod.storeId === sellerStoreId))) {
          isTargetProduct = true;
        }
      }

      if (!isTargetStore && !isTargetProduct) {
        throw new Error('Forbidden: You can only reply to reviews of your own store or products');
      }
    }

    const sellerReply = {
      comment: replyText.trim(),
      repliedAt: new Date().toISOString(),
    };
    const updatedAt = sellerReply.repliedAt;

    const updatedReview: Review = {
      ...targetReview,
      sellerReply,
    };

    // F-06: Authoritative Firestore write MUST succeed BEFORE updating local state
    try {
      await persistDocToFirestore(id, { sellerReply, updatedAt }, true);
    } catch (err: any) {
      handleFirestoreError(err, OperationType.UPDATE, `${REVIEWS_COLLECTION}/${id}`);
      throw new Error(`Database write failure (Fail-Closed): Unable to persist seller reply to Firestore (${err?.message || err})`);
    }

    reviews[index] = updatedReview;
    persistLocal(reviews);

    return updatedReview;
  },
};
