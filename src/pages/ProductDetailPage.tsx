import React, { useState, useEffect } from 'react';
import {
  Heart,
  ShoppingBasket,
  MessageCircle,
  Share2,
  Star,
  Check,
  Truck,
  ShieldCheck,
  Store,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  X,
  ArrowRight,
  Package,
} from 'lucide-react';
import { productService } from '../services/productService';
import { Product, ProductAddon } from '../types';
import { useLanguage } from '../i18n/LanguageContext';
import { useCart } from '../context/CartContext';
import { useFavorites } from '../context/FavoritesContext';
import { ProductCard } from '../components/common/ProductCard';
import { updatePageSEO } from '../services/seo';
import { discoveryService } from '../services/discoveryService';

interface ProductDetailPageProps {
  slug: string;
  onNavigate: (path: string) => void;
  onQuickView: (product: Product) => void;
}

export const ProductDetailPage: React.FC<ProductDetailPageProps> = ({
  slug,
  onNavigate,
  onQuickView,
}) => {
  const { language, t } = useLanguage();
  const { addItem } = useCart();
  const { isFavorite, toggleFavorite } = useFavorites();

  const product = productService.getProductBySlug(slug);

  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [selectedColor, setSelectedColor] = useState<string>('');
  const [selectedSize, setSelectedSize] = useState<string>('');
  const [quantity, setQuantity] = useState(1);
  const [selectedAddons, setSelectedAddons] = useState<ProductAddon[]>([]);
  const [customerNotes, setCustomerNotes] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [copied, setCopied] = useState(false);

  const isFav = product ? isFavorite(product.id) : false;
  const localizedTitle = product ? (product.title[language] || product.title.en) : '';
  const localizedDesc = product ? (product.description[language] || product.description.en) : '';
  const images = product ? (product.images.length > 0 ? product.images : [product.thumbnail]) : [];

  // Update SEO for this product & record view in discovery history
  useEffect(() => {
    if (product) {
      discoveryService.recordView({
        id: product.id,
        type: 'product',
        slug: product.slug,
        title: product.title,
        image: product.thumbnail || product.images[0],
        price: product.price,
        rating: product.rating,
      });

      updatePageSEO({
        title: localizedTitle,
        description: localizedDesc,
        image: product.thumbnail || product.images[0],
        type: 'product',
        product,
        breadcrumbs: [
          { name: t('home'), url: '/' },
          { name: t('shop'), url: '/shop' },
          { name: localizedTitle, url: `/product/${product.slug}` },
        ],
        language,
      });
    } else {
      updatePageSEO({
        title: language === 'ar' ? 'المنتج غير موجود | MarketSpace' : language === 'so' ? 'Alaabta Lama Helin | MarketSpace' : 'Product Not Found | MarketSpace',
        description: language === 'ar' ? 'لم يتم العثور على المنتج المطلوب أو قد تمت إزالته من المتجر.' : 'The requested product could not be found or has been removed.',
        type: 'website',
        language,
      });
    }
  }, [product, localizedTitle, localizedDesc, language, t]);

  if (!product) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center p-8">
        <Package className="w-16 h-16 text-gray-300 dark:text-gray-600 mb-3" />
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          {language === 'ar' ? 'المنتج غير موجود' : language === 'so' ? 'Alaabta lama helin' : 'Product Not Found'}
        </h2>
        <p className="text-gray-500 dark:text-gray-400 mb-6 text-xs max-w-md">
          {language === 'ar'
            ? 'لم يتم العثور على المنتج المطلوب أو قد تمت إزالته من المتجر.'
            : language === 'so'
            ? 'Alaabta la doonayo lama helin ama waa laga saaray dukaanka.'
            : 'The requested product could not be found or has been removed.'}
        </p>
        <button
          onClick={() => onNavigate('/shop')}
          className="bg-[#0E11B7] hover:bg-[#070A86] text-white px-6 py-2.5 rounded-xl font-bold text-xs shadow-md transition-colors"
        >
          {t('shop')}
        </button>
      </div>
    );
  }

  const handlePrevImage = () => {
    setActiveImageIndex(prev => (prev === 0 ? images.length - 1 : prev - 1));
  };

  const handleNextImage = () => {
    setActiveImageIndex(prev => (prev === images.length - 1 ? 0 : prev + 1));
  };

  const toggleAddon = (addon: ProductAddon) => {
    setSelectedAddons(prev =>
      prev.some(a => a.id === addon.id) ? prev.filter(a => a.id !== addon.id) : [...prev, addon]
    );
  };

  const handleAddToCart = () => {
    addItem(
      product,
      quantity,
      selectedColor || (product.colors && product.colors[0]?.name[language]),
      selectedSize || (product.sizes && product.sizes[0]),
      selectedAddons,
      customerNotes
    );
  };

  const handleBuyNow = () => {
    handleAddToCart();
    onNavigate('/cart');
  };

  const handleWhatsAppOrder = () => {
    const phone = product.seller?.whatsapp || '252612494952';
    const textLines = [
      t('whatsappMsgGreeting'),
      `${t('whatsappProduct')} ${localizedTitle}`,
      `${t('whatsappPrice')} $${(Number(product.price) || 0).toFixed(2)}`,
      selectedColor ? `${t('color')}: ${selectedColor}` : '',
      selectedSize ? `${t('size')}: ${selectedSize}` : '',
      customerNotes ? `Notes: ${customerNotes}` : '',
      `${t('whatsappLink')} ${window.location.href}`,
    ].filter(Boolean);

    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(textLines.join('\n'))}`, '_blank');
  };

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: localizedTitle,
        url: window.location.href,
      }).catch(() => {});
    } else {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Related items
  const allProducts = productService.getAllProducts();
  const relatedProducts = allProducts
    .filter(p => p.id !== product.id && (p.category === product.category || p.type === product.type))
    .slice(0, 4);

  // More from this brand / seller
  const moreFromStore = allProducts
    .filter(p => p.id !== product.id && (
      (product.seller?.id && p.seller?.id === product.seller.id) ||
      (product.brand && p.brand === product.brand)
    ))
    .slice(0, 4);

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-12 animate-fadeIn">
      {/* Breadcrumbs */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs text-gray-500 overflow-x-auto pb-1">
        <button type="button" onClick={() => onNavigate('/')} className="hover:text-[#0E11B7] truncate">
          {t('home')}
        </button>
        <span>/</span>
        <button type="button" onClick={() => onNavigate('/shop')} className="hover:text-[#0E11B7] truncate">
          {t('shop')}
        </button>
        <span>/</span>
        <span className="text-gray-900 dark:text-white font-bold truncate">
          {localizedTitle}
        </span>
      </nav>

      {/* Main Two-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
        {/* Left Column: Gallery */}
        <div className="lg:col-span-6 flex flex-col gap-4 sticky top-24">
          <div className="relative aspect-square w-full rounded-3xl overflow-hidden bg-white dark:bg-[#151A23] border border-gray-200 dark:border-[#293142] shadow-sm">
            <img
              src={images[activeImageIndex] || product.thumbnail}
              alt={localizedTitle}
              className="w-full h-full object-cover"
            />

            {/* Discount Badge */}
            {product.discount && product.discount > 0 && (
              <div className="absolute top-4 end-4 px-3 py-1 rounded-full text-xs font-black bg-[#E11D48] text-white shadow-md">
                {product.discount}% {t('discountBadge')}
              </div>
            )}

            {/* Image Slider Controls */}
            {images.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={handlePrevImage}
                  className="absolute start-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/90 dark:bg-black/80 flex items-center justify-center text-gray-800 dark:text-white shadow-lg hover:scale-105 transition-all"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onClick={handleNextImage}
                  className="absolute end-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/90 dark:bg-black/80 flex items-center justify-center text-gray-800 dark:text-white shadow-lg hover:scale-105 transition-all"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </>
            )}

            {/* Fullscreen Zoom Button */}
            <button
              type="button"
              onClick={() => setIsFullscreen(true)}
              aria-label="View Fullscreen"
              className="absolute bottom-3 end-3 p-2.5 rounded-full bg-white/90 dark:bg-black/80 text-gray-800 dark:text-white shadow-md hover:bg-white"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>

          {/* Thumbnails Row */}
          {images.length > 1 && (
            <div className="flex gap-3 overflow-x-auto pb-2">
              {images.map((img, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setActiveImageIndex(idx)}
                  className={`w-20 h-20 rounded-2xl overflow-hidden border-2 flex-shrink-0 transition-all ${
                    idx === activeImageIndex
                      ? 'border-[#0E11B7] ring-2 ring-[#0E11B7]/25 scale-105'
                      : 'border-transparent opacity-70 hover:opacity-100'
                  }`}
                >
                  <img src={img} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right Column: Product Information & Buying Actions */}
        <div className="lg:col-span-6 flex flex-col gap-6">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-[#0E11B7] dark:text-[#3B82F6] uppercase tracking-wider mb-2">
              <span>{product.brand || product.category}</span>
              <span>•</span>
              <div className="flex items-center gap-1 text-amber-500">
                <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                <span>{(Number(product.rating) || 5.0).toFixed(1)}</span>
                <span className="text-gray-400 font-normal">({product.reviewsCount || 0} {t('reviews')})</span>
              </div>
            </div>

            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-gray-900 dark:text-white tracking-tight leading-tight">
              {localizedTitle}
            </h1>
          </div>

          {/* Price Block */}
          <div className="flex items-baseline gap-4 p-4 rounded-2xl bg-white dark:bg-[#151A23] border border-gray-200 dark:border-[#293142]">
            <span className="text-3xl sm:text-4xl font-black text-[#0E11B7] dark:text-white">
              ${(Number(product.price) || 0).toFixed(2)}
            </span>
            {product.oldPrice && (
              <del className="text-base text-gray-400 font-medium">
                ${(Number(product.oldPrice) || 0).toFixed(2)}
              </del>
            )}
            {product.stock > 0 ? (
              <span className="ms-auto text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-3 py-1 rounded-full border border-emerald-200 dark:border-emerald-800">
                {t('inStock')} ({product.stock})
              </span>
            ) : (
              <span className="ms-auto text-xs font-bold text-rose-600 bg-rose-50 px-3 py-1 rounded-full">
                {t('outOfStock')}
              </span>
            )}
          </div>

          <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
            {localizedDesc}
          </p>

          {/* Colors Selection */}
          {product.colors && product.colors.length > 0 && (
            <div className="space-y-2">
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase">
                {t('color')}
              </label>
              <div className="flex flex-wrap gap-2.5">
                {product.colors.map((c, i) => {
                  const colorName = c.name[language] || c.name.en;
                  const isSelected = selectedColor === colorName || (!selectedColor && i === 0);
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setSelectedColor(colorName)}
                      className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold border transition-all ${
                        isSelected
                          ? 'border-[#0E11B7] bg-[#EEF2FF] text-[#0E11B7] dark:bg-[#0E11B7]/20 dark:text-white dark:border-[#0E11B7]'
                          : 'border-gray-200 dark:border-[#293142] text-gray-700 dark:text-gray-300'
                      }`}
                    >
                      {c.hex && (
                        <span
                          className="w-3.5 h-3.5 rounded-full border border-black/10 shadow-xs"
                          style={{ backgroundColor: c.hex }}
                        />
                      )}
                      <span>{colorName}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Sizes Selection */}
          {product.sizes && product.sizes.length > 0 && (
            <div className="space-y-2">
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase">
                {t('size')}
              </label>
              <div className="flex flex-wrap gap-2.5">
                {product.sizes.map((s, i) => {
                  const isSelected = selectedSize === s || (!selectedSize && i === 0);
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setSelectedSize(s)}
                      className={`px-4 py-2 rounded-xl text-xs font-bold border transition-all ${
                        isSelected
                          ? 'border-[#0E11B7] bg-[#EEF2FF] text-[#0E11B7] dark:bg-[#0E11B7]/20 dark:text-white dark:border-[#0E11B7]'
                          : 'border-gray-200 dark:border-[#293142] text-gray-700 dark:text-gray-300'
                      }`}
                    >
                      {s}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Meal Addons if restaurant meal */}
          {product.addons && product.addons.length > 0 && (
            <div className="space-y-2">
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase">
                {t('addonsAndOptions')}
              </label>
              <div className="flex flex-wrap gap-2">
                {product.addons.map(addon => {
                  const active = selectedAddons.some(a => a.id === addon.id);
                  return (
                    <button
                      key={addon.id}
                      type="button"
                      onClick={() => toggleAddon(addon)}
                      className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold border transition-all ${
                        active
                          ? 'border-emerald-600 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-600'
                          : 'border-gray-200 dark:border-[#293142] text-gray-700 dark:text-gray-300'
                      }`}
                    >
                      {active && <Check className="w-3.5 h-3.5" />}
                      <span>{addon.name[language] || addon.name.en}</span>
                      <span className="opacity-80">+${(Number(addon.price) || 0).toFixed(2)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Customer Notes */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300">
              {t('customerNotes')}
            </label>
            <textarea
              rows={2}
              value={customerNotes}
              onChange={e => setCustomerNotes(e.target.value)}
              placeholder="مثال: يرجى إيصال الطلب بعد العصر، تقليل الشطة..."
              className="w-full p-3 rounded-xl text-xs bg-white dark:bg-[#151A23] border border-gray-200 dark:border-[#293142] text-gray-900 dark:text-white focus:outline-none focus:border-[#0E11B7]"
            />
          </div>

          {/* Action Buttons */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center gap-3">
              {/* Quantity */}
              <div className="flex items-center border border-gray-200 dark:border-[#293142] rounded-2xl overflow-hidden bg-white dark:bg-[#151A23]">
                <button
                  type="button"
                  onClick={() => setQuantity(prev => Math.max(1, prev - 1))}
                  className="w-12 h-12 flex items-center justify-center text-lg font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  -
                </button>
                <span className="w-10 text-center font-black text-sm text-gray-900 dark:text-white">
                  {quantity}
                </span>
                <button
                  type="button"
                  onClick={() => setQuantity(prev => prev + 1)}
                  className="w-12 h-12 flex items-center justify-center text-lg font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  +
                </button>
              </div>

              {/* Add To Cart */}
              <button
                type="button"
                onClick={handleAddToCart}
                className="flex-1 h-12 px-6 bg-[#0E11B7] hover:bg-[#070A86] text-white font-extrabold text-sm rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-[#0E11B7]/25 active:scale-[0.98] transition-all"
              >
                <ShoppingBasket className="w-4 h-4" />
                <span>{t('addToCart')}</span>
              </button>

              {/* Wishlist Toggle */}
              <button
                type="button"
                onClick={() => toggleFavorite(product.id)}
                aria-label="Favorite"
                className={`w-12 h-12 rounded-2xl flex items-center justify-center border transition-colors ${
                  isFav
                    ? 'bg-rose-50 text-rose-600 border-rose-200 dark:bg-rose-950/40 dark:border-rose-800'
                    : 'border-gray-200 dark:border-[#293142] text-gray-600 dark:text-gray-300 hover:text-rose-600'
                }`}
              >
                <Heart className={`w-5 h-5 ${isFav ? 'fill-current' : ''}`} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={handleBuyNow}
                className="h-11 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/20 transition-all"
              >
                <span>{t('buyNow')}</span>
              </button>

              <button
                type="button"
                onClick={handleWhatsAppOrder}
                className="h-11 px-4 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-colors"
              >
                <MessageCircle className="w-4 h-4" />
                <span>{t('orderViaWhatsapp')}</span>
              </button>
            </div>

            <button
              type="button"
              onClick={handleShare}
              className="w-full py-2.5 rounded-xl border border-gray-200 dark:border-[#293142] text-xs font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center justify-center gap-2 transition-colors"
            >
              <Share2 className="w-4 h-4" />
              <span>{copied ? t('linkCopied') : t('shareProduct')}</span>
            </button>
          </div>

          {/* Seller / Vendor Box */}
          {product.seller && (
            <div className="p-4 rounded-2xl bg-white dark:bg-[#151A23] border border-gray-200 dark:border-[#293142] flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gray-100 dark:bg-[#111722] overflow-hidden flex items-center justify-center text-[#0E11B7]">
                  {product.seller.logo ? (
                    <img src={product.seller.logo} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <Store className="w-6 h-6" />
                  )}
                </div>
                <div>
                  <h4 className="font-bold text-xs text-gray-900 dark:text-white">
                    {product.seller.name}
                  </h4>
                  {product.seller.location && (
                    <p className="text-[11px] text-gray-500">
                      {product.seller.location[language] || product.seller.location.en}
                    </p>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() => onNavigate(`/shop?category=${product.category}`)}
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:text-[#0E11B7]"
              >
                {t('storeProducts')}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Specifications & Details Tabs */}
      {product.specs && Object.keys(product.specs).length > 0 && (
        <section className="p-6 rounded-3xl bg-white dark:bg-[#151A23] border border-gray-200 dark:border-[#293142] space-y-4">
          <h3 className="text-lg font-black text-gray-900 dark:text-white">
            {t('specifications')}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {Object.entries(product.specs).map(([key, val]) => (
              <div key={key} className="p-3 rounded-xl bg-gray-50 dark:bg-[#111722] border border-gray-100 dark:border-[#293142]">
                <span className="block text-[11px] font-bold text-gray-400 uppercase">{key}</span>
                <span className="text-xs font-bold text-gray-800 dark:text-gray-200">{val}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Related Products Section */}
      {relatedProducts.length > 0 && (
        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white">
              {t('relatedProducts')}
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('/shop')}
              className="text-xs font-bold text-[#0E11B7] hover:underline"
            >
              {t('viewAll')} →
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {relatedProducts.map(rel => (
              <ProductCard
                key={rel.id}
                product={rel}
                onQuickView={onQuickView}
                onNavigate={slug => onNavigate(`/product/${slug}`)}
              />
            ))}
          </div>
        </section>
      )}

      {/* More from this Store / Brand */}
      {moreFromStore.length > 0 && (
        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white">
              {t('moreFromThisStore')}
            </h2>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {moreFromStore.map(rel => (
              <ProductCard
                key={rel.id}
                product={rel}
                onQuickView={onQuickView}
                onNavigate={slug => onNavigate(`/product/${slug}`)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Fullscreen Lightbox Modal */}
      {isFullscreen && (
        <div
          className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4 animate-fadeIn"
          onClick={() => setIsFullscreen(false)}
        >
          <button
            type="button"
            onClick={() => setIsFullscreen(false)}
            className="absolute top-4 end-4 p-2 rounded-full bg-white/20 text-white hover:bg-white/40 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
          <img
            src={images[activeImageIndex]}
            alt=""
            className="max-w-full max-h-[90vh] object-contain rounded-2xl"
          />
        </div>
      )}
    </div>
  );
};
