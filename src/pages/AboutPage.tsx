import React from 'react';
import { MarketSpaceLogo } from '../components/common/MarketSpaceLogo';
import { ShieldCheck, Truck, UtensilsCrossed, Globe, Headphones, Building } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

export const AboutPage: React.FC<{ onNavigate: (path: string) => void }> = ({ onNavigate }) => {
  const { t } = useLanguage();

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-12 animate-fadeIn">
      {/* Intro Banner */}
      <div className="text-center space-y-4 max-w-2xl mx-auto">
        <div className="flex justify-center mb-2">
          <MarketSpaceLogo size="lg" showTagline />
        </div>
        <h1 className="text-3xl sm:text-4xl font-black text-gray-900 dark:text-white">
          عن منصة MarketSpace
        </h1>
        <p className="text-sm sm:text-base text-gray-600 dark:text-gray-300 leading-relaxed">
          سوق رقمي متكامل يجمع بين التجارة الإلكترونية، طلبات المطاعم، خدمات الدروبشيبينغ العالمية، الخدمات التقنية، ومعدات المستعمل، بهدف تمكين المستهلكين والتجار في الصومال والقرن الإفريقي.
        </p>
      </div>

      {/* Core Pillars */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="p-6 rounded-3xl bg-white dark:bg-[#151A23] border border-gray-200 dark:border-[#293142] shadow-xs space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-[#0E11B7]/15 text-[#0E11B7] flex items-center justify-center">
            <Globe className="w-6 h-6" />
          </div>
          <h3 className="font-black text-base text-gray-900 dark:text-white">
            ربط الأسواق المحلية والعالمية
          </h3>
          <p className="text-xs text-gray-500 leading-relaxed">
            نوفر قنوات طلب مباشرة من Shein و AliExpress و Alibaba وتوصيلها إلى باب منزلك في مقديشو وكافة الأقاليم مع خيارات دفع محلية.
          </p>
        </div>

        <div className="p-6 rounded-3xl bg-white dark:bg-[#151A23] border border-gray-200 dark:border-[#293142] shadow-xs space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 text-emerald-600 flex items-center justify-center">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <h3 className="font-black text-base text-gray-900 dark:text-white">
            أمان وموثوقية المعاملات
          </h3>
          <p className="text-xs text-gray-500 leading-relaxed">
            حماية كاملة للمشتريات مع دعم الدفع عبر الهاتف EVC Plus و Zaad والدفع عند الاستلام بعد معاينة المنتج.
          </p>
        </div>

        <div className="p-6 rounded-3xl bg-white dark:bg-[#151A23] border border-gray-200 dark:border-[#293142] shadow-xs space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/15 text-amber-600 flex items-center justify-center">
            <Truck className="w-6 h-6" />
          </div>
          <h3 className="font-black text-base text-gray-900 dark:text-white">
            سرعة التوصيل وخدمة العملاء
          </h3>
          <p className="text-xs text-gray-500 leading-relaxed">
            فريق لوجستي متخصص يوفر توصيلاً سريعاً لوجبات المطاعم، والطرود البريدية، ودعماً مستمراً عبر تطبيق واتساب على مدار الساعة.
          </p>
        </div>
      </div>

      {/* Head Office Information Card */}
      <div className="p-8 rounded-3xl bg-gradient-to-br from-[#0E11B7] to-[#080B66] text-white space-y-4">
        <div className="flex items-center gap-3">
          <Building className="w-7 h-7 text-blue-200" />
          <h2 className="text-xl sm:text-2xl font-black">
            المقر الرئيسي للمنصة
          </h2>
        </div>
        <p className="text-xs sm:text-sm text-blue-100 max-w-2xl leading-relaxed">
          يقع المكتب الرئيسي لمنصة MarketSpace في العاصمة الصومالية مقديشو، شارع تاليح. نرحب بزيارة العملاء والشركاء التجاريين لمناقشة فرص التعاون وفتح المتاجر.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-white/20 text-xs">
          <div>
            <span className="block text-blue-300 font-bold">العنوان:</span>
            <span>حي تاليح، مقديشو، الصومال</span>
          </div>
          <div>
            <span className="block text-blue-300 font-bold">الهاتف:</span>
            <span>+252 612 4949 52 / 53</span>
          </div>
          <div>
            <span className="block text-blue-300 font-bold">البريد الإلكتروني:</span>
            <span>MarketSpace119@gmail.com</span>
          </div>
        </div>
      </div>
    </div>
  );
};
