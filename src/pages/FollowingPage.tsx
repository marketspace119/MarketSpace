import React, { useState, useEffect } from 'react';
import {
  Heart,
  Store as StoreIcon,
  UtensilsCrossed,
  Wrench,
  Check,
  Plus,
  ChevronRight,
  ArrowRight,
  ShieldCheck,
  Star,
  Users,
} from 'lucide-react';
import { Store } from '../types';
import { useLanguage } from '../i18n/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { storeService } from '../services/storeService';
import { StoreCard } from '../components/common/StoreCard';
import { RestaurantCard } from '../components/common/RestaurantCard';

interface FollowingPageProps {
  onNavigate: (path: string) => void;
}

export const FollowingPage: React.FC<FollowingPageProps> = ({ onNavigate }) => {
  const { language, t } = useLanguage();
  const { user } = useAuth();
  const userId = user?.id || (user as any)?.uid || 'guest_user';

  const [followedStores, setFollowedStores] = useState<Store[]>([]);
  const [recommendedStores, setRecommendedStores] = useState<Store[]>([]);
  const [activeTab, setActiveTab] = useState<'all' | 'store' | 'restaurant' | 'service'>('all');
  const [loading, setLoading] = useState(true);

  // Load followed stores
  const loadData = () => {
    setLoading(true);
    const followed = storeService.getFollowedStores(userId);
    setFollowedStores(followed);

    // Recommended: Top verified stores not yet followed
    const allApproved = storeService.getAllStores({ status: 'approved' });
    const followedIds = new Set(followed.map(s => s.id));
    const recommended = allApproved
      .filter(s => !followedIds.has(s.id) && s.isVerified)
      .sort((a, b) => b.followersCount - a.followersCount)
      .slice(0, 6);
    setRecommendedStores(recommended);

    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, [userId]);

  const handleToggleFollow = (store: Store) => {
    const isCurrentlyFollowing = storeService.isFollowing(store.id, userId);
    if (isCurrentlyFollowing) {
      storeService.unfollowStore(userId, store.id);
    } else {
      storeService.followStore(userId, store.id);
    }
    loadData();
  };

  const filteredFollowed = followedStores.filter(s => {
    if (activeTab === 'all') return true;
    if (activeTab === 'restaurant') return s.sellerType === 'restaurant';
    if (activeTab === 'service') return s.sellerType === 'service';
    return s.sellerType === 'store' || s.sellerType === 'classified';
  });

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-8 animate-fadeIn">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
        <button onClick={() => onNavigate('/')} className="hover:text-[#0E11B7]">
          {t('home')}
        </button>
        <ChevronRight className="w-3.5 h-3.5 rtl:rotate-180 text-gray-400" />
        <span className="font-bold text-gray-900 dark:text-white">
          {t('followingTitle')}
        </span>
      </nav>

      {/* Hero Header */}
      <div className="p-6 sm:p-8 rounded-3xl bg-white dark:bg-[#151A23] border border-gray-200 dark:border-[#293142] shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="inline-flex items-center gap-2 text-xs font-bold text-rose-600 bg-rose-50 dark:bg-rose-950/40 px-3 py-1 rounded-full">
            <Heart className="w-3.5 h-3.5 fill-current" />
            <span>{t('followingTitle')}</span>
          </div>
          <span className="text-xs font-bold text-gray-400">
            {followedStores.length} {t('following')}
          </span>
        </div>

        <h1 className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white">
          {t('followingTitle')}
        </h1>
        <p className="text-xs sm:text-sm text-gray-500 max-w-2xl leading-relaxed">
          {t('followingSubtitle')}
        </p>

        {/* Tab Filter */}
        {followedStores.length > 0 && (
          <div className="flex items-center gap-2 pt-2 overflow-x-auto scrollbar-none">
            {[
              { id: 'all', label: t('allResults') },
              { id: 'store', label: t('stores') },
              { id: 'restaurant', label: t('restaurants') },
              { id: 'service', label: t('services') },
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as any)}
                className={`py-1.5 px-3.5 rounded-full text-xs font-bold transition-all ${
                  activeTab === tab.id
                    ? 'bg-[#0E11B7] text-white shadow-xs'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Followed Stores List */}
      {filteredFollowed.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredFollowed.map(store => {
            const isRestaurant = store.sellerType === 'restaurant';
            return (
              <div
                key={store.id}
                className="p-5 rounded-3xl bg-white dark:bg-[#151A23] border border-gray-200 dark:border-[#293142] shadow-xs flex flex-col justify-between space-y-4 hover:border-gray-300 transition"
              >
                <div className="flex items-start gap-3.5">
                  <img
                    src={store.logo}
                    alt={store.name}
                    className="w-14 h-14 rounded-2xl object-cover border border-gray-200 dark:border-gray-700 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <h3
                        onClick={() =>
                          onNavigate(
                            isRestaurant
                              ? `/restaurant/${store.slug}`
                              : `/store/${store.slug}`
                          )
                        }
                        className="font-black text-sm text-gray-900 dark:text-white truncate cursor-pointer hover:text-[#0E11B7]"
                      >
                        {store.name}
                      </h3>
                      {store.isVerified && (
                        <ShieldCheck className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                      )}
                    </div>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate mt-0.5">
                      {store.city} • {store.district || store.category}
                    </p>
                    <div className="flex items-center gap-3 mt-1.5 text-[11px] text-gray-500 font-bold">
                      <span className="flex items-center gap-1 text-amber-500">
                        <Star className="w-3 h-3 fill-current" />
                        <span>{store.rating.toFixed(1)}</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="w-3 h-3 text-gray-400" />
                        <span>{store.followersCount}</span>
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-gray-100 dark:border-gray-800">
                  <button
                    type="button"
                    onClick={() =>
                      onNavigate(
                        isRestaurant
                          ? `/restaurant/${store.slug}`
                          : `/store/${store.slug}`
                      )
                    }
                    className="flex-1 py-2 px-3 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 text-gray-900 dark:text-white text-xs font-bold text-center transition"
                  >
                    {language === 'ar' ? 'عرض الواجهة' : 'View Store'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleFollow(store)}
                    className="py-2 px-3.5 rounded-xl border border-rose-200 dark:border-rose-900/40 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-xs font-bold transition flex items-center gap-1.5"
                  >
                    <Heart className="w-3.5 h-3.5 fill-current" />
                    <span>{t('following')}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Empty State */
        <div className="p-8 sm:p-12 rounded-3xl bg-white dark:bg-[#151A23] border border-gray-200 dark:border-[#293142] text-center space-y-4">
          <div className="w-16 h-16 mx-auto rounded-3xl bg-rose-50 dark:bg-rose-950/40 text-rose-500 flex items-center justify-center">
            <Heart className="w-8 h-8" />
          </div>
          <div className="max-w-md mx-auto space-y-1.5">
            <h2 className="text-xl font-black text-gray-900 dark:text-white">
              {t('noFollowedStores')}
            </h2>
            <p className="text-xs text-gray-500 leading-relaxed">
              {t('noFollowedDesc')}
            </p>
          </div>
        </div>
      )}

      {/* Recommended Verified Vendors Section */}
      {recommendedStores.length > 0 && (
        <section className="space-y-4 pt-4">
          <div className="flex items-center justify-between">
            <h2 className="font-black text-lg text-gray-900 dark:text-white flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-blue-600" />
              <span>{t('recommendedVendorsToFollow')}</span>
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {recommendedStores.map(store => {
              const isFollowing = storeService.isFollowing(store.id, userId);
              return (
                <div
                  key={store.id}
                  className="p-5 rounded-3xl bg-white dark:bg-[#151A23] border border-gray-200 dark:border-[#293142] shadow-xs flex flex-col justify-between space-y-4"
                >
                  <div className="flex items-start gap-3.5">
                    <img
                      src={store.logo}
                      alt={store.name}
                      className="w-14 h-14 rounded-2xl object-cover border border-gray-200 dark:border-gray-700 shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <h3
                          onClick={() =>
                            onNavigate(
                              store.sellerType === 'restaurant'
                                ? `/restaurant/${store.slug}`
                                : `/store/${store.slug}`
                            )
                          }
                          className="font-black text-sm text-gray-900 dark:text-white truncate cursor-pointer hover:text-[#0E11B7]"
                        >
                          {store.name}
                        </h3>
                        {store.isVerified && (
                          <ShieldCheck className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                        )}
                      </div>
                      <p className="text-[11px] text-gray-500 truncate mt-0.5">
                        {store.city} • {store.district || store.category}
                      </p>
                      <div className="flex items-center gap-3 mt-1.5 text-[11px] text-gray-500 font-bold">
                        <span className="flex items-center gap-1 text-amber-500">
                          <Star className="w-3 h-3 fill-current" />
                          <span>{store.rating.toFixed(1)}</span>
                        </span>
                        <span className="flex items-center gap-1">
                          <Users className="w-3 h-3 text-gray-400" />
                          <span>{store.followersCount}</span>
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-2 border-t border-gray-100 dark:border-gray-800">
                    <button
                      type="button"
                      onClick={() =>
                        onNavigate(
                          store.sellerType === 'restaurant'
                            ? `/restaurant/${store.slug}`
                            : `/store/${store.slug}`
                        )
                      }
                      className="flex-1 py-2 px-3 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 text-gray-900 dark:text-white text-xs font-bold text-center transition"
                    >
                      {language === 'ar' ? 'عرض الواجهة' : 'View Store'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleFollow(store)}
                      className={`py-2 px-3.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                        isFollowing
                          ? 'bg-rose-50 text-rose-600 border border-rose-200'
                          : 'bg-[#0E11B7] hover:bg-[#070A86] text-white shadow-xs'
                      }`}
                    >
                      {isFollowing ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>{t('following')}</span>
                        </>
                      ) : (
                        <>
                          <Plus className="w-3.5 h-3.5" />
                          <span>{t('follow')}</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
};
