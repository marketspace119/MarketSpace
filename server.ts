import express from 'express';
import path from 'path';
import crypto from 'crypto';
import { createServer as createViteServer } from 'vite';
import { processOrderGateway, processSubOrderUpdateGateway } from './server/orderGateway';
import { processPayoutGateway, processPayoutReviewGateway, getSellerFinancialSummaryGateway } from './server/payoutGateway';
import { processSubscriptionReviewGateway } from './server/subscriptionGateway';
import { processRefundGateway } from './server/refundGateway';
import { processPaymentReferenceSubmissionGateway, processPaymentReviewGateway } from './server/paymentGateway';
import { processUserRoleUpdateGateway, processUserStatusUpdateGateway } from './server/userGateway';
import { processImageVerificationGateway, processImageUploadGateway } from './server/imageGateway';
import { createRateLimiter } from './server/rateLimiter';
import { getAdminDb, requireAuthenticatedCaller, requireVerifiedPlatformAdmin, verifyFirebaseBearerToken } from './server/firebaseAdmin';
import {
  handleBusinessAssistant,
  handleSellerAssistant,
  handleCustomerAssistant,
  handleSmartSearch,
  handleReportSummarization,
} from './server/ai/aiService';
import { validateAndExecuteToolPolicy } from './server/ai/toolPolicy';

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

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

  // 9b. Authoritative User Status Management (Platform Admin & Super Admin)
  app.post('/api/users/update-status', financialRateLimiter, async (req, res) => {
    try {
      const payload = req.body;
      const authHeader = req.headers.authorization;
      const result = await processUserStatusUpdateGateway(payload, authHeader);
      return res.status(200).json(result);
    } catch (err: any) {
      console.error('[API /api/users/update-status] Error:', err.message);
      const isForbidden = err.message?.includes('Forbidden');
      const isAuth = err.message?.includes('Authentication');
      const statusCode = isForbidden ? 403 : isAuth ? 401 : 400;
      return res.status(statusCode).json({
        success: false,
        error: err.message || 'Failed to update user status',
      });
    }
  });

  // 9c. Authoritative Binary Image Verification Gateway (Deep Magic-Byte Inspection)
  app.post('/api/images/verify', async (req, res) => {
    try {
      const payload = req.body;
      const authHeader = req.headers.authorization;
      const result = await processImageVerificationGateway(payload, authHeader);
      return res.status(200).json({ success: true, ...result });
    } catch (err: any) {
      console.error('[API /api/images/verify] Error:', err.message);
      const isForbidden = err.message?.includes('Forbidden');
      const isAuth = err.message?.includes('Authentication');
      const statusCode = err.statusCode || (isForbidden ? 403 : isAuth ? 401 : 400);
      return res.status(statusCode).json({
        success: false,
        error: err.message || 'Image verification failed',
      });
    }
  });

  // 9d. Authoritative Binary Image Upload Gateway (V3-02 Remediation)
  app.post('/api/images/upload', async (req, res) => {
    try {
      const payload = req.body;
      const authHeader = req.headers.authorization;
      const result = await processImageUploadGateway(payload, authHeader);
      return res.status(200).json(result);
    } catch (err: any) {
      console.error('[API /api/images/upload] Error:', err.message);
      const isForbidden = err.message?.includes('Forbidden');
      const isAuth = err.message?.includes('Authentication');
      const statusCode = err.statusCode || (isForbidden ? 403 : isAuth ? 401 : 400);
      return res.status(statusCode).json({
        success: false,
        error: err.message || 'Image upload failed',
      });
    }
  });

  // 9e. Authoritative Atomic Booking Reservation Gateway (V3-04 Remediation)
  app.post('/api/bookings/create', financialRateLimiter, async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      const caller = await requireAuthenticatedCaller(authHeader);
      const { serviceId, sellerId, date, time, customerName, customerPhone, notes } = req.body || {};

      if (!serviceId || typeof serviceId !== 'string') {
        return res.status(400).json({ success: false, error: 'serviceId is required' });
      }
      if (!date || typeof date !== 'string' || !time || typeof time !== 'string') {
        return res.status(400).json({ success: false, error: 'date and time are required' });
      }

      const adminDb = getAdminDb();

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

      const authoritativePrice = Number(serviceData.price) || 0;
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
      });

      return res.status(200).json({ success: true, booking: bookingData });
    } catch (err: any) {
      console.error('[API /api/bookings/create] Error:', err.message);
      const isForbidden = err.message?.includes('Forbidden');
      const isAuth = err.message?.includes('Authentication');
      const isConflict = err.statusCode === 409 || err.message?.includes('محجوز مسبقاً');
      const statusCode = err.statusCode || (isConflict ? 409 : isForbidden ? 403 : isAuth ? 401 : 400);
      return res.status(statusCode).json({
        success: false,
        error: err.message || 'Booking reservation failed',
      });
    }
  });

  // 9f. Authoritative Dispute Workflow Gateways (V3-03 Remediation)
  app.post('/api/disputes/create', financialRateLimiter, async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      const caller = await requireAuthenticatedCaller(authHeader);
      const { orderId, subOrderId, sellerId, sellerName, storeId, reason, description, evidenceUrls, requestedAction } = req.body || {};

      if (!orderId || typeof orderId !== 'string') {
        return res.status(400).json({ success: false, error: 'orderId is required' });
      }
      if (!description || typeof description !== 'string' || !description.trim()) {
        return res.status(400).json({ success: false, error: 'description is required' });
      }

      const adminDb = getAdminDb();

      // Verify order exists and caller owns order
      const orderDoc = await adminDb.collection('orders').doc(orderId).get();
      if (!orderDoc.exists) {
        return res.status(404).json({ success: false, error: 'Referenced order not found' });
      }
      const orderData = orderDoc.data() || {};
      if (orderData.customerId !== caller.uid && !caller.isPlatformAdmin) {
        return res.status(403).json({ success: false, error: 'Forbidden: You can only open disputes for your own orders' });
      }

      // Check for active open disputes on this order
      const existingSnap = await adminDb
        .collection('disputes')
        .where('orderId', '==', orderId)
        .where('status', 'in', ['OPEN', 'SELLER_RESPONDED'])
        .get();
      if (!existingSnap.empty) {
        return res.status(409).json({ success: false, error: 'There is already an active dispute open for this order' });
      }

      const disputeId = `disp_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      const now = new Date().toISOString();
      const newDispute = {
        id: disputeId,
        orderId,
        subOrderId: subOrderId || null,
        customerId: caller.uid,
        customerName: orderData.customerName || caller.email || 'Customer',
        customerPhone: orderData.phone || null,
        sellerId: sellerId || (orderData.sellerIds && orderData.sellerIds[0]) || 'unknown_seller',
        sellerName: sellerName || 'Merchant',
        storeId: storeId || null,
        reason: reason || 'other',
        description: description.trim().slice(0, 2000),
        evidenceUrls: Array.isArray(evidenceUrls) ? evidenceUrls.slice(0, 5) : [],
        requestedAction: requestedAction || 'refund',
        status: 'OPEN',
        createdAt: now,
        updatedAt: now,
      };

      await adminDb.collection('disputes').doc(disputeId).set(newDispute);
      return res.status(200).json({ success: true, dispute: newDispute });
    } catch (err: any) {
      console.error('[API /api/disputes/create] Error:', err.message);
      const isForbidden = err.message?.includes('Forbidden');
      const isAuth = err.message?.includes('Authentication');
      const statusCode = isForbidden ? 403 : isAuth ? 401 : 400;
      return res.status(statusCode).json({
        success: false,
        error: err.message || 'Failed to create dispute',
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
      const disputeSnap = await disputeRef.get();
      if (!disputeSnap.exists) {
        return res.status(404).json({ success: false, error: 'Dispute not found' });
      }
      const dispute = disputeSnap.data() as any;

      if (!caller.isPlatformAdmin && caller.uid !== dispute.sellerId) {
        return res.status(403).json({ success: false, error: 'Forbidden: You can only respond to disputes against your own store' });
      }

      const now = new Date().toISOString();
      const updateData = {
        status: 'SELLER_RESPONDED',
        sellerResponse: {
          message: message.trim(),
          respondedAt: now,
          proposedAction: proposedAction || null,
        },
        updatedAt: now,
      };

      await disputeRef.update(updateData);
      return res.status(200).json({ success: true, dispute: { ...dispute, ...updateData } });
    } catch (err: any) {
      console.error('[API /api/disputes/respond] Error:', err.message);
      const isForbidden = err.message?.includes('Forbidden');
      const isAuth = err.message?.includes('Authentication');
      const statusCode = isForbidden ? 403 : isAuth ? 401 : 400;
      return res.status(statusCode).json({
        success: false,
        error: err.message || 'Failed to respond to dispute',
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

      const adminDb = getAdminDb();
      const disputeRef = adminDb.collection('disputes').doc(disputeId);
      const disputeSnap = await disputeRef.get();
      if (!disputeSnap.exists) {
        return res.status(404).json({ success: false, error: 'Dispute not found' });
      }
      const dispute = disputeSnap.data() as any;

      const now = new Date().toISOString();
      const finalStatus = actionTaken === 'REFUND_APPROVED' ? 'RESOLVED_REFUND' : 'RESOLVED_REJECTED';
      const resolution = {
        resolvedBy: caller.uid,
        actionTaken,
        resolutionNotes: (resolutionNotes || '').trim(),
        resolvedAt: now,
        refundAmount: Number(refundAmount) || 0,
      };

      await disputeRef.update({
        status: finalStatus,
        adminResolution: resolution,
        updatedAt: now,
      });

      if (actionTaken === 'REFUND_APPROVED' && dispute.orderId) {
        await adminDb.collection('orders').doc(dispute.orderId).update({
          refundStatus: 'approved',
          refundAmount: Number(refundAmount) || 0,
          updatedAt: now,
        }).catch(() => {});
      }

      return res.status(200).json({
        success: true,
        dispute: { ...dispute, status: finalStatus, adminResolution: resolution, updatedAt: now },
      });
    } catch (err: any) {
      console.error('[API /api/disputes/resolve] Error:', err.message);
      const isForbidden = err.message?.includes('Forbidden');
      const isAuth = err.message?.includes('Authentication');
      const statusCode = isForbidden ? 403 : isAuth ? 401 : 400;
      return res.status(statusCode).json({
        success: false,
        error: err.message || 'Failed to resolve dispute',
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
      const isForbidden = err.message?.includes('Forbidden') || err.message?.includes('غير مصرح');
      const isAuth = err.message?.includes('Authentication');
      const isConflict = err.message?.includes('terminal');
      const statusCode = err.statusCode || (isConflict ? 409 : isForbidden ? 403 : isAuth ? 401 : 400);
      return res.status(statusCode).json({
        success: false,
        error: err.message || 'Failed to review payout request',
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
      const isForbidden = err.message?.includes('Forbidden') || err.message?.includes('غير مصرح');
      const isAuth = err.message?.includes('Authentication');
      const statusCode = err.statusCode || (isForbidden ? 403 : isAuth ? 401 : 400);
      return res.status(statusCode).json({
        success: false,
        error: err.message || 'Failed to review subscription',
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
      const isForbidden = err.message?.includes('Forbidden');
      const isAuth = err.message?.includes('Authentication');
      const statusCode = isForbidden ? 403 : isAuth ? 401 : 400;
      return res.status(statusCode).json({
        success: false,
        error: err.message || 'Failed to record audit log',
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
      const eventDoc = {
        id: eventId,
        type: trimmedType,
        entityId: entityId ? String(entityId).slice(0, 100) : null,
        sellerId: sellerId ? String(sellerId).slice(0, 100) : null,
        metadata: sanitizedMetadata,
        ip: (req as any).rateLimitIdentity || 'anonymous',
        timestamp: new Date().toISOString(),
      };

      await adminDb.collection('analyticsEvents').doc(eventId).set(eventDoc);
      return res.status(200).json({ success: true, eventId });
    } catch (err: any) {
      console.error('[API /api/analytics/event] Error:', err.message);
      return res.status(400).json({ success: false, error: 'Failed to record analytics event' });
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
      if ((req as any).authenticatedUser) {
        const decoded = (req as any).authenticatedUser;
        caller = {
          uid: decoded.uid,
          email: decoded.email,
          emailVerified: decoded.email_verified === true,
          isPlatformAdmin: false,
          isSuperAdmin: false,
          token: decoded,
        };
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
      return res.status(200).json({ success: true, result });
    } catch (err: any) {
      console.error('[API /api/ai/execute-tool] Error:', err.message);
      const isForbidden = err.message?.includes('Forbidden');
      const isAuth = err.message?.includes('Authentication');
      const statusCode = isForbidden ? 403 : isAuth ? 401 : 400;
      return res.status(statusCode).json({
        success: false,
        error: err.message || 'Failed to execute tool policy',
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
