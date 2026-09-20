import React, { useState } from 'react';
import { Shield, Store as StoreIcon, Utensils, Briefcase, User as UserIcon, LogOut, ChevronDown, Check, Sparkles } from 'lucide-react';
import { useAuth, DEMO_ACCOUNTS } from '../../context/AuthContext';
import { UserRole } from '../../types';
import { useLanguage } from '../../i18n/LanguageContext';

interface RoleSwitcherBannerProps {
  onNavigate?: (path: string) => void;
}

export const RoleSwitcherBanner: React.FC<RoleSwitcherBannerProps> = ({ onNavigate }) => {
  // In production builds, disable role switcher unless explicitly enabled via environment variable
  const metaEnv = (import.meta as unknown as { env?: { PROD?: boolean; VITE_ENABLE_DEV_ROLE_SWITCHER?: string } }).env;
  const isProd = metaEnv?.PROD;
  const isDevExplicitlyAllowed = metaEnv?.VITE_ENABLE_DEV_ROLE_SWITCHER === 'true';

  if (isProd && !isDevExplicitlyAllowed) {
    return null;
  }

  const { user, switchDemoRole, logout } = useAuth();
  const { t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);

  const rolesList: { role: UserRole; labelAr: string; labelEn: string; icon: any; color: string }[] = [
    { role: 'CUSTOMER', labelAr: 'عميل (Customer)', labelEn: 'Customer', icon: UserIcon, color: 'text-blue-500' },
    { role: 'SELLER', labelAr: 'بائع متجر (Retail Seller)', labelEn: 'Store Seller', icon: StoreIcon, color: 'text-emerald-500' },
    { role: 'RESTAURANT', labelAr: 'مطعم (Restaurant Owner)', labelEn: 'Restaurant', icon: Utensils, color: 'text-amber-500' },
    { role: 'SERVICE_PROVIDER', labelAr: 'مقدم خدمة (Service Provider)', labelEn: 'Service Provider', icon: Briefcase, color: 'text-purple-500' },
    { role: 'ADMIN', labelAr: 'مدير المنصة (Marketplace Admin)', labelEn: 'Admin', icon: Shield, color: 'text-rose-500' },
    { role: 'SUPER_ADMIN', labelAr: 'المدير العام (Super Admin)', labelEn: 'Super Admin', icon: Sparkles, color: 'text-indigo-500' },
  ];

  const currentRoleInfo = rolesList.find(r => r.role === user?.role) || rolesList[0];

  const handleNav = (path: string) => {
    if (onNavigate) {
      onNavigate(path);
    } else {
      window.location.hash = path;
    }
  };

  return (
    <div className="bg-[#0B1120] border-b border-gray-800 text-xs py-1.5 px-4 text-gray-300">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2">
        {/* Left Side: Current Role Indicator & Switcher */}
        <div className="flex items-center gap-2 relative">
          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 border border-amber-500/30 text-amber-300 tracking-wider">
            DEV SANDBOX
          </span>
          <span className="text-gray-400 hidden sm:inline">{t('switchRole')}:</span>
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="flex items-center gap-1.5 bg-gray-800 hover:bg-gray-700 text-white px-2.5 py-1 rounded-md border border-gray-700 transition"
          >
            <currentRoleInfo.icon className={`w-3.5 h-3.5 ${currentRoleInfo.color}`} />
            <span className="font-medium">{user ? `${user.name} (${user.role})` : 'Guest / Visitor'}</span>
            <ChevronDown className="w-3 h-3 text-gray-400" />
          </button>

          {/* Dropdown Menu */}
          {isOpen && (
            <div className="absolute top-full start-0 mt-1 w-64 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl py-1 z-50 text-xs">
              <div className="px-3 py-1.5 border-b border-gray-800 text-[11px] font-semibold text-gray-400">
                اختر دوراً للاختبار وتتبع الصلاحيات:
              </div>
              {rolesList.map(item => {
                const isSelected = user?.role === item.role;
                const Icon = item.icon;
                return (
                  <button
                    key={item.role}
                    onClick={() => {
                      switchDemoRole(item.role);
                      setIsOpen(false);
                      if (item.role === 'ADMIN' || item.role === 'SUPER_ADMIN') {
                        handleNav('/admin');
                      } else if (item.role === 'SELLER' || item.role === 'RESTAURANT' || item.role === 'SERVICE_PROVIDER') {
                        handleNav('/seller-dashboard');
                      }
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 hover:bg-gray-800 transition ${
                      isSelected ? 'bg-gray-800/80 text-white font-semibold' : 'text-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Icon className={`w-4 h-4 ${item.color}`} />
                      <span>{item.labelAr}</span>
                    </div>
                    {isSelected && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                  </button>
                );
              })}
              {user && (
                <div className="border-t border-gray-800 mt-1 pt-1">
                  <button
                    onClick={() => {
                      logout();
                      setIsOpen(false);
                      handleNav('/');
                    }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-rose-400 hover:bg-gray-800 transition"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>{t('logout')}</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Side: Quick Action Links based on Role */}
        <div className="flex items-center gap-3">
          {(user?.role === 'SELLER' || user?.role === 'RESTAURANT' || user?.role === 'SERVICE_PROVIDER') && (
            <button
              onClick={() => handleNav('/seller-dashboard')}
              className="bg-[#0E11B7] hover:bg-[#0c0ea3] text-white px-2.5 py-0.5 rounded font-medium transition flex items-center gap-1"
            >
              <StoreIcon className="w-3 h-3" />
              {t('sellerDashboard')}
            </button>
          )}

          {(user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN') && (
            <button
              onClick={() => handleNav('/admin')}
              className="bg-rose-600 hover:bg-rose-700 text-white px-2.5 py-0.5 rounded font-medium transition flex items-center gap-1"
            >
              <Shield className="w-3 h-3" />
              {t('adminDashboard')}
            </button>
          )}

          {(!user || user.role === 'CUSTOMER') && (
            <button
              onClick={() => handleNav('/become-seller')}
              className="text-amber-400 hover:text-amber-300 font-medium transition flex items-center gap-1"
            >
              <StoreIcon className="w-3 h-3" />
              {t('becomeSeller')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
