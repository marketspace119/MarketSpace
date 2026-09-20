import React, { useState } from 'react';
import { Star, Eye, EyeOff, Trash2, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import { Review, User } from '../../types';
import { reviewService } from '../../services/reviewService';
import { AdminConfirmModal } from './AdminConfirmModal';

interface AdminReviewsSectionProps {
  reviews: Review[];
  currentUser: User;
  onRefresh: () => void;
  searchQuery: string;
}

export const AdminReviewsSection: React.FC<AdminReviewsSectionProps> = ({
  reviews,
  currentUser,
  onRefresh,
  searchQuery,
}) => {
  const { t, isRtl } = useLanguage();

  const [filterType, setFilterType] = useState<string>('all');
  const [filterVisibility, setFilterVisibility] = useState<string>('all');

  const [targetReview, setTargetReview] = useState<Review | null>(null);
  const [actionType, setActionType] = useState<'hide' | 'restore' | 'delete' | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const filtered = reviews.filter((r) => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchComment = r.comment.toLowerCase().includes(q);
      const matchAuthor = r.userName?.toLowerCase().includes(q);
      if (!matchComment && !matchAuthor) return false;
    }

    if (filterType !== 'all' && r.targetType !== filterType) return false;
    if (filterVisibility === 'hidden' && !r.isHidden) return false;
    if (filterVisibility === 'visible' && r.isHidden) return false;

    return true;
  });

  const handleConfirm = async () => {
    if (!targetReview || !actionType) return;
    setIsProcessing(true);

    try {
      if (actionType === 'hide') {
        reviewService.toggleHideReview(targetReview.id, true, currentUser.id, currentUser.role);
      } else if (actionType === 'restore') {
        reviewService.toggleHideReview(targetReview.id, false, currentUser.id, currentUser.role);
      } else if (actionType === 'delete') {
        reviewService.deleteReview(targetReview.id, currentUser.id, currentUser.role);
      }

      setTargetReview(null);
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
          <Star className="w-5 h-5 text-amber-500 fill-amber-500" />
          <div>
            <h3 className="text-sm font-bold text-gray-900">{t('adminNavReviews')}</h3>
            <p className="text-xs text-gray-500">{filtered.length} customer reviews & ratings</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="px-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">Target: All</option>
            <option value="product">Products</option>
            <option value="store">Stores</option>
            <option value="restaurant">Restaurants</option>
            <option value="service">Services</option>
          </select>

          <select
            value={filterVisibility}
            onChange={(e) => setFilterVisibility(e.target.value)}
            className="px-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">Visibility: All</option>
            <option value="visible">Published Only</option>
            <option value="hidden">Hidden Only</option>
          </select>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-gray-600">
            <thead className="bg-gray-50 text-gray-700 font-semibold border-b border-gray-200">
              <tr>
                <th className="px-4 py-3">Rating & Target</th>
                <th className="px-4 py-3">Customer & Date</th>
                <th className="px-4 py-3">Review Comment</th>
                <th className="px-4 py-3">Verified Purchase</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Moderation</th>
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
                  const isHidden = r.isHidden || r.status === 'hidden';

                  return (
                    <tr key={r.id} className="hover:bg-gray-50/70 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 text-amber-500 font-bold mb-0.5">
                          <span>{r.rating}</span>
                          <Star className="w-3.5 h-3.5 fill-amber-500" />
                        </div>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-gray-100 text-gray-700 capitalize">
                          {r.targetType} #{r.targetId.slice(-6)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-gray-900">{r.userName || 'Anonymous'}</p>
                        <p className="text-[11px] text-gray-400">{new Date(r.createdAt).toLocaleDateString()}</p>
                      </td>
                      <td className="px-4 py-3 max-w-sm">
                        <p className="text-gray-800 line-clamp-2 leading-relaxed">"{r.comment}"</p>
                        {r.sellerReply && (
                          <div className="mt-1.5 p-2 bg-indigo-50/60 rounded-lg text-[11px] text-indigo-900">
                            <strong>Vendor Reply:</strong> {r.sellerReply.comment}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {r.verifiedPurchase ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Verified</span>
                          </span>
                        ) : (
                          <span className="text-[11px] text-gray-400">Unverified</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            isHidden
                              ? 'bg-red-100 text-red-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {isHidden ? 'HIDDEN' : 'PUBLISHED'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {isHidden ? (
                            <button
                              onClick={() => {
                                setTargetReview(r);
                                setActionType('restore');
                              }}
                              className="px-2 py-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg"
                            >
                              <Eye className="w-3.5 h-3.5 inline mr-1" />
                              Restore
                            </button>
                          ) : (
                            <button
                              onClick={() => {
                                setTargetReview(r);
                                setActionType('hide');
                              }}
                              className="px-2 py-1 text-[11px] font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-lg"
                            >
                              <EyeOff className="w-3.5 h-3.5 inline mr-1" />
                              Hide
                            </button>
                          )}
                          <button
                            onClick={() => {
                              setTargetReview(r);
                              setActionType('delete');
                            }}
                            className="p-1 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
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
        isOpen={!!targetReview && !!actionType}
        title={actionType === 'delete' ? 'Delete Review' : actionType === 'hide' ? 'Hide Review' : 'Restore Review'}
        message={`Are you sure you want to ${actionType} review by "${targetReview?.userName}"? This action is audited.`}
        confirmLabel={t('confirmAction')}
        isDestructive={actionType === 'delete' || actionType === 'hide'}
        isLoading={isProcessing}
        onConfirm={handleConfirm}
        onCancel={() => {
          setTargetReview(null);
          setActionType(null);
        }}
      />
    </div>
  );
};
