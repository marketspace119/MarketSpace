import React, { useState, useEffect } from 'react';
import {
  Utensils,
  Clock,
  Truck,
  DollarSign,
  Star,
  ShieldCheck,
  Plus,
  Minus,
  ShoppingBag,
  MessageCircle,
  Phone,
  MapPin,
  Check,
  Sparkles,
  ChevronRight,
  Info,
  Calendar,
} from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import { useCart } from '../context/CartContext';
import { Store, Product, ProductAddon } from '../types';
import { storeService } from '../services/storeService';
import { productService } from '../services/productService';
import { updatePageSEO } from '../services/seo';
import { FoodCard } from '../components/common/FoodCard';

interface RestaurantPageProps {
  slug: string;
  onNavigate: (path: string) => void;
}

export const RestaurantPage: React.FC<RestaurantPageProps> = ({ slug, onNavigate }) => {
  const { language, t } = useLanguage();
  const { addItem } = useCart();

  const [restaurant, setRestaurant] = useState<Store | null>(null);
  const [meals, setMeals] = useState<Product[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [selectedMealForAddons, setSelectedMealForAddons] = useState<Product | null>(null);
  const [chosenAddons, setChosenAddons] = useState<ProductAddon[]>([]);
  const [mealQuantity, setMealQuantity] = useState<number>(1);
  const [customerNotes, setCustomerNotes] = useState<string>('');

  useEffect(() => {
    const foundStore = storeService.getStoreBySlug(slug);
    if (foundStore && foundStore.sellerType === 'restaurant') {
      setRestaurant(foundStore);
      const storeMeals = productService.getAllProducts({
        storeId: foundStore.id,
        onlyPublished: true,
      });
      setMeals(storeMeals);

      updatePageSEO({
        title: `${foundStore.name} | ${t('restaurantMenuTitle')}`,
        description:
          typeof foundStore.description === 'string'
            ? foundStore.description
            : foundStore.description[language] || foundStore.description.en,
        image: foundStore.cover,
        type: 'restaurant',
        breadcrumbs: [
          { name: t('breadcrumbHome'), url: '/' },
          { name: t('breadcrumbRestaurants'), url: '/restaurants' },
          { name: foundStore.name, url: `/restaurant/${foundStore.slug}` },
        ],
        language,
      });
    } else {
      updatePageSEO({
        title: language === 'ar' ? 'المطعم غير موجود | MarketSpace' : language === 'so' ? 'Makhaayadda Lama Helin | MarketSpace' : 'Restaurant Not Found | MarketSpace',
        description: language === 'ar' ? 'لم يتم العثور على المطعم المطلوب.' : 'The requested restaurant could not be found.',
        type: 'website',
        language,
      });
    }
  }, [slug, language, t]);

  if (!restaurant) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center p-8">
        <Utensils className="w-16 h-16 text-gray-300 mb-3" />
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          {t('noRestaurantsFound')}
        </h2>
        <p className="text-gray-500 mb-6 text-xs">
          {language === 'ar' ? 'لم يتم العثور على المطعم المطلوب.' : 'The requested restaurant was not found.'}
        </p>
        <button
          onClick={() => onNavigate('/restaurants')}
          className="bg-orange-600 text-white px-6 py-2.5 rounded-xl font-bold text-xs shadow-md"
        >
          {t('breadcrumbRestaurants')}
        </button>
      </div>
    );
  }

  const defaultAddonsList: ProductAddon[] = [
    { id: 'addon_sauce', name: { ar: 'صلصة ثوم إضافية', en: 'Extra Garlic Sauce', so: 'Suugo Toon Dheeraad ah' }, price: 0.5 },
    { id: 'addon_cheese', name: { ar: 'جبنة ذائبة شيدر', en: 'Extra Melted Cheddar', so: 'Farmaajo Cheddar Dheeraad ah' }, price: 1.0 },
    { id: 'addon_fries', name: { ar: 'بطاطس مقلية مقرمشة', en: 'Crispy French Fries', so: 'Bataato Shiilan' }, price: 1.5 },
    { id: 'addon_drink', name: { ar: 'مشروب غازي مثلج', en: 'Cold Soft Drink', so: 'Cabitaan Qabow' }, price: 1.0 },
  ];

  const handleOpenAddons = (meal: Product) => {
    setSelectedMealForAddons(meal);
    setChosenAddons([]);
    setMealQuantity(1);
    setCustomerNotes('');
  };

  const handleToggleAddon = (addon: ProductAddon) => {
    setChosenAddons(prev => {
      const exists = prev.some(a => a.id === addon.id);
      if (exists) {
        return prev.filter(a => a.id !== addon.id);
      } else {
        return [...prev, addon];
      }
    });
  };

  const handleConfirmAddMeal = () => {
    if (!selectedMealForAddons) return;

    addItem(
      selectedMealForAddons,
      mealQuantity,
      undefined,
      undefined,
      chosenAddons,
      customerNotes
    );

    setSelectedMealForAddons(null);
  };

  const categories = ['all', 'grills', 'fast-food', 'shawarma', 'beverages'];

  const filteredMeals = activeCategory === 'all'
    ? meals
    : meals.filter(m => m.category === activeCategory || m.categories?.includes(activeCategory));

  const restaurantDescription =
    typeof restaurant.description === 'string'
      ? restaurant.description
      : restaurant.description[language] || restaurant.description.en;

  const deliveryFee = restaurant.shippingFee !== undefined ? restaurant.shippingFee : 1.5;
  const minOrder = restaurant.minOrder !== undefined ? restaurant.minOrder : 5.0;

  return (
    <div className="min-h-screen bg-gray-50/50 dark:bg-[#0B1120] pb-20">
      {/* Restaurant Hero Cover (Point 1) */}
      <div className="relative h-64 sm:h-80 w-full overflow-hidden bg-gray-900">
        <img
          src={restaurant.cover || restaurant.logo}
          alt={restaurant.name}
          className="w-full h-full object-cover opacity-85"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent" />

        {/* Floating Breadcrumb on top of hero */}
        <div className="absolute top-4 start-4 sm:start-8 z-10">
          <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs text-white/80 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10">
            <button onClick={() => onNavigate('/')} className="hover:text-white">
              {t('breadcrumbHome')}
            </button>
            <ChevronRight className="w-3.5 h-3.5 rtl:rotate-180 text-white/50" />
            <button onClick={() => onNavigate('/restaurants')} className="hover:text-white">
              {t('breadcrumbRestaurants')}
            </button>
            <ChevronRight className="w-3.5 h-3.5 rtl:rotate-180 text-white/50" />
            <span className="font-bold text-white">{restaurant.name}</span>
          </nav>
        </div>
      </div>

      {/* Identity Card: Points 2, 3, 4, 5, 6, 7, 8, 9 */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-20 sm:-mt-24 relative z-10">
        <div className="bg-white dark:bg-[#151A23] rounded-3xl border border-gray-200 dark:border-[#293142] p-6 sm:p-8 shadow-xl mb-8">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
              {/* Restaurant Logo (Point 2) */}
              <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl border-4 border-white dark:border-gray-900 overflow-hidden shadow-lg bg-white shrink-0">
                <img
                  src={restaurant.logo}
                  alt={restaurant.name}
                  className="w-full h-full object-contain p-2"
                />
              </div>

              {/* Identity & Badges */}
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2.5">
                  {/* Restaurant Name (Point 3) */}
                  <h1 className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white">
                    {restaurant.name}
                  </h1>

                  {/* Verified status (Point 4) */}
                  {restaurant.verified && (
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 px-2.5 py-0.5 rounded-full border border-blue-200 dark:border-blue-900">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>{t('verifiedSeller')}</span>
                    </span>
                  )}

                  {/* Open Status Badge (Point 7) */}
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span>{t('openNow')}</span>
                  </span>
                </div>

                {/* Rating (Point 5) & Location (Point 6) */}
                <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                  <span className="flex items-center gap-1 font-bold text-amber-500">
                    <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                    <span>{restaurant.rating?.toFixed(1) || '4.8'}</span>
                    <span className="text-gray-400 font-normal">
                      ({restaurant.reviewsCount || 48} {t('reviews')})
                    </span>
                  </span>

                  <span className="flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-red-500" />
                    <span>{restaurant.city || 'Mogadishu, Somalia'}</span>
                  </span>

                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-blue-500" />
                    <span>{t('openingHours')}: 08:00 AM - 11:30 PM</span>
                  </span>
                </div>

                {/* Short description (Point 9) */}
                <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-300 max-w-2xl leading-relaxed pt-1">
                  {restaurantDescription}
                </p>
              </div>
            </div>

            {/* Direct Contact Buttons (Point 15) */}
            <div className="flex items-center gap-2.5 w-full md:w-auto shrink-0">
              <a
                href={`https://wa.me/${restaurant.phone.replace(/[^0-9]/g, '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 md:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md shadow-emerald-600/20 transition"
              >
                <MessageCircle className="w-4 h-4" />
                <span>{t('contactWhatsApp')}</span>
              </a>
              <a
                href={`tel:${restaurant.phone}`}
                className="p-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
                title="Call"
              >
                <Phone className="w-4 h-4" />
              </a>
            </div>
          </div>

          {/* Delivery & Ordering Specs Bar (Point 8) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-5 border-t border-gray-100 dark:border-[#222B38]">
            <div className="p-3 rounded-2xl bg-gray-50 dark:bg-[#1C2331] border border-gray-100 dark:border-[#263042]">
              <span className="text-[10px] text-gray-400 flex items-center gap-1 mb-1">
                <Truck className="w-3.5 h-3.5 text-orange-500" />
                {t('deliveryFeeLabel')}
              </span>
              <span className="text-sm font-bold text-gray-900 dark:text-white">
                {deliveryFee === 0 ? t('freeShipping') : `$${deliveryFee.toFixed(2)}`}
              </span>
            </div>

            <div className="p-3 rounded-2xl bg-gray-50 dark:bg-[#1C2331] border border-gray-100 dark:border-[#263042]">
              <span className="text-[10px] text-gray-400 flex items-center gap-1 mb-1">
                <Clock className="w-3.5 h-3.5 text-blue-500" />
                {t('deliveryTime')}
              </span>
              <span className="text-sm font-bold text-gray-900 dark:text-white">
                25-40 min
              </span>
            </div>

            <div className="p-3 rounded-2xl bg-gray-50 dark:bg-[#1C2331] border border-gray-100 dark:border-[#263042]">
              <span className="text-[10px] text-gray-400 flex items-center gap-1 mb-1">
                <DollarSign className="w-3.5 h-3.5 text-emerald-500" />
                {t('minOrderLabel')}
              </span>
              <span className="text-sm font-bold text-gray-900 dark:text-white">
                ${minOrder.toFixed(2)}
              </span>
            </div>

            <div className="p-3 rounded-2xl bg-gray-50 dark:bg-[#1C2331] border border-gray-100 dark:border-[#263042]">
              <span className="text-[10px] text-gray-400 flex items-center gap-1 mb-1">
                <ShieldCheck className="w-3.5 h-3.5 text-indigo-500" />
                {t('hygieneGuarantee')}
              </span>
              <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                100% Certified
              </span>
            </div>
          </div>

          {/* Menu Categories Pills (Point 11) */}
          <div className="flex items-center gap-2 mt-6 pt-4 border-t border-gray-100 dark:border-[#222B38] overflow-x-auto pb-1 scrollbar-none">
            {categories.map(cat => (
              <button
                key={cat}
                type="button"
                onClick={() => setActiveCategory(cat)}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap ${
                  activeCategory === cat
                    ? 'bg-orange-500 text-white shadow-md shadow-orange-500/20'
                    : 'bg-gray-100 dark:bg-[#1C2331] text-gray-700 dark:text-gray-300 hover:bg-gray-200'
                }`}
              >
                {cat === 'all'
                  ? (language === 'ar' ? 'جميع الأطباق والوجبات' : 'All Dishes & Meals')
                  : cat === 'grills'
                  ? (language === 'ar' ? 'مشويات وسلطات' : 'Grills & Salads')
                  : cat === 'fast-food'
                  ? (language === 'ar' ? 'وجبات سريعة وبرجر' : 'Fast Food & Burgers')
                  : cat === 'shawarma'
                  ? (language === 'ar' ? 'شاورما وسندويتشات' : 'Shawarma & Sandwiches')
                  : (language === 'ar' ? 'مشروبات وعصائر' : 'Drinks & Beverages')}
              </button>
            ))}
          </div>
        </div>

        {/* Menu Section (Point 10 & 12: FoodCard implementation) */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white">
                {t('restaurantMenuTitle')}
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {language === 'ar'
                  ? `عرض ${filteredMeals.length} وجبة جاهزة للتحضير الفوري`
                  : `Showing ${filteredMeals.length} freshly prepared meals`}
              </p>
            </div>
          </div>

          {/* Meals Grid using FoodCard (Point 12) */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredMeals.map(meal => (
              <FoodCard
                key={meal.id}
                meal={meal}
                restaurantName={restaurant.name}
                onSelectAddons={handleOpenAddons}
              />
            ))}
          </div>

          {filteredMeals.length === 0 && (
            <div className="p-12 text-center bg-white dark:bg-[#151A23] rounded-3xl border border-gray-200 dark:border-[#293142]">
              <Utensils className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-sm font-bold text-gray-700 dark:text-gray-300">
                {language === 'ar' ? 'لا توجد وجبات في هذا التصنيف حالياً' : 'No meals found in this category.'}
              </p>
            </div>
          )}
        </div>

        {/* Story / About Section (Point 13) */}
        <div className="mt-12 bg-white dark:bg-[#151A23] rounded-3xl border border-gray-200 dark:border-[#293142] p-6 sm:p-8 space-y-4">
          <div className="flex items-center gap-2 text-orange-600 dark:text-orange-400">
            <Info className="w-5 h-5" />
            <h3 className="text-lg font-black text-gray-900 dark:text-white">
              {t('storyAbout')} {restaurant.name}
            </h3>
          </div>
          <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-300 leading-relaxed max-w-4xl">
            {restaurantDescription}
          </p>
          <div className="pt-4 border-t border-gray-100 dark:border-[#222B38] flex flex-wrap items-center gap-6 text-xs text-gray-500">
            <span className="flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-orange-500" />
              <span>{language === 'ar' ? 'تأسس عام: 2021' : 'Established: 2021'}</span>
            </span>
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              <span>{language === 'ar' ? 'سجل تجاري معتمد برقم #MKT-992' : 'Certified Commercial Registry #MKT-992'}</span>
            </span>
          </div>
        </div>

        {/* Reviews Section (Point 14) */}
        <div className="mt-8 bg-white dark:bg-[#151A23] rounded-3xl border border-gray-200 dark:border-[#293142] p-6 sm:p-8 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-black text-gray-900 dark:text-white">
                {t('reviews')} & {t('rating')}
              </h3>
              <p className="text-xs text-gray-400">
                {language === 'ar' ? 'آراء العملاء الحقيقيين بعد استلام الطلبات' : 'Real customer feedback after orders'}
              </p>
            </div>
            <div className="flex items-center gap-2 bg-amber-50 dark:bg-amber-950/40 px-3 py-1.5 rounded-xl border border-amber-200 dark:border-amber-800">
              <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
              <span className="text-sm font-black text-amber-800 dark:text-amber-200">
                {restaurant.rating?.toFixed(1) || '4.8'} / 5.0
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-2xl bg-gray-50 dark:bg-[#1C2331] border border-gray-100 dark:border-[#263042] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray-900 dark:text-white">Ahmed H.</span>
                <div className="flex text-amber-400"><Star className="w-3 h-3 fill-current" /><Star className="w-3 h-3 fill-current" /><Star className="w-3 h-3 fill-current" /><Star className="w-3 h-3 fill-current" /><Star className="w-3 h-3 fill-current" /></div>
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                {language === 'ar' ? 'طعام ساخن ومذاق ممتاز، والتوصيل كان في أقل من 25 دقيقة.' : 'Hot food, incredible taste, and arrived in under 25 minutes.'}
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-gray-50 dark:bg-[#1C2331] border border-gray-100 dark:border-[#263042] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray-900 dark:text-white">Fatima M.</span>
                <div className="flex text-amber-400"><Star className="w-3 h-3 fill-current" /><Star className="w-3 h-3 fill-current" /><Star className="w-3 h-3 fill-current" /><Star className="w-3 h-3 fill-current" /><Star className="w-3 h-3 fill-current" /></div>
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                {language === 'ar' ? 'الصلصات الإضافية والتغليف كانوا في غاية الاحترافية.' : 'Packaging and extra addons were super fresh and neat.'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Addons & Customization Modal */}
      {selectedMealForAddons && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-[#151A23] rounded-3xl max-w-lg w-full border border-gray-200 dark:border-[#293142] p-6 shadow-2xl overflow-y-auto max-h-[90vh]">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100 dark:border-[#222B38]">
              <h3 className="font-bold text-base sm:text-lg text-gray-900 dark:text-white">
                {t('customizeMeal')}: {selectedMealForAddons.title[language] || selectedMealForAddons.title.en}
              </h3>
              <button
                type="button"
                onClick={() => setSelectedMealForAddons(null)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            {/* Base Price */}
            <div className="py-3 flex justify-between items-center text-sm font-semibold">
              <span className="text-gray-700 dark:text-gray-300">{language === 'ar' ? 'السعر الأساسي:' : 'Base Price:'}</span>
              <span className="text-orange-600 font-bold">${selectedMealForAddons.price.toFixed(2)}</span>
            </div>

            {/* Available Addons */}
            <div className="mt-2">
              <span className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                {t('selectMealAddons')}:
              </span>
              <div className="space-y-2">
                {(selectedMealForAddons.addons || defaultAddonsList).map(addon => {
                  const isChecked = chosenAddons.some(a => a.id === addon.id);
                  return (
                    <div
                      key={addon.id}
                      onClick={() => handleToggleAddon(addon)}
                      className={`cursor-pointer flex items-center justify-between p-3 rounded-xl border transition ${
                        isChecked
                          ? 'border-orange-500 bg-orange-50/50 dark:bg-orange-950/30'
                          : 'border-gray-200 dark:border-gray-800 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <div className={`w-5 h-5 rounded-md flex items-center justify-center text-xs ${isChecked ? 'bg-orange-500 text-white' : 'border border-gray-300 dark:border-gray-700'}`}>
                          {isChecked && <Check className="w-3.5 h-3.5" />}
                        </div>
                        <span className="text-xs font-bold text-gray-900 dark:text-white">
                          {addon.name[language] || addon.name.en}
                        </span>
                      </div>
                      <span className="text-xs font-bold text-gray-700 dark:text-gray-300">
                        +${addon.price.toFixed(2)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Customer Special Cooking Notes */}
            <div className="mt-4">
              <label className="block text-xs font-bold text-gray-500 mb-1">
                {t('specialInstructions')}:
              </label>
              <input
                type="text"
                value={customerNotes}
                onChange={e => setCustomerNotes(e.target.value)}
                placeholder={language === 'ar' ? 'مثال: بدون بصل، صوص جانبي...' : 'E.g. no onions, sauce on the side...'}
                className="w-full bg-gray-50 dark:bg-[#1C2331] border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2.5 text-xs text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>

            {/* Quantity Stepper & Total */}
            <div className="mt-6 pt-4 border-t border-gray-100 dark:border-[#222B38] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setMealQuantity(Math.max(1, mealQuantity - 1))}
                  className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-600 dark:text-gray-300 font-bold"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <span className="font-bold text-sm text-gray-900 dark:text-white w-6 text-center">
                  {mealQuantity}
                </span>
                <button
                  type="button"
                  onClick={() => setMealQuantity(mealQuantity + 1)}
                  className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-600 dark:text-gray-300 font-bold"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="text-end">
                <span className="text-xs text-gray-500 block">{language === 'ar' ? 'الإجمالي:' : 'Total:'}</span>
                <span className="text-lg font-black text-orange-600 dark:text-orange-400">
                  $
                  {(
                    (selectedMealForAddons.price +
                      chosenAddons.reduce((sum, a) => sum + a.price, 0)) *
                    mealQuantity
                  ).toFixed(2)}
                </span>
              </div>
            </div>

            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => setSelectedMealForAddons(null)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-xs font-bold text-gray-700 dark:text-gray-300"
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                onClick={handleConfirmAddMeal}
                className="flex-1 bg-orange-600 hover:bg-orange-700 text-white py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow"
              >
                <ShoppingBag className="w-4 h-4" />
                <span>{t('addToOrder')}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
