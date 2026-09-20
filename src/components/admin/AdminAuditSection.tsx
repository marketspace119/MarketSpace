import React, { useState, useEffect } from 'react';
import { ShieldCheck, Search, Filter, Clock, User, FileText, CheckCircle2, Lock } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import { AuditLog } from '../../types';
import { auditLogService } from '../../services/auditLogService';

interface AdminAuditSectionProps {
  searchQuery: string;
}

export const AdminAuditSection: React.FC<AdminAuditSectionProps> = ({ searchQuery }) => {
  const { t, isRtl } = useLanguage();

  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [targetTypeFilter, setTargetTypeFilter] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(true);

  const fetchLogs = async () => {
    setIsLoading(true);
    const data = await auditLogService.getRecentLogs(100);
    setLogs(data);
    setIsLoading(false);
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const filteredLogs = logs.filter((log) => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchActor = String(log.actorId || '').toLowerCase().includes(q);
      const matchAction = String(log.action || '').toLowerCase().includes(q);
      const matchTarget = String(log.targetName || '').toLowerCase().includes(q) || String(log.targetId || '').toLowerCase().includes(q);
      if (!matchActor && !matchAction && !matchTarget) return false;
    }

    if (targetTypeFilter !== 'all' && log.targetType !== targetTypeFilter) return false;

    return true;
  });

  return (
    <div className="space-y-4" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Immutability & Security Banner */}
      <div className="p-4 bg-gray-900 text-white rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-500 text-white rounded-xl shrink-0">
            <Lock className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-bold flex items-center gap-2">
              <span>{t('auditLogTitle')}</span>
              <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-300 font-mono">
                IMMUTABLE_LOG
              </span>
            </h4>
            <p className="text-xs text-gray-300">
              {t('auditLogSubtitle')}
            </p>
          </div>
        </div>
        <button
          onClick={fetchLogs}
          className="px-3 py-1.5 text-xs font-semibold bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-xl border border-gray-700 self-start sm:self-auto"
        >
          Refresh Logs
        </button>
      </div>

      {/* Filter toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-white rounded-2xl border border-gray-200 shadow-xs">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-indigo-600" />
          <div>
            <h3 className="text-sm font-bold text-gray-900">Recorded Security Events</h3>
            <p className="text-xs text-gray-500">{filteredLogs.length} audit entries retrieved</p>
          </div>
        </div>

        <select
          value={targetTypeFilter}
          onChange={(e) => setTargetTypeFilter(e.target.value)}
          className="px-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
        >
          <option value="all">Target: All Entities</option>
          <option value="user">Users</option>
          <option value="store">Stores & Sellers</option>
          <option value="product">Products</option>
          <option value="order">Orders</option>
          <option value="payment">Payments</option>
          <option value="payout">Payouts</option>
          <option value="review">Reviews</option>
          <option value="delivery">Deliveries</option>
          <option value="platform_settings">Settings</option>
        </select>
      </div>

      {/* Audit Log Table */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-gray-600">
            <thead className="bg-gray-50 text-gray-700 font-semibold border-b border-gray-200">
              <tr>
                <th className="px-4 py-3">Timestamp</th>
                <th className="px-4 py-3">Actor / Role</th>
                <th className="px-4 py-3">Action Executed</th>
                <th className="px-4 py-3">Target Entity</th>
                <th className="px-4 py-3">Details / Metadata</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 font-mono">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                    Loading security audit trail...
                  </td>
                </tr>
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                    {t('noDataFound')}
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50/70 transition-colors">
                    <td className="px-4 py-3 text-gray-500 font-sans text-[11px] whitespace-nowrap">
                      {log.timestamp ? new Date(log.timestamp).toLocaleString() : 'N/A'}
                    </td>
                    <td className="px-4 py-3 font-sans">
                      <p className="font-semibold text-gray-900 text-xs truncate max-w-xs">{log.actorId}</p>
                      <span className="inline-block px-1.5 py-0.2 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700">
                        {log.actorRole}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded-md font-bold text-[11px] bg-gray-100 text-gray-800">
                        {log.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-sans">
                      <p className="font-bold text-gray-900 text-xs">{log.targetName || log.targetId}</p>
                      <span className="text-[10px] text-gray-400 uppercase font-mono">{log.targetType}</span>
                    </td>
                    <td className="px-4 py-3 text-[11px] text-gray-500 font-mono max-w-xs truncate">
                      {log.metadata ? JSON.stringify(log.metadata) : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
