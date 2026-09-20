import React, { useState } from 'react';
import { Banknote, CheckCircle, XCircle, AlertCircle, Clock, ShieldCheck, DollarSign } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import { PayoutRequest, PayoutStatus, User } from '../../types';
import { payoutService } from '../../services/payoutService';
import { AdminConfirmModal } from './AdminConfirmModal';

interface AdminPayoutsSectionProps {
  payouts: PayoutRequest[];
  currentUser: User;
  onRefresh: () => void;
  searchQuery: string;
}

export const AdminPayoutsSection: React.FC<AdminPayoutsSectionProps> = ({
  payouts,
  currentUser,
  onRefresh,
  searchQuery,
}) => {
  const { t, isRtl } = useLanguage();

  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [targetPayout, setTargetPayout] = useState<PayoutRequest | null>(null);
  const [actionDecision, setActionDecision] = useState<PayoutStatus | null>(null);
  const [transactionRef, setTransactionRef] = useState<string>('');
  const [adminNotes, setAdminNotes] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);

  const filtered = payouts.filter((p) => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchSeller = String(p.sellerId || '').toLowerCase().includes(q);
      const matchAcc = String(p.accountNumber || '').toLowerCase().includes(q);
      const matchName = String(p.accountName || p.sellerName || '').toLowerCase().includes(q);
      if (!matchSeller && !matchAcc && !matchName) return false;
    }

    if (statusFilter !== 'all' && p.status !== statusFilter) return false;
    return true;
  });

  const handleAction = (payout: PayoutRequest, decision: PayoutStatus) => {
    setTargetPayout(payout);
    setActionDecision(decision);
    setTransactionRef('');
    setAdminNotes('');
  };

  const handleConfirmAction = async () => {
    if (!targetPayout || !actionDecision) return;
    setIsProcessing(true);

    try {
      await payoutService.reviewPayout({
        payoutId: targetPayout.id,
        newStatus: actionDecision,
        actorId: currentUser.id,
        actorRole: currentUser.role,
        notes: transactionRef ? `${adminNotes} [Ref: ${transactionRef}]`.trim() : adminNotes,
      });
      setTargetPayout(null);
      setActionDecision(null);
      onRefresh();
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-4" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Notice on Manual Settlement */}
      <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-indigo-900 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-600 text-white rounded-xl shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-bold">Seller Payouts Policy (MANUAL_SETTLEMENT)</h4>
            <p className="text-xs text-indigo-700">
              Disbursements are initiated manually via merchant mobile money or direct bank wire. No automated third-party gateway is active.
            </p>
          </div>
        </div>
        <span className="px-2.5 py-1 text-xs font-bold bg-indigo-100 text-indigo-900 rounded-full shrink-0">
          MANUAL_SETTLEMENT
        </span>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-white rounded-2xl border border-gray-200 shadow-xs">
        <div className="flex items-center gap-2">
          <Banknote className="w-5 h-5 text-indigo-600" />
          <div>
            <h3 className="text-sm font-bold text-gray-900">{t('adminNavPayouts')}</h3>
            <p className="text-xs text-gray-500">{filtered.length} withdrawal requests</p>
          </div>
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
        >
          <option value="all">{t('statusAll')}</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="processing">Processing</option>
          <option value="paid">Paid</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      {/* Payouts Table */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-gray-600">
            <thead className="bg-gray-50 text-gray-700 font-semibold border-b border-gray-200">
              <tr>
                <th className="px-4 py-3">Payout ID & Date</th>
                <th className="px-4 py-3">Seller / Store</th>
                <th className="px-4 py-3">Method & Destination</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Settlement Type</th>
                <th className="px-4 py-3 text-right">Moderation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                    {t('noDataFound')}
                  </td>
                </tr>
              ) : (
                filtered.map((p) => {
                  const isPending = p.status === 'pending';
                  const isPaid = p.status === 'paid';
                  const isApproved = p.status === 'approved';

                  const rawMethod = p.paymentMethod || p.method || 'manual';
                  const methodDisplay = typeof rawMethod === 'string' ? rawMethod.replace('_', ' ') : 'manual';
                  const dateStr = p.requestedAt || p.createdAt;
                  const formattedDate = dateStr ? new Date(dateStr).toLocaleDateString() : new Date().toLocaleDateString();
                  const payoutIdStr = String(p.id || '');

                  return (
                    <tr key={p.id} className="hover:bg-gray-50/70 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-bold text-gray-900 font-mono">#{payoutIdStr ? payoutIdStr.slice(-8) : '--------'}</p>
                        <p className="text-[11px] text-gray-400">{formattedDate}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-800">{p.sellerName || p.sellerId}</p>
                        <p className="text-[11px] text-gray-400 font-mono">{p.accountName || 'Beneficiary'}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-bold text-gray-800 capitalize block">{methodDisplay}</span>
                        <span className="text-[11px] text-gray-500 font-mono">{p.accountNumber}</span>
                      </td>
                      <td className="px-4 py-3 font-bold text-gray-900 text-sm">
                        ${Number(p.amount).toFixed(2)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            isPaid
                              ? 'bg-emerald-100 text-emerald-800'
                              : isPending
                              ? 'bg-amber-100 text-amber-800 animate-pulse'
                              : isApproved
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {p.status.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded-md bg-gray-100 text-gray-700 font-mono text-[10px]">
                          {p.settlementType || 'MANUAL_SETTLEMENT'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {isPending && (
                            <>
                              <button
                                onClick={() => handleAction(p, 'approved')}
                                className="px-2.5 py-1 text-[11px] font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg"
                              >
                                Approve
                              </button>
                              <button
                                onClick={() => handleAction(p, 'paid')}
                                className="px-2.5 py-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg"
                              >
                                Mark Paid
                              </button>
                              <button
                                onClick={() => handleAction(p, 'rejected')}
                                className="px-2.5 py-1 text-[11px] font-semibold text-red-700 bg-red-50 hover:bg-red-100 rounded-lg"
                              >
                                Reject
                              </button>
                            </>
                          )}
                          {isApproved && (
                            <button
                              onClick={() => handleAction(p, 'paid')}
                              className="px-2.5 py-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg"
                            >
                              Mark Paid
                            </button>
                          )}
                          {isPaid && (
                            <span className="text-[11px] text-gray-400">
                              Settled {p.referenceCode || p.reference ? `(${p.referenceCode || p.reference})` : ''}
                            </span>
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

      {/* Payout Action Dialog */}
      {targetPayout && actionDecision && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-100">
            <h3 className="text-base font-bold text-gray-900 mb-2">
              Update Payout Request: {actionDecision.toUpperCase()}
            </h3>
            <p className="text-xs text-gray-600 mb-4">
              Disbursing <strong>${Number(targetPayout.amount || 0).toFixed(2)}</strong> to {targetPayout.accountNumber} ({(targetPayout.paymentMethod || targetPayout.method || 'manual').replace('_', ' ')}).
            </p>

            {actionDecision === 'paid' && (
              <div className="mb-3">
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Bank / Mobile Money Transaction Reference #
                </label>
                <input
                  type="text"
                  value={transactionRef}
                  onChange={(e) => setTransactionRef(e.target.value)}
                  placeholder="e.g., TXN-994812"
                  className="w-full p-2.5 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            )}

            <div className="mb-4">
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Admin Notes
              </label>
              <textarea
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                placeholder="Optional notes..."
                rows={2}
                className="w-full p-2.5 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={() => {
                  setTargetPayout(null);
                  setActionDecision(null);
                }}
                className="px-4 py-2 text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isProcessing}
                onClick={handleConfirmAction}
                className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl flex items-center gap-2"
              >
                {isProcessing && <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
                <span>Confirm Settlement</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
