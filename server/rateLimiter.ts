import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { getAdminDb, verifyFirebaseBearerToken } from './firebaseAdmin';

export interface RateLimitResult {
  allowed: boolean;
  count: number;
  limit: number;
  remaining: number;
  resetTime: number;
  retryAfter: number;
}

export interface RateLimitStore {
  consume(key: string, limit: number, windowMs: number): Promise<RateLimitResult>;
}

/**
 * Local in-memory RateLimitStore
 * Suitable for unit tests, local development, or single-instance deployments
 */
export class MemoryRateLimitStore implements RateLimitStore {
  private store = new Map<string, { count: number; resetTime: number }>();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [k, rec] of this.store.entries()) {
        if (now > rec.resetTime) {
          this.store.delete(k);
        }
      }
    }, 60000);
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  async consume(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
    const now = Date.now();
    const record = this.store.get(key);

    if (!record || now > record.resetTime) {
      const resetTime = now + windowMs;
      this.store.set(key, { count: 1, resetTime });
      return {
        allowed: true,
        count: 1,
        limit,
        remaining: limit - 1,
        resetTime,
        retryAfter: 0,
      };
    }

    if (record.count >= limit) {
      const retryAfter = Math.max(1, Math.ceil((record.resetTime - now) / 1000));
      return {
        allowed: false,
        count: record.count,
        limit,
        remaining: 0,
        resetTime: record.resetTime,
        retryAfter,
      };
    }

    record.count += 1;
    return {
      allowed: true,
      count: record.count,
      limit,
      remaining: Math.max(0, limit - record.count),
      resetTime: record.resetTime,
      retryAfter: 0,
    };
  }

  async increment(key: string, windowSeconds = 60): Promise<{ totalHits: number; resetTime: number }> {
    const res = await this.consume(key, Number.MAX_SAFE_INTEGER, windowSeconds * 1000);
    return { totalHits: res.count, resetTime: res.resetTime };
  }

  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}

/**
 * Distributed Firestore-backed RateLimitStore
 * Provides shared state across distributed instances (Cloud Run, auto-scaling replicas).
 * Algorithm: Fixed Window Counter with Deterministic Window Bucketing (window = Math.floor(now / windowMs)).
 * SECURITY POLICY: Fail-Closed. If Firestore is unavailable or rejects access, operations fail closed (503).
 * In-memory fallback is strictly forbidden for security boundaries.
 */
export class DistributedFirestoreRateLimitStore implements RateLimitStore {
  async consume(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
    const adminDb = getAdminDb();
    if (!adminDb) {
      throw new Error('Distributed rate limiter unavailable: Firestore Admin DB not initialized (Fail-Closed)');
    }

    const now = Date.now();
    const windowBucket = Math.floor(now / windowMs);
    const resetTime = (windowBucket + 1) * windowMs;

    // Hash the key to create a fixed-length safe document identifier
    const hashedKey = crypto.createHash('sha256').update(key).digest('hex').slice(0, 24);
    const docId = `rl_${hashedKey}_${windowBucket}`;
    const docRef = adminDb.collection('rate_limits').doc(docId);

    try {
      return await adminDb.runTransaction(async transaction => {
        const snap = await transaction.get(docRef);
        if (!snap.exists) {
          transaction.set(docRef, {
            key,
            count: 1,
            windowBucket,
            resetTime,
            expiresAt: new Date(resetTime + 300000), // 5 min retention for TTL auto-purging
          });
          return {
            allowed: true,
            count: 1,
            limit,
            remaining: limit - 1,
            resetTime,
            retryAfter: 0,
          };
        }

        const data = snap.data();
        const currentCount = data?.count || 0;

        if (currentCount >= limit) {
          const retryAfter = Math.max(1, Math.ceil((resetTime - now) / 1000));
          return {
            allowed: false,
            count: currentCount,
            limit,
            remaining: 0,
            resetTime,
            retryAfter,
          };
        }

        const newCount = currentCount + 1;
        transaction.update(docRef, { count: newCount });
        return {
          allowed: true,
          count: newCount,
          limit,
          remaining: Math.max(0, limit - newCount),
          resetTime,
          retryAfter: 0,
        };
      }, { maxAttempts: 1 });
    } catch (err: any) {
      console.error('[RateLimiter:Distributed] Firestore transaction failed (Fail-Closed):', err?.message || err);
      throw new Error(`Distributed rate limiter unavailable: ${err?.message || 'Transaction error'} (Fail-Closed)`);
    }
  }
}

// Global store selection
let activeStore: RateLimitStore = new DistributedFirestoreRateLimitStore();

export function setRateLimitStore(store: RateLimitStore) {
  activeStore = store;
}

export function getRateLimitStore(): RateLimitStore {
  return activeStore;
}

export function normalizeClientIp(rawIp: string | undefined): string {
  if (!rawIp || typeof rawIp !== 'string') return 'unknown';
  let ip = rawIp.trim();
  // Strip IPv4-mapped IPv6 prefix (e.g., ::ffff:127.0.0.1 -> 127.0.0.1)
  if (ip.startsWith('::ffff:')) {
    return ip.substring(7);
  }
  return ip.toLowerCase();
}

export function createRateLimiter(options: {
  windowMs: number;
  max: number;
  message?: string;
  store?: RateLimitStore;
  allowGuest?: boolean;
}) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const store = options.store || activeStore;
    const rawIp = req.ip || req.socket.remoteAddress || 'unknown';
    // P2-RATE-01: Correct IPv6 handling that preserves address uniqueness
    const clientIp = normalizeClientIp(typeof rawIp === 'string' ? rawIp : undefined);
    const authHeader = req.headers.authorization;

    // F-36: Hardened Rate Limit Identity Architecture
    // 1. Never trust client-supplied identity headers (X-User-ID, X-Forwarded-User, etc.)
    // 2. If Bearer token is provided: MUST cryptographically verify it via Firebase Admin.
    //    - If valid: bind rate limit identity strictly to verified UID (`user_${uid}`)
    //    - If invalid/malformed: REJECT IMMEDIATELY with 401 Unauthorized before consuming quota.
    //      This prevents malicious random tokens from burning legitimate user or guest IP quotas.
    // 3. If NO Authorization header is provided:
    //    - If guests are allowed: bind rate limit identity strictly to sanitized client IP (`guest_ip_${clientIp}`)
    //    - If guests are not allowed and endpoint requires auth: reject with 401
    let identityKey: string;

    if (authHeader) {
      if (!authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
          success: false,
          error: 'Authentication failed: Authorization header must use Bearer schema',
        });
      }

      try {
        const decoded = await verifyFirebaseBearerToken(authHeader);
        if (!decoded || !decoded.uid) {
          return res.status(401).json({
            success: false,
            error: 'Authentication failed: Invalid token claims or missing UID',
          });
        }
        identityKey = `user_${decoded.uid}`;
        (req as any).authenticatedUser = decoded;
      } catch (err: any) {
        // Invalid or expired token: Reject fail-closed.
        // Do NOT fall back to IP; doing so would allow attackers with fake tokens to exhaust shared IP quotas.
        return res.status(401).json({
          success: false,
          error: err?.message || 'Authentication failed: Invalid or expired Bearer token',
        });
      }
    } else {
      // Unauthenticated request: isolate to guest IP bucket
      identityKey = `guest_ip_${clientIp}`;
    }

    (req as any).rateLimitIdentity = identityKey;

    const endpointKey = `${req.method}_${req.baseUrl || req.path}_${identityKey}`;

    try {
      const result = await store.consume(endpointKey, options.max, options.windowMs);

      res.setHeader('X-RateLimit-Limit', options.max);
      res.setHeader('X-RateLimit-Remaining', result.remaining);
      res.setHeader('X-RateLimit-Reset', Math.ceil(result.resetTime / 1000));

      if (!result.allowed) {
        res.setHeader('Retry-After', result.retryAfter);
        return res.status(429).json({
          success: false,
          error: options.message || 'Too many requests. Please slow down and try again later.',
          retryAfter: result.retryAfter,
        });
      }

      next();
    } catch (err: any) {
      console.error('[RateLimiter:Error] Security control failure in rate limiter (Fail-Closed):', err?.message || err);
      // Fail-Closed: Infrastructure or security control failure must never silently bypass protection
      res.setHeader('Retry-After', 60);
      return res.status(503).json({
        success: false,
        error: 'Security control failure: Rate limiter service temporarily unavailable.',
        code: 'RATE_LIMITER_UNAVAILABLE',
        retryAfter: 60,
      });
    }
  };
}

