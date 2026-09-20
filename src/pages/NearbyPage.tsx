import React, { useState, useMemo } from 'react';
import {
  MapPin,
  Compass,
  Navigation,
  ChevronRight,
  Store as StoreIcon,
  UtensilsCrossed,
  Wrench,
  Sparkles,
  Search,
  CheckCircle2,
} from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import {
  discoveryService,
  SOMALIA_CITIES,
  MOGADISHU_DISTRICTS,
} from '../services/discoveryService';
import { StoreCard } from '../components/common/StoreCard';
import { RestaurantCard } from '../components/common/RestaurantCard';
import { ServiceCard } from '../components/common/ServiceCard';

interface NearbyPageProps {
  onNavigate: (path: string) => void;
}

export const NearbyPage: React.FC<NearbyPageProps> = ({ onNavigate }) => {
  const { language, t } = useLanguage();
  const [selectedCity, setSelectedCity] = useState<string>('Mogadishu');
  const [selectedDistrict, setSelectedDistrict] = useState<string>('All');
  const [domainFilter, setDomainFilter] = useState<'all' | 'stores' | 'restaurants' | 'services'>('all');
  const [isLocating, setIsLocating] = useState(false);
  const [locationStatus, setLocationStatus] = useState<string | null>(null);

  // Filter items based on selected city & district
  const nearbyData = useMemo(() => {
    return discoveryService.search(
      {
        city: selectedCity,
        district: selectedDistrict,
        domain: domainFilter,
      },
      language
    );
  }, [selectedCity, selectedDistrict, domainFilter, language]);

  const handleUseGeolocation = () => {
    setIsLocating(true);
    setLocationStatus(null);

    if (!('geolocation' in navigator)) {
      setIsLocating(false);
      setLocationStatus(t('locationUnavailable'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      () => {
        setIsLocating(false);
        // Default to Mogadishu capital hub where highest vendor density is located
        setSelectedCity('Mogadishu');
        setSelectedDistrict('All');
        setLocationStatus(
          language === 'ar'
            ? 'تم تحديد نطاق موقعك في مقديشو والمناطق المحيطة'
            : language === 'so'
            ? 'Goobtaada waxaa lagu qiyaasay Muqdisho iyo nawaaxigeeda'
            : 'Estimated location set to Mogadishu metropolitan'
        );
      },
      () => {
        setIsLocating(false);
        setLocationStatus(t('locationUnavailable'));
      },
      { timeout: 6000 }
    );
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-8 animate-fadeIn">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
        <button onClick={() => onNavigate('/')} className="hover:text-[#0E11B7]">
          {t('home')}
        </button>
        <ChevronRight className="w-3.5 h-3.5 rtl:rotate-180 text-gray-400" />
        <span className="font-bold text-gray-900 dark:text-white">
          {t('nearbyTitle')}
        </span>
      </nav>

      {/* Hero Location Banner */}
      <div className="p-6 sm:p-10 rounded-3xl bg-gradient-to-br from-purple-500/10 via-purple-500/5 to-transparent dark:from-purple-950/40 dark:via-gray-900 border border-gray-200 dark:border-[#293142] space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/10 text-purple-700 dark:text-purple-400 text-xs font-bold">
              <Compass className="w-3.5 h-3.5" />
              <span>{t('nearbyTitle')}</span>
            </div>
            <h1 className="text-2xl sm:text-4xl font-black text-gray-900 dark:text-white">
              {t('nearbyTitle')}
            </h1>
            <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 max-w-xl">
              {t('nearbySubtitle')}
            </p>
          </div>

          <button
            type="button"
            onClick={handleUseGeolocation}
            disabled={isLocating}
            className="self-start sm:self-center px-4 py-2.5 rounded-2xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold flex items-center gap-2 shadow-md transition disabled:opacity-50"
          >
            <Navigation className={`w-4 h-4 ${isLocating ? 'animate-spin' : ''}`} />
            <span>{isLocating ? t('locating') : t('useCurrentLocation')}</span>
          </button>
        </div>

        {locationStatus && (
          <div className="p-3 rounded-xl bg-white/80 dark:bg-gray-800/80 border border-purple-200 dark:border-purple-900/40 text-xs font-medium text-purple-800 dark:text-purple-300 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-purple-600" />
            <span>{locationStatus}</span>
          </div>
        )}

        {/* Location Selectors & Domain Tabs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
          {/* City Selector */}
          <div>
            <label className="text-[11px] font-bold text-gray-500 dark:text-gray-400 block mb-1">
              {t('selectCity')}
            </label>
            <select
              aria-label={t('selectCity')}
              value={selectedCity}
              onChange={e => {
                setSelectedCity(e.target.value);
                setSelectedDistrict('All');
              }}
              className="w-full h-11 px-3 rounded-2xl bg-white dark:bg-[#151A23] border border-gray-200 dark:border-[#293142] text-xs font-bold text-gray-900 dark:text-white focus:outline-none focus:border-purple-600"
            >
              {SOMALIA_CITIES.filter(c => c.id !== 'all').map(city => (
                <option key={city.id} value={city.id}>
                  {city.name[language] || city.name.en}
                </option>
              ))}
            </select>
          </div>

          {/* District Selector (If Mogadishu) */}
          {selectedCity === 'Mogadishu' && (
            <div>
              <label className="text-[11px] font-bold text-gray-500 dark:text-gray-400 block mb-1">
                {t('selectDistrict')}
              </label>
              <select
                aria-label={t('selectDistrict')}
                value={selectedDistrict}
                onChange={e => setSelectedDistrict(e.target.value)}
                className="w-full h-11 px-3 rounded-2xl bg-white dark:bg-[#151A23] border border-gray-200 dark:border-[#293142] text-xs font-bold text-gray-900 dark:text-white focus:outline-none focus:border-purple-600"
              >
                {MOGADISHU_DISTRICTS.map(d => (
                  <option key={d} value={d}>
                    {d === 'All' ? (language === 'ar' ? 'جميع أحياء مقديشو' : 'All Mogadishu Districts') : d}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Domain Tab Filter */}
          <div className="sm:col-span-1">
            <label className="text-[11px] font-bold text-gray-500 dark:text-gray-400 block mb-1">
              {t('browseByCategory')}
            </label>
            <div className="flex items-center gap-1.5 h-11">
              {[
                { id: 'all', label: t('allResults') },
                { id: 'restaurants', label: t('restaurants') },
                { id: 'stores', label: t('stores') },
                { id: 'services', label: t('services') },
              ].map(d => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setDomainFilter(d.id as any)}
                  className={`flex-1 h-full rounded-2xl text-[11px] font-bold transition ${
                    domainFilter === d.id
                      ? 'bg-purple-600 text-white shadow-xs'
                      : 'bg-white dark:bg-[#151A23] border border-gray-200 dark:border-[#293142] text-gray-700 dark:text-gray-300'
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Directory Results */}
      <div className="space-y-8">
        {/* Restaurants in this area */}
        {(domainFilter === 'all' || domainFilter === 'restaurants') && nearbyData.restaurants.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center gap-2 border-b border-gray-200 dark:border-gray-800 pb-3">
              <UtensilsCrossed className="w-5 h-5 text-orange-500" />
              <h2 className="text-lg font-black text-gray-900 dark:text-white">
                {t('restaurants')} ({nearbyData.restaurants.length})
              </h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {nearbyData.restaurants.map(restaurant => (
                <RestaurantCard
                  key={restaurant.id}
                  restaurant={restaurant}
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          </section>
        )}

        {/* Stores in this area */}
        {(domainFilter === 'all' || domainFilter === 'stores') && nearbyData.stores.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center gap-2 border-b border-gray-200 dark:border-gray-800 pb-3">
              <StoreIcon className="w-5 h-5 text-blue-600" />
              <h2 className="text-lg font-black text-gray-900 dark:text-white">
                {t('stores')} ({nearbyData.stores.length})
              </h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {nearbyData.stores.map(store => (
                <StoreCard
                  key={store.id}
                  store={store}
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          </section>
        )}

        {/* Services in this area */}
        {(domainFilter === 'all' || domainFilter === 'services') && nearbyData.services.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center gap-2 border-b border-gray-200 dark:border-gray-800 pb-3">
              <Wrench className="w-5 h-5 text-emerald-600" />
              <h2 className="text-lg font-black text-gray-900 dark:text-white">
                {t('services')} ({nearbyData.services.length})
              </h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {nearbyData.services.map(srv => (
                <ServiceCard
                  key={srv.id}
                  service={srv}
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          </section>
        )}

        {/* Zero state */}
        {nearbyData.totalResults === 0 && (
          <div className="p-8 sm:p-12 rounded-3xl bg-white dark:bg-[#151A23] border border-gray-200 dark:border-[#293142] text-center space-y-3">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-purple-50 dark:bg-purple-950/40 text-purple-600 flex items-center justify-center">
              <MapPin className="w-7 h-7" />
            </div>
            <h3 className="text-base font-black text-gray-900 dark:text-white">
              {t('noMatchingResults')}
            </h3>
            <p className="text-xs text-gray-500">
              {language === 'ar'
                ? `لا توجد نتائج مسجلة حالياً في ${selectedCity} - ${selectedDistrict}. جرب اختيار حي آخر أو تصفح مقديشو بالكامل.`
                : language === 'so'
                ? `Weli ma jiraan ganacsiyo laga diiwaangeliyay ${selectedCity} - ${selectedDistrict}.`
                : `No vendors currently listed in ${selectedCity} - ${selectedDistrict}.`}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
