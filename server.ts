import express from 'express';
import path from 'path';
import crypto from 'crypto';
import { createServer as createViteServer } from 'vite';
import {
  processOrderGateway,
  processSubOrderUpdateGateway,
  processProductCreationGateway,
  processProductUpdateGateway,
  processProductDeleteGateway,
} from './server/orderGateway';
import { processPayoutGateway, processPayoutReviewGateway, getSellerFinancialSummaryGateway } from './server/payoutGateway';
import { processSubscriptionReviewGateway } from './server/subscriptionGateway';
import {
  processRefundGateway,
  processRefundReviewGateway,
  processRefundSettlementGateway,
} from './server/refundGateway';
import { processPaymentReferenceSubmissionGateway, processPaymentReviewGateway } from './server/paymentGateway';
import { processUserRoleUpdateGateway, processUserStatusUpdateGateway } from './server/userGateway';
import { processImageVerificationGateway, processImageUploadGateway } from './server/imageGateway';
import { createRateLimiter } from './server/rateLimiter';
import {
  getAdminDb,
  requireAuthenticatedCaller,
  requireVerifiedPlatformAdmin,
  verifyFirebaseBearerToken,
  sanitizeGatewayError,
  validateBackendFirebaseConfiguration,
  assertUserAccountActive,
} from './server/firebaseAdmin';
import {
  handleBusinessAssistant,
  handleSellerAssistant,
  handleCustomerAssistant,
  handleSmartSearch,
  handleReportSummarization,
} from './server/ai/aiService';
import { validateAndExecuteToolPolicy } from './server/ai/toolPolicy';

export function createProductionApiApp(): express.Express {
  const app = express();

  // P2-RATE-02: Configure trusted proxy behavior intentionally (1 hop reverse proxy)
  app.set('trust proxy', 1);

  // F-43 & P2-SEC-01: Comprehensive HTTP Security Headers & Content Security Policy
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-XSS-Protection', '0');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    const isProd = process.env.NODE_ENV === 'production';
    const scriptSrc = isProd
      ? "'self' 'unsafe-inline' https://apis.google.com"
      : "'self' 'unsafe-inline' 'unsafe-eval' https://apis.google.com";
    res.setHeader(
      'Content-Security-Policy',
      `default-src 'self'; script-src ${scriptSrc}; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https:; connect-src 'self' https: wss:; frame-ancestors 'self' https://*.google.com https://*.run.app;`
    );
    next();
  });

  // Allow up to 6MB for image endpoints, protect others with 100kb
  app.use('/api/images', express.json({ limit: '6mb' }));
  app.use('/api/upload', express.json({ limit: '6mb' }));
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

  // 5b. Trusted Refund Review Endpoint (Protected with Firebase Admin SDK - Finding 4)
  app.post('/api/refunds/review', financialRateLimiter, async (req, res) => {
    try {
      const payload = req.body;
      const authHeader = req.headers.authorization;
      const result = await processRefundReviewGateway(payload, authHeader);
      return res.status(200).json(result);
    } catch (err: any) {
      console.error('[API /api/refunds/review] Error:', err.message);
      const { statusCode, safeMessage } = sanitizeGatewayError(err, 'Failed to review refund request');
      return res.status(statusCode).json({
        success: false,
        error: safeMessage,
      });
    }
  });

  // 5c. Trusted Refund Settlement Endpoint (Protected with Firebase Admin SDK - Finding 4)
  app.post('/api/refunds/settle', financialRateLimiter, async (req, res) => {
    try {
      const payload = req.body;
      const authHeader = req.headers.authorization;
      const result = await processRefundSettlementGateway(payload, authHeader);
      return res.status(200).json(result);
    } catch (err: any) {
      console.error('[API /api/refunds/settle] Error:', err.message);
      const { statusCode, safeMessage } = sanitizeGatewayError(err, 'Failed to settle refund request');
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
    const msg = err?.message || '';
    // First check if this is an internal infrastructure / database / stack error that must be sanitized (SUSPECT-03)
    if (
      (err?.statusCode && err.statusCode >= 500) ||
      msg.includes('Database') ||
      msg.includes('temporarily unavailable') ||
      msg.includes('Firestore unavailable') ||
      msg.includes('Firestore transaction failed') ||
      msg.includes('credentials') ||
      msg.includes('PERMISSION_DENIED') ||
      msg.includes('Fail-Closed') ||
      msg.includes('ECONNREFUSED') ||
      msg.includes('ENOTFOUND') ||
      msg.includes('DEADLINE_EXCEEDED') ||
      msg.includes('INTERNAL') ||
      msg.includes('serviceAccount') ||
      msg.includes('private_key')
    ) {
      const { statusCode, safeMessage } = sanitizeGatewayError(err, 'Payment service temporarily unavailable. Please try again later.');
      return { statusCode: statusCode >= 500 ? statusCode : 503, message: safeMessage };
    }
    if (err?.statusCode && typeof err.statusCode === 'number' && err.statusCode >= 400 && err.statusCode < 500) {
      return { statusCode: err.statusCode, message: msg };
    }
    if (msg.includes('Authentication') || (msg.includes('token') && (msg.includes('missing') || msg.includes('Invalid') || msg.includes('expired')))) {
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
    const { statusCode, safeMessage } = sanitizeGatewayError(err, 'Failed to process payment request');
    return { statusCode, message: safeMessage };
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
      const { statusCode, safeMessage } = sanitizeGatewayError(err, 'Failed to update user role');
      return res.status(statusCode).json({
        success: false,
        error: safeMessage,
      });
    }
  });

  // 9b. Authoritative User Status Management (Platform Admin & Super Admin)
  app.post('/api/users/update-status', financialRateLimiter, async (req, res) => {
    try {
      const payload = req.body;
      const authHeader = req.headers.authorization;
      const result = await processUserStatusUpdateGateway(payload, authHeader);
      return res.status(200).json(result);
    } catch (err: any) {
      console.error('[API /api/users/update-status] Error:', err.message);
      const { statusCode, safeMessage } = sanitizeGatewayError(err, 'Failed to update user status');
      return res.status(statusCode).json({
        success: false,
        error: safeMessage,
      });
    }
  });

  // 9c. Authoritative Binary Image Verification Gateway (Deep Magic-Byte Inspection)
  app.post('/api/images/verify', financialRateLimiter, async (req, res) => {
    try {
      const payload = req.body;
      const authHeader = req.headers.authorization;
      const result = await processImageVerificationGateway(payload, authHeader);
      return res.status(200).json({ success: true, ...result });
    } catch (err: any) {
      console.error('[API /api/images/verify] Error:', err.message);
      const { statusCode, safeMessage } = sanitizeGatewayError(err, 'Image verification failed');
      return res.status(statusCode).json({
        success: false,
        error: safeMessage,
      });
    }
  });

  // 9d. Authoritative Binary Image Upload Gateway (V3-02 Remediation)
  app.post('/api/images/upload', financialRateLimiter, async (req, res) => {
    try {
      const payload = req.body;
      const authHeader = req.headers.authorization;
      const result = await processImageUploadGateway(payload, authHeader);
      return res.status(200).json(result);
    } catch (err: any) {
      console.error('[API /api/images/upload] Error:', err.message);
      const { statusCode, safeMessage } = sanitizeGatewayError(err, 'Image upload failed');
      return res.status(statusCode).json({
        success: false,
        error: safeMessage,
      });
    }
  });

  // 9d-2. Authoritative Product Creation & Plan Quota Gateway (PRODUCT-PERSIST & QUOTA Remediation)
  app.post('/api/products/create', financialRateLimiter, async (req, res) => {
    try {
      const payload = req.body;
      const authHeader = req.headers.authorization;
      const result = await processProductCreationGateway(payload, authHeader);
      return res.status(200).json(result);
    } catch (err: any) {
      console.error('[API /api/products/create] Error:', err.message);
      const { statusCode, safeMessage } = sanitizeGatewayError(err, 'Product creation failed');
      return res.status(statusCode).json({
        success: false,
        error: safeMessage,
      });
    }
  });

  // 9d-3. Authoritative Product Update & Moderation Gateway (PCR-13 Remediation)
  app.post('/api/products/update', financialRateLimiter, async (req, res) => {
    try {
      const payload = req.body;
      const authHeader = req.headers.authorization;
      const result = await processProductUpdateGateway(payload, authHeader);
      return res.status(200).json(result);
    } catch (err: any) {
      console.error('[API /api/products/update] Error:', err.message);
      const { statusCode, safeMessage } = sanitizeGatewayError(err, 'Product update failed');
      return res.status(statusCode).json({
        success: false,
        error: safeMessage,
      });
    }
  });

  // 9d-4. Authoritative Product Deletion Gateway (PCR-13 Remediation)
  app.post('/api/products/delete', financialRateLimiter, async (req, res) => {
    try {
      const payload = req.body;
      const authHeader = req.headers.authorization;
      const result = await processProductDeleteGateway(payload, authHeader);
      return res.status(200).json(result);
    } catch (err: any) {
      console.error('[API /api/products/delete] Error:', err.message);
      const { statusCode, safeMessage } = sanitizeGatewayError(err, 'Product deletion failed');
      return res.status(statusCode).json({
        success: false,
        error: safeMessage,
      });
    }
  });

  // 9e. Authoritative Atomic Booking Reservation Gateway (V3-04 Remediation)
  app.post('/api/bookings/create', financialRateLimiter, async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      const caller = await requireAuthenticatedCaller(authHeader);
      const { serviceId, sellerId, date, time, customerName, customerPhone, notes, idempotencyKey } = req.body || {};

      if (!serviceId || typeof serviceId !== 'string' || serviceId.trim().length === 0 || serviceId.length > 128) {
        return res.status(400).json({ success: false, error: 'Valid serviceId is required' });
      }
      if (!date || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date.trim())) {
        return res.status(400).json({ success: false, error: 'Valid date (YYYY-MM-DD) is required' });
      }
      if (!time || typeof time !== 'string' || time.trim().length === 0 || time.length > 32) {
        return res.status(400).json({ success: false, error: 'Valid time slot is required' });
      }
      if (idempotencyKey !== undefined && (typeof idempotencyKey !== 'string' || idempotencyKey.trim().length < 4 || idempotencyKey.length > 128)) {
        return res.status(400).json({ success: false, error: 'Invalid idempotencyKey format' });
      }

      const adminDb = getAdminDb();

      // F-27: Check idempotency key if provided
      const cleanIdempotencyKey = typeof idempotencyKey === 'string' ? idempotencyKey.trim() : '';
      if (cleanIdempotencyKey) {
        const idemSnap = await adminDb.collection('booking_idempotency_locks').doc(`${caller.uid}_${cleanIdempotencyKey}`).get();
        if (idemSnap.exists) {
          const idemData = idemSnap.data() || {};
          if (idemData.booking) {
            return res.status(200).json({ success: true, booking: idemData.booking, reused: true });
          }
        }
      }

      // 1. Authoritative Service Lookup and Validation
      const serviceDoc = await adminDb.collection('products').doc(serviceId).get();
      if (!serviceDoc.exists) {
        return res.status(404).json({ success: false, error: 'Service not found in catalog' });
      }
      const serviceData = serviceDoc.data() || {};
      if (serviceData.type !== 'services' && serviceData.category !== 'services') {
        return res.status(400).json({ success: false, error: 'Referenced entity is not a bookable service' });
      }
      if (serviceData.isPublished === false || serviceData.status === 'suspended' || serviceData.status === 'rejected') {
        return res.status(400).json({ success: false, error: 'Service is not active or available for booking' });
      }

      const authoritativeSellerId = serviceData.sellerId;
      if (sellerId && sellerId !== authoritativeSellerId) {
        return res.status(400).json({ success: false, error: 'Service does not belong to specified provider' });
      }

      const rawServicePrice = serviceData.price;
      const authoritativePrice = (rawServicePrice === null || rawServicePrice === undefined || rawServicePrice === '' || typeof rawServicePrice === 'boolean')
        ? NaN
        : Number(rawServicePrice);
      if (!Number.isFinite(authoritativePrice) || isNaN(authoritativePrice) || authoritativePrice <= 0) {
        return res.status(503).json({
          success: false,
          error: `Corrupted service price for service #${serviceId}. Booking aborted (Fail-Closed).`,
        });
      }
      const serviceTitle = serviceData.title?.ar || serviceData.title?.en || serviceData.name || 'Service';
      const slotId = `${authoritativeSellerId}_${date.replace(/[^a-zA-Z0-9]/g, '-')}_${time.replace(/[^a-zA-Z0-9]/g, '-')}`;
      const slotRef = adminDb.collection('booking_slots').doc(slotId);
      const bookingId = `book_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      const bookingCode = `BK-${Math.floor(10000 + Math.random() * 90000)}`;
      const bookingRef = adminDb.collection('bookings').doc(bookingId);

      const now = new Date().toISOString();
      const bookingData = {
        id: bookingId,
        bookingCode,
        serviceId,
        serviceName: serviceTitle,
        sellerId: authoritativeSellerId,
        storeId: serviceData.storeId || authoritativeSellerId,
        customerId: caller.uid,
        customerName: customerName || caller.email || 'Customer',
        customerPhone: customerPhone || '',
        date,
        time,
        price: authoritativePrice,
        status: 'requested',
        notes: notes ? String(notes).slice(0, 500) : '',
        createdAt: now,
        updatedAt: now,
      };

      // 2. Atomic Slot Reservation Transaction
      await adminDb.runTransaction(async (t) => {
        const slotSnap = await t.get(slotRef);
        if (slotSnap.exists) {
          const slot = slotSnap.data();
          if (slot?.status === 'booked' || slot?.status === 'confirmed' || slot?.status === 'requested') {
            const err = new Error(`الموعد المطلوب (${date} في ${time}) محجوز مسبقاً لدى مقدم الخدمة. يرجى اختيار موعد آخر.`) as any;
            err.statusCode = 409;
            throw err;
          }
        }

        t.set(slotRef, {
          slotId,
          sellerId: authoritativeSellerId,
          date,
          time,
          bookingId,
          customerId: caller.uid,
          status: 'booked',
          createdAt: now,
          updatedAt: now,
        });

        t.set(bookingRef, bookingData);
        if (cleanIdempotencyKey) {
          const idemRef = adminDb.collection('booking_idempotency_locks').doc(`${caller.uid}_${cleanIdempotencyKey}`);
          t.set(idemRef, {
            idempotencyKey: cleanIdempotencyKey,
            customerId: caller.uid,
            bookingId,
            booking: bookingData,
            createdAt: now,
          });
        }
      });

      return res.status(200).json({ success: true, booking: bookingData });
    } catch (err: any) {
      console.error('[API /api/bookings/create] Error:', err.message);
      const { statusCode, safeMessage } = sanitizeGatewayError(err, 'Booking reservation failed');
      return res.status(statusCode).json({
        success: false,
        error: safeMessage,
      });
    }
  });

  // 9f. Authoritative Dispute Workflow Gateways (V3-03 Remediation)
  app.post('/api/disputes/create', financialRateLimiter, async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      const caller = await requireAuthenticatedCaller(authHeader);
      const { orderId, subOrderId, sellerId: clientSellerId, reason, description, evidenceUrls, requestedAction } = req.body || {};

      if (!orderId || typeof orderId !== 'string') {
        return res.status(400).json({ success: false, error: 'orderId is required' });
      }
      if (!description || typeof description !== 'string' || !description.trim()) {
        return res.status(400).json({ success: false, error: 'description is required' });
      }

      const adminDb = getAdminDb();

      // 1. Authoritative Order Lookup and Ownership Verification
      const orderDoc = await adminDb.collection('orders').doc(orderId).get();
      if (!orderDoc.exists) {
        return res.status(404).json({ success: false, error: 'Referenced order not found' });
      }
      const orderData = orderDoc.data() || {};
      if (orderData.customerId !== caller.uid && !caller.isPlatformAdmin) {
        return res.status(403).json({ success: false, error: 'Forbidden: You can only open disputes for your own orders' });
      }

      // 2. Authoritative Seller and Store Resolution (NEVER trust client-supplied sellerId/storeId)
      const parseStrictPos = (val: any, field: string): number => {
        if (val === null || val === undefined || val === '' || typeof val === 'boolean') {
          const err = new Error(`Invalid or missing financial field (${field}) on order #${orderId}. Fail-Closed.`) as any;
          err.statusCode = 503;
          throw err;
        }
        const n = Number(val);
        if (!Number.isFinite(n) || isNaN(n) || n <= 0) {
          const err = new Error(`Corrupted financial field (${field}: ${String(val)}) on order #${orderId}. Fail-Closed.`) as any;
          err.statusCode = 503;
          throw err;
        }
        return n;
      };

      let authoritativeSellerId = '';
      let authoritativeStoreId: string | null = null;
      let authoritativeSellerName = 'Merchant';
      let authoritativeDisputedAmount = 0;

      if (subOrderId && Array.isArray(orderData.vendorOrders) && orderData.vendorOrders.length > 0) {
        const vo = orderData.vendorOrders.find((v: any) => v.subOrderId === subOrderId);
        if (!vo) {
          return res.status(400).json({ success: false, error: `Sub-order ${subOrderId} not found in this order` });
        }
        authoritativeSellerId = vo.sellerId;
        authoritativeStoreId = vo.storeId || null;
        authoritativeSellerName = vo.storeName || vo.sellerName || 'Merchant';
        const rawVoAmt = vo.sellerRevenue !== undefined && vo.sellerRevenue !== null
          ? vo.sellerRevenue
          : (vo.subtotal !== undefined && vo.subtotal !== null ? vo.subtotal : vo.total);
        authoritativeDisputedAmount = parseStrictPos(rawVoAmt, `subOrder(${subOrderId}).amount`);
      } else if (Array.isArray(orderData.vendorOrders) && orderData.vendorOrders.length === 1) {
        const vo = orderData.vendorOrders[0];
        authoritativeSellerId = vo.sellerId;
        authoritativeStoreId = vo.storeId || null;
        authoritativeSellerName = vo.storeName || vo.sellerName || 'Merchant';
        const rawVoAmt = vo.sellerRevenue !== undefined && vo.sellerRevenue !== null
          ? vo.sellerRevenue
          : (vo.subtotal !== undefined && vo.subtotal !== null ? vo.subtotal : (vo.total !== undefined && vo.total !== null ? vo.total : orderData.total));
        authoritativeDisputedAmount = parseStrictPos(rawVoAmt, 'vendorOrder[0].amount');
      } else if (Array.isArray(orderData.sellerIds) && orderData.sellerIds.length === 1) {
        authoritativeSellerId = orderData.sellerIds[0];
        authoritativeStoreId = (orderData.vendorStoreIds && orderData.vendorStoreIds[0]) || null;
        authoritativeSellerName = orderData.storeName || 'Merchant';
        const rawOrdAmt = orderData.sellerRevenue !== undefined && orderData.sellerRevenue !== null
          ? orderData.sellerRevenue
          : (orderData.subtotal !== undefined && orderData.subtotal !== null ? orderData.subtotal : orderData.total);
        authoritativeDisputedAmount = parseStrictPos(rawOrdAmt, 'order.amount');
      } else if (Array.isArray(orderData.vendorOrders) && orderData.vendorOrders.length > 1) {
        // Multi-vendor order: must disambiguate seller
        if (clientSellerId) {
          const matchingVo = orderData.vendorOrders.find((v: any) => v.sellerId === clientSellerId);
          if (!matchingVo) {
            return res.status(400).json({ success: false, error: 'Specified sellerId does not belong to any sub-order in this order' });
          }
          authoritativeSellerId = matchingVo.sellerId;
          authoritativeStoreId = matchingVo.storeId || null;
          authoritativeSellerName = matchingVo.storeName || matchingVo.sellerName || 'Merchant';
          const rawVoAmt = matchingVo.sellerRevenue !== undefined && matchingVo.sellerRevenue !== null
            ? matchingVo.sellerRevenue
            : (matchingVo.subtotal !== undefined && matchingVo.subtotal !== null ? matchingVo.subtotal : matchingVo.total);
          authoritativeDisputedAmount = parseStrictPos(rawVoAmt, `vendorOrder(${clientSellerId}).amount`);
        } else {
          return res.status(400).json({ success: false, error: 'subOrderId or sellerId is required to identify the merchant on multi-vendor orders' });
        }
      } else {
        authoritativeSellerId = (orderData.sellerIds && orderData.sellerIds[0]) || orderData.sellerId || '';
        authoritativeStoreId = (orderData.vendorStoreIds && orderData.vendorStoreIds[0]) || orderData.storeId || null;
        const rawOrdAmt = orderData.sellerRevenue !== undefined && orderData.sellerRevenue !== null
          ? orderData.sellerRevenue
          : (orderData.subtotal !== undefined && orderData.subtotal !== null ? orderData.subtotal : orderData.total);
        authoritativeDisputedAmount = parseStrictPos(rawOrdAmt, 'order.amount');
      }

      if (!authoritativeSellerId) {
        return res.status(400).json({ success: false, error: 'Unable to authoritatively resolve seller for this order' });
      }

      // 3. Atomic Dispute Creation & Active Dispute Lock (PCR-11 & NEW-06 Remediation)
      const lockScopeKey = subOrderId ? `${orderId}_${subOrderId}` : orderId;
      const lockRef = adminDb.collection('dispute_locks').doc(lockScopeKey);
      const sellerPayoutLockRef = adminDb.collection('seller_payout_locks').doc(authoritativeSellerId);
      const disputeId = `disp_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      const disputeRef = adminDb.collection('disputes').doc(disputeId);
      const now = new Date().toISOString();

      const newDispute = {
        id: disputeId,
        orderId,
        subOrderId: subOrderId || null,
        customerId: caller.uid,
        customerName: orderData.customerName || caller.email || 'Customer',
        customerPhone: orderData.phone || null,
        sellerId: authoritativeSellerId,
        sellerName: authoritativeSellerName,
        storeId: authoritativeStoreId,
        disputedAmount: Number(authoritativeDisputedAmount.toFixed(2)),
        reason: reason || 'other',
        description: description.trim().slice(0, 2000),
        evidenceUrls: Array.isArray(evidenceUrls) ? evidenceUrls.slice(0, 5) : [],
        requestedAction: requestedAction || 'refund',
        status: 'OPEN',
        createdAt: now,
        updatedAt: now,
      };

      await adminDb.runTransaction(async (transaction) => {
        const lockSnap = await transaction.get(lockRef);
        const sellerLockSnap = await transaction.get(sellerPayoutLockRef);
        if (lockSnap.exists) {
          const lockData = lockSnap.data() || {};
          if (lockData.activeDisputeId) {
            const activeDispSnap = await transaction.get(adminDb.collection('disputes').doc(lockData.activeDisputeId));
            if (activeDispSnap.exists) {
              const activeDisp = activeDispSnap.data() || {};
              if (['OPEN', 'SELLER_RESPONDED'].includes(activeDisp.status)) {
                const err = new Error('There is already an active dispute open for this order') as any;
                err.statusCode = 409;
                throw err;
              }
            }
          }
        }

        // Also check any legacy active disputes for this order inside the transaction
        const existingSnap = await transaction.get(
          adminDb
            .collection('disputes')
            .where('orderId', '==', orderId)
            .where('status', 'in', ['OPEN', 'SELLER_RESPONDED'])
        );
        if (!existingSnap.empty) {
          const hasMatchingActive = existingSnap.docs.some((d) => {
            const dData = d.data();
            if (subOrderId && dData.subOrderId) {
              return dData.subOrderId === subOrderId;
            }
            return true;
          });
          if (hasMatchingActive) {
            const err = new Error('There is already an active dispute open for this order') as any;
            err.statusCode = 409;
            throw err;
          }
        }

        transaction.set(lockRef, {
          lockId: lockScopeKey,
          orderId,
          subOrderId: subOrderId || null,
          activeDisputeId: disputeId,
          status: 'OPEN',
          updatedAt: now,
        });

        // NEW-06: Atomically freeze disputed amount on seller_payout_locks so concurrent payout transaction serializes on lockRef
        if (authoritativeDisputedAmount > 0) {
          const currentDisputeFrozen = sellerLockSnap.exists
            ? (Number(sellerLockSnap.data()?.totalDisputeFrozen) || 0)
            : 0;
          transaction.set(sellerPayoutLockRef, {
            sellerId: authoritativeSellerId,
            totalDisputeFrozen: Number((currentDisputeFrozen + authoritativeDisputedAmount).toFixed(2)),
            lastDisputeId: disputeId,
            updatedAt: now,
          }, { merge: true });
        }

        transaction.set(disputeRef, newDispute);
      });

      return res.status(200).json({ success: true, dispute: newDispute });
    } catch (err: any) {
      console.error('[API /api/disputes/create] Error:', err.message);
      const { statusCode, safeMessage } = sanitizeGatewayError(err, 'Failed to create dispute');
      return res.status(statusCode).json({
        success: false,
        error: safeMessage,
      });
    }
  });

  app.post('/api/disputes/respond', financialRateLimiter, async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      const caller = await requireAuthenticatedCaller(authHeader);
      const { disputeId, message, proposedAction } = req.body || {};

      if (!disputeId || !message || typeof message !== 'string' || !message.trim()) {
        return res.status(400).json({ success: false, error: 'disputeId and message are required' });
      }

      const adminDb = getAdminDb();
      const disputeRef = adminDb.collection('disputes').doc(disputeId);
      const now = new Date().toISOString();

      // Atomic Transaction for Dispute Response (PCR-12 Remediation: Prevents concurrent response race conditions)
      const updatedDispute = await adminDb.runTransaction(async (transaction) => {
        const disputeSnap = await transaction.get(disputeRef);
        if (!disputeSnap.exists) {
          const err = new Error('Dispute not found') as any;
          err.statusCode = 404;
          throw err;
        }
        const dispute = disputeSnap.data() as any;

        if (!caller.isPlatformAdmin && caller.uid !== dispute.sellerId) {
          const err = new Error('Forbidden: You can only respond to disputes against your own store') as any;
          err.statusCode = 403;
          throw err;
        }

        // Strict State Machine inside transaction: Merchant can ONLY respond to OPEN disputes
        if (['RESOLVED_REFUND', 'RESOLVED_REJECTED', 'CLOSED'].includes(dispute.status)) {
          const err = new Error(`Cannot respond to dispute: dispute is already in terminal state (${dispute.status})`) as any;
          err.statusCode = 409;
          throw err;
        }
        if (dispute.status !== 'OPEN') {
          const err = new Error(`Only OPEN disputes can be responded to. Current status: ${dispute.status}`) as any;
          err.statusCode = 409;
          throw err;
        }

        const updateData = {
          status: 'SELLER_RESPONDED',
          sellerResponse: {
            message: message.trim(),
            respondedAt: now,
            proposedAction: proposedAction || null,
          },
          updatedAt: now,
        };

        transaction.update(disputeRef, updateData);
        return { ...dispute, ...updateData };
      });

      return res.status(200).json({ success: true, dispute: updatedDispute });
    } catch (err: any) {
      console.error('[API /api/disputes/respond] Error:', err.message);
      const { statusCode, safeMessage } = sanitizeGatewayError(err, 'Failed to respond to dispute');
      return res.status(statusCode).json({
        success: false,
        error: safeMessage,
      });
    }
  });

  app.post('/api/disputes/resolve', financialRateLimiter, async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      const caller = await requireVerifiedPlatformAdmin(authHeader);
      const { disputeId, actionTaken, resolutionNotes, refundAmount } = req.body || {};

      if (!disputeId || !actionTaken || !['REFUND_APPROVED', 'CLAIM_DISMISSED'].includes(actionTaken)) {
        return res.status(400).json({ success: false, error: 'disputeId and valid actionTaken (REFUND_APPROVED or CLAIM_DISMISSED) are required' });
      }

      const parsedRefundAmount = refundAmount !== undefined ? Number(refundAmount) : 0;
      if (actionTaken === 'REFUND_APPROVED') {
        if (!Number.isFinite(parsedRefundAmount) || isNaN(parsedRefundAmount) || parsedRefundAmount <= 0) {
          return res.status(400).json({
            success: false,
            error: 'Invalid refundAmount: REFUND_APPROVED requires a positive finite refundAmount greater than zero',
          });
        }
      }

      const adminDb = getAdminDb();
      const disputeRef = adminDb.collection('disputes').doc(disputeId);
      const now = new Date().toISOString();
      const finalStatus = actionTaken === 'REFUND_APPROVED' ? 'RESOLVED_REFUND' : 'RESOLVED_REJECTED';

      // Pre-read existing refundRequests for ceiling baseline if REFUND_APPROVED
      const disputePreSnap = await disputeRef.get();
      if (!disputePreSnap.exists) {
        return res.status(404).json({ success: false, error: 'Dispute not found' });
      }
      const disputePreData = disputePreSnap.data() as any;
      let baselineHistoricalOrderRefunded = 0;
      let baselineHistoricalSubOrderRefunded = 0;
      if (actionTaken === 'REFUND_APPROVED' && disputePreData.orderId) {
        const existingRefundsSnap = await adminDb
          .collection('refundRequests')
          .where('orderId', '==', disputePreData.orderId)
          .get();
        if (!existingRefundsSnap.empty) {
          existingRefundsSnap.forEach((doc) => {
            const r = doc.data();
            if (r.status !== 'REFUND_REJECTED' && r.status !== 'REJECTED') {
              const rawHistAmt = r.amount;
              const histAmt = (rawHistAmt === null || rawHistAmt === undefined || rawHistAmt === '' || typeof rawHistAmt === 'boolean')
                ? NaN
                : Number(rawHistAmt);
              if (!Number.isFinite(histAmt) || isNaN(histAmt) || histAmt <= 0) {
                const corruptErr = new Error(`Corrupted historical refund record (#${doc.id}) for order #${disputePreData.orderId}. Fail-Closed.`) as any;
                corruptErr.statusCode = 503;
                throw corruptErr;
              }
              baselineHistoricalOrderRefunded += histAmt;
              if (disputePreData.subOrderId && r.subOrderId === disputePreData.subOrderId) {
                baselineHistoricalSubOrderRefunded += histAmt;
              }
            }
          });
        }
      }

      // Atomic Transaction: Dispute resolution, refund ceiling check, refundRequest creation, and seller lock reservation
      const updatedDispute = await adminDb.runTransaction(async (transaction) => {
        const disputeSnap = await transaction.get(disputeRef);
        if (!disputeSnap.exists) {
          const err = new Error('Dispute not found') as any;
          err.statusCode = 404;
          throw err;
        }
        const disputeData = disputeSnap.data() as any;

        // Terminal State Protection: Resolved or closed disputes CANNOT be re-resolved
        if (['RESOLVED_REFUND', 'RESOLVED_REJECTED', 'CLOSED'].includes(disputeData.status)) {
          const err = new Error(`Dispute is already resolved (${disputeData.status}) and cannot be re-resolved.`) as any;
          err.statusCode = 409;
          throw err;
        }

        if (!['OPEN', 'SELLER_RESPONDED'].includes(disputeData.status)) {
          const err = new Error(`Invalid dispute transition from ${disputeData.status}`) as any;
          err.statusCode = 400;
          throw err;
        }

        let authoritativeRefundAmount = 0;
        const disputeSellerId = disputeData.sellerId || '';
        const disputeFrozenAmt = Number(disputeData.disputedAmount) || 0;
        const sellerLockRefForDispute = disputeSellerId ? adminDb.collection('seller_payout_locks').doc(disputeSellerId) : null;
        const sellerLockSnapForDispute = sellerLockRefForDispute ? await transaction.get(sellerLockRefForDispute) : null;

        // If refund approved, enforce full financial invariants within the same transaction (P0 Finding 3)
        if (actionTaken === 'REFUND_APPROVED' && disputeData.orderId) {
          const orderRef = adminDb.collection('orders').doc(disputeData.orderId);
          const refundLockRef = adminDb.collection('order_refund_locks').doc(disputeData.orderId);
          const orderSnap = await transaction.get(orderRef);
          const refundLockSnap = await transaction.get(refundLockRef);

          if (!orderSnap.exists) {
            const err = new Error(`Associated order #${disputeData.orderId} not found in database. Resolution aborted.`) as any;
            err.statusCode = 404;
            throw err;
          }

          const orderData = orderSnap.data() || {};
          const rawOrderTotalVal = orderData.total;
          const orderTotal = (rawOrderTotalVal === null || rawOrderTotalVal === undefined || rawOrderTotalVal === '' || typeof rawOrderTotalVal === 'boolean')
            ? NaN
            : Number(rawOrderTotalVal);
          if (!Number.isFinite(orderTotal) || isNaN(orderTotal) || orderTotal <= 0) {
            const err = new Error(`Corrupted or unreadable authoritative order total for #${disputeData.orderId}. Resolution aborted (Fail-Closed).`) as any;
            err.statusCode = 503;
            throw err;
          }
          let maxAllowedCeiling = orderTotal;
          let targetSellerId = disputeData.sellerId || orderData.sellerId || (Array.isArray(orderData.sellerIds) ? orderData.sellerIds[0] : '') || '';
          let targetStoreId = disputeData.storeId || orderData.storeId || '';

          if (disputeData.subOrderId && Array.isArray(orderData.vendorOrders)) {
            const sub = orderData.vendorOrders.find((vo: any) => vo.subOrderId === disputeData.subOrderId);
            if (!sub) {
              const err = new Error(`Sub-order #${disputeData.subOrderId} not found in order #${disputeData.orderId}. Resolution aborted (Fail-Closed).`) as any;
              err.statusCode = 400;
              throw err;
            }
            const rawSubCeilingVal = sub.total !== undefined && sub.total !== null ? sub.total : sub.subtotal;
            const subCeiling = (rawSubCeilingVal === null || rawSubCeilingVal === undefined || rawSubCeilingVal === '' || typeof rawSubCeilingVal === 'boolean')
              ? NaN
              : Number(rawSubCeilingVal);
            if (!Number.isFinite(subCeiling) || isNaN(subCeiling) || subCeiling <= 0) {
              const err = new Error(`Corrupted sub-order total for #${disputeData.subOrderId}. Resolution aborted (Fail-Closed).`) as any;
              err.statusCode = 503;
              throw err;
            }
            maxAllowedCeiling = subCeiling;
            targetSellerId = sub.sellerId || targetSellerId;
            targetStoreId = sub.storeId || targetStoreId;
          }

          const sellerLockRef = targetSellerId ? adminDb.collection('seller_payout_locks').doc(targetSellerId) : null;
          const sellerLockSnap = (sellerLockRef && targetSellerId === disputeSellerId)
            ? sellerLockSnapForDispute
            : (sellerLockRef ? await transaction.get(sellerLockRef) : null);

          let cumulativeOrderRefunded = baselineHistoricalOrderRefunded;
          let cumulativeSubOrderRefunded = baselineHistoricalSubOrderRefunded;
          const existingSubOrderRefundsMap: Record<string, number> = {};

          if (refundLockSnap.exists) {
            const lockData = refundLockSnap.data() || {};
            if (lockData.cumulativeRefunded !== undefined) {
              const lockCum = (lockData.cumulativeRefunded === null || lockData.cumulativeRefunded === '' || typeof lockData.cumulativeRefunded === 'boolean')
                ? NaN
                : Number(lockData.cumulativeRefunded);
              if (!Number.isFinite(lockCum) || isNaN(lockCum) || lockCum < 0) {
                const err = new Error(`Corrupted cumulativeRefunded in order_refund_locks for #${disputeData.orderId}. Fail-Closed.`) as any;
                err.statusCode = 503;
                throw err;
              }
              if (lockCum > cumulativeOrderRefunded) {
                cumulativeOrderRefunded = lockCum;
              }
            }
            if (lockData.subOrderRefunds && typeof lockData.subOrderRefunds === 'object') {
              Object.assign(existingSubOrderRefundsMap, lockData.subOrderRefunds);
              if (disputeData.subOrderId && lockData.subOrderRefunds[disputeData.subOrderId] !== undefined) {
                const subLockCum = Number(lockData.subOrderRefunds[disputeData.subOrderId]);
                if (Number.isFinite(subLockCum) && subLockCum > cumulativeSubOrderRefunded) {
                  cumulativeSubOrderRefunded = subLockCum;
                }
              }
            }
          }

          const remainingOrderRefundable = Math.max(0, Number((orderTotal - cumulativeOrderRefunded).toFixed(2)));
          const remainingSubOrderRefundable = disputeData.subOrderId
            ? Math.max(0, Number((maxAllowedCeiling - cumulativeSubOrderRefunded).toFixed(2)))
            : remainingOrderRefundable;
          const remainingRefundable = Math.min(remainingOrderRefundable, remainingSubOrderRefundable);
          authoritativeRefundAmount = Number(parsedRefundAmount.toFixed(2));

          if (authoritativeRefundAmount > remainingRefundable + 0.001) {
            const err = new Error(
              `Dispute refundAmount ($${authoritativeRefundAmount.toFixed(2)}) exceeds remaining refundable ceiling ($${remainingRefundable.toFixed(2)}) for order #${disputeData.orderId}`
            ) as any;
            err.statusCode = 400;
            throw err;
          }

          const newCumulative = Number((cumulativeOrderRefunded + authoritativeRefundAmount).toFixed(2));
          if (disputeData.subOrderId) {
            existingSubOrderRefundsMap[disputeData.subOrderId] = Number((cumulativeSubOrderRefunded + authoritativeRefundAmount).toFixed(2));
          }
          const refundId = `ref_disp_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
          const refundDocRef = adminDb.collection('refundRequests').doc(refundId);

          // 1. Update order_refund_locks atomically
          transaction.set(refundLockRef, {
            orderId: disputeData.orderId,
            maxAllowedCeiling: orderTotal,
            cumulativeRefunded: newCumulative,
            subOrderRefunds: existingSubOrderRefundsMap,
            lastRefundId: refundId,
            lastAmount: authoritativeRefundAmount,
            updatedAt: now,
          }, { merge: true });

          // 2. Reserve refund on seller_payout_locks AND release active dispute freeze (converted to refund reservation)
          if (sellerLockRef) {
            const currentSellerRefundReserved = sellerLockSnap && sellerLockSnap.exists
              ? (Number(sellerLockSnap.data()?.totalRefundReserved) || 0)
              : 0;
            const currentDisputeFrozen = sellerLockSnap && sellerLockSnap.exists
              ? (Number(sellerLockSnap.data()?.totalDisputeFrozen) || 0)
              : 0;
            transaction.set(sellerLockRef, {
              sellerId: targetSellerId,
              totalRefundReserved: Number((currentSellerRefundReserved + authoritativeRefundAmount).toFixed(2)),
              totalDisputeFrozen: Math.max(0, Number((currentDisputeFrozen - disputeFrozenAmt).toFixed(2))),
              lastRefundAt: now,
              lastRefundId: refundId,
              lastOrderRefunded: disputeData.orderId,
            }, { merge: true });
          }

          // 3. Create authoritative refundRequests document in REFUND_APPROVED status
          transaction.set(refundDocRef, {
            id: refundId,
            orderId: disputeData.orderId,
            ...(disputeData.subOrderId ? { subOrderId: disputeData.subOrderId } : {}),
            customerId: disputeData.customerId || orderData.customerId || '',
            customerName: disputeData.customerName || orderData.customerName || 'Customer',
            customerPhone: disputeData.customerPhone || orderData.phone || '',
            sellerId: targetSellerId,
            storeId: targetStoreId,
            amount: authoritativeRefundAmount,
            reason: disputeData.reason || 'other',
            notes: `Dispute #${disputeId} resolved: ${(resolutionNotes || '').trim()}`,
            status: 'REFUND_APPROVED',
            disputeId,
            processedBy: caller.uid,
            processedAt: now,
            createdAt: now,
            updatedAt: now,
          });

          // 4. Update order refundStatus and cumulative refundAmount
          transaction.update(orderRef, {
            refundStatus: 'approved',
            refundAmount: newCumulative,
            updatedAt: now,
          });
        } else if (actionTaken === 'CLAIM_DISMISSED' && sellerLockRefForDispute && sellerLockSnapForDispute && sellerLockSnapForDispute.exists) {
          // Release active dispute freeze when claim is dismissed
          const currentDisputeFrozen = Number(sellerLockSnapForDispute.data()?.totalDisputeFrozen) || 0;
          transaction.set(sellerLockRefForDispute, {
            totalDisputeFrozen: Math.max(0, Number((currentDisputeFrozen - disputeFrozenAmt).toFixed(2))),
            updatedAt: now,
          }, { merge: true });
        }

        const resolution = {
          resolvedBy: caller.uid,
          actionTaken,
          resolutionNotes: (resolutionNotes || '').trim(),
          resolvedAt: now,
          refundAmount: authoritativeRefundAmount,
        };

        // Release active dispute lock when resolved
        const lockScopeKey = disputeData.subOrderId ? `${disputeData.orderId}_${disputeData.subOrderId}` : disputeData.orderId;
        if (lockScopeKey) {
          const dispLockRef = adminDb.collection('dispute_locks').doc(lockScopeKey);
          transaction.set(dispLockRef, {
            status: finalStatus,
            activeDisputeId: null,
            updatedAt: now,
          }, { merge: true });
        }

        // Write authoritative audit log inside transaction
        const auditRef = adminDb.collection('audit_logs').doc(`audit_disp_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`);
        transaction.set(auditRef, {
          id: auditRef.id,
          actorId: caller.uid,
          actorRole: caller.isSuperAdmin ? 'SUPER_ADMIN' : 'ADMIN',
          actorEmail: caller.email || '',
          action: actionTaken === 'REFUND_APPROVED' ? 'DISPUTE_RESOLVED_REFUND' : 'DISPUTE_RESOLVED_DISMISSED',
          targetType: 'dispute',
          targetId: disputeId,
          targetName: `Dispute #${disputeId} (Order #${disputeData.orderId})`,
          timestamp: now,
          metadata: {
            orderId: disputeData.orderId,
            actionTaken,
            refundAmount: authoritativeRefundAmount,
            resolutionNotes: (resolutionNotes || '').trim(),
          },
        });

        transaction.update(disputeRef, {
          status: finalStatus,
          adminResolution: resolution,
          updatedAt: now,
        });

        return { ...disputeData, status: finalStatus, adminResolution: resolution, updatedAt: now };
      });

      return res.status(200).json({
        success: true,
        dispute: updatedDispute,
      });
    } catch (err: any) {
      console.error('[API /api/disputes/resolve] Error:', err.message);
      const { statusCode, safeMessage } = sanitizeGatewayError(err, 'Failed to resolve dispute');
      return res.status(statusCode).json({
        success: false,
        error: safeMessage,
      });
    }
  });

  // 10. Authoritative Payout Review Endpoint (P1-RBAC-02)
  app.post('/api/payouts/review', financialRateLimiter, async (req, res) => {
    try {
      const payload = req.body;
      const authHeader = req.headers.authorization;
      const result = await processPayoutReviewGateway(payload, authHeader);
      return res.status(200).json(result);
    } catch (err: any) {
      console.error('[API /api/payouts/review] Error:', err.message);
      const { statusCode, safeMessage } = sanitizeGatewayError(err, 'Failed to review payout request');
      return res.status(statusCode).json({
        success: false,
        error: safeMessage,
      });
    }
  });

  // 11. Authoritative Subscription Review Endpoint (P1-RBAC-01)
  app.post('/api/subscriptions/review', financialRateLimiter, async (req, res) => {
    try {
      const payload = req.body;
      const authHeader = req.headers.authorization;
      const result = await processSubscriptionReviewGateway(payload, authHeader);
      return res.status(200).json(result);
    } catch (err: any) {
      console.error('[API /api/subscriptions/review] Error:', err.message);
      const { statusCode, safeMessage } = sanitizeGatewayError(err, 'Failed to review subscription');
      return res.status(statusCode).json({
        success: false,
        error: safeMessage,
      });
    }
  });

  // 12. Authoritative Security Audit Log Endpoint (P1-AUDIT-01 & P1-19)
  app.post('/api/audit/log', financialRateLimiter, async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      const caller = await requireVerifiedPlatformAdmin(authHeader);
      const { action, targetType, targetId, targetName, metadata } = req.body || {};

      if (!action || typeof action !== 'string') {
        return res.status(400).json({ success: false, error: 'Action is required' });
      }
      if (!targetType || !targetId) {
        return res.status(400).json({ success: false, error: 'targetType and targetId are required' });
      }

      // P1-19: Restrict manual audit actions to an allowlist of administrative events
      const ALLOWED_ADMIN_MANUAL_ACTIONS = [
        'SETTINGS_VIEWED',
        'SETTINGS_UPDATED',
        'REPORT_EXPORTED',
        'ADMIN_LOGIN',
        'ADMIN_LOGOUT',
        'SECURITY_REVIEW_PERFORMED',
        'SYSTEM_DIAGNOSTIC_RUN',
        'USER_INSPECTED',
      ];

      const cleanAction = action.trim();
      if (!ALLOWED_ADMIN_MANUAL_ACTIONS.includes(cleanAction)) {
        return res.status(400).json({
          success: false,
          error: `Invalid manual audit action "${cleanAction}". Financial and lifecycle mutations can only be recorded automatically by authoritative gateways.`,
        });
      }

      const adminDb = getAdminDb();
      const now = new Date().toISOString();
      const logId = `audit_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      const logEntry = {
        id: logId,
        actorId: caller.uid,
        actorRole: caller.isSuperAdmin ? 'SUPER_ADMIN' : 'ADMIN',
        actorEmail: caller.email || '',
        action: cleanAction,
        targetType,
        targetId: String(targetId),
        targetName: targetName ? String(targetName) : undefined,
        timestamp: now,
        metadata: metadata && typeof metadata === 'object' ? metadata : {},
      };

      await adminDb.collection('audit_logs').doc(logId).set(logEntry);
      return res.status(200).json({ success: true, log: logEntry });
    } catch (err: any) {
      console.error('[API /api/audit/log] Error:', err.message);
      const { statusCode, safeMessage } = sanitizeGatewayError(err, 'Failed to record audit log');
      return res.status(statusCode).json({
        success: false,
        error: safeMessage,
      });
    }
  });

  // 13. Protected Analytics Ingestion Endpoint (P1-ABUSE-01)
  const analyticsRateLimiter = createRateLimiter({
    windowMs: 60 * 1000,
    max: 120,
    allowGuest: true,
    message: 'Analytics rate limit reached.',
  });

  const ALLOWED_ANALYTICS_EVENT_TYPES: readonly string[] = Object.freeze([
    'PRODUCT_VIEW',
    'STORE_VIEW',
    'SERVICE_VIEW',
    'RESTAURANT_VIEW',
    'SEARCH_QUERY',
    'AD_IMPRESSION',
    'AD_CLICK',
    'PROMOTION_VIEW',
    'PROMOTION_CLICK',
    'CATEGORY_VIEW',
    'CHECKOUT_STARTED',
    'ORDER_COMPLETED',
  ]);

  app.post('/api/analytics/event', analyticsRateLimiter, async (req, res) => {
    try {
      const { type, entityId, sellerId, metadata } = req.body || {};
      const trimmedType = typeof type === 'string' ? type.trim() : '';

      // P1-ABUSE-01: Strict Event Allowlist Enforcement
      if (!trimmedType || !ALLOWED_ANALYTICS_EVENT_TYPES.includes(trimmedType)) {
        return res.status(400).json({ success: false, error: 'Invalid or unauthorized event type' });
      }

      // Metadata size and boundary check (Prevent cost amplification & write abuse)
      let sanitizedMetadata: Record<string, any> = {};
      if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
        const entries = Object.entries(metadata).slice(0, 10); // Max 10 keys
        for (const [k, v] of entries) {
          if (typeof k === 'string' && k.length <= 50) {
            const cleanVal = typeof v === 'string' ? v.slice(0, 200) : typeof v === 'number' || typeof v === 'boolean' ? v : null;
            if (cleanVal !== null) {
              sanitizedMetadata[k] = cleanVal;
            }
          }
        }
      }

      const adminDb = getAdminDb();
      const eventId = `evt_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      const cleanTargetId = entityId ? String(entityId).slice(0, 100) : (req.body?.targetId ? String(req.body.targetId).slice(0, 100) : null);
      const eventDoc = {
        id: eventId,
        type: trimmedType,
        entityId: cleanTargetId,
        targetId: cleanTargetId,
        targetType: req.body?.targetType ? String(req.body.targetType).slice(0, 50) : 'product',
        sellerId: sellerId ? String(sellerId).slice(0, 100) : null,
        metadata: sanitizedMetadata,
        ip: (req as any).rateLimitIdentity || 'anonymous',
        timestamp: new Date().toISOString(),
      };

      await adminDb.collection('analyticsEvents').doc(eventId).set(eventDoc);
      return res.status(200).json({ success: true, eventId });
    } catch (err: any) {
      console.error('[API /api/analytics/event] Error:', err.message);
      const { statusCode, safeMessage } = sanitizeGatewayError(err, 'Failed to record analytics event');
      return res.status(statusCode).json({ success: false, error: safeMessage });
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
      const { statusCode, safeMessage } = sanitizeGatewayError(err, 'Failed to process AI query');
      return res.status(statusCode).json({
        success: false,
        error: safeMessage,
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
      if ((req as any).authenticatedUser) {
        const decoded = (req as any).authenticatedUser;
        try {
          await assertUserAccountActive(decoded.uid);
        } catch (suspErr: any) {
          return res.status(403).json({
            success: false,
            error: suspErr.message || 'Account is suspended or disabled.',
          });
        }
        caller = {
          uid: decoded.uid,
          email: decoded.email,
          emailVerified: decoded.email_verified === true,
          isPlatformAdmin: false,
          isSuperAdmin: false,
          token: decoded,
        };
      } else if (authHeader) {
        try {
          caller = await requireAuthenticatedCaller(authHeader);
        } catch (authErr: any) {
          if (authErr?.message?.includes('suspended') || authErr?.message?.includes('banned') || authErr?.message?.includes('disabled') || authErr?.statusCode === 403) {
            return res.status(403).json({
              success: false,
              error: authErr.message || 'Account is suspended or disabled.',
            });
          }
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
      const { statusCode, safeMessage } = sanitizeGatewayError(err, 'Failed to execute smart search');
      return res.status(statusCode).json({
        success: false,
        error: safeMessage,
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
      const { statusCode, safeMessage } = sanitizeGatewayError(err, 'Failed to generate report summary');
      return res.status(statusCode).json({
        success: false,
        error: safeMessage,
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
      const { statusCode, safeMessage } = sanitizeGatewayError(err, 'Failed to generate product copy');
      return res.status(statusCode).json({
        success: false,
        error: safeMessage,
      });
    }
  });

  // 14. Dedicated AI Tool Policy Execution Endpoint (P1-21)
  app.post('/api/ai/execute-tool', aiRateLimiter, async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      const caller = await requireAuthenticatedCaller(authHeader);
      const { toolName, args } = req.body || {};

      if (!toolName || typeof toolName !== 'string') {
        return res.status(400).json({ success: false, error: 'toolName is required' });
      }

      const result = await validateAndExecuteToolPolicy(toolName, args || {}, caller);
      if (!result.allowed && result.statusCode === 429) {
        return res.status(429).json({
          success: false,
          error: result.error,
          result,
        });
      }
      return res.status(200).json({ success: true, result });
    } catch (err: any) {
      console.error('[API /api/ai/execute-tool] Error:', err.message);
      if (err.code === 'RATE_LIMITER_UNAVAILABLE' || err.statusCode === 503) {
        return res.status(503).json({
          success: false,
          error: 'Security control failure: Rate limiter service temporarily unavailable.',
          code: 'RATE_LIMITER_UNAVAILABLE',
        });
      }
      const { statusCode, safeMessage } = sanitizeGatewayError(err, 'Failed to execute tool policy');
      return res.status(statusCode).json({
        success: false,
        error: safeMessage,
      });
    }
  });

  // Production error handling middleware: suppresses stack traces in production
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('[MarketSpace Unhandled Error]:', err);
    if (res.headersSent) {
      return next(err);
    }
    const message = process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : (err?.message || 'Internal server error');
    return res.status(err?.status || 500).json({
      success: false,
      error: message,
    });
  });

  return app;
}

export async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    validateBackendFirebaseConfiguration(process.env);
  }
  const app = createProductionApiApp();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

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

const isMainEntry =
  process.env.NODE_ENV !== 'test' &&
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(process.cwd(), 'server.ts');

if (isMainEntry) {
  startServer().catch((err) => {
    console.error('[MarketSpace Server] Failed to start:', err);
    process.exit(1);
  });
}
