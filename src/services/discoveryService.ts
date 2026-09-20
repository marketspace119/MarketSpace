import { Product, Store, LocalizedString } from '../types';
import { productService } from './productService';
import { storeService } from './storeService';
import { taxonomyService } from './taxonomyService';

export interface SearchFilters {
  query?: string;
  domain?: 'all' | 'products' | 'stores' | 'restaurants' | 'services' | 'offers' | 'ads';
  category?: string;
  condition?: 'all' | 'new' | 'used' | 'dropshipping';
  minPrice?: number;
  maxPrice?: number;
  minRating?: number;
  inStockOnly?: boolean;
  verifiedOnly?: boolean;
  city?: string;
  district?: string;
  sortBy?: 'relevance' | 'price-low' | 'price-high' | 'rating' | 'newest';
}

export interface SearchCounts {
  all: number;
  products: number;
  stores: number;
  restaurants: number;
  services: number;
  offers: number;
  ads: number;
}

export interface GroupedSearchResults {
  products: Product[];
  stores: Store[];
  restaurants: Store[];
  services: Product[];
  offers: Product[];
  ads: Product[];
  counts: SearchCounts;
  totalResults: number;
  hasFiltersApplied: boolean;
  suggestions: string[];
}

export interface AutocompleteItem {
  id: string;
  text: string;
  type: 'query' | 'product' | 'store' | 'restaurant' | 'service' | 'category';
  domain: string;
  subtitle?: string;
  image?: string;
  url: string;
}

export interface RecentlyViewedItem {
  id: string;
  type: 'product' | 'store' | 'restaurant' | 'service';
  slug: string;
  title: LocalizedString;
  image: string;
  price?: number;
  rating?: number;
  viewedAt: string;
}

const RECENT_SEARCHES_KEY = 'marketspace_recent_searches_v1';
const RECENTLY_VIEWED_KEY = 'marketspace_recently_viewed_v1';
const MAX_RECENT_SEARCHES = 10;
const MAX_RECENTLY_VIEWED = 12;

// List of supported cities and popular Somali districts for location-aware discovery
export const SOMALIA_CITIES = [
  { id: 'all', name: { ar: 'كل المدن', en: 'All Cities', so: 'Dhammaan Magaalooyinka' } },
  { id: 'Mogadishu', name: { ar: 'مقديشو', en: 'Mogadishu', so: 'Muqdisho' } },
  { id: 'Hargeisa', name: { ar: 'هرجيسا', en: 'Hargeisa', so: 'Hargeysa' } },
  { id: 'Garowe', name: { ar: 'غاروي', en: 'Garowe', so: 'Garoowe' } },
  { id: 'Bosaso', name: { ar: 'بوصاصو', en: 'Bosaso', so: 'Boosaaso' } },
  { id: 'Kismayo', name: { ar: 'كسمايو', en: 'Kismayo', so: 'Kismaayo' } },
];

export const MOGADISHU_DISTRICTS = [
  'All',
  'Hodan',
  'Wadajir',
  'Waberi',
  'Hamar Weyne',
  'Hamar Jajab',
  'Taleh',
  'KM4',
  'Heliwa',
  'Yaqshid',
  'Shibis',
  'Boondheere',
  'Kaxda',
  'Daynile',
  'Dharkenley',
];

/**
 * Deterministic Relevance Score Calculator
 * Calculates an exact, transparent relevance score without fake AI or random numbers.
 */
function calculateRelevanceScore(
  textToSearch: {
    title: string;
    description?: string;
    category?: string;
    brand?: string;
    tags?: string[];
    city?: string;
    district?: string;
    isVerified?: boolean;
    rating?: number;
    stock?: number;
  },
  queryWords: string[]
): number {
  if (queryWords.length === 0) return 10;

  let score = 0;
  const titleLower = textToSearch.title.toLowerCase();
  const descLower = (textToSearch.description || '').toLowerCase();
  const categoryLower = (textToSearch.category || '').toLowerCase();
  const brandLower = (textToSearch.brand || '').toLowerCase();
  const tagsStr = (textToSearch.tags || []).join(' ').toLowerCase();
  const fullQuery = queryWords.join(' ').toLowerCase();

  // 1. Exact match on full query
  if (titleLower === fullQuery) {
    score += 150;
  } else if (titleLower.startsWith(fullQuery)) {
    score += 80;
  } else if (titleLower.includes(fullQuery)) {
    score += 50;
  }

  // 2. Individual query words match
  for (const word of queryWords) {
    if (!word) continue;
    if (titleLower.includes(word)) {
      score += 30;
      // Word boundary match
      if (new RegExp(`\\b${word}\\b`, 'i').test(titleLower)) {
        score += 15;
      }
    }
    if (brandLower.includes(word)) {
      score += 25;
    }
    if (categoryLower.includes(word)) {
      score += 20;
    }
    if (tagsStr.includes(word)) {
      score += 15;
    }
    if (descLower.includes(word)) {
      score += 8;
    }
  }

  // 3. Quality & Authenticity Boosts (Deterministic)
  if (textToSearch.isVerified) {
    score += 10;
  }
  if (textToSearch.rating && textToSearch.rating >= 4.5) {
    score += Math.round(textToSearch.rating * 2);
  }
  if (typeof textToSearch.stock === 'number' && textToSearch.stock > 0) {
    score += 5;
  }

  return score;
}

export const discoveryService = {
  /**
   * Universal search across all MarketSpace domains with deterministic scoring
   */
  search(filters: SearchFilters = {}, currentLanguage: 'ar' | 'en' | 'so' = 'ar'): GroupedSearchResults {
    const q = (filters.query || '').trim().toLowerCase();
    const queryWords = q.split(/\s+/).filter(w => w.length > 0);
    const domain = filters.domain || 'all';

    const allProducts = productService.getAllProducts({ onlyPublished: true });
    const allApprovedStores = storeService.getAllStores({ status: 'approved' });

    // Separate entities
    const rawProducts: { item: Product; score: number }[] = [];
    const rawStores: { item: Store; score: number }[] = [];
    const rawRestaurants: { item: Store; score: number }[] = [];
    const rawServices: { item: Product; score: number }[] = [];
    const rawOffers: { item: Product; score: number }[] = [];
    const rawAds: { item: Product; score: number }[] = [];

    // Helper: Check location match
    const matchesLocation = (city?: string, district?: string): boolean => {
      if (filters.city && filters.city !== 'all') {
        if (!city || city.toLowerCase() !== filters.city.toLowerCase()) return false;
      }
      if (filters.district && filters.district !== 'All') {
        if (!district || district.toLowerCase() !== filters.district.toLowerCase()) return false;
      }
      return true;
    };

    // Helper: Check common price/rating/stock
    const matchesProductCommon = (p: Product): boolean => {
      if (filters.minPrice !== undefined && p.price < filters.minPrice) return false;
      if (filters.maxPrice !== undefined && p.price > filters.maxPrice) return false;
      if (filters.minRating !== undefined && p.rating < filters.minRating) return false;
      if (filters.inStockOnly && p.stock !== undefined && p.stock <= 0) return false;
      return true;
    };

    // 1. Process Stores & Restaurants
    for (const store of allApprovedStores) {
      const isRestaurant = store.sellerType === 'restaurant';
      const storeName = store.name;
      const storeDesc = store.description[currentLanguage] || store.description.en || '';
      const storeCategories = store.categories || [store.category];

      if (!matchesLocation(store.city, store.district)) continue;
      if (filters.verifiedOnly && !store.isVerified) continue;
      if (filters.minRating !== undefined && store.rating < filters.minRating) continue;

      if (filters.category && filters.category !== 'all') {
        const catMatch =
          store.category.toLowerCase() === filters.category.toLowerCase() ||
          storeCategories.some(c => c.toLowerCase() === filters.category!.toLowerCase());
        if (!catMatch) continue;
      }

      const score = calculateRelevanceScore(
        {
          title: storeName,
          description: storeDesc,
          category: store.category,
          isVerified: store.isVerified,
          rating: store.rating,
        },
        queryWords
      );

      // If query exists, score must be > 10 (at least one match)
      if (queryWords.length > 0 && score <= 10) continue;

      if (isRestaurant) {
        rawRestaurants.push({ item: store, score });
      } else if (store.sellerType === 'store' || store.sellerType === 'classified') {
        rawStores.push({ item: store, score });
      }
    }

    // 2. Process Products (Shop, Services, Ads, Offers)
    for (const p of allProducts) {
      const classification = taxonomyService.classify(p);
      const title = p.title[currentLanguage] || p.title.en;
      const desc = p.description[currentLanguage] || p.description.en;

      if (!matchesProductCommon(p)) continue;

      // Category filter
      if (filters.category && filters.category !== 'all') {
        const catMatch =
          p.category.toLowerCase() === filters.category.toLowerCase() ||
          (p.categories && p.categories.some(c => c.toLowerCase() === filters.category!.toLowerCase()));
        if (!catMatch) continue;
      }

      // Location match via seller if available
      if (p.seller?.location) {
        const loc = (p.seller.location[currentLanguage] || p.seller.location.en || '').toLowerCase();
        if (filters.city && filters.city !== 'all' && !loc.includes(filters.city.toLowerCase())) continue;
        if (filters.district && filters.district !== 'All' && !loc.includes(filters.district.toLowerCase())) continue;
      }

      const score = calculateRelevanceScore(
        {
          title,
          description: desc,
          category: p.category,
          brand: p.brand,
          tags: p.tags,
          rating: p.rating,
          stock: p.stock,
        },
        queryWords
      );

      if (queryWords.length > 0 && score <= 10) continue;

      // Classify into specific domains
      if (p.type === 'ads') {
        rawAds.push({ item: p, score });
      } else if (p.type === 'services') {
        rawServices.push({ item: p, score });
      } else if (classification.isOffer) {
        rawOffers.push({ item: p, score });
        // Also allow offers into general products if condition matches
        if (
          !filters.condition ||
          filters.condition === 'all' ||
          classification.productCondition === filters.condition
        ) {
          rawProducts.push({ item: p, score });
        }
      } else {
        // Standard Shop Products
        if (
          !filters.condition ||
          filters.condition === 'all' ||
          classification.productCondition === filters.condition
        ) {
          rawProducts.push({ item: p, score });
        }
      }
    }

    // Sorting Helper
    const sortList = <T extends { score: number; item: any }>(list: T[]): T[] => {
      const sortBy = filters.sortBy || 'relevance';
      return [...list].sort((a, b) => {
        if (sortBy === 'price-low') {
          return (a.item.price || 0) - (b.item.price || 0);
        }
        if (sortBy === 'price-high') {
          return (b.item.price || 0) - (a.item.price || 0);
        }
        if (sortBy === 'rating') {
          return (b.item.rating || 0) - (a.item.rating || 0);
        }
        if (sortBy === 'newest') {
          const dateA = new Date(a.item.createdAt || 0).getTime();
          const dateB = new Date(b.item.createdAt || 0).getTime();
          return dateB - dateA;
        }
        // Default: Relevance score
        return b.score - a.score;
      });
    };

    const sortedProducts = sortList(rawProducts).map(r => r.item);
    const sortedStores = sortList(rawStores).map(r => r.item);
    const sortedRestaurants = sortList(rawRestaurants).map(r => r.item);
    const sortedServices = sortList(rawServices).map(r => r.item);
    const sortedOffers = sortList(rawOffers).map(r => r.item);
    const sortedAds = sortList(rawAds).map(r => r.item);

    const counts: SearchCounts = {
      all:
        sortedProducts.length +
        sortedStores.length +
        sortedRestaurants.length +
        sortedServices.length +
        sortedAds.length,
      products: sortedProducts.length,
      stores: sortedStores.length,
      restaurants: sortedRestaurants.length,
      services: sortedServices.length,
      offers: sortedOffers.length,
      ads: sortedAds.length,
    };

    const totalResults =
      domain === 'all'
        ? counts.all
        : domain === 'products'
        ? counts.products
        : domain === 'stores'
        ? counts.stores
        : domain === 'restaurants'
        ? counts.restaurants
        : domain === 'services'
        ? counts.services
        : domain === 'offers'
        ? counts.offers
        : counts.ads;

    const hasFiltersApplied = Boolean(
      (filters.category && filters.category !== 'all') ||
      (filters.condition && filters.condition !== 'all') ||
      filters.minPrice !== undefined ||
      filters.maxPrice !== undefined ||
      filters.minRating !== undefined ||
      filters.inStockOnly ||
      filters.verifiedOnly ||
      (filters.city && filters.city !== 'all') ||
      (filters.district && filters.district !== 'All') ||
      (filters.sortBy && filters.sortBy !== 'relevance')
    );

    // Alternative suggestions if zero results
    const suggestions: string[] = [];
    if (totalResults === 0 && q) {
      suggestions.push('iPhone', 'Burger', 'Samsung', 'Perfume', 'Laptop', 'Kismayo', 'Mogadishu');
    }

    return {
      products: sortedProducts,
      stores: sortedStores,
      restaurants: sortedRestaurants,
      services: sortedServices,
      offers: sortedOffers,
      ads: sortedAds,
      counts,
      totalResults,
      hasFiltersApplied,
      suggestions,
    };
  },

  /**
   * Fast autocomplete suggestions for live search inputs
   */
  getAutocompleteSuggestions(query: string, currentLanguage: 'ar' | 'en' | 'so' = 'ar'): AutocompleteItem[] {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    const results: AutocompleteItem[] = [];
    const addedKeys = new Set<string>();

    const allProducts = productService.getAllProducts({ onlyPublished: true });
    const allStores = storeService.getAllStores({ status: 'approved' });

    // 1. Direct Stores and Restaurants matches
    for (const s of allStores) {
      if (s.name.toLowerCase().includes(q)) {
        const isRestaurant = s.sellerType === 'restaurant';
        results.push({
          id: s.id,
          text: s.name,
          type: isRestaurant ? 'restaurant' : 'store',
          domain: isRestaurant ? 'restaurants' : 'stores',
          subtitle: s.district ? `${s.city} • ${s.district}` : s.city,
          image: s.logo,
          url: isRestaurant ? `/restaurant/${s.slug}` : `/store/${s.slug}`,
        });
        addedKeys.add(s.name.toLowerCase());
        if (results.length >= 8) return results;
      }
    }

    // 2. Direct Products and Services matches
    for (const p of allProducts) {
      const title = p.title[currentLanguage] || p.title.en;
      if (title.toLowerCase().includes(q) && !addedKeys.has(title.toLowerCase())) {
        const isService = p.type === 'services';
        results.push({
          id: p.id,
          text: title,
          type: isService ? 'service' : 'product',
          domain: isService ? 'services' : 'shop',
          subtitle: `$${p.price.toFixed(2)}`,
          image: p.thumbnail || p.images[0],
          url: `/product/${p.slug}`,
        });
        addedKeys.add(title.toLowerCase());
        if (results.length >= 8) return results;
      }
    }

    // 3. Category suggestions
    const domains = taxonomyService.getDomains();
    for (const d of domains) {
      const dName = d.name[currentLanguage] || d.name.en;
      if (dName.toLowerCase().includes(q) && !addedKeys.has(dName.toLowerCase())) {
        results.push({
          id: d.id,
          text: dName,
          type: 'category',
          domain: d.id,
          subtitle: currentLanguage === 'ar' ? 'قسم رئيسي' : 'Main Section',
          url: d.path,
        });
        addedKeys.add(dName.toLowerCase());
        if (results.length >= 8) return results;
      }
    }

    return results;
  },

  /**
   * Search History Persistence
   */
  getRecentSearches(): string[] {
    if (typeof window === 'undefined') return [];
    try {
      const raw = localStorage.getItem(RECENT_SEARCHES_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },

  recordSearch(query: string) {
    if (!query || !query.trim() || typeof window === 'undefined') return;
    try {
      const clean = query.trim();
      const current = this.getRecentSearches().filter(q => q.toLowerCase() !== clean.toLowerCase());
      const updated = [clean, ...current].slice(0, MAX_RECENT_SEARCHES);
      localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
    } catch (e) {
      console.warn('Could not save recent search:', e);
    }
  },

  removeRecentSearch(query: string) {
    if (typeof window === 'undefined') return;
    try {
      const current = this.getRecentSearches().filter(q => q !== query);
      localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(current));
    } catch (e) {
      console.warn('Could not remove recent search:', e);
    }
  },

  clearRecentSearches() {
    if (typeof window === 'undefined') return;
    try {
      localStorage.removeItem(RECENT_SEARCHES_KEY);
    } catch (e) {
      console.warn('Could not clear recent searches:', e);
    }
  },

  /**
   * Recently Viewed Products & Stores Persistence
   */
  getRecentlyViewed(): RecentlyViewedItem[] {
    if (typeof window === 'undefined') return [];
    try {
      const raw = localStorage.getItem(RECENTLY_VIEWED_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },

  recordView(item: Omit<RecentlyViewedItem, 'viewedAt'>) {
    if (!item.id || typeof window === 'undefined') return;
    try {
      const current = this.getRecentlyViewed().filter(v => v.id !== item.id);
      const updated: RecentlyViewedItem[] = [
        { ...item, viewedAt: new Date().toISOString() },
        ...current,
      ].slice(0, MAX_RECENTLY_VIEWED);
      localStorage.setItem(RECENTLY_VIEWED_KEY, JSON.stringify(updated));
    } catch (e) {
      console.warn('Could not save recently viewed item:', e);
    }
  },

  clearRecentlyViewed() {
    if (typeof window === 'undefined') return;
    try {
      localStorage.removeItem(RECENTLY_VIEWED_KEY);
    } catch (e) {
      console.warn('Could not clear recently viewed:', e);
    }
  },
};
