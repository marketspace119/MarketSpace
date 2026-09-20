import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Shield, ShieldAlert, ArrowLeft, RefreshCw, AlertCircle } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { ErrorBoundary } from '../components/common/ErrorBoundary';
import { AdminTab } from '../components/admin/AdminSidebar';
import { AdminSidebar } from '../components/admin/AdminSidebar';
import { AdminHeader } from '../components/admin/AdminHeader';
import { AdminOverviewSection } from '../components/admin/AdminOverviewSection';
import { AdminUsersSection } from '../components/admin/AdminUsersSection';
import { AdminSellersSection } from '../components/admin/AdminSellersSection';
import { AdminStoresSection } from '../components/admin/AdminStoresSection';
import { AdminRestaurantsSection } from '../components/admin/AdminRestaurantsSection';
import { AdminServicesSection } from '../components/admin/AdminServicesSection';
import { AdminBookingsSection } from '../components/admin/AdminBookingsSection';
import { AdminProductsSection } from '../components/admin/AdminProductsSection';
import { AdminOrdersSection } from '../components/admin/AdminOrdersSection';
import { AdminPaymentsSection } from '../components/admin/AdminPaymentsSection';
import { AdminPayoutsSection } from '../components/admin/AdminPayoutsSection';
import { AdminReviewsSection } from '../components/admin/AdminReviewsSection';
import { AdminDeliverySection } from '../components/admin/AdminDeliverySection';
import { AdminAuditSection } from '../components/admin/AdminAuditSection';
import { AdminReportsSection } from '../components/admin/AdminReportsSection';
import { AdminSettingsSection } from '../components/admin/AdminSettingsSection';
import { AdminMonetizationSection } from '../components/admin/AdminMonetizationSection';

import { userService } from '../services/userService';
import { storeService } from '../services/storeService';
import { productService } from '../services/productService';
import { orderService } from '../services/orderService';
import { paymentService } from '../services/paymentService';
import { payoutService } from '../services/payoutService';
import { reviewService } from '../services/reviewService';
import { bookingService } from '../services/bookingService';

import {
  User,
  Store,
  Product,
  Order,
  PayoutRequest,
  Review,
  Booking,
} from '../types';
import { MobilePaymentSubmission } from '../services/paymentService';

interface AdminDashboardPageProps {
  onNavigate: (path: string) => void;
  currentPath?: string;
}

export const AdminDashboardPage: React.FC<AdminDashboardPageProps> = ({
  onNavigate,
  currentPath = '/admin',
}) => {
  const { t, isRtl } = useLanguage();
  const { user, hasRole } = useAuth();

  // Determine active tab from URL subpath (e.g. /admin/users -> 'users')
  const initialTab = useMemo<AdminTab>(() => {
    const sub = currentPath.replace('/admin', '').replace(/^\//, '');
    const validTabs: AdminTab[] = [
      'overview',
      'users',
      'sellers',
      'stores',
      'restaurants',
      'services',
      'bookings',
      'products',
      'orders',
      'payments',
      'payouts',
      'monetization',
      'reviews',
      'delivery',
      'audit',
      'reports',
      'settings',
    ];
    if (validTabs.includes(sub as AdminTab)) {
      return sub as AdminTab;
    }
    return 'overview';
  }, [currentPath]);

  const [activeTab, setActiveTab] = useState<AdminTab>(initialTab);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [dateRange, setDateRange] = useState<'today' | '7days' | '30days' | 'all'>('30days');

  // Core Data States
  const [users, setUsers] = useState<User[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [submissions, setSubmissions] = useState<MobilePaymentSubmission[]>([]);
  const [payouts, setPayouts] = useState<PayoutRequest[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);

  // Sync activeTab if path changes externally
  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const handleTabChange = (tab: AdminTab) => {
    setActiveTab(tab);
    setSearchQuery('');
    const targetUrl = tab === 'overview' ? '/admin' : `/admin/${tab}`;
    onNavigate(targetUrl);
  };

  const isAdmin = hasRole(['ADMIN', 'SUPER_ADMIN']);

  const [loadError, setLoadError] = useState<string | null>(null);

  // Load all platform data with resilient Promise.allSettled and strict array safety
  const loadPlatformData = useCallback(async () => {
    if (!isAdmin) return;
    setIsRefreshing(true);
    setLoadError(null);
    try {
      const [uRes, sRes, pRes, oRes, subRes, payRes, revRes, bRes] = await Promise.allSettled([
        userService.getAllUsers(),
        Promise.resolve(storeService.getAllStores()),
        Promise.resolve(productService.getAllProducts()),
        Promise.resolve(orderService.getAllOrders(user?.id, user?.role)),
        paymentService.getAllSubmissions(),
        payoutService.getAllPayouts(),
        Promise.resolve(reviewService.getAllReviews()),
        Promise.resolve(bookingService.getAllBookings()),
      ]);

      const safeArray = <T,>(res: PromiseSettledResult<T[]>, name: string): T[] => {
        if (res.status === 'fulfilled' && Array.isArray(res.value)) {
          return res.value;
        }
        if (res.status === 'rejected') {
          console.warn(`[AdminDashboard] Non-blocking notice for ${name}:`, res.reason);
        }
        return [];
      };

      setUsers(safeArray(uRes, 'users'));
      setStores(safeArray(sRes, 'stores'));
      setProducts(safeArray(pRes, 'products'));
      setOrders(safeArray(oRes, 'orders'));
      setSubmissions(safeArray(subRes, 'submissions'));
      setPayouts(safeArray(payRes, 'payouts'));
      setReviews(safeArray(revRes, 'reviews'));
      setBookings(safeArray(bRes, 'bookings'));

      const hasFailures = [uRes, sRes, pRes, oRes, subRes, payRes, revRes, bRes].some(r => r.status === 'rejected');
      if (hasFailures) {
        setLoadError('بعض البيانات تعذر تحديثها مؤقتاً، وتم استخدام أحدث نسخة مخزنة.');
      }
    } catch (err) {
      console.error('Error loading admin platform data:', err);
      setLoadError('تعذر تحديث بيانات لوحة الإدارة مؤقتاً.');
    } finally {
      setIsRefreshing(false);
    }
  }, [isAdmin, user?.id, user?.role]);

  useEffect(() => {
    loadPlatformData();
  }, [loadPlatformData]);

  // If user is not admin, deny access with clear 403 Forbidden message
  if (!user || !isAdmin) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center p-4 bg-gray-50" dir={isRtl ? 'rtl' : 'ltr'}>
        <div className="bg-white border border-gray-200 rounded-3xl p-8 max-w-md w-full text-center shadow-lg">
          <div className="w-16 h-16 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-red-100">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h2 className="text-lg font-black text-gray-900 mb-2">
            403 — Unauthorized Access
          </h2>
          <p className="text-xs text-gray-500 mb-6 leading-relaxed">
            This administrative control center is strictly protected. Only authorized administrators with ADMIN or SUPER_ADMIN role can access platform governance.
          </p>
          <button
            onClick={() => onNavigate('/')}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-xl font-bold text-xs transition shadow-xs flex items-center justify-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Return to Marketplace</span>
          </button>
        </div>
      </div>
    );
  }

  // Count badges for sidebar
  const pendingSellersCount = stores.filter((s) => s.status === 'pending').length;
  const pendingOrdersCount = orders.filter((o) => o.status === 'pending').length;
  const pendingPaymentsCount = submissions.filter((s) => s.status === 'PAYMENT_REFERENCE_SUBMITTED').length;
  const pendingPayoutsCount = payouts.filter((p) => p.status === 'pending').length;

  const counts: Record<string, number> = {
    sellers: pendingSellersCount,
    orders: pendingOrdersCount,
    payments: pendingPaymentsCount,
    payouts: pendingPayoutsCount,
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Top Header */}
      <AdminHeader
        currentTab={activeTab}
        onOpenMobileMenu={() => setIsMobileSidebarOpen(true)}
        dateRange={dateRange}
        onDateRangeChange={setDateRange}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        userEmail={user.email}
        userRole={user.role}
        onRefresh={loadPlatformData}
        isRefreshing={isRefreshing}
      />

      {/* Main Body with Sidebar + Content Area */}
      <div className="flex-1 flex max-w-7xl w-full mx-auto p-4 sm:p-6 gap-6">
        {/* Sidebar Navigation */}
        <AdminSidebar
          activeTab={activeTab}
          onSelectTab={handleTabChange}
          userRole={user.role}
          counts={counts}
          isMobileOpen={isMobileSidebarOpen}
          onCloseMobile={() => setIsMobileSidebarOpen(false)}
        />

        {/* Content Container */}
        <main className="flex-1 min-w-0">
          {loadError && (
            <div className="mb-4 p-3.5 bg-amber-50 border border-amber-200 text-amber-900 rounded-2xl flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>{loadError}</span>
              </div>
              <button
                onClick={loadPlatformData}
                className="px-2.5 py-1 bg-amber-600 text-white rounded-lg font-medium hover:bg-amber-700 transition cursor-pointer"
              >
                إعادة المحاولة
              </button>
            </div>
          )}

          <ErrorBoundary onReset={loadPlatformData}>
            {activeTab === 'overview' && (
              <AdminOverviewSection
                orders={orders}
                stores={stores}
                products={products}
                users={users}
                submissions={submissions}
                paymentSubmissions={submissions}
                payouts={payouts}
                onNavigateTab={handleTabChange}
              />
            )}

            {activeTab === 'users' && (
              <AdminUsersSection
                users={users}
                currentUser={user}
                onRefresh={loadPlatformData}
                searchQuery={searchQuery}
              />
            )}

          {activeTab === 'sellers' && (
            <AdminSellersSection
              stores={stores}
              currentUser={user}
              onRefresh={loadPlatformData}
              searchQuery={searchQuery}
            />
          )}

          {activeTab === 'stores' && (
            <AdminStoresSection
              stores={stores}
              currentUser={user}
              onRefresh={loadPlatformData}
              searchQuery={searchQuery}
            />
          )}

          {activeTab === 'restaurants' && (
            <AdminRestaurantsSection
              stores={stores}
              currentUser={user}
              onRefresh={loadPlatformData}
              searchQuery={searchQuery}
            />
          )}

          {activeTab === 'services' && (
            <AdminServicesSection
              stores={stores}
              currentUser={user}
              onRefresh={loadPlatformData}
              searchQuery={searchQuery}
            />
          )}

          {activeTab === 'bookings' && (
            <AdminBookingsSection
              bookings={bookings}
              currentUser={user}
              onRefresh={loadPlatformData}
              searchQuery={searchQuery}
            />
          )}

          {activeTab === 'products' && (
            <AdminProductsSection
              products={products}
              currentUser={user}
              onRefresh={loadPlatformData}
              searchQuery={searchQuery}
            />
          )}

          {activeTab === 'orders' && (
            <AdminOrdersSection
              orders={orders}
              currentUser={user}
              onRefresh={loadPlatformData}
              searchQuery={searchQuery}
            />
          )}

          {activeTab === 'payments' && (
            <AdminPaymentsSection
              submissions={submissions}
              currentUser={user}
              onRefresh={loadPlatformData}
              searchQuery={searchQuery}
            />
          )}

          {activeTab === 'payouts' && (
            <AdminPayoutsSection
              payouts={payouts}
              currentUser={user}
              onRefresh={loadPlatformData}
              searchQuery={searchQuery}
            />
          )}

          {activeTab === 'monetization' && (
            <AdminMonetizationSection />
          )}

          {activeTab === 'reviews' && (
            <AdminReviewsSection
              reviews={reviews}
              currentUser={user}
              onRefresh={loadPlatformData}
              searchQuery={searchQuery}
            />
          )}

          {activeTab === 'delivery' && (
            <AdminDeliverySection
              orders={orders}
              currentUser={user}
              onRefresh={loadPlatformData}
              searchQuery={searchQuery}
            />
          )}

          {activeTab === 'audit' && (
            <AdminAuditSection searchQuery={searchQuery} />
          )}

          {activeTab === 'reports' && (
            <AdminReportsSection
              currentUser={user}
              searchQuery={searchQuery}
            />
          )}

          {activeTab === 'settings' && (
            <AdminSettingsSection
              currentUser={user}
              onRefresh={loadPlatformData}
            />
          )}
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
};
