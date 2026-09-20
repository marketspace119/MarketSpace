import { collection, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { User, UserRole } from '../types';
import { DEMO_ACCOUNTS } from '../context/AuthContext';
import { auditLogService } from './auditLogService';

const USERS_STORAGE_KEY = 'marketspace_platform_users_v1';
const USERS_COLLECTION = 'users';

let memoryUsers: User[] = [];

function initUsers(): User[] {
  if (memoryUsers.length > 0) return memoryUsers;
  if (typeof window === 'undefined') return Object.values(DEMO_ACCOUNTS);
  try {
    const raw = localStorage.getItem(USERS_STORAGE_KEY);
    if (!raw) {
      const initialUsers: User[] = Object.values(DEMO_ACCOUNTS).map(u => ({
        ...u,
        status: 'active',
        lastActiveAt: new Date().toISOString(),
      }));
      localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(initialUsers));
      memoryUsers = initialUsers;
      return initialUsers;
    }
    memoryUsers = JSON.parse(raw);
    return memoryUsers;
  } catch (err) {
    console.error('Failed to load users from localStorage:', err);
    return Object.values(DEMO_ACCOUNTS);
  }
}

function persistLocal(users: User[]) {
  memoryUsers = users;
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
  } catch (err) {
    console.error('Failed to save users to localStorage:', err);
  }
}

export const userService = {
  async syncWithFirestore(isAdmin?: boolean, currentUserId?: string): Promise<User[]> {
    try {
      if (isAdmin) {
        const snap = await getDocs(collection(db, USERS_COLLECTION));
        if (!snap.empty) {
          const cloudUsers: User[] = [];
          snap.forEach(d => {
            const u = d.data() as User;
            cloudUsers.push({
              ...u,
              status: u.status || 'active',
            });
          });

          // Merge with demo users if any missing
          const demoList = Object.values(DEMO_ACCOUNTS);
          demoList.forEach(demo => {
            if (!cloudUsers.some(c => c.id === demo.id || c.email === demo.email)) {
              cloudUsers.push({ ...demo, status: 'active' });
            }
          });

          persistLocal(cloudUsers);
          return cloudUsers;
        }
      } else if (currentUserId) {
        const userDoc = await getDoc(doc(db, USERS_COLLECTION, currentUserId));
        if (userDoc.exists()) {
          const u = userDoc.data() as User;
          const current = initUsers().filter(x => x.id !== currentUserId);
          const updated = [{ ...u, status: u.status || 'active' }, ...current];
          persistLocal(updated);
          return updated;
        }
      }
    } catch (err) {
      console.warn('Users Firestore sync offline/skipped:', err);
    }
    return initUsers();
  },

  getAllUsers(): User[] {
    return initUsers();
  },

  async updateUserStatus(
    targetUserId: string,
    newStatus: 'active' | 'suspended',
    actorId: string,
    actorRole: UserRole
  ): Promise<User> {
    const isAdmin = actorRole === 'ADMIN' || actorRole === 'SUPER_ADMIN';
    if (!isAdmin) {
      throw new Error('Forbidden: Only platform administrators can change user status');
    }

    const users = initUsers();
    const index = users.findIndex(u => u.id === targetUserId);
    if (index === -1) throw new Error('User not found');

    const targetUser = users[index];

    // Hierarchy guard: Only SUPER_ADMIN can alter SUPER_ADMIN status, and nobody can suspend themselves
    if (targetUser.role === 'SUPER_ADMIN' && actorRole !== 'SUPER_ADMIN') {
      throw new Error('Security Violation: Ordinary admins cannot suspend a Super Administrator');
    }
    if (targetUserId === actorId) {
      throw new Error('Action Denied: You cannot suspend your own administrative account');
    }

    const updated: User = {
      ...targetUser,
      status: newStatus,
    };

    users[index] = updated;
    persistLocal(users);

    try {
      await updateDoc(doc(db, USERS_COLLECTION, targetUserId), { status: newStatus });
    } catch (err) {
      console.warn('Could not update user status in Firestore:', err);
    }

    // Log to Audit Trail
    await auditLogService.logAction({
      actorId,
      actorRole,
      action: newStatus === 'suspended' ? 'USER_SUSPENDED' : 'USER_REACTIVATED',
      targetType: 'user',
      targetId: targetUserId,
      targetName: targetUser.name,
      metadata: { targetEmail: targetUser.email, previousStatus: targetUser.status || 'active' },
    });

    return updated;
  },
};
