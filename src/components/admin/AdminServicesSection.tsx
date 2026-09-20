import React, { useState } from 'react';
import { Wrench, BadgeCheck, MapPin, Eye } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import { Store, User } from '../../types';
import { storeService } from '../../services/storeService';
import { AdminConfirmModal } from './AdminConfirmModal';

interface AdminServicesSectionProps {
  stores: Store[];
  currentUser: User;
  onRefresh: () => void;
  searchQuery: string;
}

export const AdminServicesSection: React.FC<AdminServicesSectionProps> = ({
  stores,
  currentUser,
  onRefresh,
  searchQuery,
}) => {
  const { t, isRtl, language } = useLanguage();

  const serviceProviders = stores.filter((s) => s.sellerType === 'service');

  const [targetStore, setTargetStore] = useState<Store | null>(null);
  const [actionType, setActionType] = useState<'suspend' | 'approve' | 'verify' | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const getStoreDisplayName = (s: Store | null | undefined, lang: string = 'ar'): string => {
    if (!s) return '';
    if (typeof s.name === 'string') return s.name;
    if (s.name && typeof s.name === 'object') {
      return (s.name as any)[lang] || (s.name as any).ar || (s.name as any).en || (s.name as any).so || 'Service Provider';
    }
    return s.id || 'Service Provider';
  };

  const filtered = serviceProviders.filter((s) => {
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
          <Wrench className="w-5 h-5 text-emerald-600" />
          <div>
            <h3 className="text-sm font-bold text-gray-900">{t('adminNavServices')}</h3>
            <p className="text-xs text-gray-500">{filtered.length} verified technical & professional services</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-gray-600">
            <thead className="bg-gray-50 text-gray-700 font-semibold border-b border-gray-200">
              <tr>
                <th className="px-4 py-3">Service Provider</th>
                <th className="px-4 py-3">Specialty / Field</th>
                <th className="px-4 py-3">Location</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Verification</th>
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
                filtered.map((s) => {
                  const sName = getStoreDisplayName(s, language);
                  const isSuspended = s.status === 'suspended';

                  return (
                    <tr key={s.id} className="hover:bg-gray-50/70 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <img
                            src={s.logo || 'https://images.unsplash.com/photo-1581092921461-eab62e97a780?w=100'}
                            alt={sName}
                            className="w-9 h-9 rounded-xl object-cover bg-gray-100 border border-gray-200 shrink-0"
                            referrerPolicy="no-referrer"
                          />
                          <div>
                            <div className="flex items-center gap-1.5">
                              <p className="font-semibold text-gray-900">{sName}</p>
                              {s.isVerified && <BadgeCheck className="w-3.5 h-3.5 text-indigo-600" />}
                            </div>
                            <p className="text-[11px] text-gray-400">ID: {s.id}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 font-medium text-[11px]">
                          {s.category || 'Professional'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        <div className="flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-gray-400" />
                          <span>{s.city || (typeof s.location === 'object' ? s.location?.city : s.location) || 'Somalia'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            s.status === 'approved'
                              ? 'bg-emerald-100 text-emerald-800'
                              : isSuspended
                              ? 'bg-red-100 text-red-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {s.status.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => {
                            setTargetStore(s);
                            setActionType('verify');
                          }}
                          className={`px-2 py-1 rounded-lg text-[11px] font-medium border transition-colors ${
                            s.isVerified
                              ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                              : 'bg-gray-50 border-gray-200 text-gray-500'
                          }`}
                        >
                          {s.isVerified ? 'Verified' : 'Unverified'}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {isSuspended ? (
                          <button
                            onClick={() => {
                              setTargetStore(s);
                              setActionType('approve');
                            }}
                            className="px-2.5 py-1 text-[11px] font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg"
                          >
                            Reactivate
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              setTargetStore(s);
                              setActionType('suspend');
                            }}
                            className="px-2.5 py-1 text-[11px] font-semibold bg-red-50 hover:bg-red-100 text-red-700 rounded-lg"
                          >
                            Suspend
                          </button>
                        )}
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
        title="Confirm Service Provider Action"
        message={`Confirm updating service provider "${getStoreDisplayName(targetStore, language)}".`}
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
