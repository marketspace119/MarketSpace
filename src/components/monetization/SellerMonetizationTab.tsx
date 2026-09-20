import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Award,
  TrendingUp,
  Zap,
  CheckCircle2,
  Clock,
  DollarSign,
  ArrowUpRight,
  ShieldCheck,
  AlertCircle,
  Copy,
  Check,
  Tag,
  Store as StoreIcon,
  HelpCircle,
  Percent,
} from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import { Store, Product } from '../../types';
import {
  SellerPlan,
  SellerSubscription,
  PromotionRequest,
  RefundRequest,
  CommissionPolicy,
} from '../../types/monetization';
import { subscriptionService } from '../../services/subscriptionService';
import { promotionService } from '../../services/promotionService';
import { commissionService } from '../../services/commissionService';
import { refundService } from '../../services/refundService';
import { platformSettingsService } from '../../services/platformSettingsService';

interface SellerMonetizationTabProps {
  store: Store | null;
  sellerId: string;
  products: Product[];
  onNavigateTab?: (tab: string) => void;
}

export const SellerMonetizationTab: React.FC<SellerMonetizationTabProps> = ({
  store,
  sellerId,
  products,
  onNavigateTab,
}) => {
  const { language, isRtl } = useLanguage();
  const [plans, setPlans] = useState<SellerPlan[]>([]);
  const [activeSub, setActiveSub] = useState<SellerSubscription | null>(null);
  const [pendingSub, setPendingSub] = useState<SellerSubscription | null>(null);
  const [promotions, setPromotions] = useState<PromotionRequest[]>([]);
  const [refunds, setRefunds] = useState<RefundRequest[]>([]);
  const [effectiveCommission, setEffectiveCommission] = useState<{
    effectiveRate: number;
    baseRate: number;
    source: string;
  }>({ effectiveRate: 10, baseRate: 10, source: 'global' });

  const [isLoading, setIsLoading] = useState(true);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Upgrade Plan Modal
  const [selectedPlanToUpgrade, setSelectedPlanToUpgrade] = useState<SellerPlan | null>(null);
  const [upgradePaymentMethod, setUpgradePaymentMethod] = useState<'evc_plus' | 'zaad' | 'sahall'>('evc_plus');
  const [upgradeRefNumber, setUpgradeRefNumber] = useState('');
  const [upgradePhone, setUpgradePhone] = useState('');
  const [isSubmittingUpgrade, setIsSubmittingUpgrade] = useState(false);

  // Promotion Request Modal
  const [isPromoModalOpen, setIsPromoModalOpen] = useState(false);
  const [promoProductId, setPromoProductId] = useState(products[0]?.id || '');
  const [promoPlacement, setPromoPlacement] = useState<'home_hero' | 'category_top' | 'search_boost'>('category_top');
  const [promoDurationDays, setPromoDurationDays] = useState<7 | 14 | 30>(7);
  const [promoPaymentMethod, setPromoPaymentMethod] = useState<'evc_plus' | 'zaad' | 'sahall'>('evc_plus');
  const [promoRefNumber, setPromoRefNumber] = useState('');
  const [promoPhone, setPromoPhone] = useState('');
  const [isSubmittingPromo, setIsSubmittingPromo] = useState(false);

  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const settings = platformSettingsService.getSettings();

  const loadData = () => {
    setIsLoading(true);
    try {
      const allPlans = subscriptionService.getPlans();
      setPlans(allPlans);

      const sub = subscriptionService.getSellerActiveSubscription(sellerId);
      setActiveSub(sub);

      const allSubs = subscriptionService.getAllSubscriptions();
      const pending = allSubs.find(s => s.sellerId === sellerId && s.status === 'PENDING_PAYMENT') || null;
      setPendingSub(pending);

      const myPromos = promotionService.getSellerPromotionRequests(sellerId);
      setPromotions(myPromos);

      const allRefunds = refundService.getRefundRequests();
      const myRefunds = allRefunds.filter(r => r.sellerId === sellerId);
      setRefunds(myRefunds);

      const comm = commissionService.resolveRate({
        sellerId,
        storeId: store?.id,
        sellerType: store?.sellerType || 'store',
      });
      setEffectiveCommission(comm);
    } catch (err: any) {
      console.error('Failed loading monetization data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [sellerId, store?.id]);

  const handleCopyUSSD = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2500);
  };

  const handleUpgradeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlanToUpgrade) return;
    if (!upgradeRefNumber.trim()) {
      setActionError(language === 'ar' ? 'يرجى إدخال رقم عملية التحويل' : 'Please provide the transaction reference number');
      return;
    }

    setIsSubmittingUpgrade(true);
    setActionError(null);
    try {
      await subscriptionService.requestSubscriptionUpgrade({
        sellerId,
        storeId: store?.id,
        planId: selectedPlanToUpgrade.id,
        paymentMethod: upgradePaymentMethod,
        paymentReferenceNumber: upgradeRefNumber.trim(),
        senderPhone: upgradePhone.trim(),
      });
      setActionSuccess(
        language === 'ar'
          ? 'تم تقديم طلب ترقية الخطة بنجاح. سيتم تفعيلها فور مراجعة التحويل من الإدارة.'
          : 'Plan upgrade submitted. It will activate immediately upon payment verification.'
      );
      setSelectedPlanToUpgrade(null);
      setUpgradeRefNumber('');
      loadData();
    } catch (err: any) {
      setActionError(err.message || 'Failed to submit plan upgrade');
    } finally {
      setIsSubmittingUpgrade(false);
    }
  };

  const handlePromotionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!promoProductId) {
      setActionError(language === 'ar' ? 'يرجى اختيار المنتج المراد ترويجه' : 'Please select a product');
      return;
    }
    if (!promoRefNumber.trim()) {
      setActionError(language === 'ar' ? 'يرجى إدخال رقم عملية التحويل' : 'Please enter payment reference');
      return;
    }

    setIsSubmittingPromo(true);
    setActionError(null);
    try {
      const chosenProduct = products.find(p => p.id === promoProductId);
      await promotionService.requestPromotion({
        sellerId,
        storeId: store?.id,
        productId: promoProductId,
        productTitle: chosenProduct?.title[language] || chosenProduct?.title.en || 'Product',
        productImage: chosenProduct?.thumbnail || chosenProduct?.images[0],
        placement: promoPlacement,
        durationDays: promoDurationDays,
        paymentMethod: promoPaymentMethod,
        paymentReferenceNumber: promoRefNumber.trim(),
        senderPhone: promoPhone.trim(),
      });
      setActionSuccess(
        language === 'ar'
          ? 'تم إرسال طلب ترويج المنتج بنجاح، بانتظار اعتماد الدفع من الإدارة.'
          : 'Product promotion requested successfully. Awaiting payment verification.'
      );
      setIsPromoModalOpen(false);
      setPromoRefNumber('');
      loadData();
    } catch (err: any) {
      setActionError(err.message || 'Failed to submit promotion');
    } finally {
      setIsSubmittingPromo(false);
    }
  };

  const getUSSDCode = (method: 'evc_plus' | 'zaad' | 'sahall', amount: number) => {
    const merchant =
      method === 'evc_plus'
        ? settings.evcPlusMerchantNumber
        : method === 'zaad'
        ? settings.zaadMerchantNumber
        : settings.sahalMerchantNumber;
    const cleanMerchant = merchant ? merchant.replace(/[^0-9]/g, '') : '612494952';
    if (method === 'evc_plus') return `*712*${cleanMerchant}*${Math.round(amount)}#`;
    if (method === 'zaad') return `*220*${cleanMerchant}*${Math.round(amount)}#`;
    return `*880*${cleanMerchant}*${Math.round(amount)}#`;
  };

  const currentPlan = plans.find(p => p.id === (activeSub?.planId || 'plan_free')) || plans[0];

  const estimatedPromoCost = () => {
    const baseDaily = promoPlacement === 'home_hero' ? 2.5 : promoPlacement === 'category_top' ? 1.5 : 0.8;
    return Number((baseDaily * promoDurationDays).toFixed(2));
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header & Status Banner */}
      <div className="p-6 rounded-3xl bg-gradient-to-r from-blue-900 via-indigo-900 to-[#0E11B7] text-white shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-60 h-60 bg-white/10 rounded-full blur-2xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md text-xs font-bold text-blue-200">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span>{language === 'ar' ? 'محرك نمو وأرباح المتاجر' : 'Store Growth & Monetization Engine'}</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black">
              {language === 'ar' ? 'الخطط، العمولات والترويج' : 'Seller Plans, Commissions & Promotions'}
            </h2>
            <p className="text-xs sm:text-sm text-blue-100 max-w-xl">
              {language === 'ar'
                ? 'ارتقِ بمتجرك عبر باقات الاشتراك المميزة، خفّض نسبة العمولة المفروضة على مبيعاتك، وقم بترويج منتجاتك في واجهة المنصة.'
                : 'Boost your sales with premium seller tiers, enjoy reduced marketplace commissions, and feature your products in prime spots.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setIsPromoModalOpen(true)}
              className="h-11 px-5 rounded-2xl bg-amber-400 hover:bg-amber-300 text-gray-950 font-black text-xs shadow-lg transition-all flex items-center gap-2"
            >
              <Sparkles className="w-4 h-4" />
              <span>{language === 'ar' ? 'ترويج منتج الآن' : 'Promote a Product'}</span>
            </button>
          </div>
        </div>
      </div>

      {actionSuccess && (
        <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>{actionSuccess}</span>
          </div>
          <button type="button" onClick={() => setActionSuccess(null)} className="text-emerald-700 hover:underline">
            {language === 'ar' ? 'إغلاق' : 'Dismiss'}
          </button>
        </div>
      )}

      {actionError && (
        <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600" />
            <span>{actionError}</span>
          </div>
          <button type="button" onClick={() => setActionError(null)} className="text-rose-700 hover:underline">
            {language === 'ar' ? 'إغلاق' : 'Dismiss'}
          </button>
        </div>
      )}

      {/* KPI Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Current Plan */}
        <div className="p-5 rounded-3xl bg-white dark:bg-[#151A23] border border-gray-200 dark:border-[#293142] shadow-xs space-y-3">
          <div className="flex items-center justify-between text-gray-500 text-xs">
            <span className="font-bold">{language === 'ar' ? 'الخطة الحالية' : 'Active Plan'}</span>
            <Award className="w-4 h-4 text-[#0E11B7] dark:text-blue-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-black text-gray-900 dark:text-white">
              {currentPlan?.name[language] || currentPlan?.name.en || 'Starter'}
            </span>
            <span className="text-xs text-emerald-600 font-bold">
              {currentPlan?.priceMonthly === 0 ? (language === 'ar' ? 'مجانية' : 'Free') : `$${currentPlan?.priceMonthly}/mo`}
            </span>
          </div>
          <div className="text-[11px] text-gray-500 flex items-center justify-between">
            <span>{language === 'ar' ? 'حد المنتجات النشطة' : 'Listing Limit'}:</span>
            <span className="font-bold text-gray-800 dark:text-gray-200">
              {products.length} / {currentPlan?.listingLimit === -1 ? '∞' : currentPlan?.listingLimit}
            </span>
          </div>
        </div>

        {/* Effective Commission */}
        <div className="p-5 rounded-3xl bg-white dark:bg-[#151A23] border border-gray-200 dark:border-[#293142] shadow-xs space-y-3">
          <div className="flex items-center justify-between text-gray-500 text-xs">
            <span className="font-bold">{language === 'ar' ? 'نسبة العمولة المطبقة' : 'Effective Commission'}</span>
            <Percent className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
              {effectiveCommission.effectiveRate}%
            </span>
            {effectiveCommission.effectiveRate < 10 && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">
                {language === 'ar' ? 'مخفضة' : 'Discounted'}
              </span>
            )}
          </div>
          <p className="text-[11px] text-gray-400">
            {effectiveCommission.source === 'seller_specific'
              ? language === 'ar' ? 'مخصصة لمتجرك خصيصاً' : 'Store VIP rate'
              : effectiveCommission.source === 'seller_type'
              ? language === 'ar' ? 'حسب نوع نشاطك التجاري' : 'Category tier rate'
              : language === 'ar' ? 'المعدل القياسي للمنصة (10%)' : 'Platform standard (10%)'}
          </p>
        </div>

        {/* Active Promotions */}
        <div className="p-5 rounded-3xl bg-white dark:bg-[#151A23] border border-gray-200 dark:border-[#293142] shadow-xs space-y-3">
          <div className="flex items-center justify-between text-gray-500 text-xs">
            <span className="font-bold">{language === 'ar' ? 'المنتجات المروجة' : 'Active Promos'}</span>
            <Sparkles className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-black text-gray-900 dark:text-white">
            {promotions.filter(p => p.status === 'APPROVED' || p.status === 'ACTIVE').length}
          </div>
          <p className="text-[11px] text-gray-400">
            {promotions.filter(p => p.status === 'PENDING_PAYMENT').length > 0
              ? `${promotions.filter(p => p.status === 'PENDING_PAYMENT').length} ${language === 'ar' ? 'بانتظار مراجعة التحويل' : 'pending verification'}`
              : language === 'ar' ? 'ظهور مميز في الصفحة الأولى' : 'Top page visibility'}
          </p>
        </div>

        {/* Refund Liabilities */}
        <div className="p-5 rounded-3xl bg-white dark:bg-[#151A23] border border-gray-200 dark:border-[#293142] shadow-xs space-y-3">
          <div className="flex items-center justify-between text-gray-500 text-xs">
            <span className="font-bold">{language === 'ar' ? 'تسويات الاسترجاع' : 'Refunds Settled'}</span>
            <ShieldCheck className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="text-2xl font-black text-gray-900 dark:text-white">
            {refunds.length}
          </div>
          <p className="text-[11px] text-gray-400">
            ${refunds.reduce((acc, r) => acc + (r.status === 'APPROVED' ? Number((r as any).refundAmount ?? (r as any).amount ?? 0) : 0), 0).toFixed(2)}{' '}
            {language === 'ar' ? 'مخصومة من الأرصدة' : 'reconciled'}
          </p>
        </div>
      </div>

      {/* Pending Subscription Alert */}
      {pendingSub && (
        <div className="p-4 rounded-3xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-100 dark:bg-amber-900/40 text-amber-600 flex items-center justify-center flex-shrink-0">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs sm:text-sm font-bold text-amber-900 dark:text-amber-200">
                {language === 'ar' ? 'طلب ترقية الخطة قيد المراجعة' : 'Subscription Upgrade Pending Approval'}
              </h4>
              <p className="text-[11px] text-amber-700 dark:text-amber-400">
                {language === 'ar'
                  ? `تم تقديم التحويل برقم العملية (${pendingSub.paymentReferenceNumber || 'N/A'}) - سيتم تفعيل الخطة فور مطابقة التحويل.`
                  : `Payment submitted (Ref: ${pendingSub.paymentReferenceNumber || 'N/A'}). Admin verification in progress.`}
              </p>
            </div>
          </div>
          <span className="text-xs font-bold px-3 py-1 rounded-full bg-amber-200 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
            ${pendingSub.amountPaid} / {pendingSub.paymentMethod.toUpperCase()}
          </span>
        </div>
      )}

      {/* Available Plans Grid */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-black text-gray-900 dark:text-white">
              {language === 'ar' ? 'باقات اشتراك التجار والشركاء' : 'Merchant Subscription Tiers'}
            </h3>
            <p className="text-xs text-gray-500">
              {language === 'ar'
                ? 'اختر الخطة المناسبة لحجم أعمالك للتمتع بخصومات على العمولات ومزايا تسويقية إضافية.'
                : 'Select the tier that fits your sales volume to maximize margins with discounted fees.'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {plans.map((p) => {
            const isCurrent = (activeSub?.planId || 'plan_free') === p.id;
            return (
              <div
                key={p.id}
                className={`p-6 rounded-3xl bg-white dark:bg-[#151A23] border transition-all relative flex flex-col justify-between ${
                  isCurrent
                    ? 'border-[#0E11B7] ring-2 ring-[#0E11B7]/20 shadow-md'
                    : p.id === 'plan_pro'
                    ? 'border-indigo-300 dark:border-indigo-800/60 shadow-sm'
                    : 'border-gray-200 dark:border-[#293142]'
                }`}
              >
                {p.id === 'plan_pro' && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-[#0E11B7] text-white text-[10px] font-black uppercase tracking-wider shadow">
                    {language === 'ar' ? 'الأكثر طلباً' : 'Most Popular'}
                  </div>
                )}

                <div className="space-y-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="text-base font-black text-gray-900 dark:text-white">
                        {p.name[language] || p.name.en}
                      </h4>
                      <p className="text-xs text-gray-500 mt-1">
                        {p.description[language] || p.description.en}
                      </p>
                    </div>
                    {isCurrent && (
                      <span className="px-2.5 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-[10px] font-black">
                        {language === 'ar' ? 'نشطة الآن' : 'Active'}
                      </span>
                    )}
                  </div>

                  <div className="flex items-baseline gap-1 pt-2 border-t border-gray-100 dark:border-[#293142]">
                    <span className="text-3xl font-black text-gray-900 dark:text-white">
                      ${p.priceMonthly}
                    </span>
                    <span className="text-xs text-gray-500">
                      / {language === 'ar' ? 'شهرياً' : 'month'}
                    </span>
                  </div>

                  <div className="space-y-2 text-xs pt-2">
                    <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                      <Check className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                      <span>
                        {p.listingLimit === -1
                          ? language === 'ar' ? 'منتجات غير محدودة' : 'Unlimited listings'
                          : `${language === 'ar' ? 'حتى' : 'Up to'} ${p.listingLimit} ${language === 'ar' ? 'منتج معروض' : 'active listings'}`}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                      <Check className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                      <span>
                        {p.commissionDiscountPercent > 0
                          ? `${language === 'ar' ? 'خصم' : 'Discount'} ${p.commissionDiscountPercent}% ${language === 'ar' ? 'على عمولة المبيعات' : 'off commission'}`
                          : language === 'ar' ? 'العمولة القياسية للمنصة' : 'Standard commission'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                      <Check className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                      <span>
                        {p.featuredProductsCount > 0
                          ? `${p.featuredProductsCount} ${language === 'ar' ? 'منتجات مميزة شهرياً' : 'featured products / mo'}`
                          : language === 'ar' ? 'لا يشمل منتجات مميزة' : 'Standard catalog sorting'}
                      </span>
                    </div>

                    {p.prioritySupport && (
                      <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                        <Check className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                        <span>{language === 'ar' ? 'دعم مباشر وإدارة حساب مخصصة' : 'Dedicated merchant manager'}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="pt-6">
                  {isCurrent ? (
                    <button
                      type="button"
                      disabled
                      className="w-full h-10 rounded-xl bg-gray-100 dark:bg-[#111722] text-gray-400 font-bold text-xs cursor-default"
                    >
                      {language === 'ar' ? 'خطتك الحالية' : 'Current Plan'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setSelectedPlanToUpgrade(p)}
                      className="w-full h-10 rounded-xl bg-[#0E11B7] hover:bg-[#070A86] text-white font-black text-xs transition-all flex items-center justify-center gap-1.5 shadow-sm"
                    >
                      <span>{language === 'ar' ? 'الترقية لهذه الباقة' : 'Upgrade to Plan'}</span>
                      <ArrowUpRight className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Promotions & Boosts Queue */}
      <div className="space-y-4 pt-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-black text-gray-900 dark:text-white">
              {language === 'ar' ? 'حملات الترويج والظهور المميز' : 'Promotion & Ad Campaigns'}
            </h3>
            <p className="text-xs text-gray-500">
              {language === 'ar'
                ? 'متابعة حالة ترويج منتجاتك في الواجهة وتصدر نتائج البحث.'
                : 'Track the status and performance of your boosted listings across MarketSpace.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsPromoModalOpen(true)}
            className="h-9 px-4 rounded-xl border border-gray-200 dark:border-[#293142] hover:bg-gray-50 dark:hover:bg-[#111722] text-xs font-bold text-gray-800 dark:text-gray-200 flex items-center gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>{language === 'ar' ? 'طلب ترويج جديد' : 'New Promotion'}</span>
          </button>
        </div>

        {promotions.length === 0 ? (
          <div className="p-8 rounded-3xl bg-white dark:bg-[#151A23] border border-gray-200 dark:border-[#293142] text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-600 flex items-center justify-center mx-auto">
              <Sparkles className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-bold text-gray-900 dark:text-white">
              {language === 'ar' ? 'لا توجد حملات ترويجية حتى الآن' : 'No active promotions yet'}
            </h4>
            <p className="text-xs text-gray-500 max-w-sm mx-auto">
              {language === 'ar'
                ? 'زد من مبيعاتك عبر تثبيت منتجاتك في صدارة التصنيفات أو واجهة المنصة الرئيسية.'
                : 'Accelerate orders by pinning your top items to category headers or the home hero carousel.'}
            </p>
            <button
              type="button"
              onClick={() => setIsPromoModalOpen(true)}
              className="h-9 px-4 rounded-xl bg-[#0E11B7] hover:bg-[#070A86] text-white font-bold text-xs"
            >
              {language === 'ar' ? 'ابدأ أول ترويج' : 'Promote Your First Item'}
            </button>
          </div>
        ) : (
          <div className="rounded-3xl bg-white dark:bg-[#151A23] border border-gray-200 dark:border-[#293142] overflow-hidden">
            <div className="divide-y divide-gray-100 dark:divide-[#293142]">
              {promotions.map((promo) => (
                <div key={promo.id} className="p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    {promo.productImage ? (
                      <img
                        src={promo.productImage}
                        alt=""
                        className="w-12 h-12 rounded-xl object-cover bg-gray-100 dark:bg-[#111722]"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-gray-100 dark:bg-[#111722] flex items-center justify-center text-gray-400">
                        <Tag className="w-5 h-5" />
                      </div>
                    )}
                    <div>
                      <h4 className="text-xs sm:text-sm font-bold text-gray-900 dark:text-white">
                        {typeof promo.productTitle === 'string' ? promo.productTitle : (promo.productTitle?.[language] || promo.productTitle?.en || '')}
                      </h4>
                      <div className="flex items-center gap-2 text-[11px] text-gray-500 mt-0.5">
                        <span className="font-semibold text-[#0E11B7] dark:text-blue-400">
                          {promo.placement === 'home_hero'
                            ? language === 'ar' ? 'واجهة المنصة (Hero)' : 'Home Hero'
                            : promo.placement === 'category_top'
                            ? language === 'ar' ? 'صدارة التصنيف' : 'Category Header'
                            : language === 'ar' ? 'أعلى نتائج البحث' : 'Search Boost'}
                        </span>
                        <span>•</span>
                        <span>{promo.durationDays} {language === 'ar' ? 'يوم' : 'days'}</span>
                        <span>•</span>
                        <span>${promo.cost.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 self-end sm:self-center">
                    {promo.status === 'PENDING_PAYMENT' && (
                      <span className="px-3 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        <span>{language === 'ar' ? 'بانتظار التحقق من الدفع' : 'Pending Verification'}</span>
                      </span>
                    )}
                    {promo.status === 'ACTIVE' && (
                      <span className="px-3 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>{language === 'ar' ? 'نشط الآن' : 'Active'}</span>
                      </span>
                    )}
                    {promo.status === 'EXPIRED' && (
                      <span className="px-3 py-1 rounded-full text-[11px] font-bold bg-gray-100 text-gray-600 dark:bg-[#111722] dark:text-gray-400">
                        {language === 'ar' ? 'منتهي' : 'Expired'}
                      </span>
                    )}
                    {promo.status === 'REJECTED' && (
                      <span className="px-3 py-1 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300">
                        {language === 'ar' ? 'مرفوض' : 'Rejected'}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Plan Upgrade Modal */}
      {selectedPlanToUpgrade && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div className="w-full max-w-lg rounded-3xl bg-white dark:bg-[#151A23] border border-gray-200 dark:border-[#293142] p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-[#293142]">
              <div>
                <h3 className="text-base font-black text-gray-900 dark:text-white">
                  {language === 'ar' ? 'تأكيد ترقية خطة التاجر' : 'Confirm Plan Upgrade'}
                </h3>
                <p className="text-xs text-gray-500">
                  {selectedPlanToUpgrade.name[language] || selectedPlanToUpgrade.name.en} • ${selectedPlanToUpgrade.priceMonthly}/mo
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPlanToUpgrade(null)}
                className="w-8 h-8 rounded-full bg-gray-100 dark:bg-[#111722] flex items-center justify-center text-gray-500 hover:text-gray-900"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUpgradeSubmit} className="space-y-4 text-xs">
              {/* Manual Mobile Money Instructions */}
              <div className="p-3.5 rounded-2xl bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/50 space-y-2">
                <span className="font-bold text-blue-900 dark:text-blue-200 block">
                  {language === 'ar' ? 'تعليمات الدفع المباشر عبر الموبايل:' : 'Direct Mobile Transfer Instructions:'}
                </span>
                <p className="text-[11px] text-blue-800 dark:text-blue-300">
                  {language === 'ar'
                    ? `قم بتحويل مبلغ $${selectedPlanToUpgrade.priceMonthly} عبر الخدمة المختارة ثم أدخل رقم العملية أدناه:`
                    : `Transfer $${selectedPlanToUpgrade.priceMonthly} using your selected mobile provider and input the reference code:`}
                </p>
                <div className="flex items-center justify-between p-2 rounded-xl bg-white dark:bg-[#151A23] border border-blue-200 dark:border-blue-900/60">
                  <span className="font-mono font-black text-sm text-[#0E11B7] dark:text-blue-300">
                    {getUSSDCode(upgradePaymentMethod, selectedPlanToUpgrade.priceMonthly)}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopyUSSD(getUSSDCode(upgradePaymentMethod, selectedPlanToUpgrade.priceMonthly))}
                    className="flex items-center gap-1 text-[11px] font-bold text-[#0E11B7] dark:text-blue-400 hover:underline"
                  >
                    {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedCode ? (language === 'ar' ? 'تم النسخ' : 'Copied') : (language === 'ar' ? 'نسخ' : 'Copy')}</span>
                  </button>
                </div>
              </div>

              {/* Payment Method Selector */}
              <div className="space-y-1.5">
                <label className="font-bold text-gray-700 dark:text-gray-300 block">
                  {language === 'ar' ? 'طريقة التحويل' : 'Payment Service'}
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'evc_plus', label: 'EVC Plus' },
                    { id: 'zaad', label: 'Zaad Service' },
                    { id: 'sahall', label: 'Sahal (Golis)' },
                  ].map(m => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setUpgradePaymentMethod(m.id as any)}
                      className={`p-2 rounded-xl border text-center font-bold text-xs transition-all ${
                        upgradePaymentMethod === m.id
                          ? 'border-[#0E11B7] bg-[#EEF2FF] dark:bg-[#0E11B7]/20 text-[#0E11B7] dark:text-white'
                          : 'border-gray-200 dark:border-[#293142] text-gray-700 dark:text-gray-300'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Transaction Reference */}
              <div className="space-y-1.5">
                <label className="font-bold text-gray-700 dark:text-gray-300 block">
                  {language === 'ar' ? 'رقم عملية التحويل (Reference Number / SMS) *' : 'Transaction Reference / SMS Code *'}
                </label>
                <input
                  type="text"
                  required
                  value={upgradeRefNumber}
                  onChange={e => setUpgradeRefNumber(e.target.value)}
                  placeholder="TRX-987654"
                  className="w-full h-10 px-3 text-xs bg-gray-50 dark:bg-[#111722] border border-gray-200 dark:border-[#293142] rounded-xl text-gray-900 dark:text-white font-mono"
                />
              </div>

              {/* Sender Phone */}
              <div className="space-y-1.5">
                <label className="font-bold text-gray-700 dark:text-gray-300 block">
                  {language === 'ar' ? 'رقم الهاتف المحول منه' : 'Sender Phone Number'}
                </label>
                <input
                  type="tel"
                  value={upgradePhone}
                  onChange={e => setUpgradePhone(e.target.value)}
                  placeholder="+252 61..."
                  className="w-full h-10 px-3 text-xs bg-gray-50 dark:bg-[#111722] border border-gray-200 dark:border-[#293142] rounded-xl text-gray-900 dark:text-white"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedPlanToUpgrade(null)}
                  className="flex-1 h-11 rounded-xl border border-gray-200 dark:border-[#293142] font-bold text-gray-700 dark:text-gray-300"
                >
                  {language === 'ar' ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingUpgrade}
                  className="flex-1 h-11 rounded-xl bg-[#0E11B7] hover:bg-[#070A86] text-white font-black disabled:opacity-50 transition-all flex items-center justify-center gap-1.5"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>{isSubmittingUpgrade ? (language === 'ar' ? 'جاري الإرسال...' : 'Submitting...') : (language === 'ar' ? 'تأكيد وإرسال للمراجعة' : 'Submit for Review')}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Promote Product Modal */}
      {isPromoModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div className="w-full max-w-lg rounded-3xl bg-white dark:bg-[#151A23] border border-gray-200 dark:border-[#293142] p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-[#293142]">
              <div>
                <h3 className="text-base font-black text-gray-900 dark:text-white">
                  {language === 'ar' ? 'طلب ترويج منتج في المنصة' : 'Promote a Marketplace Product'}
                </h3>
                <p className="text-xs text-gray-500">
                  {language === 'ar' ? 'ضاعف ظهور ومبيعات منتجاتك في الصفحة الأولى' : 'Boost product views and rank on prime positions'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsPromoModalOpen(false)}
                className="w-8 h-8 rounded-full bg-gray-100 dark:bg-[#111722] flex items-center justify-center text-gray-500 hover:text-gray-900"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handlePromotionSubmit} className="space-y-4 text-xs">
              {/* Product Selection */}
              <div className="space-y-1.5">
                <label className="font-bold text-gray-700 dark:text-gray-300 block">
                  {language === 'ar' ? 'اختر المنتج المراد ترويجه *' : 'Select Product *'}
                </label>
                <select
                  value={promoProductId}
                  onChange={e => setPromoProductId(e.target.value)}
                  className="w-full h-10 px-3 text-xs bg-gray-50 dark:bg-[#111722] border border-gray-200 dark:border-[#293142] rounded-xl text-gray-900 dark:text-white"
                >
                  {products.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.title[language] || p.title.en} (${p.price})
                    </option>
                  ))}
                </select>
              </div>

              {/* Placement */}
              <div className="space-y-1.5">
                <label className="font-bold text-gray-700 dark:text-gray-300 block">
                  {language === 'ar' ? 'موضع الظهور الترويجي' : 'Ad Placement Slot'}
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'category_top', label: language === 'ar' ? 'صدارة التصنيف' : 'Category Top', price: '$1.50/day' },
                    { id: 'home_hero', label: language === 'ar' ? 'واجهة المنصة' : 'Home Hero', price: '$2.50/day' },
                    { id: 'search_boost', label: language === 'ar' ? 'أعلى البحث' : 'Search Boost', price: '$0.80/day' },
                  ].map(slot => (
                    <button
                      key={slot.id}
                      type="button"
                      onClick={() => setPromoPlacement(slot.id as any)}
                      className={`p-2.5 rounded-xl border text-center transition-all ${
                        promoPlacement === slot.id
                          ? 'border-[#0E11B7] bg-[#EEF2FF] dark:bg-[#0E11B7]/20 text-[#0E11B7] dark:text-white font-bold'
                          : 'border-gray-200 dark:border-[#293142] text-gray-700 dark:text-gray-300'
                      }`}
                    >
                      <div className="truncate text-xs">{slot.label}</div>
                      <div className="text-[10px] text-gray-400 mt-0.5">{slot.price}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Duration */}
              <div className="space-y-1.5">
                <label className="font-bold text-gray-700 dark:text-gray-300 block">
                  {language === 'ar' ? 'مدة الترويج' : 'Duration'}
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { days: 7, label: language === 'ar' ? '7 أيام' : '7 Days' },
                    { days: 14, label: language === 'ar' ? '14 يوم' : '14 Days' },
                    { days: 30, label: language === 'ar' ? '30 يوم' : '30 Days' },
                  ].map(d => (
                    <button
                      key={d.days}
                      type="button"
                      onClick={() => setPromoDurationDays(d.days as any)}
                      className={`h-9 rounded-xl border font-bold transition-all ${
                        promoDurationDays === d.days
                          ? 'border-[#0E11B7] bg-[#0E11B7] text-white'
                          : 'border-gray-200 dark:border-[#293142] text-gray-700 dark:text-gray-300'
                      }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Cost Summary & USSD */}
              <div className="p-3.5 rounded-2xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 space-y-2">
                <div className="flex justify-between items-center text-xs font-bold text-amber-900 dark:text-amber-200">
                  <span>{language === 'ar' ? 'التكلفة الإجمالية للترويج:' : 'Total Promotion Cost:'}</span>
                  <span className="text-base text-[#0E11B7] dark:text-amber-300">${estimatedPromoCost()}</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded-xl bg-white dark:bg-[#151A23] border border-amber-200 dark:border-amber-900/60">
                  <span className="font-mono font-black text-xs text-[#0E11B7] dark:text-amber-300">
                    {getUSSDCode(promoPaymentMethod, estimatedPromoCost())}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopyUSSD(getUSSDCode(promoPaymentMethod, estimatedPromoCost()))}
                    className="flex items-center gap-1 text-[11px] font-bold text-[#0E11B7] dark:text-blue-400 hover:underline"
                  >
                    {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedCode ? (language === 'ar' ? 'تم النسخ' : 'Copied') : (language === 'ar' ? 'نسخ' : 'Copy')}</span>
                  </button>
                </div>
              </div>

              {/* Payment Method */}
              <div className="space-y-1.5">
                <label className="font-bold text-gray-700 dark:text-gray-300 block">
                  {language === 'ar' ? 'طريقة التحويل' : 'Payment Method'}
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {['evc_plus', 'zaad', 'sahall'].map(m => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setPromoPaymentMethod(m as any)}
                      className={`p-2 rounded-xl border text-center font-bold text-xs capitalize ${
                        promoPaymentMethod === m
                          ? 'border-[#0E11B7] bg-[#EEF2FF] dark:bg-[#0E11B7]/20 text-[#0E11B7] dark:text-white'
                          : 'border-gray-200 dark:border-[#293142] text-gray-700 dark:text-gray-300'
                      }`}
                    >
                      {m.replace('_', ' ')}
                    </button>
                  ))}
                </div>
              </div>

              {/* Reference */}
              <div className="space-y-1.5">
                <label className="font-bold text-gray-700 dark:text-gray-300 block">
                  {language === 'ar' ? 'رقم عملية التحويل (Reference Number / SMS) *' : 'Transaction Reference / SMS Ref *'}
                </label>
                <input
                  type="text"
                  required
                  value={promoRefNumber}
                  onChange={e => setPromoRefNumber(e.target.value)}
                  placeholder="TRX-554433"
                  className="w-full h-10 px-3 text-xs bg-gray-50 dark:bg-[#111722] border border-gray-200 dark:border-[#293142] rounded-xl text-gray-900 dark:text-white font-mono"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsPromoModalOpen(false)}
                  className="flex-1 h-11 rounded-xl border border-gray-200 dark:border-[#293142] font-bold text-gray-700 dark:text-gray-300"
                >
                  {language === 'ar' ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingPromo}
                  className="flex-1 h-11 rounded-xl bg-[#0E11B7] hover:bg-[#070A86] text-white font-black disabled:opacity-50 transition-all flex items-center justify-center gap-1.5"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>{isSubmittingPromo ? (language === 'ar' ? 'جاري الإرسال...' : 'Submitting...') : (language === 'ar' ? 'إرسال طلب الترويج' : 'Submit Promo')}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
