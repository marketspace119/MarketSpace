import React from 'react';
import { Heart, ShoppingBasket, ArrowRight, Trash2 } from 'lucide-react';
import { useFavorites } from '../context/FavoritesContext';
import { seedProducts } from '../data/seedProducts';
import { ProductCard } from '../components/common/ProductCard';
import { Product } from '../types';
import { useLanguage } from '../i18n/LanguageContext';

interface FavoritesPageProps {
  onNavigate: (path: string) => void;
  onQuickView: (product: Product) => void;
}

export const FavoritesPage: React.FC<FavoritesPageProps> = ({ onNavigate, onQuickView }) => {
  const { favorites, clearFavorites } = useFavorites();
  const { t } = useLanguage();

  const favoriteProducts = seedProducts.filter(p => favorites.includes(p.id));

  if (favoriteProducts.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center space-y-5 animate-fadeIn">
        <div className="w-20 h-20 rounded-full bg-rose-50 dark:bg-rose-950/30 text-rose-500 mx-auto flex items-center justify-center">
          <Heart className="w-10 h-10" />
        </div>
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white">
            {t('emptyWishlist')}
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 max-w-sm mx-auto">
            {t('emptyWishlistDesc')}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onNavigate('/shop')}
          className="h-11 px-8 rounded-full bg-[#0E11B7] hover:bg-[#070A86] text-white font-extrabold text-xs shadow-md transition-all"
        >
          {t('shopNow')}
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6 animate-fadeIn">
      <div className="flex items-center justify-between pb-4 border-b border-gray-200 dark:border-[#293142]">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white">
            {t('wishlist')}
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            {favoriteProducts.length} {t('itemsAvailable')}
          </p>
        </div>

        <button
          type="button"
          onClick={clearFavorites}
          className="text-xs font-bold text-rose-600 hover:underline flex items-center gap-1"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>مسح كل المفضلة</span>
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {favoriteProducts.map(product => (
          <ProductCard
            key={product.id}
            product={product}
            onQuickView={onQuickView}
            onNavigate={slug => onNavigate(`/product/${slug}`)}
          />
        ))}
      </div>
    </div>
  );
};
