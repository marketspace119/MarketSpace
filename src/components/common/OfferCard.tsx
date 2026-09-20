import React from 'react';
import {
  Flame,
  Clock,
  Sparkles,
  ShoppingBag,
  ArrowRight,
  Eye,
  Star,
  Tag,
} from 'lucide-react';
import { Product } from '../../types';
import { useLanguage } from '../../i18n/LanguageContext';
import { useCart } from '../../context/CartContext';
import { taxonomyService } from '../../services/taxonomyService';

interface OfferCardProps {
  product: Product;
  onQuickView?: (product: Product) => void;
  onNavigate?: (slug: string) => void;
}

export const OfferCard: React.FC<OfferCardProps> = ({
  product,
  onQuickView,
  onNavigate,
}) => {
  const { language, t } = useLanguage();
  const { addItem } = useCart();

  const title = product.title[language] || product.title.en;
  const classification = taxonomyService.classify(product);

  const discountPercent =
    product.discount ||
    (product.oldPrice && product.oldPrice > product.price
      ? Math.round(((product.oldPrice - product.price) / product.oldPrice) * 100)
      : 25);

  const savingsAmount =
    product.oldPrice && product.oldPrice > product.price
      ? (product.oldPrice - product.price).toFixed(2)
      : (product.price * 0.25).toFixed(2);

  const handleClick = () => {
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

  const handleQuickView = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onQuickView) onQuickView(product);
  };

  // Condition Badge Color & Label
  const getConditionPill = () => {
    switch (classification.productCondition) {
      case 'used':
        return {
          label: t('breadcrumbUsed'),
          bg: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300',
        };
      case 'dropshipping':
        return {
          label: t('breadcrumbDropshipping'),
          bg: 'bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300',
        };
      default:
        return {
          label: t('breadcrumbNew'),
          bg: 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300',
        };
    }
  };

  const conditionPill = getConditionPill();

  return (
    <div
      id={`offer-card-${product.id}`}
      onClick={handleClick}
      className="group relative flex flex-col justify-between bg-white dark:bg-[#151A23] rounded-2xl border border-rose-200 dark:border-rose-950/60 overflow-hidden hover:border-rose-500/50 hover:shadow-2xl hover:shadow-rose-500/10 transition-all duration-300 cursor-pointer"
    >
      {/* Top Media Area */}
      <div className="relative aspect-square w-full overflow-hidden bg-gray-100 dark:bg-gray-800">
        <img
          src={product.thumbnail || product.images[0]}
          alt={title}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />

        {/* Discount Ribbon */}
        <div className="absolute top-3 start-3 inline-flex items-center gap-1 px-3 py-1 rounded-full bg-rose-600 text-white text-xs font-black shadow-lg shadow-rose-600/30">
          <Flame className="w-3.5 h-3.5" />
          <span>-{discountPercent}% {t('discountOff')}</span>
        </div>

        {/* Condition Tag */}
        <div className={`absolute top-3 end-3 px-2 py-0.5 rounded-md text-[10px] font-bold ${conditionPill.bg} backdrop-blur-sm shadow`}>
          {conditionPill.label}
        </div>

        {/* Quick View Button */}
        {onQuickView && (
          <button
            type="button"
            onClick={handleQuickView}
            className="absolute bottom-3 end-3 p-2 rounded-xl bg-white/90 dark:bg-black/80 backdrop-blur-sm text-gray-700 dark:text-gray-200 opacity-0 group-hover:opacity-100 hover:bg-white dark:hover:bg-black transition-all shadow"
            title={t('quickView')}
          >
            <Eye className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Content Area */}
      <div className="p-4 flex flex-col flex-grow justify-between gap-3">
        <div>
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              {t('flashDealsTitle')}
            </span>
            {product.rating > 0 && (
              <span className="flex items-center gap-1 text-xs font-bold text-amber-500">
                <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                {product.rating.toFixed(1)}
              </span>
            )}
          </div>

          <h3 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white line-clamp-2 leading-snug group-hover:text-rose-600 transition-colors">
            {title}
          </h3>
        </div>

        {/* Pricing & Savings Breakdown */}
        <div className="pt-2 border-t border-rose-100 dark:border-rose-950/40 flex items-end justify-between gap-2">
          <div className="flex flex-col">
            <div className="flex items-baseline gap-2">
              <span className="text-lg sm:text-xl font-black text-rose-600 dark:text-rose-400">
                ${product.price.toFixed(2)}
              </span>
              {product.oldPrice && (
                <span className="text-xs text-gray-400 line-through">
                  ${product.oldPrice.toFixed(2)}
                </span>
              )}
            </div>
            <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
              {t('saveAmount')} ${savingsAmount}
            </span>
          </div>

          <button
            type="button"
            onClick={handleAddToCart}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-md shadow-rose-600/20 active:scale-95 transition-all"
            title={t('addToCart')}
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            <span>{t('addToCart')}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
