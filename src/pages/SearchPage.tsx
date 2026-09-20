import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Search,
  SlidersHorizontal,
  Star,
  CheckCircle2,
  X,
  RotateCcw,
  Sparkles,
  ShoppingBag,
  Store as StoreIcon,
  UtensilsCrossed,
  Wrench,
  Flame,
  Megaphone,
  MapPin,
  ChevronRight,
  ArrowRight,
  Filter,
} from 'lucide-react';
import { Product, Store } from '../types';
import { useLanguage } from '../i18n/LanguageContext';
import { ProductCard } from '../components/common/ProductCard';
import { StoreCard } from '../components/common/StoreCard';
import { RestaurantCard } from '../components/common/RestaurantCard';
import { ServiceCard } from '../components/common/ServiceCard';
import { OfferCard } from '../components/common/OfferCard';
import { AutocompleteSearch } from '../components/common/AutocompleteSearch';
import {
  discoveryService,
  SearchFilters,
  SOMALIA_CITIES,
  MOGADISHU_DISTRICTS,
} from '../services/discoveryService';
import { updatePageSEO } from '../services/seo';

interface SearchPageProps {
  initialQuery?: string;
  onNavigate: (path: string) => void;
  onQuickView: (product: Product) => void;
}

export const SearchPage: React.FC<SearchPageProps> = ({
  initialQuery = '',
  onNavigate,
  onQuickView,
}) => {
  const { language, t, isRTL } = useLanguage();

  // Parse initial query params from hash URL
  const parseUrlParams = useCallback((): SearchFilters => {
    if (typeof window === 'undefined') return { query: initialQuery };
    const hash = window.location.hash || '';
    const queryPart = hash.includes('?') ? hash.split('?')[1] : '';
    const params = new URLSearchParams(queryPart);

    return {
      query: params.get('q') || initialQuery || '',
      domain: (params.get('domain') as any) || 'all',
      category: params.get('category') || undefined,
      condition: (params.get('condition') as any) || 'all',
      minPrice: params.get('minPrice') ? Number(params.get('minPrice')) : undefined,
      maxPrice: params.get('maxPrice') ? Number(params.get('maxPrice')) : undefined,
      minRating: params.get('minRating') ? Number(params.get('minRating')) : undefined,
      inStockOnly: params.get('inStock') === 'true',
      verifiedOnly: params.get('verified') === 'true',
      city: params.get('city') || 'all',
      district: params.get('district') || 'All',
      sortBy: (params.get('sort') as any) || 'relevance',
    };
  }, [initialQuery]);

  const [filters, setFilters] = useState<SearchFilters>(parseUrlParams);
  const [isMobileFilterOpen, setIsMobileFilterOpen] = useState(false);

  // Sync state back to URL query parameters when filters change
  useEffect(() => {
    const params = new URLSearchParams();
    if (filters.query) params.set('q', filters.query);
    if (filters.domain && filters.domain !== 'all') params.set('domain', filters.domain);
    if (filters.category && filters.category !== 'all') params.set('category', filters.category);
    if (filters.condition && filters.condition !== 'all') params.set('condition', filters.condition);
    if (filters.minPrice !== undefined) params.set('minPrice', String(filters.minPrice));
    if (filters.maxPrice !== undefined) params.set('maxPrice', String(filters.maxPrice));
    if (filters.minRating !== undefined) params.set('minRating', String(filters.minRating));
    if (filters.inStockOnly) params.set('inStock', 'true');
    if (filters.verifiedOnly) params.set('verified', 'true');
    if (filters.city && filters.city !== 'all') params.set('city', filters.city);
    if (filters.district && filters.district !== 'All') params.set('district', filters.district);
    if (filters.sortBy && filters.sortBy !== 'relevance') params.set('sort', filters.sortBy);

    const queryString = params.toString();
    const newHash = `#search${queryString ? `?${queryString}` : ''}`;
    if (window.location.hash !== newHash) {
      window.history.replaceState(null, '', newHash);
    }
  }, [filters]);

  // Execute search via discoveryService
  const searchResults = useMemo(() => {
    return discoveryService.search(filters, language);
  }, [filters, language]);

  // Update SEO
  useEffect(() => {
    const qStr = filters.query ? `"${filters.query}"` : '';
    updatePageSEO({
      title: `${t('searchResults')} ${qStr} | MarketSpace`,
      description: `تصفح نتائج البحث عن ${qStr} عبر المتاجر والمطاعم والمنتجات والخدمات في الصومال`,
      type: 'website',
      breadcrumbs: [
        { name: t('home'), url: '/' },
        { name: t('search'), url: '#search' },
      ],
      language,
    });
  }, [filters.query, language, t]);

  const handleQueryChange = (newQuery: string) => {
    setFilters(prev => ({ ...prev, query: newQuery }));
  };

  const handleDomainChange = (domain: SearchFilters['domain']) => {
    setFilters(prev => ({ ...prev, domain }));
  };

  const handleClearFilters = () => {
    setFilters({
      query: filters.query,
      domain: 'all',
      condition: 'all',
      sortBy: 'relevance',
      city: 'all',
      district: 'All',
    });
  };

  const domainTabs = [
    { id: 'all', label: t('allResults'), icon: <Sparkles className="w-3.5 h-3.5" />, count: searchResults.counts.all },
    { id: 'products', label: t('shop'), icon: <ShoppingBag className="w-3.5 h-3.5" />, count: searchResults.counts.products },
    { id: 'stores', label: t('stores'), icon: <StoreIcon className="w-3.5 h-3.5" />, count: searchResults.counts.stores },
    { id: 'restaurants', label: t('restaurants'), icon: <UtensilsCrossed className="w-3.5 h-3.5" />, count: searchResults.counts.restaurants },
    { id: 'services', label: t('services'), icon: <Wrench className="w-3.5 h-3.5" />, count: searchResults.counts.services },
    { id: 'offers', label: t('offers'), icon: <Flame className="w-3.5 h-3.5 text-rose-500" />, count: searchResults.counts.offers },
    { id: 'ads', label: t('ads'), icon: <Megaphone className="w-3.5 h-3.5 text-amber-500" />, count: searchResults.counts.ads },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6 animate-fadeIn">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
        <button onClick={() => onNavigate('/')} className="hover:text-[#0E11B7] dark:hover:text-[#3B82F6]">
          {t('home')}
        </button>
        <ChevronRight className="w-3.5 h-3.5 rtl:rotate-180 text-gray-400" />
        <span className="font-bold text-gray-900 dark:text-white">
          {t('search')}
        </span>
        {filters.query && (
          <>
            <ChevronRight className="w-3.5 h-3.5 rtl:rotate-180 text-gray-400" />
            <span className="text-gray-500 truncate max-w-xs">
              "{filters.query}"
            </span>
          </>
        )}
      </nav>

      {/* Search Header Banner */}
      <div className="p-6 sm:p-8 rounded-3xl bg-white dark:bg-[#151A23] border border-gray-200 dark:border-[#293142] shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-bold text-[#0E11B7] dark:text-[#3B82F6] mb-1">
              <Search className="w-3.5 h-3.5" />
              <span>{t('discoveryEngine')}</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white">
              {filters.query ? (
                <>
                  <span>{t('showingResultsFor')} </span>
                  <span className="text-[#0E11B7] dark:text-[#3B82F6]">"{filters.query}"</span>
                </>
              ) : (
                t('searchResults')
              )}
            </h1>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {searchResults.totalResults} {t('resultsFound')} {filters.domain && filters.domain !== 'all' ? `(${filters.domain})` : ''}
            </p>
          </div>

          {/* Sort Dropdown */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-gray-500 whitespace-nowrap">{t('sortBy')}:</span>
            <select
              aria-label={t('sortBy')}
              value={filters.sortBy || 'relevance'}
              onChange={e => setFilters(prev => ({ ...prev, sortBy: e.target.value as any }))}
              className="h-10 px-3 text-xs font-bold rounded-xl border border-gray-200 dark:border-[#293142] bg-gray-50 dark:bg-[#111722] text-gray-800 dark:text-gray-200 focus:outline-none focus:border-[#0E11B7]"
            >
              <option value="relevance">{t('relevanceScore')}</option>
              <option value="price-low">{t('sortPriceLow')}</option>
              <option value="price-high">{t('sortPriceHigh')}</option>
              <option value="rating">{t('sortRating')}</option>
              <option value="newest">{t('sortLatest')}</option>
            </select>

            {/* Mobile Filter Toggle Button */}
            <button
              type="button"
              onClick={() => setIsMobileFilterOpen(!isMobileFilterOpen)}
              className="lg:hidden h-10 px-3 rounded-xl border border-gray-200 dark:border-[#293142] bg-gray-50 dark:bg-[#111722] text-xs font-bold text-gray-700 dark:text-gray-300 flex items-center gap-1.5"
            >
              <Filter className="w-3.5 h-3.5 text-[#0E11B7]" />
              <span>{t('filterByPrice')}</span>
              {searchResults.hasFiltersApplied && (
                <span className="w-2 h-2 rounded-full bg-[#0E11B7]" />
              )}
            </button>
          </div>
        </div>

        {/* Global Autocomplete Search Input */}
        <div className="max-w-3xl">
          <AutocompleteSearch
            initialValue={filters.query || ''}
            onSearchSubmit={handleQueryChange}
            onNavigateDirect={path => onNavigate(path)}
            placeholder={t('searchPlaceholder')}
          />
        </div>

        {/* Domain Selection Tabs with Counters */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none pt-1">
          {domainTabs.map(tab => {
            const isActive = (filters.domain || 'all') === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleDomainChange(tab.id as any)}
                className={`inline-flex items-center gap-2 py-2 px-4 rounded-full text-xs font-bold whitespace-nowrap transition-all ${
                  isActive
                    ? 'bg-[#0E11B7] text-white shadow-md shadow-blue-900/20'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                    isActive
                      ? 'bg-white/20 text-white'
                      : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Active Applied Filters Chips */}
        {searchResults.hasFiltersApplied && (
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-gray-100 dark:border-gray-800 text-xs">
            <span className="text-gray-400 font-bold">{t('filterByPrice')}:</span>

            {filters.condition && filters.condition !== 'all' && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-50 dark:bg-blue-950/40 text-[#0E11B7] dark:text-[#3B82F6] font-bold">
                <span>
                  {filters.condition === 'new'
                    ? t('conditionNew')
                    : filters.condition === 'used'
                    ? t('conditionUsed')
                    : t('conditionDropshipping')}
                </span>
                <button
                  type="button"
                  onClick={() => setFilters(prev => ({ ...prev, condition: 'all' }))}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            {filters.minRating && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 font-bold">
                <Star className="w-3 h-3 fill-current" />
                <span>{filters.minRating}+</span>
                <button
                  type="button"
                  onClick={() => setFilters(prev => ({ ...prev, minRating: undefined }))}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            {filters.inStockOnly && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 font-bold">
                <span>{t('inStockOnly')}</span>
                <button
                  type="button"
                  onClick={() => setFilters(prev => ({ ...prev, inStockOnly: false }))}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            {filters.verifiedOnly && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 font-bold">
                <CheckCircle2 className="w-3 h-3" />
                <span>{t('verifiedOnly')}</span>
                <button
                  type="button"
                  onClick={() => setFilters(prev => ({ ...prev, verifiedOnly: false }))}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            {filters.city && filters.city !== 'all' && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-400 font-bold">
                <MapPin className="w-3 h-3" />
                <span>{filters.city}</span>
                <button
                  type="button"
                  onClick={() => setFilters(prev => ({ ...prev, city: 'all' }))}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            {filters.district && filters.district !== 'All' && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-400 font-bold">
                <span>{filters.district}</span>
                <button
                  type="button"
                  onClick={() => setFilters(prev => ({ ...prev, district: 'All' }))}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            <button
              type="button"
              onClick={handleClearFilters}
              className="text-rose-500 hover:underline font-bold flex items-center gap-1 ms-2"
            >
              <RotateCcw className="w-3 h-3" />
              <span>{t('clearAllFilters')}</span>
            </button>
          </div>
        )}
      </div>

      {/* Main Content Layout: Filters Sidebar + Results */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left Filter Panel (Desktop & Collapsible Mobile) */}
        <div
          className={`${
            isMobileFilterOpen ? 'block' : 'hidden'
          } lg:block lg:col-span-1 space-y-4`}
        >
          <div className="p-5 rounded-3xl bg-white dark:bg-[#151A23] border border-gray-200 dark:border-[#293142] shadow-xs space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="font-black text-sm text-gray-900 dark:text-white flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-[#0E11B7]" />
                <span>{t('filterByPrice')}</span>
              </h3>
              {searchResults.hasFiltersApplied && (
                <button
                  type="button"
                  onClick={handleClearFilters}
                  className="text-[11px] font-bold text-rose-500 hover:underline"
                >
                  {t('clearFilters')}
                </button>
              )}
            </div>

            {/* 1. Condition Filter (Shop Domain) */}
            {(filters.domain === 'all' || filters.domain === 'products') && (
              <div className="space-y-2 pt-2 border-t border-gray-100 dark:border-gray-800">
                <label className="text-xs font-black text-gray-800 dark:text-gray-200 block">
                  {t('filterByCondition')}
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    { id: 'all', label: t('allConditions') },
                    { id: 'new', label: t('conditionNew') },
                    { id: 'used', label: t('conditionUsed') },
                    { id: 'dropshipping', label: t('conditionDropshipping') },
                  ].map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setFilters(prev => ({ ...prev, condition: c.id as any }))}
                      className={`py-1.5 px-2.5 rounded-xl text-[11px] font-bold text-center transition-all ${
                        (filters.condition || 'all') === c.id
                          ? 'bg-[#0E11B7] text-white shadow-xs'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200'
                      }`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 2. Price Range */}
            <div className="space-y-2 pt-2 border-t border-gray-100 dark:border-gray-800">
              <label className="text-xs font-black text-gray-800 dark:text-gray-200 block">
                {t('filterByPrice')} ($)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  placeholder={t('minPrice')}
                  value={filters.minPrice ?? ''}
                  onChange={e =>
                    setFilters(prev => ({
                      ...prev,
                      minPrice: e.target.value ? Number(e.target.value) : undefined,
                    }))
                  }
                  className="w-full h-9 px-2.5 rounded-xl bg-gray-50 dark:bg-[#111722] border border-gray-200 dark:border-[#293142] text-xs"
                />
                <span className="text-gray-400">-</span>
                <input
                  type="number"
                  placeholder={t('maxPrice')}
                  value={filters.maxPrice ?? ''}
                  onChange={e =>
                    setFilters(prev => ({
                      ...prev,
                      maxPrice: e.target.value ? Number(e.target.value) : undefined,
                    }))
                  }
                  className="w-full h-9 px-2.5 rounded-xl bg-gray-50 dark:bg-[#111722] border border-gray-200 dark:border-[#293142] text-xs"
                />
              </div>
            </div>

            {/* 3. Rating Minimum */}
            <div className="space-y-2 pt-2 border-t border-gray-100 dark:border-gray-800">
              <label className="text-xs font-black text-gray-800 dark:text-gray-200 block">
                {t('rating')}
              </label>
              <div className="flex flex-col gap-1.5">
                {[
                  { val: undefined, label: t('allRatings') },
                  { val: 4.5, label: '4.5 ★ ' + (language === 'ar' ? 'فأعلى' : 'and up') },
                  { val: 4.0, label: '4.0 ★ ' + (language === 'ar' ? 'فأعلى' : 'and up') },
                  { val: 3.0, label: '3.0 ★ ' + (language === 'ar' ? 'فأعلى' : 'and up') },
                ].map((r, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setFilters(prev => ({ ...prev, minRating: r.val }))}
                    className={`text-start py-1.5 px-3 rounded-xl text-xs font-bold transition flex items-center justify-between ${
                      filters.minRating === r.val
                        ? 'bg-[#EEF2FF] text-[#0E11B7] dark:bg-blue-950/40 dark:text-blue-400'
                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                    }`}
                  >
                    <span>{r.label}</span>
                    {filters.minRating === r.val && <CheckCircle2 className="w-3.5 h-3.5" />}
                  </button>
                ))}
              </div>
            </div>

            {/* 4. Location Filter (Somali Cities & Districts) */}
            <div className="space-y-2 pt-2 border-t border-gray-100 dark:border-gray-800">
              <label className="text-xs font-black text-gray-800 dark:text-gray-200 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-purple-600" />
                <span>{t('filterByLocation')}</span>
              </label>
              <div className="space-y-2">
                <select
                  aria-label={t('selectCity')}
                  value={filters.city || 'all'}
                  onChange={e => setFilters(prev => ({ ...prev, city: e.target.value }))}
                  className="w-full h-9 px-2.5 rounded-xl bg-gray-50 dark:bg-[#111722] border border-gray-200 dark:border-[#293142] text-xs font-bold"
                >
                  {SOMALIA_CITIES.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name[language] || c.name.en}
                    </option>
                  ))}
                </select>

                {filters.city === 'Mogadishu' && (
                  <select
                    aria-label={t('selectDistrict')}
                    value={filters.district || 'All'}
                    onChange={e => setFilters(prev => ({ ...prev, district: e.target.value }))}
                    className="w-full h-9 px-2.5 rounded-xl bg-gray-50 dark:bg-[#111722] border border-gray-200 dark:border-[#293142] text-xs font-bold"
                  >
                    {MOGADISHU_DISTRICTS.map(d => (
                      <option key={d} value={d}>
                        {d === 'All' ? (language === 'ar' ? 'جميع أحياء مقديشو' : 'All Districts') : d}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            {/* 5. Toggles: In-Stock & Verified */}
            <div className="space-y-2.5 pt-2 border-t border-gray-100 dark:border-gray-800">
              <label className="flex items-center justify-between text-xs font-bold text-gray-700 dark:text-gray-300 cursor-pointer">
                <span>{t('inStockOnly')}</span>
                <input
                  type="checkbox"
                  checked={Boolean(filters.inStockOnly)}
                  onChange={e => setFilters(prev => ({ ...prev, inStockOnly: e.target.checked }))}
                  className="w-4 h-4 rounded text-[#0E11B7] focus:ring-[#0E11B7]"
                />
              </label>

              <label className="flex items-center justify-between text-xs font-bold text-gray-700 dark:text-gray-300 cursor-pointer">
                <span>{t('verifiedOnly')}</span>
                <input
                  type="checkbox"
                  checked={Boolean(filters.verifiedOnly)}
                  onChange={e => setFilters(prev => ({ ...prev, verifiedOnly: e.target.checked }))}
                  className="w-4 h-4 rounded text-[#0E11B7] focus:ring-[#0E11B7]"
                />
              </label>
            </div>
          </div>
        </div>

        {/* Right Search Results View (3 Cols on Desktop) */}
        <div className="lg:col-span-3 space-y-8">
          {/* Zero Results View */}
          {searchResults.totalResults === 0 ? (
            <div className="p-8 sm:p-12 rounded-3xl bg-white dark:bg-[#151A23] border border-gray-200 dark:border-[#293142] text-center space-y-5">
              <div className="w-16 h-16 mx-auto rounded-3xl bg-gray-100 dark:bg-gray-800 text-gray-400 flex items-center justify-center shadow-inner">
                <Search className="w-8 h-8" />
              </div>
              <div className="max-w-md mx-auto space-y-2">
                <h3 className="text-xl font-black text-gray-900 dark:text-white">
                  {t('noMatchingResults')}
                </h3>
                <p className="text-xs text-gray-500 leading-relaxed">
                  {t('tryAdjustingFilters')}
                </p>
              </div>

              {/* Popular / Suggested Terms */}
              {searchResults.suggestions.length > 0 && (
                <div className="pt-3">
                  <span className="text-xs font-bold text-gray-400 block mb-2">
                    {t('popularSearches')}:
                  </span>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    {searchResults.suggestions.map((term, sIdx) => (
                      <button
                        key={sIdx}
                        type="button"
                        onClick={() => handleQueryChange(term)}
                        className="py-1.5 px-3 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-[#EEF2FF] hover:text-[#0E11B7] text-xs font-bold text-gray-700 dark:text-gray-300 transition"
                      >
                        {term}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleClearFilters}
                  className="px-6 py-2.5 rounded-full bg-[#0E11B7] text-white text-xs font-black shadow-md hover:bg-[#070A86] transition"
                >
                  {t('clearAllFilters')}
                </button>
              </div>
            </div>
          ) : filters.domain === 'all' ? (
            /* GROUPED MULTI-DOMAIN RESULTS VIEW */
            <div className="space-y-10">
              {/* 1. Products Group */}
              {searchResults.products.length > 0 && (
                <section className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ShoppingBag className="w-4 h-4 text-[#0E11B7]" />
                      <h2 className="font-black text-lg text-gray-900 dark:text-white">
                        {t('shop')} ({searchResults.products.length})
                      </h2>
                    </div>
                    {searchResults.products.length > 6 && (
                      <button
                        type="button"
                        onClick={() => handleDomainChange('products')}
                        className="text-xs font-bold text-[#0E11B7] hover:underline flex items-center gap-1"
                      >
                        <span>{t('viewAll')}</span>
                        <ArrowRight className="w-3.5 h-3.5 rtl:rotate-180" />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5 sm:gap-4">
                    {searchResults.products.slice(0, 6).map(p => (
                      <ProductCard
                        key={p.id}
                        product={p}
                        onQuickView={onQuickView}
                        onNavigate={slug => onNavigate(`/product/${slug}`)}
                      />
                    ))}
                  </div>
                </section>
              )}

              {/* 2. Stores Group */}
              {searchResults.stores.length > 0 && (
                <section className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <StoreIcon className="w-4 h-4 text-blue-600" />
                      <h2 className="font-black text-lg text-gray-900 dark:text-white">
                        {t('stores')} ({searchResults.stores.length})
                      </h2>
                    </div>
                    {searchResults.stores.length > 3 && (
                      <button
                        type="button"
                        onClick={() => handleDomainChange('stores')}
                        className="text-xs font-bold text-[#0E11B7] hover:underline flex items-center gap-1"
                      >
                        <span>{t('viewAll')}</span>
                        <ArrowRight className="w-3.5 h-3.5 rtl:rotate-180" />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {searchResults.stores.slice(0, 3).map(store => (
                      <StoreCard
                        key={store.id}
                        store={store}
                        onNavigate={onNavigate}
                      />
                    ))}
                  </div>
                </section>
              )}

              {/* 3. Restaurants Group */}
              {searchResults.restaurants.length > 0 && (
                <section className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <UtensilsCrossed className="w-4 h-4 text-orange-600" />
                      <h2 className="font-black text-lg text-gray-900 dark:text-white">
                        {t('restaurants')} ({searchResults.restaurants.length})
                      </h2>
                    </div>
                    {searchResults.restaurants.length > 3 && (
                      <button
                        type="button"
                        onClick={() => handleDomainChange('restaurants')}
                        className="text-xs font-bold text-orange-600 hover:underline flex items-center gap-1"
                      >
                        <span>{t('viewAll')}</span>
                        <ArrowRight className="w-3.5 h-3.5 rtl:rotate-180" />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {searchResults.restaurants.slice(0, 3).map(res => (
                      <RestaurantCard
                        key={res.id}
                        restaurant={res}
                        onNavigate={onNavigate}
                      />
                    ))}
                  </div>
                </section>
              )}

              {/* 4. Services Group */}
              {searchResults.services.length > 0 && (
                <section className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Wrench className="w-4 h-4 text-emerald-600" />
                      <h2 className="font-black text-lg text-gray-900 dark:text-white">
                        {t('services')} ({searchResults.services.length})
                      </h2>
                    </div>
                    {searchResults.services.length > 3 && (
                      <button
                        type="button"
                        onClick={() => handleDomainChange('services')}
                        className="text-xs font-bold text-emerald-600 hover:underline flex items-center gap-1"
                      >
                        <span>{t('viewAll')}</span>
                        <ArrowRight className="w-3.5 h-3.5 rtl:rotate-180" />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {searchResults.services.slice(0, 3).map(srv => (
                      <ServiceCard
                        key={srv.id}
                        service={srv}
                        onNavigate={onNavigate}
                      />
                    ))}
                  </div>
                </section>
              )}

              {/* 5. Offers Group */}
              {searchResults.offers.length > 0 && (
                <section className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Flame className="w-4 h-4 text-rose-600" />
                      <h2 className="font-black text-lg text-gray-900 dark:text-white">
                        {t('offers')} ({searchResults.offers.length})
                      </h2>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5 sm:gap-4">
                    {searchResults.offers.slice(0, 3).map(offer => (
                      <OfferCard
                        key={offer.id}
                        product={offer}
                        onQuickView={onQuickView}
                        onNavigate={slug => onNavigate(`/product/${slug}`)}
                      />
                    ))}
                  </div>
                </section>
              )}

              {/* 6. Commercial Ads Group */}
              {searchResults.ads.length > 0 && (
                <section className="p-5 rounded-3xl bg-amber-500/5 dark:bg-amber-950/20 border border-amber-300 dark:border-amber-800/40 space-y-3">
                  <div className="flex items-center gap-2">
                    <Megaphone className="w-4 h-4 text-amber-500" />
                    <h3 className="font-black text-sm text-gray-900 dark:text-white">
                      {t('commercialAdsTitle')}
                    </h3>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {searchResults.ads.map(ad => (
                      <div
                        key={ad.id}
                        onClick={() => onNavigate(`/product/${ad.slug}`)}
                        className="flex items-center gap-3 p-3 rounded-2xl bg-white dark:bg-[#151A23] border border-amber-200 dark:border-amber-900/40 hover:border-amber-500 cursor-pointer transition shadow-xs"
                      >
                        <img
                          src={ad.thumbnail || ad.images[0]}
                          alt=""
                          className="w-14 h-14 rounded-xl object-cover shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <span className="text-[9px] font-black uppercase text-amber-600 px-1.5 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/60 inline-block mb-1">
                            {t('sponsoredAd')}
                          </span>
                          <h4 className="font-bold text-xs text-gray-900 dark:text-white truncate">
                            {ad.title[language] || ad.title.en}
                          </h4>
                          <p className="text-[11px] text-gray-500 line-clamp-1 mt-0.5">
                            {ad.description[language] || ad.description.en}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          ) : (
            /* DEDICATED DOMAIN RESULTS VIEW */
            <div>
              {filters.domain === 'products' && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5 sm:gap-4">
                  {searchResults.products.map(p => (
                    <ProductCard
                      key={p.id}
                      product={p}
                      onQuickView={onQuickView}
                      onNavigate={slug => onNavigate(`/product/${slug}`)}
                    />
                  ))}
                </div>
              )}

              {filters.domain === 'stores' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {searchResults.stores.map(store => (
                    <StoreCard
                      key={store.id}
                      store={store}
                      onNavigate={onNavigate}
                    />
                  ))}
                </div>
              )}

              {filters.domain === 'restaurants' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {searchResults.restaurants.map(res => (
                    <RestaurantCard
                      key={res.id}
                      restaurant={res}
                      onNavigate={onNavigate}
                    />
                  ))}
                </div>
              )}

              {filters.domain === 'services' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {searchResults.services.map(srv => (
                    <ServiceCard
                      key={srv.id}
                      service={srv}
                      onNavigate={onNavigate}
                    />
                  ))}
                </div>
              )}

              {filters.domain === 'offers' && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5 sm:gap-4">
                  {searchResults.offers.map(offer => (
                    <OfferCard
                      key={offer.id}
                      product={offer}
                      onQuickView={onQuickView}
                      onNavigate={slug => onNavigate(`/product/${slug}`)}
                    />
                  ))}
                </div>
              )}

              {filters.domain === 'ads' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {searchResults.ads.map(ad => (
                    <div
                      key={ad.id}
                      onClick={() => onNavigate(`/product/${ad.slug}`)}
                      className="flex items-center gap-4 p-4 rounded-2xl bg-white dark:bg-[#151A23] border border-amber-200 dark:border-amber-900/40 hover:border-amber-500 cursor-pointer transition shadow-xs"
                    >
                      <img
                        src={ad.thumbnail || ad.images[0]}
                        alt=""
                        className="w-16 h-16 rounded-xl object-cover shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <span className="text-[9px] font-black uppercase text-amber-600 px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/60 inline-block mb-1">
                          {t('sponsoredAd')}
                        </span>
                        <h4 className="font-bold text-sm text-gray-900 dark:text-white truncate">
                          {ad.title[language] || ad.title.en}
                        </h4>
                        <p className="text-xs text-gray-500 line-clamp-1 mt-0.5">
                          {ad.description[language] || ad.description.en}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
