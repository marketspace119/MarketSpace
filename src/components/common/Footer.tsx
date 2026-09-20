import React from 'react';
import {
  MapPin,
  Phone,
  Mail,
  MessageSquare,
  Facebook,
  Instagram,
  Twitter,
  Linkedin,
  ShieldCheck,
  Truck,
  RotateCcw,
  Headphones,
  CreditCard,
} from 'lucide-react';
import { MarketSpaceLogo } from './MarketSpaceLogo';
import { useLanguage } from '../../i18n/LanguageContext';

interface FooterProps {
  onNavigate: (path: string) => void;
}

export const Footer: React.FC<FooterProps> = ({ onNavigate }) => {
  const { t } = useLanguage();

  const currentYear = new Date().getFullYear();

  return (
    <footer className="mt-16 bg-[#0B1120] text-gray-300 border-t border-gray-800">
      {/* Service Highlights / Value Props Bar */}
      <div className="border-b border-gray-800/80 py-8 bg-[#0F172A]">
        <div className="max-w-7xl mx-auto px-4 grid grid-cols-2 md:grid-cols-4 gap-6">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-[#0E11B7]/20 border border-[#0E11B7]/40 flex items-center justify-center text-[#3B82F6] flex-shrink-0">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-white text-xs font-bold sm:text-sm">{t('freeShipping')}</h4>
              <p className="text-gray-400 text-xs">{t('freeShippingNotice')}</p>
            </div>
          </div>

          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 flex-shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-white text-xs font-bold sm:text-sm">دفع آمن ومضمون</h4>
              <p className="text-gray-400 text-xs">EVC Plus، كاش عند الاستلام، بطاقات</p>
            </div>
          </div>

          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 flex-shrink-0">
              <RotateCcw className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-white text-xs font-bold sm:text-sm">إرجاع وفحص معتمد</h4>
              <p className="text-gray-400 text-xs">فحص الجودة لكافة المنتجات</p>
            </div>
          </div>

          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400 flex-shrink-0">
              <Headphones className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-white text-xs font-bold sm:text-sm">خدمة عملاء 24/7</h4>
              <p className="text-gray-400 text-xs">دعم مباشر عبر واتساب والهاتف</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Footer Content */}
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 lg:gap-12">
          {/* Brand Col */}
          <div className="md:col-span-4 flex flex-col gap-4">
            <div
              onClick={() => onNavigate('/')}
              className="cursor-pointer"
            >
              <MarketSpaceLogo variant="light" showTagline />
            </div>

            <p className="text-gray-400 text-xs sm:text-sm leading-relaxed">
              {t('footerDesc')}
            </p>

            {/* Social Icons */}
            <div className="flex items-center gap-2 mt-2">
              <a
                href="#"
                aria-label="Facebook"
                className="w-9 h-9 rounded-full bg-gray-800 hover:bg-[#0E11B7] text-gray-300 hover:text-white flex items-center justify-center transition-colors"
              >
                <Facebook className="w-4 h-4" />
              </a>
              <a
                href="#"
                aria-label="Instagram"
                className="w-9 h-9 rounded-full bg-gray-800 hover:bg-[#E11D48] text-gray-300 hover:text-white flex items-center justify-center transition-colors"
              >
                <Instagram className="w-4 h-4" />
              </a>
              <a
                href="#"
                aria-label="Twitter"
                className="w-9 h-9 rounded-full bg-gray-800 hover:bg-sky-500 text-gray-300 hover:text-white flex items-center justify-center transition-colors"
              >
                <Twitter className="w-4 h-4" />
              </a>
              <a
                href="#"
                aria-label="LinkedIn"
                className="w-9 h-9 rounded-full bg-gray-800 hover:bg-[#0077B5] text-gray-300 hover:text-white flex items-center justify-center transition-colors"
              >
                <Linkedin className="w-4 h-4" />
              </a>
              <a
                href="https://wa.me/252612494952"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="WhatsApp"
                className="w-9 h-9 rounded-full bg-gray-800 hover:bg-emerald-600 text-gray-300 hover:text-white flex items-center justify-center transition-colors"
              >
                <MessageSquare className="w-4 h-4" />
              </a>
            </div>
          </div>

          {/* Quick Links */}
          <div className="md:col-span-2 flex flex-col gap-3">
            <h3 className="text-white font-black text-sm uppercase tracking-wider">
              {t('shop')}
            </h3>
            <ul className="space-y-2 text-xs">
              <li>
                <button
                  onClick={() => onNavigate('/shop')}
                  className="hover:text-white transition-colors"
                >
                  {t('allShopProducts')}
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('/shop/new')}
                  className="hover:text-white transition-colors"
                >
                  {t('breadcrumbNew')}
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('/shop/used')}
                  className="hover:text-white transition-colors"
                >
                  {t('breadcrumbUsed')}
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('/shop/dropshipping')}
                  className="hover:text-white transition-colors"
                >
                  {t('breadcrumbDropshipping')}
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('/restaurants')}
                  className="hover:text-white transition-colors"
                >
                  {t('restaurants')}
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('/stores')}
                  className="hover:text-white transition-colors"
                >
                  {t('stores')}
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('/services')}
                  className="hover:text-white transition-colors"
                >
                  {t('services')}
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('/offers')}
                  className="text-rose-400 hover:text-rose-300 font-bold transition-colors"
                >
                  {t('offers')} 🔥
                </button>
              </li>
            </ul>
          </div>

          {/* Company & Support Links */}
          <div className="md:col-span-2 flex flex-col gap-3">
            <h3 className="text-white font-black text-sm uppercase tracking-wider">
              {t('about')}
            </h3>
            <ul className="space-y-2 text-xs">
              <li>
                <button
                  onClick={() => onNavigate('/about')}
                  className="hover:text-white transition-colors"
                >
                  {t('about')}
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('/contact')}
                  className="hover:text-white transition-colors"
                >
                  {t('contact')}
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('/orders')}
                  className="hover:text-white transition-colors"
                >
                  {t('trackOrder')}
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('/favorites')}
                  className="hover:text-white transition-colors"
                >
                  {t('wishlist')}
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('/terms')}
                  className="hover:text-white transition-colors"
                >
                  {t('terms')}
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('/privacy')}
                  className="hover:text-white transition-colors"
                >
                  {t('privacy')}
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('/returns')}
                  className="hover:text-white transition-colors"
                >
                  سياسة الإرجاع
                </button>
              </li>
            </ul>
          </div>

          {/* Contact Details Col */}
          <div className="md:col-span-4 flex flex-col gap-3.5">
            <h3 className="text-white font-black text-sm uppercase tracking-wider">
              {t('contact')}
            </h3>

            <div className="flex flex-col gap-2.5 text-xs text-gray-400">
              <div className="flex items-start gap-2.5">
                <MapPin className="w-4 h-4 text-[#3B82F6] flex-shrink-0 mt-0.5" />
                <span>
                  <strong className="text-white block">{t('headOffice')}</strong>
                  {t('addressValue')}
                </span>
              </div>

              <div className="flex items-center gap-2.5">
                <Phone className="w-4 h-4 text-[#3B82F6] flex-shrink-0" />
                <a href="tel:+252612494952" className="hover:text-white transition-colors">
                  {t('phoneValue')}
                </a>
              </div>

              <div className="flex items-center gap-2.5">
                <Mail className="w-4 h-4 text-[#3B82F6] flex-shrink-0" />
                <a href="mailto:MarketSpace119@gmail.com" className="hover:text-white transition-colors">
                  {t('emailValue')}
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Bar: Copyright and Payment methods */}
        <div className="mt-12 pt-6 border-t border-gray-800/80 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-gray-500">
          <p>{t('allRightsReserved')}</p>

          {/* Payment Badges Representation */}
          <div className="flex items-center gap-2 text-gray-400 text-[11px] font-semibold">
            <span className="px-2 py-1 rounded bg-gray-800 border border-gray-700">EVC Plus</span>
            <span className="px-2 py-1 rounded bg-gray-800 border border-gray-700">Zaad</span>
            <span className="px-2 py-1 rounded bg-gray-800 border border-gray-700">Sahal</span>
            <span className="px-2 py-1 rounded bg-gray-800 border border-gray-700">Visa / Mastercard</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
