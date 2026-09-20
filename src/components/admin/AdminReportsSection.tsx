import React, { useState } from 'react';
import { Flag, CheckCircle, XCircle, AlertTriangle, ShieldCheck, Eye } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import { User } from '../../types';
import { AdminConfirmModal } from './AdminConfirmModal';
import { auditLogService } from '../../services/auditLogService';

export interface PlatformReport {
  id: string;
  reporterId: string;
  reporterName?: string;
  targetType: 'product' | 'store' | 'review' | 'user';
  targetId: string;
  targetTitle?: string;
  reason: string;
  details: string;
  status: 'pending' | 'reviewed' | 'resolved' | 'dismissed';
  createdAt: string;
}

const INITIAL_REPORTS: PlatformReport[] = [
  {
    id: 'rep-01',
    reporterId: 'usr-customer-89',
    reporterName: 'Jama Hassan',
    targetType: 'product',
    targetId: 'prod-iphone-13',
    targetTitle: 'Used iPhone 13 Pro (128GB)',
    reason: 'Misleading description / condition',
    details: 'Seller listed as mint condition but battery health is below 70%.',
    status: 'pending',
    createdAt: new Date(Date.now() - 3600000 * 5).toISOString(),
  },
  {
    id: 'rep-02',
    reporterId: 'usr-customer-12',
    reporterName: 'Fadumo Ali',
    targetType: 'review',
    targetId: 'rev-4421',
    targetTitle: 'Review on Fresh Burgers Mogadishu',
    reason: 'Inappropriate language',
    details: 'Contains abusive harassment against restaurant staff.',
    status: 'pending',
    createdAt: new Date(Date.now() - 3600000 * 18).toISOString(),
  },
];

interface AdminReportsSectionProps {
  currentUser: User;
  searchQuery: string;
}

export const AdminReportsSection: React.FC<AdminReportsSectionProps> = ({ currentUser, searchQuery }) => {
  const { t, isRtl } = useLanguage();

  const [reports, setReports] = useState<PlatformReport[]>(() => {
    try {
      const cached = localStorage.getItem('marketspace_reports');
      return cached ? JSON.parse(cached) : INITIAL_REPORTS;
    } catch {
      return INITIAL_REPORTS;
    }
  });

  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedReport, setSelectedReport] = useState<PlatformReport | null>(null);
  const [actionType, setActionType] = useState<'resolved' | 'dismissed' | null>(null);

  const saveReports = (list: PlatformReport[]) => {
    setReports(list);
    localStorage.setItem('marketspace_reports', JSON.stringify(list));
  };

  const handleAction = async () => {
    if (!selectedReport || !actionType) return;

    const updated = reports.map((r) =>
      r.id === selectedReport.id ? { ...r, status: actionType } : r
    );
    saveReports(updated);

    await auditLogService.logAction({
      actorId: currentUser.id,
      actorRole: currentUser.role,
      action: actionType === 'resolved' ? 'REPORT_RESOLVED' : 'REPORT_DISMISSED',
      targetType: selectedReport.targetType,
      targetId: selectedReport.targetId,
      targetName: selectedReport.targetTitle || selectedReport.id,
      metadata: { reason: selectedReport.reason },
    });

    setSelectedReport(null);
    setActionType(null);
  };

  const filtered = reports.filter((r) => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchReason = r.reason.toLowerCase().includes(q);
      const matchDetails = r.details.toLowerCase().includes(q);
      const matchTarget = r.targetTitle?.toLowerCase().includes(q);
      if (!matchReason && !matchDetails && !matchTarget) return false;
    }
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    return true;
  });

  return (
    <div className="space-y-4" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-white rounded-2xl border border-gray-200 shadow-xs">
        <div className="flex items-center gap-2">
          <Flag className="w-5 h-5 text-indigo-600" />
          <div>
            <h3 className="text-sm font-bold text-gray-900">{t('adminNavReports')}</h3>
            <p className="text-xs text-gray-500">{filtered.length} customer complaints & flags</p>
          </div>
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
        >
          <option value="all">Status: All</option>
          <option value="pending">Pending Review</option>
          <option value="resolved">Action Taken / Resolved</option>
          <option value="dismissed">Dismissed</option>
        </select>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-gray-600">
            <thead className="bg-gray-50 text-gray-700 font-semibold border-b border-gray-200">
              <tr>
                <th className="px-4 py-3">Reported Entity</th>
                <th className="px-4 py-3">Reported By</th>
                <th className="px-4 py-3">Reason</th>
                <th className="px-4 py-3">Details / Memo</th>
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
                filtered.map((rep) => (
                  <tr key={rep.id} className="hover:bg-gray-50/70 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-bold text-gray-900">{rep.targetTitle || rep.targetId}</p>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-gray-100 text-gray-700 uppercase">
                        {rep.targetType}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-800">{rep.reporterName || 'User'}</p>
                      <p className="text-[11px] text-gray-400 font-mono">{rep.reporterId}</p>
                    </td>
                    <td className="px-4 py-3 font-semibold text-gray-900">
                      {rep.reason}
                    </td>
                    <td className="px-4 py-3 text-gray-600 max-w-xs">
                      <p className="line-clamp-2">{rep.details}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          rep.status === 'resolved'
                            ? 'bg-emerald-100 text-emerald-800'
                            : rep.status === 'pending'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {rep.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {rep.status === 'pending' ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => {
                              setSelectedReport(rep);
                              setActionType('resolved');
                            }}
                            className="px-2.5 py-1 text-[11px] font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg"
                          >
                            Resolve
                          </button>
                          <button
                            onClick={() => {
                              setSelectedReport(rep);
                              setActionType('dismissed');
                            }}
                            className="px-2.5 py-1 text-[11px] font-semibold bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg"
                          >
                            Dismiss
                          </button>
                        </div>
                      ) : (
                        <span className="text-[11px] text-gray-400">Processed</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AdminConfirmModal
        isOpen={!!selectedReport && !!actionType}
        title={actionType === 'resolved' ? 'Resolve Report' : 'Dismiss Report'}
        message={`Confirm updating report against "${selectedReport?.targetTitle}".`}
        confirmLabel={t('confirmAction')}
        isDestructive={false}
        isLoading={false}
        onConfirm={handleAction}
        onCancel={() => {
          setSelectedReport(null);
          setActionType(null);
        }}
      />
    </div>
  );
};
