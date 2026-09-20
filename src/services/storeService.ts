import { doc, getDocs, collection, setDoc, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Store, SellerStatus, UserRole } from '../types';
import { seedStores } from '../data/seedStores';
import { auditLogService } from './auditLogService';

const STORES_STORAGE_KEY = 'marketspace_stores_v1';
const FOLLOWS_STORAGE_KEY = 'marketspace_store_follows_v1';
const STORES_COLLECTION = 'stores';

let memoryStores: Store[] = [];

function initStores(): Store[] {
  if (memoryStores.length > 0) return memoryStores;
  if (typeof window === 'undefined') return seedStores;
  try {
    const raw = localStorage.getItem(STORES_STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(STORES_STORAGE_KEY, JSON.stringify(seedStores));
      memoryStores = seedStores;
      return seedStores;
    }
    memoryStores = JSON.parse(raw);
    return memoryStores;
  } catch (err) {
    console.error('Failed to load stores from localStorage', err);
    memoryStores = seedStores;
    return seedStores;
  }
}

function persistLocal(stores: Store[]) {
  memoryStores = stores;
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORES_STORAGE_KEY, JSON.stringify(stores));
  } catch (err) {
    console.error('Failed to save stores to storage', err);
  }
}

export const storeService = {
  /**
   * Background sync from Firestore to keep local cache fresh with cloud database
   */
  async syncWithFirestore(): Promise<Store[]> {
    try {
      const snap = await getDocs(collection(db, STORES_COLLECTION));
      if (!snap.empty) {
        const cloudStores: Store[] = [];
        snap.forEach(d => cloudStores.push(d.data() as Store));
        persistLocal(cloudStores);
        return cloudStores;
      }
    } catch (err) {
      console.warn('Firestore stores sync skipped or offline:', err);
    }
    return initStores();
  },

  getAllStores(filter: boolean | { status?: string; sellerType?: string } = false): Store[] {
    const stores = initStores();
    if (typeof filter === 'boolean') {
      if (filter) return stores;
      return stores.filter(s => s.status === 'approved');
    }
    let res = stores;
    if (filter?.status) {
      res = res.filter(s => s.status === filter.status);
    } else {
      res = res.filter(s => s.status === 'approved');
    }
    if (filter?.sellerType) {
      res = res.filter(s => s.sellerType === filter.sellerType);
    }
    return res;
  },

  getStoreBySlug(slug: string): Store | undefined {
    const stores = initStores();
    return stores.find(s => s.slug.toLowerCase() === slug.toLowerCase());
  },

  getStoreById(id: string): Store | undefined {
    const stores = initStores();
    return stores.find(s => s.id === id);
  },

  getStoreBySellerId(sellerId: string): Store | undefined {
    const stores = initStores();
    return stores.find(s => s.sellerId === sellerId);
  },

  createStore(newStoreData: Omit<Store, 'id' | 'createdAt' | 'status' | 'followersCount' | 'rating' | 'reviewsCount' | 'isVerified'>): Store {
    const stores = initStores();
    const newStore: Store = {
      ...newStoreData,
      id: `store_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      status: 'pending',
      followersCount: 0,
      rating: 5.0,
      reviewsCount: 0,
      isVerified: false,
      createdAt: new Date().toISOString(),
    };

    stores.unshift(newStore);
    persistLocal(stores);

    // Persist to Cloud Firestore
    setDoc(doc(db, STORES_COLLECTION, newStore.id), newStore).catch(err => {
      console.warn('Could not write store to Firestore immediately:', err);
    });

    return newStore;
  },

  updateStore(id: string, updates: Partial<Store>, currentUserId?: string, userRole?: string): Store {
    const stores = initStores();
    const index = stores.findIndex(s => s.id === id);
    if (index === -1) throw new Error('Store not found');

    const store = stores[index];
    const isAdmin = userRole === 'ADMIN' || userRole === 'SUPER_ADMIN';

    // Authorization check
    if (!isAdmin && store.sellerId !== currentUserId) {
      throw new Error('Unauthorized: You do not own this store');
    }

    const safeUpdates = { ...updates };
    if (!isAdmin) {
      delete safeUpdates.id;
      delete safeUpdates.sellerId;
      delete safeUpdates.status;
      delete safeUpdates.isVerified;
      delete safeUpdates.commissionRate;
      delete safeUpdates.rating;
      delete safeUpdates.reviewsCount;
      delete safeUpdates.followersCount;
      delete safeUpdates.createdAt;
    }

    const updated = { ...store, ...safeUpdates };
    stores[index] = updated;
    persistLocal(stores);

    // Persist to Cloud Firestore
    setDoc(doc(db, STORES_COLLECTION, id), updated, { merge: true }).catch(err => {
      handleFirestoreError(err, OperationType.UPDATE, `${STORES_COLLECTION}/${id}`);
    });

    return updated;
  },

  updateStoreStatus(id: string, status: SellerStatus, currentUserId?: string, userRole?: string): Store {
    const isAdmin = userRole === 'ADMIN' || userRole === 'SUPER_ADMIN';
    if (!isAdmin) {
      throw new Error('Forbidden: Only platform admins can approve, reject, or suspend stores');
    }

    const stores = initStores();
    const index = stores.findIndex(s => s.id === id);
    if (index === -1) throw new Error('Store not found');

    const targetStore = stores[index];
    stores[index].status = status;
    persistLocal(stores);

    // Persist status change to Firestore
    updateDoc(doc(db, STORES_COLLECTION, id), { status }).catch(err => {
      handleFirestoreError(err, OperationType.UPDATE, `${STORES_COLLECTION}/${id}`);
    });

    if (currentUserId && userRole) {
      auditLogService.logAction({
        actorId: currentUserId,
        actorRole: userRole as UserRole,
        action: `STORE_${status.toUpperCase()}`,
        targetType: targetStore.sellerType === 'restaurant' ? 'restaurant' : targetStore.sellerType === 'service' ? 'service' : 'store',
        targetId: id,
        targetName: targetStore.name || id,
        metadata: { status, sellerId: targetStore.sellerId },
      });
    }

    return stores[index];
  },

  toggleStoreVerification(id: string, currentUserId?: string, userRole?: string): Store {
    const isAdmin = userRole === 'ADMIN' || userRole === 'SUPER_ADMIN';
    if (!isAdmin) {
      throw new Error('Forbidden: Only platform admins can grant or revoke the verified badge');
    }

    const stores = initStores();
    const index = stores.findIndex(s => s.id === id);
    if (index === -1) throw new Error('Store not found');

    const targetStore = stores[index];
    const nextState = !stores[index].isVerified;
    stores[index].isVerified = nextState;
    persistLocal(stores);

    updateDoc(doc(db, STORES_COLLECTION, id), { isVerified: nextState }).catch(err => {
      handleFirestoreError(err, OperationType.UPDATE, `${STORES_COLLECTION}/${id}`);
    });

    if (currentUserId && userRole) {
      auditLogService.logAction({
        actorId: currentUserId,
        actorRole: userRole as UserRole,
        action: nextState ? 'STORE_VERIFIED' : 'STORE_UNVERIFIED',
        targetType: targetStore.sellerType === 'restaurant' ? 'restaurant' : targetStore.sellerType === 'service' ? 'service' : 'store',
        targetId: id,
        targetName: targetStore.name || id,
        metadata: { isVerified: nextState, sellerId: targetStore.sellerId },
      });
    }

    return stores[index];
  },

  toggleVerifiedBadge(id: string, currentUserId?: string, userRole?: string): Store {
    return this.toggleStoreVerification(id, currentUserId, userRole);
  },

  // Follow System (Client UX preference)
  toggleFollow(storeId: string, userId: string): boolean {
    if (typeof window === 'undefined') return false;
    try {
      const raw = localStorage.getItem(FOLLOWS_STORAGE_KEY);
      const follows: Record<string, string[]> = raw ? JSON.parse(raw) : {};
      const userFollows = follows[userId] || [];

      const isFollowing = userFollows.includes(storeId);
      const newFollows = isFollowing
        ? userFollows.filter(id => id !== storeId)
        : [...userFollows, storeId];

      follows[userId] = newFollows;
      localStorage.setItem(FOLLOWS_STORAGE_KEY, JSON.stringify(follows));

      // Update store count
      const stores = initStores();
      const sIdx = stores.findIndex(s => s.id === storeId);
      if (sIdx !== -1) {
        stores[sIdx].followersCount = Math.max(0, stores[sIdx].followersCount + (isFollowing ? -1 : 1));
        persistLocal(stores);
      }

      return !isFollowing;
    } catch {
      return false;
    }
  },

  isFollowing(storeId: string, userId?: string): boolean {
    if (!userId || typeof window === 'undefined') return false;
    try {
      const raw = localStorage.getItem(FOLLOWS_STORAGE_KEY);
      const follows: Record<string, string[]> = raw ? JSON.parse(raw) : {};
      const userFollows = follows[userId] || [];
      return userFollows.includes(storeId);
    } catch {
      return false;
    }
  },

  followStore(userId: string, storeId: string): boolean {
    if (!this.isFollowing(storeId, userId)) {
      return this.toggleFollow(storeId, userId);
    }
    return true;
  },

  unfollowStore(userId: string, storeId: string): boolean {
    if (this.isFollowing(storeId, userId)) {
      return this.toggleFollow(storeId, userId);
    }
    return false;
  },

  getFollowedStores(userId: string): Store[] {
    if (!userId || typeof window === 'undefined') return [];
    try {
      const raw = localStorage.getItem(FOLLOWS_STORAGE_KEY);
      const follows: Record<string, string[]> = raw ? JSON.parse(raw) : {};
      const userFollows = follows[userId] || [];
      const stores = initStores();
      return stores.filter(s => userFollows.includes(s.id));
    } catch {
      return [];
    }
  },
};
