import { VerifiedCaller } from '../firebaseAdmin';
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
  requiresUserConfirmation?: boolean;
}

// In-memory per-user rate limit for AI tool calls (max 30 tool calls per minute)
const toolCallRateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkToolRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = toolCallRateLimitMap.get(userId);
  if (!entry || now > entry.resetAt) {
    toolCallRateLimitMap.set(userId, { count: 1, resetAt: now + 60 * 1000 });
    return true;
  }
  if (entry.count >= 30) {
    return false;
  }
  entry.count++;
  return true;
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

  // 2. Rate limit tool execution
  const rateLimitIdentity = caller?.uid || 'guest';
  if (!checkToolRateLimit(rateLimitIdentity)) {
    return {
      allowed: false,
      toolName,
      error: 'AI tool execution rate limit exceeded. Please wait a minute before requesting more actions.',
    };
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
