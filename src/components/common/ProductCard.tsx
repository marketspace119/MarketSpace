import React from 'react';
import {
  Heart,
  Eye,
  ShoppingBasket,
  MessageCircle,
  Star,
  UtensilsCrossed,
  Wrench,
  Store,
  Boxes,
  Recycle,
  Tag,
} from 'lucide-react';
import { Product } from '../../types';
import { useLanguage } from '../../i18n/LanguageContext';
import { useFavorites } from '../../context/FavoritesContext';
import { useCart } from '../../context/CartContext';

interface ProductCardProps {
  product: Product;
  onQuickView?: (product: Product) => void;
  onNavigate?: (slug: string) => void;
}

export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  onQuickView,
  onNavigate,
}) => {
  const { language, t } = useLanguage();
  const { isFavorite, toggleFavorite } = useFavorites();
  const { addItem } = useCart();

  const isFav = isFavorite(product.id);
  const localizedTitle = product.title[language] || product.title.en;

  const handleCardClick = () => {
    if (onNavigate) {
      onNavigate(product.slug);
    } else {
      window.location.hash = `#/product/${product.slug}`;
    }
  };

  const handleAddToCart = (e: React.MouseEvent) => {
    e.stopPropagation();
    addItem(product, 1);
  };

  const handleWhatsAppOrder = (e: React.MouseEvent) => {
    e.stopPropagation();
    const phone = product.seller?.whatsapp || '252612494952';
    const textLines = [
      t('whatsappMsgGreeting'),
      `${t('whatsappProduct')} ${localizedTitle}`,
      `${t('whatsappPrice')} $${product.price.toFixed(2)}`,
      product.brand ? `Brand: ${product.brand}` : '',
      `${t('whatsappLink')} ${window.location.origin}/#/product/${product.slug}`,
    ].filter(Boolean);

    const message = encodeURIComponent(textLines.join('\n'));
    window.open(`https://wa.me/${phone}?text=${message}`, '_blank');
  };

  // Type badge formatting
  const getTypeBadge = () => {
    switch (product.type) {
      case 'restaurants':
      case 'restaurant-products':
        return {
          label: t('restaurants'),
          bg: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-800',
          icon: <UtensilsCrossed className="w-3 h-3" />,
          ctaText: t('viewMenu'),
        };
      case 'services':
        return {
          label: t('services'),
          bg: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800',
          icon: <Wrench className="w-3 h-3" />,
          ctaText: t('bookService'),
        };
      case 'stores':
      case 'store-products':
        return {
          label: product.seller?.name || t('stores'),
          bg: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800',
          icon: <Store className="w-3 h-3" />,
          ctaText: t('addToCart'),
        };
      case 'dropshipping':
        return {
          label: t('dropshipping'),
          bg: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800',
          icon: <Boxes className="w-3 h-3" />,
          ctaText: t('addToCart'),
        };
      case 'used':
        return {
          label: t('used'),
          bg: 'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-800',
          icon: <Recycle className="w-3 h-3" />,
          ctaText: t('viewDetails'),
        };
      case 'ads':
        return {
          label: t('ads'),
          bg: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800',
          icon: <Tag className="w-3 h-3" />,
          ctaText: t('viewDetails'),
        };
      default:
        return {
          label: t('shop'),
          bg: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
          icon: <ShoppingBasket className="w-3 h-3" />,
          ctaText: t('addToCart'),
        };
    }
  };

  const badgeInfo = getTypeBadge();
  const isFoodOrService = product.type === 'restaurant-products' || product.type === 'restaurants' || product.type === 'services';

  return (
    <div
      id={`product-card-${product.id}`}
      onClick={handleCardClick}
      className="group relative flex flex-col h-full bg-white dark:bg-[#151A23] border border-gray-200 dark:border-[#293142] rounded-2xl overflow-hidden shadow-xs hover:shadow-lg hover:-translate-y-1 transition-all duration-200 cursor-pointer"
    >
      {/* Image Wrap */}
      <div className={`relative w-full overflow-hidden bg-gray-50 dark:bg-[#111722] ${isFoodOrService ? 'aspect-[16/10]' : 'aspect-square'}`}>
        <img
          src={product.thumbnail || product.images[0]}
          alt={localizedTitle}
          loading="lazy"
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        />

        {/* Discount Badge */}
        {product.discount && product.discount > 0 && (
          <div className="absolute top-2.5 end-2.5 z-10 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-black bg-[#E11D48] text-white shadow-sm">
            {product.discount}% {t('discountBadge')}
          </div>
        )}

        {/* Wishlist Button */}
        <button
          type="button"
          aria-label={isFav ? t('removedFromWishlist') : t('addedToWishlist')}
          onClick={(e) => {
            e.stopPropagation();
            toggleFavorite(product.id);
          }}
          className={`absolute top-2.5 start-2.5 z-10 w-8 h-8 rounded-full flex items-center justify-center backdrop-blur-md transition-all shadow-sm ${
            isFav
              ? 'bg-rose-50 text-rose-600 dark:bg-rose-950/80 dark:text-rose-400'
              : 'bg-white/90 text-gray-600 hover:text-rose-600 dark:bg-[#151A23]/90 dark:text-gray-300 dark:hover:text-rose-400'
          }`}
        >
          <Heart className={`w-4 h-4 ${isFav ? 'fill-current' : ''}`} />
        </button>

        {/* Quick View Floating Action */}
        <div className="absolute inset-x-2 bottom-2 hidden sm:flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onQuickView?.(product);
            }}
            className="w-full py-1.5 px-3 bg-white/95 dark:bg-[#151A23]/95 hover:bg-[#0E11B7] hover:text-white dark:hover:bg-[#0E11B7] text-gray-800 dark:text-gray-200 text-xs font-bold rounded-lg shadow-md flex items-center justify-center gap-1.5 backdrop-blur-xs transition-colors"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>{t('quickView')}</span>
          </button>
        </div>
      </div>

      {/* Card Info Content */}
      <div className="flex flex-col flex-1 p-3.5 sm:p-4 gap-2">
        {/* Category Chip & Rating */}
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border font-bold text-[11px] truncate ${badgeInfo.bg}`}>
            {badgeInfo.icon}
            <span className="truncate">{badgeInfo.label}</span>
          </span>

          <div className="flex items-center gap-1 text-amber-600 dark:text-amber-400 font-bold text-[11px] bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 rounded-md border border-amber-200 dark:border-amber-800">
            <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
            <span>{product.rating.toFixed(1)}</span>
          </div>
        </div>

        {/* Product Title */}
        <h3 className="font-bold text-sm sm:text-[15px] leading-snug text-gray-900 dark:text-white line-clamp-2 min-h-[2.5rem] group-hover:text-[#0E11B7] dark:group-hover:text-[#3B82F6] transition-colors">
          {localizedTitle}
        </h3>

        {/* Price & Discount */}
        <div className="flex items-baseline gap-2 mt-auto pt-1">
          <span className="text-lg sm:text-xl font-black text-gray-950 dark:text-white">
            ${product.price.toFixed(2)}
          </span>
          {product.oldPrice && product.oldPrice > product.price && (
            <del className="text-xs text-gray-400 dark:text-gray-500 font-medium">
              ${product.oldPrice.toFixed(2)}
            </del>
          )}
        </div>

        {/* Actions Grid */}
        <div className="grid grid-cols-4 gap-1.5 pt-2 border-t border-gray-100 dark:border-[#293142]">
          <button
            type="button"
            onClick={handleAddToCart}
            className="col-span-3 py-2 px-3 bg-[#0E11B7] hover:bg-[#070A86] text-white text-xs font-extrabold rounded-lg flex items-center justify-center gap-1.5 transition-colors shadow-xs active:scale-[0.98]"
          >
            <ShoppingBasket className="w-3.5 h-3.5" />
            <span className="truncate">{badgeInfo.ctaText}</span>
          </button>

          <button
            type="button"
            aria-label={t('orderViaWhatsapp')}
            title={t('orderViaWhatsapp')}
            onClick={handleWhatsAppOrder}
            className="col-span-1 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:hover:bg-emerald-900/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 rounded-lg flex items-center justify-center transition-colors"
          >
            <MessageCircle className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
