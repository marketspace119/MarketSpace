import React from 'react';
import { ShoppingBag, ArrowRight, ShieldCheck, Sparkles, Truck, UtensilsCrossed, Tag } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';

interface HeroBannerProps {
  onExplore: () => void;
}

export const HeroBanner: React.FC<HeroBannerProps> = ({ onExplore }) => {
  const { t } = useLanguage();

  return (
    <section className="relative overflow-hidden my-4 sm:my-6 rounded-2xl sm:rounded-3xl bg-gradient-to-br from-[#0E11B7] via-[#1D35D8] to-[#0B1120] text-white shadow-xl">
      {/* Subtle Background Lighting Accent */}
      <div className="absolute top-0 end-0 w-96 h-96 bg-blue-400/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 start-1/4 w-80 h-80 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />

      <div className="relative max-w-7xl mx-auto px-6 py-10 sm:py-16 md:py-20 grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
        {/* Copy Column */}
        <div className="md:col-span-7 flex flex-col items-start gap-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-xs font-bold text-blue-200">
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            <span>{t('specialOffer')}</span>
          </div>

          <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black tracking-tight leading-[1.08]">
            {t('heroTitle')}
          </h1>

          <p className="text-sm sm:text-base md:text-lg text-blue-100/90 max-w-xl leading-relaxed">
            {t('heroDesc')}
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="button"
              onClick={onExplore}
              className="h-12 px-7 rounded-full bg-white text-[#0E11B7] hover:bg-blue-50 font-black text-sm flex items-center gap-2 shadow-lg shadow-black/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
            >
              <ShoppingBag className="w-4 h-4" />
              <span>{t('shopNow')}</span>
              <ArrowRight className="w-4 h-4 rtl:rotate-180" />
            </button>

            <button
              type="button"
              onClick={() => {
                window.location.hash = '#/offers';
              }}
              className="h-12 px-6 rounded-full bg-white/10 hover:bg-white/20 border border-white/25 text-white font-bold text-sm flex items-center gap-2 backdrop-blur-xs transition-colors"
            >
              <Tag className="w-4 h-4 text-amber-300" />
              <span>{t('exploreOffers')}</span>
            </button>
          </div>
        </div>

        {/* Art Graphic Column */}
        <div className="md:col-span-5 relative flex items-center justify-center">
          <div className="relative w-full max-w-[380px] aspect-square rounded-3xl bg-white/5 border border-white/15 p-6 backdrop-blur-xs flex items-center justify-center shadow-2xl">
            {/* Center Shopping Bag Visual */}
            <div className="relative w-40 h-36 rounded-2xl bg-gradient-to-b from-[#2563EB] to-[#121B90] border border-white/30 shadow-2xl flex flex-col items-center justify-center text-white">
              {/* Bag Handle */}
              <div className="absolute -top-7 w-16 h-10 border-[6px] border-blue-300 border-b-0 rounded-t-full" />
              <div className="w-12 h-12 rounded-xl bg-white/15 border border-white/25 flex items-center justify-center font-black text-2xl tracking-wider">
                MS
              </div>
              <div className="w-20 h-1 bg-white/30 rounded-full mt-3" />
            </div>

            {/* Floating Tags */}
            <div className="absolute top-4 start-4 px-3 py-1.5 rounded-xl bg-gradient-to-r from-rose-500 to-rose-600 text-white text-xs font-black shadow-lg border border-white/20 -rotate-6 animate-pulse-subtle">
              SALE 50% OFF
            </div>

            <div className="absolute bottom-6 end-4 px-3 py-1.5 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 text-white text-xs font-black shadow-lg border border-white/20 rotate-6">
              HOT DEALS 2026
            </div>

            <div className="absolute top-10 end-4 px-2.5 py-1 rounded-full bg-slate-900/80 border border-white/20 text-xs font-bold text-orange-300 flex items-center gap-1.5 backdrop-blur-md">
              <UtensilsCrossed className="w-3.5 h-3.5 text-orange-400" />
              <span>Meals & Food</span>
            </div>

            <div className="absolute bottom-10 start-4 px-2.5 py-1 rounded-full bg-slate-900/80 border border-white/20 text-xs font-bold text-emerald-300 flex items-center gap-1.5 backdrop-blur-md">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Verified Sellers</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
