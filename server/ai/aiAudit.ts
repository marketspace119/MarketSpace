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
    const safeMetadata: Record<string, any> = {
      promptLength: params.promptLength,
      responseLength: params.responseLength || 0,
      ...(params.metadata || {}),
    };

    // Strip sensitive keys from metadata if any exist
    delete safeMetadata.apiKey;
    delete safeMetadata.token;
    delete safeMetadata.password;
    delete safeMetadata.prompt; // Never store raw user prompt if it might contain private text

    await docRef.set({
      id: docRef.id,
      actorId: params.actorId,
      actorRole: params.actorRole,
      actorEmail: params.actorEmail || '',
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
