import React, { useState } from 'react';
import { ShoppingBag, Eye, CheckCircle, AlertCircle, Clock, MapPin, Phone, User, DollarSign, X } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import { Order, User as UserType } from '../../types';
import { orderService } from '../../services/orderService';
import { auditLogService } from '../../services/auditLogService';
import { AdminConfirmModal } from './AdminConfirmModal';
import { normalizeOrder } from '../../lib/dataNormalization';

interface AdminOrdersSectionProps {
  orders: Order[];
  currentUser: UserType;
  onRefresh: () => void;
  searchQuery: string;
  selectedOrderProp?: Order | null;
}

export const AdminOrdersSection: React.FC<AdminOrdersSectionProps> = ({
  orders,
  currentUser,
  onRefresh,
  searchQuery,
  selectedOrderProp,
}) => {
  const { t, isRtl } = useLanguage();

  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [paymentFilter, setPaymentFilter] = useState<string>('all');
  const [inspectOrder, setInspectOrder] = useState<Order | null>(selectedOrderProp || null);

  // Confirmation modal
  const [actionOrder, setActionOrder] = useState<Order | null>(null);
  const [actionType, setActionType] = useState<'confirm_payment' | 'cancel_order' | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const filteredOrders = orders.map(normalizeOrder).filter((o) => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const oId = String(o.orderId || o.id || '').toLowerCase();
      const matchId = oId.includes(q);
      const matchCustomer = String(o.shippingAddress?.fullName || '').toLowerCase().includes(q);
      const matchCity = String(o.shippingAddress?.city || '').toLowerCase().includes(q);
      const matchPhone = String(o.shippingAddress?.phoneNumber || '').toLowerCase().includes(q);
      if (!matchId && !matchCustomer && !matchCity && !matchPhone) return false;
    }

    if (statusFilter !== 'all' && o.status !== statusFilter) return false;
    if (paymentFilter !== 'all' && o.paymentStatus !== paymentFilter) return false;

    return true;
  });

  const handleConfirmAction = async () => {
    if (!actionOrder || !actionType) return;
    setIsProcessing(true);

    try {
      const targetOrderId = actionOrder.orderId || actionOrder.id;
      if (actionType === 'confirm_payment') {
        await orderService.confirmPaymentStatus(targetOrderId, currentUser.role);
        await auditLogService.logAction({
          actorId: currentUser.id,
          actorRole: currentUser.role,
          action: 'ORDER_PAYMENT_CONFIRMED',
          targetType: 'order',
          targetId: targetOrderId,
          targetName: `Order #${String(targetOrderId).slice(-8)}`,
          metadata: { amount: actionOrder.total, method: actionOrder.paymentMethod },
        });
      } else if (actionType === 'cancel_order') {
        await orderService.cancelOrder(
          targetOrderId,
          currentUser.id,
          currentUser.role,
          'Platform administrator cancellation'
        );
      }

      setActionOrder(null);
      setActionType(null);
      onRefresh();
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-4" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Filters Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-white rounded-2xl border border-gray-200 shadow-xs">
        <div className="flex items-center gap-2">
          <ShoppingBag className="w-5 h-5 text-indigo-600" />
          <div>
            <h3 className="text-sm font-bold text-gray-900">{t('adminNavOrders')}</h3>
            <p className="text-xs text-gray-500">
              {filteredOrders.length} of {orders.length} orders
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">Order: All Statuses</option>
            <option value="pending">Pending</option>
            <option value="processing">Processing</option>
            <option value="shipped">Shipped</option>
            <option value="delivered">Delivered</option>
            <option value="cancelled">Cancelled</option>
          </select>

          <select
            value={paymentFilter}
            onChange={(e) => setPaymentFilter(e.target.value)}
            className="px-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">Payment: All</option>
            <option value="pending">Payment Pending</option>
            <option value="paid">Paid</option>
            <option value="failed">Failed</option>
          </select>
        </div>
      </div>

      {/* Orders Table */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-gray-600">
            <thead className="bg-gray-50 text-gray-700 font-semibold border-b border-gray-200">
              <tr>
                <th className="px-4 py-3">Order ID & Date</th>
                <th className="px-4 py-3">Customer & Destination</th>
                <th className="px-4 py-3">Vendors & Items</th>
                <th className="px-4 py-3">Total Amount</th>
                <th className="px-4 py-3">Payment</th>
                <th className="px-4 py-3">Fulfillment</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                    {t('noDataFound')}
                  </td>
                </tr>
              ) : (
                filteredOrders.map((order) => {
                  const isPaid = order.paymentStatus === 'paid';
                  const isCancelled = order.status === 'cancelled';
                  const orderIdStr = String(order.orderId || order.id || '');
                  const dateStr = order.createdAt;
                  const formattedDate = dateStr ? new Date(dateStr).toLocaleDateString() : new Date().toLocaleDateString();
                  const pMethod = String(order.paymentMethod || 'cash').replace('_', ' ');
                  const pStatus = String(order.paymentStatus || 'pending').toUpperCase();
                  const oStatus = String(order.status || 'pending').toUpperCase();

                  return (
                    <tr key={orderIdStr} className="hover:bg-gray-50/70 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-gray-900 font-mono">#{orderIdStr ? orderIdStr.slice(-8) : '--------'}</p>
                        <p className="text-[11px] text-gray-400">
                          {formattedDate}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-800">{order.shippingAddress?.fullName || 'Customer'}</p>
                        <div className="flex items-center gap-1 text-[11px] text-gray-400">
                          <MapPin className="w-3 h-3 text-gray-400" />
                          <span>{order.shippingAddress?.city || 'Somalia'}</span>
                        </div>
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
                            isPaid
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-amber-100 text-amber-800'
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
                              : isCancelled
                              ? 'bg-red-100 text-red-800'
                              : 'bg-blue-100 text-blue-800'
                          }`}
                        >
                          {oStatus}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setInspectOrder(order)}
                            className="px-2.5 py-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors flex items-center gap-1"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Investigate</span>
                          </button>
                          {!isPaid && !isCancelled && (
                            <button
                              onClick={() => {
                                setActionOrder(order);
                                setActionType('confirm_payment');
                              }}
                              className="px-2 py-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg"
                              title="Mark Payment Confirmed"
                            >
                              Confirm $
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

      {/* Order Investigation Drawer / Modal */}
      {inspectOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl border border-gray-100">
            <div className="flex items-center justify-between pb-4 border-b border-gray-200">
              <div>
                <h3 className="text-base font-bold text-gray-900">
                  Order Investigation: #{String(inspectOrder.orderId || inspectOrder.id || '').slice(-8)}
                </h3>
                <p className="text-xs text-gray-500">
                  Created {inspectOrder.createdAt ? new Date(inspectOrder.createdAt).toLocaleString() : 'N/A'}
                </p>
              </div>
              <button
                onClick={() => setInspectOrder(null)}
                className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="py-4 space-y-4 text-xs text-gray-700">
              {/* Financial & Status Summary */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 bg-gray-50 rounded-xl">
                <div>
                  <span className="text-gray-400 block text-[10px]">Total Amount</span>
                  <span className="text-base font-black text-gray-900">${Number(inspectOrder.total || 0).toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-gray-400 block text-[10px]">Payment Method</span>
                  <span className="font-bold text-indigo-600 capitalize">{(inspectOrder.paymentMethod || 'cash').replace('_', ' ')}</span>
                </div>
                <div>
                  <span className="text-gray-400 block text-[10px]">Payment Status</span>
                  <span className="font-bold uppercase">{inspectOrder.paymentStatus || 'pending'}</span>
                </div>
                <div>
                  <span className="text-gray-400 block text-[10px]">Overall Status</span>
                  <span className="font-bold uppercase">{inspectOrder.status || 'pending'}</span>
                </div>
              </div>

              {/* Customer & Delivery Destination */}
              <div className="p-3 bg-gray-50 rounded-xl space-y-1">
                <h4 className="font-bold text-gray-900">Shipping & Delivery Details</h4>
                <p><strong>Customer:</strong> {inspectOrder.shippingAddress?.fullName}</p>
                <p><strong>Phone:</strong> {inspectOrder.shippingAddress?.phoneNumber}</p>
                <p><strong>Address:</strong> {(inspectOrder.shippingAddress as any)?.streetAddress || inspectOrder.shippingAddress?.addressLine1 || inspectOrder.shippingAddress?.city || '—'}, {inspectOrder.shippingAddress?.city}</p>
              </div>

              {/* Multi-Vendor Sub-Orders Breakdown */}
              <div>
                <h4 className="font-bold text-gray-900 mb-2">Vendor Sub-Orders ({inspectOrder.vendorOrders?.length || 1})</h4>
                <div className="space-y-2">
                  {(inspectOrder.vendorOrders || []).map((vo, idx) => (
                    <div key={vo.id || idx} className="p-3 border border-gray-200 rounded-xl bg-white space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-gray-900">Store: {vo.storeName || vo.sellerId}</span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800">
                          {vo.status.toUpperCase()}
                        </span>
                      </div>
                      <div className="text-[11px] text-gray-500 flex justify-between">
                        <span>Subtotal: ${vo.subtotal.toFixed(2)} • Commission: ${vo.platformCommission.toFixed(2)}</span>
                        <span>Vendor Net: ${vo.vendorEarnings.toFixed(2)}</span>
                      </div>
                      <div className="divide-y divide-gray-100 pt-1">
                        {vo.items.map((item, iIdx) => (
                          <div key={iIdx} className="py-1 flex justify-between text-gray-700">
                            <span>{item.quantity}x {item.productName}</span>
                            <span className="font-mono">${(item.price * item.quantity).toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-gray-200">
              {inspectOrder.paymentStatus !== 'paid' && (
                <button
                  onClick={() => {
                    setActionOrder(inspectOrder);
                    setActionType('confirm_payment');
                  }}
                  className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl"
                >
                  Confirm Customer Payment
                </button>
              )}
              <button
                onClick={() => setInspectOrder(null)}
                className="ml-auto px-4 py-2 text-xs font-semibold bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      <AdminConfirmModal
        isOpen={!!actionOrder && !!actionType}
        title={actionType === 'confirm_payment' ? 'Confirm Payment Received' : 'Cancel Order'}
        message={`Are you sure you want to execute "${actionType}" on Order #${String(actionOrder?.orderId || actionOrder?.id || '').slice(-8)}? This action will be audited.`}
        confirmLabel={t('confirmAction')}
        isDestructive={actionType === 'cancel_order'}
        isLoading={isProcessing}
        onConfirm={handleConfirmAction}
        onCancel={() => {
          setActionOrder(null);
          setActionType(null);
        }}
      />
    </div>
  );
};
