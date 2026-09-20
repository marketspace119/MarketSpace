import React from 'react';
import {
  Store as StoreIcon,
  CheckCircle2,
  Star,
  Users,
  MapPin,
  ArrowRight,
  ShoppingBag,
} from 'lucide-react';
import { Store } from '../../types';
import { useLanguage } from '../../i18n/LanguageContext';

interface StoreCardProps {
  store: Store;
  onNavigate?: (path: string) => void;
}

export const StoreCard: React.FC<StoreCardProps> = ({ store, onNavigate }) => {
  const { language, t } = useLanguage();

  const description =
    typeof store.description === 'string'
      ? store.description
      : store.description[language] || store.description.en;

  const handleClick = () => {
    if (onNavigate) {
      onNavigate(`/store/${store.slug}`);
    } else {
      window.location.hash = `#/store/${store.slug}`;
    }
  };

  return (
    <div
      id={`store-card-${store.id}`}
      onClick={handleClick}
      className="group flex flex-col justify-between bg-white dark:bg-[#151A23] rounded-2xl border border-gray-200 dark:border-[#293142] overflow-hidden hover:border-[#0E11B7]/40 dark:hover:border-[#3B82F6]/50 hover:shadow-xl transition-all duration-300 cursor-pointer"
    >
      {/* Top Cover with Logo Overlay */}
      <div className="relative h-32 sm:h-36 w-full overflow-hidden bg-gray-100 dark:bg-gray-800">
        <img
          src={store.cover || store.logo}
          alt={store.name}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

        {/* Verified Badge */}
        {store.verified && (
          <div className="absolute top-3 end-3 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-600/90 backdrop-blur-sm text-white text-[10px] font-bold shadow">
            <CheckCircle2 className="w-3 h-3" />
            <span>{t('verifiedSeller')}</span>
          </div>
        )}

        {/* Store Logo */}
        <div className="absolute -bottom-4 start-4 w-12 h-12 rounded-xl bg-white dark:bg-[#151A23] p-1 shadow-lg border border-gray-100 dark:border-gray-800 overflow-hidden">
          <img
            src={store.logo}
            alt=""
            className="w-full h-full object-contain rounded-lg"
          />
        </div>
      </div>

      {/* Body */}
      <div className="pt-6 p-4 flex flex-col flex-grow justify-between gap-3">
        <div>
          <div className="flex items-center justify-between gap-2 mb-1">
            <h3 className="text-base font-bold text-gray-900 dark:text-white truncate group-hover:text-[#0E11B7] dark:group-hover:text-[#3B82F6] transition-colors">
              {store.name}
            </h3>
            <span className="flex items-center gap-1 text-xs font-bold text-amber-500 shrink-0">
              <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
              {store.rating ? store.rating.toFixed(1) : '4.9'}
            </span>
          </div>

          <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 leading-relaxed">
            {description}
          </p>
        </div>

        {/* Metadata Badges */}
        <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 pt-2 border-t border-gray-100 dark:border-[#222B38]">
          <div className="flex items-center gap-1 text-[11px]">
            <MapPin className="w-3 h-3 text-red-500" />
            <span>{store.city || 'Mogadishu'}</span>
          </div>

          <div className="flex items-center gap-1 text-[11px]">
            <Users className="w-3 h-3 text-blue-500" />
            <span>{store.followersCount || 120} {t('followers')}</span>
          </div>
        </div>

        {/* Action Button */}
        <button
          type="button"
          onClick={handleClick}
          className="w-full py-2.5 px-3 rounded-xl bg-gray-50 dark:bg-[#1C2331] hover:bg-[#0E11B7] hover:text-white dark:hover:bg-[#3B82F6] text-gray-800 dark:text-gray-200 text-xs font-bold transition-all flex items-center justify-center gap-2 group/btn"
        >
          <ShoppingBag className="w-3.5 h-3.5" />
          <span>{t('viewStore')}</span>
          <ArrowRight className="w-3.5 h-3.5 rtl:rotate-180 group-hover/btn:translate-x-1 rtl:group-hover/btn:-translate-x-1 transition-transform" />
        </button>
      </div>
    </div>
  );
};
