import { VerifiedCaller } from '../firebaseAdmin';
import { getRateLimitStore } from '../rateLimiter';
import { logAIAction } from './aiAudit';

export type AllowedAITool =
  | 'search_products'
  | 'get_order_summary'
  | 'get_seller_metrics'
  | 'generate_product_description';

export interface ToolExecutionResult {
  allowed: boolean;
  toolName: string;
  data?: any;
  error?: string;
  code?: string;
  statusCode?: number;
  requiresUserConfirmation?: boolean;
}

/**
 * Distributed per-user rate limit for AI tool calls (max 30 tool calls per minute).
 * Uses the authoritative distributed RateLimitStore (Firestore transaction-backed in production).
 * Strictly Fail-Closed: Throws RATE_LIMITER_UNAVAILABLE (503) if the distributed backend fails.
 */
async function checkDistributedToolRateLimit(userId: string): Promise<boolean> {
  const store = getRateLimitStore();
  const key = `ai_tool_call_user_${userId}`;
  const res = await store.consume(key, 30, 60 * 1000);
  return res.allowed;
}

// Denied mutating operations that must NEVER be executed directly by AI
export const FORBIDDEN_AI_MUTATIONS = [
  'issue_refund',
  'execute_refund',
  'process_refund',
  'request_payout',
  'approve_payout',
  'confirm_payment',
  'update_user_role',
  'change_role',
  'delete_account',
  'update_order_status',
  'transfer_balance',
] as const;

/**
 * P1-AI-01: Centralized AI Tool Execution Policy Engine
 * Validates tool calls against explicit whitelist, tenant boundary, and rate limits.
 * Mutating operations are strictly rejected; user must use standard manual application flows.
 */
export async function validateAndExecuteToolPolicy(
  toolName: string,
  args: Record<string, any>,
  caller?: VerifiedCaller | null
): Promise<ToolExecutionResult> {
  const normalizedTool = toolName.toLowerCase().trim();

  // 1. Check for prohibited mutation requests
  if (FORBIDDEN_AI_MUTATIONS.includes(normalizedTool as any)) {
    if (caller) {
      await logAIAction({
        actorId: caller.uid,
        actorRole: caller.token?.role || 'CUSTOMER',
        actorEmail: caller.email,
        action: 'AI_DENIED_ACTION',
        targetType: 'seller_assistant',
        promptLength: 0,
        metadata: { attemptedTool: toolName, reason: 'Mutating tool strictly prohibited by policy' },
      });
    }
    return {
      allowed: false,
      toolName,
      requiresUserConfirmation: true,
      error: `Autonomous financial or operational mutation ('${toolName}') is prohibited by security policy. This action must be performed manually through authorized platform workflows.`,
    };
  }

  // 2. Distributed rate limit tool execution (Fail-Closed on backend unavailability)
  const rateLimitIdentity = caller?.uid || 'guest';
  try {
    const allowed = await checkDistributedToolRateLimit(rateLimitIdentity);
    if (!allowed) {
      return {
        allowed: false,
        toolName,
        statusCode: 429,
        error: 'AI tool execution rate limit exceeded. Please wait a minute before requesting more actions.',
      };
    }
  } catch (err: any) {
    const failClosedErr = new Error(err?.message || 'Security control failure: Rate limiter service temporarily unavailable.') as any;
    failClosedErr.statusCode = 503;
    failClosedErr.code = 'RATE_LIMITER_UNAVAILABLE';
    throw failClosedErr;
  }

  // 3. Whitelist validation
  const ALLOWED_TOOLS: AllowedAITool[] = [
    'search_products',
    'get_order_summary',
    'get_seller_metrics',
    'generate_product_description',
  ];

  if (!ALLOWED_TOOLS.includes(normalizedTool as AllowedAITool)) {
    return {
      allowed: false,
      toolName,
      error: `Tool '${toolName}' is not recognized or permitted in the AI security policy.`,
    };
  }

  // 4. Tenant and identity boundary checks
  switch (normalizedTool) {
    case 'get_order_summary': {
      const orderId = String(args.orderId || '').trim();
      if (!orderId) {
        return { allowed: false, toolName, error: 'orderId parameter is required' };
      }
      if (!caller) {
        return { allowed: false, toolName, error: 'Authentication required to inspect order details.' };
      }
      // Tenant enforcement: orderId query will be scoped strictly to caller's orders in the caller gateway
      return {
        allowed: true,
        toolName,
        data: { validatedOrderId: orderId, callerUid: caller.uid, isPlatformAdmin: caller.isPlatformAdmin },
      };
    }

    case 'get_seller_metrics': {
      const sellerId = String(args.sellerId || '').trim();
      if (!sellerId) {
        return { allowed: false, toolName, error: 'sellerId parameter is required' };
      }
      if (!caller) {
        return { allowed: false, toolName, error: 'Authentication required to inspect seller metrics.' };
      }
      // Tenant boundary: seller can only view their own metrics unless platform admin
      if (sellerId !== caller.uid && !caller.isPlatformAdmin) {
        return { allowed: false, toolName, error: 'Forbidden: Cannot access metrics of another merchant.' };
      }
      return {
        allowed: true,
        toolName,
        data: { validatedSellerId: sellerId },
      };
    }

    case 'search_products': {
      const query = String(args.query || '').trim().slice(0, 200);
      return {
        allowed: true,
        toolName,
        data: { query, limit: Math.min(20, Math.max(1, Number(args.limit) || 10)) },
      };
    }

    case 'generate_product_description': {
      const title = String(args.title || '').trim().slice(0, 200);
      return {
        allowed: true,
        toolName,
        data: { title, category: String(args.category || '').slice(0, 100) },
      };
    }

    default:
      return { allowed: false, toolName, error: 'Unknown tool' };
  }
}
