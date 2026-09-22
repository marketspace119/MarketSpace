import { getAdminDb, requireVerifiedSuperAdmin } from './firebaseAdmin';
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
      updatedAt: now,
    };
  });

  return { success: true, ...result };
}
