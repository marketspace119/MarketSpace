import React, { useState } from 'react';
import { Store as StoreIcon, BadgeCheck, ShieldAlert, Edit, MapPin, Eye } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import { Store, User } from '../../types';
import { storeService } from '../../services/storeService';
import { AdminConfirmModal } from './AdminConfirmModal';

interface AdminStoresSectionProps {
  stores: Store[];
  currentUser: User;
  onRefresh: () => void;
  searchQuery: string;
}

export const AdminStoresSection: React.FC<AdminStoresSectionProps> = ({
  stores,
  currentUser,
  onRefresh,
  searchQuery,
}) => {
  const { t, isRtl, language } = useLanguage();

  // Filter for retail stores only
  const retailStores = stores.filter((s) => s.sellerType === 'store' || !s.sellerType);

  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [targetStore, setTargetStore] = useState<Store | null>(null);
  const [actionType, setActionType] = useState<'suspend' | 'approve' | 'verify' | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const getStoreDisplayName = (s: Store | null | undefined, lang: string = 'ar'): string => {
    if (!s) return '';
    if (typeof s.name === 'string') return s.name;
    if (s.name && typeof s.name === 'object') {
      return (s.name as any)[lang] || (s.name as any).ar || (s.name as any).en || (s.name as any).so || 'Store';
    }
    return s.id || 'Store';
  };

  const filtered = retailStores.filter((s) => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const sName = getStoreDisplayName(s, language).toLowerCase();
      const city = String(s.city || (s as any).location?.city || '').toLowerCase();
      const matchName = sName.includes(q);
      const matchCity = city.includes(q);
      if (!matchName && !matchCity) return false;
    }
    if (statusFilter !== 'all' && s.status !== statusFilter) return false;
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
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-white rounded-2xl border border-gray-200 shadow-xs">
        <div className="flex items-center gap-2">
          <StoreIcon className="w-5 h-5 text-indigo-600" />
          <div>
            <h3 className="text-sm font-bold text-gray-900">{t('adminNavStores')}</h3>
            <p className="text-xs text-gray-500">{filtered.length} commercial stores</p>
          </div>
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
        >
          <option value="all">{t('statusAll')}</option>
          <option value="approved">Approved & Active</option>
          <option value="pending">Pending</option>
          <option value="suspended">Suspended</option>
        </select>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-gray-600">
            <thead className="bg-gray-50 text-gray-700 font-semibold border-b border-gray-200">
              <tr>
                <th className="px-4 py-3">Store Name</th>
                <th className="px-4 py-3">City / Branch</th>
                <th className="px-4 py-3">Commission Rate</th>
                <th className="px-4 py-3">Followers / Rating</th>
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
                filtered.map((store) => {
                  const sName = getStoreDisplayName(store, language);
                  const isSuspended = store.status === 'suspended';

                  return (
                    <tr key={store.id} className="hover:bg-gray-50/70 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <img
                            src={store.logo || 'https://images.unsplash.com/photo-1472851294608-062f824d29cc?w=100'}
                            alt={sName}
                            className="w-8 h-8 rounded-lg object-cover bg-gray-100 shrink-0"
                            referrerPolicy="no-referrer"
                          />
                          <div>
                            <div className="flex items-center gap-1.5">
                              <p className="font-semibold text-gray-900">{sName}</p>
                              {store.isVerified && <BadgeCheck className="w-3.5 h-3.5 text-indigo-600" />}
                            </div>
                            <p className="text-[11px] text-gray-400">Owner: {store.sellerId}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        <div className="flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-gray-400" />
                          <span>{store.city || (typeof store.location === 'object' ? store.location?.city : store.location) || 'Somalia'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-semibold text-indigo-600">
                        {store.commissionRate || 8}%
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-medium text-gray-800">{store.followersCount || 0} followers</span> • {store.rating?.toFixed(1) || '5.0'} ★
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            store.status === 'approved'
                              ? 'bg-emerald-100 text-emerald-800'
                              : isSuspended
                              ? 'bg-red-100 text-red-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {store.status.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => {
                              setTargetStore(store);
                              setActionType('verify');
                            }}
                            className="px-2 py-1 text-[11px] font-medium bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700"
                          >
                            {store.isVerified ? 'Unverify' : 'Verify'}
                          </button>
                          {isSuspended ? (
                            <button
                              onClick={() => {
                                setTargetStore(store);
                                setActionType('approve');
                              }}
                              className="px-2 py-1 text-[11px] font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg"
                            >
                              Reactivate
                            </button>
                          ) : (
                            <button
                              onClick={() => {
                                setTargetStore(store);
                                setActionType('suspend');
                              }}
                              className="px-2 py-1 text-[11px] font-semibold bg-red-50 hover:bg-red-100 text-red-700 rounded-lg"
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

      <AdminConfirmModal
        isOpen={!!targetStore && !!actionType}
        title="Confirm Store Action"
        message={`Confirm updating "${getStoreDisplayName(targetStore, language)}". Action: ${actionType?.toUpperCase()}.`}
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
