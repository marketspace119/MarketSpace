import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, doc, getDocFromServer } from 'firebase/firestore';
import { getStorage, connectStorageEmulator } from 'firebase/storage';
import firebaseConfig from '../../firebase-applet-config.json';

// P0-01 Remediation: Prioritize real environment variables to guarantee browser and backend connect to the exact same Firebase project
const env: Record<string, any> = typeof import.meta !== 'undefined' && (import.meta as any).env
  ? (import.meta as any).env
  : (typeof process !== 'undefined' ? process.env : {});

const resolvedConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || (firebaseConfig as any)?.apiKey,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || (firebaseConfig as any)?.authDomain,
  projectId: env.VITE_FIREBASE_PROJECT_ID || (firebaseConfig as any)?.projectId,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || (firebaseConfig as any)?.storageBucket,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || (firebaseConfig as any)?.messagingSenderId,
  appId: env.VITE_FIREBASE_APP_ID || (firebaseConfig as any)?.appId,
  firestoreDatabaseId: env.VITE_FIREBASE_DATABASE_ID || (firebaseConfig as any)?.firestoreDatabaseId || '(default)',
};

// Fail-closed invariant in production: prohibit demo configuration in production environments
if (env.PROD || env.NODE_ENV === 'production') {
  if (resolvedConfig.projectId === 'marketspace-demo' && !env.ALLOW_DEMO_IN_PROD) {
    throw new Error(
      '[FirebaseClient:Critical] Production Misconfiguration (Fail-Closed): Production client cannot connect to demo Firebase project "marketspace-demo". Please set VITE_FIREBASE_PROJECT_ID.'
    );
  }
}

const app = initializeApp(resolvedConfig);
export const db = getFirestore(app, resolvedConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const storage = getStorage(app);

// Seamlessly connect client SDK to local emulators during testing and local verification
if (typeof process !== 'undefined' && process.env?.FIRESTORE_EMULATOR_HOST) {
  const [fHost, fPort] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
  try {
    connectFirestoreEmulator(db, fHost, parseInt(fPort || '8080', 10));
  } catch {}
}
if (typeof process !== 'undefined' && process.env?.FIREBASE_STORAGE_EMULATOR_HOST) {
  const [sHost, sPort] = process.env.FIREBASE_STORAGE_EMULATOR_HOST.split(':');
  try {
    connectStorageEmulator(storage, sHost, parseInt(sPort || '9199', 10));
  } catch {}
}
if (typeof process !== 'undefined' && process.env?.FIREBASE_AUTH_EMULATOR_HOST) {
  try {
    connectAuthEmulator(auth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`);
  } catch {}
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

/**
 * Strips all undefined properties recursively from an object so Firestore setDoc/updateDoc doesn't reject it
 */
export function cleanForFirestore<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    return obj.map(item => cleanForFirestore(item)) as unknown as T;
  }
  const cleaned: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj as Record<string, any>)) {
    if (value !== undefined) {
      cleaned[key] = cleanForFirestore(value);
    }
  }
  return cleaned as T;
}

export async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
