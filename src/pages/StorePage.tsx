import React, { useState, useEffect } from 'react';
import {
  MapPin,
  Clock,
  Phone,
  MessageCircle,
  ShieldCheck,
  Star,
  Users,
  Heart,
  Share2,
  Filter,
  ShoppingBag,
  Info,
  Calendar,
  Truck,
  ExternalLink,
} from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { Store, Product, Review } from '../types';
import { storeService } from '../services/storeService';
import { productService } from '../services/productService';
import { reviewService } from '../services/reviewService';
import { ProductCard } from '../components/common/ProductCard';
import { updatePageSEO } from '../services/seo';

interface StorePageProps {
  slug: string;
  onNavigate: (path: string) => void;
  onQuickView: (product: Product) => void;
}

export const StorePage: React.FC<StorePageProps> = ({ slug, onNavigate, onQuickView }) => {
  const { language, t } = useLanguage();
  const { user } = useAuth();

  const [store, setStore] = useState<Store | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [isFollowing, setIsFollowing] = useState(false);
  const [activeTab, setActiveTab] = useState<'products' | 'about' | 'reviews'>('products');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Review Form
  const [newRating, setNewRating] = useState<number>(5);
  const [newComment, setNewComment] = useState<string>('');
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  useEffect(() => {
    const foundStore = storeService.getStoreBySlug(slug);
    if (foundStore) {
      setStore(foundStore);
      setIsFollowing(storeService.isFollowing(foundStore.id, user?.id));

      const storeProds = productService.getAllProducts({
        storeId: foundStore.id,
        onlyPublished: true,
      });
      setProducts(storeProds);

      const storeRevs = reviewService.getReviewsByTarget('store', foundStore.id);
      setReviews(storeRevs);

      updatePageSEO({
        title: `${foundStore.name} | متجر معتمد في MarketSpace`,
        description: foundStore.description[language] || foundStore.description.en,
        image: foundStore.cover || foundStore.logo,
        type: 'profile',
        breadcrumbs: [
          { name: t('home'), url: '/' },
          { name: t('allStores'), url: '/shop?type=stores' },
          { name: foundStore.name, url: `/store/${foundStore.slug}` },
        ],
        language,
      });
    } else {
      updatePageSEO({
        title: language === 'ar' ? 'المتجر غير موجود | MarketSpace' : language === 'so' ? 'Dukaanka Lama Helin | MarketSpace' : 'Store Not Found | MarketSpace',
        description: language === 'ar' ? 'لم يتم العثور على المتجر المطلوب بالرابط المحدد.' : 'The requested store could not be found.',
        type: 'website',
        language,
      });
    }
  }, [slug, user?.id, language, t]);

  if (!store) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center p-8">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">المتجر غير موجود</h2>
        <p className="text-gray-500 mb-6">لم يتم العثور على المتجر المطلوب بالرابط المحدد.</p>
        <button
          onClick={() => onNavigate('/shop')}
          className="bg-[#0E11B7] text-white px-6 py-2.5 rounded-xl font-medium"
        >
          {t('backToHome')}
        </button>
      </div>
    );
  }

  const handleToggleFollow = () => {
    const userId = user?.id || 'guest_user';
    const newState = storeService.toggleFollow(store.id, userId);
    setIsFollowing(newState);
    setStore(prev => prev ? { ...prev, followersCount: Math.max(0, prev.followersCount + (newState ? 1 : -1)) } : null);
  };

  const handleAddReview = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;

    setIsSubmittingReview(true);
    const rev = reviewService.addReview({
      targetType: 'store',
      targetId: store.id,
      userId: user?.id || 'guest_customer',
      userName: user?.name || 'زائر السوق',
      rating: newRating,
      comment: newComment.trim(),
      isVerifiedPurchase: true,
    });

    setReviews(prev => [rev, ...prev]);
    setNewComment('');
    setIsSubmittingReview(false);
  };

  const filteredProducts = selectedCategory === 'all'
    ? products
    : products.filter(p => p.category === selectedCategory);

  const whatsappMessage = encodeURIComponent(
    `مرحباً ${store.name}، أنا أتواصل معك عبر متجرك على منصة MarketSpace للاستفسار عن المنتجات.`
  );

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0B1120] pb-16">
      {/* Cover Banner */}
      <div className="relative h-64 sm:h-80 w-full overflow-hidden bg-gray-900">
        <img
          src={store.cover}
          alt={store.name}
          className="w-full h-full object-cover opacity-80"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
      </div>

      {/* Store Header Identity Bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-20 sm:-mt-24 relative z-10">
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 shadow-xl">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            {/* Logo & Store Names */}
            <div className="flex items-center gap-5">
              <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl border-4 border-white dark:border-gray-900 overflow-hidden shadow-lg bg-white shrink-0">
                <img
                  src={store.logo}
                  alt={store.name}
                  className="w-full h-full object-cover"
                />
              </div>

              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white">
                    {store.name}
                  </h1>
                  {store.isVerified && (
                    <span className="inline-flex items-center gap-1 bg-blue-50 dark:bg-blue-950/60 text-[#0E11B7] dark:text-blue-400 text-xs font-bold px-2.5 py-0.5 rounded-full border border-blue-200 dark:border-blue-800">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      {t('verifiedSeller')}
                    </span>
                  )}
                </div>

                <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1.5 max-w-xl line-clamp-2">
                  {store.description[language] || store.description.en}
                </p>

                {/* Badges strip */}
                <div className="flex flex-wrap items-center gap-4 mt-3 text-xs text-gray-500 dark:text-gray-400">
                  <div className="flex items-center gap-1 text-amber-500 font-semibold">
                    <Star className="w-4 h-4 fill-current" />
                    <span>{store.rating} ({store.reviewsCount} {t('reviews')})</span>
                  </div>

                  <div className="flex items-center gap-1">
                    <Users className="w-4 h-4 text-blue-500" />
                    <span>{store.followersCount} {t('followers')}</span>
                  </div>

                  <div className="flex items-center gap-1">
                    <MapPin className="w-4 h-4 text-rose-500" />
                    <span>{store.city}, {store.district}</span>
                  </div>

                  <div className="flex items-center gap-1">
                    <Clock className="w-4 h-4 text-emerald-500" />
                    <span>{store.openingHours}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-start md:justify-end border-t md:border-t-0 pt-4 md:pt-0 border-gray-100 dark:border-gray-800">
              <button
                onClick={handleToggleFollow}
                className={`px-5 py-2.5 rounded-xl font-bold text-sm transition flex items-center gap-1.5 shadow ${
                  isFollowing
                    ? 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 border border-gray-300 dark:border-gray-700'
                    : 'bg-[#0E11B7] hover:bg-[#0c0ea3] text-white shadow-blue-600/20'
                }`}
              >
                <Heart className={`w-4 h-4 ${isFollowing ? 'fill-rose-500 text-rose-500' : ''}`} />
                <span>{isFollowing ? t('following') : t('follow')}</span>
              </button>

              <a
                href={`https://wa.me/${store.whatsapp.replace(/\D/g, '')}?text=${whatsappMessage}`}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm transition flex items-center gap-1.5 shadow shadow-emerald-600/20"
              >
                <MessageCircle className="w-4 h-4" />
                <span>واتساب المتجر</span>
              </a>

              <a
                href={`tel:${store.phone}`}
                className="p-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
                title="اتصال هاتفياً"
              >
                <Phone className="w-4 h-4" />
              </a>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex border-t border-gray-200 dark:border-gray-800 mt-6 pt-3 gap-6 text-sm font-semibold">
            <button
              onClick={() => setActiveTab('products')}
              className={`pb-2 border-b-2 transition flex items-center gap-2 ${
                activeTab === 'products'
                  ? 'border-[#0E11B7] text-[#0E11B7] dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              <ShoppingBag className="w-4 h-4" />
              <span>المنتجات ({products.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('about')}
              className={`pb-2 border-b-2 transition flex items-center gap-2 ${
                activeTab === 'about'
                  ? 'border-[#0E11B7] text-[#0E11B7] dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              <Info className="w-4 h-4" />
              <span>عن المتجر والشحن</span>
            </button>

            <button
              onClick={() => setActiveTab('reviews')}
              className={`pb-2 border-b-2 transition flex items-center gap-2 ${
                activeTab === 'reviews'
                  ? 'border-[#0E11B7] text-[#0E11B7] dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              <Star className="w-4 h-4" />
              <span>التقييمات ({reviews.length})</span>
            </button>
          </div>
        </div>

        {/* Tab 1: Products */}
        {activeTab === 'products' && (
          <div className="mt-8">
            {/* Category filter pills if store has multiple categories */}
            {store.categories && store.categories.length > 1 && (
              <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-2 scrollbar-none">
                <button
                  onClick={() => setSelectedCategory('all')}
                  className={`px-4 py-1.5 rounded-full text-xs font-bold transition whitespace-nowrap ${
                    selectedCategory === 'all'
                      ? 'bg-[#0E11B7] text-white'
                      : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700'
                  }`}
                >
                  جميع المنتجات
                </button>
                {store.categories.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-4 py-1.5 rounded-full text-xs font-bold transition whitespace-nowrap capitalize ${
                      selectedCategory === cat
                        ? 'bg-[#0E11B7] text-white'
                        : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            )}

            {filteredProducts.length === 0 ? (
              <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-12 text-center">
                <ShoppingBag className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <h3 className="font-bold text-gray-900 dark:text-white text-base">لا توجد منتجات منشورة حالياً</h3>
                <p className="text-xs text-gray-500 mt-1">يقوم البائع حالياً بإضافة وتحديث تشكيلة المنتجات.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
                {filteredProducts.map(product => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    onNavigate={onNavigate}
                    onQuickView={onQuickView}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 2: About & Shipping */}
        {activeTab === 'about' && (
          <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2 space-y-6">
              <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
                <h3 className="font-bold text-lg text-gray-900 dark:text-white mb-3">نبذة عن النشاط</h3>
                <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                  {store.description[language] || store.description.en}
                </p>
              </div>

              <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
                <h3 className="font-bold text-lg text-gray-900 dark:text-white mb-3">سياسات التوصيل والدفع</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
                    <Truck className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-gray-900 dark:text-white block">خدمة التوصيل</span>
                      <span className="text-gray-500">
                        {store.deliveryAvailable ? `متاح، الرسوم: $${store.deliveryFee}` : 'استلام من الفرع فقط'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
                    <ShoppingBag className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-gray-900 dark:text-white block">الحد الأدنى للطلب</span>
                      <span className="text-gray-500">${store.minOrder}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Sidebar info */}
            <div className="space-y-6">
              <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
                <h3 className="font-bold text-sm text-gray-900 dark:text-white mb-4">بيانات التواصل والفرع</h3>
                <div className="space-y-3 text-xs text-gray-600 dark:text-gray-300">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-rose-500" />
                    <span>{store.address[language] || store.address.en}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Phone className="w-4 h-4 text-blue-500" />
                    <span>{store.phone}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-amber-500" />
                    <span>{store.openingHours}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Reviews */}
        {activeTab === 'reviews' && (
          <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Reviews List */}
            <div className="md:col-span-2 space-y-4">
              <h3 className="font-bold text-lg text-gray-900 dark:text-white">
                تقييمات وآراء العملاء ({reviews.length})
              </h3>

              {reviews.length === 0 ? (
                <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-8 text-center text-gray-500 text-sm">
                  لا توجد تقييمات بعد. كن أول من يقيّم هذا المتجر!
                </div>
              ) : (
                reviews.map(rev => (
                  <div
                    key={rev.id}
                    className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 shadow-sm"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-950 text-[#0E11B7] font-bold flex items-center justify-center text-xs">
                          {rev.userName.charAt(0)}
                        </div>
                        <div>
                          <span className="font-bold text-sm text-gray-900 dark:text-white block">
                            {rev.userName}
                          </span>
                          {rev.isVerifiedPurchase && (
                            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-0.5">
                              <ShieldCheck className="w-3 h-3" /> مشتري موثق
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1 text-amber-500">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star
                            key={i}
                            className={`w-3.5 h-3.5 ${i < rev.rating ? 'fill-current' : 'text-gray-300 dark:text-gray-700'}`}
                          />
                        ))}
                      </div>
                    </div>

                    <p className="text-xs text-gray-700 dark:text-gray-300 mt-2 leading-relaxed">
                      {rev.comment}
                    </p>
                    <span className="text-[10px] text-gray-400 mt-2 block">
                      {new Date(rev.createdAt).toLocaleDateString(language === 'ar' ? 'ar-EG' : 'en-US')}
                    </span>
                  </div>
                ))
              )}
            </div>

            {/* Write Review Form */}
            <div>
              <form
                onSubmit={handleAddReview}
                className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 sticky top-24 shadow-sm"
              >
                <h4 className="font-bold text-sm text-gray-900 dark:text-white mb-3 flex items-center gap-1.5">
                  <Star className="w-4 h-4 text-amber-500 fill-current" />
                  {t('writeReview')}
                </h4>

                <div className="mb-4">
                  <label className="block text-xs text-gray-500 mb-1">التقييم:</label>
                  <div className="flex items-center gap-2">
                    {[1, 2, 3, 4, 5].map(star => (
                      <button
                        type="button"
                        key={star}
                        onClick={() => setNewRating(star)}
                        className="text-amber-500 hover:scale-110 transition"
                      >
                        <Star
                          className={`w-6 h-6 ${star <= newRating ? 'fill-current' : 'text-gray-300 dark:text-gray-700'}`}
                        />
                      </button>
                    ))}
                    <span className="text-xs font-bold text-gray-700 dark:text-gray-300 ms-2">
                      {newRating} من 5
                    </span>
                  </div>
                </div>

                <div className="mb-4">
                  <label className="block text-xs text-gray-500 mb-1">تعليقك وتجربتك:</label>
                  <textarea
                    rows={4}
                    required
                    value={newComment}
                    onChange={e => setNewComment(e.target.value)}
                    placeholder="شارك رأيك الصادق حول المنتجات والتوصيل..."
                    className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl p-3 text-xs text-gray-900 dark:text-white focus:ring-2 focus:ring-[#0E11B7] outline-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmittingReview}
                  className="w-full bg-[#0E11B7] hover:bg-[#0c0ea3] text-white py-2.5 rounded-xl font-bold text-xs transition shadow"
                >
                  نشر التقييم
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
