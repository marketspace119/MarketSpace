import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { seedStores } from '../data/seedStores';
import { seedProducts } from '../data/seedProducts';
import { Store, Product } from '../types';

const SEED_LOCK_DOC = 'system/seed_status';
let hasAttemptedSeedInSession = false;

export const seedService = {
  /**
   * Seeds initial demo catalog to Firestore if not previously initialized.
   * Clearly flags entities with isSeedData = true to distinguish from real user data.
   */
  async seedInitialCatalogIfNeeded(): Promise<boolean> {
    if (hasAttemptedSeedInSession) {
      return false;
    }
    hasAttemptedSeedInSession = true;

    // Production Safety Guard: Never auto-seed in production unless explicitly commanded
    const metaEnv = (import.meta as unknown as { env?: { PROD?: boolean; VITE_ENABLE_SEEDING?: string } }).env;
    if (metaEnv?.PROD && metaEnv?.VITE_ENABLE_SEEDING !== 'true') {
      console.log('[SeedService] Production environment detected: automated catalog seeding disabled.');
      return false;
    }

    try {
      const lockRef = doc(db, 'system', 'seed_status');
      const lockSnap = await getDoc(lockRef);

      if (lockSnap.exists() && lockSnap.data()?.seeded) {
        return false;
      }

      console.log('Seeding initial MarketSpace catalog into Firestore...');

      // Seed initial stores
      for (const store of seedStores) {
        const enrichedStore: Store & { isSeedData: boolean } = {
          ...store,
          isSeedData: true,
        };
        await setDoc(doc(db, 'stores', store.id), enrichedStore);
      }

      // Seed initial products
      for (const product of seedProducts) {
        let storeId = 'store_cosmetics_01';
        let sellerId = 'user_seller_01';
        if (product.type === 'restaurants' || product.type === 'restaurant-products') {
          storeId = 'store_restaurant_01';
          sellerId = 'user_restaurant_01';
        } else if (product.type === 'services') {
          storeId = 'store_service_01';
          sellerId = 'user_service_01';
        } else if (product.type === 'used' || product.type === 'ads') {
          storeId = 'store_classified_01';
          sellerId = 'user_classified_01';
        }

        const enrichedProduct: Product & { isSeedData: boolean } = {
          ...product,
          storeId,
          sellerId,
          isPublished: true,
          status: 'approved',
          isSeedData: true,
        };
        await setDoc(doc(db, 'products', product.id), enrichedProduct);
      }

      // Mark seed complete
      await setDoc(lockRef, {
        seeded: true,
        seededAt: new Date().toISOString(),
        version: '1.0.0',
        environment: 'development_seed'
      });

      console.log('MarketSpace catalog seed completed.');
      return true;
    } catch (err: any) {
      if (err?.code === 'permission-denied') {
        console.warn('[SeedService] Automatic client-side seeding skipped: Firestore security rules protect production collections. Utilizing authorized in-memory catalog.');
      } else {
        console.warn('[SeedService] Catalog initialization notice:', err?.message || err);
      }
      return false;
    }
  }
};
