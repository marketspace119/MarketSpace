import React, { useState, useEffect, useMemo } from 'react';
import {
  Megaphone,
  Search,
  ExternalLink,
  ShieldCheck,
  Building,
  Sparkles,
  ChevronRight,
  Phone,
  MessageCircle,
  Clock,
  ArrowRight,
} from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import { Product } from '../types';
import { productService } from '../services/productService';
import { updatePageSEO } from '../services/seo';

interface AdsPageProps {
  onNavigate: (path: string) => void;
}

export const AdsPage: React.FC<AdsPageProps> = ({ onNavigate }) => {
  const { language, t } = useLanguage();
  const [ads, setAds] = useState<Product[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const allAds = productService.getAllProducts({
      type: 'ads',
      onlyPublished: true,
    });
    setAds(allAds);

    updatePageSEO({
      title: language === 'ar' ? 'الإعلانات المميزة والفرص التجارية | MarketSpace' : 'Sponsored Showcase & Commercial Listings | MarketSpace',
      description: language === 'ar'
        ? 'استكشف إعلانات الشركاء المعتمدين وفرص الأعمال والخدمات الإعلانية في الصومال'
        : 'Explore verified commercial partner showcases, business announcements, and premium sponsor campaigns',
      type: 'website',
      breadcrumbs: [
        { name: t('breadcrumbHome'), url: '/' },
        { name: t('breadcrumbAds'), url: '/ads' },
      ],
      language,
    });
  }, [language, t]);

  const filteredAds = useMemo(() => {
    return ads.filter(ad => {
      const title = (ad.title[language] || ad.title.en).toLowerCase();
      const desc = (ad.description[language] || ad.description.en).toLowerCase();
      const sponsor = (ad.seller?.name || ad.brand || '').toLowerCase();
      return (
        !searchQuery.trim() ||
        title.includes(searchQuery.toLowerCase()) ||
        desc.includes(searchQuery.toLowerCase()) ||
        sponsor.includes(searchQuery.toLowerCase())
      );
    });
  }, [ads, searchQuery, language]);

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
            {t('breadcrumbAds')}
          </span>
        </nav>

        {/* Hero Banner */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-amber-600 via-orange-600 to-amber-700 text-white p-6 sm:p-10 shadow-xl">
          <div className="relative z-10 max-w-2xl space-y-3">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 backdrop-blur-md text-xs font-bold text-white uppercase tracking-wider">
              <Megaphone className="w-3.5 h-3.5" />
              <span>{t('sponsoredAd')}</span>
            </span>
            <h1 className="text-2xl sm:text-4xl font-black leading-tight">
              {language === 'ar'
                ? 'منصة الإعلانات والشراكات التجارية المعتمدة'
                : 'Verified Commercial Sponsors & Partner Showcase'}
            </h1>
            <p className="text-xs sm:text-sm text-amber-100/90 leading-relaxed">
              {language === 'ar'
                ? 'إعلانات تجارية موثوقة تخضع للمراجعة والتدقيق، تفصل بوضوح عن المنتجات المباشرة لضمان الشفافية وثقة المشتري.'
                : 'Transparent, verified business promotions strictly designated as sponsored listings for buyer clarity.'}
            </p>
          </div>

          <div className="absolute end-4 -bottom-10 opacity-15 pointer-events-none">
            <Megaphone className="w-72 h-72 text-white" />
          </div>
        </div>

        {/* Search Bar */}
        <div className="bg-white dark:bg-[#151A23] p-4 rounded-2xl border border-gray-200 dark:border-[#293142] shadow-sm">
          <div className="relative w-full">
            <Search className="w-4 h-4 absolute start-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={language === 'ar' ? 'ابحث في إعلانات الشركاء...' : 'Search sponsored announcements...'}
              className="w-full ps-10 pe-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-[#1C2331] text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>
        </div>

        {/* Ads Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredAds.map(ad => {
            const title = ad.title[language] || ad.title.en;
            const desc = ad.description[language] || ad.description.en;
            const sponsorName = ad.seller?.name || ad.brand || 'MarketSpace Partner';

            return (
              <div
                key={ad.id}
                className="group flex flex-col justify-between bg-white dark:bg-[#151A23] rounded-2xl border-2 border-amber-400/40 dark:border-amber-500/30 overflow-hidden hover:border-amber-500 hover:shadow-xl transition-all duration-300"
              >
                {/* Media */}
                <div className="relative aspect-[16/10] w-full overflow-hidden bg-gray-100 dark:bg-gray-800">
                  <img
                    src={ad.thumbnail || ad.images[0]}
                    alt={title}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  {/* Sponsored Badge */}
                  <div className="absolute top-3 start-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500 text-white text-[10px] font-black uppercase shadow-md">
                    <Sparkles className="w-3 h-3" />
                    <span>{t('sponsoredAd')}</span>
                  </div>

                  {/* Sponsor Name */}
                  <div className="absolute bottom-3 start-3 px-2.5 py-1 rounded-lg bg-black/75 backdrop-blur-sm text-white text-xs font-bold flex items-center gap-1.5">
                    <Building className="w-3.5 h-3.5 text-amber-400" />
                    <span>{sponsorName}</span>
                  </div>
                </div>

                {/* Content */}
                <div className="p-5 flex flex-col flex-grow justify-between gap-4">
                  <div>
                    <h3 className="text-base font-bold text-gray-900 dark:text-white line-clamp-2 leading-snug group-hover:text-amber-600 transition-colors">
                      {title}
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 line-clamp-3 leading-relaxed">
                      {desc}
                    </p>
                  </div>

                  {/* Footer & Actions */}
                  <div className="pt-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between gap-2">
                    <span className="text-[11px] text-gray-400 flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5 text-blue-500" />
                      <span>{t('sponsorPartner')}</span>
                    </span>

                    <button
                      type="button"
                      onClick={() => onNavigate(`/product/${ad.slug}`)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold shadow-md shadow-amber-500/20 active:scale-95 transition-all"
                    >
                      <span>{t('viewAdDetails')}</span>
                      <ArrowRight className="w-3.5 h-3.5 rtl:rotate-180" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {filteredAds.length === 0 && (
          <div className="p-12 text-center bg-white dark:bg-[#151A23] rounded-3xl border border-gray-200 dark:border-[#293142] space-y-3">
            <Megaphone className="w-10 h-10 text-gray-400 mx-auto" />
            <p className="text-sm font-bold text-gray-700 dark:text-gray-300">
              {language === 'ar' ? 'لا توجد إعلانات مطابقة حالياً' : 'No sponsored ads match your search.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
