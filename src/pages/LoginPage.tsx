import React, { useState } from 'react';
import { LogIn, UserPlus, Shield, CheckCircle2, AlertCircle, Eye, EyeOff, Store, Utensils, Wrench, User as UserIcon } from 'lucide-react';
import { useAuth, DEMO_ACCOUNTS } from '../context/AuthContext';
import { useLanguage } from '../i18n/LanguageContext';
import { UserRole } from '../types';

interface LoginPageProps {
  onNavigate: (path: string) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onNavigate }) => {
  const { user, login, register, logout, switchDemoRole } = useAuth();
  const { t, language } = useLanguage();

  const metaEnv = (import.meta as unknown as { env?: { PROD?: boolean; VITE_ENABLE_DEV_ROLE_SWITCHER?: string } }).env;
  const isProd = metaEnv?.PROD;
  const isDevExplicitlyAllowed = metaEnv?.VITE_ENABLE_DEV_ROLE_SWITCHER === 'true';
  const showDemoAccounts = !isProd || isDevExplicitlyAllowed;

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!email.trim()) {
      setErrorMessage(language === 'ar' ? 'الرجاء إدخال البريد الإلكتروني' : 'Please enter your email address');
      return;
    }

    setIsLoading(true);

    try {
      if (mode === 'login') {
        await login(email.trim(), password);
        setSuccessMessage(language === 'ar' ? 'تم تسجيل الدخول بنجاح' : 'Logged in successfully');
        setTimeout(() => {
          onNavigate('/');
        }, 600);
      } else {
        if (!name.trim()) {
          setErrorMessage(language === 'ar' ? 'الرجاء إدخال الاسم' : 'Please enter your name');
          setIsLoading(false);
          return;
        }
        await register({
          name: name.trim(),
          email: email.trim(),
          password: password || undefined,
          phone: phone.trim() || undefined,
        });
        setSuccessMessage(language === 'ar' ? 'تم إنشاء الحساب بنجاح' : 'Account created successfully');
        setTimeout(() => {
          onNavigate('/');
        }, 600);
      }
    } catch (err: any) {
      setErrorMessage(err.message || (language === 'ar' ? 'فشلت عملية المصادقة' : 'Authentication failed'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickRole = (role: UserRole) => {
    switchDemoRole(role);
    setSuccessMessage(
      language === 'ar' 
        ? `تم التبديل إلى حساب التجربة: ${DEMO_ACCOUNTS[role].name}`
        : `Switched to demo account: ${DEMO_ACCOUNTS[role].name}`
    );
  };

  const roleIcons: Record<UserRole, React.ReactNode> = {
    CUSTOMER: <UserIcon className="w-3.5 h-3.5" />,
    SELLER: <Store className="w-3.5 h-3.5 text-blue-500" />,
    RESTAURANT: <Utensils className="w-3.5 h-3.5 text-amber-500" />,
    SERVICE_PROVIDER: <Wrench className="w-3.5 h-3.5 text-emerald-500" />,
    ADMIN: <Shield className="w-3.5 h-3.5 text-rose-500" />,
    SUPER_ADMIN: <Shield className="w-3.5 h-3.5 text-purple-500" />,
  };

  return (
    <div className="min-h-[75vh] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md bg-white dark:bg-[#151A23] rounded-3xl border border-gray-200 dark:border-[#293142] p-6 sm:p-8 shadow-xl">
        {user ? (
          <div className="text-center space-y-5">
            <div className="w-16 h-16 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto border border-emerald-100 dark:border-emerald-900/60">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <div>
              <h2 className="text-2xl font-black text-gray-900 dark:text-white">
                {language === 'ar' ? 'أنت مسجل الدخول حالياً' : 'Currently Signed In'}
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {user.name} ({user.email})
              </p>
              <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-blue-50 dark:bg-blue-950/50 text-[#0E11B7] dark:text-blue-400 border border-blue-100 dark:border-blue-900/50">
                {roleIcons[user.role]}
                <span>{user.role}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={() => onNavigate('/orders')}
                className="py-3 px-4 rounded-xl bg-[#0E11B7] hover:bg-[#070A86] text-white font-bold text-sm shadow transition-all active:scale-95"
              >
                {language === 'ar' ? 'طلباتي' : 'My Orders'}
              </button>

              <button
                type="button"
                onClick={async () => {
                  await logout();
                  setSuccessMessage(language === 'ar' ? 'تم تسجيل الخروج بنجاح' : 'Logged out successfully');
                }}
                className="py-3 px-4 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-bold text-sm transition-all active:scale-95"
              >
                {t('logout')}
              </button>
            </div>
          </div>
        ) : (
          <div>
            {/* Mode Switcher */}
            <div className="flex rounded-2xl bg-gray-100 dark:bg-gray-800/80 p-1 mb-6">
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setErrorMessage(null);
                  setSuccessMessage(null);
                }}
                className={`flex-1 py-2.5 rounded-xl font-black text-xs sm:text-sm transition-all flex items-center justify-center gap-1.5 ${
                  mode === 'login'
                    ? 'bg-white dark:bg-[#151A23] text-gray-900 dark:text-white shadow-xs'
                    : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                <LogIn className="w-4 h-4" />
                <span>{t('login')}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setMode('register');
                  setErrorMessage(null);
                  setSuccessMessage(null);
                }}
                className={`flex-1 py-2.5 rounded-xl font-black text-xs sm:text-sm transition-all flex items-center justify-center gap-1.5 ${
                  mode === 'register'
                    ? 'bg-white dark:bg-[#151A23] text-gray-900 dark:text-white shadow-xs'
                    : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                <UserPlus className="w-4 h-4" />
                <span>{t('register')}</span>
              </button>
            </div>

            <div className="mb-6">
              <h1 className="text-2xl font-black text-gray-900 dark:text-white">
                {mode === 'login' ? t('login') : t('register')}
              </h1>
              <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-1">
                {mode === 'login'
                  ? (language === 'ar' ? 'سجل دخولك لمتابعة طلباتك ومحفظتك' : 'Sign in to access your orders and account')
                  : (language === 'ar' ? 'أنشئ حساباً جديداً لبدء التسوق' : 'Create an account to start shopping')}
              </p>
            </div>

            {errorMessage && (
              <div className="mb-4 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 flex items-start gap-2.5 text-rose-700 dark:text-rose-400 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{errorMessage}</span>
              </div>
            )}

            {successMessage && (
              <div className="mb-4 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/50 flex items-start gap-2.5 text-emerald-700 dark:text-emerald-400 text-xs">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{successMessage}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === 'register' && (
                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">
                    {language === 'ar' ? 'الاسم الكامل' : 'Full Name'} *
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ahmed Noor"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-[#0E11B7] focus:outline-none"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">
                  {language === 'ar' ? 'البريد الإلكتروني' : 'Email Address'} *
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-[#0E11B7] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">
                  {language === 'ar' ? 'كلمة المرور' : 'Password'} {mode === 'login' ? '' : '(6+ chars)'}
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-[#0E11B7] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 end-3 flex items-center text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {mode === 'register' && (
                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">
                    {language === 'ar' ? 'رقم الهاتف (اختياري)' : 'Phone Number (Optional)'}
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+252 61..."
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-[#0E11B7] focus:outline-none"
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 px-4 rounded-xl bg-[#0E11B7] hover:bg-[#070A86] text-white font-extrabold text-sm shadow-md transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed mt-2"
              >
                {isLoading ? '...' : mode === 'login' ? t('login') : t('register')}
              </button>
            </form>

            {/* Quick Demo Switcher for Reviewers (Sandbox/Dev only) */}
            {showDemoAccounts && (
              <div className="mt-8 pt-6 border-t border-gray-100 dark:border-[#293142]">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold text-gray-500 dark:text-gray-400">
                    {language === 'ar' ? 'حسابات التجربة السريعة (Sandbox):' : 'Quick Demo Accounts (Sandbox):'}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {(Object.keys(DEMO_ACCOUNTS) as UserRole[]).map((role) => (
                    <button
                      key={role}
                      type="button"
                      onClick={() => handleQuickRole(role)}
                      className="flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-start border border-gray-200 dark:border-[#293142] hover:border-[#0E11B7] dark:hover:border-blue-500 bg-gray-50 dark:bg-[#111722] text-xs font-semibold text-gray-700 dark:text-gray-300 transition-all active:scale-95"
                    >
                      {roleIcons[role]}
                      <span className="truncate">{role}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
