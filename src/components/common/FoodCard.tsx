import React from 'react';
import { Clock, Plus, Star, Utensils, Flame, Sparkles } from 'lucide-react';
import { Product } from '../../types';
import { useLanguage } from '../../i18n/LanguageContext';
import { useCart } from '../../context/CartContext';

interface FoodCardProps {
  meal: Product;
  restaurantName?: string;
  onSelectMeal?: (meal: Product) => void;
  onSelectAddons?: (meal: Product) => void;
  onNavigate?: (slug: string) => void;
}

export const FoodCard: React.FC<FoodCardProps> = ({
  meal,
  restaurantName,
  onSelectMeal,
  onSelectAddons,
  onNavigate,
}) => {
  const selectHandler = onSelectMeal || onSelectAddons;
  const { language, t } = useLanguage();
  const { addItem } = useCart();

  const title = meal.title[language] || meal.title.en;
  const description = meal.description[language] || meal.description.en;
  const prepTime = meal.prepTime?.[language] || meal.prepTime?.en || '15-25 min';
  const hasAddons = Boolean(meal.addons && meal.addons.length > 0);

  const handleCardClick = () => {
    if (selectHandler && hasAddons) {
      selectHandler(meal);
    } else if (onNavigate) {
      onNavigate(meal.slug);
    } else {
      window.location.hash = `#/product/${meal.slug}`;
    }
  };

  const handleActionClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (hasAddons && selectHandler) {
      selectHandler(meal);
    } else {
      addItem(meal, 1);
    }
  };

  return (
    <div
      id={`food-card-${meal.id}`}
      onClick={handleCardClick}
      className="group relative flex flex-col justify-between bg-white dark:bg-[#151A23] rounded-2xl border border-gray-200 dark:border-[#293142] overflow-hidden hover:border-[#F97316]/40 dark:hover:border-[#F97316]/50 hover:shadow-xl transition-all duration-300 cursor-pointer"
    >
      {/* Top Media Area */}
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-gray-100 dark:bg-gray-800">
        <img
          src={meal.thumbnail || meal.images[0]}
          alt={title}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />

        {/* Prep Time Badge */}
        <div className="absolute top-3 start-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/70 backdrop-blur-md text-white text-[11px] font-bold">
          <Clock className="w-3 h-3 text-orange-400" />
          <span>{prepTime}</span>
        </div>

        {/* Discount / Offer Badge */}
        {meal.discount && meal.discount > 0 && (
          <div className="absolute top-3 end-3 px-2 py-0.5 rounded-full bg-rose-600 text-white text-[10px] font-black tracking-wide uppercase shadow-sm">
            {meal.discount}% {t('discountOff')}
          </div>
        )}

        {/* Restaurant Attribution if available */}
        {meal.seller?.name && (
          <div className="absolute bottom-2 start-3 px-2 py-0.5 rounded-md bg-white/90 dark:bg-black/80 backdrop-blur-sm text-[10px] font-bold text-gray-800 dark:text-gray-200">
            {meal.seller.name}
          </div>
        )}
      </div>

      {/* Content Area */}
      <div className="p-4 flex flex-col flex-grow justify-between gap-3">
        <div>
          <div className="flex items-center justify-between gap-2 mb-1">
            <h3 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white line-clamp-1 group-hover:text-[#F97316] transition-colors">
              {title}
            </h3>
            {meal.rating > 0 && (
              <span className="flex items-center gap-1 text-xs font-bold text-amber-500 shrink-0">
                <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                {meal.rating.toFixed(1)}
              </span>
            )}
          </div>

          <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 leading-relaxed">
            {description}
          </p>
        </div>

        {/* Price & Action Row */}
        <div className="pt-2 border-t border-gray-100 dark:border-[#222B38] flex items-center justify-between gap-2">
          <div className="flex flex-col">
            <div className="flex items-baseline gap-1.5">
              <span className="text-base sm:text-lg font-black text-gray-900 dark:text-white">
                ${meal.price.toFixed(2)}
              </span>
              {meal.oldPrice && meal.oldPrice > meal.price && (
                <span className="text-xs text-gray-400 line-through">
                  ${meal.oldPrice.toFixed(2)}
                </span>
              )}
            </div>
            {hasAddons && (
              <span className="text-[10px] text-orange-600 dark:text-orange-400 font-semibold">
                {t('mealAddons')}
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={handleActionClick}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold shadow-md shadow-orange-500/20 active:scale-95 transition-all"
            title={hasAddons ? t('customizeMeal') : t('addToCart')}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{hasAddons ? t('customizeMeal') : t('addToCart')}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
