import { initializeApp, getApps, type App } from 'firebase-admin/app';
import { getAuth, type Auth, type DecodedIdToken } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import config from '../firebase-applet-config.json' with { type: 'json' };

let adminApp: App | null = null;
let adminAuth: Auth | null = null;
let adminDb: Firestore | null = null;

/**
 * Lazy initialization of Firebase Admin Application
 */
export function getAdminApp(): App {
  if (!adminApp) {
    const existing = getApps();
    if (existing.length > 0) {
      adminApp = existing[0];
    } else {
      adminApp = initializeApp({
        projectId: config.projectId,
      });
    }
  }
  return adminApp;
}

/**
 * Returns Admin Auth instance for token verification and user verification
 */
export function getAdminAuth(): Auth {
  if (!adminAuth) {
    adminAuth = getAuth(getAdminApp());
  }
  return adminAuth;
}

/**
 * Returns Admin Firestore instance
 */
export function getAdminDb(): Firestore {
  if (!adminDb) {
    adminDb = getFirestore(getAdminApp(), config.firestoreDatabaseId);
    try {
      adminDb.settings({ ignoreUndefinedProperties: true });
    } catch {
      // ignore if already set
    }
  }
  return adminDb;
}

/**
 * Server Identity and Diagnostic Info
 */
export function getServerIdentityInfo() {
  return {
    projectId: config.projectId,
    firestoreDatabaseId: config.firestoreDatabaseId,
    serviceAccountEmail: process.env.AUTHORIZED_SERVICE_ACCOUNT_EMAIL || `ais-sandbox@${config.projectId}.iam.gserviceaccount.com`,
    cloudRunService: process.env.K_SERVICE || 'unknown',
    cloudRunRevision: process.env.K_REVISION || 'unknown',
    nodeEnv: process.env.NODE_ENV || 'development',
  };
}

/**
 * Centralized, trusted super-admin email list.
 * Single source of truth for platform bootstrap identities.
 */
export const TRUSTED_PLATFORM_SUPER_ADMIN_EMAILS: readonly string[] = Object.freeze([
  (process.env.PLATFORM_OWNER_EMAIL || 'spacecompanies119@gmail.com').toLowerCase().trim(),
  'marketspace119@gmail.com',
]);

/**
 * Determines authoritatively if a decoded token represents a Super Administrator.
 * MANDATORY: Email-based role elevation strictly requires decoded.email_verified === true.
 */
export function isCallerSuperAdmin(decoded: DecodedIdToken | null | undefined): boolean {
  if (!decoded || !decoded.uid) return false;

  // MANDATORY SECURITY INVARIANT: Unverified email identities CANNOT exercise super admin authority
  if (decoded.email_verified !== true) {
    return false;
  }

  // 1. Authoritative server-set custom claims
  if (decoded.super_admin === true || decoded.role === 'SUPER_ADMIN') {
    return true;
  }

  // 2. Email-based platform bootstrap: STRICTLY REQUIRES verified email
  const email = (decoded.email || '').toLowerCase().trim();
  if (email && TRUSTED_PLATFORM_SUPER_ADMIN_EMAILS.includes(email)) {
    return true;
  }

  return false;
}

/**
 * Determines authoritatively if a decoded token represents a Platform Administrator (Admin or SuperAdmin).
 * MANDATORY: Requires decoded.email_verified === true.
 */
export function isCallerPlatformAdmin(decoded: DecodedIdToken | null | undefined): boolean {
  if (!decoded || !decoded.uid) return false;

  // MANDATORY SECURITY INVARIANT: Unverified email identities CANNOT exercise admin authority
  if (decoded.email_verified !== true) {
    return false;
  }

  if (isCallerSuperAdmin(decoded)) {
    return true;
  }

  // Authoritative server-set custom claims
  if (decoded.admin === true || decoded.role === 'ADMIN') {
    return true;
  }

  return false;
}

export interface VerifiedCaller {
  uid: string;
  email?: string;
  emailVerified: boolean;
  isPlatformAdmin: boolean;
  isSuperAdmin: boolean;
  token: DecodedIdToken;
}

/**
 * Authoritatively verifies a Firebase ID token from an HTTP Authorization header.
 * Returns DecodedIdToken if valid.
 * Returns null if no Authorization header is present (guest checkout).
 * Throws an Error if a Bearer token is provided but is invalid or expired.
 */
export async function verifyFirebaseBearerToken(authHeader?: string): Promise<DecodedIdToken | null> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7).trim();
  if (!token) {
    return null;
  }

  // Support deterministic test token decoding in test / emulator environments only
  if ((process.env.NODE_ENV === 'test' || process.env.FIRESTORE_EMULATOR_HOST) && token.startsWith('test-token:')) {
    try {
      const jsonStr = Buffer.from(token.replace('test-token:', ''), 'base64').toString('utf8');
      return JSON.parse(jsonStr) as DecodedIdToken;
    } catch {
      throw new Error('Authentication failed: Invalid test token payload');
    }
  }

  try {
    const auth = getAdminAuth();
    const decoded = await auth.verifyIdToken(token);
    return decoded;
  } catch (err: any) {
    console.error('[FirebaseAdmin] ID Token verification failed:', err.message);
    throw new Error('Authentication failed: Invalid or expired Firebase ID token');
  }
}

/**
 * Enforces that caller is authenticated with a valid Firebase ID token.
 */
export async function requireAuthenticatedCaller(authHeader?: string): Promise<VerifiedCaller> {
  if (!authHeader) {
    throw new Error('Authentication required: Bearer token is missing');
  }
  const decoded = await verifyFirebaseBearerToken(authHeader);
  if (!decoded || !decoded.uid) {
    throw new Error('Authentication failed: Invalid or missing user identity in token');
  }
  return {
    uid: decoded.uid,
    email: decoded.email,
    emailVerified: decoded.email_verified === true,
    isPlatformAdmin: isCallerPlatformAdmin(decoded),
    isSuperAdmin: isCallerSuperAdmin(decoded),
    token: decoded,
  };
}

/**
 * Enforces that caller is an authenticated Platform Administrator.
 */
export async function requireVerifiedPlatformAdmin(authHeader?: string): Promise<VerifiedCaller> {
  const caller = await requireAuthenticatedCaller(authHeader);
  if (!caller.isPlatformAdmin) {
    throw new Error('Forbidden: Platform Administrator privileges required');
  }
  return caller;
}

/**
 * Enforces that caller is an authenticated Super Administrator.
 */
export async function requireVerifiedSuperAdmin(authHeader?: string): Promise<VerifiedCaller> {
  const caller = await requireAuthenticatedCaller(authHeader);
  if (!caller.isSuperAdmin) {
    throw new Error('Forbidden: Super Administrator privileges required');
  }
  return caller;
}
