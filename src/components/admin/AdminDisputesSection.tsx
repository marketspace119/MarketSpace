import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  Search,
  Filter,
  AlertCircle,
  CheckCircle2,
  Clock,
  RotateCcw,
  User,
  Store as StoreIcon,
  Phone,
  FileText,
  DollarSign,
  XCircle,
  ExternalLink,
  ChevronDown,
} from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import { User as UserType, OrderDispute, DisputeStatus } from '../../types';
import { disputeService } from '../../services/disputeService';

interface AdminDisputesSectionProps {
  currentUser: UserType;
  onRefresh: () => void;
  searchQuery: string;
}

export const AdminDisputesSection: React.FC<AdminDisputesSectionProps> = ({
  currentUser,
  onRefresh,
  searchQuery,
}) => {
  const { language, isRtl } = useLanguage();

  const [disputes, setDisputes] = useState<OrderDispute[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedDispute, setSelectedDispute] = useState<OrderDispute | null>(null);
  const [isResolving, setIsResolving] = useState(false);
  const [resolutionAction, setResolutionAction] = useState<'REFUND_APPROVED' | 'CLAIM_DISMISSED'>('REFUND_APPROVED');
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [refundAmount, setRefundAmount] = useState<number | ''>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const loadDisputes = () => {
    try {
      const list = disputeService.getAllDisputes(currentUser.role);
      setDisputes(list);
    } catch (e: any) {
      console.warn('Failed to load disputes:', e);
    }
  };

  useEffect(() => {
    loadDisputes();
  }, []);

  const filteredDisputes = disputes.filter((d) => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchOrder = d.orderId.toLowerCase().includes(q);
      const matchCustomer = d.customerName.toLowerCase().includes(q);
      const matchSeller = d.sellerName.toLowerCase().includes(q);
      if (!matchOrder && !matchCustomer && !matchSeller) return false;
    }
    if (statusFilter !== 'all' && d.status !== statusFilter) return false;
    return true;
  });

  const openResolutionModal = (disp: OrderDispute) => {
    setSelectedDispute(disp);
    setResolutionAction('REFUND_APPROVED');
    setResolutionNotes('');
    setRefundAmount('');
    setErrorMsg(null);
  };

  const handleResolveSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDispute) return;
    if (!resolutionNotes.trim()) {
      setErrorMsg(language === 'ar' ? 'يرجى كتابة أسباب وقرار المراجعة الإدارية' : 'Please provide resolution notes explaining your decision.');
      return;
    }

    setIsResolving(true);
    setErrorMsg(null);
    try {
      disputeService.resolveDispute({
        disputeId: selectedDispute.id,
        adminId: currentUser.id,
        adminRole: currentUser.role,
        actionTaken: resolutionAction,
        resolutionNotes: resolutionNotes.trim(),
        refundAmount: resolutionAction === 'REFUND_APPROVED' && typeof refundAmount === 'number' ? refundAmount : undefined,
      });

      setSuccessMsg(
        resolutionAction === 'REFUND_APPROVED'
          ? (language === 'ar' ? `تم اعتماد استرداد الأموال للطلب #${selectedDispute.orderId} بنجاح` : `Refund approved successfully for order #${selectedDispute.orderId}`)
          : (language === 'ar' ? `تم رفض النزاع وإغلاق الشكوى للطلب #${selectedDispute.orderId}` : `Dispute claim dismissed for order #${selectedDispute.orderId}`)
      );
      setSelectedDispute(null);
      loadDisputes();
      onRefresh();
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Operation failed');
    } finally {
      setIsResolving(false);
    }
  };

  const getReasonBadge = (reason: string) => {
    const map: Record<string, { ar: string; en: string }> = {
      damaged_item: { ar: 'منتج تالف أو مكسور', en: 'Damaged Item' },
      not_as_described: { ar: 'غير مطابق للمواصفات', en: 'Not as Described' },
      missing_items: { ar: 'عناصر ناقصة من الطلب', en: 'Missing Items' },
      never_arrived: { ar: 'لم يتم استلام الشحنة', en: 'Never Arrived' },
      wrong_item: { ar: 'منتج غير صحيح', en: 'Wrong Item' },
      quality_issue: { ar: 'مشكلة في الجودة', en: 'Quality Issue' },
      other: { ar: 'أسباب أخرى', en: 'Other Issue' },
    };
    const item = map[reason] || { ar: reason, en: reason };
    return language === 'ar' ? item.ar : item.en;
  };

  const getStatusBadge = (status: DisputeStatus) => {
    switch (status) {
      case 'OPEN':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
            <Clock className="w-3 h-3" />
            {language === 'ar' ? 'بانتظار الرد / مراجعة' : 'Open / Pending'}
          </span>
        );
      case 'SELLER_RESPONDED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300">
            <RotateCcw className="w-3 h-3" />
            {language === 'ar' ? 'رد التاجر (جاهز للقرار)' : 'Seller Responded'}
          </span>
        );
      case 'RESOLVED_REFUND':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
            <CheckCircle2 className="w-3 h-3" />
            {language === 'ar' ? 'تم اعتماد الاسترداد' : 'Resolved (Refunded)'}
          </span>
        );
      case 'RESOLVED_REJECTED':
      case 'CLOSED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">
            <XCircle className="w-3 h-3" />
            {language === 'ar' ? 'نزاع مغلق / مرفوض' : 'Dismissed / Closed'}
          </span>
        );
    }
  };

  const openCount = disputes.filter((d) => d.status === 'OPEN' || d.status === 'SELLER_RESPONDED').length;
  const refundCount = disputes.filter((d) => d.status === 'RESOLVED_REFUND').length;
  const dismissedCount = disputes.filter((d) => d.status === 'RESOLVED_REJECTED' || d.status === 'CLOSED').length;

  return (
    <div className="space-y-4" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Toast Alert */}
      {successMsg && (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs rounded-2xl flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
          <span className="font-semibold">{successMsg}</span>
        </div>
      )}

      {/* Header and Filter Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-xs">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-rose-600" />
          <div>
            <h3 className="text-sm font-bold text-gray-900 dark:text-white">
              {language === 'ar' ? 'إدارة النزاعات والشكاوى المالية' : 'Order Disputes & Resolution Center'}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {disputes.length} {language === 'ar' ? 'شكوى مسجلة من العملاء' : 'disputes recorded on platform'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-rose-500"
          >
            <option value="all">{language === 'ar' ? 'الحالة: كل النزاعات' : 'Status: All'}</option>
            <option value="OPEN">{language === 'ar' ? 'قيد المراجعة (OPEN)' : 'Awaiting Review'}</option>
            <option value="SELLER_RESPONDED">{language === 'ar' ? 'رد التاجر (SELLER_RESPONDED)' : 'Seller Responded'}</option>
            <option value="RESOLVED_REFUND">{language === 'ar' ? 'تم اعتماد الاسترداد' : 'Refund Approved'}</option>
            <option value="RESOLVED_REJECTED">{language === 'ar' ? 'مرفوض / مغلق' : 'Dismissed'}</option>
          </select>
        </div>
      </div>

      {/* Quick Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-xs">
          <p className="text-xs font-semibold text-amber-600 uppercase">
            {language === 'ar' ? 'بانتظار القرار الإداري' : 'Pending Action'}
          </p>
          <p className="text-2xl font-black text-gray-900 dark:text-white mt-1">{openCount}</p>
          <p className="text-[11px] text-gray-400">
            {language === 'ar' ? 'نزاعات مفتوحة تتطلب تدخل المشرف' : 'Disputes awaiting final judgment'}
          </p>
        </div>
        <div className="p-4 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-xs">
          <p className="text-xs font-semibold text-emerald-600 uppercase">
            {language === 'ar' ? 'استردادات معتمدة' : 'Refunds Approved'}
          </p>
          <p className="text-2xl font-black text-emerald-600 mt-1">{refundCount}</p>
          <p className="text-[11px] text-gray-400">
            {language === 'ar' ? 'تم تعويض العميل وتسوية الطلب' : 'Customer compensated with refund'}
          </p>
        </div>
        <div className="p-4 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-xs">
          <p className="text-xs font-semibold text-gray-500 uppercase">
            {language === 'ar' ? 'شكاوى مغلقة ومرفوضة' : 'Dismissed / Closed'}
          </p>
          <p className="text-2xl font-black text-gray-700 dark:text-gray-300 mt-1">{dismissedCount}</p>
          <p className="text-[11px] text-gray-400">
            {language === 'ar' ? 'تم تثبيت موقف التاجر وإغلاق الملف' : 'Merchant position sustained'}
          </p>
        </div>
      </div>

      {/* Disputes Table */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-gray-600 dark:text-gray-300">
            <thead className="bg-gray-50 dark:bg-gray-800/60 text-gray-700 dark:text-gray-200 font-semibold border-b border-gray-200 dark:border-gray-800">
              <tr>
                <th className="px-4 py-3">{language === 'ar' ? 'الطلب / النزاع' : 'Order / Dispute'}</th>
                <th className="px-4 py-3">{language === 'ar' ? 'العميل' : 'Customer'}</th>
                <th className="px-4 py-3">{language === 'ar' ? 'التاجر المعني' : 'Merchant'}</th>
                <th className="px-4 py-3">{language === 'ar' ? 'السبب والمطلب' : 'Reason & Request'}</th>
                <th className="px-4 py-3">{language === 'ar' ? 'الحالة' : 'Status'}</th>
                <th className="px-4 py-3 text-right">{language === 'ar' ? 'الإجراء الإداري' : 'Action'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {filteredDisputes.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                    {language === 'ar' ? 'لا توجد نزاعات أو شكاوى تطابق البحث' : 'No disputes found'}
                  </td>
                </tr>
              ) : (
                filteredDisputes.map((disp) => (
                  <tr key={disp.id} className="hover:bg-gray-50/70 dark:hover:bg-gray-800/40 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-bold text-gray-900 dark:text-white font-mono">#{disp.orderId}</p>
                      <p className="text-[10px] text-gray-400 font-mono">{disp.id}</p>
                      <p className="text-[10px] text-gray-400">{new Date(disp.createdAt).toLocaleDateString()}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-gray-800 dark:text-gray-200">{disp.customerName}</p>
                      {disp.customerPhone && (
                        <p className="text-[11px] text-gray-400 font-mono">{disp.customerPhone}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-800 dark:text-gray-200">{disp.sellerName}</p>
                      <p className="text-[10px] text-gray-400 font-mono">{disp.sellerId}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-bold text-rose-600 dark:text-rose-400">{getReasonBadge(disp.reason)}</p>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400 line-clamp-1">{disp.description}</p>
                      <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 capitalize">
                        {disp.requestedAction.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3">{getStatusBadge(disp.status)}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => openResolutionModal(disp)}
                        className="px-3 py-1.5 text-xs font-semibold bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 rounded-xl transition-colors"
                      >
                        {disp.status === 'OPEN' || disp.status === 'SELLER_RESPONDED'
                          ? (language === 'ar' ? 'فصل في النزاع' : 'Resolve Claim')
                          : (language === 'ar' ? 'عرض القرار' : 'View Decision')}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Resolution Lightbox Modal */}
      {selectedDispute && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-200 dark:border-gray-800 max-w-xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-3">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-rose-600" />
                <h4 className="text-base font-bold text-gray-900 dark:text-white">
                  {language === 'ar' ? `فصل النزاع للطلب #${selectedDispute.orderId}` : `Dispute Resolution #${selectedDispute.orderId}`}
                </h4>
              </div>
              <button
                onClick={() => setSelectedDispute(null)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            {errorMsg && (
              <div className="p-3 bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-xs rounded-xl flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Customer Statement */}
            <div className="p-4 bg-gray-50 dark:bg-gray-800/60 rounded-2xl border border-gray-200 dark:border-gray-700 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-gray-700 dark:text-gray-300">
                  {language === 'ar' ? 'دعوى العميل:' : 'Customer Claim:'} {selectedDispute.customerName}
                </span>
                <span className="text-rose-600 font-semibold">{getReasonBadge(selectedDispute.reason)}</span>
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-900 p-3 rounded-xl border border-gray-100 dark:border-gray-800">
                "{selectedDispute.description}"
              </p>
              <div className="text-[11px] text-gray-500">
                {language === 'ar' ? 'المطلب المرغوب:' : 'Requested action:'}{' '}
                <span className="font-bold text-gray-800 dark:text-gray-200 capitalize">
                  {selectedDispute.requestedAction.replace('_', ' ')}
                </span>
              </div>
            </div>

            {/* Seller Response if any */}
            {selectedDispute.sellerResponse ? (
              <div className="p-4 bg-blue-50 dark:bg-blue-950/40 rounded-2xl border border-blue-200 dark:border-blue-900 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-blue-900 dark:text-blue-300">
                    {language === 'ar' ? 'رد التاجر:' : 'Seller Response:'} {selectedDispute.sellerName}
                  </span>
                  <span className="text-[10px] text-blue-600">
                    {new Date(selectedDispute.sellerResponse.respondedAt).toLocaleDateString()}
                  </span>
                </div>
                <p className="text-xs text-blue-800 dark:text-blue-200 bg-white dark:bg-gray-900 p-3 rounded-xl border border-blue-100 dark:border-blue-800">
                  "{selectedDispute.sellerResponse.message}"
                </p>
                {selectedDispute.sellerResponse.proposedAction && (
                  <p className="text-[11px] text-blue-700 dark:text-blue-400">
                    {language === 'ar' ? 'الإجراء المقترح من التاجر:' : 'Seller proposed:'}{' '}
                    <span className="font-bold">{selectedDispute.sellerResponse.proposedAction}</span>
                  </p>
                )}
              </div>
            ) : (
              <div className="p-3 bg-amber-50 dark:bg-amber-950/40 rounded-xl border border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-300 text-xs">
                {language === 'ar' ? 'لم يقدم التاجر رداً حتى الآن. للمشرف كامل الصلاحية لاتخاذ قرار ملزم.' : 'No merchant response submitted yet. Admin judgment is binding.'}
              </div>
            )}

            {/* Admin Decision Form */}
            {selectedDispute.status === 'OPEN' || selectedDispute.status === 'SELLER_RESPONDED' ? (
              <form onSubmit={handleResolveSubmit} className="space-y-4 pt-2">
                <div>
                  <label className="block text-xs font-bold text-gray-800 dark:text-gray-200 mb-2">
                    {language === 'ar' ? 'القرار الإداري الصادر:' : 'Platform Administrative Decision:'}
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setResolutionAction('REFUND_APPROVED')}
                      className={`p-3 rounded-2xl border text-xs font-bold text-center transition-all ${
                        resolutionAction === 'REFUND_APPROVED'
                          ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-200 ring-2 ring-emerald-500'
                          : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                      }`}
                    >
                      {language === 'ar' ? '✓ اعتماد استرداد الأموال للعميل' : '✓ Approve Refund to Customer'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setResolutionAction('CLAIM_DISMISSED')}
                      className={`p-3 rounded-2xl border text-xs font-bold text-center transition-all ${
                        resolutionAction === 'CLAIM_DISMISSED'
                          ? 'border-rose-600 bg-rose-50 dark:bg-rose-950/60 text-rose-800 dark:text-rose-200 ring-2 ring-rose-500'
                          : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                      }`}
                    >
                      {language === 'ar' ? '✕ رفض الدعوى وتثبيت الطلب' : '✕ Dismiss Dispute Claim'}
                    </button>
                  </div>
                </div>

                {resolutionAction === 'REFUND_APPROVED' && (
                  <div>
                    <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                      {language === 'ar' ? 'قيمة الاسترداد المعتمدة ($ USD) - اختياري للمبلغ الكامل:' : 'Approved Refund Amount ($ USD) - optional for full amount:'}
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={refundAmount}
                      onChange={(e) => setRefundAmount(e.target.value === '' ? '' : parseFloat(e.target.value))}
                      placeholder="Leave empty for total order refund"
                      className="w-full px-3 py-2 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                    {language === 'ar' ? 'مسببات وقرار المشرف (تصل للعميل والتاجر):' : 'Official Resolution Notes (sent to both parties):'}
                  </label>
                  <textarea
                    rows={3}
                    value={resolutionNotes}
                    onChange={(e) => setResolutionNotes(e.target.value)}
                    placeholder={
                      language === 'ar'
                        ? 'اكتب شرحاً وافياً لقرار المنصة بعد فحص الأدلة وتتبع الشحنة...'
                        : 'Provide complete reasons and binding policy justification...'
                    }
                    className="w-full px-3 py-2 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-rose-500"
                    required
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setSelectedDispute(null)}
                    className="px-4 py-2 text-xs font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl"
                  >
                    {language === 'ar' ? 'إلغاء' : 'Cancel'}
                  </button>
                  <button
                    type="submit"
                    disabled={isResolving}
                    className="px-5 py-2 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-xl disabled:opacity-50"
                  >
                    {isResolving ? (language === 'ar' ? 'جاري الاعتماد...' : 'Saving...') : (language === 'ar' ? 'تأكيد وحفظ القرار الملزم' : 'Confirm Decision')}
                  </button>
                </div>
              </form>
            ) : (
              <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 space-y-2">
                <p className="text-xs font-bold text-gray-900 dark:text-white">
                  {language === 'ar' ? 'تم الفصل في هذا النزاع مسبقاً' : 'This dispute has been resolved previously'}
                </p>
                {selectedDispute.adminResolution && (
                  <div className="text-xs space-y-1 text-gray-600 dark:text-gray-300">
                    <p>
                      <strong>{language === 'ar' ? 'القرار:' : 'Decision:'}</strong> {selectedDispute.adminResolution.actionTaken}
                    </p>
                    <p>
                      <strong>{language === 'ar' ? 'التفاصيل:' : 'Notes:'}</strong> {selectedDispute.adminResolution.resolutionNotes}
                    </p>
                    <p className="text-[10px] text-gray-400">
                      {new Date(selectedDispute.adminResolution.resolvedAt).toLocaleString()}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
