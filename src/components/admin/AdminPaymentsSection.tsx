import React, { useState } from 'react';
import { CreditCard, CheckCircle2, XCircle, AlertCircle, Phone, DollarSign, ShieldAlert, FileText } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import { User } from '../../types';
import { MobilePaymentSubmission, paymentService } from '../../services/paymentService';
import { AdminConfirmModal } from './AdminConfirmModal';

interface AdminPaymentsSectionProps {
  submissions: MobilePaymentSubmission[];
  currentUser: User;
  onRefresh: () => void;
  searchQuery: string;
}

export const AdminPaymentsSection: React.FC<AdminPaymentsSectionProps> = ({
  submissions,
  currentUser,
  onRefresh,
  searchQuery,
}) => {
  const { t, isRtl } = useLanguage();

  const [methodFilter, setMethodFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Review modal state
  const [reviewSub, setReviewSub] = useState<MobilePaymentSubmission | null>(null);
  const [decision, setDecision] = useState<'CONFIRMED' | 'REJECTED' | null>(null);
  const [adminNotes, setAdminNotes] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);

  const filtered = submissions.filter((s) => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchRef = String(s.referenceNumber || (s as any).referenceCode || '').toLowerCase().includes(q);
      const matchOrder = String(s.orderId || s.id || '').toLowerCase().includes(q);
      const matchPhone = String(s.senderPhone || '').toLowerCase().includes(q);
      if (!matchRef && !matchOrder && !matchPhone) return false;
    }

    if (methodFilter !== 'all' && s.method !== methodFilter) return false;
    if (statusFilter !== 'all' && s.status !== statusFilter) return false;

    return true;
  });

  const handleReviewClick = (sub: MobilePaymentSubmission, dec: 'CONFIRMED' | 'REJECTED') => {
    setReviewSub(sub);
    setDecision(dec);
    setAdminNotes('');
  };

  const handleConfirmReview = async () => {
    if (!reviewSub || !decision) return;
    setIsProcessing(true);

    try {
      await paymentService.reviewPaymentSubmission(
        reviewSub.id,
        decision,
        currentUser.id,
        currentUser.role,
        adminNotes
      );
      setReviewSub(null);
      setDecision(null);
      setAdminNotes('');
      onRefresh();
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-4" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Strict Operational Notice: Manual Settlement & Cards Disabled */}
      <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-amber-900 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-amber-600 text-white rounded-xl shrink-0">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-bold">Manual Mobile Money Settlement (EVC Plus, Zaad, Sahal)</h4>
            <p className="text-xs text-amber-800">
              Transactions require manual verification on merchant terminal before confirming. {t('cardDisabledNotice')}
            </p>
          </div>
        </div>
        <span className="px-2.5 py-1 text-xs font-bold bg-amber-100 text-amber-900 rounded-full shrink-0">
          MANUAL_MOBILE_TRANSFER
        </span>
      </div>

      {/* Filters toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-white rounded-2xl border border-gray-200 shadow-xs">
        <div className="flex items-center gap-2">
          <CreditCard className="w-5 h-5 text-indigo-600" />
          <div>
            <h3 className="text-sm font-bold text-gray-900">{t('adminNavPayments')}</h3>
            <p className="text-xs text-gray-500">
              {filtered.length} of {submissions.length} mobile money payment submissions
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={methodFilter}
            onChange={(e) => setMethodFilter(e.target.value)}
            className="px-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">Method: All</option>
            <option value="evc_plus">EVC Plus (Hormuud)</option>
            <option value="zaad">Zaad (Telesom)</option>
            <option value="sahall">Sahal (Golis)</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">{t('statusAll')}</option>
            <option value="PAYMENT_REFERENCE_SUBMITTED">Pending Verification</option>
            <option value="CONFIRMED">Confirmed</option>
            <option value="REJECTED">Rejected</option>
          </select>
        </div>
      </div>

      {/* Submissions Table */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-gray-600">
            <thead className="bg-gray-50 text-gray-700 font-semibold border-b border-gray-200">
              <tr>
                <th className="px-4 py-3">Reference & Date</th>
                <th className="px-4 py-3">Order ID</th>
                <th className="px-4 py-3">Provider / Method</th>
                <th className="px-4 py-3">Sender Phone</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Verification Status</th>
                <th className="px-4 py-3 text-right">Action</th>
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
                filtered.map((s) => {
                  const isPending = s.status === 'PAYMENT_REFERENCE_SUBMITTED';
                  const isConfirmed = s.status === 'CONFIRMED';
                  const isRejected = s.status === 'REJECTED';

                  return (
                    <tr key={s.id} className="hover:bg-gray-50/70 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-bold text-gray-900 font-mono tracking-wide">{s.referenceNumber || 'N/A'}</p>
                        <p className="text-[11px] text-gray-400">{s.createdAt ? new Date(s.createdAt).toLocaleString() : 'N/A'}</p>
                      </td>
                      <td className="px-4 py-3 font-mono font-semibold text-gray-800">
                        #{String(s.orderId || s.id || '').slice(-8)}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 font-bold text-[11px] uppercase">
                          {String(s.method || 'mobile').replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 font-mono text-gray-700">
                          <Phone className="w-3.5 h-3.5 text-gray-400" />
                          <span>{s.senderPhone}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-bold text-gray-900 text-sm">
                        ${Number(s.amount).toFixed(2)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            isConfirmed
                              ? 'bg-emerald-100 text-emerald-800'
                              : isPending
                              ? 'bg-amber-100 text-amber-800 animate-pulse'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {isPending ? 'PENDING VERIFICATION' : s.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {isPending ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => handleReviewClick(s, 'CONFIRMED')}
                              className="px-2.5 py-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors inline-flex items-center gap-1"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Confirm</span>
                            </button>
                            <button
                              onClick={() => handleReviewClick(s, 'REJECTED')}
                              className="px-2.5 py-1 text-[11px] font-semibold text-red-700 bg-red-50 hover:bg-red-100 rounded-lg transition-colors inline-flex items-center gap-1"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              <span>Reject</span>
                            </button>
                          </div>
                        ) : (
                          <span className="text-[11px] text-gray-400">
                            {s.reviewedBy ? `Reviewed by ${s.reviewedBy.slice(-6)}` : 'Completed'}
                          </span>
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

      {/* Review Confirmation with Notes Input */}
      {reviewSub && decision && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-100">
            <h3 className="text-base font-bold text-gray-900 mb-2">
              {decision === 'CONFIRMED' ? 'Confirm Payment Received' : 'Reject Payment Submission'}
            </h3>
            <p className="text-xs text-gray-600 mb-4">
              {decision === 'CONFIRMED'
                ? `Confirm that $${Number(reviewSub.amount || 0).toFixed(2)} with reference "${reviewSub.referenceNumber || 'N/A'}" was received in the merchant account. This will mark Order #${String(reviewSub.orderId || reviewSub.id || '').slice(-8)} as PAID.`
                : `Reject payment reference "${reviewSub.referenceNumber || 'N/A'}". The customer will be informed that the transfer was not validated.`}
            </p>

            <div className="mb-4">
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Internal Review Notes / Audit Memo
              </label>
              <textarea
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                placeholder="e.g., Verified in Hormuud SMS terminal at 14:22"
                rows={2}
                className="w-full p-2.5 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={() => {
                  setReviewSub(null);
                  setDecision(null);
                }}
                className="px-4 py-2 text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isProcessing}
                onClick={handleConfirmReview}
                className={`px-5 py-2 text-xs font-bold text-white rounded-xl flex items-center gap-2 ${
                  decision === 'CONFIRMED'
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                {isProcessing && <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
                <span>{decision === 'CONFIRMED' ? 'Confirm & Mark Paid' : 'Reject Submission'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
