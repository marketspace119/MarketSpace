import React from 'react';
import {
  UtensilsCrossed,
  Clock,
  Truck,
  DollarSign,
  Star,
  CheckCircle2,
  ArrowRight,
  MapPin,
} from 'lucide-react';
import { Store } from '../../types';
import { useLanguage } from '../../i18n/LanguageContext';

interface RestaurantCardProps {
  restaurant: Store;
  onNavigate?: (path: string) => void;
}

export const RestaurantCard: React.FC<RestaurantCardProps> = ({
  restaurant,
  onNavigate,
}) => {
  const { language, t } = useLanguage();

  const description =
    typeof restaurant.description === 'string'
      ? restaurant.description
      : restaurant.description[language] || restaurant.description.en;

  const handleClick = () => {
    if (onNavigate) {
      onNavigate(`/restaurant/${restaurant.slug}`);
    } else {
      window.location.hash = `#/restaurant/${restaurant.slug}`;
    }
  };

  const deliveryFee = restaurant.shippingFee !== undefined ? restaurant.shippingFee : 1.5;
  const minOrder = restaurant.minOrder !== undefined ? restaurant.minOrder : 5.0;

  return (
    <div
      id={`restaurant-card-${restaurant.id}`}
      onClick={handleClick}
      className="group flex flex-col justify-between bg-white dark:bg-[#151A23] rounded-2xl border border-gray-200 dark:border-[#293142] overflow-hidden hover:border-orange-500/50 hover:shadow-xl transition-all duration-300 cursor-pointer"
    >
      {/* Top Cover Banner & Logo */}
      <div className="relative h-36 sm:h-40 w-full overflow-hidden bg-gray-100 dark:bg-gray-800">
        <img
          src={restaurant.cover || restaurant.logo}
          alt={restaurant.name}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

        {/* Status Badge */}
        <div className="absolute top-3 start-3 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500 text-white text-[10px] font-black uppercase shadow-sm">
          <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
          <span>{t('openNow')}</span>
        </div>

        {/* Floating Logo & Name in banner */}
        <div className="absolute bottom-3 start-3 end-3 flex items-end gap-3">
          <div className="w-12 h-12 rounded-xl bg-white dark:bg-[#151A23] p-1 shadow-lg border border-white/20 shrink-0 overflow-hidden">
            <img
              src={restaurant.logo}
              alt=""
              className="w-full h-full object-contain rounded-lg"
            />
          </div>
          <div className="text-white min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <h3 className="text-base font-black truncate group-hover:text-orange-300 transition-colors">
                {restaurant.name}
              </h3>
              {restaurant.verified && (
                <CheckCircle2 className="w-4 h-4 text-blue-400 shrink-0" />
              )}
            </div>
            <p className="text-[11px] text-gray-200/90 flex items-center gap-1 truncate">
              <MapPin className="w-3 h-3 text-orange-400 shrink-0" />
              <span>{restaurant.city || 'Mogadishu'}</span>
            </p>
          </div>
        </div>
      </div>

      {/* Body & Specs */}
      <div className="p-4 flex flex-col flex-grow justify-between gap-3">
        <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 leading-relaxed">
          {description}
        </p>

        {/* Delivery & Order Metrics Bar */}
        <div className="grid grid-cols-3 gap-2 py-2.5 px-3 rounded-xl bg-gray-50 dark:bg-[#1C2331] text-[11px] border border-gray-100 dark:border-[#263042]">
          <div className="flex flex-col">
            <span className="text-[10px] text-gray-400 flex items-center gap-1">
              <Truck className="w-3 h-3 text-orange-500" />
              {t('deliveryFeeLabel')}
            </span>
            <span className="font-bold text-gray-900 dark:text-gray-100">
              {deliveryFee === 0 ? t('freeShipping') : `$${deliveryFee.toFixed(2)}`}
            </span>
          </div>

          <div className="flex flex-col">
            <span className="text-[10px] text-gray-400 flex items-center gap-1">
              <Clock className="w-3 h-3 text-blue-500" />
              {t('deliveryTime')}
            </span>
            <span className="font-bold text-gray-900 dark:text-gray-100">
              20-35 min
            </span>
          </div>

          <div className="flex flex-col">
            <span className="text-[10px] text-gray-400 flex items-center gap-1">
              <DollarSign className="w-3 h-3 text-emerald-500" />
              {t('minOrderLabel')}
            </span>
            <span className="font-bold text-gray-900 dark:text-gray-100">
              ${minOrder.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Footer Rating & Action Button */}
        <div className="pt-2 border-t border-gray-100 dark:border-[#222B38] flex items-center justify-between">
          <div className="flex items-center gap-1 text-xs font-bold text-gray-800 dark:text-gray-200">
            <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
            <span>{restaurant.rating ? restaurant.rating.toFixed(1) : '4.8'}</span>
            <span className="text-gray-400 text-[10px] font-normal">
              ({restaurant.reviewsCount || 48})
            </span>
          </div>

          <span className="inline-flex items-center gap-1 text-xs font-bold text-orange-600 dark:text-orange-400 group-hover:translate-x-1 rtl:group-hover:-translate-x-1 transition-transform">
            <span>{t('viewFoodMenu')}</span>
            <ArrowRight className="w-3.5 h-3.5 rtl:rotate-180" />
          </span>
        </div>
      </div>
    </div>
  );
};
