import React from 'react';
import {
  DollarSign,
  ShoppingBag,
  Store,
  Users,
  AlertCircle,
  Clock,
  ArrowUpRight,
  ShieldCheck,
  CreditCard,
  Truck
} from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import { Order, Store as StoreType, User, PayoutRequest, Product } from '../../types';
import { MobilePaymentSubmission } from '../../services/paymentService';
import { AdminTab } from './AdminSidebar';

interface AdminOverviewSectionProps {
  orders?: Order[];
  stores?: StoreType[];
  products?: Product[];
  users?: User[];
  payouts?: PayoutRequest[];
  paymentSubmissions?: MobilePaymentSubmission[];
  submissions?: MobilePaymentSubmission[];
  onNavigateTab: (tab: AdminTab) => void;
  onSelectOrder?: (order: Order) => void;
}

export const AdminOverviewSection: React.FC<AdminOverviewSectionProps> = ({
  orders = [],
  stores = [],
  products = [],
  users = [],
  payouts = [],
  paymentSubmissions,
  submissions,
  onNavigateTab,
  onSelectOrder,
}) => {
  const { t, isRtl } = useLanguage();

  const safeOrders = Array.isArray(orders) ? orders : [];
  const safeStores = Array.isArray(stores) ? stores : [];
  const safeUsers = Array.isArray(users) ? users : [];
  const safePayouts = Array.isArray(payouts) ? payouts : [];
  const rawSubmissions = paymentSubmissions || submissions;
  const safePaymentSubmissions = Array.isArray(rawSubmissions) ? rawSubmissions : [];

  // Compute real metrics
  const nonCancelledOrders = safeOrders.filter((o) => o.status !== 'cancelled');
  const gmv = nonCancelledOrders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
  const estimatedCommission = gmv * 0.08; // 8% default baseline

  const pendingPayoutsList = safePayouts.filter((p) => p.status === 'pending');
  const pendingPayoutAmount = pendingPayoutsList.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

  const pendingPaymentsList = safePaymentSubmissions.filter(
    (p) => p.status === 'PAYMENT_REFERENCE_SUBMITTED'
  );

  const pendingStoresList = safeStores.filter((s) => s.status === 'pending');
  const activeStores = safeStores.filter((s) => s.status === 'approved');
  const activeSellers = safeUsers.filter((u) => u.role === 'SELLER' && u.status !== 'suspended');
  const totalCustomers = safeUsers.filter((u) => u.role === 'CUSTOMER');

  const recentOrders = [...safeOrders]
    .sort((a, b) => {
      const timeA = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
      const timeB = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
      return timeB - timeA;
    })
    .slice(0, 6);

  return (
    <div className="space-y-6" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Notice Banner: Governance & Real Operations */}
      <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-indigo-900 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-600 text-white rounded-xl shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-bold">{t('adminControlCenter')}</h4>
            <p className="text-xs text-indigo-700 font-medium">
              {t('manualSettlementNotice')} • {t('cardDisabledNotice')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-800">
            Phase 4 Active
          </span>
        </div>
      </div>

      {/* Moderation Alerts Bar if any pending items exist */}
      {(pendingStoresList.length > 0 || pendingPaymentsList.length > 0 || pendingPayoutsList.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {pendingPaymentsList.length > 0 && (
            <div
              onClick={() => onNavigateTab('payments')}
              className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl cursor-pointer hover:bg-amber-100/70 transition-colors flex items-center justify-between"
            >
              <div className="flex items-center gap-2.5">
                <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
                <div>
                  <p className="text-xs font-bold text-amber-900">
                    {pendingPaymentsList.length} {t('metricPendingPayments')}
                  </p>
                  <p className="text-[11px] text-amber-700">EVC Plus / Zaad / Sahal</p>
                </div>
              </div>
              <ArrowUpRight className="w-4 h-4 text-amber-600" />
            </div>
          )}

          {pendingPayoutsList.length > 0 && (
            <div
              onClick={() => onNavigateTab('payouts')}
              className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl cursor-pointer hover:bg-rose-100/70 transition-colors flex items-center justify-between"
            >
              <div className="flex items-center gap-2.5">
                <Clock className="w-5 h-5 text-rose-600 shrink-0" />
                <div>
                  <p className="text-xs font-bold text-rose-900">
                    {pendingPayoutsList.length} {t('metricPendingPayouts')} (${pendingPayoutAmount.toFixed(2)})
                  </p>
                  <p className="text-[11px] text-rose-700">Manual settlement verification</p>
                </div>
              </div>
              <ArrowUpRight className="w-4 h-4 text-rose-600" />
            </div>
          )}

          {pendingStoresList.length > 0 && (
            <div
              onClick={() => onNavigateTab('sellers')}
              className="p-3.5 bg-blue-50 border border-blue-200 rounded-xl cursor-pointer hover:bg-blue-100/70 transition-colors flex items-center justify-between"
            >
              <div className="flex items-center gap-2.5">
                <Store className="w-5 h-5 text-blue-600 shrink-0" />
                <div>
                  <p className="text-xs font-bold text-blue-900">
                    {pendingStoresList.length} {t('adminNavSellers')}
                  </p>
                  <p className="text-[11px] text-blue-700">Awaiting document & KYB review</p>
                </div>
              </div>
              <ArrowUpRight className="w-4 h-4 text-blue-600" />
            </div>
          )}
        </div>
      )}

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* GMV */}
        <div className="p-5 bg-white rounded-2xl border border-gray-200 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              {t('metricGmv')}
            </span>
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-gray-900 tracking-tight">
            ${gmv.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-[11px] text-gray-400 mt-1">Based on real order records</p>
        </div>

        {/* Platform Revenue */}
        <div className="p-5 bg-white rounded-2xl border border-gray-200 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              {t('metricCommission')}
            </span>
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
              <CreditCard className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-gray-900 tracking-tight">
            ${estimatedCommission.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-[11px] text-gray-400 mt-1">Platform fee (8% standard)</p>
        </div>

        {/* Total Orders */}
        <div className="p-5 bg-white rounded-2xl border border-gray-200 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              {t('metricTotalOrders')}
            </span>
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
              <ShoppingBag className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-gray-900 tracking-tight">
            {safeOrders.length}
          </p>
          <p className="text-[11px] text-gray-400 mt-1">
            {nonCancelledOrders.length} fulfilled or active
          </p>
        </div>

        {/* Active Sellers & Stores */}
        <div className="p-5 bg-white rounded-2xl border border-gray-200 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              {t('metricActiveStores')}
            </span>
            <div className="p-2 bg-purple-50 text-purple-600 rounded-xl">
              <Store className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-gray-900 tracking-tight">
            {activeStores.length}
          </p>
          <p className="text-[11px] text-gray-400 mt-1">
            {activeSellers.length} verified sellers • {totalCustomers.length} customers
          </p>
        </div>
      </div>

      {/* Quick Launchpad Buttons */}
      <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs">
        <h3 className="text-sm font-bold text-gray-900 mb-3">Quick Navigation</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2.5">
          <button
            onClick={() => onNavigateTab('orders')}
            className="p-3 text-left bg-gray-50 hover:bg-gray-100 rounded-xl border border-gray-100 transition-colors"
          >
            <ShoppingBag className="w-4 h-4 text-indigo-600 mb-1.5" />
            <p className="text-xs font-bold text-gray-800">{t('adminNavOrders')}</p>
            <p className="text-[10px] text-gray-500">{safeOrders.length} orders</p>
          </button>

          <button
            onClick={() => onNavigateTab('delivery')}
            className="p-3 text-left bg-gray-50 hover:bg-gray-100 rounded-xl border border-gray-100 transition-colors"
          >
            <Truck className="w-4 h-4 text-indigo-600 mb-1.5" />
            <p className="text-xs font-bold text-gray-800">{t('adminNavDelivery')}</p>
            <p className="text-[10px] text-gray-500">Dispatch & drivers</p>
          </button>

          <button
            onClick={() => onNavigateTab('payments')}
            className="p-3 text-left bg-gray-50 hover:bg-gray-100 rounded-xl border border-gray-100 transition-colors"
          >
            <CreditCard className="w-4 h-4 text-indigo-600 mb-1.5" />
            <p className="text-xs font-bold text-gray-800">{t('adminNavPayments')}</p>
            <p className="text-[10px] text-gray-500">{safePaymentSubmissions.length} submissions</p>
          </button>

          <button
            onClick={() => onNavigateTab('payouts')}
            className="p-3 text-left bg-gray-50 hover:bg-gray-100 rounded-xl border border-gray-100 transition-colors"
          >
            <DollarSign className="w-4 h-4 text-indigo-600 mb-1.5" />
            <p className="text-xs font-bold text-gray-800">{t('adminNavPayouts')}</p>
            <p className="text-[10px] text-gray-500">{safePayouts.length} requests</p>
          </button>

          <button
            onClick={() => onNavigateTab('users')}
            className="p-3 text-left bg-gray-50 hover:bg-gray-100 rounded-xl border border-gray-100 transition-colors"
          >
            <Users className="w-4 h-4 text-indigo-600 mb-1.5" />
            <p className="text-xs font-bold text-gray-800">{t('adminNavUsers')}</p>
            <p className="text-[10px] text-gray-500">{safeUsers.length} accounts</p>
          </button>

          <button
            onClick={() => onNavigateTab('audit-log')}
            className="p-3 text-left bg-gray-50 hover:bg-gray-100 rounded-xl border border-gray-100 transition-colors"
          >
            <ShieldCheck className="w-4 h-4 text-indigo-600 mb-1.5" />
            <p className="text-xs font-bold text-gray-800">{t('adminNavAuditLog')}</p>
            <p className="text-[10px] text-gray-500">Security history</p>
          </button>
        </div>
      </div>

      {/* Recent Orders Overview Table */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
        <div className="p-4 md:p-5 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-gray-900">{t('adminNavOrders')} (Recent)</h3>
            <p className="text-xs text-gray-500">Live multi-vendor customer orders</p>
          </div>
          <button
            onClick={() => onNavigateTab('orders')}
            className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
          >
            <span>View All</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-gray-600">
            <thead className="bg-gray-50 text-gray-700 font-semibold border-b border-gray-200">
              <tr>
                <th className="px-4 py-3">Order ID</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Vendors / Items</th>
                <th className="px-4 py-3">Total</th>
                <th className="px-4 py-3">Payment</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {recentOrders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                    {t('noDataFound')}
                  </td>
                </tr>
              ) : (
                recentOrders.map((order) => {
                  const orderIdStr = String(order.orderId || order.id || '');
                  const pStatus = String(order.paymentStatus || 'pending').toUpperCase();
                  const pMethod = String(order.paymentMethod || 'cash').replace('_', ' ');
                  const oStatus = String(order.status || 'pending').toUpperCase();

                  return (
                    <tr key={orderIdStr || Math.random()} className="hover:bg-gray-50/70 transition-colors">
                      <td className="px-4 py-3 font-semibold text-gray-900 font-mono">
                        #{orderIdStr ? orderIdStr.slice(-8) : '--------'}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-800">{order.shippingAddress?.fullName || 'Customer'}</p>
                        <p className="text-[11px] text-gray-400">{order.shippingAddress?.city || 'Somalia'}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-gray-100 text-gray-700 font-medium text-[11px]">
                          {order.vendorOrders?.length || 1} vendor(s) • {order.items?.length || 0} item(s)
                        </span>
                      </td>
                      <td className="px-4 py-3 font-bold text-gray-900">
                        ${Number(order.total || 0).toFixed(2)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            order.paymentStatus === 'paid'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-amber-50 text-amber-700 border border-amber-200'
                          }`}
                        >
                          {pStatus} ({pMethod})
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            order.status === 'delivered'
                              ? 'bg-emerald-100 text-emerald-800'
                              : order.status === 'cancelled'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-blue-100 text-blue-800'
                          }`}
                        >
                          {oStatus}
                        </span>
                      </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => {
                          if (onSelectOrder) onSelectOrder(order);
                          onNavigateTab('orders');
                        }}
                        className="px-2.5 py-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors"
                      >
                        Investigate
                      </button>
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
