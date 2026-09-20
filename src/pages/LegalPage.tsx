import React from 'react';
import { Shield, FileText, RotateCcw, CheckCircle2, ChevronLeft, ChevronRight } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

interface LegalPageProps {
  type: 'terms' | 'privacy' | 'returns' | 'faq';
  onNavigate: (path: string) => void;
}

export const LegalPage: React.FC<LegalPageProps> = ({ type, onNavigate }) => {
  const { language, isRTL } = useLanguage();

  const getTitle = () => {
    switch (type) {
      case 'terms':
        return language === 'ar' ? 'الشروط والأحكام' : language === 'so' ? 'Shuruudaha & Xeerarka' : 'Terms & Conditions';
      case 'privacy':
        return language === 'ar' ? 'سياسة الخصوصية وحماية البيانات' : language === 'so' ? 'Xeerka Khaaska ah' : 'Privacy Policy';
      case 'returns':
        return language === 'ar' ? 'سياسة الإرجاع والاستبدال' : language === 'so' ? 'Xeerka Celinta Alaabta' : 'Return & Refund Policy';
      case 'faq':
        return language === 'ar' ? 'الأسئلة الشائعة' : language === 'so' ? 'Su\'aalaha Badan la Isweydiiyo' : 'Frequently Asked Questions';
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 animate-fadeIn">
      {/* Breadcrumb */}
      <button
        type="button"
        onClick={() => onNavigate('/')}
        className="inline-flex items-center gap-1.5 text-xs font-bold text-[#0E11B7] dark:text-[#3B82F6] mb-6 hover:underline"
      >
        {isRTL ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        <span>{language === 'ar' ? 'العودة للرئيسية' : 'Back to Home'}</span>
      </button>

      <div className="p-6 sm:p-10 rounded-3xl bg-white dark:bg-[#151A23] border border-gray-200 dark:border-[#293142] shadow-sm space-y-8 text-gray-800 dark:text-gray-200 text-sm leading-relaxed">
        <div className="border-b border-gray-100 dark:border-[#293142] pb-6">
          <div className="w-12 h-12 rounded-2xl bg-[#EEF2FF] dark:bg-[#0E11B7]/20 text-[#0E11B7] dark:text-[#3B82F6] flex items-center justify-center mb-3">
            {type === 'terms' && <FileText className="w-6 h-6" />}
            {type === 'privacy' && <Shield className="w-6 h-6" />}
            {type === 'returns' && <RotateCcw className="w-6 h-6" />}
            {type === 'faq' && <CheckCircle2 className="w-6 h-6" />}
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white">
            {getTitle()}
          </h1>
          <p className="text-xs text-gray-400 mt-1">
            {language === 'ar' ? 'آخر تحديث: سبتمبر 2026' : 'Last updated: September 2026'}
          </p>
        </div>

        {type === 'terms' && (
          <div className="space-y-6">
            <section className="space-y-2">
              <h2 className="text-base font-bold text-gray-900 dark:text-white">
                {language === 'ar' ? '1. مقدمة وقبول الشروط' : '1. Introduction & Acceptance'}
              </h2>
              <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                {language === 'ar'
                  ? 'مرحباً بكم في منصة MarketSpace. باستخدامك لمنصتنا أو إنشاء حساب أو شراء منتجات، فإنك توافق على الالتزام الكامل بهذه الشروط والسياسات. تخضع جميع المعاملات للقوانين واللوائح السارية.'
                  : 'Welcome to MarketSpace. By using our platform, creating an account, or placing orders, you agree to abide fully by these terms and regulations.'}
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-bold text-gray-900 dark:text-white">
                {language === 'ar' ? '2. نموذج السوق متعدد التجار (Multi-Vendor)' : '2. Multi-Vendor Marketplace Model'}
              </h2>
              <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                {language === 'ar'
                  ? 'تعمل MarketSpace كمنصة وسيطة تربط المشترين بالمتاجر والمطاعم ومقدمي الخدمات المعتمدين. كل بائع يتحمل المسؤولية القانونية الكاملة عن جودة منتجاته ومطابقتها للمواصفات المعلنة.'
                  : 'MarketSpace acts as a verified intermediary platform connecting buyers with verified merchants, restaurants, and service providers.'}
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-bold text-gray-900 dark:text-white">
                {language === 'ar' ? '3. سياسة الدفع وتأكيد الحوالات' : '3. Payment & Mobile Transfer Policy'}
              </h2>
              <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                {language === 'ar'
                  ? 'عند الدفع عبر المحافظ الإلكترونية (EVC Plus, Zaad, Sahal)، يجب تحويل المبلغ لرقم الحساب المعتمد وتقديم رقم مرجع التحويل (Reference Number). لا يعتبر الطلب مؤكداً حتى مراجعة واعتماد العملية.'
                  : 'When paying via mobile money, transfers must be made to the designated merchant accounts and validated with the SMS reference.'}
              </p>
            </section>
          </div>
        )}

        {type === 'privacy' && (
          <div className="space-y-6">
            <section className="space-y-2">
              <h2 className="text-base font-bold text-gray-900 dark:text-white">
                {language === 'ar' ? '1. حماية وتشفير البيانات' : '1. Data Protection & Encryption'}
              </h2>
              <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                {language === 'ar'
                  ? 'نلتزم في MarketSpace بحماية خصوصية عملائنا وشركائنا بأعلى معايير الأمان وقواعد التحكم في الوصول (RBAC). لا نقوم ببيع أو مشاركة بياناتك الشخصية مع أي طرف ثالث خارج نطاق إتمام التوصيل.'
                  : 'We strictly protect user privacy using high-standard encryption and role-based access control (RBAC). We never sell or share user data.'}
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-bold text-gray-900 dark:text-white">
                {language === 'ar' ? '2. البيانات التي نقوم بجمعها' : '2. Information We Collect'}
              </h2>
              <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                {language === 'ar'
                  ? 'نجمع فقط البيانات الضرورية لإتمام طلبات الشراء، مثل: الاسم، رقم الهاتف، عنوان التوصيل، ومعلومات التفضيلات. لا نقوم بتخزين أي أرقام سرية للمحافظ أو البطاقات.'
                  : 'We only collect essential details to fulfill orders: name, phone, shipping address, and preferences.'}
              </p>
            </section>
          </div>
        )}

        {type === 'returns' && (
          <div className="space-y-6">
            <section className="space-y-2">
              <h2 className="text-base font-bold text-gray-900 dark:text-white">
                {language === 'ar' ? '1. فترة الإرجاع والاستبدال' : '1. Return Window'}
              </h2>
              <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                {language === 'ar'
                  ? 'يحق للعميل طلب إرجاع أو استبدال المنتج خلال 48 ساعة من استلام الشحنة في حال وجود عيب مصنعي أو اختلاف عن المواصفات المعروضة، بشرط بقاء المنتج في حالته وتغليفه الأصلي.'
                  : 'Customers may request a return or exchange within 48 hours of delivery if items are defective or mismatch description, provided original packaging is intact.'}
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-bold text-gray-900 dark:text-white">
                {language === 'ar' ? '2. استثناءات الإرجاع' : '2. Non-returnable Items'}
              </h2>
              <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                {language === 'ar'
                  ? 'لا يمكن إرجاع الوجبات الغذائية الجاهزة أو مستحضرات التجميل المفتوحة أو الخدمات التي تم تنفيذها بالفعل، وذلك لأسباب تتعلق بالصحة والسلامة العامة.'
                  : 'Prepared food items, opened cosmetics, and completed services cannot be returned due to hygiene and health regulations.'}
              </p>
            </section>
          </div>
        )}

        {type === 'faq' && (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-gray-50 dark:bg-[#111722] space-y-1">
              <h3 className="font-bold text-xs text-gray-900 dark:text-white">
                {language === 'ar' ? 'كم يستغرق التوصيل داخل مقديشو والمدن الصومالية؟' : 'How long does delivery take?'}
              </h3>
              <p className="text-xs text-gray-500">
                {language === 'ar' ? 'يستغرق التوصيل الداخلي داخل المدينة بين 2 إلى 4 ساعات للوجبات والطلبات العاجلة، و 24 ساعة للمنتجات العامة.' : 'Deliveries within city limits take between 2-4 hours for meals and same-day for general retail items.'}
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-gray-50 dark:bg-[#111722] space-y-1">
              <h3 className="font-bold text-xs text-gray-900 dark:text-white">
                {language === 'ar' ? 'كيف أستطيع تتبع طلبي؟' : 'How can I track my order?'}
              </h3>
              <p className="text-xs text-gray-500">
                {language === 'ar' ? 'يمكنك تتبع شحنتك بالضغط على زر "طلباتي" في الأعلى، أو إدخال كود الطلب المكون من رقم MS في خانة تتبع الشحنات.' : 'Click "My Orders" in the header or enter your order ID in the tracking search.'}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
