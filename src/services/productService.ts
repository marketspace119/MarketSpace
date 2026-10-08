import { doc, getDocs, collection, setDoc, updateDoc, deleteDoc, query, limit, startAfter, orderBy, where } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { Product, UserRole } from '../types';
import { seedProducts } from '../data/seedProducts';
import { auditLogService } from './auditLogService';
import { normalizeProduct } from '../lib/dataNormalization';
import { subscriptionService } from './subscriptionService';

const PRODUCTS_STORAGE_KEY = 'marketspace_products_v1';
const PRODUCTS_COLLECTION = 'products';

let memoryProducts: Product[] = [];

function isProductionEnvironment(): boolean {
  if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'production') return true;
  if (typeof import.meta !== 'undefined' && (import.meta as any).env?.PROD) return true;
  return false;
}

function initProducts(): Product[] {
  if (memoryProducts.length > 0) return memoryProducts;
  if (isProductionEnvironment()) {
    memoryProducts = [];
    return [];
  }
  // F-20: Do not read or trust localStorage for product authority
  const initialized = seedProducts.map((p, idx) => {
    let storeId = 'store_cosmetics_01';
    let sellerId = 'user_seller_01';
    if (p.type === 'restaurants' || p.type === 'restaurant-products') {
      storeId = 'store_restaurant_01';
      sellerId = 'user_restaurant_01';
    } else if (p.type === 'services') {
      storeId = 'store_service_01';
      sellerId = 'user_service_01';
    } else if (p.type === 'used' || p.type === 'ads') {
      storeId = 'store_classified_01';
      sellerId = 'user_classified_01';
    } else if (idx % 2 === 1) {
      storeId = 'store_tech_02';
      sellerId = 'user_seller_02';
    }
    return normalizeProduct({
      ...p,
      storeId,
      sellerId,
      isPublished: p.isPublished ?? true,
      status: p.status ?? 'approved',
    });
  });
  memoryProducts = initialized;
  return initialized;
}

function cleanForFirestore<T extends Record<string, any>>(obj: T): any {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(item => cleanForFirestore(item));
  const cleaned: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k === 'inventoryHistory' || k === 'salesCount') continue; // F-16: Never persist internal inventory telemetry on public product docs
    if (v !== undefined) {
      cleaned[k] = typeof v === 'object' && v !== null ? cleanForFirestore(v) : v;
    }
  }
  return cleaned;
}

type ProductListener = () => void;
const listeners: Set<ProductListener> = new Set();

function notifyListeners() {
  listeners.forEach(fn => {
    try {
      fn();
    } catch (e) {
      console.error('Error in product listener', e);
    }
  });
}

function persistLocal(products: Product[]) {
  const normalized = products.map(normalizeProduct);
  memoryProducts = normalized;
  // F-20: LocalStorage persistence removed for authoritative product state
  notifyListeners();
}

export const productService = {
  resetMemoryState(): void {
    memoryProducts = [];
  },

  seedProducts(products: Product[]): void {
    memoryProducts = products.map(normalizeProduct);
    notifyListeners();
  },

  /**
   * Subscribe to live product catalog updates
   */
  subscribe(listener: ProductListener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  /**
   * Safe local inventory cache update
   */
  updateLocalStockOnly(id: string, newStock: number) {
    const products = initProducts();
    const index = products.findIndex(p => p.id === id);
    if (index !== -1) {
      products[index] = {
        ...products[index],
        stock: Math.max(0, newStock),
        updatedAt: new Date().toISOString(),
      };
      persistLocal(products);
    }
  },

  /**
   * Bounded sync from Cloud Firestore (V3-09 Scalability & V3-10 Isolation)
   */
  async syncWithFirestore(): Promise<Product[]> {
    try {
      // Bounded query prevents memory crash at production scale
      const snap = await getDocs(query(collection(db, PRODUCTS_COLLECTION), limit(100)));
      if (!snap.empty) {
        const cloudProducts: Product[] = [];
        snap.forEach(d => {
          const raw = d.data();
          cloudProducts.push(normalizeProduct({
            ...raw,
            id: d.id || raw.id,
          }));
        });
        persistLocal(cloudProducts);
        return cloudProducts;
      }
    } catch (err) {
      console.warn('Firestore products sync skipped or offline:', err);
    }
    return initProducts();
  },

  /**
   * Paginated retrieval from Cloud Firestore (V3-09 Query Pagination)
   */
  async fetchProductsPage(options?: {
    pageSize?: number;
    cursor?: any;
    type?: string;
    category?: string;
    sellerId?: string;
    storeId?: string;
    onlyPublished?: boolean;
  }): Promise<{ products: Product[]; nextCursor: any; hasMore: boolean }> {
    const pageSize = Math.min(100, Math.max(1, options?.pageSize || 24));
    try {
      let q = collection(db, PRODUCTS_COLLECTION) as any;
      const constraints: any[] = [];

      if (options?.onlyPublished) {
        constraints.push(where('isPublished', '==', true));
      }
      if (options?.sellerId) {
        constraints.push(where('sellerId', '==', options.sellerId));
      }
      if (options?.storeId) {
        constraints.push(where('storeId', '==', options.storeId));
      }
      if (options?.type && options.type !== 'all') {
        constraints.push(where('type', '==', options.type));
      }
      if (options?.category && options.category !== 'all') {
        constraints.push(where('category', '==', options.category));
      }

      constraints.push(limit(pageSize));
      if (options?.cursor) {
        constraints.push(startAfter(options.cursor));
      }

      const snap = await getDocs(query(q, ...constraints));
      const products: Product[] = [];
      snap.forEach(d => {
        const raw = d.data() as Record<string, any>;
        products.push(normalizeProduct({ ...raw, id: d.id || raw.id }));
      });

      const nextCursor = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null;
      return {
        products,
        nextCursor,
        hasMore: snap.docs.length === pageSize,
      };
    } catch (err) {
      console.warn('fetchProductsPage fallback to memory:', err);
      const all = this.getAllProducts(options);
      return {
        products: all.slice(0, pageSize),
        nextCursor: null,
        hasMore: all.length > pageSize,
      };
    }
  },

  getAllProducts(filters?: {
    sellerId?: string;
    storeId?: string;
    type?: string;
    category?: string;
    onlyPublished?: boolean;
    status?: string;
  }): Product[] {
    let products = initProducts();

    if (filters?.onlyPublished) {
      products = products.filter(p => p.isPublished !== false && (p.status === 'approved' || p.status === 'published' || !p.status));
    }
    if (filters?.sellerId) {
      products = products.filter(p => p.sellerId === filters.sellerId);
    }
    if (filters?.storeId) {
      products = products.filter(p => p.storeId === filters.storeId);
    }
    if (filters?.type && filters.type !== 'all') {
      products = products.filter(p => p.type === filters.type);
    }
    if (filters?.category && filters.category !== 'all') {
      products = products.filter(p => p.category === filters.category || p.categories?.includes(filters.category));
    }
    if (filters?.status && filters.status !== 'all') {
      products = products.filter(p => p.status === filters.status);
    }

    return products;
  },

  getProductBySlug(slug: string): Product | undefined {
    const products = initProducts();
    return products.find(p => p.slug.toLowerCase() === slug.toLowerCase());
  },

  getProductById(id: string): Product | undefined {
    const products = initProducts();
    return products.find(p => p.id === id);
  },

  searchProducts(query: string): Product[] {
    const q = query.trim().toLowerCase();
    if (!q) return this.getAllProducts({ onlyPublished: true });
    return this.getAllProducts({ onlyPublished: true }).filter(p => {
      const title = `${p.title?.ar || ''} ${p.title?.en || ''} ${p.title?.so || ''}`.toLowerCase();
      const desc = `${p.description?.ar || ''} ${p.description?.en || ''} ${p.description?.so || ''}`.toLowerCase();
      const cat = (p.category || '').toLowerCase();
      return title.includes(q) || desc.includes(q) || cat.includes(q);
    });
  },

  toggleProductStatus(
    id: string,
    status: Product['status'],
    currentUserId: string,
    userRole: string
  ): Product {
    return this.updateProduct(id, { status, isPublished: status === 'published' }, currentUserId, userRole);
  },

  getOffers(): Product[] {
    const products = this.getAllProducts({ onlyPublished: true });
    return products.filter(p => p.isOffer || (p.discount && p.discount > 0) || (p.oldPrice && p.oldPrice > p.price));
  },

  getRelatedProducts(currentProductId: string, category: string, limit = 4): Product[] {
    const products = this.getAllProducts({ onlyPublished: true });
    return products
      .filter(p => p.id !== currentProductId && (p.category === category || p.categories?.includes(category)))
      .slice(0, limit);
  },

  /**
   * Authoritative Server-Side Product Creation (POST /api/products/create)
   * Enforces authentication, store ownership, atomic subscription plan quota, price/stock validation,
   * and fail-closed Firestore persistence:
   *  - database write succeeds -> return success
   *  - database write fails -> throw error
   */
  async createProductAuthoritative(
    productData: Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'rating' | 'reviewsCount'>,
    currentUserId: string,
    currentStoreId: string,
    customAuthToken?: string
  ): Promise<Product> {
    const rawPrice = Number(productData.price);
    if (!Number.isFinite(rawPrice) || isNaN(rawPrice) || rawPrice < 0) {
      throw new Error('Invalid product price: price must be a finite non-negative number');
    }
    const rawStock = Number(productData.stock ?? 0);
    if (!Number.isFinite(rawStock) || isNaN(rawStock) || rawStock < 0) {
      throw new Error('Invalid product stock: stock must be a finite non-negative integer');
    }

    let idToken = customAuthToken;
    if (!idToken && auth.currentUser) {
      idToken = await auth.currentUser.getIdToken();
    }
    if (!idToken) {
      throw new Error('Authentication required: Cannot create product without verified credentials');
    }

    const res = await fetch('/api/products/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        ...productData,
        sellerId: currentUserId,
        storeId: currentStoreId,
      }),
    });

    const data = await res.json();
    if (!res.ok || !data.success || !data.product) {
      throw new Error(data.error || 'Authoritative product creation failed on server');
    }

    const createdProduct = normalizeProduct(data.product);
    const products = initProducts();
    products.unshift(createdProduct);
    persistLocal(products);
    return createdProduct;
  },

  /**
   * F-08: Local synchronous product helper is strictly disabled in production.
   * All authoritative product creations MUST use createProductAuthoritative (/api/products/create).
   */
  createProduct(
    productData: Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'rating' | 'reviewsCount'>,
    currentUserId: string,
    currentStoreId: string
  ): Product {
    if (isProductionEnvironment()) {
      throw new Error(
        'Forbidden (Fail-Closed): Direct client-side product creation is disabled in production. Use createProductAuthoritative (/api/products/create).'
      );
    }
    const rawPrice = Number(productData.price);
    if (!Number.isFinite(rawPrice) || isNaN(rawPrice) || rawPrice < 0) {
      throw new Error('Invalid product price: price must be a finite non-negative number');
    }
    const rawStock = Number(productData.stock ?? 0);
    if (!Number.isFinite(rawStock) || isNaN(rawStock) || rawStock < 0) {
      throw new Error('Invalid product stock: stock must be a finite non-negative integer');
    }

    const products = initProducts();

    // Subscription plan product quota enforcement
    if (currentUserId && currentStoreId) {
      const activeSub = subscriptionService.getSellerActiveSubscription(currentUserId);
      const plans = subscriptionService.getPlans();
      const plan = (activeSub ? plans.find(p => p.id === activeSub.planId || p.tier === activeSub.planTier) : undefined) || plans.find(p => p.id === 'plan_free');
      if (plan && plan.maxProducts) {
        const currentCount = products.filter(p => p.storeId === currentStoreId).length;
        if (currentCount >= plan.maxProducts) {
          throw new Error(
            `لقد بلغت الحد الأقصى للمنتجات المسموح بها (${plan.maxProducts}) في باقتك الحالية (${plan.name.ar || plan.name.en}). يرجى ترقية الباقة لتتمكن من إضافة المزيد من المنتجات.`
          );
        }
      }
    }

    const newProduct: Product = {
      ...productData,
      id: `prod_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      sellerId: currentUserId,
      storeId: currentStoreId,
      rating: 5.0,
      reviewsCount: 0,
      isPublished: productData.isPublished ?? true,
      status: productData.status || 'published',
      stock: Math.max(0, Math.floor(rawStock)),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    products.unshift(newProduct);
    persistLocal(products);

    return newProduct;
  },

  /**
   * Authoritative Product Update (PCR-13 Remediation):
   * Persists to Server Gateway / Cloud Firestore FIRST.
   * If Firestore/Server fails, throws immediately and does NOT mutate local state.
   */
  async updateProductAuthoritative(
    id: string,
    updates: Partial<Product>,
    currentUserId: string,
    userRole: string
  ): Promise<Product> {
    const products = initProducts();
    const index = products.findIndex(p => p.id === id);
    if (index === -1) throw new Error('Product not found');

    const product = products[index];
    const isAdmin = userRole === 'ADMIN' || userRole === 'SUPER_ADMIN';
    if (!isAdmin && product.sellerId !== currentUserId) {
      throw new Error('Forbidden: You can only edit your own products');
    }

    const safeUpdates = { ...updates };
    if (!isAdmin) {
      delete safeUpdates.sellerId;
      delete safeUpdates.storeId;
      delete safeUpdates.rating;
      delete safeUpdates.reviewsCount;
      if (safeUpdates.status) {
        const allowedSellerStatuses = ['draft', 'pending_review', 'published', 'hidden'];
        if (!allowedSellerStatuses.includes(safeUpdates.status)) {
          delete safeUpdates.status;
        }
      }
    }

    if (safeUpdates.price !== undefined) {
      safeUpdates.price = Math.max(0.01, Number(safeUpdates.price));
    }

    let nextHistory = product.inventoryHistory || [];
    let newInventoryLogEntry: any = null;
    if (safeUpdates.stock !== undefined) {
      const newStock = Math.max(0, Math.floor(Number(safeUpdates.stock)));
      const oldStock = product.stock;
      if (newStock !== oldStock) {
        newInventoryLogEntry = {
          id: `inv_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          productId: id,
          sellerId: product.sellerId,
          date: new Date().toISOString(),
          previousStock: oldStock,
          newStock,
          change: newStock - oldStock,
          reason: 'manual_update',
          actor: currentUserId,
        };
        nextHistory = [
          newInventoryLogEntry,
          ...nextHistory,
        ];
      }
      safeUpdates.stock = newStock;
    }

    const updated: Product = {
      ...product,
      ...safeUpdates,
      inventoryHistory: nextHistory,
      updatedAt: new Date().toISOString(),
    };

    // 1. Authoritative Server / Firestore Persistence FIRST (Fail-Closed: throw before local mutation)
    if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'test') {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
      const res = await fetch('/api/products/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ productId: id, updates: safeUpdates }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Authoritative product update failed on server');
      }
    } else {
      const serverAdminModule = '../../server/firebaseAdmin';
      const { getAdminDb } = await import(/* @vite-ignore */ serverAdminModule);
      const adminDb = getAdminDb();
      if (!adminDb) {
        throw new Error('Database write failure (Fail-Closed): Firestore Admin DB unavailable');
      }
      await adminDb.collection(PRODUCTS_COLLECTION).doc(id).set(cleanForFirestore(updated), { merge: true });
      if (newInventoryLogEntry) {
        await adminDb.collection('inventory_logs').doc(newInventoryLogEntry.id).set(newInventoryLogEntry);
      }
    }

    // 2. Update local state ONLY after authoritative persistence succeeds
    products[index] = updated;
    persistLocal(products);
    return updated;
  },

  async getProductInventoryHistory(productId: string): Promise<any[]> {
    const products = initProducts();
    const product = products.find(p => p.id === productId);
    const localHistory = product?.inventoryHistory || [];
    try {
      if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'test') {
        const q = query(collection(db, 'inventory_logs'), where('productId', '==', productId), limit(200));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const logs: any[] = [];
          snap.forEach(d => logs.push(d.data()));
          logs.sort((a, b) => new Date(b.date || b.timestamp || 0).getTime() - new Date(a.date || a.timestamp || 0).getTime());
          if (product) {
            product.inventoryHistory = logs;
          }
          return logs;
        }
      } else {
        const serverAdminModule = '../../server/firebaseAdmin';
        const { getAdminDb } = await import(/* @vite-ignore */ serverAdminModule);
        const adminDb = getAdminDb();
        if (adminDb && typeof adminDb.collection === 'function') {
          const col = adminDb.collection('inventory_logs');
          if (typeof col.where === 'function') {
            let invQuery: any = col.where('productId', '==', productId);
            if (typeof invQuery.limit === 'function') {
              invQuery = invQuery.limit(200);
            }
            const snap = await invQuery.get();
            if (snap && !snap.empty) {
              const logs: any[] = [];
              snap.forEach((d: any) => logs.push(d.data()));
              logs.sort((a, b) => new Date(b.date || b.timestamp || 0).getTime() - new Date(a.date || a.timestamp || 0).getTime());
              if (product) {
                product.inventoryHistory = logs;
              }
              return logs;
            }
          }
        }
      }
    } catch {
      // Fallback to local history
    }
    return localHistory;
  },

  updateProduct(
    id: string,
    updates: Partial<Product>,
    currentUserId: string,
    userRole: string
  ): Product {
    if (isProductionEnvironment()) {
      throw new Error(
        'Forbidden (Fail-Closed): Direct client-side product update is disabled in production. Use updateProductAuthoritative (/api/products/update).'
      );
    }
    const products = initProducts();
    const index = products.findIndex(p => p.id === id);
    if (index === -1) throw new Error('Product not found');

    const product = products[index];

    // Strictly enforce ownership check
    const isAdmin = userRole === 'ADMIN' || userRole === 'SUPER_ADMIN';
    if (!isAdmin && product.sellerId !== currentUserId) {
      throw new Error('Forbidden: You can only edit your own products');
    }

    // Sanitize non-admin updates (prevent changing ownership or fake ratings)
    const safeUpdates = { ...updates };
    if (!isAdmin) {
      delete safeUpdates.sellerId;
      delete safeUpdates.storeId;
      delete safeUpdates.rating;
      delete safeUpdates.reviewsCount;
      // Allow seller to transition between valid seller lifecycle states
      if (safeUpdates.status) {
        const allowedSellerStatuses = ['draft', 'pending_review', 'published', 'hidden'];
        if (!allowedSellerStatuses.includes(safeUpdates.status)) {
          delete safeUpdates.status;
        }
      }
    }

    if (safeUpdates.price !== undefined) {
      safeUpdates.price = Math.max(0.01, Number(safeUpdates.price));
    }

    if (safeUpdates.stock !== undefined) {
      safeUpdates.stock = Math.max(0, Math.floor(Number(safeUpdates.stock)));
    }

    const updated: Product = {
      ...product,
      ...safeUpdates,
      updatedAt: new Date().toISOString(),
    };
    delete (updated as any).inventoryHistory;
    delete (updated as any).salesCount;

    products[index] = updated;
    persistLocal(products);

    return updated;
  },

  async updateProductRatingAuthoritative(productId: string, rating: number, reviewsCount: number): Promise<void> {
    const products = initProducts();
    const index = products.findIndex(p => p.id === productId);
    const safeRating = Number(rating.toFixed(1));
    const safeCount = Math.max(0, Math.floor(reviewsCount));
    const now = new Date().toISOString();

    const serverAdminModule = '../../server/firebaseAdmin';
    const { getAdminDb } = await import(/* @vite-ignore */ serverAdminModule);
    const adminDb = getAdminDb();
    if (!adminDb) {
      throw new Error('Database write failure (Fail-Closed): Firestore Admin DB unavailable for rating update');
    }
    await adminDb.collection(PRODUCTS_COLLECTION).doc(productId).set({
      rating: safeRating,
      reviewsCount: safeCount,
      updatedAt: now,
    }, { merge: true });

    if (index !== -1) {
      products[index] = {
        ...products[index],
        rating: safeRating,
        reviewsCount: safeCount,
        updatedAt: now,
      };
      persistLocal(products);
    }
  },

  updateProductRating(productId: string, rating: number, reviewsCount: number): void {
    const products = initProducts();
    const index = products.findIndex(p => p.id === productId);
    if (index === -1) return;

    const updated: Product = {
      ...products[index],
      rating: Number(rating.toFixed(1)),
      reviewsCount: Math.max(0, Math.floor(reviewsCount)),
      updatedAt: new Date().toISOString(),
    };

    products[index] = updated;
    persistLocal(products);
  },

  /**
   * Authoritative Product Deletion (PCR-13 Remediation):
   * Deletes in Server Gateway / Cloud Firestore FIRST.
   * If Firestore/Server fails, throws immediately and does NOT remove from local state.
   */
  async deleteProductAuthoritative(id: string, currentUserId: string, userRole: string): Promise<boolean> {
    const products = initProducts();
    const product = products.find(p => p.id === id);
    if (!product) throw new Error('Product not found');

    const isAdmin = userRole === 'ADMIN' || userRole === 'SUPER_ADMIN';
    if (!isAdmin && product.sellerId !== currentUserId) {
      throw new Error('Forbidden: You can only delete your own products');
    }

    if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'test') {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
      const res = await fetch('/api/products/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ productId: id }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Authoritative product deletion failed on server');
      }
    } else {
      const serverAdminModule = '../../server/firebaseAdmin';
      const { getAdminDb } = await import(/* @vite-ignore */ serverAdminModule);
      const adminDb = getAdminDb();
      if (!adminDb) {
        throw new Error('Database write failure (Fail-Closed): Firestore Admin DB unavailable');
      }
      await adminDb.collection(PRODUCTS_COLLECTION).doc(id).delete();
    }

    const filtered = products.filter(p => p.id !== id);
    persistLocal(filtered);
    return true;
  },

  deleteProduct(id: string, currentUserId: string, userRole: string): boolean {
    if (isProductionEnvironment()) {
      throw new Error(
        'Forbidden (Fail-Closed): Direct client-side product deletion is disabled in production. Use deleteProductAuthoritative (/api/products/delete).'
      );
    }
    const products = initProducts();
    const product = products.find(p => p.id === id);
    if (!product) return false;

    const isAdmin = userRole === 'ADMIN' || userRole === 'SUPER_ADMIN';
    if (!isAdmin && product.sellerId !== currentUserId) {
      throw new Error('Forbidden: You can only delete your own products');
    }

    const filtered = products.filter(p => p.id !== id);
    persistLocal(filtered);
    return true;
  },

  async togglePublishAuthoritative(id: string, currentUserId: string, userRole: string): Promise<Product> {
    const products = initProducts();
    const index = products.findIndex(p => p.id === id);
    if (index === -1) throw new Error('Product not found');
    const nextPublished = !products[index].isPublished;
    const nextStatus = nextPublished ? 'published' : 'hidden';
    return await this.updateProductAuthoritative(
      id,
      { isPublished: nextPublished, status: nextStatus },
      currentUserId,
      userRole
    );
  },

  togglePublish(id: string, currentUserId: string, userRole: string): Product {
    if (isProductionEnvironment()) {
      throw new Error(
        'Forbidden (Fail-Closed): Direct client-side product publish toggle is disabled in production. Use togglePublishAuthoritative.'
      );
    }
    const products = initProducts();
    const index = products.findIndex(p => p.id === id);
    if (index === -1) throw new Error('Product not found');

    const product = products[index];
    const isAdmin = userRole === 'ADMIN' || userRole === 'SUPER_ADMIN';
    if (!isAdmin && product.sellerId !== currentUserId) {
      throw new Error('Forbidden: You can only toggle your own products');
    }

    const nextPublished = !products[index].isPublished;
    products[index].isPublished = nextPublished;
    products[index].updatedAt = new Date().toISOString();
    persistLocal(products);

    return products[index];
  },

  async updateProductStatusAuthoritative(
    id: string,
    status: 'approved' | 'pending' | 'rejected' | 'hidden',
    currentUserId: string,
    userRole: string
  ): Promise<Product> {
    const isAdmin = userRole === 'ADMIN' || userRole === 'SUPER_ADMIN';
    if (!isAdmin) {
      throw new Error('Forbidden: Only platform admins can moderate product status');
    }
    const updated = await this.updateProductAuthoritative(id, { status }, currentUserId, userRole);
    auditLogService.logAction({
      actorId: currentUserId,
      actorRole: userRole as UserRole,
      action: `PRODUCT_${status.toUpperCase()}`,
      targetType: 'product',
      targetId: id,
      targetName: updated.title?.ar || updated.title?.en || id,
      metadata: { status, price: updated.price, sellerId: updated.sellerId },
    });
    return updated;
  },

  updateProductStatus(
    id: string,
    status: 'approved' | 'pending' | 'rejected' | 'hidden',
    currentUserId?: string,
    userRole?: string
  ): Product {
    if (isProductionEnvironment()) {
      throw new Error(
        'Forbidden (Fail-Closed): Direct client-side product status update is disabled in production. Use updateProductStatusAuthoritative.'
      );
    }
    const isAdmin = userRole === 'ADMIN' || userRole === 'SUPER_ADMIN';
    if (!isAdmin) {
      throw new Error('Forbidden: Only platform admins can moderate product status');
    }

    const products = initProducts();
    const index = products.findIndex(p => p.id === id);
    if (index === -1) throw new Error('Product not found');

    const targetProduct = products[index];
    products[index].status = status;
    products[index].updatedAt = new Date().toISOString();
    persistLocal(products);

    if (currentUserId && userRole) {
      auditLogService.logAction({
        actorId: currentUserId,
        actorRole: userRole as UserRole,
        action: `PRODUCT_${status.toUpperCase()}`,
        targetType: 'product',
        targetId: id,
        targetName: targetProduct.title?.ar || targetProduct.title?.en || id,
        metadata: { status, price: targetProduct.price, sellerId: targetProduct.sellerId },
      });
    }

    return products[index];
  },
};
