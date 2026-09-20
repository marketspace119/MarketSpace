import React, { useState, useEffect, useMemo } from 'react';
import {
  Sparkles,
  ArrowRight,
  Flame,
  UtensilsCrossed,
  Store as StoreIcon,
  Wrench,
  Boxes,
  ShoppingBag,
  ShieldCheck,
  Truck,
  PhoneCall,
  Megaphone,
  CreditCard,
  Lock,
  Star,
  CheckCircle2,
  Clock,
  Heart,
  Trash2,
  Compass,
} from 'lucide-react';
import { HeroBanner } from '../components/home/HeroBanner';
import { CategoriesGrid } from '../components/home/CategoriesGrid';
import { ProductCard } from '../components/common/ProductCard';
import { RestaurantCard } from '../components/common/RestaurantCard';
import { StoreCard } from '../components/common/StoreCard';
import { ServiceCard } from '../components/common/ServiceCard';
import { OfferCard } from '../components/common/OfferCard';
import { Product, Store } from '../types';
import { productService } from '../services/productService';
import { storeService } from '../services/storeService';
import { taxonomyService } from '../services/taxonomyService';
import { discoveryService, RecentlyViewedItem } from '../services/discoveryService';
import { useLanguage } from '../i18n/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { updatePageSEO } from '../services/seo';

interface HomePageProps {
  onNavigate: (path: string) => void;
  onQuickView: (product: Product) => void;
}

export const HomePage: React.FC<HomePageProps> = ({ onNavigate, onQuickView }) => {
  const { language, t } = useLanguage();
  const { user } = useAuth();
  const userId = user?.id || (user as any)?.uid || 'guest_user';

  const [products, setProducts] = useState<Product[]>([]);
  const [restaurants, setRestaurants] = useState<Store[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [followedStores, setFollowedStores] = useState<Store[]>([]);
  const [recentlyViewed, setRecentlyViewed] = useState<RecentlyViewedItem[]>([]);
  const [activeShopTab, setActiveShopTab] = useState<'all' | 'new' | 'used' | 'dropshipping'>('all');

  useEffect(() => {
    // Load products and vendors
    const allProds = productService.getAllProducts({ onlyPublished: true });
    setProducts(allProds);

    const approvedRestaurants = storeService.getAllStores({
      sellerType: 'restaurant',
      status: 'approved',
    });
    setRestaurants(approvedRestaurants);

    const approvedStores = storeService.getAllStores({
      sellerType: 'store',
      status: 'approved',
    });
    setStores(approvedStores);

    // Followed Stores
    const followed = storeService.getFollowedStores(userId);
    setFollowedStores(followed);

    // Recently Viewed
    const recents = discoveryService.getRecentlyViewed();
    setRecentlyViewed(recents);

    updatePageSEO({
      title: language === 'ar' ? 'MarketSpace | منصة التجارة المتكاملة في الصومال' : 'MarketSpace | Unified Commerce & Lifestyle Hub in Somalia',
      description: language === 'ar'
        ? 'تسوق أجهزة أصلية، ومأكولات شهية، واستكشف كبرى المتاجر والخدمات والفرص الإعلانية في مقديشو'
        : 'Multi-vendor marketplace offering new and pre-owned electronics, dining, services, and secure local mobile payments.',
      type: 'website',
      breadcrumbs: [{ name: t('breadcrumbHome'), url: '/' }],
      language,
    });
  }, [language, t, userId]);

  const handleClearRecentlyViewed = () => {
    discoveryService.clearRecentlyViewed();
    setRecentlyViewed([]);
  };

  // Flash Offers (Deals)
  const offerProducts = useMemo(() => {
    return products
      .filter((p) => p.isOffer || (p.discount && p.discount > 0) || (p.oldPrice && p.oldPrice > p.price))
      .slice(0, 4);
  }, [products]);

  // Shop Highlights filtered by condition tab
  const shopProducts = useMemo(() => {
    const list = products.filter((p) => {
      const cls = taxonomyService.classify(p);
      if (cls.marketplaceType !== 'shop') return false;

      if (activeShopTab === 'new') return cls.productCondition === 'new';
      if (activeShopTab === 'used') return cls.productCondition === 'used';
      if (activeShopTab === 'dropshipping') return cls.productCondition === 'dropshipping';
      return true;
    });
    return list.slice(0, 6);
  }, [products, activeShopTab]);

  // Featured Services
  const servicesList = useMemo(() => {
    return products.filter((p) => p.type === 'services').slice(0, 3);
  }, [products]);

  // Sponsored Ads
  const sponsoredAds = useMemo(() => {
    return products.filter((p) => p.type === 'ads').slice(0, 2);
  }, [products]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-4 space-y-12 sm:space-y-16 animate-fadeIn">
      {/* 1. Hero Section */}
      <HeroBanner onExplore={() => onNavigate('/shop')} />

      {/* 2. Quick Access Bar / Domain Hubs */}
      <CategoriesGrid onSelectCategory={(path) => onNavigate(path)} />

      {/* Discovery Quick Navigation Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl bg-white dark:bg-[#151A23] border border-gray-200 dark:border-[#293142] text-xs">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-[#0E11B7] dark:text-[#3B82F6]" />
          <span className="font-black text-gray-900 dark:text-white">
            {t('discoveryEngine')}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onNavigate('/categories')}
            className="px-3 py-1.5 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 text-gray-800 dark:text-gray-200 font-bold transition flex items-center gap-1.5"
          >
            <span>{t('browseAllCategories')}</span>
            <ArrowRight className="w-3 h-3 rtl:rotate-180" />
          </button>
          <button
            type="button"
            onClick={() => onNavigate('/nearby')}
            className="px-3 py-1.5 rounded-xl bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 font-bold hover:bg-purple-100 transition flex items-center gap-1.5"
          >
            <Compass className="w-3.5 h-3.5" />
            <span>{t('nearbyTitle')}</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('/following')}
            className="px-3 py-1.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 font-bold hover:bg-rose-100 transition flex items-center gap-1.5"
          >
            <Heart className="w-3.5 h-3.5 fill-current" />
            <span>{t('followingTitle')}</span>
          </button>
        </div>
      </div>

      {/* 2.1 Recently Viewed Items Section (Real user signal) */}
      {recentlyViewed.length > 0 && (
        <section className="space-y-4 animate-fadeIn">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#0E11B7] dark:text-[#3B82F6]" />
              <h2 className="text-lg font-black text-gray-900 dark:text-white">
                {t('recentlyViewed')}
              </h2>
            </div>
            <button
              type="button"
              onClick={handleClearRecentlyViewed}
              className="text-xs font-bold text-gray-400 hover:text-rose-500 flex items-center gap-1 transition"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{t('clearHistory')}</span>
            </button>
          </div>

          <div className="flex items-center gap-3.5 overflow-x-auto pb-2 scrollbar-none">
            {recentlyViewed.map(item => (
              <div
                key={item.id}
                onClick={() =>
                  onNavigate(
                    item.type === 'restaurant'
                      ? `/restaurant/${item.slug}`
                      : item.type === 'store'
                      ? `/store/${item.slug}`
                      : `/product/${item.slug}`
                  )
                }
                className="w-44 shrink-0 p-3 rounded-2xl bg-white dark:bg-[#151A23] border border-gray-200 dark:border-[#293142] hover:border-[#0E11B7] transition cursor-pointer shadow-xs group"
              >
                <img
                  src={item.image}
                  alt=""
                  className="w-full h-28 object-cover rounded-xl border border-gray-100 dark:border-gray-800 mb-2 group-hover:scale-[1.02] transition-transform"
                />
                <h4 className="font-bold text-xs text-gray-900 dark:text-white truncate">
                  {item.title[language] || item.title.en}
                </h4>
                {item.price !== undefined && (
                  <span className="text-xs font-black text-[#0E11B7] dark:text-[#3B82F6] block mt-1">
                    ${item.price.toFixed(2)}
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 2.2 Followed Stores Highlights (Real user signals) */}
      {followedStores.length > 0 && (
        <section className="space-y-4 animate-fadeIn">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Heart className="w-4 h-4 text-rose-500 fill-current" />
              <h2 className="text-lg font-black text-gray-900 dark:text-white">
                {t('fromStoresYouFollow')}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('/following')}
              className="text-xs font-bold text-[#0E11B7] dark:text-[#3B82F6] hover:underline flex items-center gap-1"
            >
              <span>{t('viewAll')}</span>
              <ArrowRight className="w-3.5 h-3.5 rtl:rotate-180" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {followedStores.slice(0, 3).map(store => (
              <StoreCard
                key={store.id}
                store={store}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        </section>
      )}

      {/* 3. Flash Offers / Daily Deals Section */}
      {offerProducts.length > 0 && (
        <section className="p-5 sm:p-7 rounded-3xl bg-gradient-to-r from-rose-500/10 via-amber-500/5 to-transparent border border-rose-200 dark:border-rose-950/50 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-600 text-white flex items-center justify-center shadow-md shadow-rose-600/20">
                <Flame className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white">
                    {t('flashDealsTitle')}
                  </h2>
                  <span className="px-2.5 py-0.5 rounded-full bg-rose-600 text-white text-[10px] font-black uppercase">
                    Up to 50% OFF
                  </span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {language === 'ar' ? 'تخفيضات اليوم المحدودة بأسعار استثنائية' : 'Daily limited-time markdowns with verified savings'}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onNavigate('/offers')}
              className="inline-flex items-center gap-1.5 text-xs font-black text-rose-600 dark:text-rose-400 hover:underline"
            >
              <span>{t('viewAllOffers')}</span>
              <ArrowRight className="w-4 h-4 rtl:rotate-180" />
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6">
            {offerProducts.map((product) => (
              <OfferCard
                key={product.id}
                product={product}
                onQuickView={onQuickView}
                onNavigate={(slug) => onNavigate(`/product/${slug}`)}
              />
            ))}
          </div>
        </section>
      )}

      {/* 4. Shop Highlights (New, Used, Dropshipping) */}
      <section className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-bold text-[#0E11B7] dark:text-[#3B82F6] mb-1">
              <ShoppingBag className="w-3.5 h-3.5" />
              <span>{t('shop')}</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white">
              {language === 'ar' ? 'مختارات المتجر الإلكتروني' : 'Curated Shop Selections'}
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {language === 'ar' ? 'منتجات أصلية جديدة، وأجهزة مستعملة مفحوصة، ومستوردات عالمية' : 'Brand new arrivals, tested pre-owned devices, and global dropshipping goods'}
            </p>
          </div>

          {/* Condition Sub-Tabs */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            {[
              { id: 'all', label: t('allShopProducts') },
              { id: 'new', label: t('breadcrumbNew') },
              { id: 'used', label: t('breadcrumbUsed') },
              { id: 'dropshipping', label: t('breadcrumbDropshipping') },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveShopTab(tab.id as any)}
                className={`py-2 px-3.5 rounded-full text-xs font-bold whitespace-nowrap transition-all ${
                  activeShopTab === tab.id
                    ? 'bg-[#0E11B7] text-white shadow-md shadow-blue-900/20'
                    : 'bg-gray-100 dark:bg-[#151A23] text-gray-700 dark:text-gray-300 hover:bg-gray-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5 sm:gap-4">
          {shopProducts.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              onQuickView={onQuickView}
              onNavigate={(slug) => onNavigate(`/product/${slug}`)}
            />
          ))}
        </div>

        <div className="text-center pt-2">
          <button
            type="button"
            onClick={() => onNavigate(activeShopTab === 'all' ? '/shop' : `/shop/${activeShopTab}`)}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl border border-gray-200 dark:border-[#293142] hover:border-[#0E11B7] bg-white dark:bg-[#151A23] text-xs font-black text-gray-900 dark:text-white shadow-xs transition"
          >
            <span>{t('viewAllProducts')}</span>
            <ArrowRight className="w-3.5 h-3.5 rtl:rotate-180" />
          </button>
        </div>
      </section>

      {/* 5. Restaurants Spotlight */}
      {restaurants.length > 0 && (
        <section className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-1.5 text-xs font-bold text-orange-600 dark:text-orange-400 mb-1">
                <UtensilsCrossed className="w-3.5 h-3.5" />
                <span>{t('restaurants')}</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white">
                {language === 'ar' ? 'أشهر المطابخ والمطاعم السريعة' : 'Top Rated Mogadishu Restaurants'}
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {language === 'ar' ? 'اطلب وجباتك الشهية مع توصيل سريع وتتبع فوري' : 'Order delicious meals, burgers, and traditional dishes with fast delivery'}
              </p>
            </div>

            <button
              type="button"
              onClick={() => onNavigate('/restaurants')}
              className="inline-flex items-center gap-1.5 text-xs font-black text-orange-600 dark:text-orange-400 hover:underline"
            >
              <span>{t('viewAllRestaurants')}</span>
              <ArrowRight className="w-4 h-4 rtl:rotate-180" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {restaurants.slice(0, 3).map((restaurant) => (
              <RestaurantCard
                key={restaurant.id}
                restaurant={restaurant}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        </section>
      )}

      {/* 6. Stores Directory Spotlight */}
      {stores.length > 0 && (
        <section className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-1.5 text-xs font-bold text-[#0E11B7] dark:text-[#3B82F6] mb-1">
                <StoreIcon className="w-3.5 h-3.5" />
                <span>{t('stores')}</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white">
                {language === 'ar' ? 'متاجر وبوتيكات رسمية معتمدة' : 'Official Brands & Authorized Stores'}
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {language === 'ar' ? 'تسوق مباشرة من كبرى المتاجر الرسمية الموثوقة مع ضمان الأصالة' : 'Shop directly from premier local boutiques with genuine product authenticity'}
              </p>
            </div>

            <button
              type="button"
              onClick={() => onNavigate('/stores')}
              className="inline-flex items-center gap-1.5 text-xs font-black text-[#0E11B7] dark:text-[#3B82F6] hover:underline"
            >
              <span>{t('viewAllStores')}</span>
              <ArrowRight className="w-4 h-4 rtl:rotate-180" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {stores.slice(0, 3).map((store) => (
              <StoreCard
                key={store.id}
                store={store}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        </section>
      )}

      {/* 7. Services Spotlight */}
      {servicesList.length > 0 && (
        <section className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 mb-1">
                <Wrench className="w-3.5 h-3.5" />
                <span>{t('services')}</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white">
                {language === 'ar' ? 'خدمات برمجية وتقنية واستشارية' : 'Verified Professional Services'}
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {language === 'ar' ? 'تعاقد مع أفضل المطورين والمصممين والخبراء التقنيين المعتمدين' : 'Hire top certified developers, creative designers, and business consultants'}
              </p>
            </div>

            <button
              type="button"
              onClick={() => onNavigate('/services')}
              className="inline-flex items-center gap-1.5 text-xs font-black text-emerald-600 dark:text-emerald-400 hover:underline"
            >
              <span>{t('viewAllServices')}</span>
              <ArrowRight className="w-4 h-4 rtl:rotate-180" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {servicesList.map((service) => (
              <ServiceCard
                key={service.id}
                service={service}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        </section>
      )}

      {/* 8. Sponsored Commercial Showcase (Ads) */}
      {sponsoredAds.length > 0 && (
        <section className="p-6 sm:p-8 rounded-3xl bg-amber-500/5 dark:bg-amber-950/20 border-2 border-amber-400/40 dark:border-amber-600/30 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Megaphone className="w-5 h-5 text-amber-500" />
              <div>
                <h3 className="text-lg font-black text-gray-900 dark:text-white">
                  {t('commercialAdsTitle')}
                </h3>
                <span className="text-[11px] text-amber-600 dark:text-amber-400 font-bold uppercase tracking-wider">
                  {t('sponsoredAd')}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onNavigate('/ads')}
              className="inline-flex items-center gap-1 text-xs font-bold text-amber-600 dark:text-amber-400 hover:underline"
            >
              <span>{t('viewAllAds')}</span>
              <ArrowRight className="w-3.5 h-3.5 rtl:rotate-180" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {sponsoredAds.map((ad) => (
              <div
                key={ad.id}
                onClick={() => onNavigate(`/product/${ad.slug}`)}
                className="flex items-center gap-4 p-4 rounded-2xl bg-white dark:bg-[#151A23] border border-amber-200 dark:border-amber-900/40 hover:border-amber-500 transition cursor-pointer shadow-xs"
              >
                <img
                  src={ad.thumbnail || ad.images[0]}
                  alt=""
                  className="w-20 h-20 rounded-xl object-cover shrink-0"
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
        </section>
      )}

      {/* 9. Why MarketSpace / Trust Badges & Local Somali Mobile Money */}
      <section className="pt-6 pb-2 border-t border-gray-200 dark:border-[#222B38]">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6">
          <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#151A23] border border-gray-100 dark:border-[#263042] text-center space-y-2">
            <div className="w-10 h-10 mx-auto rounded-xl bg-blue-100 dark:bg-blue-950/50 text-[#0E11B7] flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-xs sm:text-sm text-gray-900 dark:text-white">
              {language === 'ar' ? 'حماية المشتري 100%' : '100% Buyer Protection'}
            </h3>
            <p className="text-[11px] text-gray-500 leading-relaxed">
              {language === 'ar' ? 'ضمان فحص الأجهزة واسترجاع آمن خلال 14 يوماً' : 'Tested tech warranty and secure 14-day refund guarantee'}
            </p>
          </div>

          <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#151A23] border border-gray-100 dark:border-[#263042] text-center space-y-2">
            <div className="w-10 h-10 mx-auto rounded-xl bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 flex items-center justify-center">
              <CreditCard className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-xs sm:text-sm text-gray-900 dark:text-white">
              {language === 'ar' ? 'دفع محلي عبر المحافظ' : 'Somali Mobile Money'}
            </h3>
            <p className="text-[11px] text-gray-500 leading-relaxed">
              EVC Plus • Zaad • Sahal {language === 'ar' ? 'والدفع عند الاستلام (COD)' : '& Cash On Delivery'}
            </p>
          </div>

          <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#151A23] border border-gray-100 dark:border-[#263042] text-center space-y-2">
            <div className="w-10 h-10 mx-auto rounded-xl bg-orange-100 dark:bg-orange-950/50 text-orange-600 flex items-center justify-center">
              <Truck className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-xs sm:text-sm text-gray-900 dark:text-white">
              {language === 'ar' ? 'توصيل سريع في مقديشو' : 'Express Delivery'}
            </h3>
            <p className="text-[11px] text-gray-500 leading-relaxed">
              {language === 'ar' ? 'توصيل خلال ساعات للمطاعم وخلال يوم للمنتجات' : 'Within hours for dining meals & same/next day for shop'}
            </p>
          </div>

          <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#151A23] border border-gray-100 dark:border-[#263042] text-center space-y-2">
            <div className="w-10 h-10 mx-auto rounded-xl bg-purple-100 dark:bg-purple-950/50 text-purple-600 flex items-center justify-center">
              <PhoneCall className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-xs sm:text-sm text-gray-900 dark:text-white">
              {language === 'ar' ? 'دعم العملاء وواتساب' : 'WhatsApp Support'}
            </h3>
            <p className="text-[11px] text-gray-500 leading-relaxed">
              {language === 'ar' ? 'فريق خدمة عملاء متاح طوال أيام الأسبوع' : 'Real-time customer support ready to assist with any inquiry'}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
};
