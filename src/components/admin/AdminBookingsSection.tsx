import React, { useState } from 'react';
import { CalendarCheck, Clock, User, DollarSign, CheckCircle2, XCircle } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import { Booking, User as UserType } from '../../types';

interface AdminBookingsSectionProps {
  bookings: Booking[];
  currentUser: UserType;
  onRefresh: () => void;
  searchQuery: string;
}

export const AdminBookingsSection: React.FC<AdminBookingsSectionProps> = ({
  bookings,
  currentUser,
  onRefresh,
  searchQuery,
}) => {
  const { t, isRtl } = useLanguage();
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const filtered = bookings.filter((b) => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchCustomer = b.customerName?.toLowerCase().includes(q);
      const matchService = b.serviceName?.toLowerCase().includes(q);
      if (!matchCustomer && !matchService) return false;
    }
    if (statusFilter !== 'all' && b.status !== statusFilter) return false;
    return true;
  });

  return (
    <div className="space-y-4" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-white rounded-2xl border border-gray-200 shadow-xs">
        <div className="flex items-center gap-2">
          <CalendarCheck className="w-5 h-5 text-indigo-600" />
          <div>
            <h3 className="text-sm font-bold text-gray-900">{t('adminNavBookings')}</h3>
            <p className="text-xs text-gray-500">{filtered.length} service appointments booked</p>
          </div>
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
        >
          <option value="all">Status: All</option>
          <option value="requested">Requested</option>
          <option value="confirmed">Confirmed</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-gray-600">
            <thead className="bg-gray-50 text-gray-700 font-semibold border-b border-gray-200">
              <tr>
                <th className="px-4 py-3">Booking ID & Date</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Service & Provider</th>
                <th className="px-4 py-3">Appointment Schedule</th>
                <th className="px-4 py-3">Fee</th>
                <th className="px-4 py-3">Status</th>
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
                filtered.map((b) => (
                  <tr key={b.id} className="hover:bg-gray-50/70 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-gray-900 font-mono">#{b.id.slice(-8)}</p>
                      <p className="text-[11px] text-gray-400">{new Date(b.createdAt).toLocaleDateString()}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-800">{b.customerName || 'Client'}</p>
                      <p className="text-[11px] text-gray-400">{b.customerPhone}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-bold text-gray-900">{b.serviceName}</p>
                      <p className="text-[11px] text-gray-400">Provider: {b.sellerId}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 text-gray-700">
                        <Clock className="w-3.5 h-3.5 text-gray-400" />
                        <span>{b.scheduledDate} • {b.scheduledTime}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-bold text-gray-900">
                      ${Number(b.price || 0).toFixed(2)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          b.status === 'completed'
                            ? 'bg-emerald-100 text-emerald-800'
                            : b.status === 'confirmed'
                            ? 'bg-blue-100 text-blue-800'
                            : b.status === 'cancelled'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {b.status.toUpperCase()}
                      </span>
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
