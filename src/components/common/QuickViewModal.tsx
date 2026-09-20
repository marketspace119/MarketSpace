import React, { useState } from 'react';
import { X, Star, Heart, ShoppingBasket, MessageCircle, ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { Product, ProductAddon } from '../../types';
import { useLanguage } from '../../i18n/LanguageContext';
import { useCart } from '../../context/CartContext';
import { useFavorites } from '../../context/FavoritesContext';

interface QuickViewModalProps {
  product: Product | null;
  isOpen: boolean;
  onClose: () => void;
  onNavigateDetail?: (slug: string) => void;
}

export const QuickViewModal: React.FC<QuickViewModalProps> = ({
  product,
  isOpen,
  onClose,
  onNavigateDetail,
}) => {
  const { language, t } = useLanguage();
  const { addItem } = useCart();
  const { isFavorite, toggleFavorite } = useFavorites();

  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [selectedColor, setSelectedColor] = useState<string>('');
  const [selectedSize, setSelectedSize] = useState<string>('');
  const [quantity, setQuantity] = useState(1);
  const [selectedAddons, setSelectedAddons] = useState<ProductAddon[]>([]);

  if (!isOpen || !product) return null;

  const isFav = isFavorite(product.id);
  const localizedTitle = product.title[language] || product.title.en;
  const localizedDesc = product.description[language] || product.description.en;
  const images = product.images.length > 0 ? product.images : [product.thumbnail];

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
      selectedAddons
    );
    onClose();
  };

  const handleWhatsAppOrder = () => {
    const phone = product.seller?.whatsapp || '252612494952';
    const textLines = [
      t('whatsappMsgGreeting'),
      `${t('whatsappProduct')} ${localizedTitle}`,
      `${t('whatsappPrice')} $${product.price.toFixed(2)}`,
      selectedColor ? `${t('color')}: ${selectedColor}` : '',
      selectedSize ? `${t('size')}: ${selectedSize}` : '',
      `${t('whatsappLink')} ${window.location.origin}/#/product/${product.slug}`,
    ].filter(Boolean);

    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(textLines.join('\n'))}`, '_blank');
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs overflow-y-auto animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl bg-white dark:bg-[#151A23] border border-gray-200 dark:border-[#293142] rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden my-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3.5 end-3.5 z-20 p-2 rounded-full bg-gray-100 dark:bg-[#111722] text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4 sm:p-6">
          {/* Gallery Column */}
          <div className="flex flex-col gap-3">
            <div className="relative aspect-square rounded-2xl overflow-hidden bg-gray-50 dark:bg-[#111722] border border-gray-100 dark:border-[#293142]">
              <img
                src={images[activeImageIndex] || product.thumbnail}
                alt={localizedTitle}
                className="w-full h-full object-cover transition-all duration-200"
              />

              {images.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={handlePrevImage}
                    className="absolute start-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/90 dark:bg-black/70 flex items-center justify-center shadow-md text-gray-800 dark:text-white hover:bg-white transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={handleNextImage}
                    className="absolute end-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/90 dark:bg-black/70 flex items-center justify-center shadow-md text-gray-800 dark:text-white hover:bg-white transition-colors"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </>
              )}

              {product.discount && product.discount > 0 && (
                <div className="absolute top-3 end-3 px-2.5 py-1 rounded-full text-xs font-black bg-[#E11D48] text-white">
                  -{product.discount}%
                </div>
              )}
            </div>

            {/* Thumbnail Strip */}
            {images.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {images.map((img, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setActiveImageIndex(idx)}
                    className={`w-14 h-14 rounded-xl overflow-hidden border-2 flex-shrink-0 transition-all ${
                      idx === activeImageIndex
                        ? 'border-[#0E11B7] ring-2 ring-[#0E11B7]/20 scale-105'
                        : 'border-transparent opacity-70 hover:opacity-100'
                    }`}
                  >
                    <img src={img} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Details Column */}
          <div className="flex flex-col gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-xs font-bold text-[#0E11B7] dark:text-[#3B82F6] uppercase tracking-wider">
                  {product.brand || product.category}
                </span>
                <span className="text-gray-300 dark:text-gray-700">•</span>
                <div className="flex items-center gap-1 text-amber-500 text-xs font-bold">
                  <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                  <span>{product.rating.toFixed(1)}</span>
                  <span className="text-gray-400 font-normal">({product.reviewsCount} {t('reviews')})</span>
                </div>
              </div>

              <h2 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white leading-tight">
                {localizedTitle}
              </h2>
            </div>

            {/* Price section */}
            <div className="flex items-baseline gap-3 p-3 bg-gray-50 dark:bg-[#111722] rounded-xl border border-gray-100 dark:border-[#293142]">
              <span className="text-2xl sm:text-3xl font-black text-[#0E11B7] dark:text-white">
                ${product.price.toFixed(2)}
              </span>
              {product.oldPrice && (
                <del className="text-sm font-medium text-gray-400">
                  ${product.oldPrice.toFixed(2)}
                </del>
              )}
              {product.stock > 0 ? (
                <span className="ms-auto text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                  {t('inStock')}
                </span>
              ) : (
                <span className="ms-auto text-xs font-bold text-rose-600 bg-rose-50 dark:bg-rose-950/40 px-2 py-0.5 rounded-full">
                  {t('outOfStock')}
                </span>
              )}
            </div>

            <p className="text-sm text-gray-600 dark:text-gray-300 line-clamp-3 leading-relaxed">
              {localizedDesc}
            </p>

            {/* Colors */}
            {product.colors && product.colors.length > 0 && (
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">
                  {t('color')}
                </label>
                <div className="flex flex-wrap gap-2">
                  {product.colors.map((c, i) => {
                    const colorName = c.name[language] || c.name.en;
                    const isSelected = selectedColor === colorName || (!selectedColor && i === 0);
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setSelectedColor(colorName)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                          isSelected
                            ? 'border-[#0E11B7] bg-[#EEF2FF] text-[#0E11B7] dark:bg-[#0E11B7]/20 dark:text-white dark:border-[#0E11B7]'
                            : 'border-gray-200 dark:border-[#293142] text-gray-700 dark:text-gray-300 hover:border-gray-300'
                        }`}
                      >
                        {c.hex && (
                          <span
                            className="w-3 h-3 rounded-full border border-black/10"
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

            {/* Sizes */}
            {product.sizes && product.sizes.length > 0 && (
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">
                  {t('size')}
                </label>
                <div className="flex flex-wrap gap-2">
                  {product.sizes.map((s, i) => {
                    const isSelected = selectedSize === s || (!selectedSize && i === 0);
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setSelectedSize(s)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                          isSelected
                            ? 'border-[#0E11B7] bg-[#EEF2FF] text-[#0E11B7] dark:bg-[#0E11B7]/20 dark:text-white dark:border-[#0E11B7]'
                            : 'border-gray-200 dark:border-[#293142] text-gray-700 dark:text-gray-300 hover:border-gray-300'
                        }`}
                      >
                        {s}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Addons if restaurant meal */}
            {product.addons && product.addons.length > 0 && (
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">
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
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                          active
                            ? 'border-emerald-600 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-600'
                            : 'border-gray-200 dark:border-[#293142] text-gray-700 dark:text-gray-300'
                        }`}
                      >
                        {active && <Check className="w-3 h-3" />}
                        <span>{addon.name[language] || addon.name.en}</span>
                        <span className="text-[11px] opacity-80">+${addon.price.toFixed(2)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Quantity and Actions */}
            <div className="flex flex-col gap-2.5 pt-2 mt-auto">
              <div className="flex items-center gap-3">
                <div className="flex items-center border border-gray-200 dark:border-[#293142] rounded-xl overflow-hidden bg-gray-50 dark:bg-[#111722]">
                  <button
                    type="button"
                    onClick={() => setQuantity(prev => Math.max(1, prev - 1))}
                    className="w-10 h-10 flex items-center justify-center text-lg font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                  >
                    -
                  </button>
                  <span className="w-10 text-center font-black text-sm text-gray-900 dark:text-white">
                    {quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => setQuantity(prev => prev + 1)}
                    className="w-10 h-10 flex items-center justify-center text-lg font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                  >
                    +
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleAddToCart}
                  className="flex-1 py-3 px-4 bg-[#0E11B7] hover:bg-[#070A86] text-white font-extrabold text-sm rounded-xl flex items-center justify-center gap-2 shadow-md shadow-[#0E11B7]/20 transition-all active:scale-[0.98]"
                >
                  <ShoppingBasket className="w-4 h-4" />
                  <span>{t('addToCart')}</span>
                </button>

                <button
                  type="button"
                  onClick={() => toggleFavorite(product.id)}
                  aria-label="Favorite"
                  className={`w-11 h-11 rounded-xl flex items-center justify-center border transition-colors ${
                    isFav
                      ? 'bg-rose-50 text-rose-600 border-rose-200 dark:bg-rose-950/40 dark:border-rose-800'
                      : 'border-gray-200 dark:border-[#293142] text-gray-600 dark:text-gray-300 hover:text-rose-600'
                  }`}
                >
                  <Heart className={`w-5 h-5 ${isFav ? 'fill-current' : ''}`} />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handleWhatsAppOrder}
                  className="py-2.5 px-3 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>{t('orderViaWhatsapp')}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onNavigateDetail?.(product.slug);
                  }}
                  className="py-2.5 px-3 bg-gray-100 hover:bg-gray-200 text-gray-800 dark:bg-[#111722] dark:hover:bg-gray-800 dark:text-gray-200 border border-gray-200 dark:border-[#293142] rounded-xl text-xs font-bold text-center transition-colors"
                >
                  {t('viewDetails')} →
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
