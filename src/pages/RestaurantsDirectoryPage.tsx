import React, { useState, useEffect, useMemo } from 'react';
import {
  UtensilsCrossed,
  Search,
  Filter,
  Star,
  Clock,
  Truck,
  RotateCcw,
  Sparkles,
  MapPin,
  ChevronRight,
} from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import { Store } from '../types';
import { storeService } from '../services/storeService';
import { RestaurantCard } from '../components/common/RestaurantCard';
import { taxonomyService } from '../services/taxonomyService';
import { updatePageSEO } from '../services/seo';

interface RestaurantsDirectoryPageProps {
  onNavigate: (path: string) => void;
}

export const RestaurantsDirectoryPage: React.FC<RestaurantsDirectoryPageProps> = ({
  onNavigate,
}) => {
  const { language, t, isRTL } = useLanguage();
  const [restaurants, setRestaurants] = useState<Store[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCuisine, setSelectedCuisine] = useState<string>('all');
  const [onlyFreeDelivery, setOnlyFreeDelivery] = useState(false);
  const [minRating, setMinRating] = useState<number>(0);

  const cuisines = useMemo(() => taxonomyService.getRestaurantCuisines(), []);

  useEffect(() => {
    // Load approved restaurants
    const allApproved = storeService.getAllStores({
      sellerType: 'restaurant',
      status: 'approved',
    });
    setRestaurants(allApproved);

    updatePageSEO({
      title: language === 'ar' ? 'دليل المطاعم والوجبات السريعة | MarketSpace' : 'Restaurants & Dining Directory | MarketSpace',
      description: language === 'ar'
        ? 'اطلب وجبتك المفضلة من أفضل المطاعم في مقديشو مع توصيل سريع وتتبع مباشر للطلب'
        : 'Order delicious meals, burgers, pizza, and authentic dishes with rapid express delivery',
      type: 'website',
      breadcrumbs: [
        { name: t('breadcrumbHome'), url: '/' },
        { name: t('breadcrumbRestaurants'), url: '/restaurants' },
      ],
      language,
    });
  }, [language, t]);

  const filteredRestaurants = useMemo(() => {
    return restaurants.filter(rest => {
      // Search
      const nameMatch = rest.name.toLowerCase().includes(searchQuery.toLowerCase());
      const descText =
        typeof rest.description === 'string'
          ? rest.description
          : (rest.description?.[language] || rest.description?.en || '');
      const descMatch = descText.toLowerCase().includes(searchQuery.toLowerCase());
      const cityMatch = (rest.city || '').toLowerCase().includes(searchQuery.toLowerCase());
      const matchesSearch = !searchQuery.trim() || nameMatch || descMatch || cityMatch;

      // Cuisine
      const matchesCuisine =
        selectedCuisine === 'all' ||
        (rest.categories && rest.categories.includes(selectedCuisine)) ||
        descText.toLowerCase().includes(selectedCuisine.toLowerCase());

      // Free Delivery
      const matchesDelivery = !onlyFreeDelivery || (rest.shippingFee === 0);

      // Rating
      const matchesRating = minRating === 0 || ((rest.rating || 0) >= minRating);

      return matchesSearch && matchesCuisine && matchesDelivery && matchesRating;
    });
  }, [restaurants, searchQuery, selectedCuisine, onlyFreeDelivery, minRating, language]);

  const handleResetFilters = () => {
    setSearchQuery('');
    setSelectedCuisine('all');
    setOnlyFreeDelivery(false);
    setMinRating(0);
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
            {t('breadcrumbRestaurants')}
          </span>
        </nav>

        {/* Hero Banner */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-orange-600 via-amber-600 to-orange-700 text-white p-6 sm:p-10 shadow-xl">
          <div className="relative z-10 max-w-2xl space-y-3">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 backdrop-blur-md text-xs font-bold text-white uppercase tracking-wider">
              <UtensilsCrossed className="w-3.5 h-3.5" />
              <span>{t('restaurants')}</span>
            </span>
            <h1 className="text-2xl sm:text-4xl font-black leading-tight">
              {language === 'ar'
                ? 'أشهى المطاعم والمأكولات السريعة في مقديشو'
                : 'Top Restaurants & Flavorful Meals Delivered Fresh'}
            </h1>
            <p className="text-xs sm:text-sm text-orange-100/90 leading-relaxed">
              {language === 'ar'
                ? 'تصفح قوائم الطعام الكاملة، واختر إضافاتك المفضلة، واستمتع بتوصيل سريع ومباشر لباب منزلك.'
                : 'Browse full menus, customize meal addons, and enjoy fast doorstep delivery from top culinary brands.'}
            </p>
          </div>

          <div className="absolute end-4 -bottom-10 opacity-15 pointer-events-none">
            <UtensilsCrossed className="w-72 h-72 text-white" />
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
                placeholder={language === 'ar' ? 'ابحث عن مطعم أو نوع وجبة...' : 'Search restaurants or cuisines...'}
                className="w-full ps-10 pe-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-[#1C2331] text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500"
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
                onClick={() => setOnlyFreeDelivery(!onlyFreeDelivery)}
                className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all shrink-0 flex items-center gap-1.5 ${
                  onlyFreeDelivery
                    ? 'bg-orange-50 border-orange-500 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300'
                    : 'bg-gray-50 border-gray-200 text-gray-700 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300'
                }`}
              >
                <Truck className="w-3.5 h-3.5" />
                <span>{t('freeShipping')}</span>
              </button>

              <button
                type="button"
                onClick={() => setMinRating(minRating === 4.5 ? 0 : 4.5)}
                className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all shrink-0 flex items-center gap-1.5 ${
                  minRating === 4.5
                    ? 'bg-amber-50 border-amber-500 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                    : 'bg-gray-50 border-gray-200 text-gray-700 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300'
                }`}
              >
                <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                <span>4.5+ {t('rating')}</span>
              </button>

              {(searchQuery || selectedCuisine !== 'all' || onlyFreeDelivery || minRating > 0) && (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="px-2.5 py-2 rounded-xl text-xs font-medium text-gray-500 hover:text-red-600 dark:text-gray-400 transition-colors shrink-0 flex items-center gap-1"
                  title={t('resetFilters')}
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{t('resetFilters')}</span>
                </button>
              )}
            </div>
          </div>

          {/* Cuisine Pill Tabs */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            <button
              type="button"
              onClick={() => setSelectedCuisine('all')}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all shrink-0 ${
                selectedCuisine === 'all'
                  ? 'bg-orange-500 text-white shadow-md shadow-orange-500/20'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200'
              }`}
            >
              {t('allCategories')}
            </button>
            {cuisines.map(c => (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedCuisine(c.slug)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all shrink-0 ${
                  selectedCuisine === c.slug
                    ? 'bg-orange-500 text-white shadow-md shadow-orange-500/20'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200'
                }`}
              >
                {c.name[language] || c.name.en}
              </button>
            ))}
          </div>
        </div>

        {/* Results Grid */}
        {filteredRestaurants.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredRestaurants.map(restaurant => (
              <RestaurantCard
                key={restaurant.id}
                restaurant={restaurant}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        ) : (
          /* Empty State */
          <div className="p-12 text-center bg-white dark:bg-[#151A23] rounded-3xl border border-gray-200 dark:border-[#293142] space-y-4">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-orange-100 dark:bg-orange-950/40 text-orange-600 flex items-center justify-center">
              <UtensilsCrossed className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">
              {t('noRestaurantsFound')}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 max-w-md mx-auto">
              {language === 'ar'
                ? 'جرّب تعديل كلمات البحث أو إلغاء فلاتر التوصيل والتصنيف لعرض المزيد من المطاعم.'
                : 'Try adjusting your search terms or clearing selected filters to find more dining partners.'}
            </p>
            <button
              type="button"
              onClick={handleResetFilters}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-orange-500 text-white text-xs font-bold shadow-md shadow-orange-500/20 hover:bg-orange-600 transition"
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
