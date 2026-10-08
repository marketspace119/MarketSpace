import { doc, getDoc, setDoc, writeBatch } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { PlatformSettings, UserRole } from '../types';
import { auditLogService } from './auditLogService';

const SETTINGS_STORAGE_KEY = 'marketspace_platform_settings_v1';
const SETTINGS_COLLECTION = 'platformSettings';
const DEFAULT_SETTINGS_DOC = 'default';

const defaultSettings: PlatformSettings = {
  defaultCommissionRate: 10, // 10%
  minPayoutThreshold: 20, // $20
  cardPaymentAvailable: false, // Strictly false: "Keep Cards disabled unless a real PCI-compliant provider exists."
  evcPlusMerchantNumber: '+252 612 4949 52',
  zaadMerchantNumber: '+252 634 1122 33',
  sahalMerchantNumber: '+252 907 8899 00',
  platformDeliveryEnabled: true,
  sellerDeliveryEnabled: true,
  customerPickupEnabled: true,
  supportPhone: '+252 612 4949 53',
  supportEmail: 'support@marketspace.so',
  payoutProcessingDays: 3,
  sellerPlansEnabled: true,
  advertisingEnabled: true,
  featuredStoresEnabled: true,
  promotionsEnabled: true,
  couponsEnabled: true,
  sellerTypeCommissionRates: {
    restaurant: 6,
    service: 8,
    store: 10,
    classified: 5,
  },
  categoryCommissionRates: {
    electronics: 7,
    digital: 5,
    cosmetics: 9,
    fashion: 10,
    groceries: 6,
    automotive: 8,
  },
  updatedAt: new Date().toISOString(),
  updatedBy: 'system',
};

let memorySettings: PlatformSettings | null = null;

function initSettings(): PlatformSettings {
  if (memorySettings) return memorySettings;
  // F-20: Do not read or trust localStorage for platform settings authority
  memorySettings = { ...defaultSettings };
  return memorySettings;
}

function persistLocal(settings: PlatformSettings) {
  memorySettings = settings;
  // F-20: LocalStorage persistence removed for authoritative platform settings
}

export const platformSettingsService = {
  resetMemoryState(): void {
    memorySettings = null;
  },
  async syncWithFirestore(userRole?: UserRole): Promise<PlatformSettings> {
    try {
      // P1-01: Admin reads full settings; non-admin reads operational and public documents only
      if (userRole === 'ADMIN' || userRole === 'SUPER_ADMIN') {
        const snap = await getDoc(doc(db, SETTINGS_COLLECTION, DEFAULT_SETTINGS_DOC));
        if (snap.exists()) {
          const cloud = snap.data() as PlatformSettings;
          persistLocal(cloud);
          return cloud;
        }
      } else {
        const [publicSnap, opSnap] = await Promise.all([
          getDoc(doc(db, SETTINGS_COLLECTION, 'publicPlatformSettings')).catch(() => null),
          getDoc(doc(db, SETTINGS_COLLECTION, 'operationalSettings')).catch(() => null),
        ]);
        const current = initSettings();
        const merged: PlatformSettings = {
          ...current,
          ...(publicSnap && publicSnap.exists() ? publicSnap.data() : {}),
          ...(opSnap && opSnap.exists() ? opSnap.data() : {}),
        };
        persistLocal(merged);
        return merged;
      }
    } catch (err) {
      console.warn('Settings Firestore sync offline/skipped:', err);
    }
    return initSettings();
  },

  getSettings(): PlatformSettings {
    return initSettings();
  },

  /**
   * Section 3 & P1-01: Tiered Financial Settings Access Policy
   * - PUBLIC: Support info & feature toggles only
   * - AUTHENTICATED OPERATIONAL: Merchant numbers for checkout
   * - ADMIN / SUPER_ADMIN: Full financial policies & rates
   */
  getSettingsForRole(userRole?: UserRole): Partial<PlatformSettings> {
    const s = initSettings();
    if (userRole === 'SUPER_ADMIN' || userRole === 'ADMIN') {
      return s;
    }
    if (userRole === 'SELLER' || userRole === 'RESTAURANT' || userRole === 'CUSTOMER' || userRole === 'SERVICE_PROVIDER' || (userRole as string) === 'DRIVER') {
      return {
        evcPlusMerchantNumber: s.evcPlusMerchantNumber,
        zaadMerchantNumber: s.zaadMerchantNumber,
        sahalMerchantNumber: s.sahalMerchantNumber,
        cardPaymentAvailable: false,
        platformDeliveryEnabled: s.platformDeliveryEnabled,
        sellerDeliveryEnabled: s.sellerDeliveryEnabled,
        customerPickupEnabled: s.customerPickupEnabled,
        supportPhone: s.supportPhone,
        supportEmail: s.supportEmail,
      };
    }
    return {
      supportPhone: s.supportPhone,
      supportEmail: s.supportEmail,
      cardPaymentAvailable: false,
      platformDeliveryEnabled: s.platformDeliveryEnabled,
      sellerDeliveryEnabled: s.sellerDeliveryEnabled,
      customerPickupEnabled: s.customerPickupEnabled,
    };
  },

  async updateSettings(
    updates: Partial<PlatformSettings>,
    actorId: string,
    actorRole: UserRole
  ): Promise<PlatformSettings> {
    const isSuperAdmin = actorRole === 'SUPER_ADMIN';
    if (!isSuperAdmin) {
      throw new Error('Forbidden: Only Super Administrators can alter core platform policies and commission settings');
    }

    // Section 11: Unified Commission Invariant (0% <= rate <= 50%)
    if (updates.defaultCommissionRate !== undefined) {
      if (typeof updates.defaultCommissionRate !== 'number' || !Number.isFinite(updates.defaultCommissionRate) || updates.defaultCommissionRate < 0 || updates.defaultCommissionRate > 50) {
        throw new Error('Invalid default commission rate: rate must be between 0% and 50%');
      }
    }
    if (updates.minPayoutThreshold !== undefined) {
      if (typeof updates.minPayoutThreshold !== 'number' || !Number.isFinite(updates.minPayoutThreshold) || updates.minPayoutThreshold < 5 || updates.minPayoutThreshold > 1000) {
        throw new Error('Invalid minimum payout threshold: threshold must be between $5 and $1,000');
      }
    }

    const current = initSettings();
    const updated: PlatformSettings = {
      ...current,
      ...updates,
      // Security enforcement: Card payments remain disabled unless approved PCI integration
      cardPaymentAvailable: false,
      updatedAt: new Date().toISOString(),
      updatedBy: actorId,
    };

    // P1-01: Disaggregate into segregated Firestore records
    const publicData = {
      supportPhone: updated.supportPhone,
      supportEmail: updated.supportEmail,
      platformDeliveryEnabled: updated.platformDeliveryEnabled,
      sellerDeliveryEnabled: updated.sellerDeliveryEnabled,
      customerPickupEnabled: updated.customerPickupEnabled,
      cardPaymentAvailable: false,
      updatedAt: updated.updatedAt,
      updatedBy: actorId,
    };

    const operationalData = {
      evcPlusMerchantNumber: updated.evcPlusMerchantNumber,
      zaadMerchantNumber: updated.zaadMerchantNumber,
      sahalMerchantNumber: updated.sahalMerchantNumber,
      sellerPlansEnabled: updated.sellerPlansEnabled,
      advertisingEnabled: updated.advertisingEnabled,
      featuredStoresEnabled: updated.featuredStoresEnabled,
      promotionsEnabled: updated.promotionsEnabled,
      couponsEnabled: updated.couponsEnabled,
      updatedAt: updated.updatedAt,
      updatedBy: actorId,
    };

    const privateFinancialData = {
      defaultCommissionRate: updated.defaultCommissionRate,
      minPayoutThreshold: updated.minPayoutThreshold,
      payoutProcessingDays: updated.payoutProcessingDays,
      sellerTypeCommissionRates: updated.sellerTypeCommissionRates,
      categoryCommissionRates: updated.categoryCommissionRates,
      updatedAt: updated.updatedAt,
      updatedBy: actorId,
    };

    const saveOperations = async () => {
      if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'test') {
        const batch = writeBatch(db);
        batch.set(doc(db, SETTINGS_COLLECTION, DEFAULT_SETTINGS_DOC), updated, { merge: true });
        batch.set(doc(db, SETTINGS_COLLECTION, 'publicPlatformSettings'), publicData, { merge: true });
        batch.set(doc(db, SETTINGS_COLLECTION, 'operationalSettings'), operationalData, { merge: true });
        batch.set(doc(db, SETTINGS_COLLECTION, 'privateFinancialSettings'), privateFinancialData, { merge: true });
        await batch.commit();
      } else {
        const serverAdminModule = '../../server/firebaseAdmin';
        const { getAdminDb } = await import(/* @vite-ignore */ serverAdminModule);
        const adminDb = getAdminDb();
        if (!adminDb) {
          throw new Error('Database write failure (Fail-Closed): Firestore Admin DB unavailable for settings persistence');
        }
        await adminDb.collection(SETTINGS_COLLECTION).doc(DEFAULT_SETTINGS_DOC).set(JSON.parse(JSON.stringify(updated)), { merge: true });
        await adminDb.collection(SETTINGS_COLLECTION).doc('publicPlatformSettings').set(JSON.parse(JSON.stringify(publicData)), { merge: true });
        await adminDb.collection(SETTINGS_COLLECTION).doc('operationalSettings').set(JSON.parse(JSON.stringify(operationalData)), { merge: true });
        await adminDb.collection(SETTINGS_COLLECTION).doc('privateFinancialSettings').set(JSON.parse(JSON.stringify(privateFinancialData)), { merge: true });
      }
    };

    // F-14: Authoritative Firestore write MUST succeed BEFORE mutating local state (Fail-Closed)
    try {
      await saveOperations();
    } catch (err: any) {
      throw new Error(`Database write failure (Fail-Closed): Unable to update platform settings in Firestore (${err?.message || err})`);
    }

    persistLocal(updated);

    await auditLogService.logAction({
      actorId,
      actorRole,
      action: 'SETTINGS_UPDATED',
      targetType: 'settings',
      targetId: DEFAULT_SETTINGS_DOC,
      targetName: 'Platform Global Configuration',
      metadata: { changedKeys: Object.keys(updates) },
    });

    return updated;
  },
};
