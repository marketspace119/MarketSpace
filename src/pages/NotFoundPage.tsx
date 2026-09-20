import React from 'react';
import { Compass, Home, ShoppingBag, Search, Store } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

interface NotFoundPageProps {
  onNavigate: (path: string) => void;
  attemptedPath?: string;
}

export const NotFoundPage: React.FC<NotFoundPageProps> = ({ onNavigate, attemptedPath }) => {
  const { t, language } = useLanguage();

  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center text-center px-4 py-16">
      <div className="relative mb-6">
        <div className="w-24 h-24 rounded-3xl bg-blue-50 dark:bg-blue-950/40 flex items-center justify-center border border-blue-100 dark:border-blue-900/60 shadow-inner">
          <Compass className="w-12 h-12 text-[#0E11B7] dark:text-blue-400 animate-pulse" />
        </div>
        <span className="absolute -bottom-2 -right-2 px-2.5 py-0.5 rounded-full text-xs font-black bg-[#0E11B7] text-white shadow">
          404
        </span>
      </div>

      <h1 className="text-3xl sm:text-4xl font-black text-gray-900 dark:text-white mb-3">
        {t('pageNotFound')}
      </h1>

      <p className="text-gray-600 dark:text-gray-400 max-w-md text-sm sm:text-base mb-8 leading-relaxed">
        {t('pageNotFoundDesc')}
      </p>

      {attemptedPath && attemptedPath !== '/' && (
        <div className="mb-6 px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-xs text-gray-500 font-mono">
          {attemptedPath}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => onNavigate('/')}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#0E11B7] hover:bg-[#070A86] text-white font-bold text-sm shadow-md transition-all active:scale-95"
        >
          <Home className="w-4 h-4" />
          <span>{t('backToHome')}</span>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('/shop')}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-700 font-bold text-sm shadow-sm transition-all active:scale-95"
        >
          <ShoppingBag className="w-4 h-4 text-[#0E11B7] dark:text-blue-400" />
          <span>{t('shop')}</span>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('/stores')}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-700 font-bold text-sm shadow-sm transition-all active:scale-95"
        >
          <Store className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          <span>{t('stores')}</span>
        </button>
      </div>
    </div>
  );
};
