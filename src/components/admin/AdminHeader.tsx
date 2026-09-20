import React from 'react';
import { Menu, Search, Calendar, Shield, ExternalLink, RefreshCw } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import { UserRole } from '../../types';
import { AdminTab } from './AdminSidebar';

interface AdminHeaderProps {
  currentTab: AdminTab;
  onOpenMobileMenu: () => void;
  dateRange: 'today' | '7days' | '30days' | 'all';
  onDateRangeChange: (range: 'today' | '7days' | '30days' | 'all') => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  userEmail?: string;
  userRole?: UserRole;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export const AdminHeader: React.FC<AdminHeaderProps> = ({
  currentTab,
  onOpenMobileMenu,
  dateRange,
  onDateRangeChange,
  searchQuery,
  onSearchChange,
  userEmail,
  userRole,
  onRefresh,
  isRefreshing = false,
}) => {
  const { t, isRtl } = useLanguage();

  const tabTitles: Record<AdminTab, string> = {
    overview: t('adminNavOverview'),
    users: t('adminNavUsers'),
    sellers: t('adminNavSellers'),
    stores: t('adminNavStores'),
    restaurants: t('adminNavRestaurants'),
    services: t('adminNavServices'),
    products: t('adminNavProducts'),
    orders: t('adminNavOrders'),
    bookings: t('adminNavBookings'),
    payments: t('adminNavPayments'),
    payouts: t('adminNavPayouts'),
    monetization: isRtl ? 'الربح والاشتراكات' : 'Monetization & Plans',
    reviews: t('adminNavReviews'),
    delivery: t('adminNavDelivery'),
    reports: t('adminNavReports'),
    settings: t('adminNavSettings'),
    audit: t('adminNavAuditLog'),
    'audit-log': t('adminNavAuditLog'),
  };

  return (
    <header
      id="admin-header"
      className="sticky top-0 z-30 flex items-center justify-between h-16 px-4 md:px-6 bg-white border-b border-gray-200 shadow-xs"
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      <div className="flex items-center gap-3">
        {/* Mobile menu toggle */}
        <button
          id="admin-mobile-menu-toggle"
          onClick={onOpenMobileMenu}
          className="p-2 text-gray-600 rounded-xl lg:hidden hover:bg-gray-100 transition-colors"
          aria-label="Open sidebar"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div>
          <h1 className="text-base md:text-lg font-bold text-gray-900 leading-tight">
            {tabTitles[currentTab] || t('adminControlCenter')}
          </h1>
          <p className="hidden sm:block text-xs text-gray-500 font-medium">
            {t('adminSubtitle')}
          </p>
        </div>
      </div>

      {/* Right controls: Search, Date Filter, User Info, Refresh */}
      <div className="flex items-center gap-2 md:gap-3">
        {/* Search Bar */}
        <div className="relative hidden md:block w-44 lg:w-64">
          <Search className={`absolute top-2.5 w-4 h-4 text-gray-400 ${isRtl ? 'right-3' : 'left-3'}`} />
          <input
            id="admin-global-search"
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t('searchPlaceholder')}
            className={`w-full py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500 transition-all ${
              isRtl ? 'pr-9 pl-3' : 'pl-9 pr-3'
            }`}
          />
        </div>

        {/* Date Filter selector */}
        <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl text-xs">
          <Calendar className="w-3.5 h-3.5 text-gray-500 ml-1.5 mr-0.5 hidden sm:inline-block" />
          <button
            onClick={() => onDateRangeChange('today')}
            className={`px-2 py-1 rounded-lg font-medium transition-all ${
              dateRange === 'today' ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {t('dateFilterToday')}
          </button>
          <button
            onClick={() => onDateRangeChange('7days')}
            className={`px-2 py-1 rounded-lg font-medium transition-all ${
              dateRange === '7days' ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {t('dateFilter7Days')}
          </button>
          <button
            onClick={() => onDateRangeChange('30days')}
            className={`hidden md:inline-block px-2 py-1 rounded-lg font-medium transition-all ${
              dateRange === '30days' ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {t('dateFilter30Days')}
          </button>
          <button
            onClick={() => onDateRangeChange('all')}
            className={`px-2 py-1 rounded-lg font-medium transition-all ${
              dateRange === 'all' ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {t('dateFilterAll')}
          </button>
        </div>

        {/* Refresh button */}
        {onRefresh && (
          <button
            id="admin-refresh-data-btn"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="p-2 text-gray-500 hover:text-gray-700 bg-gray-50 hover:bg-gray-100 rounded-xl border border-gray-200 transition-colors"
            title="Refresh data"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-indigo-600' : ''}`} />
          </button>
        )}

        {/* User Identity info badge */}
        <div className="hidden lg:flex items-center gap-2 pl-2 border-l border-gray-200">
          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 font-bold text-xs">
            {userEmail ? userEmail[0].toUpperCase() : 'A'}
          </div>
          <div className="text-left">
            <p className="text-xs font-semibold text-gray-800 truncate max-w-[120px]">
              {userEmail || 'Admin'}
            </p>
            <p className="text-[10px] text-gray-400 font-medium">
              {userRole === 'SUPER_ADMIN' ? 'Super Admin' : 'Admin'}
            </p>
          </div>
        </div>
      </div>
    </header>
  );
};
