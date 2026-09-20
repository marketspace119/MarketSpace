import React, { useState, useEffect, useMemo } from 'react';
import {
  Store as StoreIcon,
  Search,
  CheckCircle2,
  Star,
  Users,
  MapPin,
  ArrowRight,
  ShoppingBag,
  RotateCcw,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import { Store } from '../types';
import { storeService } from '../services/storeService';
import { StoreCard } from '../components/common/StoreCard';
import { taxonomyService } from '../services/taxonomyService';
import { updatePageSEO } from '../services/seo';

interface StoresDirectoryPageProps {
  onNavigate: (path: string) => void;
}

export const StoresDirectoryPage: React.FC<StoresDirectoryPageProps> = ({ onNavigate }) => {
  const { language, t } = useLanguage();
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [onlyVerified, setOnlyVerified] = useState<boolean>(false);

  const categories = useMemo(() => taxonomyService.getStoreCategories(), []);

  useEffect(() => {
    // Only retail stores
    const allStores = storeService.getAllStores({
      sellerType: 'store',
      status: 'approved',
    });
    setStores(allStores);

    updatePageSEO({
      title: language === 'ar' ? 'دليل المتاجر المعتمدة والماركات التجارية | MarketSpace' : 'Verified Stores & Brand Outlets | MarketSpace',
      description: language === 'ar'
        ? 'تسوق مباشرة من كبرى المتاجر الرسمية والبوتيكات المعتمدة في مقديشو والصومال'
        : 'Explore verified official brand outlets, boutique retailers, and authorized stores with buyer protection',
      type: 'website',
      breadcrumbs: [
        { name: t('breadcrumbHome'), url: '/' },
        { name: t('breadcrumbStores'), url: '/stores' },
      ],
      language,
    });
  }, [language, t]);

  const filteredStores = useMemo(() => {
    return stores.filter(store => {
      const storeDesc =
        typeof store.description === 'string'
          ? store.description
          : (store.description?.[language] || store.description?.en || '');

      const matchesSearch =
        !searchQuery.trim() ||
        store.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        storeDesc.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (store.city || '').toLowerCase().includes(searchQuery.toLowerCase());

      const matchesCategory =
        selectedCategory === 'all' ||
        (store.categories && store.categories.includes(selectedCategory)) ||
        storeDesc.toLowerCase().includes(selectedCategory.toLowerCase());

      const matchesVerified = !onlyVerified || Boolean(store.verified);

      return matchesSearch && matchesCategory && matchesVerified;
    });
  }, [stores, searchQuery, selectedCategory, onlyVerified, language]);

  const handleReset = () => {
    setSearchQuery('');
    setSelectedCategory('all');
    setOnlyVerified(false);
  };

  return (
    <div className="min-h-screen bg-gray-50/50 dark:bg-[#0B1120] py-6 sm:py-10 px-4 sm:px-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          <button onClick={() => onNavigate('/')} className="hover:text-[#0E11B7] dark:hover:text-[#3B82F6]">
            {t('breadcrumbHome')}
          </button>
          <ChevronRight className="w-3.5 h-3.5 rtl:rotate-180 text-gray-400" />
          <span className="font-bold text-gray-900 dark:text-white">
            {t('breadcrumbStores')}
          </span>
        </nav>

        {/* Header Hero Banner */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-[#0E11B7] via-indigo-900 to-blue-900 text-white p-6 sm:p-10 shadow-xl">
          <div className="relative z-10 max-w-2xl space-y-3">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md text-xs font-bold text-white uppercase tracking-wider">
              <StoreIcon className="w-3.5 h-3.5" />
              <span>{t('stores')}</span>
            </span>
            <h1 className="text-2xl sm:text-4xl font-black leading-tight">
              {language === 'ar'
                ? 'دليل المتاجر والبوتيكات المعتمدة'
                : 'Premier Boutiques & Verified Retail Stores'}
            </h1>
            <p className="text-xs sm:text-sm text-blue-100/90 leading-relaxed">
              {language === 'ar'
                ? 'استكشف واجهات المتاجر المحلية والعالمية المعتمدة في MarketSpace، تسوق منتجاتهم الأصلية وتابع جديد عروضهم.'
                : 'Browse verified boutiques, electronics centers, cosmetics shops, and trusted brand outlets with full buyer protection.'}
            </p>
          </div>

          <div className="absolute end-4 -bottom-10 opacity-10 pointer-events-none">
            <StoreIcon className="w-72 h-72 text-white" />
          </div>
        </div>

        {/* Search & Filter Controls Bar */}
        <div className="bg-white dark:bg-[#151A23] p-4 sm:p-5 rounded-2xl border border-gray-200 dark:border-[#293142] shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row items-center gap-3">
            {/* Search Input */}
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 absolute start-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={language === 'ar' ? 'ابحث عن اسم متجر أو مدينة أو تخصص...' : 'Search stores, cities, or categories...'}
                className="w-full ps-10 pe-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-[#1C2331] text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#0E11B7]"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute end-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Quick Filters */}
            <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
              <button
                type="button"
                onClick={() => setOnlyVerified(!onlyVerified)}
                className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all shrink-0 flex items-center gap-1.5 ${
                  onlyVerified
                    ? 'bg-blue-50 border-blue-600 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
                    : 'bg-gray-50 border-gray-200 text-gray-700 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300'
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-blue-500" />
                <span>{t('verifiedSeller')}</span>
              </button>

              {(searchQuery || selectedCategory !== 'all' || onlyVerified) && (
                <button
                  type="button"
                  onClick={handleReset}
                  className="px-2.5 py-2 rounded-xl text-xs font-medium text-gray-500 hover:text-red-600 dark:text-gray-400 transition-colors shrink-0 flex items-center gap-1"
                  title={t('resetFilters')}
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{t('resetFilters')}</span>
                </button>
              )}
            </div>
          </div>

          {/* Store Category Tabs */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            <button
              type="button"
              onClick={() => setSelectedCategory('all')}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all shrink-0 ${
                selectedCategory === 'all'
                  ? 'bg-[#0E11B7] text-white shadow-md shadow-blue-900/20'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200'
              }`}
            >
              {t('allCategories')}
            </button>
            {categories.map(c => (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedCategory(c.slug)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all shrink-0 ${
                  selectedCategory === c.slug
                    ? 'bg-[#0E11B7] text-white shadow-md shadow-blue-900/20'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200'
                }`}
              >
                {c.name[language] || c.name.en}
              </button>
            ))}
          </div>
        </div>

        {/* Results Grid */}
        {filteredStores.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredStores.map(store => (
              <StoreCard
                key={store.id}
                store={store}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        ) : (
          /* Empty State */
          <div className="p-12 text-center bg-white dark:bg-[#151A23] rounded-3xl border border-gray-200 dark:border-[#293142] space-y-4">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-blue-100 dark:bg-blue-950/40 text-[#0E11B7] dark:text-[#3B82F6] flex items-center justify-center">
              <StoreIcon className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">
              {t('noStoresFound')}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 max-w-md mx-auto">
              {language === 'ar'
                ? 'لم يتم العثور على متاجر تطابق خيارات التصفية الحالية. جرب إعادة تعيين الفلاتر.'
                : 'No stores match your current filters. Try adjusting search terms or resetting filters.'}
            </p>
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#0E11B7] text-white text-xs font-bold shadow-md shadow-blue-900/20 hover:bg-blue-800 transition"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{t('resetFilters')}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
