import { doc, getDocs, collection, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { AnalyticsEvent, AnalyticsEventType } from '../types';

const EVENTS_STORAGE_KEY = 'marketspace_analytics_events_v1';
const EVENTS_COLLECTION = 'analyticsEvents';
const SESSION_STORAGE_KEY = 'marketspace_anon_session_id';

function getSessionId(): string {
  if (typeof window === 'undefined') return 'server_session';
  let sid = sessionStorage.getItem(SESSION_STORAGE_KEY);
  if (!sid) {
    sid = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    sessionStorage.setItem(SESSION_STORAGE_KEY, sid);
  }
  return sid;
}

// In-memory debounce cache to prevent duplicate views in 5 minutes
const recentEventCache = new Map<string, number>();

let memoryEvents: AnalyticsEvent[] = [];

function loadEvents(): AnalyticsEvent[] {
  if (memoryEvents.length > 0) return memoryEvents;
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(EVENTS_STORAGE_KEY);
    memoryEvents = raw ? JSON.parse(raw) : [];
    return memoryEvents;
  } catch {
    return [];
  }
}

function persistEvents(events: AnalyticsEvent[]) {
  // Cap client-side cache to recent 1000 events to conserve memory
  const trimmed = events.slice(0, 1000);
  memoryEvents = trimmed;
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(EVENTS_STORAGE_KEY, JSON.stringify(trimmed));
  } catch (err) {
    console.error('Failed to save analytics events', err);
  }
}

export const analyticsService = {
  async syncWithFirestore(): Promise<void> {
    try {
      const snap = await getDocs(collection(db, EVENTS_COLLECTION));
      if (!snap.empty) {
        const cloudEvents: AnalyticsEvent[] = [];
        snap.forEach(d => cloudEvents.push(d.data() as AnalyticsEvent));
        persistEvents(cloudEvents);
      }
    } catch (err) {
      console.warn('Analytics sync offline:', err);
    }
  },

  /**
   * Tracks an analytics event with anti-abuse deduplication
   */
  async trackEvent(params: {
    type: AnalyticsEventType;
    targetType: AnalyticsEvent['targetType'];
    targetId: string;
    sellerId?: string;
    currentUserId?: string;
    metadata?: Record<string, any>;
  }): Promise<void> {
    // 1. Anti-abuse: Ignore seller viewing their own products or store
    if (params.sellerId && params.currentUserId && params.sellerId === params.currentUserId) {
      return;
    }

    const sessionId = getSessionId();
    const dedupeKey = `${params.type}_${params.targetType}_${params.targetId}_${sessionId}`;
    const now = Date.now();
    const lastTime = recentEventCache.get(dedupeKey);

    // 2. Anti-abuse: Deduplicate rapid duplicate events (5 minutes window)
    if (lastTime && now - lastTime < 5 * 60 * 1000) {
      return;
    }
    recentEventCache.set(dedupeKey, now);

    const event: AnalyticsEvent = {
      id: `EVT-${now}-${Math.floor(100 + Math.random() * 900)}`,
      type: params.type,
      targetType: params.targetType,
      targetId: params.targetId,
      sellerId: params.sellerId,
      sessionId,
      timestamp: new Date(now).toISOString(),
      metadata: params.metadata,
    };

    const events = loadEvents();
    events.unshift(event);
    persistEvents(events);

    try {
      await setDoc(doc(db, EVENTS_COLLECTION, event.id), event);
    } catch {
      // Fire-and-forget
    }
  },

  /**
   * Real calculated metrics for a specific target (ad campaign, promotion, or product)
   */
  getTargetMetrics(targetId: string): {
    impressions: number;
    clicks: number;
    ctr: number;
    views: number;
  } {
    const events = loadEvents();
    let impressions = 0;
    let clicks = 0;
    let views = 0;

    for (const e of events) {
      if (e.targetId === targetId) {
        if (e.type === 'AD_IMPRESSION' || e.type === 'PROMOTION_VIEW') impressions++;
        if (e.type === 'AD_CLICK' || e.type === 'PROMOTION_CLICK') clicks++;
        if (e.type === 'PRODUCT_VIEW' || e.type === 'STORE_VIEW') views++;
      }
    }

    const ctr = impressions > 0 ? Number(((clicks / impressions) * 100).toFixed(2)) : 0;
    return { impressions, clicks, ctr, views };
  },

  /**
   * Real calculated metrics for a seller
   */
  getSellerMetrics(sellerId: string): {
    productViews: number;
    storeViews: number;
    promotionClicks: number;
    promotionImpressions: number;
  } {
    const events = loadEvents();
    let productViews = 0;
    let storeViews = 0;
    let promotionClicks = 0;
    let promotionImpressions = 0;

    for (const e of events) {
      if (e.sellerId === sellerId) {
        if (e.type === 'PRODUCT_VIEW') productViews++;
        if (e.type === 'STORE_VIEW') storeViews++;
        if (e.type === 'PROMOTION_CLICK') promotionClicks++;
        if (e.type === 'PROMOTION_VIEW') promotionImpressions++;
      }
    }

    return { productViews, storeViews, promotionClicks, promotionImpressions };
  },
};
