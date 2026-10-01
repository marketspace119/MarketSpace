import { doc, getDocs, collection, setDoc, deleteDoc, updateDoc } from 'firebase/firestore';
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

function initReviews(): Review[] {
  if (memoryReviews.length > 0) return memoryReviews;
  if (typeof window === 'undefined') return seedReviews;
  try {
    const raw = localStorage.getItem(REVIEWS_STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(REVIEWS_STORAGE_KEY, JSON.stringify(seedReviews));
      memoryReviews = seedReviews;
      return seedReviews;
    }
    memoryReviews = JSON.parse(raw);
    return memoryReviews;
  } catch (err) {
    console.error('Failed to load reviews', err);
    memoryReviews = seedReviews;
    return seedReviews;
  }
}

function persistLocal(reviews: Review[]) {
  memoryReviews = reviews;
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(REVIEWS_STORAGE_KEY, JSON.stringify(reviews));
  } catch (err) {
    console.error('Failed to save reviews', err);
  }
}

export const reviewService = {
  async syncWithFirestore(): Promise<Review[]> {
    try {
      const snap = await getDocs(collection(db, REVIEWS_COLLECTION));
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

  toggleHideReview(
    id: string,
    isHidden: boolean,
    actorId: string,
    actorRole: UserRole
  ): Review {
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

    reviews[index] = updated;
    persistLocal(reviews);

    updateDoc(doc(db, REVIEWS_COLLECTION, id), { isHidden, status: updated.status }).catch(err => {
      handleFirestoreError(err, OperationType.UPDATE, `${REVIEWS_COLLECTION}/${id}`);
    });

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

    // V3-05 Remediation: Proof of purchase or completed booking strictly required
    if (!data.orderId && !data.bookingId) {
      throw new Error('Proof of purchase or completed booking is strictly required to submit a review');
    }

    // Authoritative verified purchase status based on real customer orders
    const isVerifiedPurchase = orderService.hasUserPurchased(data.userId, data.targetId);
    if (data.orderId && !isVerifiedPurchase) {
      throw new Error('Forbidden: You can only review items you have actually purchased and completed');
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

    // Authoritative Cloud Firestore write
    await setDoc(doc(db, REVIEWS_COLLECTION, newReview.id), newReview);

    reviews.unshift(newReview);
    persistLocal(reviews);

    this.recalculateAggregateRating(newReview.targetType, newReview.targetId);

    return newReview;
  },

  deleteReview(id: string, currentUserId: string, userRole: string): boolean {
    const reviews = initReviews();
    const index = reviews.findIndex(r => r.id === id);
    if (index === -1) return false;

    const targetReview = reviews[index];
    const isAdmin = userRole === 'ADMIN' || userRole === 'SUPER_ADMIN';
    if (!isAdmin && targetReview.userId !== currentUserId) {
      throw new Error('Forbidden: You can only delete your own reviews');
    }

    reviews.splice(index, 1);
    persistLocal(reviews);

    deleteDoc(doc(db, REVIEWS_COLLECTION, id)).catch(err => {
      handleFirestoreError(err, OperationType.DELETE, `${REVIEWS_COLLECTION}/${id}`);
    });

    this.recalculateAggregateRating(targetReview.targetType, targetReview.targetId);

    return true;
  },

  replyToReview(
    id: string,
    replyText: string,
    sellerId?: string,
    sellerStoreId?: string
  ): Review {
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

    const updatedReview: Review = {
      ...targetReview,
      sellerReply: {
        comment: replyText.trim(),
        repliedAt: new Date().toISOString(),
      },
    };

    reviews[index] = updatedReview;
    persistLocal(reviews);

    setDoc(doc(db, REVIEWS_COLLECTION, id), updatedReview, { merge: true }).catch(err => {
      console.warn('Failed to persist seller reply to Firestore:', err);
    });

    return updatedReview;
  },
};
