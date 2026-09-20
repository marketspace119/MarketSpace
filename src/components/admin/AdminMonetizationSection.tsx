import React, { useState, useEffect } from 'react';
import {
  DollarSign,
  TrendingUp,
  Percent,
  Sparkles,
  Award,
  Tag,
  ShieldCheck,
  CheckCircle2,
  Clock,
  XCircle,
  Plus,
  Search,
  Filter,
  AlertCircle,
  Calendar,
  Layers,
  Check,
  X,
  ExternalLink,
  ChevronDown,
  RefreshCw,
} from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import {
  SellerPlan,
  SellerSubscription,
  PromotionRequest,
  Coupon,
  RefundRequest,
  CommissionPolicy,
  CommissionPolicyRule,
} from '../../types/monetization';
import { subscriptionService } from '../../services/subscriptionService';
import { promotionService } from '../../services/promotionService';
import { couponService } from '../../services/couponService';
import { refundService } from '../../services/refundService';
import { commissionService } from '../../services/commissionService';
import { monetizationService } from '../../services/monetizationService';

export const AdminMonetizationSection: React.FC = () => {
  const { language, isRtl } = useLanguage();
  const { user } = useAuth();
  const [activeSubTab, setActiveSubTab] = useState<
    'overview' | 'subscriptions' | 'promotions' | 'commissions' | 'coupons' | 'refunds'
  >('overview');

  const [isLoading, setIsLoading] = useState(true);
  const [financialMetrics, setFinancialMetrics] = useState<any>(null);

  // Subscriptions State
  const [subscriptions, setSubscriptions] = useState<SellerSubscription[]>([]);
  const [plans, setPlans] = useState<SellerPlan[]>([]);

  // Promotions State
  const [promotions, setPromotions] = useState<PromotionRequest[]>([]);

  // Commission Policies
  const [policies, setPolicies] = useState<CommissionPolicyRule[]>([]);
  const [isAddPolicyModalOpen, setIsAddPolicyModalOpen] = useState(false);
  const [newPolicyType, setNewPolicyType] = useState<'GLOBAL' | 'SELLER_TYPE' | 'CATEGORY'>('CATEGORY');
  const [newPolicyTarget, setNewPolicyTarget] = useState('');
  const [newPolicyRate, setNewPolicyRate] = useState(8);

  // Coupons State
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [isCreateCouponOpen, setIsCreateCouponOpen] = useState(false);
  const [newCouponCode, setNewCouponCode] = useState('');
  const [newCouponType, setNewCouponType] = useState<'percentage' | 'fixed'>('percentage');
  const [newCouponValue, setNewCouponValue] = useState(10);
  const [newCouponMinOrder, setNewCouponMinOrder] = useState(20);
  const [newCouponMaxUses, setNewCouponMaxUses] = useState(100);
  const [newCouponDays, setNewCouponDays] = useState(30);

  // Refunds State
  const [refunds, setRefunds] = useState<RefundRequest[]>([]);

  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const loadData = () => {
    setIsLoading(true);
    try {
      const metrics = monetizationService.getPlatformFinancialSummary();
      setFinancialMetrics(metrics);

      const allSubs = subscriptionService.getAllSubscriptions();
      setSubscriptions(allSubs);

      const allPlans = subscriptionService.getPlans();
      setPlans(allPlans);

      const allPromos = promotionService.getAllPromotionRequests();
      setPromotions(allPromos);

      const allPolicies = commissionService.getPolicies();
      setPolicies(allPolicies);

      const allCoupons = couponService.getCoupons();
      setCoupons(allCoupons);

      const allRefunds = refundService.getRefundRequests();
      setRefunds(allRefunds);
    } catch (err) {
      console.error('Failed loading admin monetization data', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const notify = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 5000);
  };

  // Subscription Actions
  const handleApproveSubscription = async (subId: string) => {
    try {
      await subscriptionService.approveSubscriptionPayment(
        subId,
        user?.id || 'admin_01',
        user?.role || 'ADMIN'
      );
      notify('success', language === 'ar' ? 'تمت الموافقة وتفعيل اشتراك التاجر بنجاح' : 'Subscription approved and activated');
      loadData();
    } catch (err: any) {
      notify('error', err.message || 'Failed to approve subscription');
    }
  };

  const handleRejectSubscription = async (subId: string) => {
    const reason = window.prompt(language === 'ar' ? 'سبب الرفض:' : 'Rejection reason:');
    if (!reason) return;
    try {
      await subscriptionService.rejectSubscription(
        subId,
        user?.id || 'admin_01',
        user?.role || 'ADMIN',
        reason
      );
      notify('success', language === 'ar' ? 'تم رفض طلب الاشتراك' : 'Subscription rejected');
      loadData();
    } catch (err: any) {
      notify('error', err.message || 'Failed to reject subscription');
    }
  };

  // Promotion Actions
  const handleApprovePromotion = async (promoId: string) => {
    try {
      await promotionService.approvePromotion(
        promoId,
        user?.id || 'admin_01',
        user?.role || 'ADMIN'
      );
      notify('success', language === 'ar' ? 'تمت الموافقة وتفعيل الترويج في المنصة' : 'Promotion approved and featured');
      loadData();
    } catch (err: any) {
      notify('error', err.message || 'Failed to approve promotion');
    }
  };

  const handleRejectPromotion = async (promoId: string) => {
    const reason = window.prompt(language === 'ar' ? 'سبب الرفض:' : 'Rejection reason:');
    if (!reason) return;
    try {
      await promotionService.rejectPromotion(
        promoId,
        user?.id || 'admin_01',
        user?.role || 'ADMIN',
        reason
      );
      notify('success', language === 'ar' ? 'تم رفض طلب الترويج' : 'Promotion rejected');
      loadData();
    } catch (err: any) {
      notify('error', err.message || 'Failed to reject promotion');
    }
  };

  // Coupon Actions
  const handleCreateCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCouponCode.trim()) return;
    try {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + newCouponDays);

      await couponService.createCoupon(
        {
          code: newCouponCode.trim().toUpperCase(),
          discountType: newCouponType,
          discountValue: Number(newCouponValue),
          minOrderAmount: Number(newCouponMinOrder),
          usageLimit: Number(newCouponMaxUses),
          perCustomerLimit: 1,
          startAt: new Date().toISOString(),
          expireAt: expiresAt.toISOString(),
          active: true,
          createdBy: user?.id || 'admin_01',
        },
        user?.id || 'admin_01',
        user?.role || 'ADMIN'
      );
      notify('success', language === 'ar' ? 'تم إنشاء كود الخصم بنجاح' : 'Coupon created successfully');
      setIsCreateCouponOpen(false);
      setNewCouponCode('');
      loadData();
    } catch (err: any) {
      notify('error', err.message || 'Failed to create coupon');
    }
  };

  const handleToggleCoupon = async (id: string, active: boolean) => {
    try {
      await couponService.toggleCouponStatus(
        id,
        active,
        user?.id || 'admin_01',
        user?.role || 'ADMIN'
      );
      loadData();
    } catch (err: any) {
      notify('error', err.message || 'Failed to update coupon');
    }
  };

  // Policy Creation
  const handleCreatePolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPolicyTarget.trim()) return;
    if (user?.role !== 'SUPER_ADMIN') {
      notify('error', language === 'ar' ? 'غير مصرح: تعديل سياسات العمولات يتطلب صلاحية المدير العام (SUPER_ADMIN) فقط' : 'Unauthorized: Modifying commission policies requires SUPER_ADMIN role');
      return;
    }
    try {
      await commissionService.setPolicy(
        {
          level: newPolicyType,
          targetId: newPolicyTarget.trim(),
          targetName: newPolicyTarget.trim(),
          ratePercent: Number(newPolicyRate),
          isActive: true,
        },
        user?.id || 'admin_01',
        user.role
      );
      notify('success', language === 'ar' ? 'تمت إضافة سياسة العمولة بنجاح' : 'Commission policy added');
      setIsAddPolicyModalOpen(false);
      setNewPolicyTarget('');
      loadData();
    } catch (err: any) {
      notify('error', err.message || 'Failed to create policy');
    }
  };

  // Refund Actions
  const handleApproveRefund = async (refundId: string) => {
    const note = window.prompt(language === 'ar' ? 'ملاحظة التسوية المالية:' : 'Reconciliation note:') || 'Approved by Admin';
    try {
      await refundService.approveRefund(
        refundId,
        user?.id || 'admin_01',
        user?.role || 'ADMIN',
        note
      );
      notify('success', language === 'ar' ? 'تمت الموافقة على الاسترجاع وتسوية الذمة المالية' : 'Refund approved and ledger reconciled');
      loadData();
    } catch (err: any) {
      notify('error', err.message || 'Failed to process refund');
    }
  };

  const handleRejectRefund = async (refundId: string) => {
    const reason = window.prompt(language === 'ar' ? 'سبب رفض الاسترجاع:' : 'Rejection reason:');
    if (!reason) return;
    try {
      await refundService.rejectRefund(
        refundId,
        user?.id || 'admin_01',
        user?.role || 'ADMIN',
        reason
      );
      notify('success', language === 'ar' ? 'تم رفض طلب الاسترجاع' : 'Refund request rejected');
      loadData();
    } catch (err: any) {
      notify('error', err.message || 'Failed to reject refund');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white flex items-center gap-2">
            <DollarSign className="w-6 h-6 text-[#0E11B7] dark:text-blue-400" />
            <span>{language === 'ar' ? 'المحرك المالي والربحي للمنصة' : 'MarketSpace Business & Monetization'}</span>
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            {language === 'ar'
              ? 'إدارة اشتراكات البائعين، اعتمادات الدفع اليدوي، محرك العمولات، الكوبونات والتسويات المالية.'
              : 'Manage seller tiers, manual payment approvals, commission tiers, coupon engines & refunds.'}
          </p>
        </div>

        <button
          type="button"
          onClick={loadData}
          className="h-9 px-4 rounded-xl border border-gray-200 dark:border-[#293142] hover:bg-gray-50 dark:hover:bg-[#151A23] text-xs font-bold text-gray-700 dark:text-gray-300 flex items-center gap-2 self-start sm:self-auto"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>{language === 'ar' ? 'تحديث البيانات' : 'Refresh'}</span>
        </button>
      </div>

      {notification && (
        <div
          className={`p-4 rounded-2xl border text-xs flex items-center justify-between ${
            notification.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
              : 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {notification.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            <span>{notification.message}</span>
          </div>
          <button type="button" onClick={() => setNotification(null)} className="font-bold hover:underline">
            ✕
          </button>
        </div>
      )}

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-gray-200 dark:border-[#293142]">
        {[
          { id: 'overview', label: language === 'ar' ? 'الملخص المالي' : 'Financial Overview', icon: TrendingUp },
          {
            id: 'subscriptions',
            label: language === 'ar' ? 'اشتراكات البائعين' : 'Seller Subscriptions',
            icon: Award,
            badge: subscriptions.filter(s => s.status === 'PENDING_PAYMENT').length,
          },
          {
            id: 'promotions',
            label: language === 'ar' ? 'الترويج والإعلانات' : 'Promotions & Boosts',
            icon: Sparkles,
            badge: promotions.filter(p => p.status === 'PENDING_PAYMENT').length,
          },
          { id: 'commissions', label: language === 'ar' ? 'سياسات العمولات' : 'Commissions Engine', icon: Percent },
          { id: 'coupons', label: language === 'ar' ? 'كوبونات الخصم' : 'Coupons & Promos', icon: Tag },
          {
            id: 'refunds',
            label: language === 'ar' ? 'طلبات الاسترجاع' : 'Refunds & Ledger',
            icon: ShieldCheck,
            badge: refunds.filter(r => r.status === 'PENDING').length,
          },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveSubTab(tab.id as any)}
              className={`h-10 px-4 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-2 ${
                isActive
                  ? 'bg-[#0E11B7] text-white shadow-xs'
                  : 'bg-white dark:bg-[#151A23] border border-gray-200 dark:border-[#293142] text-gray-700 dark:text-gray-300 hover:bg-gray-50'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
              {Boolean(tab.badge && tab.badge > 0) && (
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${
                  isActive ? 'bg-amber-400 text-gray-950' : 'bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300'
                }`}>
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* 1. OVERVIEW TAB */}
      {activeSubTab === 'overview' && (
        <div className="space-y-6">
          {/* Main KPI Matrix */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="p-5 rounded-3xl bg-white dark:bg-[#151A23] border border-gray-200 dark:border-[#293142] shadow-xs space-y-2">
              <div className="flex items-center justify-between text-gray-500 text-xs font-bold">
                <span>{language === 'ar' ? 'إجمالي قيمة المبيعات (GMV)' : 'Total Marketplace GMV'}</span>
                <TrendingUp className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white">
                ${(financialMetrics?.totalGMV || 0).toFixed(2)}
              </div>
              <p className="text-[11px] text-gray-400">
                {financialMetrics?.orderCount || 0} {language === 'ar' ? 'طلب ناجح عبر المنصة' : 'settled customer orders'}
              </p>
            </div>

            <div className="p-5 rounded-3xl bg-white dark:bg-[#151A23] border border-gray-200 dark:border-[#293142] shadow-xs space-y-2">
              <div className="flex items-center justify-between text-gray-500 text-xs font-bold">
                <span>{language === 'ar' ? 'عمولات المنصة المكتسبة' : 'Marketplace Commission'}</span>
                <Percent className="w-4 h-4 text-[#0E11B7] dark:text-blue-400" />
              </div>
              <div className="text-2xl sm:text-3xl font-black text-[#0E11B7] dark:text-blue-400">
                ${(financialMetrics?.totalCommissionRevenue || 0).toFixed(2)}
              </div>
              <p className="text-[11px] text-gray-400">
                {language === 'ar' ? 'متوسط العمولة 8-10% على الأصناف' : 'Weighted avg. take rate'}
              </p>
            </div>

            <div className="p-5 rounded-3xl bg-white dark:bg-[#151A23] border border-gray-200 dark:border-[#293142] shadow-xs space-y-2">
              <div className="flex items-center justify-between text-gray-500 text-xs font-bold">
                <span>{language === 'ar' ? 'إيرادات الاشتراكات والترويج' : 'SaaS & Ad Monetization'}</span>
                <Award className="w-4 h-4 text-amber-500" />
              </div>
              <div className="text-2xl sm:text-3xl font-black text-amber-600 dark:text-amber-400">
                ${((financialMetrics?.subscriptionRevenue || 0) + (financialMetrics?.promotionRevenue || 0)).toFixed(2)}
              </div>
              <p className="text-[11px] text-gray-400">
                ${(financialMetrics?.subscriptionRevenue || 0).toFixed(2)} {language === 'ar' ? 'باقات' : 'subs'} • ${(financialMetrics?.promotionRevenue || 0).toFixed(2)} {language === 'ar' ? 'ترويج' : 'boosts'}
              </p>
            </div>

            <div className="p-5 rounded-3xl bg-white dark:bg-[#151A23] border border-gray-200 dark:border-[#293142] shadow-xs space-y-2">
              <div className="flex items-center justify-between text-gray-500 text-xs font-bold">
                <span>{language === 'ar' ? 'صافي أرباح المنصة المباشرة' : 'Net Platform Revenue'}</span>
                <DollarSign className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="text-2xl sm:text-3xl font-black text-emerald-600 dark:text-emerald-400">
                ${(financialMetrics?.totalPlatformRevenue || 0).toFixed(2)}
              </div>
              <p className="text-[11px] text-gray-400">
                {language === 'ar' ? 'العمولات + الاشتراكات + الترويج' : 'Commission + Subscriptions + Promos'}
              </p>
            </div>

            <div className="p-5 rounded-3xl bg-white dark:bg-[#151A23] border border-gray-200 dark:border-[#293142] shadow-xs space-y-2">
              <div className="flex items-center justify-between text-gray-500 text-xs font-bold">
                <span>{language === 'ar' ? 'مستحقات البائعين (صافي)' : 'Seller Net Payouts'}</span>
                <ShieldCheck className="w-4 h-4 text-indigo-500" />
              </div>
              <div className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white">
                ${(financialMetrics?.sellerNetLiabilities || 0).toFixed(2)}
              </div>
              <p className="text-[11px] text-gray-400">
                {language === 'ar' ? 'المبلغ المستحق بعد استقطاع العمولات' : 'Gross GMV minus commission withheld'}
              </p>
            </div>

            <div className="p-5 rounded-3xl bg-white dark:bg-[#151A23] border border-gray-200 dark:border-[#293142] shadow-xs space-y-2">
              <div className="flex items-center justify-between text-gray-500 text-xs font-bold">
                <span>{language === 'ar' ? 'تسويات وخصومات الكوبونات' : 'Coupon Discounts Absorbed'}</span>
                <Tag className="w-4 h-4 text-rose-500" />
              </div>
              <div className="text-2xl sm:text-3xl font-black text-rose-600 dark:text-rose-400">
                ${(financialMetrics?.totalDiscountsAbsorbed || 0).toFixed(2)}
              </div>
              <p className="text-[11px] text-gray-400">
                {financialMetrics?.couponsUsedCount || 0} {language === 'ar' ? 'عملية تطبيق كوبون' : 'coupon redemptions'}
              </p>
            </div>
          </div>

          {/* Quick Approvals Queue Summary */}
          <div className="p-6 rounded-3xl bg-white dark:bg-[#151A23] border border-gray-200 dark:border-[#293142] space-y-4">
            <h3 className="text-base font-black text-gray-900 dark:text-white">
              {language === 'ar' ? 'إجراءات مالية عاجلة بانتظار الاعتماد' : 'Pending Monetization Queue'}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div
                onClick={() => setActiveSubTab('subscriptions')}
                className="p-4 rounded-2xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 cursor-pointer hover:border-amber-400 transition-all space-y-1"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-amber-900 dark:text-amber-200">
                    {language === 'ar' ? 'اشتراكات البائعين المعلقة' : 'Pending Subscriptions'}
                  </span>
                  <Award className="w-4 h-4 text-amber-600" />
                </div>
                <div className="text-2xl font-black text-amber-700 dark:text-amber-400">
                  {subscriptions.filter(s => s.status === 'PENDING_PAYMENT').length}
                </div>
                <p className="text-[11px] text-amber-800/80 dark:text-amber-300">
                  {language === 'ar' ? 'بانتظار التحقق من إشعار التحويل' : 'Awaiting mobile transfer match'}
                </p>
              </div>

              <div
                onClick={() => setActiveSubTab('promotions')}
                className="p-4 rounded-2xl bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/50 cursor-pointer hover:border-blue-400 transition-all space-y-1"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-blue-900 dark:text-blue-200">
                    {language === 'ar' ? 'طلبات ترويج المنتجات' : 'Pending Ad Promos'}
                  </span>
                  <Sparkles className="w-4 h-4 text-blue-600" />
                </div>
                <div className="text-2xl font-black text-[#0E11B7] dark:text-blue-400">
                  {promotions.filter(p => p.status === 'PENDING_PAYMENT').length}
                </div>
                <p className="text-[11px] text-blue-800/80 dark:text-blue-300">
                  {language === 'ar' ? 'بانتظار الموافقة والتثبيت في الواجهة' : 'Awaiting hero / category pin'}
                </p>
              </div>

              <div
                onClick={() => setActiveSubTab('refunds')}
                className="p-4 rounded-2xl bg-rose-50/60 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/50 cursor-pointer hover:border-rose-400 transition-all space-y-1"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-rose-900 dark:text-rose-200">
                    {language === 'ar' ? 'طلبات الاسترجاع' : 'Pending Refunds'}
                  </span>
                  <ShieldCheck className="w-4 h-4 text-rose-600" />
                </div>
                <div className="text-2xl font-black text-rose-700 dark:text-rose-400">
                  {refunds.filter(r => r.status === 'PENDING').length}
                </div>
                <p className="text-[11px] text-rose-800/80 dark:text-rose-300">
                  {language === 'ar' ? 'تسوية مالية لذمة البائع' : 'Reconciliation with vendor balance'}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. SUBSCRIPTIONS APPROVAL TAB */}
      {activeSubTab === 'subscriptions' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-black text-gray-900 dark:text-white">
              {language === 'ar' ? 'إدارة واعتماد اشتراكات البائعين' : 'Seller Subscription Requests & Plans'}
            </h3>
          </div>

          <div className="rounded-3xl bg-white dark:bg-[#151A23] border border-gray-200 dark:border-[#293142] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-start">
                <thead className="bg-gray-50 dark:bg-[#111722] text-gray-500 font-bold border-b border-gray-200 dark:border-[#293142]">
                  <tr>
                    <th className="p-4 text-start">{language === 'ar' ? 'التاجر / البائع' : 'Seller ID'}</th>
                    <th className="p-4 text-start">{language === 'ar' ? 'الخطة المطلوبة' : 'Plan'}</th>
                    <th className="p-4 text-start">{language === 'ar' ? 'المبلغ' : 'Amount'}</th>
                    <th className="p-4 text-start">{language === 'ar' ? 'طريقة التحويل' : 'Payment Method'}</th>
                    <th className="p-4 text-start">{language === 'ar' ? 'رقم التحويل (Ref)' : 'Reference No'}</th>
                    <th className="p-4 text-start">{language === 'ar' ? 'الحالة' : 'Status'}</th>
                    <th className="p-4 text-end">{language === 'ar' ? 'الإجراءات' : 'Actions'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-[#293142]">
                  {subscriptions.map((sub) => {
                    const plan = plans.find(p => p.id === sub.planId);
                    return (
                      <tr key={sub.id} className="hover:bg-gray-50/50 dark:hover:bg-[#111722]/50">
                        <td className="p-4 font-bold text-gray-900 dark:text-white font-mono">
                          {sub.sellerId}
                        </td>
                        <td className="p-4 font-semibold text-[#0E11B7] dark:text-blue-400">
                          {plan?.name[language] || plan?.name.en || sub.planId}
                        </td>
                        <td className="p-4 font-black text-gray-900 dark:text-white">
                          ${sub.amountPaid}
                        </td>
                        <td className="p-4 uppercase text-gray-600 dark:text-gray-300">
                          {sub.paymentMethod.replace('_', ' ')}
                        </td>
                        <td className="p-4 font-mono font-bold text-emerald-700 dark:text-emerald-400">
                          {sub.paymentReferenceNumber || '—'}
                        </td>
                        <td className="p-4">
                          {sub.status === 'PENDING_PAYMENT' && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                              {language === 'ar' ? 'بانتظار المراجعة' : 'Pending Verification'}
                            </span>
                          )}
                          {sub.status === 'ACTIVE' && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                              {language === 'ar' ? 'نشط' : 'Active'}
                            </span>
                          )}
                          {sub.status === 'CANCELLED' && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 text-gray-600 dark:bg-[#111722] dark:text-gray-400">
                              {language === 'ar' ? 'ملغي' : 'Cancelled'}
                            </span>
                          )}
                        </td>
                        <td className="p-4 text-end">
                          {sub.status === 'PENDING_PAYMENT' ? (
                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => handleApproveSubscription(sub.id)}
                                className="h-8 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] flex items-center gap-1"
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>{language === 'ar' ? 'اعتماد وتفعيل' : 'Approve'}</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRejectSubscription(sub.id)}
                                className="h-8 px-3 rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100 dark:bg-rose-950/40 dark:text-rose-300 font-bold text-[11px]"
                              >
                                {language === 'ar' ? 'رفض' : 'Reject'}
                              </button>
                            </div>
                          ) : (
                            <span className="text-gray-400 text-[11px]">
                              {language === 'ar' ? 'تمت معالجته' : 'Processed'}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 3. PROMOTIONS APPROVAL TAB */}
      {activeSubTab === 'promotions' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-black text-gray-900 dark:text-white">
              {language === 'ar' ? 'طلبات الترويج والإعلانات المعلقة' : 'Product Boost & Promotion Requests'}
            </h3>
          </div>

          <div className="rounded-3xl bg-white dark:bg-[#151A23] border border-gray-200 dark:border-[#293142] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-start">
                <thead className="bg-gray-50 dark:bg-[#111722] text-gray-500 font-bold border-b border-gray-200 dark:border-[#293142]">
                  <tr>
                    <th className="p-4 text-start">{language === 'ar' ? 'المنتج' : 'Product'}</th>
                    <th className="p-4 text-start">{language === 'ar' ? 'موضع الظهور' : 'Placement'}</th>
                    <th className="p-4 text-start">{language === 'ar' ? 'المدة' : 'Duration'}</th>
                    <th className="p-4 text-start">{language === 'ar' ? 'المبلغ المحول' : 'Fee'}</th>
                    <th className="p-4 text-start">{language === 'ar' ? 'التحويل (Ref)' : 'Transfer Ref'}</th>
                    <th className="p-4 text-start">{language === 'ar' ? 'الحالة' : 'Status'}</th>
                    <th className="p-4 text-end">{language === 'ar' ? 'الإجراء' : 'Actions'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-[#293142]">
                  {promotions.map((promo) => (
                    <tr key={promo.id} className="hover:bg-gray-50/50 dark:hover:bg-[#111722]/50">
                      <td className="p-4 font-bold text-gray-900 dark:text-white">
                        <div className="flex items-center gap-2">
                          {promo.productImage && (
                            <img src={promo.productImage} alt="" className="w-8 h-8 rounded-lg object-cover" />
                          )}
                          <div className="truncate max-w-[180px]">
                            {typeof promo.productTitle === 'object' && promo.productTitle !== null
                              ? ((promo.productTitle as any)[language] || (promo.productTitle as any).ar || (promo.productTitle as any).en || 'Product')
                              : String(promo.productTitle || 'Product')}
                          </div>
                        </div>
                      </td>
                      <td className="p-4 font-semibold text-[#0E11B7] dark:text-blue-400 capitalize">
                        {String(promo.placement || '').replace('_', ' ')}
                      </td>
                      <td className="p-4 text-gray-600 dark:text-gray-300">
                        {promo.durationDays || 0} {language === 'ar' ? 'يوم' : 'days'}
                      </td>
                      <td className="p-4 font-black text-gray-900 dark:text-white">
                        ${Number(promo.cost ?? (promo as any).budget ?? 0).toFixed(2)}
                      </td>
                      <td className="p-4 font-mono font-bold text-emerald-700 dark:text-emerald-400">
                        {promo.paymentReferenceNumber || '—'}
                      </td>
                      <td className="p-4">
                        {promo.status === 'PENDING_PAYMENT' && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                            {language === 'ar' ? 'معلق' : 'Pending'}
                          </span>
                        )}
                        {promo.status === 'ACTIVE' && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                            {language === 'ar' ? 'نشط' : 'Active'}
                          </span>
                        )}
                        {promo.status === 'EXPIRED' && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 text-gray-600 dark:bg-[#111722] dark:text-gray-400">
                            {language === 'ar' ? 'منتهي' : 'Expired'}
                          </span>
                        )}
                      </td>
                      <td className="p-4 text-end">
                        {promo.status === 'PENDING_PAYMENT' ? (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => handleApprovePromotion(promo.id)}
                              className="h-8 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] flex items-center gap-1"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>{language === 'ar' ? 'تفعيل الظهور' : 'Feature'}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRejectPromotion(promo.id)}
                              className="h-8 px-3 rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100 dark:bg-rose-950/40 dark:text-rose-300 font-bold text-[11px]"
                            >
                              {language === 'ar' ? 'رفض' : 'Reject'}
                            </button>
                          </div>
                        ) : (
                          <span className="text-gray-400 text-[11px]">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 4. COMMISSIONS ENGINE TAB */}
      {activeSubTab === 'commissions' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-black text-gray-900 dark:text-white">
                {language === 'ar' ? 'محرك تسلسل العمولات الحتمي' : 'Deterministic Commission Hierarchy'}
              </h3>
              <p className="text-xs text-gray-500">
                {language === 'ar'
                  ? 'الأولوية: 1. نسبة البائع المخصصة ← 2. نسبة التصنيف ← 3. نوع النشاط ← 4. النسبة العامة (10%)'
                  : 'Resolution order: Seller Custom Rate > Category Rate > Seller Type > Global Default (10%)'}
              </p>
            </div>
            {user?.role === 'SUPER_ADMIN' ? (
              <button
                type="button"
                onClick={() => setIsAddPolicyModalOpen(true)}
                className="h-9 px-4 rounded-xl bg-[#0E11B7] hover:bg-[#070A86] text-white text-xs font-bold flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{language === 'ar' ? 'إضافة نسبة جديدة' : 'Add Policy'}</span>
              </button>
            ) : (
              <span className="text-xs font-bold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 px-3 py-1.5 rounded-xl border border-amber-200 dark:border-amber-800 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>{language === 'ar' ? 'تعديل السياسات مخصص للمدير العام فقط' : 'Policy updates restricted to Super Admin'}</span>
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="p-4 rounded-2xl bg-white dark:bg-[#151A23] border border-gray-200 dark:border-[#293142] space-y-1">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">الأولوية 1 (الأعلى)</span>
              <h4 className="text-xs font-bold text-gray-900 dark:text-white">Seller Custom Override</h4>
              <p className="text-[11px] text-gray-500">نسبة اتفاق مخصصة لمتجر أو تاجر محدد</p>
            </div>
            <div className="p-4 rounded-2xl bg-white dark:bg-[#151A23] border border-gray-200 dark:border-[#293142] space-y-1">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">الأولوية 2</span>
              <h4 className="text-xs font-bold text-gray-900 dark:text-white">Category Policy</h4>
              <p className="text-[11px] text-gray-500">تطبيق نسبة محددة على تصنيف معين</p>
            </div>
            <div className="p-4 rounded-2xl bg-white dark:bg-[#151A23] border border-gray-200 dark:border-[#293142] space-y-1">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">الأولوية 3</span>
              <h4 className="text-xs font-bold text-gray-900 dark:text-white">Seller Type</h4>
              <p className="text-[11px] text-gray-500">متاجر منتجات (10%)، مطاعم (12%)، خدمات (15%)</p>
            </div>
            <div className="p-4 rounded-2xl bg-[#EEF2FF] dark:bg-[#0E11B7]/20 border border-[#0E11B7]/30 space-y-1">
              <span className="text-[10px] font-bold text-[#0E11B7] dark:text-blue-300 uppercase tracking-wider block">الأولوية 4 (القاعدة)</span>
              <h4 className="text-xs font-bold text-[#0E11B7] dark:text-white">Global Default: 10%</h4>
              <p className="text-[11px] text-[#0E11B7]/80 dark:text-blue-200">تطبق في حال عدم وجود أي استثناء</p>
            </div>
          </div>

          <div className="rounded-3xl bg-white dark:bg-[#151A23] border border-gray-200 dark:border-[#293142] overflow-hidden">
            <div className="p-4 border-b border-gray-200 dark:border-[#293142] font-bold text-xs text-gray-700 dark:text-gray-300">
              {language === 'ar' ? 'السياسات النشطة المحددة مسبقاً' : 'Configured Policies'}
            </div>
            <div className="divide-y divide-gray-100 dark:divide-[#293142]">
              {policies.map((p) => (
                <div key={p.id} className="p-4 flex items-center justify-between text-xs">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-gray-900 dark:text-white">
                        {p.targetName || p.targetId}
                      </span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-gray-100 dark:bg-[#111722] text-gray-600 dark:text-gray-400 uppercase">
                        {p.level}
                      </span>
                    </div>
                    <span className="text-[11px] text-gray-400 font-mono">ID: {p.targetId}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-base font-black text-emerald-600 dark:text-emerald-400">
                      {p.ratePercent}%
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                      Active
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Add Policy Modal */}
          {isAddPolicyModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
              <div className="w-full max-w-md rounded-3xl bg-white dark:bg-[#151A23] border border-gray-200 dark:border-[#293142] p-6 space-y-4 shadow-2xl">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-black text-gray-900 dark:text-white">
                    {language === 'ar' ? 'إضافة نسبة عمولة جديدة' : 'Add Commission Override'}
                  </h4>
                  <button type="button" onClick={() => setIsAddPolicyModalOpen(false)}>✕</button>
                </div>
                <form onSubmit={handleCreatePolicy} className="space-y-3 text-xs">
                  <div>
                    <label className="font-bold block mb-1">المستوى (Level)</label>
                    <select
                      value={newPolicyType}
                      onChange={e => setNewPolicyType(e.target.value as any)}
                      className="w-full h-10 px-3 bg-gray-50 dark:bg-[#111722] border border-gray-200 dark:border-[#293142] rounded-xl text-xs"
                    >
                      <option value="category">Category (تصنيف)</option>
                      <option value="seller_specific">Seller Specific (متجر محدد)</option>
                      <option value="seller_type">Seller Type (نوع النشاط)</option>
                    </select>
                  </div>
                  <div>
                    <label className="font-bold block mb-1">المعرف أو التصنيف (Target ID / Slug)</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. electronics or seller_123"
                      value={newPolicyTarget}
                      onChange={e => setNewPolicyTarget(e.target.value)}
                      className="w-full h-10 px-3 bg-gray-50 dark:bg-[#111722] border border-gray-200 dark:border-[#293142] rounded-xl text-xs"
                    />
                  </div>
                  <div>
                    <label className="font-bold block mb-1">نسبة العمولة % (Rate Percent)</label>
                    <input
                      type="number"
                      min="1"
                      max="50"
                      required
                      value={newPolicyRate}
                      onChange={e => setNewPolicyRate(Number(e.target.value))}
                      className="w-full h-10 px-3 bg-gray-50 dark:bg-[#111722] border border-gray-200 dark:border-[#293142] rounded-xl text-xs"
                    />
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setIsAddPolicyModalOpen(false)}
                      className="flex-1 h-10 rounded-xl border border-gray-200 dark:border-[#293142] font-bold"
                    >
                      إلغاء
                    </button>
                    <button
                      type="submit"
                      className="flex-1 h-10 rounded-xl bg-[#0E11B7] text-white font-black"
                    >
                      حفظ السياسة
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 5. COUPONS TAB */}
      {activeSubTab === 'coupons' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-black text-gray-900 dark:text-white">
                {language === 'ar' ? 'كوبونات الخصم والبروموكود' : 'Platform Discount Coupons'}
              </h3>
              <p className="text-xs text-gray-500">
                {language === 'ar' ? 'إنشاء وتفعيل أكواد الخصم للعملاء' : 'Manage marketing coupon codes'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsCreateCouponOpen(true)}
              className="h-9 px-4 rounded-xl bg-[#0E11B7] hover:bg-[#070A86] text-white text-xs font-bold flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{language === 'ar' ? 'إنشاء كود خصم جديد' : 'New Coupon'}</span>
            </button>
          </div>

          <div className="rounded-3xl bg-white dark:bg-[#151A23] border border-gray-200 dark:border-[#293142] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-start">
                <thead className="bg-gray-50 dark:bg-[#111722] text-gray-500 font-bold border-b border-gray-200 dark:border-[#293142]">
                  <tr>
                    <th className="p-4 text-start">{language === 'ar' ? 'الكود' : 'Coupon Code'}</th>
                    <th className="p-4 text-start">{language === 'ar' ? 'قيمة الخصم' : 'Discount'}</th>
                    <th className="p-4 text-start">{language === 'ar' ? 'الحد الأدنى للطلب' : 'Min Order'}</th>
                    <th className="p-4 text-start">{language === 'ar' ? 'الاستخدام' : 'Usage'}</th>
                    <th className="p-4 text-start">{language === 'ar' ? 'تاريخ الانتهاء' : 'Expires'}</th>
                    <th className="p-4 text-start">{language === 'ar' ? 'الحالة' : 'Status'}</th>
                    <th className="p-4 text-end">{language === 'ar' ? 'التحكم' : 'Toggle'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-[#293142]">
                  {coupons.map((c) => (
                    <tr key={c.id} className="hover:bg-gray-50/50 dark:hover:bg-[#111722]/50">
                      <td className="p-4 font-mono font-black text-sm text-[#0E11B7] dark:text-blue-400">
                        {c.code}
                      </td>
                      <td className="p-4 font-bold text-gray-900 dark:text-white">
                        {c.discountType === 'percentage' ? `${c.discountValue}%` : `$${c.discountValue}`}
                      </td>
                      <td className="p-4 text-gray-600 dark:text-gray-300">
                        ${c.minOrderAmount}
                      </td>
                      <td className="p-4 font-semibold text-gray-700 dark:text-gray-300">
                        {c.usedCount} / {c.usageLimit || '∞'}
                      </td>
                      <td className="p-4 text-gray-500 text-[11px]">
                        {new Date(c.expireAt).toLocaleDateString()}
                      </td>
                      <td className="p-4">
                        {c.active ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                            {language === 'ar' ? 'نشط' : 'Active'}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 text-gray-600 dark:bg-[#111722] dark:text-gray-400">
                            {language === 'ar' ? 'معطل' : 'Disabled'}
                          </span>
                        )}
                      </td>
                      <td className="p-4 text-end">
                        <button
                          type="button"
                          onClick={() => handleToggleCoupon(c.id, !c.active)}
                          className={`h-7 px-2.5 rounded-lg text-[11px] font-bold transition-all ${
                            c.active
                              ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 hover:bg-rose-100'
                              : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 hover:bg-emerald-100'
                          }`}
                        >
                          {c.active ? (language === 'ar' ? 'تعطيل' : 'Disable') : (language === 'ar' ? 'تفعيل' : 'Activate')}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Create Coupon Modal */}
          {isCreateCouponOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
              <div className="w-full max-w-md rounded-3xl bg-white dark:bg-[#151A23] border border-gray-200 dark:border-[#293142] p-6 space-y-4 shadow-2xl">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-black text-gray-900 dark:text-white">
                    {language === 'ar' ? 'إنشاء كود خصم جديد' : 'Create New Coupon'}
                  </h4>
                  <button type="button" onClick={() => setIsCreateCouponOpen(false)}>✕</button>
                </div>

                <form onSubmit={handleCreateCoupon} className="space-y-3 text-xs">
                  <div>
                    <label className="font-bold block mb-1">كود الخصم (Coupon Code) *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. SOMALIA20"
                      value={newCouponCode}
                      onChange={e => setNewCouponCode(e.target.value.toUpperCase())}
                      className="w-full h-10 px-3 font-mono uppercase bg-gray-50 dark:bg-[#111722] border border-gray-200 dark:border-[#293142] rounded-xl text-xs font-bold"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="font-bold block mb-1">نوع الخصم</label>
                      <select
                        value={newCouponType}
                        onChange={e => setNewCouponType(e.target.value as any)}
                        className="w-full h-10 px-2 bg-gray-50 dark:bg-[#111722] border border-gray-200 dark:border-[#293142] rounded-xl text-xs"
                      >
                        <option value="percentage">نسبة مئوية (%)</option>
                        <option value="fixed">مبلغ ثابت ($)</option>
                      </select>
                    </div>

                    <div>
                      <label className="font-bold block mb-1">قيمة الخصم</label>
                      <input
                        type="number"
                        min="1"
                        required
                        value={newCouponValue}
                        onChange={e => setNewCouponValue(Number(e.target.value))}
                        className="w-full h-10 px-3 bg-gray-50 dark:bg-[#111722] border border-gray-200 dark:border-[#293142] rounded-xl text-xs font-bold"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="font-bold block mb-1">الحد الأدنى للطلب ($)</label>
                      <input
                        type="number"
                        min="0"
                        required
                        value={newCouponMinOrder}
                        onChange={e => setNewCouponMinOrder(Number(e.target.value))}
                        className="w-full h-10 px-3 bg-gray-50 dark:bg-[#111722] border border-gray-200 dark:border-[#293142] rounded-xl text-xs"
                      />
                    </div>

                    <div>
                      <label className="font-bold block mb-1">أقصى عدد استخدامات</label>
                      <input
                        type="number"
                        min="1"
                        required
                        value={newCouponMaxUses}
                        onChange={e => setNewCouponMaxUses(Number(e.target.value))}
                        className="w-full h-10 px-3 bg-gray-50 dark:bg-[#111722] border border-gray-200 dark:border-[#293142] rounded-xl text-xs"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="font-bold block mb-1">صلاحية الكود (بالأيام)</label>
                    <input
                      type="number"
                      min="1"
                      value={newCouponDays}
                      onChange={e => setNewCouponDays(Number(e.target.value))}
                      className="w-full h-10 px-3 bg-gray-50 dark:bg-[#111722] border border-gray-200 dark:border-[#293142] rounded-xl text-xs"
                    />
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setIsCreateCouponOpen(false)}
                      className="flex-1 h-10 rounded-xl border border-gray-200 dark:border-[#293142] font-bold"
                    >
                      إلغاء
                    </button>
                    <button
                      type="submit"
                      className="flex-1 h-10 rounded-xl bg-[#0E11B7] text-white font-black"
                    >
                      إنشاء الكود
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 6. REFUNDS TAB */}
      {activeSubTab === 'refunds' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-black text-gray-900 dark:text-white">
                {language === 'ar' ? 'إدارة وتسوية طلبات الاسترجاع' : 'Refund Ledger Reconciliation'}
              </h3>
              <p className="text-xs text-gray-500">
                {language === 'ar'
                  ? 'اعتماد الاسترجاع يخصم المبلغ من ذمة البائع ويعيد توازن عمولة المنصة تلقائياً'
                  : 'Approvals automatically adjust vendor balances and platform retained commission'}
              </p>
            </div>
          </div>

          <div className="rounded-3xl bg-white dark:bg-[#151A23] border border-gray-200 dark:border-[#293142] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-start">
                <thead className="bg-gray-50 dark:bg-[#111722] text-gray-500 font-bold border-b border-gray-200 dark:border-[#293142]">
                  <tr>
                    <th className="p-4 text-start">{language === 'ar' ? 'رقم الطلب' : 'Order ID'}</th>
                    <th className="p-4 text-start">{language === 'ar' ? 'البائع / المتجر' : 'Seller ID'}</th>
                    <th className="p-4 text-start">{language === 'ar' ? 'المبلغ المسترجع' : 'Refund Amount'}</th>
                    <th className="p-4 text-start">{language === 'ar' ? 'السبب' : 'Reason'}</th>
                    <th className="p-4 text-start">{language === 'ar' ? 'الحالة' : 'Status'}</th>
                    <th className="p-4 text-end">{language === 'ar' ? 'الإجراء' : 'Actions'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-[#293142]">
                  {refunds.map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50/50 dark:hover:bg-[#111722]/50">
                      <td className="p-4 font-mono font-bold text-gray-900 dark:text-white">
                        {r.orderId}
                      </td>
                      <td className="p-4 font-mono text-gray-600 dark:text-gray-300">
                        {r.sellerId}
                      </td>
                      <td className="p-4 font-black text-rose-600 dark:text-rose-400">
                        ${Number((r as any).refundAmount ?? (r as any).amount ?? 0).toFixed(2)}
                      </td>
                      <td className="p-4 text-gray-600 dark:text-gray-300 max-w-[200px] truncate">
                        {r.reason}
                      </td>
                      <td className="p-4">
                        {r.status === 'PENDING' && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                            {language === 'ar' ? 'معلق' : 'Pending'}
                          </span>
                        )}
                        {r.status === 'APPROVED' && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                            {language === 'ar' ? 'تمت التسوية' : 'Reconciled'}
                          </span>
                        )}
                        {r.status === 'REJECTED' && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300">
                            {language === 'ar' ? 'مرفوض' : 'Rejected'}
                          </span>
                        )}
                      </td>
                      <td className="p-4 text-end">
                        {r.status === 'PENDING' ? (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => handleApproveRefund(r.id)}
                              className="h-8 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] flex items-center gap-1"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>{language === 'ar' ? 'اعتماد التسوية' : 'Approve'}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRejectRefund(r.id)}
                              className="h-8 px-3 rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100 dark:bg-rose-950/40 dark:text-rose-300 font-bold text-[11px]"
                            >
                              {language === 'ar' ? 'رفض' : 'Reject'}
                            </button>
                          </div>
                        ) : (
                          <span className="text-gray-400 text-[11px]">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
