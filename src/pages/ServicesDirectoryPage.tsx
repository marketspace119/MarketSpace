import React, { useState, useEffect, useMemo } from 'react';
import {
  Wrench,
  Search,
  Star,
  RotateCcw,
  Sparkles,
  ChevronRight,
  ShieldCheck,
  CheckCircle2,
} from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import { Product } from '../types';
import { productService } from '../services/productService';
import { ServiceCard } from '../components/common/ServiceCard';
import { taxonomyService } from '../services/taxonomyService';
import { updatePageSEO } from '../services/seo';

interface ServicesDirectoryPageProps {
  onNavigate: (path: string) => void;
}

export const ServicesDirectoryPage: React.FC<ServicesDirectoryPageProps> = ({
  onNavigate,
}) => {
  const { language, t } = useLanguage();
  const [services, setServices] = useState<Product[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [minRating, setMinRating] = useState<number>(0);

  const categories = useMemo(() => taxonomyService.getServiceCategories(), []);

  useEffect(() => {
    // Load services from catalog
    const allServices = productService.getAllProducts({
      type: 'services',
      onlyPublished: true,
    });
    setServices(allServices);

    updatePageSEO({
      title: language === 'ar' ? 'دليل الخدمات الاحترافية وحجز الاستشارات | MarketSpace' : 'Professional Services & Consulting Directory | MarketSpace',
      description: language === 'ar'
        ? 'احجز أفضل مزودي الخدمات في البرمجة، التصميم، الصيانة، والاستشارات مع ضمان إنجاز الأعمال'
        : 'Book top verified freelancers and agencies for software, design, IT maintenance, and business consulting',
      type: 'website',
      breadcrumbs: [
        { name: t('breadcrumbHome'), url: '/' },
        { name: t('breadcrumbServices'), url: '/services' },
      ],
      language,
    });
  }, [language, t]);

  const filteredServices = useMemo(() => {
    return services.filter(svc => {
      // Search
      const title = (svc.title[language] || svc.title.en).toLowerCase();
      const desc = (svc.description[language] || svc.description.en).toLowerCase();
      const provider = (svc.seller?.name || '').toLowerCase();
      const tags = svc.tags.join(' ').toLowerCase();
      const matchesSearch =
        !searchQuery.trim() ||
        title.includes(searchQuery.toLowerCase()) ||
        desc.includes(searchQuery.toLowerCase()) ||
        provider.includes(searchQuery.toLowerCase()) ||
        tags.includes(searchQuery.toLowerCase());

      // Category
      const matchesCategory =
        selectedCategory === 'all' ||
        svc.category === selectedCategory ||
        svc.categories.includes(selectedCategory);

      // Rating
      const matchesRating = minRating === 0 || svc.rating >= minRating;

      return matchesSearch && matchesCategory && matchesRating;
    });
  }, [services, searchQuery, selectedCategory, minRating, language]);

  const handleReset = () => {
    setSearchQuery('');
    setSelectedCategory('all');
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
            {t('breadcrumbServices')}
          </span>
        </nav>

        {/* Hero Banner */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-emerald-600 via-teal-700 to-emerald-800 text-white p-6 sm:p-10 shadow-xl">
          <div className="relative z-10 max-w-2xl space-y-3">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 backdrop-blur-md text-xs font-bold text-white uppercase tracking-wider">
              <Wrench className="w-3.5 h-3.5" />
              <span>{t('services')}</span>
            </span>
            <h1 className="text-2xl sm:text-4xl font-black leading-tight">
              {language === 'ar'
                ? 'خدمات برمجية وتقنية واستشارية احترافية'
                : 'Top Professional Services & Expert Solutions'}
            </h1>
            <p className="text-xs sm:text-sm text-emerald-100/90 leading-relaxed">
              {language === 'ar'
                ? 'تعاقد مع أفضل الخبراء المعتمدين والمطورين والمصممين في الصومال مع حجز مرن وضمان جودة التسليم.'
                : 'Hire vetted developers, designers, IT experts, and business consultants with flexible milestone bookings.'}
            </p>
          </div>

          <div className="absolute end-4 -bottom-10 opacity-15 pointer-events-none">
            <Wrench className="w-72 h-72 text-white" />
          </div>
        </div>

        {/* Search & Filter Bar */}
        <div className="bg-white dark:bg-[#151A23] p-4 sm:p-5 rounded-2xl border border-gray-200 dark:border-[#293142] shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row items-center gap-3">
            {/* Search Input */}
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 absolute start-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={language === 'ar' ? 'ابحث عن خدمة، برمجة، تصميم، صيانة...' : 'Search services, programming, design...'}
                className="w-full ps-10 pe-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-[#1C2331] text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
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

            {/* Quick Rating Filter */}
            <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
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

              {(searchQuery || selectedCategory !== 'all' || minRating > 0) && (
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

          {/* Category Tabs */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            <button
              type="button"
              onClick={() => setSelectedCategory('all')}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all shrink-0 ${
                selectedCategory === 'all'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
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
                    ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200'
                }`}
              >
                {c.name[language] || c.name.en}
              </button>
            ))}
          </div>
        </div>

        {/* Services Grid */}
        {filteredServices.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredServices.map(service => (
              <ServiceCard
                key={service.id}
                service={service}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        ) : (
          /* Empty State */
          <div className="p-12 text-center bg-white dark:bg-[#151A23] rounded-3xl border border-gray-200 dark:border-[#293142] space-y-4">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 flex items-center justify-center">
              <Wrench className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">
              {t('noServicesFound')}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 max-w-md mx-auto">
              {language === 'ar'
                ? 'لم يتم العثور على خدمات مطابقة للبحث الحالي. جرب تغيير التصنيف أو كلمات البحث.'
                : 'No services match your active query. Try clearing filters or searching for different keywords.'}
            </p>
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold shadow-md shadow-emerald-600/20 hover:bg-emerald-700 transition"
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
