import { collection, doc, getDocs, setDoc, updateDoc, deleteDoc, query, where } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { SavedAddress } from '../types';

const ADDRESSES_STORAGE_KEY = 'marketspace_saved_addresses_v1';
const ADDRESSES_COLLECTION = 'addresses';

let memoryAddresses: SavedAddress[] = [];

function loadFromStorage(): SavedAddress[] {
  if (memoryAddresses.length > 0) return memoryAddresses;
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(ADDRESSES_STORAGE_KEY);
    if (!raw) return [];
    memoryAddresses = JSON.parse(raw);
    return memoryAddresses;
  } catch (err) {
    console.error('Failed to parse saved addresses:', err);
    return [];
  }
}

function persistStorage(addresses: SavedAddress[]) {
  memoryAddresses = addresses;
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(ADDRESSES_STORAGE_KEY, JSON.stringify(addresses));
  } catch (err) {
    console.error('Failed to save addresses to storage:', err);
  }
}

export const addressService = {
  /**
   * Purge address cache on logout or user switch
   */
  clearUserCache() {
    memoryAddresses = [];
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem(ADDRESSES_STORAGE_KEY);
      } catch (err) {
        console.error('Failed to clear address cache', err);
      }
    }
  },

  async getAddresses(userId: string): Promise<SavedAddress[]> {
    if (!userId) return [];
    try {
      const q = query(
        collection(db, ADDRESSES_COLLECTION),
        where('userId', '==', userId)
      );
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        const cloud: SavedAddress[] = [];
        snapshot.forEach(docSnap => cloud.push(docSnap.data() as SavedAddress));
        
        // Merge with local storage
        const current = loadFromStorage().filter(a => a.userId !== userId);
        const merged = [...current, ...cloud];
        persistStorage(merged);
        return cloud.sort((a, b) => (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0));
      }
    } catch (err) {
      console.warn('Addresses Firestore sync offline/fallback:', err);
    }

    const local = loadFromStorage().filter(a => a.userId === userId);
    return local.sort((a, b) => (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0));
  },

  async addAddress(
    userId: string,
    data: Omit<SavedAddress, 'id' | 'userId' | 'createdAt' | 'updatedAt'>
  ): Promise<SavedAddress> {
    if (!userId) throw new Error('User authentication required to save address');
    if (!data.recipientName.trim() || !data.phone.trim() || !data.address.trim()) {
      throw new Error('Recipient name, phone, and street address are required');
    }

    const id = `addr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();

    const current = loadFromStorage();
    // If setting as default, update other user addresses
    if (data.isDefault) {
      current.forEach(addr => {
        if (addr.userId === userId) {
          addr.isDefault = false;
        }
      });
    }

    const newAddress: SavedAddress = {
      ...data,
      id,
      userId,
      recipientName: data.recipientName.trim(),
      phone: data.phone.trim(),
      city: data.city.trim() || 'Mogadishu',
      district: data.district?.trim() || '',
      address: data.address.trim(),
      landmark: data.landmark?.trim() || '',
      deliveryNotes: data.deliveryNotes?.trim() || '',
      isDefault: data.isDefault || current.filter(a => a.userId === userId).length === 0,
      createdAt: now,
      updatedAt: now,
    };

    current.unshift(newAddress);
    persistStorage(current);

    try {
      await setDoc(doc(db, ADDRESSES_COLLECTION, id), newAddress);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `${ADDRESSES_COLLECTION}/${id}`);
    }

    return newAddress;
  },

  async updateAddress(
    userIdOrAddressId: string,
    addressIdOrUpdates: string | Partial<SavedAddress>,
    maybeUpdates?: Partial<SavedAddress>
  ): Promise<SavedAddress> {
    const current = loadFromStorage();
    let userId: string;
    let addressId: string;
    let updates: Partial<SavedAddress>;

    if (typeof addressIdOrUpdates === 'string') {
      userId = userIdOrAddressId;
      addressId = addressIdOrUpdates;
      updates = maybeUpdates || {};
    } else {
      addressId = userIdOrAddressId;
      updates = addressIdOrUpdates;
      const existing = current.find(a => a.id === addressId);
      userId = existing ? existing.userId : '';
    }

    const index = current.findIndex(a => a.id === addressId && (!userId || a.userId === userId));
    if (index === -1) throw new Error('Address not found');

    if (updates.isDefault) {
      const targetUserId = current[index].userId;
      current.forEach(addr => {
        if (addr.userId === targetUserId) {
          addr.isDefault = false;
        }
      });
    }

    const updated: SavedAddress = {
      ...current[index],
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    current[index] = updated;
    persistStorage(current);

    try {
      await updateDoc(doc(db, ADDRESSES_COLLECTION, addressId), updated as { [x: string]: any });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `${ADDRESSES_COLLECTION}/${addressId}`);
    }

    return updated;
  },

  async deleteAddress(userId: string, addressId?: string): Promise<void> {
    // If called as deleteAddress(addressId)
    const effectiveAddressId = addressId || userId;
    const current = loadFromStorage().filter(a => a.id !== effectiveAddressId);
    persistStorage(current);

    try {
      await deleteDoc(doc(db, ADDRESSES_COLLECTION, effectiveAddressId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `${ADDRESSES_COLLECTION}/${effectiveAddressId}`);
    }
  },

  async setDefault(userId: string, addressId: string): Promise<void> {
    await this.updateAddress(userId, addressId, { isDefault: true });
  },

  // Aliases for convenient caller ergonomics
  async getUserAddresses(userId: string): Promise<SavedAddress[]> {
    return this.getAddresses(userId);
  },

  async createAddress(
    data: Omit<SavedAddress, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<SavedAddress> {
    return this.addAddress(data.userId, data);
  },

  async setDefaultAddress(userIdOrAddrId: string, maybeAddrId?: string): Promise<void> {
    if (maybeAddrId) {
      return this.setDefault(userIdOrAddrId, maybeAddrId);
    }
    // Find address to get userId
    const current = loadFromStorage();
    const found = current.find(a => a.id === userIdOrAddrId);
    if (found) {
      return this.setDefault(found.userId, found.id);
    }
  },
};
