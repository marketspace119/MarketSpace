import React, { useState, useEffect } from 'react';
import {
  Package,
  Search,
  ChevronRight,
  Clock,
  CheckCircle2,
  Truck,
  AlertCircle,
  Store as StoreIcon,
  ShoppingBag,
  ExternalLink,
  Phone,
  MapPin,
  Calendar,
  Filter,
  Star,
  Copy,
  Check,
  MessageSquare,
  UserCheck,
  RotateCcw,
  Navigation,
} from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { OrderDetails, VendorSubOrder, DeliveryAssignment } from '../types';
import { orderService } from '../services/orderService';
import { reviewService } from '../services/reviewService';
import { deliveryService } from '../services/deliveryService';
import { messagingService } from '../services/messagingService';

interface OrdersPageProps {
  onNavigate: (path: string) => void;
  orderIdFromRoute?: string;
}

export const OrdersPage: React.FC<OrdersPageProps> = ({ onNavigate, orderIdFromRoute }) => {
  const { language, t, isRTL } = useLanguage();
  const { user } = useAuth();

  const [orders, setOrders] = useState<OrderDetails[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<OrderDetails | null>(null);
  const [searchId, setSearchId] = useState(orderIdFromRoute || '');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'processing' | 'shipped' | 'delivered'>('all');
  const [guestPhone, setGuestPhone] = useState('');
  const [guestError, setGuestError] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Review Modal State
  const [reviewModalData, setReviewModalData] = useState<{
    targetType: 'product' | 'store' | 'restaurant' | 'service';
    targetId: string;
    title: string;
    orderId: string;
  } | null>(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  const handleCopyTracking = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const handleSubmitReview = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !reviewModalData || !reviewComment.trim()) return;

    try {
      setIsSubmittingReview(true);
      reviewService.addReview({
        targetType: reviewModalData.targetType,
        targetId: reviewModalData.targetId,
        userId: user.id,
        userName: user.name || user.email.split('@')[0],
        rating: reviewRating,
        comment: reviewComment.trim(),
        isVerifiedPurchase: true,
        orderId: reviewModalData.orderId,
      });
      setIsSubmittingReview(false);
      setReviewModalData(null);
      setReviewComment('');
      setReviewRating(5);
      alert(language === 'ar' ? 'شكراً لك! تم إرسال تقييمك بنجاح.' : 'Thank you! Your review has been submitted.');
    } catch (err: any) {
      setIsSubmittingReview(false);
      alert(err.message || 'فشل إرسال التقييم');
    }
  };

  const handleContactVendor = async (vendor: VendorSubOrder) => {
    if (!user) {
      onNavigate('/login');
      return;
    }
    try {
      const conv = await messagingService.getOrCreateConversation({
        participantIds: [user.id, vendor.sellerId],
        participantDetails: [
          { id: user.id, name: user.name || user.email.split('@')[0], role: user.role },
          { id: vendor.sellerId, name: vendor.storeName, role: 'SELLER' as const },
        ],
        contextType: 'order',
        contextId: selectedOrder?.orderId,
        contextTitle: `${vendor.storeName} - #${selectedOrder?.orderId.slice(-6)}`,
      });
      onNavigate(`/messages?convId=${conv.id}`);
    } catch (err) {
      console.error('Failed to open message conversation:', err);
      onNavigate('/messages');
    }
  };

  useEffect(() => {
    // Initial sync and load
    const userOrders = orderService.getAllOrders(user?.id, user?.role);
    setOrders(userOrders);

    // If orderId is provided in route
    if (orderIdFromRoute) {
      const found = orderService.getOrderById(orderIdFromRoute, user?.id, user?.role);
      if (found) {
        setSelectedOrder(found);
      } else {
        setSearchId(orderIdFromRoute);
      }
    }
  }, [user?.id, user?.role, orderIdFromRoute]);

  const handleSearchOrder = (e: React.FormEvent) => {
    e.preventDefault();
    setGuestError(null);
    if (!searchId.trim()) return;

    const found = orderService.getOrderById(
      searchId.trim(),
      user?.id,
      user?.role,
      guestPhone.trim() || undefined
    );

    if (found) {
      setSelectedOrder(found);
      setGuestError(null);
    } else {
      setGuestError(
        language === 'ar'
          ? 'لم يتم العثور على الطلب، أو أنك بحاجة لإدخال رقم الهاتف المسجل في الطلب للتتبع الآمن.'
          : 'Order not found, or phone verification required for guest order tracking.'
      );
    }
  };

  const getStatusBadge = (status: OrderDetails['status']) => {
    switch (status) {
      case 'delivered':
        return {
          label: language === 'ar' ? 'تم التوصيل' : 'Delivered',
          color: 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border-emerald-200',
          icon: CheckCircle2,
        };
      case 'shipped':
        return {
          label: language === 'ar' ? 'في الطريق' : 'Shipped',
          color: 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400 border-blue-200',
          icon: Truck,
        };
      case 'processing':
        return {
          label: language === 'ar' ? 'قيد التجهيز' : 'Processing',
          color: 'bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-400 border-indigo-200',
          icon: Clock,
        };
      default:
        return {
          label: language === 'ar' ? 'قيد المراجعة' : 'Pending',
          color: 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-400 border-amber-200',
          icon: Clock,
        };
    }
  };

  const filteredOrders = orders.filter(o => {
    if (statusFilter === 'all') return true;
    return o.status === statusFilter;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fadeIn">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white flex items-center gap-3">
          <Package className="w-7 h-7 text-[#0E11B7]" />
          <span>{language === 'ar' ? 'طلباتي وتتبع الشحنات' : language === 'so' ? 'Dalbkayga & Raadinta' : 'My Orders & Tracking'}</span>
        </h1>
        <p className="text-xs text-gray-500 mt-1">
          {language === 'ar'
            ? 'تابع حالة طلباتك، المتاجر المجهزة، وأكواد الشحنات في الوقت الفعلي.'
            : 'Track your orders, vendor shipments, and dispatch timeline in real-time.'}
        </p>
      </div>

      {/* Direct Order ID Search Bar */}
      <div className="mb-8 p-4 sm:p-5 rounded-3xl bg-white dark:bg-[#151A23] border border-gray-200 dark:border-[#293142] shadow-sm">
        <form onSubmit={handleSearchOrder} className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <input
              type="text"
              value={searchId}
              onChange={e => setSearchId(e.target.value)}
              placeholder={language === 'ar' ? 'أدخل رقم الطلب (مثال: MS-2026-1234)...' : 'Enter Order ID (e.g. MS-2026-1234)...'}
              className="w-full h-11 ps-4 pe-10 text-xs bg-gray-50 dark:bg-[#111722] border border-gray-200 dark:border-[#293142] rounded-2xl text-gray-900 dark:text-white font-mono focus:outline-none focus:border-[#0E11B7]"
            />
            <Search className="w-4 h-4 absolute end-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          </div>

          {!user && (
            <input
              type="tel"
              value={guestPhone}
              onChange={e => setGuestPhone(e.target.value)}
              placeholder={language === 'ar' ? 'رقم الهاتف المسجل بالطلب للتحقق' : 'Registered Phone for Verification'}
              className="h-11 px-3 text-xs bg-gray-50 dark:bg-[#111722] border border-gray-200 dark:border-[#293142] rounded-2xl text-gray-900 dark:text-white sm:w-60 focus:outline-none"
            />
          )}

          <button
            type="submit"
            className="h-11 px-6 rounded-2xl bg-[#0E11B7] hover:bg-[#070A86] text-white font-bold text-xs shadow-md transition-all flex items-center justify-center gap-2 flex-shrink-0"
          >
            <span>{language === 'ar' ? 'تتبع الطلب' : 'Track Order'}</span>
          </button>
        </form>

        {guestError && (
          <div className="mt-3 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2 border border-rose-200 dark:border-rose-900">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{guestError}</span>
          </div>
        )}
      </div>

      {/* Selected Order Detailed Tracking Modal / View */}
      {selectedOrder && (
        <div className="mb-10 p-6 rounded-3xl bg-white dark:bg-[#151A23] border-2 border-[#0E11B7]/20 shadow-xl space-y-6 animate-slideDown">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-4 border-b border-gray-100 dark:border-[#293142] gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-lg sm:text-xl font-black text-[#0E11B7] dark:text-[#3B82F6]">
                  #{selectedOrder.orderId}
                </span>
                {(() => {
                  const badge = getStatusBadge(selectedOrder.status);
                  const Icon = badge.icon;
                  return (
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${badge.color}`}>
                      <Icon className="w-3.5 h-3.5" />
                      <span>{badge.label}</span>
                    </span>
                  );
                })()}
              </div>
              <p className="text-[11px] text-gray-400 mt-1">
                {new Date(selectedOrder.createdAt).toLocaleString(language === 'ar' ? 'ar-SA' : 'en-US')}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setSelectedOrder(null)}
              className="text-xs font-bold text-gray-500 hover:text-gray-900 dark:hover:text-white px-3 py-1.5 rounded-lg border border-gray-200 dark:border-[#293142]"
            >
              {language === 'ar' ? 'إغلاق التفاصيل' : 'Close Details'}
            </button>
          </div>

          {/* Stepper Timeline */}
          <div className="grid grid-cols-4 gap-2 text-center py-2">
            {[
              { id: 'pending', label: language === 'ar' ? 'تم استلام الطلب' : 'Received', active: true },
              { id: 'processing', label: language === 'ar' ? 'قيد التجهيز' : 'Preparing', active: ['processing', 'shipped', 'delivered'].includes(selectedOrder.status) },
              { id: 'shipped', label: language === 'ar' ? 'خرج للتوصيل' : 'Shipped', active: ['shipped', 'delivered'].includes(selectedOrder.status) },
              { id: 'delivered', label: language === 'ar' ? 'تم الاستلام' : 'Delivered', active: selectedOrder.status === 'delivered' },
            ].map((step, idx) => (
              <div key={step.id} className="flex flex-col items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                  step.active
                    ? 'bg-[#0E11B7] text-white shadow'
                    : 'bg-gray-100 dark:bg-[#111722] text-gray-400'
                }`}>
                  {idx + 1}
                </div>
                <span className={`text-[11px] mt-1.5 font-bold ${step.active ? 'text-gray-900 dark:text-white' : 'text-gray-400'}`}>
                  {step.label}
                </span>
              </div>
            ))}
          </div>

          {/* Vendors and Items */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-gray-900 dark:text-white">
              {language === 'ar' ? 'المتاجر والمنتجات المجهزة' : 'Stores & Ordered Items'}
            </h3>
            {selectedOrder.vendorOrders?.map(vendor => {
              const assignment = deliveryService.getAssignmentBySubOrderId(vendor.subOrderId);
              const currentDeliveryStatus = assignment?.status || ((vendor.status as string) === 'delivered' ? 'DELIVERED' : (vendor.status as string) === 'shipped' || (vendor.status as string) === 'out_for_delivery' ? 'OUT_FOR_DELIVERY' : (vendor.status as string) === 'processing' || vendor.status === 'preparing' ? 'PREPARING' : 'PENDING');
              
              const deliverySteps = [
                { key: 'PENDING', label: language === 'ar' ? 'استلام الطلب' : language === 'so' ? 'Dalabka la helay' : 'Order Placed' },
                { key: 'PREPARING', label: language === 'ar' ? 'قيد التجهيز' : language === 'so' ? 'Diyaarinta' : 'Preparing' },
                { key: 'READY', label: language === 'ar' ? 'جاهز للاستلام' : language === 'so' ? 'Diyaar ah' : 'Ready' },
                { key: 'PICKED_UP', label: language === 'ar' ? 'تم الاستلام' : language === 'so' ? 'Laga soo qaaday' : 'Picked Up' },
                { key: 'OUT_FOR_DELIVERY', label: language === 'ar' ? 'في الطريق' : language === 'so' ? 'Waddada ku jira' : 'Out for Delivery' },
                { key: 'DELIVERED', label: language === 'ar' ? 'تم التوصيل' : language === 'so' ? 'La gaarsiiyay' : 'Delivered' },
              ];

              const currentStepIndex = deliverySteps.findIndex(s => s.key === currentDeliveryStatus);
              const isFailed = currentDeliveryStatus === 'FAILED';

              return (
              <div key={vendor.subOrderId} className="p-4 rounded-2xl bg-gray-50 dark:bg-[#111722] border border-gray-200 dark:border-[#293142] space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-gray-200/60 dark:border-[#293142]">
                  <div className="flex items-center gap-2">
                    <StoreIcon className="w-4 h-4 text-[#0E11B7]" />
                    <span className="font-bold text-xs text-gray-900 dark:text-white">{vendor.storeName}</span>
                    <span className="font-mono text-[10px] text-gray-400">({vendor.subOrderId})</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {vendor.trackingNumber && (
                      <button
                        onClick={() => handleCopyTracking(vendor.trackingNumber!)}
                        className="inline-flex items-center gap-1 text-[10px] font-mono font-bold bg-gray-200/60 dark:bg-gray-800 text-gray-700 dark:text-gray-300 px-2 py-0.5 rounded hover:bg-gray-300 transition"
                        title={language === 'ar' ? 'اضغط لنسخ رقم التتبع' : 'Click to copy tracking code'}
                      >
                        {copiedCode === vendor.trackingNumber ? (
                          <Check className="w-3 h-3 text-emerald-500" />
                        ) : (
                          <Copy className="w-3 h-3 text-gray-400" />
                        )}
                        <span>{vendor.trackingNumber}</span>
                      </button>
                    )}
                    <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                      isFailed
                        ? 'bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300'
                        : 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                    }`}>
                      {currentDeliveryStatus}
                    </span>
                  </div>
                </div>

                {/* Sub-order items */}
                <div className="divide-y divide-gray-200/40 dark:divide-[#293142]">
                  {vendor.items.map(item => (
                    <div key={item.id} className="py-2.5 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-3">
                        <img
                          src={item.product?.thumbnail || item.product?.images?.[0] || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=200'}
                          alt=""
                          className="w-10 h-10 rounded-lg object-cover bg-white dark:bg-gray-800"
                        />
                        <div>
                          <p className="font-bold text-gray-900 dark:text-white">
                            {item.product?.title?.[language] || item.product?.title?.en || (typeof item.product?.title === 'string' ? item.product.title : 'Product')}
                          </p>
                          <p className="text-[10px] text-gray-500">
                            {item.quantity} × ${(Number(item.product?.price || (item as any)?.price || 0)).toFixed(2)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-gray-900 dark:text-white">
                          ${(((Number(item.product?.price || (item as any)?.price || 0)) + (item.selectedAddons?.reduce((s, a) => s + (Number(a.price) || 0), 0) || 0)) * (item.quantity || 1)).toFixed(2)}
                        </span>
                        {/* If order is delivered, allow user to review product */}
                        {(vendor.status === 'delivered' || selectedOrder.status === 'delivered' || currentDeliveryStatus === 'DELIVERED') && user && (
                          <button
                            type="button"
                            onClick={() =>
                              setReviewModalData({
                                targetType: 'product',
                                targetId: item.product?.id || item.id,
                                title: item.product?.title?.[language] || item.product?.title?.en || 'Product',
                                orderId: selectedOrder.orderId,
                              })
                            }
                            className="inline-flex items-center gap-1 text-[10px] font-bold text-[#0E11B7] dark:text-blue-400 hover:underline bg-blue-50 dark:bg-blue-950/50 px-2 py-1 rounded-lg"
                          >
                            <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                            <span>{language === 'ar' ? 'تقييم' : 'Review'}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Delivery Stepper */}
                <div className="pt-3 border-t border-gray-200/50 dark:border-[#293142] space-y-2">
                  <div className="flex items-center justify-between text-[11px] font-bold text-gray-600 dark:text-gray-400">
                    <span className="flex items-center gap-1">
                      <Truck className="w-3.5 h-3.5 text-[#0E11B7]" />
                      <span>{language === 'ar' ? 'مراحل التوصيل' : 'Delivery Progress'}</span>
                    </span>
                    {assignment?.deliveryModel && (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-gray-200/60 dark:bg-[#1E2638] text-gray-700 dark:text-gray-300">
                        {assignment.deliveryModel.replace('_', ' ')}
                      </span>
                    )}
                  </div>

                  {isFailed ? (
                    <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="font-bold">{language === 'ar' ? 'تعذر إتمام التوصيل في الموعد المحدد' : 'Delivery Attempt Failed'}</p>
                        <p className="text-[11px] mt-0.5">{assignment?.failureReason || (language === 'ar' ? 'تعذر التواصل مع العميل، سيتم إعادة المحاولة قريباً.' : 'Could not reach recipient, will re-attempt shortly.')}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 pt-1">
                      {deliverySteps.map((step, sIdx) => {
                        const isDone = currentStepIndex >= sIdx;
                        const isCurrent = currentStepIndex === sIdx;
                        return (
                          <div
                            key={step.key}
                            className={`p-2 rounded-xl text-center flex flex-col items-center justify-center transition-all ${
                              isCurrent
                                ? 'bg-[#0E11B7] text-white shadow-xs'
                                : isDone
                                ? 'bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                                : 'bg-white dark:bg-[#151A23] border border-gray-200 dark:border-[#293142] text-gray-400 opacity-60'
                            }`}
                          >
                            <div className="text-[10px] font-black">
                              {isDone && !isCurrent ? '✓' : sIdx + 1}
                            </div>
                            <span className="text-[9px] font-bold truncate max-w-full mt-0.5">
                              {step.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Courier Card if Assigned */}
                  {assignment?.driverName && (
                    <div className="mt-3 p-3 rounded-xl bg-white dark:bg-[#151A23] border border-gray-200 dark:border-[#293142] flex flex-wrap items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-950/50 text-[#0E11B7] flex items-center justify-center font-bold">
                          <UserCheck className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                            <span>{assignment.driverName}</span>
                            <span className="text-[10px] font-normal text-gray-500">
                              ({assignment.vehicleType || 'Motorbike'})
                            </span>
                          </p>
                          {assignment.vehiclePlateNumber && (
                            <p className="text-[10px] font-mono text-gray-400">
                              {assignment.vehiclePlateNumber}
                            </p>
                          )}
                        </div>
                      </div>

                      {assignment.driverPhone && (
                        <a
                          href={`tel:${assignment.driverPhone}`}
                          className="h-8 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition"
                        >
                          <Phone className="w-3.5 h-3.5" />
                          <span>{language === 'ar' ? 'اتصال بالمندوب' : 'Call Courier'}</span>
                        </a>
                      )}
                    </div>
                  )}

                  {/* Direct Contact with Seller */}
                  <div className="mt-2 flex flex-wrap items-center gap-2 pt-2 border-t border-gray-200/40 dark:border-[#293142]">
                    <span className="text-[11px] font-bold text-gray-500">
                      {language === 'ar' ? 'تواصل مع المتجر:' : 'Contact Store:'}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleContactVendor(vendor)}
                      className="h-7 px-3 rounded-lg bg-[#0E11B7]/10 hover:bg-[#0E11B7]/20 text-[#0E11B7] dark:text-blue-400 text-[11px] font-bold flex items-center gap-1 transition"
                    >
                      <MessageSquare className="w-3 h-3" />
                      <span>{language === 'ar' ? 'محادثة المتجر' : 'Chat with Store'}</span>
                    </button>
                    {vendor.sellerPhone && (
                      <>
                        <a
                          href={`https://wa.me/${vendor.sellerPhone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
                            `Salam, inquiring about sub-order #${vendor.subOrderId} on MarketSpace.`
                          )}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="h-7 px-3 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-[11px] font-bold flex items-center gap-1 transition"
                        >
                          <Phone className="w-3 h-3" />
                          <span>WhatsApp</span>
                        </a>
                        <a
                          href={`tel:${vendor.sellerPhone}`}
                          className="h-7 px-3 rounded-lg bg-gray-200/60 dark:bg-[#1E2638] text-gray-700 dark:text-gray-300 text-[11px] font-bold flex items-center gap-1 hover:bg-gray-300 transition"
                        >
                          <Phone className="w-3 h-3" />
                          <span>{language === 'ar' ? 'اتصال هاتف' : 'Call'}</span>
                        </a>
                      </>
                    )}
                  </div>
                </div>

                {/* Sub-order status history */}
                {vendor.statusHistory && vendor.statusHistory.length > 0 && (
                  <div className="pt-2 border-t border-gray-200/40 dark:border-[#293142] space-y-1">
                    <span className="text-[10px] font-bold text-gray-400 block">
                      {language === 'ar' ? 'تحديثات الشحنة المباشرة:' : 'Live Shipment Updates:'}
                    </span>
                    {vendor.statusHistory.map((hist, hIdx) => (
                      <div key={hIdx} className="text-[11px] text-gray-500 flex items-center gap-2">
                        <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                        <span className="font-bold uppercase text-gray-700 dark:text-gray-300">{hist.status}</span>
                        <span>•</span>
                        <span>{hist.note}</span>
                        <span className="text-[10px] text-gray-400 mr-auto">
                          {new Date(hist.timestamp).toLocaleTimeString(language === 'ar' ? 'ar-SA' : 'en-US')}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              );
            })}
          </div>

          {/* Delivery & Payment Info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-gray-100 dark:border-[#293142] text-xs">
            <div className="p-3 rounded-xl bg-gray-50 dark:bg-[#111722] space-y-1">
              <span className="font-bold text-gray-500 block">{language === 'ar' ? 'بيانات التوصيل' : 'Delivery Address'}</span>
              <p className="font-bold text-gray-900 dark:text-white">{selectedOrder.customerName} - {selectedOrder.phone}</p>
              <p className="text-gray-600 dark:text-gray-400">{selectedOrder.city}, {selectedOrder.address}</p>
            </div>

            <div className="p-3 rounded-xl bg-gray-50 dark:bg-[#111722] space-y-1">
              <span className="font-bold text-gray-500 block">{language === 'ar' ? 'طريقة وحالة الدفع' : 'Payment Method & Status'}</span>
              <p className="font-bold text-gray-900 dark:text-white uppercase">{selectedOrder.paymentMethod.replace(/_/g, ' ')}</p>
              <p className="text-emerald-600 font-black text-sm">${(Number(selectedOrder.total) || 0).toFixed(2)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Orders List for Authenticated User */}
      <div className="space-y-4">
        {user ? (
          <>
            {/* Filter Pills */}
            <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
              {(['all', 'pending', 'processing', 'shipped', 'delivered'] as const).map(status => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setStatusFilter(status)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap ${
                    statusFilter === status
                      ? 'bg-[#0E11B7] text-white shadow'
                      : 'bg-white dark:bg-[#151A23] text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-[#293142]'
                  }`}
                >
                  {status === 'all'
                    ? (language === 'ar' ? 'جميع الطلبات' : 'All Orders')
                    : status === 'pending'
                    ? (language === 'ar' ? 'قيد الانتظار' : 'Pending')
                    : status === 'processing'
                    ? (language === 'ar' ? 'قيد التجهيز' : 'Processing')
                    : status === 'shipped'
                    ? (language === 'ar' ? 'تم الشحن' : 'Shipped')
                    : (language === 'ar' ? 'تم التوصيل' : 'Delivered')}
                </button>
              ))}
            </div>

            {filteredOrders.length === 0 ? (
              <div className="p-12 text-center rounded-3xl bg-white dark:bg-[#151A23] border border-gray-200 dark:border-[#293142]">
                <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <h3 className="font-bold text-sm text-gray-900 dark:text-white">
                  {language === 'ar' ? 'لا توجد طلبات مسجلة حالياً' : 'No orders found'}
                </h3>
                <p className="text-xs text-gray-500 mt-1">
                  {language === 'ar' ? 'ابدأ التسوق واختر من بين آلاف المنتجات المميزة.' : 'Start shopping and discover thousands of top items.'}
                </p>
                <button
                  type="button"
                  onClick={() => onNavigate('/shop')}
                  className="mt-4 h-10 px-5 rounded-full bg-[#0E11B7] text-white font-bold text-xs"
                >
                  {language === 'ar' ? 'تصفح المتجر' : 'Browse Shop'}
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredOrders.map(order => {
                  const badge = getStatusBadge(order.status);
                  const Icon = badge.icon;
                  return (
                    <div
                      key={order.orderId}
                      onClick={() => setSelectedOrder(order)}
                      className="p-5 rounded-3xl bg-white dark:bg-[#151A23] border border-gray-200 dark:border-[#293142] hover:border-[#0E11B7] dark:hover:border-[#3B82F6] cursor-pointer shadow-xs hover:shadow-md transition-all space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-sm text-[#0E11B7] dark:text-[#3B82F6]">
                          #{order.orderId}
                        </span>
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${badge.color}`}>
                          <Icon className="w-3 h-3" />
                          <span>{badge.label}</span>
                        </span>
                      </div>

                      <div className="text-xs text-gray-500 space-y-1">
                        <p>{order.items?.length || 0} {language === 'ar' ? 'عناصر' : 'items'} • ${(Number(order.total) || 0).toFixed(2)}</p>
                        <p className="text-[10px] text-gray-400">
                          {new Date(order.createdAt).toLocaleDateString(language === 'ar' ? 'ar-SA' : 'en-US')}
                        </p>
                      </div>

                      <div className="pt-2 border-t border-gray-100 dark:border-[#293142] flex items-center justify-between text-xs font-bold text-[#0E11B7] dark:text-[#3B82F6]">
                        <span>{language === 'ar' ? 'عرض تفاصيل الشحنة' : 'View Shipment Details'}</span>
                        <ChevronRight className="w-4 h-4 rtl:rotate-180" />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          <div className="p-8 text-center rounded-3xl bg-gray-50 dark:bg-[#111722] border border-gray-200 dark:border-[#293142]">
            <ShoppingBag className="w-10 h-10 text-gray-400 mx-auto mb-2" />
            <h3 className="font-bold text-sm text-gray-900 dark:text-white">
              {language === 'ar' ? 'هل قمت بالطلب كزائر؟' : 'Placed order as a guest?'}
            </h3>
            <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">
              {language === 'ar'
                ? 'استخدم خانة البحث أعلاه وأدخل رقم الطلب ورقم هاتفك المسجل لعرض تفاصيل شحنتك فوراً وبكل أمان.'
                : 'Use the search box above with your Order ID and phone number to track your shipment safely.'}
            </p>
          </div>
        )}
      </div>

      {/* Product / Store Review Modal */}
      {reviewModalData && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white dark:bg-[#151A23] rounded-3xl max-w-md w-full p-6 border border-gray-200 dark:border-[#293142] shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-gray-900 dark:text-white">
                  {language === 'ar' ? 'تقييم تجربة الشراء' : 'Rate Your Purchase'}
                </h3>
                <p className="text-xs text-gray-500 font-medium truncate max-w-[280px]">
                  {reviewModalData.title}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReviewModalData(null)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitReview} className="space-y-4">
              {/* Star selector */}
              <div>
                <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block mb-1">
                  {language === 'ar' ? 'درجة التقييم' : 'Your Rating'}
                </label>
                <div className="flex items-center gap-1.5">
                  {[1, 2, 3, 4, 5].map(star => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setReviewRating(star)}
                      className="p-1 transition-transform hover:scale-110"
                    >
                      <Star
                        className={`w-7 h-7 ${
                          star <= reviewRating
                            ? 'text-amber-500 fill-amber-500'
                            : 'text-gray-300 dark:text-gray-600'
                        }`}
                      />
                    </button>
                  ))}
                  <span className="text-xs font-bold text-amber-500 ms-2">
                    {reviewRating} / 5
                  </span>
                </div>
              </div>

              {/* Comment text */}
              <div>
                <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block mb-1">
                  {language === 'ar' ? 'تعليقك وتجربتك بالتفصيل' : 'Your Review & Feedback'}
                </label>
                <textarea
                  rows={3}
                  required
                  value={reviewComment}
                  onChange={e => setReviewComment(e.target.value)}
                  placeholder={
                    language === 'ar'
                      ? 'شارك رأيك حول جودة المنتج، سرعة التوصيل والخدمة...'
                      : 'Share your thoughts on product quality, shipping and service...'
                  }
                  className="w-full text-xs p-3 rounded-xl border border-gray-200 dark:border-[#293142] bg-gray-50 dark:bg-[#111722] text-gray-900 dark:text-white focus:outline-hidden focus:border-[#0E11B7]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setReviewModalData(null)}
                  className="h-10 px-4 rounded-xl text-xs font-bold text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  {language === 'ar' ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingReview || !reviewComment.trim()}
                  className="h-10 px-5 rounded-xl bg-[#0E11B7] text-white font-bold text-xs shadow hover:bg-blue-800 transition disabled:opacity-50"
                >
                  {isSubmittingReview
                    ? (language === 'ar' ? 'جاري الإرسال...' : 'Submitting...')
                    : (language === 'ar' ? 'إرسال التقييم' : 'Submit Review')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
