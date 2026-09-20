import React, { useState, useEffect, useMemo } from 'react';
import {
  Filter,
  SlidersHorizontal,
  RotateCcw,
  Search,
  Star,
  X,
  Boxes,
  Recycle,
  ShoppingBag,
  Sparkles,
  ChevronRight,
  ShieldCheck,
  Tag,
  CheckCircle2,
} from 'lucide-react';
import { ProductCard } from '../components/common/ProductCard';
import { Product, ProductCondition } from '../types';
import { productService } from '../services/productService';
import { taxonomyService, TaxonomyCategory } from '../services/taxonomyService';
import { useLanguage } from '../i18n/LanguageContext';
import { updatePageSEO } from '../services/seo';

export type ShopMode = 'all' | 'new' | 'used' | 'dropshipping';

interface ShopPageProps {
  initialCategory?: string;
  initialType?: string;
  mode?: ShopMode;
  onNavigate: (path: string) => void;
  onQuickView: (product: Product) => void;
}

export const ShopPage: React.FC<ShopPageProps> = ({
  initialCategory,
  initialType,
  mode = 'all',
  onNavigate,
  onQuickView,
}) => {
  const { language, t } = useLanguage();

  // Active mode state (can be changed via tabs or prop)
  const [activeMode, setActiveMode] = useState<ShopMode>(mode);

  // Products state from productService
  const [allProducts, setAllProducts] = useState<Product[]>(() =>
    productService.getAllProducts({ onlyPublished: true })
  );

  useEffect(() => {
    setActiveMode(mode);
  }, [mode]);

  useEffect(() => {
    setAllProducts(productService.getAllProducts({ onlyPublished: true }));
    const unsub = productService.subscribe(() => {
      setAllProducts(productService.getAllProducts({ onlyPublished: true }));
    });
    return () => unsub();
  }, []);

  // Filter States
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>(initialCategory || 'all');
  const [selectedSubcategory, setSelectedSubcategory] = useState<string>('all');
  const [selectedCondition, setSelectedCondition] = useState<string>('all');
  const [selectedSupplier, setSelectedSupplier] = useState<string>('all');
  const [minPrice, setMinPrice] = useState<string>('');
  const [maxPrice, setMaxPrice] = useState<string>('');
  const [minRating, setMinRating] = useState<number>(0);
  const [sortBy, setSortBy] = useState<string>('latest');
  const [onlyOffers, setOnlyOffers] = useState<boolean>(false);
  const [onlyInStock, setOnlyInStock] = useState<boolean>(false);
  const [isMobileFilterOpen, setIsMobileFilterOpen] = useState(false);
  const [displayCount, setDisplayCount] = useState<number>(12);

  // Reset category when mode changes
  const handleModeChange = (newMode: ShopMode) => {
    setActiveMode(newMode);
    setSelectedCategory('all');
    setSelectedSubcategory('all');
    setSelectedCondition('all');
    setSelectedSupplier('all');
    setDisplayCount(12);

    if (newMode === 'all') {
      onNavigate('/shop');
    } else {
      onNavigate(`/shop/${newMode}`);
    }
  };

  // Categories per mode
  const currentCategories: TaxonomyCategory[] = useMemo(() => {
    switch (activeMode) {
      case 'new':
        return taxonomyService.getNewCategories();
      case 'used':
        return taxonomyService.getUsedCategories();
      case 'dropshipping':
        return taxonomyService.getDropshippingCategories();
      default:
        // Combined shop categories
        return [
          ...taxonomyService.getNewCategories(),
          ...taxonomyService.getUsedCategories(),
          ...taxonomyService.getDropshippingCategories(),
        ].filter(
          (cat, idx, arr) => arr.findIndex((c) => c.slug === cat.slug) === idx
        );
    }
  }, [activeMode]);

  // Current category subcategories (for New products)
  const currentSubcategories = useMemo(() => {
    if (selectedCategory === 'all') return [];
    const cat = currentCategories.find((c) => c.slug === selectedCategory);
    return cat?.subcategories || [];
  }, [currentCategories, selectedCategory]);

  // Dynamic SEO Update
  useEffect(() => {
    let modeTitle = t('allShopProducts');
    if (activeMode === 'new') modeTitle = t('newProducts');
    if (activeMode === 'used') modeTitle = t('usedProducts');
    if (activeMode === 'dropshipping') modeTitle = t('dropshippingProducts');

    updatePageSEO({
      title: `${modeTitle} | MarketSpace`,
      description: t('shopSubtitle'),
      type: 'website',
      breadcrumbs: [
        { name: t('breadcrumbHome'), url: '/' },
        { name: t('breadcrumbShop'), url: '/shop' },
        ...(activeMode !== 'all'
          ? [
              {
                name:
                  activeMode === 'new'
                    ? t('breadcrumbNew')
                    : activeMode === 'used'
                    ? t('breadcrumbUsed')
                    : t('breadcrumbDropshipping'),
                url: `/shop/${activeMode}`,
              },
            ]
          : []),
      ],
      language,
    });
  }, [activeMode, language, t]);

  // Filter and Sort Pipeline
  const filteredProducts = useMemo(() => {
    // 1. Filter to shop products and match active condition mode
    let list = allProducts.filter((p) => {
      const cls = taxonomyService.classify(p);

      // Exclude restaurants and services from standard shop
      if (cls.marketplaceType === 'restaurants' || cls.marketplaceType === 'services') {
        return false;
      }

      // If specific mode, strictly match condition
      if (activeMode === 'new') {
        return cls.productCondition === 'new';
      }
      if (activeMode === 'used') {
        return cls.productCondition === 'used';
      }
      if (activeMode === 'dropshipping') {
        return cls.productCondition === 'dropshipping';
      }

      return true;
    });

    // 2. Search query
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter((p) => {
        const title = (p.title[language] || p.title.en).toLowerCase();
        const desc = (p.description[language] || p.description.en).toLowerCase();
        const brand = (p.brand || '').toLowerCase();
        const tags = p.tags.join(' ').toLowerCase();
        return (
          title.includes(q) ||
          desc.includes(q) ||
          brand.includes(q) ||
          tags.includes(q)
        );
      });
    }

    // 3. Category
    if (selectedCategory !== 'all') {
      list = list.filter(
        (p) =>
          p.category === selectedCategory ||
          p.categories.includes(selectedCategory)
      );
    }

    // 4. Subcategory
    if (selectedSubcategory !== 'all') {
      list = list.filter(
        (p) =>
          p.subcategory === selectedSubcategory ||
          p.tags.includes(selectedSubcategory)
      );
    }

    // 5. Condition filter (used mode)
    if (activeMode === 'used' && selectedCondition !== 'all') {
      list = list.filter((p) => {
        const condText =
          p.condition?.[language] || p.condition?.en || '';
        return condText.toLowerCase().includes(selectedCondition.toLowerCase());
      });
    }

    // 6. Supplier filter (dropshipping mode)
    if (activeMode === 'dropshipping' && selectedSupplier !== 'all') {
      list = list.filter(
        (p) =>
          p.supplier?.toLowerCase().includes(selectedSupplier.toLowerCase()) ||
          p.tags.includes(selectedSupplier.toLowerCase())
      );
    }

    // 7. Price range
    const min = parseFloat(minPrice);
    const max = parseFloat(maxPrice);
    if (!isNaN(min)) {
      list = list.filter((p) => p.price >= min);
    }
    if (!isNaN(max)) {
      list = list.filter((p) => p.price <= max);
    }

    // 8. Rating
    if (minRating > 0) {
      list = list.filter((p) => p.rating >= minRating);
    }

    // 9. In Stock Only
    if (onlyInStock) {
      list = list.filter((p) => p.stock > 0);
    }

    // 10. Offers Only
    if (onlyOffers) {
      list = list.filter(
        (p) => p.isOffer || (p.discount && p.discount > 0)
      );
    }

    // 11. Sorting
    switch (sortBy) {
      case 'price-low':
        list.sort((a, b) => a.price - b.price);
        break;
      case 'price-high':
        list.sort((a, b) => b.price - a.price);
        break;
      case 'rating':
        list.sort((a, b) => b.rating - a.rating);
        break;
      case 'popular':
        list.sort((a, b) => b.reviewsCount - a.reviewsCount);
        break;
      default:
        // latest
        list.sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        break;
    }

    return list;
  }, [
    allProducts,
    activeMode,
    search,
    selectedCategory,
    selectedSubcategory,
    selectedCondition,
    selectedSupplier,
    minPrice,
    maxPrice,
    minRating,
    onlyInStock,
    onlyOffers,
    sortBy,
    language,
  ]);

  const displayedProducts = filteredProducts.slice(0, displayCount);
  const hasMore = displayCount < filteredProducts.length;

  const handleResetFilters = () => {
    setSearch('');
    setSelectedCategory('all');
    setSelectedSubcategory('all');
    setSelectedCondition('all');
    setSelectedSupplier('all');
    setMinPrice('');
    setMaxPrice('');
    setMinRating(0);
    setOnlyInStock(false);
    setOnlyOffers(false);
    setSortBy('latest');
    setDisplayCount(12);
  };

  const getHeroDetails = () => {
    switch (activeMode) {
      case 'new':
        return {
          title: language === 'ar' ? 'سوق المنتجات الجديدة والمضمونة' : 'Brand New & Factory Sealed Products',
          subtitle: language === 'ar' ? 'أحدث الأجهزة والإلكترونيات والأزياء الأصلية مع كفالة شاملة وتوصيل فوري' : 'Latest electronics, authentic cosmetics, and trendy apparel with factory warranty',
          badge: t('newProducts'),
          bgGradient: 'from-blue-600 via-indigo-700 to-[#0E11B7]',
          icon: <ShoppingBag className="w-4 h-4" />,
        };
      case 'used':
        return {
          title: language === 'ar' ? 'سوق المستعمل والمفحوص تقنياً' : 'Pre-Owned & Certified Inspected Tech',
          subtitle: language === 'ar' ? 'أجهزة هواتف ولابتوبات مستعملة بحالة ممتازة ومفحوصة بدقة مع ضمان تجربة حقيقي' : 'Fully tested smartphones, laptops, and appliances with certified test warranty',
          badge: t('usedProducts'),
          bgGradient: 'from-teal-600 via-emerald-700 to-teal-800',
          icon: <Recycle className="w-4 h-4" />,
        };
      case 'dropshipping':
        return {
          title: language === 'ar' ? 'الدروبشيبينغ العالمي (شين، علي إكسبريس)' : 'Global Direct Dropshipping & Trends',
          subtitle: language === 'ar' ? 'أحدث صيحات الموضة من شين وابتكارات علي بابا مع ضمان الدفع عند الاستلام والتوصيل لمقديشو' : 'Curated trends from Shein and global manufacturers delivered directly to Somalia',
          badge: t('dropshippingProducts'),
          bgGradient: 'from-purple-600 via-indigo-700 to-purple-800',
          icon: <Boxes className="w-4 h-4" />,
        };
      default:
        return {
          title: language === 'ar' ? 'المتجر الإلكتروني الشامل' : 'MarketSpace Official Mega Store',
          subtitle: language === 'ar' ? 'تصفح تشكيلاتنا الكاملة من المنتجات الجديدة والمستعملة والمستوردة عالمياً' : 'Browse thousands of verified products across all departments and verified conditions',
          badge: t('allShopProducts'),
          bgGradient: 'from-[#0E11B7] via-indigo-900 to-slate-900',
          icon: <Sparkles className="w-4 h-4" />,
        };
    }
  };

  const hero = getHeroDetails();

  return (
    <div className="min-h-screen bg-gray-50/50 dark:bg-[#0B1120] py-6 sm:py-10 px-4 sm:px-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Breadcrumb Navigation */}
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          <button onClick={() => onNavigate('/')} className="hover:text-[#0E11B7] dark:hover:text-[#3B82F6]">
            {t('breadcrumbHome')}
          </button>
          <ChevronRight className="w-3.5 h-3.5 rtl:rotate-180 text-gray-400" />
          <button
            onClick={() => handleModeChange('all')}
            className={`hover:text-[#0E11B7] dark:hover:text-[#3B82F6] ${
              activeMode === 'all' ? 'font-bold text-gray-900 dark:text-white' : ''
            }`}
          >
            {t('breadcrumbShop')}
          </button>
          {activeMode !== 'all' && (
            <>
              <ChevronRight className="w-3.5 h-3.5 rtl:rotate-180 text-gray-400" />
              <span className="font-bold text-gray-900 dark:text-white">
                {activeMode === 'new'
                  ? t('breadcrumbNew')
                  : activeMode === 'used'
                  ? t('breadcrumbUsed')
                  : t('breadcrumbDropshipping')}
              </span>
            </>
          )}
          {selectedCategory !== 'all' && (
            <>
              <ChevronRight className="w-3.5 h-3.5 rtl:rotate-180 text-gray-400" />
              <span className="text-gray-700 dark:text-gray-300">
                {currentCategories.find((c) => c.slug === selectedCategory)?.name[
                  language
                ] || selectedCategory}
              </span>
            </>
          )}
        </nav>

        {/* Hero Banner with Distinct Mode Atmosphere */}
        <div
          className={`relative overflow-hidden rounded-3xl bg-gradient-to-r ${hero.bgGradient} text-white p-6 sm:p-10 shadow-xl`}
        >
          <div className="relative z-10 max-w-2xl space-y-3">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 backdrop-blur-md text-xs font-bold text-white uppercase tracking-wider">
              {hero.icon}
              <span>{hero.badge}</span>
            </span>
            <h1 className="text-2xl sm:text-4xl font-black leading-tight">
              {hero.title}
            </h1>
            <p className="text-xs sm:text-sm text-blue-100/90 leading-relaxed">
              {hero.subtitle}
            </p>
          </div>

          <div className="absolute end-4 -bottom-10 opacity-10 pointer-events-none">
            <ShoppingBag className="w-72 h-72 text-white" />
          </div>
        </div>

        {/* Primary Shop Mode Tabs Switcher */}
        <div className="flex items-center gap-2 p-1.5 rounded-2xl bg-white dark:bg-[#151A23] border border-gray-200 dark:border-[#293142] shadow-sm overflow-x-auto">
          <button
            type="button"
            onClick={() => handleModeChange('all')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black transition-all shrink-0 ${
              activeMode === 'all'
                ? 'bg-[#0E11B7] text-white shadow-md shadow-blue-900/20'
                : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{t('allShopProducts')}</span>
          </button>

          <button
            type="button"
            onClick={() => handleModeChange('new')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black transition-all shrink-0 ${
              activeMode === 'new'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            <span>{t('newProducts')}</span>
          </button>

          <button
            type="button"
            onClick={() => handleModeChange('used')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black transition-all shrink-0 ${
              activeMode === 'used'
                ? 'bg-teal-600 text-white shadow-md shadow-teal-600/20'
                : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
          >
            <Recycle className="w-3.5 h-3.5" />
            <span>{t('usedProducts')}</span>
          </button>

          <button
            type="button"
            onClick={() => handleModeChange('dropshipping')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black transition-all shrink-0 ${
              activeMode === 'dropshipping'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-600/20'
                : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
          >
            <Boxes className="w-3.5 h-3.5" />
            <span>{t('dropshippingProducts')}</span>
          </button>
        </div>

        {/* Category Pills Slider for the Active Mode */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          <button
            type="button"
            onClick={() => {
              setSelectedCategory('all');
              setSelectedSubcategory('all');
            }}
            className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all shrink-0 ${
              selectedCategory === 'all'
                ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 shadow-sm'
                : 'bg-white dark:bg-[#151A23] border border-gray-200 dark:border-[#293142] text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
          >
            {t('allCategories')}
          </button>

          {currentCategories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => {
                setSelectedCategory(cat.slug);
                setSelectedSubcategory('all');
              }}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all shrink-0 ${
                selectedCategory === cat.slug
                  ? 'bg-[#0E11B7] text-white shadow-md shadow-blue-900/20'
                  : 'bg-white dark:bg-[#151A23] border border-gray-200 dark:border-[#293142] text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              {cat.name[language] || cat.name.en}
            </button>
          ))}
        </div>

        {/* Subcategories (if selected and available) */}
        {currentSubcategories.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
            <span className="text-gray-400 font-bold text-[11px] shrink-0">
              {language === 'ar' ? 'الأقسام الفرعية:' : 'Subcategories:'}
            </span>
            <button
              type="button"
              onClick={() => setSelectedSubcategory('all')}
              className={`px-2.5 py-1 rounded-lg font-medium transition ${
                selectedSubcategory === 'all'
                  ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 font-bold'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              {t('allCategories')}
            </button>
            {currentSubcategories.map((sub) => (
              <button
                key={sub.id}
                type="button"
                onClick={() => setSelectedSubcategory(sub.slug)}
                className={`px-2.5 py-1 rounded-lg font-medium transition shrink-0 ${
                  selectedSubcategory === sub.slug
                    ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 font-bold'
                    : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                {sub.name[language] || sub.name.en}
              </button>
            ))}
          </div>
        )}

        {/* Main Workspace: Filters Sidebar + Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 items-start">
          {/* Desktop Filter Sidebar */}
          <aside className="hidden lg:block bg-white dark:bg-[#151A23] p-5 rounded-2xl border border-gray-200 dark:border-[#293142] shadow-sm space-y-6">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-gray-800">
              <span className="text-sm font-black text-gray-900 dark:text-white flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-[#0E11B7]" />
                {t('applyFilters')}
              </span>
              <button
                type="button"
                onClick={handleResetFilters}
                className="text-xs text-gray-400 hover:text-red-500 transition-colors flex items-center gap-1"
                title={t('resetFilters')}
              >
                <RotateCcw className="w-3 h-3" />
                <span>{t('resetFilters')}</span>
              </button>
            </div>

            {/* Mode Specific Filters: Used condition */}
            {activeMode === 'used' && (
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block">
                  {t('condition')}
                </label>
                <div className="space-y-1">
                  {[
                    { id: 'all', label: t('allCategories') },
                    { id: 'like-new', label: t('conditionLikeNew') },
                    { id: 'excellent', label: t('conditionExcellent') },
                    { id: 'good', label: t('conditionGood') },
                  ].map((cond) => (
                    <button
                      key={cond.id}
                      type="button"
                      onClick={() => setSelectedCondition(cond.id)}
                      className={`w-full text-start px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                        selectedCondition === cond.id
                          ? 'bg-teal-50 text-teal-800 dark:bg-teal-950/40 dark:text-teal-300 font-bold'
                          : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                      }`}
                    >
                      {cond.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Mode Specific Filters: Dropshipping supplier */}
            {activeMode === 'dropshipping' && (
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block">
                  {t('supplier')}
                </label>
                <div className="space-y-1">
                  {[
                    { id: 'all', label: t('allCategories') },
                    { id: 'shein', label: 'Shein Express' },
                    { id: 'aliexpress', label: 'AliExpress Direct' },
                    { id: 'alibaba', label: 'Alibaba Verified' },
                    { id: 'amazon', label: 'Amazon Global' },
                  ].map((sup) => (
                    <button
                      key={sup.id}
                      type="button"
                      onClick={() => setSelectedSupplier(sup.id)}
                      className={`w-full text-start px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                        selectedSupplier === sup.id
                          ? 'bg-purple-50 text-purple-800 dark:bg-purple-950/40 dark:text-purple-300 font-bold'
                          : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                      }`}
                    >
                      {sup.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Price Range */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block">
                {t('filterByPrice')} ($)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  placeholder={t('minPrice')}
                  value={minPrice}
                  onChange={(e) => setMinPrice(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg text-xs border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#1C2331] text-gray-900 dark:text-white"
                />
                <span className="text-gray-400 text-xs">-</span>
                <input
                  type="number"
                  placeholder={t('maxPrice')}
                  value={maxPrice}
                  onChange={(e) => setMaxPrice(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg text-xs border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#1C2331] text-gray-900 dark:text-white"
                />
              </div>
            </div>

            {/* Rating Filter */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block">
                {t('rating')}
              </label>
              <div className="space-y-1">
                {[
                  { value: 0, label: t('allRatings') },
                  { value: 4.5, label: t('rating45') },
                  { value: 4.0, label: t('rating40') },
                  { value: 3.0, label: t('rating30') },
                ].map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => setMinRating(r.value)}
                    className={`w-full text-start px-2.5 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 ${
                      minRating === r.value
                        ? 'bg-blue-50 text-[#0E11B7] dark:bg-blue-950/40 dark:text-blue-300 font-bold'
                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                    }`}
                  >
                    <Star
                      className={`w-3.5 h-3.5 ${
                        r.value > 0
                          ? 'fill-amber-400 text-amber-400'
                          : 'text-gray-400'
                      }`}
                    />
                    <span>{r.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* In Stock & Offers Toggles */}
            <div className="space-y-2 pt-3 border-t border-gray-100 dark:border-gray-800">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={onlyInStock}
                  onChange={(e) => setOnlyInStock(e.target.checked)}
                  className="rounded border-gray-300 text-[#0E11B7] focus:ring-[#0E11B7]"
                />
                <span>{t('inStock')}</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={onlyOffers}
                  onChange={(e) => setOnlyOffers(e.target.checked)}
                  className="rounded border-gray-300 text-rose-600 focus:ring-rose-500"
                />
                <span className="text-rose-600 dark:text-rose-400 font-bold">
                  {t('flashDealsTitle')}
                </span>
              </label>
            </div>
          </aside>

          {/* Main Content Area */}
          <div className="lg:col-span-3 space-y-6">
            {/* Search & Sort Bar */}
            <div className="bg-white dark:bg-[#151A23] p-4 rounded-2xl border border-gray-200 dark:border-[#293142] shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
              {/* Search Box */}
              <div className="relative w-full sm:w-80">
                <Search className="w-4 h-4 absolute start-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t('searchPlaceholder')}
                  className="w-full ps-9 pe-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-[#1C2331] text-xs text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#0E11B7]"
                />
              </div>

              {/* Mobile Filter Button & Sort Selector */}
              <div className="flex items-center justify-between w-full sm:w-auto gap-3">
                <button
                  type="button"
                  onClick={() => setIsMobileFilterOpen(true)}
                  className="lg:hidden px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#1C2331] text-xs font-bold text-gray-800 dark:text-gray-200 flex items-center gap-1.5"
                >
                  <Filter className="w-3.5 h-3.5" />
                  <span>{t('applyFilters')}</span>
                </button>

                <div className="flex items-center gap-2 text-xs">
                  <span className="text-gray-400 hidden sm:inline">{t('sortBy')}:</span>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#1C2331] text-xs font-bold text-gray-800 dark:text-gray-200 focus:outline-none"
                  >
                    <option value="latest">{t('sortLatest')}</option>
                    <option value="price-low">{t('sortPriceLow')}</option>
                    <option value="price-high">{t('sortPriceHigh')}</option>
                    <option value="rating">{t('sortRating')}</option>
                    <option value="popular">{t('sortPopular')}</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Results Count Summary */}
            <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 px-1">
              <span>
                {language === 'ar'
                  ? `عرض ${displayedProducts.length} من إجمالي ${filteredProducts.length} منتج`
                  : `Showing ${displayedProducts.length} of ${filteredProducts.length} products`}
              </span>
            </div>

            {/* Products Grid */}
            {displayedProducts.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6">
                {displayedProducts.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    onQuickView={onQuickView}
                    onNavigate={(slug) => onNavigate(`/product/${slug}`)}
                  />
                ))}
              </div>
            ) : (
              /* Dedicated Empty State per mode */
              <div className="p-12 text-center bg-white dark:bg-[#151A23] rounded-3xl border border-gray-200 dark:border-[#293142] space-y-4">
                <div className="w-16 h-16 mx-auto rounded-2xl bg-blue-50 dark:bg-blue-950/40 text-[#0E11B7] dark:text-[#3B82F6] flex items-center justify-center">
                  <ShoppingBag className="w-8 h-8" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                  {t('noProductsInDomain')}
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 max-w-md mx-auto">
                  {language === 'ar'
                    ? 'لم نعثر على منتجات تطابق معايير الفلترة الحالية. جرب تغيير السعر أو الكلمات المفتاحية أو التصنيف.'
                    : 'No items match your active filters in this category. Try adjusting price ranges or clearing filters.'}
                </p>
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#0E11B7] text-white text-xs font-bold shadow-md shadow-blue-900/20 hover:bg-blue-800 transition"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>{t('resetFilters')}</span>
                </button>
              </div>
            )}

            {/* Pagination / Load More */}
            {hasMore && (
              <div className="pt-6 text-center">
                <button
                  type="button"
                  onClick={() => setDisplayCount((prev) => prev + 12)}
                  className="px-6 py-2.5 rounded-xl bg-white dark:bg-[#151A23] border border-gray-200 dark:border-[#293142] hover:bg-gray-50 dark:hover:bg-gray-800 text-xs font-black text-gray-900 dark:text-white shadow-sm transition"
                >
                  {t('loadMore')} ({filteredProducts.length - displayedProducts.length})
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
