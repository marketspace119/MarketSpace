import React, { useState, useEffect } from 'react';
import { Truck, MapPin, Phone, User, Clock, CheckCircle2, AlertCircle, Plus } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import { Order, User as UserType, DeliveryAssignment } from '../../types';
import { deliveryService } from '../../services/deliveryService';

interface AdminDeliverySectionProps {
  orders: Order[];
  currentUser: UserType;
  onRefresh: () => void;
  searchQuery: string;
}

export const AdminDeliverySection: React.FC<AdminDeliverySectionProps> = ({
  orders,
  currentUser,
  onRefresh,
  searchQuery,
}) => {
  const { t, isRtl } = useLanguage();

  const [assignments, setAssignments] = useState<DeliveryAssignment[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [modelFilter, setModelFilter] = useState<string>('all');

  // Assign driver modal
  const [assigningOrder, setAssigningOrder] = useState<Order | null>(null);
  const [driverName, setDriverName] = useState('');
  const [driverPhone, setDriverPhone] = useState('');
  const [vehicleInfo, setVehicleInfo] = useState('');
  const [deliveryModel, setDeliveryModel] = useState<'platform_delivery' | 'seller_delivery' | 'customer_pickup'>('platform_delivery');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadAssignments = async () => {
    const list = await deliveryService.getAllAssignments();
    setAssignments(list);
  };

  useEffect(() => {
    loadAssignments();
  }, []);

  const filteredOrders = orders.filter((o) => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchId = o.id.toLowerCase().includes(q);
      const matchName = o.shippingAddress?.fullName?.toLowerCase().includes(q);
      const matchCity = o.shippingAddress?.city?.toLowerCase().includes(q);
      if (!matchId && !matchName && !matchCity) return false;
    }
    if (statusFilter !== 'all' && o.status !== statusFilter) return false;
    return true;
  });

  const handleCreateAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assigningOrder) return;
    setIsSubmitting(true);

    try {
      const vendor = assigningOrder.vendorOrders?.[0];
      await deliveryService.createAssignment({
        orderId: assigningOrder.orderId,
        subOrderId: vendor?.subOrderId,
        storeId: vendor?.storeId || 'general_store',
        storeName: vendor?.storeName || 'MarketSpace Store',
        sellerId: vendor?.sellerId || 'seller_01',
        customerName: assigningOrder.customerName,
        customerPhone: assigningOrder.phone,
        city: assigningOrder.city,
        address: assigningOrder.address,
        deliveryType: deliveryModel === 'customer_pickup' ? 'pickup' : (deliveryModel as any),
        assignedDriver: driverName.trim() || null,
        driverPhone: driverPhone.trim(),
        vehicleInfo: vehicleInfo.trim(),
        trackingCode: assigningOrder.deliveryTrackingCode,
        status: driverName.trim() ? 'ready' : 'pending_fulfillment',
      });

      setAssigningOrder(null);
      setDriverName('');
      setDriverPhone('');
      setVehicleInfo('');
      await loadAssignments();
      onRefresh();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateStatus = async (assignmentId: string, nextStatus: DeliveryAssignment['status']) => {
    await deliveryService.updateAssignmentStatus({
      assignmentId,
      status: nextStatus,
      actorId: currentUser.id,
      actorRole: currentUser.role,
    });
    await loadAssignments();
    onRefresh();
  };

  return (
    <div className="space-y-4" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Header & stats */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-white rounded-2xl border border-gray-200 shadow-xs">
        <div className="flex items-center gap-2">
          <Truck className="w-5 h-5 text-indigo-600" />
          <div>
            <h3 className="text-sm font-bold text-gray-900">{t('adminNavDelivery')}</h3>
            <p className="text-xs text-gray-500">
              {assignments.length} active delivery dispatches • Manual driver routing
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">Fulfillment: All</option>
            <option value="pending">Awaiting Fulfillment</option>
            <option value="processing">Preparing</option>
            <option value="shipped">Shipped / In Transit</option>
            <option value="delivered">Delivered</option>
          </select>
        </div>
      </div>

      {/* Dispatches Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 bg-white rounded-2xl border border-gray-200 shadow-xs">
          <p className="text-xs font-semibold text-gray-500 uppercase">Awaiting Driver</p>
          <p className="text-2xl font-black text-gray-900 mt-1">
            {orders.filter((o) => o.status === 'processing' || o.status === 'pending').length}
          </p>
          <p className="text-[11px] text-gray-400">Ready for courier dispatch</p>
        </div>
        <div className="p-4 bg-white rounded-2xl border border-gray-200 shadow-xs">
          <p className="text-xs font-semibold text-gray-500 uppercase">Out on Road</p>
          <p className="text-2xl font-black text-indigo-600 mt-1">
            {assignments.filter((a) => a.status === 'OUT_FOR_DELIVERY' || a.status === 'PICKED_UP' || (a.status as string) === 'in_transit' || (a.status as string) === 'picked_up').length}
          </p>
          <p className="text-[11px] text-gray-400">Actively in transit with courier</p>
        </div>
        <div className="p-4 bg-white rounded-2xl border border-gray-200 shadow-xs">
          <p className="text-xs font-semibold text-gray-500 uppercase">Completed Deliveries</p>
          <p className="text-2xl font-black text-emerald-600 mt-1">
            {orders.filter((o) => o.status === 'delivered').length}
          </p>
          <p className="text-[11px] text-gray-400">Successfully handed to customer</p>
        </div>
      </div>

      {/* Orders & Driver Dispatches Table */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wider">
            Orders Awaiting or in Delivery
          </h4>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-gray-600">
            <thead className="bg-gray-50 text-gray-700 font-semibold border-b border-gray-200">
              <tr>
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3">Destination City & Address</th>
                <th className="px-4 py-3">Assigned Courier / Driver</th>
                <th className="px-4 py-3">Delivery Model</th>
                <th className="px-4 py-3">Fulfillment Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                    {t('noDataFound')}
                  </td>
                </tr>
              ) : (
                filteredOrders.map((order) => {
                  const assignment = assignments.find((a) => a.orderId === order.id);

                  return (
                    <tr key={order.id} className="hover:bg-gray-50/70 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-gray-900 font-mono">#{order.id.slice(-8)}</p>
                        <p className="text-[11px] text-gray-400">{order.items?.length || 0} items</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-800">{order.shippingAddress?.fullName}</p>
                        <div className="flex items-center gap-1 text-[11px] text-gray-400">
                          <MapPin className="w-3 h-3 text-gray-400" />
                          <span>{(order.shippingAddress as any)?.streetAddress || order.shippingAddress?.addressLine1 || order.shippingAddress?.city || 'Address'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {assignment ? (
                          <div>
                            <p className="font-bold text-gray-900">{assignment.driverName}</p>
                            <p className="text-[11px] text-gray-500 font-mono">{assignment.driverPhone} • {assignment.vehicleInfo}</p>
                          </div>
                        ) : (
                          <span className="text-gray-400 italic">Unassigned</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded-md bg-gray-100 text-gray-700 font-medium text-[10px] capitalize">
                          {(assignment?.deliveryModel || 'platform_delivery').replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            order.status === 'delivered'
                              ? 'bg-emerald-100 text-emerald-800'
                              : order.status === 'shipped'
                              ? 'bg-indigo-100 text-indigo-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {order.status.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {!assignment ? (
                          <button
                            onClick={() => setAssigningOrder(order)}
                            className="px-2.5 py-1 text-[11px] font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg inline-flex items-center gap-1"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Assign Driver</span>
                          </button>
                        ) : assignment.status !== 'delivered' ? (
                          <button
                            onClick={() => handleUpdateStatus(assignment.id, 'delivered')}
                            className="px-2.5 py-1 text-[11px] font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg"
                          >
                            Mark Delivered
                          </button>
                        ) : (
                          <span className="text-[11px] text-emerald-600 font-bold">Done</span>
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

      {/* Driver Assignment Modal */}
      {assigningOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <form
            onSubmit={handleCreateAssignment}
            className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-100 text-xs"
          >
            <h3 className="text-base font-bold text-gray-900 mb-1">
              Assign Dispatch Driver for Order #{assigningOrder.id.slice(-8)}
            </h3>
            <p className="text-gray-500 mb-4">
              Enter real driver contact and vehicle information for the courier.
            </p>

            <div className="space-y-3 mb-5">
              <div>
                <label className="block font-semibold text-gray-700 mb-1">Driver Name *</label>
                <input
                  type="text"
                  required
                  value={driverName}
                  onChange={(e) => setDriverName(e.target.value)}
                  placeholder="e.g. Abdirahman Farah"
                  className="w-full p-2 bg-gray-50 border border-gray-200 rounded-xl"
                />
              </div>

              <div>
                <label className="block font-semibold text-gray-700 mb-1">Driver Mobile Phone *</label>
                <input
                  type="text"
                  required
                  value={driverPhone}
                  onChange={(e) => setDriverPhone(e.target.value)}
                  placeholder="e.g. +252 61 5500000"
                  className="w-full p-2 bg-gray-50 border border-gray-200 rounded-xl"
                />
              </div>

              <div>
                <label className="block font-semibold text-gray-700 mb-1">Vehicle / Motorcycle Info *</label>
                <input
                  type="text"
                  required
                  value={vehicleInfo}
                  onChange={(e) => setVehicleInfo(e.target.value)}
                  placeholder="e.g. Bajaj TVS Plate #20412"
                  className="w-full p-2 bg-gray-50 border border-gray-200 rounded-xl"
                />
              </div>

              <div>
                <label className="block font-semibold text-gray-700 mb-1">Delivery Model</label>
                <select
                  value={deliveryModel}
                  onChange={(e: any) => setDeliveryModel(e.target.value)}
                  className="w-full p-2 bg-gray-50 border border-gray-200 rounded-xl"
                >
                  <option value="platform_delivery">Platform Courier (MarketSpace Driver)</option>
                  <option value="seller_delivery">Seller's Own Courier</option>
                  <option value="customer_pickup">Customer In-Store Pickup</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setAssigningOrder(null)}
                className="px-4 py-2 font-semibold bg-gray-100 hover:bg-gray-200 rounded-xl text-gray-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-5 py-2 font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl"
              >
                {isSubmitting ? 'Assigning...' : 'Confirm Assignment'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
