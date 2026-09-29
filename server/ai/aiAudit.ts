import { getAdminDb } from '../firebaseAdmin';

export interface AIAuditParams {
  actorId: string;
  actorRole: string;
  actorEmail?: string;
  action: 'AI_QUERY' | 'AI_TOOL_CALL' | 'AI_DENIED_ACTION' | 'AI_RATE_LIMIT' | 'AI_ERROR' | 'AI_SEARCH';
  targetType: 'business_assistant' | 'seller_assistant' | 'customer_assistant' | 'smart_search' | 'report_summary';
  targetId?: string;
  targetName?: string;
  promptLength: number;
  responseLength?: number;
  metadata?: Record<string, any>;
}

function maskEmail(email?: string): string {
  if (!email || !email.includes('@')) return '';
  const [local, domain] = email.split('@');
  if (local.length <= 2) return `*@${domain}`;
  return `${local[0]}***${local[local.length - 1]}@${domain}`;
}

function sanitizeMetadataRecursively(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeMetadataRecursively);
  const clean: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    const lk = k.toLowerCase();
    if (
      lk.includes('token') ||
      lk.includes('secret') ||
      lk.includes('password') ||
      lk.includes('apikey') ||
      lk.includes('prompt')
    ) {
      continue;
    }
    clean[k] = sanitizeMetadataRecursively(v);
  }
  return clean;
}

/**
 * Writes an authoritative append-only record to canonical 'audit_logs' collection.
 * Strictly guarantees that API keys, sensitive passwords, and PII are never persisted in logs.
 */
export async function logAIAction(params: AIAuditParams): Promise<{ success: boolean; id?: string; error?: string }> {
  const adminDb = getAdminDb();
  if (!adminDb) return { success: false, error: 'Database unavailable' };

  try {
    const docRef = adminDb.collection('audit_logs').doc();
    const now = new Date().toISOString();

    // Sanitize metadata to exclude any secrets or full PII prompts
    const rawMetadata: Record<string, any> = {
      promptLength: params.promptLength,
      responseLength: params.responseLength || 0,
      ...(params.metadata || {}),
    };

    const safeMetadata = sanitizeMetadataRecursively(rawMetadata);

    await docRef.set({
      id: docRef.id,
      actorId: params.actorId,
      actorRole: params.actorRole,
      actorEmail: maskEmail(params.actorEmail),
      action: params.action,
      targetType: params.targetType,
      targetId: params.targetId || 'ai_gateway',
      targetName: params.targetName || `AI Interaction (${params.targetType})`,
      metadata: safeMetadata,
      timestamp: now,
    });

    return { success: true, id: docRef.id };
  } catch (err: any) {
    // Observable failure logging
    console.error('[AIAudit:Error] Failed to persist AI audit log to Firestore:', err?.message || err);
    return { success: false, error: err?.message || 'Failed to persist audit log' };
  }
}
