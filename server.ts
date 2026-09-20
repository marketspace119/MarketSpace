import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { processOrderGateway, processSubOrderUpdateGateway } from './server/orderGateway';
import { processPayoutGateway } from './server/payoutGateway';
import { processRefundGateway } from './server/refundGateway';
import { createRateLimiter } from './server/rateLimiter';

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Protect against huge payload attacks
  app.use(express.json({ limit: '100kb' }));

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
      const statusCode = err.message?.includes('Authentication failed') ? 401 : 400;
      return res.status(statusCode).json({
        success: false,
        error: err.message || 'Failed to process order securely',
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
      const isForbidden = err.message?.includes('Forbidden');
      const isAuth = err.message?.includes('Authentication');
      const statusCode = isForbidden ? 403 : isAuth ? 401 : 400;
      return res.status(statusCode).json({
        success: false,
        error: err.message || 'Failed to update sub-order',
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
      const isAuthError =
        err.message?.includes('Authentication') ||
        err.message?.includes('Forbidden');
      const statusCode = isAuthError ? (err.message?.includes('Forbidden') ? 403 : 401) : 400;
      return res.status(statusCode).json({
        success: false,
        error: err.message || 'Failed to process payout request',
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
      const isForbidden = err.message?.includes('Forbidden');
      const isAuth = err.message?.includes('Authentication');
      const isDbOrUnavailable =
        err.message?.includes('Database') ||
        err.message?.includes('temporarily unavailable') ||
        err.message?.includes('Firestore') ||
        err.message?.includes('credentials') ||
        err.message?.includes('PERMISSION_DENIED');
      const statusCode = isForbidden ? 403 : isAuth ? 401 : isDbOrUnavailable ? 503 : 400;
      const safeErrorMessage = isDbOrUnavailable
        ? 'Refund service temporarily unavailable. Please try again.'
        : (err.message || 'Failed to process refund request');
      return res.status(statusCode).json({
        success: false,
        error: safeErrorMessage,
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
