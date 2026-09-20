import React from 'react';
import {
  ShoppingBag,
  UtensilsCrossed,
  Store,
  Wrench,
  Flame,
  Megaphone,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';

interface CategoriesGridProps {
  onSelectCategory: (path: string) => void;
}

export const CategoriesGrid: React.FC<CategoriesGridProps> = ({ onSelectCategory }) => {
  const { language, t } = useLanguage();

  const domains = [
    {
      id: 'shop',
      title: t('shop'),
      subtitle: t('breadcrumbNew') + ' • ' + t('breadcrumbUsed') + ' • ' + t('breadcrumbDropshipping'),
      path: '/shop',
      icon: <ShoppingBag className="w-6 h-6" />,
      color: 'from-blue-600 to-indigo-700',
      badge: t('allShopProducts'),
    },
    {
      id: 'restaurants',
      title: t('restaurants'),
      subtitle: language === 'ar' ? 'أشهى المأكولات، وجبات سريعة وقوائم طعام' : 'Fast food, burger grills & quick delivery',
      path: '/restaurants',
      icon: <UtensilsCrossed className="w-6 h-6" />,
      color: 'from-orange-500 to-amber-600',
      badge: t('viewFoodMenu'),
    },
    {
      id: 'stores',
      title: t('stores'),
      subtitle: language === 'ar' ? 'متاجر وبوتيكات رسمية ومعتمدة' : 'Official boutiques & verified outlets',
      path: '/stores',
      icon: <Store className="w-6 h-6" />,
      color: 'from-indigo-600 to-blue-800',
      badge: t('verifiedSeller'),
    },
    {
      id: 'services',
      title: t('services'),
      subtitle: language === 'ar' ? 'برمجة، تصميم، استشارات وصيانة' : 'Freelancers, software, design & consulting',
      path: '/services',
      icon: <Wrench className="w-6 h-6" />,
      color: 'from-emerald-600 to-teal-700',
      badge: t('bookService'),
    },
    {
      id: 'offers',
      title: t('offers'),
      subtitle: language === 'ar' ? 'خصومات يومية وعروض محدودة الوقت' : 'Daily discounts & exclusive coupons',
      path: '/offers',
      icon: <Flame className="w-6 h-6" />,
      color: 'from-rose-600 to-pink-700',
      badge: t('flashDealsTitle'),
    },
    {
      id: 'ads',
      title: t('ads'),
      subtitle: language === 'ar' ? 'إعلانات الشركاء والفرص التجارية' : 'Commercial sponsors & partner notices',
      path: '/ads',
      icon: <Megaphone className="w-6 h-6" />,
      color: 'from-amber-600 to-orange-700',
      badge: t('sponsoredAd'),
    },
  ];

  return (
    <section className="my-8">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white">
            {language === 'ar' ? 'القطاعات والأقسام الرئيسية' : 'Marketplace Domains & Hubs'}
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {language === 'ar'
              ? 'تصفح أقسام MarketSpace المصممة بتجربة متخصصة لكل قطاع'
              : 'Dedicated shopping, dining, services, and commercial hubs'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5 sm:gap-4">
        {domains.map((dom) => (
          <button
            key={dom.id}
            type="button"
            onClick={() => onSelectCategory(dom.path)}
            className="group relative flex flex-col justify-between p-4 rounded-2xl bg-white dark:bg-[#151A23] border border-gray-200 dark:border-[#293142] hover:border-transparent hover:shadow-xl hover:-translate-y-1 transition-all duration-300 text-start overflow-hidden"
          >
            {/* Top Accent Icon */}
            <div className="flex items-center justify-between mb-3">
              <div
                className={`w-11 h-11 rounded-xl bg-gradient-to-br ${dom.color} text-white flex items-center justify-center shadow-md group-hover:scale-110 transition-transform duration-300`}
              >
                {dom.icon}
              </div>
              <span className="text-[9px] font-black uppercase text-gray-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                <ArrowRight className="w-3.5 h-3.5 rtl:rotate-180" />
              </span>
            </div>

            {/* Title & Subtitle */}
            <div className="space-y-1">
              <h3 className="font-bold text-sm text-gray-900 dark:text-white group-hover:text-[#0E11B7] dark:group-hover:text-[#3B82F6] transition-colors line-clamp-1">
                {dom.title}
              </h3>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 line-clamp-2 leading-relaxed">
                {dom.subtitle}
              </p>
            </div>

            {/* Bottom Tag */}
            <div className="mt-3 pt-2.5 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between text-[10px] font-bold text-gray-500">
              <span className="truncate">{dom.badge}</span>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
};
