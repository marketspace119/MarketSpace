import React, { useState, useEffect } from 'react';
import {
  Truck,
  Package,
  CheckCircle2,
  Clock,
  Phone,
  MapPin,
  AlertCircle,
  ShieldCheck,
  Star,
  Navigation,
  Check,
  X,
  ExternalLink,
  ChevronRight,
  RefreshCw,
  Power,
  RotateCcw,
} from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { DeliveryAssignment, DriverProfile, DriverStatus } from '../types';
import { deliveryService } from '../services/deliveryService';

interface DriverDashboardPageProps {
  onNavigate: (path: string) => void;
}

export const DriverDashboardPage: React.FC<DriverDashboardPageProps> = ({ onNavigate }) => {
  const { language, t, isRTL } = useLanguage();
  const { user } = useAuth();

  const [driver, setDriver] = useState<DriverProfile | null>(null);
  const [assignments, setAssignments] = useState<DeliveryAssignment[]>([]);
  const [activeTab, setActiveTab] = useState<'active' | 'history'>('active');
  const [isLoading, setIsLoading] = useState(true);
  const [statusUpdating, setStatusUpdating] = useState(false);

  // Delivery Action Modals
  const [deliverySuccessModal, setDeliverySuccessModal] = useState<DeliveryAssignment | null>(null);
  const [recipientNameInput, setRecipientNameInput] = useState('');
  const [deliveryNotesInput, setDeliveryNotesInput] = useState('');

  const [deliveryFailedModal, setDeliveryFailedModal] = useState<DeliveryAssignment | null>(null);
  const [failureReasonInput, setFailureReasonInput] = useState('');

  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 3500);
  };

  const loadData = () => {
    if (!user) return;
    setIsLoading(true);

    // Find driver profile matching this user
    const allDrivers = deliveryService.getDrivers();
    let currentDriver = allDrivers.find(
      d => d.id === user.id || d.email === user.email || d.phone === user.phone
    );

    // Fallback to first available demo driver if testing
    if (!currentDriver && allDrivers.length > 0) {
      currentDriver = allDrivers[0];
    }

    if (currentDriver) {
      setDriver(currentDriver);
      const driverAssignments = deliveryService.getAllAssignments().filter(
        a =>
          a.assignedDriver === currentDriver!.id ||
          a.driverId === currentDriver!.id ||
          (a.driverName && currentDriver!.name && a.driverName.includes(currentDriver!.name.split(' ')[0]))
      );
      setAssignments(driverAssignments);
    } else {
      setAssignments(deliveryService.getAllAssignments().slice(0, 5));
    }

    setIsLoading(false);
  };

  useEffect(() => {
    loadData();
  }, [user]);

  const handleToggleDriverStatus = (newStatus: DriverStatus) => {
    if (!driver || !user) return;
    setStatusUpdating(true);
    try {
      const updated = deliveryService.updateDriverStatus(driver.id, newStatus, user.id, user.role);
      setDriver(updated);
      showToast(
        language === 'ar'
          ? `تم تحديث حالة العمل إلى: ${newStatus === 'AVAILABLE' ? 'متاح ومستعد' : 'غير متصل'}`
          : `Driver status set to: ${newStatus}`,
        'success'
      );
    } catch (err: any) {
      showToast(err.message || 'Failed to update status', 'error');
    } finally {
      setStatusUpdating(false);
    }
  };

  const handleUpdateAssignmentStatus = async (
    assignmentId: string,
    targetStatus: 'PICKED_UP' | 'OUT_FOR_DELIVERY'
  ) => {
    if (!user || !driver) return;
    try {
      await deliveryService.updateStatus({
        assignmentId,
        status: targetStatus,
        actorId: driver.id,
        actorRole: 'DRIVER',
        notes: `Driver transitioned delivery to ${targetStatus}`,
      });
      showToast(
        language === 'ar'
          ? targetStatus === 'PICKED_UP'
            ? 'تم تأكيد استلام الشحنة من المتجر، وهي قيد النقل الآن'
            : 'بدأت مرحلة التوصيل الفعلي للعميل'
          : `Delivery marked as ${targetStatus}`,
        'success'
      );
      loadData();
    } catch (err: any) {
      showToast(err.message || 'Failed to update delivery status', 'error');
    }
  };

  const handleConfirmDelivered = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !driver || !deliverySuccessModal) return;

    try {
      await deliveryService.updateStatus({
        assignmentId: deliverySuccessModal.id,
        status: 'DELIVERED',
        actorId: driver.id,
        actorRole: 'DRIVER',
        proof: {
          type: 'recipient_confirmation',
          recipientName: recipientNameInput.trim() || deliverySuccessModal.customerName,
          recipientConfirmation: deliveryNotesInput.trim() || 'Delivered directly to customer',
        },
        notes: `Delivered to: ${recipientNameInput.trim() || deliverySuccessModal.customerName}`,
      });

      showToast(
        language === 'ar' ? 'تم تأكيد تسليم الشحنة للعميل بنجاح! أحسنت عملًا.' : 'Delivery completed successfully!',
        'success'
      );
      setDeliverySuccessModal(null);
      setRecipientNameInput('');
      setDeliveryNotesInput('');
      loadData();
    } catch (err: any) {
      showToast(err.message || 'Failed to complete delivery', 'error');
    }
  };

  const handleReportFailure = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !driver || !deliveryFailedModal) return;

    if (!failureReasonInput.trim()) {
      showToast(language === 'ar' ? 'يرجى كتابة سبب تعذر التسليم' : 'Please provide reason for failure', 'error');
      return;
    }

    try {
      await deliveryService.updateStatus({
        assignmentId: deliveryFailedModal.id,
        status: 'FAILED',
        actorId: driver.id,
        actorRole: 'DRIVER',
        failureReason: failureReasonInput.trim(),
        notes: failureReasonInput.trim(),
      });

      showToast(
        language === 'ar' ? 'تم تسجيل تعذر التسليم وإخطار الإدارة والمتجر' : 'Delivery marked as failed',
        'success'
      );
      setDeliveryFailedModal(null);
      setFailureReasonInput('');
      loadData();
    } catch (err: any) {
      showToast(err.message || 'Failed to record failure', 'error');
    }
  };

  const activeDeliveries = assignments.filter(
    a => a.status !== 'DELIVERED' && a.status !== 'delivered' && a.status !== 'CANCELLED' && a.status !== 'cancelled'
  );

  const completedDeliveries = assignments.filter(
    a => a.status === 'DELIVERED' || a.status === 'delivered'
  );

  const dynamicTotalEarned = completedDeliveries.reduce(
    (sum, d) => sum + (d.driverEarnings || d.deliveryFee || 3.5),
    0
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fadeIn">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          className={`fixed bottom-6 end-6 z-50 px-4 py-3 rounded-2xl shadow-xl border text-xs font-bold flex items-center gap-2 transition-all ${
            toastMessage.type === 'success'
              ? 'bg-emerald-600 text-white border-emerald-500'
              : 'bg-rose-600 text-white border-rose-500'
          }`}
        >
          {toastMessage.type === 'success' ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Driver Header Profile Card */}
      <div className="bg-white dark:bg-[#151A23] border border-gray-200 dark:border-[#293142] rounded-3xl p-6 mb-8 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-cyan-100 dark:bg-cyan-950/60 text-cyan-600 dark:text-cyan-400 flex items-center justify-center shrink-0">
              <Truck className="w-8 h-8" />
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white">
                  {driver?.name || user?.name || 'Driver Portal'}
                </h1>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-cyan-100 dark:bg-cyan-950 text-cyan-700 dark:text-cyan-300">
                  {language === 'ar' ? 'مندوب رسمي' : 'Authorized Courier'}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500 mt-1">
                <span>{driver?.phone || user?.phone || '+252 61 511 2233'}</span>
                <span>•</span>
                <span className="font-semibold text-gray-700 dark:text-gray-300">
                  {driver?.vehicleType ? driver.vehicleType.toUpperCase() : 'MOTORCYCLE'} ({driver?.plateNumber || 'MG-4421'})
                </span>
                <span>•</span>
                <span className="flex items-center gap-1 text-amber-500 font-bold">
                  <Star className="w-3.5 h-3.5 fill-amber-500" />
                  <span>{driver?.rating || 4.9}</span>
                </span>
              </div>
            </div>
          </div>

          {/* Availability Toggle */}
          <div className="flex items-center gap-3 bg-gray-50 dark:bg-[#111722] p-2.5 rounded-2xl border border-gray-200 dark:border-[#293142]">
            <span className="text-xs font-semibold text-gray-500">
              {language === 'ar' ? 'حالة المندوب:' : 'Shift Status:'}
            </span>
            <button
              onClick={() =>
                handleToggleDriverStatus(driver?.status === 'AVAILABLE' ? 'OFFLINE' : 'AVAILABLE')
              }
              disabled={statusUpdating}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-xs ${
                driver?.status === 'AVAILABLE'
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  : 'bg-gray-300 dark:bg-gray-700 hover:bg-gray-400 text-gray-800 dark:text-gray-200'
              }`}
            >
              <Power className="w-3.5 h-3.5" />
              <span>
                {driver?.status === 'AVAILABLE'
                  ? language === 'ar'
                    ? 'متصل ومستعد (Active)'
                    : 'Online & Available'
                  : language === 'ar'
                  ? 'غير متصل (Offline)'
                  : 'Offline'}
              </span>
            </button>
          </div>
        </div>

        {/* Stats Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-6 border-t border-gray-100 dark:border-[#293142]">
          <div className="p-3 rounded-2xl bg-gray-50 dark:bg-[#111722]/60">
            <span className="text-[11px] text-gray-400 block font-semibold">
              {language === 'ar' ? 'شحنات قيد التوصيل' : 'Active Tasks'}
            </span>
            <span className="text-xl font-black text-gray-900 dark:text-white mt-0.5 block">
              {activeDeliveries.length}
            </span>
          </div>

          <div className="p-3 rounded-2xl bg-gray-50 dark:bg-[#111722]/60">
            <span className="text-[11px] text-gray-400 block font-semibold">
              {language === 'ar' ? 'إجمالي التوصيلات المكتملة' : 'Completed Deliveries'}
            </span>
            <span className="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-0.5 block">
              {driver?.totalDeliveries || completedDeliveries.length}
            </span>
          </div>

          <div className="p-3 rounded-2xl bg-gray-50 dark:bg-[#111722]/60">
            <span className="text-[11px] text-gray-400 block font-semibold">
              {language === 'ar' ? 'منطقة العمل الحالية' : 'Coverage Zone'}
            </span>
            <span className="text-xs font-bold text-gray-800 dark:text-gray-200 mt-1 block truncate">
              {driver?.currentZone || 'Hodan / Waberi, Mogadishu'}
            </span>
          </div>

          <div className="p-3 rounded-2xl bg-gray-50 dark:bg-[#111722]/60">
            <span className="text-[11px] text-gray-400 block font-semibold">
              {language === 'ar' ? 'مستحقات التوصيل التقديرية' : 'Estimated Earnings'}
            </span>
            <span className="text-xl font-black text-[#0E11B7] dark:text-cyan-400 mt-0.5 block">
              ${dynamicTotalEarned.toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-3 mb-6 border-b border-gray-200 dark:border-[#293142] pb-3">
        <button
          onClick={() => setActiveTab('active')}
          className={`flex items-center gap-2 px-4 py-2 rounded-2xl text-xs font-bold transition-all ${
            activeTab === 'active'
              ? 'bg-cyan-600 text-white shadow-md'
              : 'bg-white dark:bg-[#151A23] text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-[#293142]'
          }`}
        >
          <Package className="w-4 h-4" />
          <span>{language === 'ar' ? 'المهام الحالية والتوصيل' : 'Active Tasks'}</span>
          <span className="ms-1 px-2 py-0.5 rounded-full text-[10px] bg-black/10 dark:bg-white/10">
            {activeDeliveries.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('history')}
          className={`flex items-center gap-2 px-4 py-2 rounded-2xl text-xs font-bold transition-all ${
            activeTab === 'history'
              ? 'bg-cyan-600 text-white shadow-md'
              : 'bg-white dark:bg-[#151A23] text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-[#293142]'
          }`}
        >
          <CheckCircle2 className="w-4 h-4" />
          <span>{language === 'ar' ? 'سجل الشحنات المكتملة' : 'Delivery History'}</span>
          <span className="ms-1 px-2 py-0.5 rounded-full text-[10px] bg-black/10 dark:bg-white/10">
            {completedDeliveries.length}
          </span>
        </button>

        <button
          onClick={loadData}
          className="ms-auto p-2 rounded-xl bg-white dark:bg-[#151A23] border border-gray-200 dark:border-[#293142] text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition"
          title="تحديث البيانات"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Active Tab View */}
      {activeTab === 'active' && (
        <div className="space-y-4">
          {activeDeliveries.length === 0 ? (
            <div className="bg-white dark:bg-[#151A23] border border-gray-200 dark:border-[#293142] rounded-3xl p-12 text-center">
              <Truck className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
              <h3 className="text-base font-bold text-gray-900 dark:text-white">
                {language === 'ar' ? 'لا توجد مهام توصيل مسندة إليك حالياً' : 'No Active Delivery Tasks'}
              </h3>
              <p className="text-xs text-gray-500 max-w-sm mx-auto mt-1">
                {language === 'ar'
                  ? 'بمجرد أن يقوم أحد المتاجر بتجهيز طلب وإسناده لك، ستظهر تفاصيل الشحنة وعنوان العميل هنا فوراً.'
                  : 'Assigned orders from merchants and restaurants will appear here in real-time.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {activeDeliveries.map(deliv => {
                const isReady = deliv.status === 'READY' || deliv.status === 'ASSIGNED' || deliv.status === 'PENDING';
                const isPickedUp = deliv.status === 'PICKED_UP';
                const isOut = deliv.status === 'OUT_FOR_DELIVERY';

                return (
                  <div
                    key={deliv.id}
                    className="bg-white dark:bg-[#151A23] border border-gray-200 dark:border-[#293142] rounded-3xl p-6 shadow-sm flex flex-col justify-between gap-4"
                  >
                    <div>
                      {/* Top Header */}
                      <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-[#293142]">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-[#0E11B7] dark:text-cyan-400">
                            #{deliv.subOrderId || deliv.orderId}
                          </span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 uppercase">
                            {deliv.status}
                          </span>
                        </div>
                        <span className="text-[11px] text-gray-400 font-mono">
                          {deliv.trackingCode || deliv.trackingNumber}
                        </span>
                      </div>

                      {/* Store & Customer Details */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 my-4 text-xs">
                        {/* Pickup: Store */}
                        <div className="p-3 rounded-2xl bg-gray-50 dark:bg-[#111722]">
                          <span className="text-[10px] font-bold text-gray-400 block mb-1 uppercase tracking-wider">
                            {language === 'ar' ? 'نقطة الاستلام (المتجر):' : 'Pickup From Store:'}
                          </span>
                          <p className="font-bold text-gray-900 dark:text-white">
                            {deliv.storeName || 'MarketSpace Partner'}
                          </p>
                          <p className="text-[11px] text-gray-500 mt-0.5">
                            {deliv.city}
                          </p>
                        </div>

                        {/* Dropoff: Customer */}
                        <div className="p-3 rounded-2xl bg-cyan-50/50 dark:bg-cyan-950/20 border border-cyan-100 dark:border-cyan-900/40">
                          <span className="text-[10px] font-bold text-cyan-700 dark:text-cyan-400 block mb-1 uppercase tracking-wider">
                            {language === 'ar' ? 'وجهة التسليم (العميل):' : 'Deliver To Customer:'}
                          </span>
                          <p className="font-bold text-gray-900 dark:text-white">
                            {deliv.customerName}
                          </p>
                          <p className="text-[11px] text-gray-600 dark:text-gray-300 mt-0.5">
                            {deliv.address}, {deliv.city}
                          </p>
                          {deliv.customerPhone && (
                            <a
                              href={`tel:${deliv.customerPhone}`}
                              className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 hover:underline"
                            >
                              <Phone className="w-3 h-3" />
                              <span>{deliv.customerPhone}</span>
                            </a>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Operational Action Buttons */}
                    <div className="pt-3 border-t border-gray-100 dark:border-[#293142] flex flex-wrap items-center gap-2">
                      {isReady && (
                        <button
                          onClick={() => handleUpdateAssignmentStatus(deliv.id, 'PICKED_UP')}
                          className="flex-1 bg-cyan-600 hover:bg-cyan-700 text-white py-2.5 px-3 rounded-2xl text-xs font-bold flex items-center justify-center gap-1.5 shadow"
                        >
                          <Truck className="w-3.5 h-3.5" />
                          <span>{language === 'ar' ? 'استلام الطرد من المتجر' : 'Pick Up Package'}</span>
                        </button>
                      )}

                      {isPickedUp && (
                        <button
                          onClick={() => handleUpdateAssignmentStatus(deliv.id, 'OUT_FOR_DELIVERY')}
                          className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 px-3 rounded-2xl text-xs font-bold flex items-center justify-center gap-1.5 shadow"
                        >
                          <Navigation className="w-3.5 h-3.5" />
                          <span>{language === 'ar' ? 'بدء التوصيل إلى العميل' : 'Out For Delivery'}</span>
                        </button>
                      )}

                      {(isOut || isPickedUp) && (
                        <button
                          onClick={() => {
                            setDeliverySuccessModal(deliv);
                            setRecipientNameInput(deliv.customerName);
                            setDeliveryNotesInput('');
                          }}
                          className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 px-3 rounded-2xl text-xs font-bold flex items-center justify-center gap-1.5 shadow"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>{language === 'ar' ? 'تسليم ناجح للعميل' : 'Mark Delivered'}</span>
                        </button>
                      )}

                      <button
                        onClick={() => {
                          setDeliveryFailedModal(deliv);
                          setFailureReasonInput('');
                        }}
                        className="px-3 py-2.5 rounded-2xl border border-rose-200 dark:border-rose-900 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-xs font-bold transition"
                      >
                        {language === 'ar' ? 'تعذر التسليم' : 'Report Issue'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* History Tab View */}
      {activeTab === 'history' && (
        <div className="space-y-4">
          {completedDeliveries.length === 0 ? (
            <div className="bg-white dark:bg-[#151A23] border border-gray-200 dark:border-[#293142] rounded-3xl p-12 text-center text-xs text-gray-500">
              {language === 'ar' ? 'لا توجد شحنات مكتملة في هذه الجلسة حتى الآن.' : 'No completed deliveries yet.'}
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-[#293142] bg-white dark:bg-[#151A23] border border-gray-200 dark:border-[#293142] rounded-3xl overflow-hidden shadow-sm">
              {completedDeliveries.map(deliv => (
                <div key={deliv.id} className="p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4 text-xs">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-gray-900 dark:text-white">
                        #{deliv.subOrderId || deliv.orderId}
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                        DELIVERED
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-500 mt-1">
                      {deliv.storeName} → {deliv.customerName} ({deliv.city})
                    </p>
                    {deliv.timestamps?.delivered && (
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        {new Date(deliv.timestamps.delivered).toLocaleString()}
                      </p>
                    )}
                  </div>

                  <div className="text-end">
                    <span className="text-emerald-600 font-bold block">
                      +${(deliv.driverEarnings || deliv.deliveryFee || 3.5).toFixed(2)} Fee
                    </span>
                    <span className="text-[10px] text-gray-400">Paid directly to driver</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Delivery Success Modal */}
      {deliverySuccessModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-[#151A23] rounded-3xl max-w-md w-full border border-gray-200 dark:border-[#293142] p-6 shadow-2xl">
            <h3 className="font-bold text-base text-gray-900 dark:text-white mb-2 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              <span>{language === 'ar' ? 'تأكيد تسليم الشحنة للعميل' : 'Confirm Order Delivery'}</span>
            </h3>
            <p className="text-xs text-gray-500 mb-4">
              {language === 'ar'
                ? 'يرجى تسجيل اسم المستلم للتأكد من وصول الشحنة وإتمام مستحقاتك.'
                : 'Enter recipient name and any confirmation notes.'}
            </p>

            <form onSubmit={handleConfirmDelivered} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  {language === 'ar' ? 'اسم المستلم الفعلي:' : 'Recipient Full Name:'}
                </label>
                <input
                  type="text"
                  required
                  value={recipientNameInput}
                  onChange={e => setRecipientNameInput(e.target.value)}
                  className="w-full bg-gray-50 dark:bg-[#111722] border border-gray-300 dark:border-[#293142] rounded-xl p-2.5 text-xs text-gray-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  {language === 'ar' ? 'ملاحظات التسليم (اختياري):' : 'Delivery Notes (Optional):'}
                </label>
                <textarea
                  rows={2}
                  value={deliveryNotesInput}
                  onChange={e => setDeliveryNotesInput(e.target.value)}
                  placeholder={language === 'ar' ? 'تم الاستلام يدويًا عند الباب...' : 'Received in hand...'}
                  className="w-full bg-gray-50 dark:bg-[#111722] border border-gray-300 dark:border-[#293142] rounded-xl p-2.5 text-xs text-gray-900 dark:text-white"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setDeliverySuccessModal(null)}
                  className="flex-1 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 font-bold"
                >
                  {language === 'ar' ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded-xl font-bold flex items-center justify-center gap-1.5 shadow"
                >
                  <Check className="w-4 h-4" />
                  <span>{language === 'ar' ? 'تأكيد التسليم' : 'Confirm'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delivery Failed Modal */}
      {deliveryFailedModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-[#151A23] rounded-3xl max-w-md w-full border border-gray-200 dark:border-[#293142] p-6 shadow-2xl">
            <h3 className="font-bold text-base text-gray-900 dark:text-white mb-2 flex items-center gap-2 text-rose-600">
              <AlertCircle className="w-5 h-5" />
              <span>{language === 'ar' ? 'تسجيل تعذر التسليم' : 'Report Delivery Failure'}</span>
            </h3>
            <p className="text-xs text-gray-500 mb-4">
              {language === 'ar'
                ? 'يرجى توضيح سبب تعذر التسليم (مثل: الهاتف مغلق، العنوان غير دقيق، العميل طلب التأجيل).'
                : 'State the specific issue encountered so customer service can re-attempt.'}
            </p>

            <form onSubmit={handleReportFailure} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  {language === 'ar' ? 'السبب بالتفصيل:' : 'Reason:'}
                </label>
                <textarea
                  rows={3}
                  required
                  value={failureReasonInput}
                  onChange={e => setFailureReasonInput(e.target.value)}
                  placeholder={language === 'ar' ? 'تعذر الوصول للعميل بعد عدة اتصالات...' : 'Customer not responding to calls...'}
                  className="w-full bg-gray-50 dark:bg-[#111722] border border-gray-300 dark:border-[#293142] rounded-xl p-2.5 text-xs text-gray-900 dark:text-white"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setDeliveryFailedModal(null)}
                  className="flex-1 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 font-bold"
                >
                  {language === 'ar' ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-rose-600 hover:bg-rose-700 text-white py-2.5 rounded-xl font-bold flex items-center justify-center gap-1.5 shadow"
                >
                  <span>{language === 'ar' ? 'إرسال البلاغ' : 'Submit'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
