import { collection, doc, getDocs, setDoc, query, orderBy, limit } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { AuditLog, UserRole } from '../types';

const AUDIT_LOGS_STORAGE_KEY = 'marketspace_audit_logs_v1';
const AUDIT_LOGS_COLLECTION = 'audit_logs';

let memoryAuditLogs: AuditLog[] = [];

function initAuditLogs(): AuditLog[] {
  if (memoryAuditLogs.length > 0) return memoryAuditLogs;
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(AUDIT_LOGS_STORAGE_KEY);
    if (!raw) {
      // Invariant (OPEN-19): Zero synthetic audit events in production UI
      return [];
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

    // P1-AUDIT-01: Authoritative write via trusted server endpoint /api/audit/log
    if (auth?.currentUser && (entry.actorRole === 'ADMIN' || entry.actorRole === 'SUPER_ADMIN')) {
      auth.currentUser.getIdToken().then(token => {
        const baseUrl = typeof window !== 'undefined' ? '' : (process.env.API_BASE_URL || 'http://127.0.0.1:3000');
        fetch(`${baseUrl}/api/audit/log`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            action: entry.action,
            targetType: entry.targetType,
            targetId: entry.targetId,
            targetName: entry.targetName,
            metadata: entry.metadata,
          }),
        }).catch(err => {
          console.warn('[AuditLogService] Server audit endpoint notice:', err?.message || err);
        });
      }).catch(() => {});
    }

    return newLog;
  },
};
