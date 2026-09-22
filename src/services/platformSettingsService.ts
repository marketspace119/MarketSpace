import { doc, getDoc, setDoc } from 'firebase/firestore';
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
  if (typeof window === 'undefined') return defaultSettings;
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(defaultSettings));
      memorySettings = defaultSettings;
      return defaultSettings;
    }
    memorySettings = JSON.parse(raw);
    return memorySettings || defaultSettings;
  } catch (err) {
    console.error('Failed to load platform settings from storage:', err);
    return defaultSettings;
  }
}

function persistLocal(settings: PlatformSettings) {
  memorySettings = settings;
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch (err) {
    console.error('Failed to save settings to localStorage:', err);
  }
}

export const platformSettingsService = {
  async syncWithFirestore(): Promise<PlatformSettings> {
    try {
      const snap = await getDoc(doc(db, SETTINGS_COLLECTION, DEFAULT_SETTINGS_DOC));
      if (snap.exists()) {
        const cloud = snap.data() as PlatformSettings;
        persistLocal(cloud);
        return cloud;
      }
    } catch (err) {
      console.warn('Settings Firestore sync offline/skipped:', err);
    }
    return initSettings();
  },

  getSettings(): PlatformSettings {
    return initSettings();
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

    const current = initSettings();
    const updated: PlatformSettings = {
      ...current,
      ...updates,
      // Security enforcement: Card payments remain disabled unless approved PCI integration
      cardPaymentAvailable: false,
      updatedAt: new Date().toISOString(),
      updatedBy: actorId,
    };

    persistLocal(updated);

    try {
      await Promise.race([
        setDoc(doc(db, SETTINGS_COLLECTION, DEFAULT_SETTINGS_DOC), updated, { merge: true }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Firestore write timeout')), 600)),
      ]);
    } catch (err) {
      console.warn('Failed to save settings to Firestore:', err);
    }

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
