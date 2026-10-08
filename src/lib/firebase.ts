import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, doc, getDocFromServer } from 'firebase/firestore';
import { getStorage, connectStorageEmulator } from 'firebase/storage';
import { defaultFirebaseConfig } from './firebaseConfigFallback';

// Optional static config via glob (does not fail build if file is absent)
const configModules = typeof import.meta !== 'undefined' && (import.meta as any).glob
  ? (import.meta as any).glob('/firebase-applet-config.json', { eager: true })
  : {};
const firebaseConfig = (configModules['/firebase-applet-config.json'] as any)?.default || null;

// P0-01 Remediation: Prioritize real environment variables to guarantee browser and backend connect to the exact same Firebase project
const env: Record<string, any> = typeof import.meta !== 'undefined' && (import.meta as any).env
  ? (import.meta as any).env
  : (typeof process !== 'undefined' ? process.env : {});

const appletConfig = (typeof firebaseConfig !== 'undefined' && firebaseConfig) ? firebaseConfig : defaultFirebaseConfig;

export interface FirebaseEnvInput {
  PROD?: boolean | string;
  NODE_ENV?: string;
  ALLOW_DEMO_IN_PROD?: string;
  VITE_FIREBASE_API_KEY?: string;
  VITE_FIREBASE_AUTH_DOMAIN?: string;
  VITE_FIREBASE_PROJECT_ID?: string;
  VITE_FIREBASE_STORAGE_BUCKET?: string;
  VITE_FIREBASE_MESSAGING_SENDER_ID?: string;
  VITE_FIREBASE_APP_ID?: string;
  VITE_FIREBASE_DATABASE_ID?: string;
  FIREBASE_PROJECT_ID?: string;
  GCLOUD_PROJECT?: string;
}

export function validateAndResolveClientFirebaseConfig(
  customEnv: FirebaseEnvInput,
  staticAppletConfig: any = firebaseConfig
) {
  const isProd = customEnv.PROD === true || customEnv.PROD === 'true' || customEnv.NODE_ENV === 'production';
  const allowDemo = customEnv.ALLOW_DEMO_IN_PROD === 'true' || customEnv.ALLOW_DEMO_IN_PROD === '1';

  const explicitProjectId = customEnv.VITE_FIREBASE_PROJECT_ID || staticAppletConfig?.projectId || '';
  const explicitApiKey = customEnv.VITE_FIREBASE_API_KEY || staticAppletConfig?.apiKey || '';
  const backendProjectId = customEnv.FIREBASE_PROJECT_ID || customEnv.GCLOUD_PROJECT || '';

  if (isProd && !allowDemo) {
    if (!explicitProjectId || !explicitApiKey) {
      throw new Error(
        '[FirebaseClient:Critical] Production Misconfiguration (Fail-Closed): Missing explicit VITE_FIREBASE_PROJECT_ID or VITE_FIREBASE_API_KEY in production. Refusing to fall back to default development credentials.'
      );
    }
    if (
      explicitProjectId === 'marketspace-demo' ||
      explicitProjectId === 'marketspace-applet' ||
      explicitProjectId.toLowerCase().includes('demo') ||
      explicitProjectId.toLowerCase().includes('placeholder') ||
      explicitProjectId.toLowerCase().includes('dummy') ||
      explicitApiKey === 'AIzaSyDummyKeyForLocalDevelopmentOnly' ||
      explicitApiKey.toLowerCase().includes('dummy') ||
      explicitApiKey.toLowerCase().includes('placeholder') ||
      explicitApiKey.toLowerCase().includes('demo')
    ) {
      throw new Error(
        `[FirebaseClient:Critical] Production Misconfiguration (Fail-Closed): Production client cannot connect to demo/fallback Firebase project "${explicitProjectId}" or dummy API key. Configure real production credentials.`
      );
    }
    if (backendProjectId && explicitProjectId !== backendProjectId) {
      throw new Error(
        `[FirebaseClient:Critical] Production Split-Brain Detected (Fail-Closed): Frontend project "${explicitProjectId}" does not match backend project "${backendProjectId}".`
      );
    }
  } else if (customEnv.VITE_FIREBASE_PROJECT_ID && backendProjectId && customEnv.VITE_FIREBASE_PROJECT_ID !== backendProjectId) {
    throw new Error(
      `[FirebaseClient:Critical] Split-Brain Detected (Fail-Closed): Frontend project "${customEnv.VITE_FIREBASE_PROJECT_ID}" does not match backend project "${backendProjectId}".`
    );
  }

  const fb = staticAppletConfig || defaultFirebaseConfig;
  const resolvedProjectId = explicitProjectId || defaultFirebaseConfig.projectId;
  return {
    apiKey: explicitApiKey || defaultFirebaseConfig.apiKey,
    authDomain: customEnv.VITE_FIREBASE_AUTH_DOMAIN || fb?.authDomain || `${resolvedProjectId}.firebaseapp.com`,
    projectId: resolvedProjectId,
    storageBucket: customEnv.VITE_FIREBASE_STORAGE_BUCKET || fb?.storageBucket || `${resolvedProjectId}.appspot.com`,
    messagingSenderId: customEnv.VITE_FIREBASE_MESSAGING_SENDER_ID || fb?.messagingSenderId || defaultFirebaseConfig.messagingSenderId,
    appId: customEnv.VITE_FIREBASE_APP_ID || fb?.appId || defaultFirebaseConfig.appId,
    firestoreDatabaseId: customEnv.VITE_FIREBASE_DATABASE_ID || fb?.firestoreDatabaseId || defaultFirebaseConfig.firestoreDatabaseId,
  };
}

const resolvedConfig = validateAndResolveClientFirebaseConfig(env, firebaseConfig);

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
