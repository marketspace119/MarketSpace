import React, { useState, useEffect, useMemo } from 'react';
import {
  Flame,
  Clock,
  Sparkles,
  ShoppingBag,
  UtensilsCrossed,
  Wrench,
  Boxes,
  Recycle,
  ChevronRight,
  RotateCcw,
} from 'lucide-react';
import { Product } from '../types';
import { productService } from '../services/productService';
import { taxonomyService } from '../services/taxonomyService';
import { useLanguage } from '../i18n/LanguageContext';
import { OfferCard } from '../components/common/OfferCard';
import { updatePageSEO } from '../services/seo';

interface OffersPageProps {
  onNavigate: (path: string) => void;
  onQuickView: (product: Product) => void;
}

export const OffersPage: React.FC<OffersPageProps> = ({ onNavigate, onQuickView }) => {
  const { language, t } = useLanguage();
  const [selectedDomain, setSelectedDomain] = useState<string>('all');
  const [allProducts, setAllProducts] = useState<Product[]>([]);

  // Countdown timer simulation for daily deals
  const [timeLeft, setTimeLeft] = useState({
    hours: 14,
    minutes: 35,
    seconds: 22,
  });

  useEffect(() => {
    const products = productService.getAllProducts({ onlyPublished: true });
    setAllProducts(products);

    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev.seconds > 0) return { ...prev, seconds: prev.seconds - 1 };
        if (prev.minutes > 0) return { ...prev, minutes: prev.minutes - 1, seconds: 59 };
        if (prev.hours > 0) return { hours: prev.hours - 1, minutes: 59, seconds: 59 };
        return { hours: 24, minutes: 0, seconds: 0 };
      });
    }, 1000);

    updatePageSEO({
      title: language === 'ar' ? 'أقوى العروض والخصومات اليومية | MarketSpace' : 'Super Deals & Daily Discounts | MarketSpace',
      description: language === 'ar'
        ? 'وفر حتى 50% على أفضل المنتجات الجديدة والمستعملة وعروض المطاعم والخدمات المعتمدة'
        : 'Save up to 50% on tech, fashion, dining combos, and professional services with live countdowns',
      type: 'website',
      breadcrumbs: [
        { name: t('breadcrumbHome'), url: '/' },
        { name: t('breadcrumbOffers'), url: '/offers' },
      ],
      language,
    });

    return () => clearInterval(timer);
  }, [language, t]);

  const offerProducts = useMemo(() => {
    return allProducts.filter(p => {
      // Must have discount, offer flag, or price reduction
      const hasDiscount = Boolean(p.isOffer || (p.discount && p.discount > 0) || (p.oldPrice && p.oldPrice > p.price));
      if (!hasDiscount) return false;

      const cls = taxonomyService.classify(p);

      if (selectedDomain === 'all') return true;
      if (selectedDomain === 'new') return cls.marketplaceType === 'shop' && cls.productCondition === 'new';
      if (selectedDomain === 'used') return cls.marketplaceType === 'shop' && cls.productCondition === 'used';
      if (selectedDomain === 'dropshipping') return cls.marketplaceType === 'shop' && cls.productCondition === 'dropshipping';
      if (selectedDomain === 'restaurants') return cls.marketplaceType === 'restaurants';
      if (selectedDomain === 'services') return cls.marketplaceType === 'services';

      return true;
    });
  }, [allProducts, selectedDomain]);

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
            {t('breadcrumbOffers')}
          </span>
        </nav>

        {/* Hero Banner with Countdown Timer */}
        <div className="p-6 sm:p-10 rounded-3xl bg-gradient-to-br from-rose-600 via-rose-700 to-indigo-950 text-white shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-3 max-w-xl">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/20 text-xs font-black backdrop-blur-sm">
              <Flame className="w-4 h-4 text-amber-300 animate-pulse" />
              <span>{t('flashDealsTitle')}</span>
            </div>
            <h1 className="text-2xl sm:text-4xl font-black tracking-tight leading-tight">
              {language === 'ar'
                ? 'خصومات كبرى تصل حتى 50% لفترة محدودة'
                : 'Limited-Time Super Deals & Flash Savings'}
            </h1>
            <p className="text-xs sm:text-sm text-rose-100/90 leading-relaxed">
              {language === 'ar'
                ? 'تخفيضات موثوقة مع توضيح كامل لنسبة الخصم، والسعر الأصلي، ومصدر السلعة لضمان أفضل قيمة حقيقية.'
                : 'Verified markdowns across electronics, fashion, restaurant meals, and freelance packages.'}
            </p>
          </div>

          {/* Countdown Clock Box */}
          <div className="p-4 sm:p-5 rounded-2xl bg-black/40 border border-white/20 backdrop-blur-md flex flex-col items-center gap-2 shrink-0">
            <span className="text-xs font-bold text-rose-200 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-amber-300" />
              {t('dealsEndsIn')}
            </span>
            <div className="flex items-center gap-2 text-center text-white">
              <div className="w-14 py-2 rounded-xl bg-white/10 border border-white/15">
                <span className="block text-xl sm:text-2xl font-black">
                  {String(timeLeft.hours).padStart(2, '0')}
                </span>
                <span className="text-[10px] text-gray-300">{t('countdownHours')}</span>
              </div>
              <span className="text-xl font-bold">:</span>
              <div className="w-14 py-2 rounded-xl bg-white/10 border border-white/15">
                <span className="block text-xl sm:text-2xl font-black">
                  {String(timeLeft.minutes).padStart(2, '0')}
                </span>
                <span className="text-[10px] text-gray-300">{t('countdownMinutes')}</span>
              </div>
              <span className="text-xl font-bold">:</span>
              <div className="w-14 py-2 rounded-xl bg-white/10 border border-white/15">
                <span className="block text-xl sm:text-2xl font-black">
                  {String(timeLeft.seconds).padStart(2, '0')}
                </span>
                <span className="text-[10px] text-gray-300">{t('countdownSeconds')}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Domain Filter Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          {[
            { id: 'all', label: t('allCategories'), icon: <Sparkles className="w-3.5 h-3.5" /> },
            { id: 'new', label: t('breadcrumbNew'), icon: <ShoppingBag className="w-3.5 h-3.5" /> },
            { id: 'used', label: t('breadcrumbUsed'), icon: <Recycle className="w-3.5 h-3.5" /> },
            { id: 'dropshipping', label: t('breadcrumbDropshipping'), icon: <Boxes className="w-3.5 h-3.5" /> },
            { id: 'restaurants', label: t('restaurants'), icon: <UtensilsCrossed className="w-3.5 h-3.5" /> },
            { id: 'services', label: t('services'), icon: <Wrench className="w-3.5 h-3.5" /> },
          ].map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSelectedDomain(tab.id)}
              className={`flex items-center gap-1.5 py-2 px-4 rounded-full text-xs font-bold whitespace-nowrap transition-all shrink-0 ${
                selectedDomain === tab.id
                  ? 'bg-rose-600 text-white shadow-md shadow-rose-600/20'
                  : 'bg-white dark:bg-[#151A23] border border-gray-200 dark:border-[#293142] text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Offers Grid */}
        {offerProducts.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
            {offerProducts.map(product => (
              <OfferCard
                key={product.id}
                product={product}
                onQuickView={onQuickView}
                onNavigate={(slug) => onNavigate(`/product/${slug}`)}
              />
            ))}
          </div>
        ) : (
          /* Empty State */
          <div className="p-12 text-center bg-white dark:bg-[#151A23] rounded-3xl border border-gray-200 dark:border-[#293142] space-y-4">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 flex items-center justify-center">
              <Flame className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">
              {t('noOffersFound')}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 max-w-md mx-auto">
              {language === 'ar'
                ? 'لا توجد عروض خصم نشطة في هذا القسم حالياً. تابعنا للمزيد من التخفيضات اليومية القادمة.'
                : 'No active promotions available in this domain. Check back soon for newly launched deals.'}
            </p>
            <button
              type="button"
              onClick={() => setSelectedDomain('all')}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 text-white text-xs font-bold shadow-md shadow-rose-600/20 hover:bg-rose-700 transition"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{t('allCategories')}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
