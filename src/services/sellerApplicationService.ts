import { collection, doc, getDocs, getDoc, setDoc, updateDoc, query, where, limit } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { SellerType, SellerStatus } from '../types';

export interface SellerApplication {
  id: string;
  userId: string;
  userName?: string;
  sellerType: SellerType;
  businessName: string;
  phone: string;
  email: string;
  location: string;
  description: string;
  status: SellerStatus;
  createdAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  notes?: string;
}

const APPLICATIONS_COLLECTION = 'sellerApplications';

export const sellerApplicationService = {
  async createApplication(data: any): Promise<SellerApplication> {
    const id = `app_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const newApp: SellerApplication = {
      ...data,
      businessName: data.businessName || data.storeName || 'Merchant Store',
      sellerType: data.sellerType || data.storeType || 'general',
      location: data.location || data.city || 'Mogadishu',
      id,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    try {
      if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'test') {
        await setDoc(doc(db, APPLICATIONS_COLLECTION, id), JSON.parse(JSON.stringify(newApp)));
      } else {
        const serverAdminModule = '../../server/firebaseAdmin';
        const { getAdminDb } = await import(/* @vite-ignore */ serverAdminModule);
        const adminDb = getAdminDb();
        if (!adminDb) {
          throw new Error('Database write failure (Fail-Closed): Admin DB unavailable for seller application');
        }
        await adminDb.collection(APPLICATIONS_COLLECTION).doc(id).set(JSON.parse(JSON.stringify(newApp)));
      }
    } catch (err: any) {
      handleFirestoreError(err, OperationType.CREATE, `${APPLICATIONS_COLLECTION}/${id}`);
      throw new Error(`Database write failure (Fail-Closed): Unable to persist seller application (${err?.message || err})`);
    }
    return newApp;
  },

  async submitApplication(data: any): Promise<SellerApplication> {
    return this.createApplication(data);
  },

  async getAllApplications(): Promise<SellerApplication[]> {
    try {
      const snapshot = await getDocs(query(collection(db, APPLICATIONS_COLLECTION), limit(200)));
      const apps: SellerApplication[] = [];
      snapshot.forEach(docSnap => {
        apps.push(docSnap.data() as SellerApplication);
      });
      return apps.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } catch (err) {
      console.warn('Could not load applications from Firestore:', err);
      return [];
    }
  },

  async updateApplicationStatus(id: string, status: SellerStatus, reviewerId: string): Promise<void> {
    const docRef = doc(db, APPLICATIONS_COLLECTION, id);
    try {
      await updateDoc(docRef, {
        status,
        reviewedAt: new Date().toISOString(),
        reviewedBy: reviewerId,
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `${APPLICATIONS_COLLECTION}/${id}`);
    }
  }
};
