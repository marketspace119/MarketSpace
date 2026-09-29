import { getAdminDb, requireVerifiedSuperAdmin, syncUserCustomClaims } from './firebaseAdmin';
import { UserRole } from '../src/types';

export interface UpdateUserRolePayload {
  targetUserId: string;
  newRole: UserRole;
  notes?: string;
}

export interface UpdateUserVerificationPayload {
  targetUserId: string;
  isVerified: boolean;
  sellerStatus?: 'ACTIVE' | 'INACTIVE' | 'PENDING' | 'SUSPENDED';
  notes?: string;
}

/**
 * Authoritative Backend Gateway for User Role Elevation and Privilege Mutation.
 * Invariant: Strictly requires SUPER_ADMIN with verified email.
 * Normal admins and unauthorized actors fail closed.
 */
export async function processUserRoleUpdateGateway(
  payload: UpdateUserRolePayload,
  authHeader?: string
) {
  const caller = await requireVerifiedSuperAdmin(authHeader);

  const { targetUserId, newRole, notes } = payload;
  if (!targetUserId || !newRole) {
    const err = new Error('Target User ID and new role are required.');
    (err as any).statusCode = 400;
    throw err;
  }

  const validRoles: UserRole[] = ['CUSTOMER', 'SELLER', 'RESTAURANT', 'SERVICE_PROVIDER', 'ADMIN', 'SUPER_ADMIN'];
  if (!validRoles.includes(newRole)) {
    const err = new Error(`Invalid role specified: ${newRole}`);
    (err as any).statusCode = 400;
    throw err;
  }

  const adminDb = getAdminDb();
  const now = new Date().toISOString();

  const result = await adminDb.runTransaction(async (transaction) => {
    const userDocRef = adminDb.collection('users').doc(targetUserId);
    const userDoc = await transaction.get(userDocRef);

    if (!userDoc.exists) {
      const err = new Error(`User ${targetUserId} does not exist.`);
      (err as any).statusCode = 404;
      throw err;
    }

    const userData = userDoc.data() || {};
    const previousRole = userData.role || 'CUSTOMER';

    // Prevent demoting self or removing the last super admin inadvertently
    if (targetUserId === caller.uid && newRole !== 'SUPER_ADMIN') {
      const err = new Error('Cannot demote your own Super Administrator account.');
      (err as any).statusCode = 400;
      throw err;
    }

    const beforeState = { role: previousRole, isVerified: userData.isVerified || false };
    const afterState = { role: newRole, isVerified: userData.isVerified || false };

    // Update user record
    transaction.update(userDocRef, {
      role: newRole,
      updatedAt: now,
    });

    // Sync authoritative /admins collection
    const adminDocRef = adminDb.collection('admins').doc(targetUserId);
    if (newRole === 'ADMIN' || newRole === 'SUPER_ADMIN') {
      transaction.set(adminDocRef, {
        id: targetUserId,
        email: userData.email || '',
        name: userData.name || '',
        role: newRole,
        assignedBy: caller.uid,
        assignedAt: now,
      }, { merge: true });
    } else {
      // If demoted from admin, remove from admins registry
      const adminDoc = await transaction.get(adminDocRef);
      if (adminDoc.exists) {
        transaction.delete(adminDocRef);
      }
    }

    // Authoritative Audit Log
    const auditLogRef = adminDb.collection('audit_logs').doc();
    transaction.set(auditLogRef, {
      id: auditLogRef.id,
      actorId: caller.uid,
      actorRole: 'SUPER_ADMIN',
      actorEmail: caller.email || '',
      action: 'USER_ROLE_UPDATED',
      targetType: 'user',
      targetId: targetUserId,
      targetName: userData.name || userData.email || targetUserId,
      resourceType: 'user',
      resourceId: targetUserId,
      beforeState,
      afterState,
      reason: notes || 'Super Admin role update',
      metadata: {
        targetUserId,
        previousRole,
        newRole,
        notes: notes || '',
      },
      timestamp: now,
    });

    return {
      userId: targetUserId,
      previousRole,
      newRole,
      status: userData.status || 'active',
      disabled: userData.disabled === true,
      updatedAt: now,
    };
  });

  // P0-AUTH-01: Authoritatively synchronize Firebase Auth Custom Claims
  await syncUserCustomClaims(result.userId, result.newRole, result.status, result.disabled);

  return { success: true, ...result, tokenRefreshRequired: true };
}

export interface UpdateUserStatusPayload {
  targetUserId: string;
  newStatus: 'active' | 'suspended' | 'banned' | 'disabled';
  reason?: string;
}

/**
 * Authoritative Backend Gateway for Account Status Mutation (Suspend, Ban, Reactivate)
 * Invariant: Requires verified Platform Admin or Super Admin.
 * Updates Firestore user record, synchronizes custom claims, and modifies Auth user disabled state.
 */
export async function processUserStatusUpdateGateway(
  payload: UpdateUserStatusPayload,
  authHeader?: string
) {
  const { requireVerifiedPlatformAdmin } = await import('./firebaseAdmin');
  const caller = await requireVerifiedPlatformAdmin(authHeader);

  const { targetUserId, newStatus, reason } = payload;
  if (!targetUserId || !newStatus) {
    const err = new Error('Target User ID and new status are required.');
    (err as any).statusCode = 400;
    throw err;
  }

  const validStatuses = ['active', 'suspended', 'banned', 'disabled'];
  if (!validStatuses.includes(newStatus)) {
    const err = new Error(`Invalid status specified: ${newStatus}`);
    (err as any).statusCode = 400;
    throw err;
  }

  if (targetUserId === caller.uid && newStatus !== 'active') {
    const err = new Error('Action Denied: You cannot suspend or deactivate your own account.');
    (err as any).statusCode = 400;
    throw err;
  }

  const adminDb = getAdminDb();
  const now = new Date().toISOString();

  const isDisabling = newStatus === 'suspended' || newStatus === 'banned' || newStatus === 'disabled';

  const result = await adminDb.runTransaction(async (transaction) => {
    const userDocRef = adminDb.collection('users').doc(targetUserId);
    const userDoc = await transaction.get(userDocRef);

    if (!userDoc.exists) {
      const err = new Error(`User ${targetUserId} does not exist in authoritative records.`);
      (err as any).statusCode = 404;
      throw err;
    }

    const userData = userDoc.data() || {};
    if (userData.role === 'SUPER_ADMIN' && !caller.isSuperAdmin) {
      const err = new Error('Security Violation: Only a Super Administrator can modify another Super Administrator account.');
      (err as any).statusCode = 403;
      throw err;
    }

    const previousStatus = userData.status || 'active';

    transaction.update(userDocRef, {
      status: newStatus,
      disabled: isDisabling,
      updatedAt: now,
    });

    // Authoritative Audit Log
    const auditLogRef = adminDb.collection('audit_logs').doc();
    transaction.set(auditLogRef, {
      id: auditLogRef.id,
      actorId: caller.uid,
      actorRole: caller.isSuperAdmin ? 'SUPER_ADMIN' : 'ADMIN',
      actorEmail: caller.email || '',
      action: isDisabling ? 'USER_SUSPENDED' : 'USER_REACTIVATED',
      targetType: 'user',
      targetId: targetUserId,
      targetName: userData.name || userData.email || targetUserId,
      resourceType: 'user',
      resourceId: targetUserId,
      beforeState: { status: previousStatus, disabled: userData.disabled || false },
      afterState: { status: newStatus, disabled: isDisabling },
      reason: reason || 'Administrative account status modification',
      metadata: { targetUserId, previousStatus, newStatus, reason: reason || '' },
      timestamp: now,
    });

    return {
      userId: targetUserId,
      role: userData.role || 'CUSTOMER',
      previousStatus,
      newStatus,
      disabled: isDisabling,
      updatedAt: now,
    };
  });

  // Authoritatively synchronize custom claims and revoke tokens in Firebase Auth
  await syncUserCustomClaims(result.userId, result.role, result.newStatus, result.disabled);

  return { success: true, ...result };
}
