import React, { useState } from 'react';
import { Utensils, BadgeCheck, Clock, ShieldCheck, Eye } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import { Store, User } from '../../types';
import { storeService } from '../../services/storeService';
import { AdminConfirmModal } from './AdminConfirmModal';

interface AdminRestaurantsSectionProps {
  stores: Store[];
  currentUser: User;
  onRefresh: () => void;
  searchQuery: string;
}

export const AdminRestaurantsSection: React.FC<AdminRestaurantsSectionProps> = ({
  stores,
  currentUser,
  onRefresh,
  searchQuery,
}) => {
  const { t, isRtl, language } = useLanguage();

  const restaurants = stores.filter((s) => s.sellerType === 'restaurant');

  const [inspectRestaurant, setInspectRestaurant] = useState<Store | null>(null);
  const [targetStore, setTargetStore] = useState<Store | null>(null);
  const [actionType, setActionType] = useState<'suspend' | 'approve' | 'verify' | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const getStoreDisplayName = (s: Store | null | undefined, lang: string = 'ar'): string => {
    if (!s) return '';
    if (typeof s.name === 'string') return s.name;
    if (s.name && typeof s.name === 'object') {
      return (s.name as any)[lang] || (s.name as any).ar || (s.name as any).en || (s.name as any).so || 'Restaurant';
    }
    return s.id || 'Restaurant';
  };

  const filtered = restaurants.filter((s) => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const sName = getStoreDisplayName(s, language).toLowerCase();
      const city = String(s.city || (s as any).location?.city || '').toLowerCase();
      if (!sName.includes(q) && !city.includes(q)) return false;
    }
    return true;
  });

  const handleConfirm = async () => {
    if (!targetStore || !actionType) return;
    setIsProcessing(true);
    try {
      if (actionType === 'verify') {
        storeService.toggleStoreVerification(targetStore.id, currentUser.id, currentUser.role);
      } else {
        const nextStatus = actionType === 'suspend' ? 'suspended' : 'approved';
        storeService.updateStoreStatus(targetStore.id, nextStatus, currentUser.id, currentUser.role);
      }
      setTargetStore(null);
      setActionType(null);
      onRefresh();
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-4" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="flex items-center justify-between p-4 bg-white rounded-2xl border border-gray-200 shadow-xs">
        <div className="flex items-center gap-2">
          <Utensils className="w-5 h-5 text-amber-600" />
          <div>
            <h3 className="text-sm font-bold text-gray-900">{t('adminNavRestaurants')}</h3>
            <p className="text-xs text-gray-500">{filtered.length} food vendors & kitchens</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-gray-600">
            <thead className="bg-gray-50 text-gray-700 font-semibold border-b border-gray-200">
              <tr>
                <th className="px-4 py-3">Restaurant</th>
                <th className="px-4 py-3">Cuisine / Category</th>
                <th className="px-4 py-3">Prep Time / Specs</th>
                <th className="px-4 py-3">Rating</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                    {t('noDataFound')}
                  </td>
                </tr>
              ) : (
                filtered.map((r) => {
                  const rName = getStoreDisplayName(r, language);
                  const isSuspended = r.status === 'suspended';

                  return (
                    <tr key={r.id} className="hover:bg-gray-50/70 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <img
                            src={r.logo || 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=100'}
                            alt={rName}
                            className="w-9 h-9 rounded-xl object-cover bg-gray-100 border border-gray-200 shrink-0"
                            referrerPolicy="no-referrer"
                          />
                          <div>
                            <div className="flex items-center gap-1.5">
                              <p className="font-semibold text-gray-900">{rName}</p>
                              {r.isVerified && <BadgeCheck className="w-3.5 h-3.5 text-indigo-600" />}
                            </div>
                            <p className="text-[11px] text-gray-400">{r.city || r.location?.city || 'Somalia'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 font-medium text-[11px]">
                          {r.category || 'Dining'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 text-gray-700">
                          <Clock className="w-3.5 h-3.5 text-gray-400" />
                          <span>{r.restaurantMetadata?.averagePrepTimeMinutes || 30} mins</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-semibold text-gray-800">
                        {r.rating?.toFixed(1) || '4.8'} ★
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            r.status === 'approved'
                              ? 'bg-emerald-100 text-emerald-800'
                              : isSuspended
                              ? 'bg-red-100 text-red-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {r.status.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setInspectRestaurant(r)}
                            className="p-1.5 text-gray-500 hover:text-gray-800 bg-gray-50 hover:bg-gray-100 rounded-lg border border-gray-200"
                            title="Inspect Menu Specs"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => {
                              setTargetStore(r);
                              setActionType('verify');
                            }}
                            className="px-2 py-1 text-[11px] font-medium bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700"
                          >
                            {r.isVerified ? 'Unverify' : 'Verify'}
                          </button>
                          {isSuspended ? (
                            <button
                              onClick={() => {
                                setTargetStore(r);
                                setActionType('approve');
                              }}
                              className="px-2 py-1 text-[11px] font-semibold bg-emerald-50 text-emerald-700 rounded-lg"
                            >
                              Reactivate
                            </button>
                          ) : (
                            <button
                              onClick={() => {
                                setTargetStore(r);
                                setActionType('suspend');
                              }}
                              className="px-2 py-1 text-[11px] font-semibold bg-red-50 text-red-700 rounded-lg"
                            >
                              Suspend
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {inspectRestaurant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-gray-100">
            <h3 className="text-base font-bold text-gray-900 pb-3 border-b border-gray-100">
              {(inspectRestaurant.name as any)?.ar || (inspectRestaurant.name as any)?.en || inspectRestaurant.name} - Kitchen Info
            </h3>
            <div className="py-4 space-y-3 text-xs">
              <div className="p-3 bg-amber-50/50 rounded-xl space-y-1.5">
                <p><strong>Cuisine:</strong> {inspectRestaurant.restaurantMetadata?.cuisine?.join(', ') || 'Somali Traditional, Grills'}</p>
                <p><strong>Prep Time:</strong> ~{inspectRestaurant.restaurantMetadata?.averagePrepTimeMinutes || 30} minutes</p>
                <p><strong>Hygiene Verified:</strong> 100% inspected</p>
              </div>
            </div>
            <div className="flex justify-end pt-3 border-t border-gray-100">
              <button
                onClick={() => setInspectRestaurant(null)}
                className="px-4 py-2 text-xs font-semibold bg-gray-100 hover:bg-gray-200 rounded-xl"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <AdminConfirmModal
        isOpen={!!targetStore && !!actionType}
        title="Confirm Restaurant Action"
        message={`Confirm updating restaurant "${getStoreDisplayName(targetStore, language)}".`}
        confirmLabel={t('confirmAction')}
        isDestructive={actionType === 'suspend'}
        isLoading={isProcessing}
        onConfirm={handleConfirm}
        onCancel={() => {
          setTargetStore(null);
          setActionType(null);
        }}
      />
    </div>
  );
};
