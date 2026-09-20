import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { getAdminDb } from './firebaseAdmin';

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

  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}

/**
 * Distributed Firestore-backed RateLimitStore
 * Provides shared state across distributed instances (Cloud Run, auto-scaling replicas)
 * Uses window bucketing to prevent document contention and hot-spots.
 */
export class DistributedFirestoreRateLimitStore implements RateLimitStore {
  private fallbackMemory = new MemoryRateLimitStore();
  private hasPermissionError = false;

  async consume(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
    if (this.hasPermissionError) {
      return this.fallbackMemory.consume(key, limit, windowMs);
    }

    let adminDb;
    try {
      adminDb = getAdminDb();
    } catch {
      // Fallback to in-memory store if adminDb is unconfigured or in offline test environment
      return this.fallbackMemory.consume(key, limit, windowMs);
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
      });
    } catch (err: any) {
      if (
        err?.code === 7 ||
        err?.message?.includes('PERMISSION_DENIED') ||
        err?.message?.includes('insufficient permissions') ||
        err?.message?.includes('Could not load the default credentials')
      ) {
        this.hasPermissionError = true;
      }
      console.warn('[RateLimiter:DistributedFallback] Firestore limiter error, falling back to local memory:', err.message);
      return this.fallbackMemory.consume(key, limit, windowMs);
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

export function createRateLimiter(options: {
  windowMs: number;
  max: number;
  message?: string;
  store?: RateLimitStore;
}) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const store = options.store || activeStore;
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const authHeader = req.headers.authorization;
    const clientKey = authHeader ? `auth_${authHeader.slice(-16)}` : `ip_${ip}`;
    const endpointKey = `${req.method}_${req.baseUrl || req.path}_${clientKey}`;

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
      console.error('[RateLimiter:Error] Security control failure in rate limiter:', err);
      // Fail-Closed: Infrastructure or security control failure must never silently bypass protection
      return res.status(503).json({
        success: false,
        error: 'Security control failure: Rate limiter service temporarily unavailable.',
        code: 'RATE_LIMITER_UNAVAILABLE',
      });
    }
  };
}

