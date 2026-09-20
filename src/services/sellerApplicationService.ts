import { collection, doc, getDocs, getDoc, setDoc, updateDoc, query, where } from 'firebase/firestore';
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
  async createApplication(data: Omit<SellerApplication, 'id' | 'createdAt' | 'status'>): Promise<SellerApplication> {
    const id = `app_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const newApp: SellerApplication = {
      ...data,
      id,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    try {
      await setDoc(doc(db, APPLICATIONS_COLLECTION, id), newApp);
    } catch (err) {
      console.warn('Could not persist seller application to Firestore, using fallback:', err);
    }
    return newApp;
  },

  async getAllApplications(): Promise<SellerApplication[]> {
    try {
      const snapshot = await getDocs(collection(db, APPLICATIONS_COLLECTION));
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
