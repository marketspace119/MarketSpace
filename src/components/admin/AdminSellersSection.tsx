import React, { useState } from 'react';
import { Store as StoreIcon, CheckCircle2, XCircle, AlertTriangle, ShieldCheck, BadgeCheck, Eye, MapPin, Phone } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import { Store, SellerStatus, User } from '../../types';
import { storeService } from '../../services/storeService';
import { AdminConfirmModal } from './AdminConfirmModal';

interface AdminSellersSectionProps {
  stores: Store[];
  currentUser: User;
  onRefresh: () => void;
  searchQuery: string;
}

export const AdminSellersSection: React.FC<AdminSellersSectionProps> = ({
  stores,
  currentUser,
  onRefresh,
  searchQuery,
}) => {
  const { t, isRtl, language } = useLanguage();

  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [inspectStore, setInspectStore] = useState<Store | null>(null);

  // Confirmation Modal state
  const [targetStore, setTargetStore] = useState<Store | null>(null);
  const [pendingAction, setPendingAction] = useState<SellerStatus | 'toggle_verify' | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const getStoreDisplayName = (s: Store | null | undefined, lang: string = 'ar'): string => {
    if (!s) return '';
    if (typeof s.name === 'string') return s.name;
    if (s.name && typeof s.name === 'object') {
      return (s.name as any)[lang] || (s.name as any).ar || (s.name as any).en || (s.name as any).so || 'Seller';
    }
    return s.id || 'Seller';
  };

  const filteredStores = stores.filter((s) => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const sName = getStoreDisplayName(s, language).toLowerCase();
      const city = String(s.city || (s as any).location?.city || '').toLowerCase();
      const phone = String(s.contactPhone || (s as any).phone || '').toLowerCase();
      if (!sName.includes(q) && !city.includes(q) && !phone.includes(q)) return false;
    }

    if (statusFilter !== 'all' && s.status !== statusFilter) return false;
    if (typeFilter !== 'all' && s.sellerType !== typeFilter) return false;

    return true;
  });

  const handleAction = async (store: Store, action: SellerStatus | 'toggle_verify') => {
    setActionError(null);
    setTargetStore(store);
    setPendingAction(action);
  };

  const handleConfirmAction = async () => {
    if (!targetStore || !pendingAction) return;
    setIsProcessing(true);
    setActionError(null);

    try {
      if (pendingAction === 'toggle_verify') {
        storeService.toggleStoreVerification(targetStore.id, currentUser.id, currentUser.role);
      } else {
        storeService.updateStoreStatus(targetStore.id, pendingAction, currentUser.id, currentUser.role);
      }
      setTargetStore(null);
      setPendingAction(null);
      onRefresh();
    } catch (err: any) {
      setActionError(err.message || 'Operation failed');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-4" dir={isRtl ? 'rtl' : 'ltr'}>
      {actionError && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Filter toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-white rounded-2xl border border-gray-200 shadow-xs">
        <div className="flex items-center gap-2">
          <StoreIcon className="w-5 h-5 text-indigo-600" />
          <div>
            <h3 className="text-sm font-bold text-gray-900">{t('adminNavSellers')}</h3>
            <p className="text-xs text-gray-500">
              {filteredStores.length} stores & applications registered
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">Type: All Types</option>
            <option value="store">Retail Store</option>
            <option value="restaurant">Restaurant</option>
            <option value="service">Service Provider</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">{t('statusAll')}</option>
            <option value="pending">Pending Approval</option>
            <option value="approved">Approved / Active</option>
            <option value="suspended">Suspended</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
      </div>

      {/* Sellers List Table */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-gray-600">
            <thead className="bg-gray-50 text-gray-700 font-semibold border-b border-gray-200">
              <tr>
                <th className="px-4 py-3">Store & Seller</th>
                <th className="px-4 py-3">Category / Type</th>
                <th className="px-4 py-3">Location & Phone</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Verification</th>
                <th className="px-4 py-3 text-right">Admin Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredStores.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                    {t('noDataFound')}
                  </td>
                </tr>
              ) : (
                filteredStores.map((store) => {
                  const storeName = getStoreDisplayName(store, language);
                  const isPending = store.status === 'pending';
                  const isApproved = store.status === 'approved';
                  const isSuspended = store.status === 'suspended';

                  return (
                    <tr key={store.id} className="hover:bg-gray-50/70 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <img
                            src={store.logo || 'https://images.unsplash.com/photo-1472851294608-062f824d29cc?w=100'}
                            alt={storeName}
                            className="w-9 h-9 rounded-xl object-cover bg-gray-100 border border-gray-200 shrink-0"
                            referrerPolicy="no-referrer"
                          />
                          <div>
                            <div className="flex items-center gap-1.5">
                              <p className="font-semibold text-gray-900">{storeName}</p>
                              {store.isVerified && (
                                <BadgeCheck className="w-4 h-4 text-indigo-600 fill-indigo-100" />
                              )}
                            </div>
                            <p className="text-[11px] text-gray-500 font-mono">ID: {store.id}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-gray-100 text-gray-700 font-medium text-[11px] capitalize">
                          {store.sellerType} • {store.category}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 text-gray-700">
                          <MapPin className="w-3.5 h-3.5 text-gray-400" />
                          <span>{store.city || store.location?.city || 'Somalia'}</span>
                        </div>
                        {store.contactPhone && (
                          <div className="flex items-center gap-1 text-[11px] text-gray-500 font-mono mt-0.5">
                            <Phone className="w-3 h-3 text-gray-400" />
                            <span>{store.contactPhone}</span>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            isApproved
                              ? 'bg-emerald-100 text-emerald-800'
                              : isPending
                              ? 'bg-amber-100 text-amber-800 animate-pulse'
                              : isSuspended
                              ? 'bg-red-100 text-red-800'
                              : 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {store.status.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleAction(store, 'toggle_verify')}
                          className={`px-2 py-1 rounded-lg text-[11px] font-medium border transition-colors flex items-center gap-1 ${
                            store.isVerified
                              ? 'bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100'
                              : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100'
                          }`}
                        >
                          <ShieldCheck className="w-3.5 h-3.5" />
                          <span>{store.isVerified ? 'Verified' : 'Unverified'}</span>
                        </button>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setInspectStore(store)}
                            className="p-1.5 text-gray-500 hover:text-gray-800 bg-gray-50 hover:bg-gray-100 rounded-lg border border-gray-200"
                            title="Inspect Details"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          {isPending && (
                            <>
                              <button
                                onClick={() => handleAction(store, 'approved')}
                                className="px-2.5 py-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors"
                              >
                                {t('approve')}
                              </button>
                              <button
                                onClick={() => handleAction(store, 'rejected')}
                                className="px-2.5 py-1 text-[11px] font-semibold text-red-700 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
                              >
                                {t('reject')}
                              </button>
                            </>
                          )}

                          {isApproved && (
                            <button
                              onClick={() => handleAction(store, 'suspended')}
                              className="px-2.5 py-1 text-[11px] font-semibold text-red-700 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
                            >
                              {t('suspend')}
                            </button>
                          )}

                          {isSuspended && (
                            <button
                              onClick={() => handleAction(store, 'approved')}
                              className="px-2.5 py-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors"
                            >
                              {t('reactivate')}
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

      {/* Inspect Store Drawer / Modal */}
      {inspectStore && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-gray-100">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <h3 className="text-base font-bold text-gray-900">
                {(inspectStore.name as any)?.ar || (inspectStore.name as any)?.en || inspectStore.name}
              </h3>
              <button
                onClick={() => setInspectStore(null)}
                className="text-gray-400 hover:text-gray-600 p-1"
              >
                ✕
              </button>
            </div>
            <div className="py-4 space-y-3 text-xs text-gray-700">
              <div className="grid grid-cols-2 gap-2 p-3 bg-gray-50 rounded-xl">
                <div>
                  <span className="text-gray-400 block">Seller ID:</span>
                  <span className="font-mono">{inspectStore.sellerId}</span>
                </div>
                <div>
                  <span className="text-gray-400 block">Commission:</span>
                  <span className="font-bold text-indigo-600">{inspectStore.commissionRate || 8}%</span>
                </div>
                <div>
                  <span className="text-gray-400 block">Category:</span>
                  <span>{inspectStore.category}</span>
                </div>
                <div>
                  <span className="text-gray-400 block">Status:</span>
                  <span className="font-bold">{inspectStore.status.toUpperCase()}</span>
                </div>
              </div>
              <div>
                <span className="text-gray-400 block mb-1">Description:</span>
                <p className="p-3 bg-gray-50 rounded-xl text-gray-800 leading-relaxed">
                  {inspectStore.description?.ar || inspectStore.description?.en || 'No description provided.'}
                </p>
              </div>
            </div>
            <div className="flex justify-end pt-3 border-t border-gray-100">
              <button
                onClick={() => setInspectStore(null)}
                className="px-4 py-2 text-xs font-semibold bg-gray-100 hover:bg-gray-200 rounded-xl"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      <AdminConfirmModal
        isOpen={!!targetStore && !!pendingAction}
        title={
          pendingAction === 'toggle_verify'
            ? targetStore?.isVerified ? 'Revoke Verified Badge' : 'Grant Verified Badge'
            : pendingAction === 'approved'
            ? 'Approve Seller Application'
            : pendingAction === 'suspended'
            ? 'Suspend Seller & Store'
            : 'Reject Application'
        }
        message={
          pendingAction === 'suspended'
            ? `Are you sure you want to suspend "${getStoreDisplayName(targetStore, language)}"? Their store and listed items will be temporarily hidden from the public marketplace.`
            : `Confirm action for "${getStoreDisplayName(targetStore, language)}". This event will be recorded in the security audit trail.`
        }
        confirmLabel={t('confirmAction')}
        isDestructive={pendingAction === 'suspended' || pendingAction === 'rejected'}
        isLoading={isProcessing}
        onConfirm={handleConfirmAction}
        onCancel={() => {
          setTargetStore(null);
          setPendingAction(null);
        }}
      />
    </div>
  );
};
