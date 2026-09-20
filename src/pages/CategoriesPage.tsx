import React, { useState } from 'react';
import {
  ChevronRight,
  Search,
  ShoppingBag,
  UtensilsCrossed,
  Store,
  Wrench,
  Flame,
  ArrowRight,
  Layers,
  Sparkles,
} from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import {
  taxonomyService,
  MARKETPLACE_DOMAINS,
  SHOP_NEW_CATEGORIES,
  SHOP_USED_CATEGORIES,
  SHOP_DROPSHIPPING_CATEGORIES,
  RESTAURANT_CUISINES,
  STORE_CATEGORIES,
  SERVICE_CATEGORIES,
} from '../services/taxonomyService';

interface CategoriesPageProps {
  onNavigate: (path: string) => void;
}

export const CategoriesPage: React.FC<CategoriesPageProps> = ({ onNavigate }) => {
  const { language, t } = useLanguage();
  const [filterQuery, setFilterQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'shop' | 'restaurants' | 'stores' | 'services'>('all');

  const q = filterQuery.toLowerCase().trim();

  // Helper filter
  const matches = (name: { ar: string; en: string; so: string }) => {
    if (!q) return true;
    const text = (name[language] || name.en).toLowerCase();
    return text.includes(q);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-8 animate-fadeIn">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
        <button onClick={() => onNavigate('/')} className="hover:text-[#0E11B7]">
          {t('home')}
        </button>
        <ChevronRight className="w-3.5 h-3.5 rtl:rotate-180 text-gray-400" />
        <span className="font-bold text-gray-900 dark:text-white">
          {t('categoriesIndex')}
        </span>
      </nav>

      {/* Hero Header */}
      <div className="p-6 sm:p-10 rounded-3xl bg-gradient-to-br from-[#0E11B7]/10 via-[#0E11B7]/5 to-transparent dark:from-blue-950/40 dark:via-gray-900 border border-gray-200 dark:border-[#293142] space-y-4">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#0E11B7]/10 dark:bg-blue-500/20 text-[#0E11B7] dark:text-[#3B82F6] text-xs font-bold">
          <Layers className="w-3.5 h-3.5" />
          <span>{t('categoriesIndex')}</span>
        </div>
        <h1 className="text-2xl sm:text-4xl font-black text-gray-900 dark:text-white">
          {t('browseAllCategories')}
        </h1>
        <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-300 max-w-2xl leading-relaxed">
          {language === 'ar'
            ? 'دليل شامل لجميع القطاعات والأقسام في منصة MarketSpace: متجر الإلكترونيات والأزياء، المطاعم والمأكولات السريعة، المتاجر المعتمدة، والخدمات المهنية في مقديشو وكافة مدن الصومال.'
            : language === 'so'
            ? 'Tusmo dhammaystiran oo ku saabsan dhammaan qeybaha MarketSpace: elektarooniga, dharka, makhaayadaha, dukaamada la xaqiijiyay, iyo adeegyada xirfadeed ee Soomaaliya.'
            : 'Comprehensive directory of all MarketSpace sectors: retail shopping, restaurants, verified merchants, and professional services across Somalia.'}
        </p>

        {/* Filter Input */}
        <div className="relative max-w-md pt-2">
          <input
            type="text"
            value={filterQuery}
            onChange={e => setFilterQuery(e.target.value)}
            placeholder={
              language === 'ar'
                ? 'ابحث داخل الأقسام والتصنيفات...'
                : language === 'so'
                ? 'Ka dhex baaro qeybaha...'
                : 'Search within departments & categories...'
            }
            className="w-full h-11 ps-4 pe-10 bg-white dark:bg-[#151A23] border border-gray-200 dark:border-[#293142] rounded-2xl text-xs font-medium text-gray-900 dark:text-white focus:outline-none focus:border-[#0E11B7]"
          />
          <Search className="w-4 h-4 text-gray-400 absolute end-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>

        {/* Domain Filter Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-2 scrollbar-none">
          {[
            { id: 'all', label: t('allCategories') },
            { id: 'shop', label: t('shop') },
            { id: 'restaurants', label: t('restaurants') },
            { id: 'stores', label: t('stores') },
            { id: 'services', label: t('services') },
          ].map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as any)}
              className={`py-1.5 px-3.5 rounded-full text-xs font-bold transition-all ${
                activeTab === tab.id
                  ? 'bg-[#0E11B7] text-white shadow-xs'
                  : 'bg-white dark:bg-[#151A23] text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-[#293142] hover:bg-gray-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* 1. Shop Categories */}
      {(activeTab === 'all' || activeTab === 'shop') && (
        <section className="space-y-4">
          <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-800 pb-3">
            <div className="flex items-center gap-2">
              <ShoppingBag className="w-5 h-5 text-[#0E11B7]" />
              <h2 className="text-lg font-black text-gray-900 dark:text-white">
                {t('shop')} — {t('conditionNew')}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('/shop')}
              className="text-xs font-bold text-[#0E11B7] hover:underline flex items-center gap-1"
            >
              <span>{t('exploreDepartment')}</span>
              <ArrowRight className="w-3.5 h-3.5 rtl:rotate-180" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {SHOP_NEW_CATEGORIES.filter(c => matches(c.name)).map(cat => (
              <div
                key={cat.id}
                onClick={() => onNavigate(`/search?domain=products&category=${cat.id}`)}
                className="p-5 rounded-2xl bg-white dark:bg-[#151A23] border border-gray-200 dark:border-[#293142] hover:border-[#0E11B7] dark:hover:border-[#3B82F6] hover:shadow-md transition-all cursor-pointer group"
              >
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <h3 className="font-bold text-sm text-gray-900 dark:text-white group-hover:text-[#0E11B7] dark:group-hover:text-[#3B82F6] transition">
                      {cat.name[language] || cat.name.en}
                    </h3>
                    {cat.subcategories && (
                      <p className="text-[11px] text-gray-500 line-clamp-2">
                        {cat.subcategories.map(s => s.name[language] || s.name.en).join(' • ')}
                      </p>
                    )}
                  </div>
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-xs"
                    style={{ backgroundColor: `${cat.accentColor || '#0E11B7'}15`, color: cat.accentColor || '#0E11B7' }}
                  >
                    <ShoppingBag className="w-4 h-4" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 2. Restaurant Cuisines */}
      {(activeTab === 'all' || activeTab === 'restaurants') && (
        <section className="space-y-4">
          <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-800 pb-3">
            <div className="flex items-center gap-2">
              <UtensilsCrossed className="w-5 h-5 text-orange-500" />
              <h2 className="text-lg font-black text-gray-900 dark:text-white">
                {t('restaurants')} — {t('browseByCategory')}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('/restaurants')}
              className="text-xs font-bold text-orange-600 hover:underline flex items-center gap-1"
            >
              <span>{t('exploreDepartment')}</span>
              <ArrowRight className="w-3.5 h-3.5 rtl:rotate-180" />
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {RESTAURANT_CUISINES.filter(c => matches(c.name)).map(cuisine => (
              <div
                key={cuisine.id}
                onClick={() => onNavigate(`/restaurants?category=${cuisine.id}`)}
                className="p-4 rounded-2xl bg-white dark:bg-[#151A23] border border-gray-200 dark:border-[#293142] hover:border-orange-500 transition cursor-pointer text-center space-y-2 group"
              >
                <div className="w-10 h-10 mx-auto rounded-xl bg-orange-50 dark:bg-orange-950/40 text-orange-500 flex items-center justify-center">
                  <UtensilsCrossed className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-xs text-gray-900 dark:text-white group-hover:text-orange-600 transition">
                  {cuisine.name[language] || cuisine.name.en}
                </h3>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 3. Verified Store Categories */}
      {(activeTab === 'all' || activeTab === 'stores') && (
        <section className="space-y-4">
          <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-800 pb-3">
            <div className="flex items-center gap-2">
              <Store className="w-5 h-5 text-blue-600" />
              <h2 className="text-lg font-black text-gray-900 dark:text-white">
                {t('stores')} — {t('categoriesIndex')}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('/stores')}
              className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1"
            >
              <span>{t('exploreDepartment')}</span>
              <ArrowRight className="w-3.5 h-3.5 rtl:rotate-180" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {STORE_CATEGORIES.filter(c => matches(c.name)).map(cat => (
              <div
                key={cat.id}
                onClick={() => onNavigate(`/stores?category=${cat.id}`)}
                className="p-4 rounded-2xl bg-white dark:bg-[#151A23] border border-gray-200 dark:border-[#293142] hover:border-blue-500 transition cursor-pointer flex items-center justify-between group"
              >
                <div>
                  <h3 className="font-bold text-xs text-gray-900 dark:text-white group-hover:text-blue-600 transition">
                    {cat.name[language] || cat.name.en}
                  </h3>
                  <span className="text-[10px] text-gray-400">
                    {language === 'ar' ? 'متاجر معتمدة' : 'Verified Merchants'}
                  </span>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-gray-400 rtl:rotate-180 group-hover:translate-x-1 transition-transform" />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 4. Professional Service Categories */}
      {(activeTab === 'all' || activeTab === 'services') && (
        <section className="space-y-4">
          <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-800 pb-3">
            <div className="flex items-center gap-2">
              <Wrench className="w-5 h-5 text-emerald-600" />
              <h2 className="text-lg font-black text-gray-900 dark:text-white">
                {t('services')} — {t('categoriesIndex')}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('/services')}
              className="text-xs font-bold text-emerald-600 hover:underline flex items-center gap-1"
            >
              <span>{t('exploreDepartment')}</span>
              <ArrowRight className="w-3.5 h-3.5 rtl:rotate-180" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {SERVICE_CATEGORIES.filter(c => matches(c.name)).map(cat => (
              <div
                key={cat.id}
                onClick={() => onNavigate(`/services?category=${cat.id}`)}
                className="p-4 rounded-2xl bg-white dark:bg-[#151A23] border border-gray-200 dark:border-[#293142] hover:border-emerald-500 transition cursor-pointer flex items-center justify-between group"
              >
                <div>
                  <h3 className="font-bold text-xs text-gray-900 dark:text-white group-hover:text-emerald-600 transition">
                    {cat.name[language] || cat.name.en}
                  </h3>
                  <span className="text-[10px] text-gray-400">
                    {language === 'ar' ? 'خدمات احترافية وحجز' : 'Booking & Pro Services'}
                  </span>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-gray-400 rtl:rotate-180 group-hover:translate-x-1 transition-transform" />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
