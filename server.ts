import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { processOrderGateway, processSubOrderUpdateGateway } from './server/orderGateway';
import { processPayoutGateway, getSellerFinancialSummaryGateway } from './server/payoutGateway';
import { processRefundGateway } from './server/refundGateway';
import { processPaymentReferenceSubmissionGateway, processPaymentReviewGateway } from './server/paymentGateway';
import { processUserRoleUpdateGateway } from './server/userGateway';
import { createRateLimiter } from './server/rateLimiter';
import { requireAuthenticatedCaller, requireVerifiedPlatformAdmin, verifyFirebaseBearerToken } from './server/firebaseAdmin';
import {
  handleBusinessAssistant,
  handleSellerAssistant,
  handleCustomerAssistant,
  handleSmartSearch,
  handleReportSummarization,
} from './server/ai/aiService';

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Protect against huge payload attacks
  app.use(express.json({ limit: '100kb' }));

  // CSRF / Origin Verification Middleware for Mutating Endpoints
  app.use((req, res, next) => {
    const mutatingMethods = ['POST', 'PUT', 'DELETE', 'PATCH'];
    if (!mutatingMethods.includes(req.method)) {
      return next();
    }

    const origin = req.headers.origin;
    const host = req.headers.host;

    if (origin) {
      try {
        const originUrl = new URL(origin);
        const isSameHost = originUrl.host === host;
        const isLocal = originUrl.hostname === 'localhost' || originUrl.hostname === '127.0.0.1';
        const isAiStudio = originUrl.hostname.endsWith('.google.com') || originUrl.hostname.endsWith('.run.app');

        if (!isSameHost && !isLocal && !isAiStudio) {
          console.warn(`[CSRF Guard] Blocked cross-origin mutating request: Origin=${origin}, Host=${host}`);
          return res.status(403).json({ success: false, error: 'Forbidden: Cross-origin request rejected' });
        }
      } catch {
        return res.status(400).json({ success: false, error: 'Invalid origin header' });
      }
    }

    next();
  });

  // Helper to safely map internal database/system errors to safe responses without leaking internals
  function sanitizeGatewayError(err: any, fallbackMessage: string): { statusCode: number; safeMessage: string } {
    const msg = err?.message || '';
    const isAuth = msg.includes('Authentication') || (msg.includes('token') && (msg.includes('missing') || msg.includes('Invalid') || msg.includes('expired')));
    const isForbidden = msg.includes('Forbidden') || msg.includes('not authorized') || msg.includes('do not have permission');
    const isNotFound = msg.includes('not found');
    const isDbOrInternal =
      msg.includes('Database') ||
      msg.includes('Firestore') ||
      msg.includes('temporarily unavailable') ||
      msg.includes('Fail-Closed') ||
      msg.includes('credentials') ||
      msg.includes('PERMISSION_DENIED') ||
      msg.includes('ETIMEDOUT') ||
      msg.includes('ECONNREFUSED');

    if (isForbidden) return { statusCode: 403, safeMessage: msg };
    if (isAuth) return { statusCode: 401, safeMessage: msg };
    if (isNotFound) return { statusCode: 404, safeMessage: msg };
    if (isDbOrInternal) return { statusCode: 503, safeMessage: 'Service temporarily unavailable. Please try again later.' };

    return { statusCode: 400, safeMessage: msg || fallbackMessage };
  }

  // 1. Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Financial Rate Limiter (30 requests per minute per IP / caller)
  const financialRateLimiter = createRateLimiter({
    windowMs: 60 * 1000,
    max: 30,
    message: 'Too many financial requests. Please wait a minute and retry.',
  });

  // 2. Trusted Order Processing Gateway Endpoint (Protected with Firebase Admin SDK)
  app.post('/api/orders/create', financialRateLimiter, async (req, res) => {
    try {
      const payload = req.body;
      const authHeader = req.headers.authorization;
      const result = await processOrderGateway(payload, authHeader);
      return res.status(200).json({
        success: true,
        order: result.order,
        reused: result.reused || false,
      });
    } catch (err: any) {
      console.error('[API /api/orders/create] Error:', err.message);
      const { statusCode, safeMessage } = sanitizeGatewayError(err, 'Failed to process order securely');
      return res.status(statusCode).json({
        success: false,
        error: safeMessage,
      });
    }
  });

  // 3. Sub-Order Fulfillment Gateway Endpoint (Protected with Firebase Admin SDK)
  app.post('/api/orders/update-suborder', financialRateLimiter, async (req, res) => {
    try {
      const payload = req.body;
      const authHeader = req.headers.authorization;
      const result = await processSubOrderUpdateGateway(payload, authHeader);
      return res.status(200).json(result);
    } catch (err: any) {
      console.error('[API /api/orders/update-suborder] Error:', err.message);
      const { statusCode, safeMessage } = sanitizeGatewayError(err, 'Failed to update sub-order');
      return res.status(statusCode).json({
        success: false,
        error: safeMessage,
      });
    }
  });

  // 4. Trusted Payout Request Gateway Endpoint (Protected with Firebase Admin SDK)
  app.post('/api/payouts/create', financialRateLimiter, async (req, res) => {
    try {
      const payload = req.body;
      const authHeader = req.headers.authorization;
      const result = await processPayoutGateway(payload, authHeader);
      return res.status(200).json({
        success: true,
        payout: result.payout,
      });
    } catch (err: any) {
      console.error('[API /api/payouts/create] Error:', err.message);
      const { statusCode, safeMessage } = sanitizeGatewayError(err, 'Failed to process payout request');
      return res.status(statusCode).json({
        success: false,
        error: safeMessage,
      });
    }
  });

  // 5. Trusted Refund Request Gateway Endpoint (Protected with Firebase Admin SDK)
  app.post('/api/refunds/create', financialRateLimiter, async (req, res) => {
    try {
      const payload = req.body;
      const authHeader = req.headers.authorization;
      const result = await processRefundGateway(payload, authHeader);
      return res.status(200).json({
        success: true,
        refund: result.refund,
      });
    } catch (err: any) {
      console.error('[API /api/refunds/create] Error:', err.message);
      const { statusCode, safeMessage } = sanitizeGatewayError(err, 'Failed to process refund request');
      return res.status(statusCode).json({
        success: false,
        error: safeMessage,
      });
    }
  });

  // 6. Authoritative Seller Financial Summary Endpoint (Single Source of Truth for Balance)
  app.get('/api/seller/financial-summary', financialRateLimiter, async (req, res) => {
    try {
      const sellerId = (req.query.sellerId as string) || '';
      const authHeader = req.headers.authorization;
      const summary = await getSellerFinancialSummaryGateway(sellerId, authHeader);
      return res.status(200).json({
        success: true,
        summary,
      });
    } catch (err: any) {
      console.error('[API /api/seller/financial-summary] Error:', err.message);
      const { statusCode, safeMessage } = sanitizeGatewayError(err, 'Failed to retrieve financial summary');
      return res.status(statusCode).json({
        success: false,
        error: safeMessage,
      });
    }
  });

  function mapPaymentErrorToStatusCode(err: any): { statusCode: number; message: string } {
    if (err.statusCode && typeof err.statusCode === 'number') {
      return { statusCode: err.statusCode, message: err.message };
    }
    const msg = err.message || '';
    if (msg.includes('Authentication') || msg.includes('token') && (msg.includes('missing') || msg.includes('Invalid') || msg.includes('expired'))) {
      return { statusCode: 401, message: msg };
    }
    if (msg.includes('Forbidden') || msg.includes('غير مصرح') || msg.includes('privileges required') || msg.includes('لا يخصك') || msg.includes('email_verified')) {
      return { statusCode: 403, message: msg };
    }
    if (msg.includes('غير موجود') || msg.includes('not found') || msg.includes('Not Found')) {
      return { statusCode: 404, message: msg };
    }
    if (
      msg.includes('تم تقديمه مسبقاً') ||
      msg.includes('already') ||
      msg.includes('مسبقاً') ||
      msg.includes('duplicate') ||
      msg.includes('قيد المعالجة حالياً') ||
      msg.includes('conflict') ||
      msg.includes('Replay') ||
      msg.includes('terminal')
    ) {
      return { statusCode: 409, message: msg };
    }
    if (
      msg.includes('Database') ||
      msg.includes('temporarily unavailable') ||
      msg.includes('Firestore unavailable') ||
      msg.includes('Firestore transaction failed') ||
      msg.includes('credentials') ||
      msg.includes('PERMISSION_DENIED') ||
      msg.includes('Fail-Closed')
    ) {
      return { statusCode: 503, message: 'Payment service temporarily unavailable. Please try again later.' };
    }
    return { statusCode: 400, message: msg || 'Failed to process payment request' };
  }

  // 7. Authoritative Mobile Payment Reference Submission (Anti-Replay Unique Check)
  app.post('/api/payments/submit-reference', financialRateLimiter, async (req, res) => {
    try {
      const payload = req.body;
      const authHeader = req.headers.authorization;
      const result = await processPaymentReferenceSubmissionGateway(payload, authHeader);
      return res.status(200).json(result);
    } catch (err: any) {
      console.error('[API /api/payments/submit-reference] Error:', err.message);
      const { statusCode, message } = mapPaymentErrorToStatusCode(err);
      return res.status(statusCode).json({
        success: false,
        error: message,
      });
    }
  });

  // 8. Authoritative Mobile Payment Review & Order Payment Status Confirmation (Atomic)
  app.post('/api/payments/review', financialRateLimiter, async (req, res) => {
    try {
      const payload = req.body;
      const authHeader = req.headers.authorization;
      const result = await processPaymentReviewGateway(payload, authHeader);
      return res.status(200).json(result);
    } catch (err: any) {
      console.error('[API /api/payments/review] Error:', err.message);
      const { statusCode, message } = mapPaymentErrorToStatusCode(err);
      return res.status(statusCode).json({
        success: false,
        error: message,
      });
    }
  });

  // 9. Authoritative User Role & Privilege Management (Super Admin only)
  app.post('/api/users/update-role', financialRateLimiter, async (req, res) => {
    try {
      const payload = req.body;
      const authHeader = req.headers.authorization;
      const result = await processUserRoleUpdateGateway(payload, authHeader);
      return res.status(200).json(result);
    } catch (err: any) {
      console.error('[API /api/users/update-role] Error:', err.message);
      const isForbidden = err.message?.includes('Forbidden');
      const isAuth = err.message?.includes('Authentication');
      const statusCode = isForbidden ? 403 : isAuth ? 401 : 400;
      return res.status(statusCode).json({
        success: false,
        error: err.message || 'Failed to update user role',
      });
    }
  });

  // AI-Specific Rate Limiters
  const aiRateLimiter = createRateLimiter({
    windowMs: 60 * 1000,
    max: 20,
    message: 'AI assistant rate limit exceeded. Please wait a minute before sending more queries.',
  });

  const aiSearchRateLimiter = createRateLimiter({
    windowMs: 60 * 1000,
    max: 40,
    message: 'Search query rate limit exceeded. Please slow down and try again later.',
  });

  // 10. AI Assistant Endpoint (Role-Bounded, Tenant-Isolated, Read-Only)
  app.post('/api/ai/assistant', aiRateLimiter, async (req, res) => {
    try {
      const { mode, prompt, storeId, orderId, actionType } = req.body || {};
      const authHeader = req.headers.authorization;

      if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
        return res.status(400).json({ success: false, error: 'Prompt is required' });
      }

      if (prompt.length > 2000) {
        return res.status(400).json({
          success: false,
          error: 'Prompt exceeds maximum allowed length of 2000 characters',
        });
      }

      // Check for prompt demanding direct autonomous financial execution
      const financialActionRegex = /\b(issue refund|execute refund|create refund|send payout|process payout|confirm payment|approve payment|increase balance|change role|elevate role|delete account)\b/i;
      if (financialActionRegex.test(prompt)) {
        return res.status(200).json({
          success: true,
          response: 'Autonomous AI financial mutations and role elevation are disabled by platform security policy. Financial operations must be performed manually through verified administrative workflows.',
          scope: 'DENIED_FINANCIAL_ACTION',
        });
      }

      if (actionType && !['summary', 'product_copy', 'performance', 'inventory_advice'].includes(actionType)) {
        return res.status(400).json({ success: false, error: 'Invalid actionType' });
      }
      if (storeId && (typeof storeId !== 'string' || storeId.length > 100)) {
        return res.status(400).json({ success: false, error: 'Invalid storeId' });
      }
      if (orderId && (typeof orderId !== 'string' || orderId.length > 100)) {
        return res.status(400).json({ success: false, error: 'Invalid orderId' });
      }

      const caller = await requireAuthenticatedCaller(authHeader);

      if (mode === 'business') {
        const result = await handleBusinessAssistant({ caller, prompt });
        return res.status(200).json({ success: true, ...result });
      } else if (mode === 'seller') {
        const result = await handleSellerAssistant({
          caller,
          prompt,
          storeId: storeId ? String(storeId).trim() : undefined,
          actionType: actionType || 'summary',
        });
        return res.status(200).json({ success: true, ...result });
      } else if (mode === 'customer') {
        const result = await handleCustomerAssistant({
          caller,
          prompt,
          orderId: orderId ? String(orderId).trim() : undefined,
        });
        return res.status(200).json({ success: true, ...result });
      } else {
        return res.status(400).json({
          success: false,
          error: 'Invalid assistant mode. Must be "business", "seller", or "customer".',
        });
      }
    } catch (err: any) {
      console.error('[API /api/ai/assistant] Error:', err.message);
      const isForbidden = err.message?.includes('Forbidden') || err.message?.includes('not authorized') || err.message?.includes('not have permission');
      const isAuth = err.message?.includes('Authentication');
      const isNotFound = err.message?.includes('not found');
      const statusCode = isForbidden ? 403 : isAuth ? 401 : isNotFound ? 404 : 400;
      return res.status(statusCode).json({
        success: false,
        error: err.message || 'Failed to process AI query',
      });
    }
  });

  // 11. AI Smart Search Endpoint
  app.post('/api/ai/search', aiSearchRateLimiter, async (req, res) => {
    try {
      const { query, limit } = req.body || {};
      const authHeader = req.headers.authorization;

      if (!query || typeof query !== 'string' || !query.trim()) {
        return res.status(400).json({ success: false, error: 'Search query is required' });
      }

      if (query.length > 500) {
        return res.status(400).json({ success: false, error: 'Search query too long' });
      }

      let caller = null;
      if (authHeader) {
        try {
          const decoded = await verifyFirebaseBearerToken(authHeader);
          if (decoded && decoded.uid) {
            caller = {
              uid: decoded.uid,
              email: decoded.email,
              emailVerified: decoded.email_verified === true,
              isPlatformAdmin: false,
              isSuperAdmin: false,
              token: decoded,
            };
          }
        } catch {
          // Guest search is allowed
        }
      }

      const safeLimit = limit !== undefined ? Math.min(50, Math.max(1, Number(limit) || 10)) : 10;

      const result = await handleSmartSearch({
        query,
        caller,
        limit: safeLimit,
      });

      return res.status(200).json({ success: true, ...result });
    } catch (err: any) {
      console.error('[API /api/ai/search] Error:', err.message);
      return res.status(400).json({
        success: false,
        error: err.message || 'Failed to execute smart search',
      });
    }
  });

  // 12. AI Report Summarization Endpoint (Platform Admins only)
  app.post('/api/ai/report', aiRateLimiter, async (req, res) => {
    try {
      const { reportType, timeRange } = req.body || {};
      const authHeader = req.headers.authorization;
      const caller = await requireVerifiedPlatformAdmin(authHeader);

      const result = await handleReportSummarization({
        caller,
        reportType: reportType || 'operational',
        timeRange,
      });

      return res.status(200).json({ success: true, ...result });
    } catch (err: any) {
      console.error('[API /api/ai/report] Error:', err.message);
      const isForbidden = err.message?.includes('Forbidden');
      const isAuth = err.message?.includes('Authentication');
      const statusCode = isForbidden ? 403 : isAuth ? 401 : 400;
      return res.status(statusCode).json({
        success: false,
        error: err.message || 'Failed to generate report summary',
      });
    }
  });

  // 13. AI Copywriting Generator Endpoint (Sellers and Admins)
  app.post('/api/ai/copywriting', aiRateLimiter, async (req, res) => {
    try {
      const { prompt, storeId } = req.body || {};
      const authHeader = req.headers.authorization;
      const caller = await requireAuthenticatedCaller(authHeader);

      const result = await handleSellerAssistant({
        caller,
        prompt: prompt || 'Generate a compelling e-commerce product description',
        storeId,
        actionType: 'product_copy',
      });

      return res.status(200).json({ success: true, copy: result.response });
    } catch (err: any) {
      console.error('[API /api/ai/copywriting] Error:', err.message);
      const isForbidden = err.message?.includes('Forbidden');
      const isAuth = err.message?.includes('Authentication');
      const statusCode = isForbidden ? 403 : isAuth ? 401 : 400;
      return res.status(statusCode).json({
        success: false,
        error: err.message || 'Failed to generate product copy',
      });
    }
  });

  // 4. Vite middleware for development / Static files for production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[MarketSpace Server] Running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[MarketSpace Server] Failed to start:', err);
  process.exit(1);
});
