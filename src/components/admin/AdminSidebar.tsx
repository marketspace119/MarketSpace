import React from 'react';
import {
  LayoutDashboard,
  Users,
  UserCheck,
  Store as StoreIcon,
  Utensils,
  Wrench,
  Package,
  ShoppingBag,
  CalendarCheck,
  CreditCard,
  Banknote,
  DollarSign,
  Star,
  Truck,
  BarChart3,
  Settings,
  ShieldAlert,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  ArrowRight,
  ArrowLeft
} from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import { UserRole } from '../../types';

export type AdminTab =
  | 'overview'
  | 'users'
  | 'sellers'
  | 'stores'
  | 'restaurants'
  | 'services'
  | 'products'
  | 'orders'
  | 'bookings'
  | 'payments'
  | 'payouts'
  | 'monetization'
  | 'reviews'
  | 'delivery'
  | 'reports'
  | 'settings'
  | 'audit'
  | 'audit-log';

interface AdminSidebarProps {
  activeTab?: AdminTab;
  currentTab?: AdminTab;
  onSelectTab: (tab: AdminTab) => void;
  userRole: UserRole;
  counts?: Record<string, number>;
  pendingCounts?: {
    sellers?: number;
    payments?: number;
    payouts?: number;
    reviews?: number;
    orders?: number;
    [key: string]: number | undefined;
  };
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export const AdminSidebar: React.FC<AdminSidebarProps> = ({
  activeTab,
  currentTab,
  onSelectTab,
  userRole,
  counts,
  pendingCounts = {},
  isMobileOpen = false,
  onCloseMobile,
}) => {
  const { t, isRTL } = useLanguage();
  const effectiveTab = activeTab || currentTab || 'overview';
  const effectiveCounts = counts || pendingCounts || {};

  const navItems: {
    id: AdminTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number;
    superAdminOnly?: boolean;
  }[] = [
    { id: 'overview', label: t('adminNavOverview'), icon: LayoutDashboard },
    { id: 'users', label: t('adminNavUsers'), icon: Users },
    { id: 'sellers', label: t('adminNavSellers'), icon: UserCheck, badge: effectiveCounts.sellers },
    { id: 'stores', label: t('adminNavStores'), icon: StoreIcon },
    { id: 'restaurants', label: t('adminNavRestaurants'), icon: Utensils },
    { id: 'services', label: t('adminNavServices'), icon: Wrench },
    { id: 'products', label: t('adminNavProducts'), icon: Package },
    { id: 'orders', label: t('adminNavOrders'), icon: ShoppingBag, badge: effectiveCounts.orders },
    { id: 'bookings', label: t('adminNavBookings'), icon: CalendarCheck },
    { id: 'payments', label: t('adminNavPayments'), icon: CreditCard, badge: effectiveCounts.payments },
    { id: 'payouts', label: t('adminNavPayouts'), icon: Banknote, badge: effectiveCounts.payouts },
    { id: 'monetization', label: isRTL ? 'الربح والاشتراكات' : 'Monetization & Plans', icon: DollarSign, badge: effectiveCounts.monetization },
    { id: 'reviews', label: t('adminNavReviews'), icon: Star, badge: effectiveCounts.reviews },
    { id: 'delivery', label: t('adminNavDelivery'), icon: Truck },
    { id: 'reports', label: t('adminNavReports'), icon: BarChart3 },
    { id: 'settings', label: t('adminNavSettings'), icon: Settings, superAdminOnly: true },
    { id: 'audit', label: t('adminNavAuditLog'), icon: ShieldAlert },
  ];

  const handleItemClick = (id: AdminTab) => {
    onSelectTab(id);
    if (onCloseMobile) onCloseMobile();
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden backdrop-blur-xs"
          onClick={onCloseMobile}
        />
      )}

      {/* Sidebar Container */}
      <aside
        id="admin-sidebar"
        className={`fixed top-0 bottom-0 z-40 flex flex-col w-64 bg-gray-900 text-gray-200 shadow-2xl transition-all duration-300 ease-in-out lg:static lg:translate-x-0 ${
          isRTL ? 'right-0' : 'left-0'
        } ${
          isMobileOpen
            ? 'translate-x-0'
            : isRTL
            ? 'translate-x-full lg:translate-x-0'
            : '-translate-x-full lg:translate-x-0'
        }`}
        dir={isRTL ? 'rtl' : 'ltr'}
      >
        {/* Header Branding */}
        <div className="flex items-center justify-between h-16 px-4 border-b border-gray-800 bg-gray-950/60">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-indigo-500 text-white font-black shadow-md shadow-indigo-500/20">
              M
            </div>
            <div>
              <h2 className="text-sm font-bold text-white tracking-tight">MarketSpace</h2>
              <p className="text-[11px] text-gray-400 font-medium">Control Center</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className={`px-2 py-0.5 text-[10px] font-bold rounded-md border ${
                userRole === 'SUPER_ADMIN'
                  ? 'bg-purple-900/50 text-purple-200 border-purple-700/50'
                  : 'bg-indigo-900/50 text-indigo-200 border-indigo-700/50'
              }`}
            >
              {userRole === 'SUPER_ADMIN' ? 'SUPER' : 'ADMIN'}
            </span>
          </div>
        </div>

        {/* Back to Marketplace Link */}
        <div className="p-3 border-b border-gray-800/80">
          <a
            id="link-marketplace-return"
            href="#/"
            className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-gray-400 hover:text-white bg-gray-800/40 hover:bg-gray-800 rounded-xl transition-colors group"
          >
            {isRTL ? (
              <ArrowRight className="w-4 h-4 text-gray-400 group-hover:-translate-x-0.5 transition-transform" />
            ) : (
              <ArrowLeft className="w-4 h-4 text-gray-400 group-hover:-translate-x-0.5 transition-transform" />
            )}
            <span>{t('adminBackToHome')}</span>
          </a>
        </div>

        {/* Navigation Items List */}
        <div className="flex-1 px-3 py-3 space-y-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-800">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = effectiveTab === item.id || (item.id === 'audit' && effectiveTab === 'audit-log');
            const isSuperOnly = item.superAdminOnly && userRole !== 'SUPER_ADMIN';

            return (
              <button
                id={`admin-nav-${item.id}`}
                key={item.id}
                onClick={() => handleItemClick(item.id)}
                disabled={isSuperOnly}
                className={`relative flex items-center justify-between w-full px-3 py-2.5 rounded-xl text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-indigo-600 text-white font-semibold shadow-md shadow-indigo-600/30'
                    : isSuperOnly
                    ? 'text-gray-500 opacity-50 cursor-not-allowed'
                    : 'text-gray-300 hover:bg-gray-800/70 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-gray-400'}`} />
                  <span className="truncate">{item.label}</span>
                </div>

                {item.badge !== undefined && item.badge > 0 && (
                  <span
                    className={`ml-2 px-2 py-0.5 text-[10px] font-bold rounded-full ${
                      isActive
                        ? 'bg-white text-indigo-600'
                        : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}

                {item.superAdminOnly && (
                  <span className="text-[10px] text-purple-400 font-semibold px-1 rounded bg-purple-950/60 border border-purple-800/40">
                    S
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Footer info */}
        <div className="p-3 border-t border-gray-800 bg-gray-950/50">
          <div className="flex items-center gap-2.5 px-2 py-1.5 text-gray-400">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-gray-200 truncate">Governance Active</p>
              <p className="text-[10px] text-gray-500 truncate">Immutable Audit Trail</p>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};
