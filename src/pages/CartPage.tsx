import React, { useState, useEffect } from 'react';
import {
  Trash2,
  ShoppingBag,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  CreditCard,
  Phone,
  MapPin,
  Sparkles,
  Store as StoreIcon,
  AlertCircle,
  Package,
  Copy,
  Check,
  Home,
  Briefcase,
  Bookmark,
  Tag,
  Percent,
} from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { OrderDetails, SavedAddress } from '../types';
import { orderService } from '../services/orderService';
import { paymentService, PaymentMethodType } from '../services/paymentService';
import { addressService } from '../services/addressService';
import { couponService } from '../services/couponService';

interface CartPageProps {
  onNavigate: (path: string) => void;
}

export const CartPage: React.FC<CartPageProps> = ({ onNavigate }) => {
  const { language, t, isRTL } = useLanguage();
  const {
    items,
    updateQuantity,
    removeItem,
    clearCart,
    subtotal,
    shipping,
    discount,
    grandTotal,
    appliedCoupon,
    setAppliedCoupon,
    totalItems,
    pricingDetails,
  } = useCart();
  const { user } = useAuth();

  // Coupon state
  const [couponInput, setCouponInput] = useState('');
  const [couponError, setCouponError] = useState<string | null>(null);

  const handleApplyCoupon = () => {
    if (!couponInput.trim()) return;
    const res = couponService.validateCoupon({
      code: couponInput.trim(),
      customerId: user?.id,
      items,
      subtotal,
    });
    if (!res.isValid) {
      setCouponError(
        res.errorReason ||
          (language === 'ar'
            ? 'كوبون الخصم غير صالح أو منتهي الصلاحية'
            : language === 'so'
            ? 'Koodhka dhimista ma shaqeynayo'
            : 'Coupon code is invalid or expired')
      );
      return;
    }
    setCouponError(null);
    setAppliedCoupon(res.coupon?.code || couponInput.trim().toUpperCase());
    setCouponInput('');
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setCouponError(null);
  };

  // Saved Addresses State
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string>('new');
  const [saveThisAddress, setSaveThisAddress] = useState(false);
  const [addressLabel, setAddressLabel] = useState<'HOME' | 'WORK' | 'OTHER'>('HOME');
  const [district, setDistrict] = useState('');
  const [landmark, setLandmark] = useState('');

  // Checkout form states
  const [fullName, setFullName] = useState((user as any)?.displayName || user?.name || '');
  const [phone, setPhone] = useState((user as any)?.phoneNumber || user?.phone || '');
  const [email, setEmail] = useState(user?.email || '');
  const [city, setCity] = useState('Mogadishu');
  const [address, setAddress] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodType>('evc_plus');
  const [senderPhone, setSenderPhone] = useState('');
  const [transactionRef, setTransactionRef] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [completedOrder, setCompletedOrder] = useState<OrderDetails | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);

  // Load saved addresses for authenticated customer
  useEffect(() => {
    if (user?.id) {
      addressService.getUserAddresses(user.id).then(list => {
        setSavedAddresses(list);
        const def = list.find(a => a.isDefault) || list[0];
        if (def) {
          setSelectedAddressId(def.id);
          setFullName(def.recipientName);
          setPhone(def.phone);
          setCity(def.city);
          setDistrict(def.district || '');
          setAddress(def.address);
          setLandmark(def.landmark || '');
          if (def.deliveryNotes) setNotes(def.deliveryNotes);
        }
      });
    }
  }, [user]);

  const handleSelectSavedAddress = (addrId: string) => {
    setSelectedAddressId(addrId);
    if (addrId === 'new') {
      setFullName((user as any)?.displayName || user?.name || '');
      setPhone((user as any)?.phoneNumber || user?.phone || '');
      setAddress('');
      setDistrict('');
      setLandmark('');
      return;
    }

    const target = savedAddresses.find(a => a.id === addrId);
    if (target) {
      setFullName(target.recipientName);
      setPhone(target.phone);
      setCity(target.city);
      setDistrict(target.district || '');
      setAddress(target.address);
      setLandmark(target.landmark || '');
      if (target.deliveryNotes) setNotes(target.deliveryNotes);
    }
  };

  const isMobilePayment = paymentMethod === 'evc_plus' || paymentMethod === 'zaad' || paymentMethod === 'sahall';

  const getUSSDInstruction = () => {
    const amt = (Number(grandTotal) || 0).toFixed(2);
    switch (paymentMethod) {
      case 'evc_plus':
        return { code: `*712*612494953*${amt}#`, merchant: 'Hormuud: 612494953' };
      case 'zaad':
        return { code: `*220*634455667*${amt}#`, merchant: 'Telesom: 634455667' };
      case 'sahall':
        return { code: `*880*907788990*${amt}#`, merchant: 'Golis: 907788990' };
      default:
        return null;
    }
  };

  const handleCopyUSSD = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleCheckoutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCheckoutError(null);

    if (!fullName.trim() || !phone.trim() || !address.trim()) {
      setCheckoutError(
        language === 'ar'
          ? 'يرجى ملء جميع الحقول الإلزامية: الاسم الكامل، رقم الهاتف، وعنوان التوصيل.'
          : language === 'so'
          ? 'Fadlan buuxi meelaha loo baahan yahay: Magaca, Telefoonka, iyo Cinwaanka.'
          : 'Please complete all required fields: Full Name, Phone Number, and Delivery Address.'
      );
      return;
    }

    if (paymentMethod === 'card') {
      setCheckoutError(
        language === 'ar'
          ? 'الدفع بالبطاقة المصرفية متوقف مؤقتاً للتكامل مع بوابة PCI. يرجى اختيار الدفع عند الاستلام أو التحويل عبر الجوال.'
          : language === 'so'
          ? 'Kaarka bangiga hadda ma shaqeynayo. Fadlan dooro EVC, Zaad, Sahal ama lacag bixinta marka la helo.'
          : 'Card payments are temporarily unavailable awaiting gateway certification. Please select Cash on Delivery or Mobile Money.'
      );
      return;
    }

    setIsSubmitting(true);

    try {
      // Server-authoritative order creation
      const order = await orderService.createMultiVendorOrder({
        customerName: fullName.trim(),
        phone: phone.trim(),
        email: email.trim() || undefined,
        city: city.trim(),
        address: `${address.trim()}${district.trim() ? ` - ${district.trim()}` : ''}${landmark.trim() ? ` (${landmark.trim()})` : ''}`,
        paymentMethod,
        notes: notes.trim() || undefined,
        items: [...items],
        customerId: user?.id,
        couponCode: appliedCoupon || undefined,
      });

      // Automatically save address if user requested
      if (user?.id && saveThisAddress && selectedAddressId === 'new') {
        try {
          await addressService.createAddress({
            userId: user.id,
            label: addressLabel,
            recipientName: fullName.trim(),
            phone: phone.trim(),
            city: city.trim(),
            district: district.trim() || undefined,
            address: address.trim(),
            landmark: landmark.trim() || undefined,
            deliveryNotes: notes.trim() || undefined,
            isDefault: savedAddresses.length === 0,
          });
        } catch (addrErr) {
          console.warn('Address auto-save notice:', addrErr);
        }
      }

      // Submit mobile payment reference if customer entered one
      if (isMobilePayment && transactionRef.trim()) {
        try {
          await paymentService.submitPaymentReference({
            orderId: order.orderId,
            customerId: user?.id || 'guest_customer',
            method: paymentMethod as 'evc_plus' | 'zaad' | 'sahall',
            amount: order.total,
            referenceNumber: transactionRef.trim(),
            senderPhone: senderPhone.trim() || phone.trim(),
          });
        } catch (subErr) {
          console.warn('Payment reference submission noted for later admin sync:', subErr);
        }
      }

      setCompletedOrder(order);
      clearCart();
    } catch (err: any) {
      console.error('Checkout error:', err);
      setCheckoutError(err.message || 'Failed to place order. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 1. Success Screen
  if (completedOrder) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center animate-fadeIn">
        <div className="p-8 sm:p-10 rounded-3xl bg-white dark:bg-[#151A23] border border-gray-200 dark:border-[#293142] shadow-xl space-y-6">
          <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 mx-auto flex items-center justify-center">
            <CheckCircle2 className="w-9 h-9" />
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white">
              {t('orderSuccessTitle')}
            </h1>
            <p className="text-sm text-gray-500 max-w-md mx-auto">
              {t('orderSuccessDesc')}
            </p>
            <div className="inline-block px-5 py-2.5 rounded-2xl bg-[#EEF2FF] dark:bg-[#0E11B7]/20 border border-[#0E11B7]/30 text-[#0E11B7] dark:text-[#3B82F6] font-black text-xl tracking-wider">
              {completedOrder.orderId}
            </div>
          </div>

          {/* Receipt Summary */}
          <div className="p-4 rounded-2xl bg-gray-50 dark:bg-[#111722] text-start text-xs space-y-2.5 border border-gray-200 dark:border-[#293142]">
            <div className="flex justify-between">
              <span className="text-gray-500">{t('fullName')}:</span>
              <span className="font-bold text-gray-900 dark:text-white">{completedOrder.customerName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">{t('phoneNumber')}:</span>
              <span className="font-bold text-gray-900 dark:text-white">{completedOrder.phone}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">{t('city')}:</span>
              <span className="font-bold text-gray-900 dark:text-white">{completedOrder.city}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">{t('paymentMethod')}:</span>
              <span className="font-bold text-gray-900 dark:text-white uppercase">{completedOrder.paymentMethod.replace(/_/g, ' ')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">{language === 'ar' ? 'حالة الدفع' : 'Payment Status'}:</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-400">
                {language === 'ar' ? 'قيد المراجعة / عند الاستلام' : 'Pending Verification'}
              </span>
            </div>

            {/* Multi-Vendor Breakdown */}
            {completedOrder.vendorOrders && completedOrder.vendorOrders.length > 0 && (
              <div className="pt-3 border-t border-gray-200 dark:border-[#293142]">
                <span className="font-bold text-gray-700 dark:text-gray-300 block mb-2">
                  {language === 'ar' ? `المتاجر المجهزة للطلب (${completedOrder.vendorOrders.length}):` : `Order Stores (${completedOrder.vendorOrders.length}):`}
                </span>
                <div className="space-y-2">
                  {completedOrder.vendorOrders.map(sub => (
                    <div key={sub.subOrderId} className="p-2.5 rounded-xl bg-white dark:bg-[#151A23] border border-gray-200 dark:border-[#293142] flex justify-between items-center">
                      <div>
                        <div className="flex items-center gap-1.5 font-bold text-gray-900 dark:text-white">
                          <StoreIcon className="w-3.5 h-3.5 text-[#0E11B7] dark:text-blue-400" />
                          <span>{sub.storeName}</span>
                        </div>
                        <span className="text-[10px] text-gray-400">
                          {sub.items.length} {language === 'ar' ? 'أصناف' : 'items'} • {language === 'ar' ? 'شحن' : 'Shipping'}: ${(Number(sub.deliveryFee) || 0).toFixed(2)} • #{sub.subOrderId}
                        </span>
                      </div>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">
                        ${(Number(sub.total) || 0).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {completedOrder.discount !== undefined && completedOrder.discount > 0 && (
              <div className="flex justify-between text-emerald-600 dark:text-emerald-400 font-bold pt-1">
                <span className="flex items-center gap-1">
                  <Tag className="w-3.5 h-3.5" />
                  <span>{language === 'ar' ? 'الخصم المطبق' : 'Discount'} ({completedOrder.couponCode}):</span>
                </span>
                <span>-${(Number(completedOrder.discount) || 0).toFixed(2)}</span>
              </div>
            )}

            <div className="flex justify-between pt-2.5 border-t border-gray-200 dark:border-[#293142] text-sm font-black">
              <span>{t('total')}:</span>
              <span className="text-[#0E11B7] dark:text-white">${(Number(completedOrder.total) || 0).toFixed(2)}</span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
            <button
              type="button"
              onClick={() => onNavigate(`/orders/${completedOrder.orderId}`)}
              className="h-12 px-6 rounded-full bg-[#0E11B7] hover:bg-[#070A86] text-white font-extrabold text-xs shadow-md transition-all flex items-center justify-center gap-2"
            >
              <Package className="w-4 h-4" />
              <span>{language === 'ar' ? 'تتبع حالة هذا الطلب' : language === 'so' ? 'Raadi dalabka' : 'Track This Order'}</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('/shop')}
              className="h-12 px-6 rounded-full border border-gray-300 dark:border-[#293142] hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-800 dark:text-gray-200 font-bold text-xs transition-all"
            >
              {language === 'ar' ? 'متابعة التسوق' : language === 'so' ? 'Sii wad wax iibsiga' : 'Continue Shopping'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 2. Empty Cart View
  if (items.length === 0) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center animate-fadeIn space-y-4">
        <div className="w-20 h-20 rounded-full bg-gray-100 dark:bg-[#111722] text-gray-400 flex items-center justify-center mx-auto">
          <ShoppingBag className="w-10 h-10" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">{t('emptyCart')}</h2>
        <p className="text-xs text-gray-500">{t('emptyCartDesc') || 'لم تقم بإضافة أي منتجات لسلة المشتريات حتى الآن.'}</p>
        <button
          type="button"
          onClick={() => onNavigate('/shop')}
          className="h-11 px-6 rounded-full bg-[#0E11B7] hover:bg-[#070A86] text-white font-bold text-xs shadow transition-all"
        >
          {language === 'ar' ? 'ابدأ التسوق الآن' : language === 'so' ? 'Bilow wax iibsiga' : 'Start Shopping'}
        </button>
      </div>
    );
  }

  const ussdInfo = getUSSDInstruction();

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fadeIn">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white">
            {t('cart')}
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            {totalItems} {language === 'ar' ? 'منتج' : 'items'} {language === 'ar' ? 'في سلتك' : 'in your cart'}
          </p>
        </div>
        <button
          type="button"
          onClick={clearCart}
          className="text-xs font-bold text-rose-600 hover:text-rose-700 flex items-center gap-1.5 p-2 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/20"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>{t('clearCart')}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Side: Items List grouped by Vendor */}
        <div className="lg:col-span-7 space-y-6">
          {pricingDetails.storeBreakdownList.map((storeGroup) => (
            <div
              key={storeGroup.storeId}
              className="p-4 sm:p-5 rounded-3xl bg-white dark:bg-[#151A23] border border-gray-200 dark:border-[#293142] shadow-sm space-y-4"
            >
              {/* Store Header */}
              <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-[#293142]">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-[#EEF2FF] dark:bg-[#0E11B7]/20 flex items-center justify-center text-[#0E11B7] dark:text-[#3B82F6]">
                    <StoreIcon className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                      {storeGroup.storeName}
                    </h3>
                    <p className="text-[10px] text-gray-500">
                      {(Number(storeGroup.deliveryFee) || 0) === 0 ? (
                        <span className="text-emerald-600 font-bold">{language === 'ar' ? 'توصيل مجاني لهذا المتجر' : 'Free store delivery'}</span>
                      ) : (
                        `${language === 'ar' ? 'رسوم التوصيل' : 'Delivery'}: $${(Number(storeGroup.deliveryFee) || 0).toFixed(2)}`
                      )}
                    </p>
                  </div>
                </div>
                <span className="text-xs font-bold text-gray-700 dark:text-gray-300">
                  ${(Number(storeGroup.subtotal) || 0).toFixed(2)}
                </span>
              </div>

              {/* Items */}
              <div className="divide-y divide-gray-100 dark:divide-[#293142]">
                {storeGroup.items.map(item => (
                  <div key={item.id} className="py-3 flex gap-3 sm:gap-4 items-center">
                    <img
                      src={item.product?.thumbnail || item.product?.images?.[0] || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=200'}
                      alt=""
                      className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl object-cover bg-gray-50 dark:bg-[#111722] flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <h4 className="text-xs sm:text-sm font-bold text-gray-900 dark:text-white truncate">
                        {item.product?.title?.[language] || item.product?.title?.en || (typeof item.product?.title === 'string' ? item.product.title : 'Product')}
                      </h4>
                      <div className="flex flex-wrap gap-2 text-[11px] text-gray-500 mt-1">
                        {item.selectedColor && (
                          <span className="px-2 py-0.5 rounded-md bg-gray-100 dark:bg-[#111722]">
                            {item.selectedColor}
                          </span>
                        )}
                        {item.selectedSize && (
                          <span className="px-2 py-0.5 rounded-md bg-gray-100 dark:bg-[#111722]">
                            {item.selectedSize}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center justify-between mt-2">
                        <div className="flex items-center gap-2 border border-gray-200 dark:border-[#293142] rounded-full p-1 bg-gray-50 dark:bg-[#111722]">
                          <button
                            type="button"
                            onClick={() => updateQuantity(item.id, item.quantity - 1)}
                            className="w-6 h-6 rounded-full bg-white dark:bg-[#151A23] text-gray-700 dark:text-gray-300 flex items-center justify-center text-xs font-bold shadow-xs hover:bg-gray-100"
                          >
                            -
                          </button>
                          <span className="text-xs font-bold px-2 text-gray-900 dark:text-white">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => updateQuantity(item.id, item.quantity + 1)}
                            className="w-6 h-6 rounded-full bg-white dark:bg-[#151A23] text-gray-700 dark:text-gray-300 flex items-center justify-center text-xs font-bold shadow-xs hover:bg-gray-100"
                          >
                            +
                          </button>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs sm:text-sm font-black text-[#0E11B7] dark:text-white">
                            ${(((Number(item.product?.price || 0)) + (item.selectedAddons?.reduce((s, a) => s + (Number(a.price) || 0), 0) || 0)) * (item.quantity || 1)).toFixed(2)}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeItem(item.id)}
                            className="text-gray-400 hover:text-rose-600 p-1"
                            title={language === 'ar' ? 'حذف' : 'Remove'}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Free shipping banner if applicable */}
          {pricingDetails.remainingForFreeShipping > 0 ? (
            <div className="p-3.5 rounded-2xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 text-xs text-blue-800 dark:text-blue-300 flex items-center justify-between">
              <span>{language === 'ar' ? `أضف بقيمة $${pricingDetails.remainingForFreeShipping} للحصول على شحن مجاني للمتجر!` : `Add $${pricingDetails.remainingForFreeShipping} more for free shipping!`}</span>
              <button
                type="button"
                onClick={() => onNavigate('/shop')}
                className="font-black text-[#0E11B7] dark:text-[#3B82F6] hover:underline"
              >
                {language === 'ar' ? 'تسوق المزيد' : 'Shop More'}
              </button>
            </div>
          ) : (
            <div className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>{language === 'ar' ? 'مبارك! طلبك مؤهل للشحن المجاني.' : 'Congratulations! Your order qualifies for free delivery.'}</span>
            </div>
          )}
        </div>

        {/* Right Side: Authoritative Checkout Form */}
        <div className="lg:col-span-5 space-y-6">
          <form
            onSubmit={handleCheckoutSubmit}
            className="p-5 sm:p-6 rounded-3xl bg-white dark:bg-[#151A23] border border-gray-200 dark:border-[#293142] shadow-sm space-y-5"
          >
            <h2 className="text-lg font-black text-gray-900 dark:text-white pb-3 border-b border-gray-100 dark:border-[#293142]">
              {t('checkoutTitle')}
            </h2>

            {checkoutError && (
              <div className="p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{checkoutError}</span>
              </div>
            )}

            {/* Coupon / Promo Code Input */}
            <div className="p-3.5 rounded-2xl bg-gray-50 dark:bg-[#111722] border border-gray-200 dark:border-[#293142] space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-gray-800 dark:text-gray-200 flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5 text-[#0E11B7] dark:text-[#3B82F6]" />
                  <span>{language === 'ar' ? 'كود الخصم / بروموكود' : language === 'so' ? 'Koodhka dhimista' : 'Promo Code'}</span>
                </span>
                {appliedCoupon && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">
                    {language === 'ar' ? 'مطبق بنجاح' : 'Applied'}
                  </span>
                )}
              </div>

              {appliedCoupon ? (
                <div className="flex items-center justify-between p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/40 text-xs">
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span className="font-mono font-bold text-emerald-900 dark:text-emerald-200 uppercase">
                      {appliedCoupon}
                    </span>
                    <span className="text-emerald-600 dark:text-emerald-400 text-[11px]">
                      (-${(Number(discount) || 0).toFixed(2)})
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleRemoveCoupon}
                    className="text-[11px] font-bold text-rose-600 hover:text-rose-700 hover:underline"
                  >
                    {language === 'ar' ? 'إزالة' : 'Remove'}
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={couponInput}
                    onChange={e => {
                      setCouponInput(e.target.value.toUpperCase());
                      if (couponError) setCouponError(null);
                    }}
                    placeholder={language === 'ar' ? 'MOGADISHU10 أو WELCOME5' : 'e.g. MOGADISHU10'}
                    className="flex-1 h-9 px-3 text-xs bg-white dark:bg-[#151A23] border border-gray-200 dark:border-[#293142] rounded-xl text-gray-900 dark:text-white uppercase font-mono tracking-wider focus:outline-none focus:border-[#0E11B7]"
                  />
                  <button
                    type="button"
                    onClick={handleApplyCoupon}
                    disabled={!couponInput.trim()}
                    className="h-9 px-4 rounded-xl bg-[#0E11B7] hover:bg-[#070A86] text-white font-bold text-xs disabled:opacity-40 transition-all"
                  >
                    {language === 'ar' ? 'تطبيق' : 'Apply'}
                  </button>
                </div>
              )}

              {couponError && (
                <p className="text-[11px] text-rose-600 dark:text-rose-400 font-medium">
                  {couponError}
                </p>
              )}
            </div>

            {/* Price Calculations */}
            <div className="space-y-2 text-xs">
              <div className="flex justify-between text-gray-600 dark:text-gray-400">
                <span>{t('subtotal')}</span>
                <span className="font-bold text-gray-900 dark:text-white">${(Number(subtotal) || 0).toFixed(2)}</span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between text-emerald-600 dark:text-emerald-400 font-bold">
                  <span className="flex items-center gap-1">
                    <Percent className="w-3 h-3" />
                    <span>{language === 'ar' ? 'خصم الكوبون' : 'Coupon Discount'} ({appliedCoupon})</span>
                  </span>
                  <span>-${(Number(discount) || 0).toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-gray-600 dark:text-gray-400">
                <span>{t('shipping')}</span>
                <span className="font-bold text-gray-900 dark:text-white">
                  {(Number(shipping) || 0) === 0 ? <span className="text-emerald-600 font-black">{t('freeShipping')}</span> : `$${(Number(shipping) || 0).toFixed(2)}`}
                </span>
              </div>
              <div className="flex justify-between text-base font-black text-gray-950 dark:text-white pt-2 border-t border-gray-100 dark:border-[#293142]">
                <span>{t('total')}</span>
                <span className="text-[#0E11B7] dark:text-white">${(Number(grandTotal) || 0).toFixed(2)}</span>
              </div>
            </div>

            {/* Customer Inputs & Address Management */}
            <div className="space-y-3 pt-2">
              {/* Saved Address Quick Selector for logged-in users */}
              {user && savedAddresses.length > 0 && (
                <div className="p-3.5 rounded-2xl bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/50 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                      <Bookmark className="w-3.5 h-3.5 text-[#0E11B7]" />
                      <span>{t('selectSavedAddress')}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => handleSelectSavedAddress('new')}
                      className="text-[11px] font-bold text-[#0E11B7] dark:text-[#3B82F6] hover:underline"
                    >
                      + {t('orEnterNewAddress')}
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {savedAddresses.map(addr => {
                      const isSelected = selectedAddressId === addr.id;
                      return (
                        <div
                          key={addr.id}
                          onClick={() => handleSelectSavedAddress(addr.id)}
                          className={`p-2.5 rounded-xl border text-xs cursor-pointer transition-all ${
                            isSelected
                              ? 'bg-white dark:bg-[#151A23] border-[#0E11B7] ring-1 ring-[#0E11B7] shadow-xs'
                              : 'bg-white/70 dark:bg-[#151A23]/60 border-gray-200 dark:border-[#293142] hover:border-gray-300'
                          }`}
                        >
                          <div className="flex items-center justify-between font-bold text-gray-900 dark:text-white">
                            <span className="flex items-center gap-1">
                              {addr.label === 'HOME' && <Home className="w-3 h-3 text-[#0E11B7]" />}
                              {addr.label === 'WORK' && <Briefcase className="w-3 h-3 text-indigo-600" />}
                              {addr.label === 'OTHER' && <MapPin className="w-3 h-3 text-gray-500" />}
                              <span>{addr.recipientName}</span>
                            </span>
                            {addr.isDefault && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
                                {t('setAsDefaultAddress')}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-gray-500 truncate mt-1">
                            {addr.city}, {addr.district ? `${addr.district}, ` : ''}{addr.address}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                  {t('fullName')} *
                </label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  placeholder="محمد أحمد عثمان"
                  className="w-full h-10 px-3 text-xs bg-gray-50 dark:bg-[#111722] border border-gray-200 dark:border-[#293142] rounded-xl text-gray-900 dark:text-white focus:outline-none focus:border-[#0E11B7]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                  {t('phoneNumber')} *
                </label>
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="+252 61..."
                  className="w-full h-10 px-3 text-xs bg-gray-50 dark:bg-[#111722] border border-gray-200 dark:border-[#293142] rounded-xl text-gray-900 dark:text-white focus:outline-none focus:border-[#0E11B7]"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                    {t('city')}
                  </label>
                  <select
                    value={city}
                    onChange={e => setCity(e.target.value)}
                    className="w-full h-10 px-3 text-xs bg-gray-50 dark:bg-[#111722] border border-gray-200 dark:border-[#293142] rounded-xl text-gray-900 dark:text-white"
                  >
                    <option value="Mogadishu">Mogadishu (مقديشو)</option>
                    <option value="Hargeisa">Hargeisa (هرجيسا)</option>
                    <option value="Kismayo">Kismayo (كسمايو)</option>
                    <option value="Garowe">Garowe (غاروي)</option>
                    <option value="Baidoa">Baidoa (بيدوا)</option>
                    <option value="International">International</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                    {t('district')}
                  </label>
                  <input
                    type="text"
                    value={district}
                    onChange={e => setDistrict(e.target.value)}
                    placeholder="حي هودن / حي وابري..."
                    className="w-full h-10 px-3 text-xs bg-gray-50 dark:bg-[#111722] border border-gray-200 dark:border-[#293142] rounded-xl text-gray-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                  {t('deliveryAddress')} *
                </label>
                <input
                  type="text"
                  required
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                  placeholder="شارع مكة المكرمة، قرب مستشفى بنادر..."
                  className="w-full h-10 px-3 text-xs bg-gray-50 dark:bg-[#111722] border border-gray-200 dark:border-[#293142] rounded-xl text-gray-900 dark:text-white focus:outline-none focus:border-[#0E11B7]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                  {t('landmark')}
                </label>
                <input
                  type="text"
                  value={landmark}
                  onChange={e => setLandmark(e.target.value)}
                  placeholder="بجوار مجمع النور / خلف فندق مكة..."
                  className="w-full h-10 px-3 text-xs bg-gray-50 dark:bg-[#111722] border border-gray-200 dark:border-[#293142] rounded-xl text-gray-900 dark:text-white"
                />
              </div>

              {/* Option to save address for future orders */}
              {user && selectedAddressId === 'new' && (
                <div className="p-3 rounded-2xl bg-gray-50 dark:bg-[#111722] border border-gray-200 dark:border-[#293142] space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={saveThisAddress}
                      onChange={e => setSaveThisAddress(e.target.checked)}
                      className="rounded text-[#0E11B7] focus:ring-[#0E11B7]"
                    />
                    <span className="text-xs font-bold text-gray-800 dark:text-gray-200">
                      {t('saveAddress')}
                    </span>
                  </label>

                  {saveThisAddress && (
                    <div className="flex items-center gap-2 pt-1">
                      <span className="text-[11px] text-gray-500 font-bold">{language === 'ar' ? 'نوع العنوان:' : 'Type:'}</span>
                      {(['HOME', 'WORK', 'OTHER'] as const).map(lbl => (
                        <button
                          key={lbl}
                          type="button"
                          onClick={() => setAddressLabel(lbl)}
                          className={`px-3 py-1 rounded-full text-[11px] font-bold transition-all ${
                            addressLabel === lbl
                              ? 'bg-[#0E11B7] text-white'
                              : 'bg-white dark:bg-[#151A23] border border-gray-200 dark:border-[#293142] text-gray-600 dark:text-gray-300'
                          }`}
                        >
                          {lbl === 'HOME' ? t('labelHome') : lbl === 'WORK' ? t('labelWork') : t('labelOther')}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Payment Methods Selection */}
              <div className="space-y-2 pt-2">
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300">
                  {t('paymentMethod')}
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  {[
                    { id: 'evc_plus', label: t('evcPlus') || 'EVC Plus', disabled: false },
                    { id: 'zaad', label: t('zaadService') || 'Zaad Service', disabled: false },
                    { id: 'sahall', label: 'Sahal (Golis)', disabled: false },
                    { id: 'cash_on_delivery', label: t('cashOnDelivery') || 'الدفع عند الاستلام', disabled: false },
                    { id: 'card', label: 'بطاقة مصرفية (Visa/Master)', disabled: true },
                  ].map(m => (
                    <label
                      key={m.id}
                      className={`relative flex items-center justify-between p-2.5 rounded-xl border transition-all ${
                        m.disabled
                          ? 'border-gray-200 dark:border-[#293142] bg-gray-50 dark:bg-[#111722] opacity-60 cursor-not-allowed'
                          : paymentMethod === m.id
                          ? 'border-[#0E11B7] bg-[#EEF2FF] dark:bg-[#0E11B7]/20 text-[#0E11B7] dark:text-white font-bold cursor-pointer'
                          : 'border-gray-200 dark:border-[#293142] text-gray-700 dark:text-gray-300 cursor-pointer'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="paymentMethod"
                          value={m.id}
                          disabled={m.disabled}
                          checked={paymentMethod === m.id}
                          onChange={() => !m.disabled && setPaymentMethod(m.id as PaymentMethodType)}
                          className="text-[#0E11B7] focus:ring-0"
                        />
                        <span className="truncate">{m.label}</span>
                      </div>
                      {m.disabled && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300">
                          {language === 'ar' ? 'قريباً' : 'Soon'}
                        </span>
                      )}
                    </label>
                  ))}
                </div>
              </div>

              {/* USSD and Mobile Payment Reference Details */}
              {isMobilePayment && ussdInfo && (
                <div className="p-3.5 rounded-2xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 space-y-3 animate-fadeIn">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-amber-900 dark:text-amber-300">
                      {language === 'ar' ? 'كود التحويل السريع (USSD):' : 'Fast Transfer USSD Code:'}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopyUSSD(ussdInfo.code)}
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-[#0E11B7] dark:text-[#3B82F6] hover:underline"
                    >
                      {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedCode ? (language === 'ar' ? 'تم النسخ' : 'Copied') : (language === 'ar' ? 'نسخ الكود' : 'Copy')}</span>
                    </button>
                  </div>

                  <div className="p-2 rounded-xl bg-white dark:bg-[#151A23] border border-amber-200/80 dark:border-amber-900/60 text-center font-mono font-black text-sm text-[#0E11B7] dark:text-amber-300 tracking-wider select-all">
                    {ussdInfo.code}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-bold text-gray-700 dark:text-gray-300 mb-1">
                        {language === 'ar' ? 'رقم الهاتف المحول منه' : 'Sender Phone'}
                      </label>
                      <input
                        type="tel"
                        value={senderPhone}
                        onChange={e => setSenderPhone(e.target.value)}
                        placeholder={phone || '+252 61...'}
                        className="w-full h-9 px-2.5 text-xs bg-white dark:bg-[#151A23] border border-gray-200 dark:border-[#293142] rounded-xl text-gray-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-gray-700 dark:text-gray-300 mb-1">
                        {language === 'ar' ? 'رقم عملية التحويل (Reference / SMS)' : 'Transaction Ref No'}
                      </label>
                      <input
                        type="text"
                        value={transactionRef}
                        onChange={e => setTransactionRef(e.target.value)}
                        placeholder="TRX-123456"
                        className="w-full h-9 px-2.5 text-xs bg-white dark:bg-[#151A23] border border-gray-200 dark:border-[#293142] rounded-xl text-gray-900 dark:text-white"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                  {language === 'ar' ? 'ملاحظات إضافية للتوصيل' : 'Delivery Notes (Optional)'}
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder={language === 'ar' ? 'أي تعليمات خاصة بالسائق أو التوصيل...' : 'Special courier instructions...'}
                  className="w-full p-2.5 text-xs bg-gray-50 dark:bg-[#111722] border border-gray-200 dark:border-[#293142] rounded-xl text-gray-900 dark:text-white"
                />
              </div>
            </div>

            {/* Confirm Submit */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full h-12 rounded-2xl bg-[#0E11B7] hover:bg-[#070A86] text-white font-black text-sm flex items-center justify-center gap-2 shadow-lg shadow-[#0E11B7]/20 transition-all disabled:opacity-50"
            >
              <ShieldCheck className="w-5 h-5" />
              <span>{isSubmitting ? (language === 'ar' ? 'جاري تأكيد وتأمين الطلب...' : 'Securing Order...') : `${t('placeOrder')} ($${(Number(grandTotal) || 0).toFixed(2)})`}</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
