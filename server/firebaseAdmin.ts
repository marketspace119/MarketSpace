import { initializeApp, getApps, cert, type App } from 'firebase-admin/app';
import { getAuth, type Auth, type DecodedIdToken } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getStorage, type Storage } from 'firebase-admin/storage';
import * as fs from 'fs';
import * as path from 'path';

let config: { projectId: string; firestoreDatabaseId?: string } = {
  projectId: 'marketspace-applet',
  firestoreDatabaseId: '(default)',
};
try {
  const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(configPath)) {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }
} catch {
  // Use default fallback
}

let adminApp: App | null = null;
let adminAuth: Auth | null = null;
let adminDb: Firestore | null = null;
let adminStorage: Storage | null = null;

/**
 * Lazy initialization of Firebase Admin Application
 * Supports Application Default Credentials (ADC) on GCP/Cloud Run,
 * and explicit service account credentials via environment variables for Render / standalone production.
 */
export function getAdminApp(): App {
  if (!adminApp) {
    const existing = getApps();
    if (existing.length > 0) {
      adminApp = existing[0];
    } else {
      const projectId = process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID || (process.env.FIRESTORE_EMULATOR_HOST ? 'marketspace-applet' : config.projectId);
      const isProd = process.env.NODE_ENV === 'production';

      if (isProd && projectId === 'marketspace-demo' && !process.env.ALLOW_DEMO_IN_PROD) {
        throw new Error(
          '[FirebaseAdmin:Critical] Production Misconfiguration (Fail-Closed): Backend cannot start against demo project "marketspace-demo". Configure FIREBASE_PROJECT_ID and credentials.'
        );
      }
      
      if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
        try {
          const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
          adminApp = initializeApp({
            credential: cert(serviceAccount),
            projectId: serviceAccount.project_id || projectId,
          });
        } catch (err: any) {
          console.error('[FirebaseAdmin] Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY JSON:', err.message);
          if (isProd) {
            throw new Error(`Production startup failure: Malformed FIREBASE_SERVICE_ACCOUNT_KEY credentials. (${err.message})`);
          }
          adminApp = initializeApp({ projectId });
        }
      } else if (process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
        const privateKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
        adminApp = initializeApp({
          credential: cert({
            projectId,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey,
          }),
          projectId,
        });
      } else {
        adminApp = initializeApp({
          projectId,
        });
      }
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
 * Sets Admin Firestore instance for deterministic unit testing and simulation.
 */
export function setAdminDbForTesting(mock: any): void {
  adminDb = mock;
}

/**
 * Returns Admin Storage instance
 */
export function getAdminStorage(): Storage {
  if (!adminStorage) {
    adminStorage = getStorage(getAdminApp());
  }
  return adminStorage;
}

/**
 * Sets Admin Storage instance for testing
 */
export function setAdminStorageForTesting(mock: any): void {
  adminStorage = mock;
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

  // F-41 Remediation: Explicitly reject test tokens in production under all circumstances
  if (token.startsWith('test-token:')) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Authentication failed: Test tokens are strictly forbidden in production');
    }
    if (process.env.NODE_ENV === 'test' || process.env.ENABLE_TEST_TOKENS === 'true') {
      try {
        const jsonStr = Buffer.from(token.replace('test-token:', ''), 'base64').toString('utf8');
        return JSON.parse(jsonStr) as DecodedIdToken;
      } catch {
        throw new Error('Authentication failed: Invalid test token payload');
      }
    }
    throw new Error('Authentication failed: Test tokens are disabled');
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
 * Centralized Authoritative Account-State Check (P0-AUTH-02)
 * Resolves users/{uid} directly from Firestore Admin SDK.
 * Rejects suspended, disabled, or banned accounts with HTTP 403 Forbidden.
 * Strictly Fail-Closed: If Firestore read fails, throws HTTP 503 Service Unavailable.
 */
export async function assertUserAccountActive(uid: string): Promise<void> {
  if (!uid) {
    throw new Error('Authentication failed: Missing user ID');
  }
  const adminDb = getAdminDb();
  try {
    const userDoc = await adminDb.collection('users').doc(uid).get();
    if (!userDoc.exists) {
      const err = new Error('Forbidden: User profile not found in authoritative records. Operation denied (Fail-Closed).');
      (err as any).statusCode = 403;
      throw err;
    }
    const data = userDoc.data() || {};
    const status = (data.status || '').toLowerCase().trim();
    if (status === 'suspended' || status === 'disabled' || status === 'banned' || data.disabled === true) {
      const err = new Error('Forbidden: Your account has been suspended or disabled. Please contact platform support.');
      (err as any).statusCode = 403;
      throw err;
    }
  } catch (err: any) {
    if (err.statusCode === 403 || err.message?.includes('suspended or disabled') || err.message?.includes('User profile not found')) {
      throw err;
    }
    // Strict Fail-Closed (P0-01): If Firestore read fails, do NOT continue; DENY with 503.
    console.error(`[FirebaseAdmin:AccountState] Fail-Closed: Firestore read failure for user ${uid}:`, err?.message || err);
    const failClosedErr = new Error('Service Unavailable: Unable to authoritatively verify account status. Request denied (Fail-Closed).');
    (failClosedErr as any).statusCode = 503;
    throw failClosedErr;
  }
}

/**
 * Authoritatively verifies admin role against Firestore state (P0-02 & P0-03).
 * Stale JWT claims CANNOT grant admin authority if demoted in Firestore or if Firestore is unavailable.
 */
export async function verifyAuthoritativeAdminRole(
  uid: string,
  decoded: DecodedIdToken
): Promise<{ isPlatformAdmin: boolean; isSuperAdmin: boolean }> {
  // 1. Mandatory Security Invariant: Unverified email identities CANNOT exercise admin authority
  if (decoded.email_verified !== true) {
    return { isPlatformAdmin: false, isSuperAdmin: false };
  }

  // 2. Email-based platform bootstrap
  const email = (decoded.email || '').toLowerCase().trim();
  if (email && TRUSTED_PLATFORM_SUPER_ADMIN_EMAILS.includes(email)) {
    return { isPlatformAdmin: true, isSuperAdmin: true };
  }

  // 3. Authoritative verification against Firestore (Zero-Window Revocation)
  const adminDb = getAdminDb();
  try {
    const adminDoc = await adminDb.collection('admins').doc(uid).get();
    const userDoc = await adminDb.collection('users').doc(uid).get();

    const adminRole = adminDoc.exists ? adminDoc.data()?.role : null;
    const userRole = userDoc.exists ? userDoc.data()?.role : null;

    const isSuperAdmin = adminRole === 'SUPER_ADMIN' || userRole === 'SUPER_ADMIN';
    const isPlatformAdmin = isSuperAdmin || adminRole === 'ADMIN' || userRole === 'ADMIN';

    return { isPlatformAdmin, isSuperAdmin };
  } catch (err: any) {
    // Fail-Closed: If database check encounters an error, NEVER grant admin privilege
    console.error(`[FirebaseAdmin:AuthoritativeRole] Fail-Closed: Role check failed for user ${uid}:`, err?.message || err);
    return { isPlatformAdmin: false, isSuperAdmin: false };
  }
}

/**
 * Authoritatively synchronizes Firebase Auth Custom Claims (P0-AUTH-01)
 */
export async function syncUserCustomClaims(
  uid: string,
  newRole: string,
  status: string = 'active',
  disabled: boolean = false
): Promise<Record<string, any>> {
  const isSuspendedOrDisabled =
    status === 'suspended' || status === 'banned' || status === 'disabled' || disabled === true;

  const claims: Record<string, any> = {
    role: newRole,
    admin: (newRole === 'ADMIN' || newRole === 'SUPER_ADMIN') && !isSuspendedOrDisabled,
    super_admin: newRole === 'SUPER_ADMIN' && !isSuspendedOrDisabled,
    status: status,
    disabled: isSuspendedOrDisabled,
  };
  try {
    const auth = getAdminAuth();
    await auth.setCustomUserClaims(uid, claims);
    // Explicit session and token revocation upon suspension or disablement (OPEN-03)
    if (isSuspendedOrDisabled) {
      await auth.updateUser(uid, { disabled: true });
      await auth.revokeRefreshTokens(uid);
    } else {
      await auth.updateUser(uid, { disabled: false });
    }
    console.log(`[FirebaseAdmin:CustomClaims] Claims synchronized and session tokens revoked for ${uid}:`, claims);
  } catch (err: any) {
    console.error(`[FirebaseAdmin:CustomClaims] Notice: Could not set custom claims via Admin SDK (${err?.message})`);
    // Fail-Closed Invariant (OPEN-03): In production, failing to set claims or revoke tokens must fail closed
    if (process.env.NODE_ENV === 'production') {
      const authErr = new Error(`Authoritative Auth synchronization failed for user ${uid}: ${err?.message || err}`);
      (authErr as any).statusCode = 500;
      throw authErr;
    }
  }
  return claims;
}

/**
 * Enforces that caller is authenticated with a valid Firebase ID token and that their account is not suspended.
 * Authoritatively resolves admin status against Firestore to prevent stale JWT claim privilege escalation (P0-02/P0-03).
 */
export async function requireAuthenticatedCaller(authHeader?: string): Promise<VerifiedCaller> {
  if (!authHeader) {
    throw new Error('Authentication required: Bearer token is missing');
  }
  const decoded = await verifyFirebaseBearerToken(authHeader);
  if (!decoded || !decoded.uid) {
    throw new Error('Authentication failed: Invalid or missing user identity in token');
  }

  // P0-AUTH-02 & P0-01: Universal check to enforce non-suspended account status (Fail-Closed)
  await assertUserAccountActive(decoded.uid);

  // P0-02 & P0-03: Authoritative role resolution against Firestore (Zero-Window Revocation)
  const authRoles = await verifyAuthoritativeAdminRole(decoded.uid, decoded);

  return {
    uid: decoded.uid,
    email: decoded.email,
    emailVerified: decoded.email_verified === true,
    isPlatformAdmin: authRoles.isPlatformAdmin,
    isSuperAdmin: authRoles.isSuperAdmin,
    token: decoded,
  };
}

/**
 * Enforces that caller is an authenticated Platform Administrator.
 * Strictly verifies against Firestore authoritative state to prevent token-cache desynchronization (P0-AUTH-01).
 * If caller is demoted in Firestore, cached token claims are revoked immediately.
 * Strictly Fail-Closed: If Firestore is unavailable, DENY with 503; NO FALLBACK to stale JWT claims (P0-02).
 */
export async function requireVerifiedPlatformAdmin(authHeader?: string): Promise<VerifiedCaller> {
  const caller = await requireAuthenticatedCaller(authHeader);

  // Email verification invariant is strictly required
  if (!caller.emailVerified) {
    throw new Error('Forbidden: Platform Administrator privileges require a verified email address');
  }

  // 1. Check bootstrap super admin email
  if (caller.email && TRUSTED_PLATFORM_SUPER_ADMIN_EMAILS.includes(caller.email.toLowerCase().trim())) {
    return caller;
  }

  // 2. Authoritative database verification against Firestore (Zero-Window Revocation)
  const adminDb = getAdminDb();
  try {
    const adminDoc = await adminDb.collection('admins').doc(caller.uid).get();
    const userDoc = await adminDb.collection('users').doc(caller.uid).get();

    const adminRole = adminDoc.exists ? adminDoc.data()?.role : null;
    const userRole = userDoc.exists ? userDoc.data()?.role : null;

    const isAuthoritativeAdmin =
      adminRole === 'ADMIN' || adminRole === 'SUPER_ADMIN' ||
      userRole === 'ADMIN' || userRole === 'SUPER_ADMIN';

    if (!isAuthoritativeAdmin) {
      // Even if decoded token claims say admin: true (e.g. unexpired cached token),
      // authoritative Firestore state has demoted this user -> FAIL CLOSED immediately.
      throw new Error('Forbidden: Platform Administrator privileges revoked or not assigned');
    }

    // Update caller flags to match authoritative database state
    caller.isPlatformAdmin = true;
    caller.isSuperAdmin = adminRole === 'SUPER_ADMIN' || userRole === 'SUPER_ADMIN';
  } catch (err: any) {
    if (err.message?.includes('Forbidden:')) throw err;
    // Strict Fail-Closed (P0-02): NO FALLBACK to stale JWT custom claims when Firestore is unavailable
    console.error(`[FirebaseAdmin:RequireAdmin] Fail-Closed: Authoritative check failed for ${caller.uid}:`, err?.message || err);
    const failClosedErr = new Error('Service Unavailable: Unable to authoritatively verify administrator privileges. Access denied (Fail-Closed).');
    (failClosedErr as any).statusCode = 503;
    throw failClosedErr;
  }

  return caller;
}

/**
 * Enforces that caller is an authenticated Super Administrator.
 * Strictly verifies against Firestore authoritative state (P0-AUTH-01).
 * Strictly Fail-Closed: If Firestore is unavailable, DENY with 503; NO FALLBACK to stale JWT claims (P0-02).
 */
export async function requireVerifiedSuperAdmin(authHeader?: string): Promise<VerifiedCaller> {
  const caller = await requireAuthenticatedCaller(authHeader);

  if (!caller.emailVerified) {
    throw new Error('Forbidden: Super Administrator privileges require a verified email address');
  }

  // 1. Check bootstrap super admin email
  if (caller.email && TRUSTED_PLATFORM_SUPER_ADMIN_EMAILS.includes(caller.email.toLowerCase().trim())) {
    return caller;
  }

  // 2. Authoritative database check
  const adminDb = getAdminDb();
  try {
    const adminDoc = await adminDb.collection('admins').doc(caller.uid).get();
    const userDoc = await adminDb.collection('users').doc(caller.uid).get();

    const isAuthoritativeSuperAdmin =
      (adminDoc.exists && adminDoc.data()?.role === 'SUPER_ADMIN') ||
      (userDoc.exists && userDoc.data()?.role === 'SUPER_ADMIN');

    if (!isAuthoritativeSuperAdmin) {
      throw new Error('Forbidden: Super Administrator privileges required');
    }

    caller.isSuperAdmin = true;
    caller.isPlatformAdmin = true;
  } catch (err: any) {
    if (err.message?.includes('Forbidden:')) throw err;
    // Strict Fail-Closed (P0-02): NO FALLBACK to stale JWT custom claims when Firestore is unavailable
    console.error(`[FirebaseAdmin:RequireSuperAdmin] Fail-Closed: Authoritative check failed for ${caller.uid}:`, err?.message || err);
    const failClosedErr = new Error('Service Unavailable: Unable to authoritatively verify super administrator privileges. Access denied (Fail-Closed).');
    (failClosedErr as any).statusCode = 503;
    throw failClosedErr;
  }

  return caller;
}
