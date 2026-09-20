import { collection, doc, getDocs, setDoc, query, orderBy, limit } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { AuditLog, UserRole } from '../types';

const AUDIT_LOGS_STORAGE_KEY = 'marketspace_audit_logs_v1';
const AUDIT_LOGS_COLLECTION = 'auditLogs';

let memoryAuditLogs: AuditLog[] = [];

function initAuditLogs(): AuditLog[] {
  if (memoryAuditLogs.length > 0) return memoryAuditLogs;
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(AUDIT_LOGS_STORAGE_KEY);
    if (!raw) {
      // Seed some initial baseline platform events
      const seed: AuditLog[] = [
        {
          id: 'audit_01',
          actorId: 'user_superadmin_01',
          actorRole: 'SUPER_ADMIN',
          actorEmail: 'superadmin@marketspace.so',
          action: 'PLATFORM_INITIALIZED',
          targetType: 'settings',
          targetId: 'global_settings',
          targetName: 'MarketSpace Platform Policy',
          timestamp: new Date(Date.now() - 86400000 * 3).toISOString(),
          metadata: { version: '4.0.0', multiVendorEnabled: true },
        },
        {
          id: 'audit_02',
          actorId: 'user_admin_01',
          actorRole: 'ADMIN',
          actorEmail: 'admin@marketspace.so',
          action: 'SELLER_VERIFIED',
          targetType: 'seller',
          targetId: 'user_seller_01',
          targetName: 'Mustafa Cosmetics',
          timestamp: new Date(Date.now() - 86400000 * 2).toISOString(),
          metadata: { badge: 'blue_checkmark', city: 'Mogadishu' },
        },
      ];
      localStorage.setItem(AUDIT_LOGS_STORAGE_KEY, JSON.stringify(seed));
      memoryAuditLogs = seed;
      return seed;
    }
    memoryAuditLogs = JSON.parse(raw);
    return memoryAuditLogs;
  } catch (err) {
    console.error('Failed to load audit logs from localStorage:', err);
    return [];
  }
}

function persistLocal(logs: AuditLog[]) {
  memoryAuditLogs = logs;
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(AUDIT_LOGS_STORAGE_KEY, JSON.stringify(logs.slice(0, 300)));
  } catch (err) {
    console.error('Failed to save audit logs to localStorage:', err);
  }
}

export const auditLogService = {
  async syncWithFirestore(): Promise<AuditLog[]> {
    try {
      const q = query(collection(db, AUDIT_LOGS_COLLECTION), orderBy('timestamp', 'desc'), limit(150));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const cloudLogs: AuditLog[] = [];
        snap.forEach(d => cloudLogs.push(d.data() as AuditLog));
        persistLocal(cloudLogs);
        return cloudLogs;
      }
    } catch (err) {
      console.warn('Audit logs firestore sync skipped/offline:', err);
    }
    return initAuditLogs();
  },

  getAllAuditLogs(): AuditLog[] {
    return initAuditLogs();
  },

  getRecentLogs(limitCount: number = 100): AuditLog[] {
    const logs = initAuditLogs();
    return logs.slice(0, limitCount);
  },

  async logAction(entry: {
    actorId: string;
    actorRole: UserRole;
    actorEmail?: string;
    action: string;
    targetType: AuditLog['targetType'];
    targetId: string;
    targetName?: string;
    metadata?: Record<string, unknown>;
  }): Promise<AuditLog> {
    const logs = initAuditLogs();
    const id = `audit_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const newLog: AuditLog = {
      ...entry,
      id,
      timestamp: new Date().toISOString(),
    };

    logs.unshift(newLog);
    persistLocal(logs);

    setDoc(doc(db, AUDIT_LOGS_COLLECTION, id), newLog).catch(err => {
      console.warn('Could not persist audit log to Firestore:', err);
    });

    return newLog;
  },
};
