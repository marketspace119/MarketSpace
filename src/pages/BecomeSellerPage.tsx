import React, { useState } from 'react';
import {
  Store as StoreIcon,
  Utensils,
  Briefcase,
  Tag,
  CheckCircle2,
  Clock,
  ShieldCheck,
  ArrowRight,
  ArrowLeft,
  Upload,
  Sparkles,
  Phone,
  MessageCircle,
  MapPin,
  Building2,
} from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { SellerType, Store } from '../types';
import { storeService } from '../services/storeService';
import { sellerApplicationService } from '../services/sellerApplicationService';
import { updatePageSEO } from '../services/seo';

interface BecomeSellerPageProps {
  onNavigate: (path: string) => void;
}

export const BecomeSellerPage: React.FC<BecomeSellerPageProps> = ({ onNavigate }) => {
  const { language, t } = useLanguage();
  const { user, login, updateUser } = useAuth();

  const [step, setStep] = useState<number>(1);
  const [sellerType, setSellerType] = useState<SellerType>('store');
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    descAr: '',
    descEn: '',
    descSo: '',
    phone: '+252 61 ',
    whatsapp: '+25261',
    email: user?.email || '',
    city: 'Mogadishu',
    district: 'Taleh',
    addressAr: 'شارع تاليح، مقديشو',
    addressEn: 'Taleh Street, Mogadishu',
    addressSo: 'Jidka Taleex, Muqdisho',
    openingHours: '08:00 AM - 10:00 PM',
    category: 'general',
    deliveryAvailable: true,
    deliveryFee: 2.0,
    minOrder: 10.0,
    logo: 'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=300&q=80',
    cover: 'https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&w=1200&q=80',
  });

  const [submittedStore, setSubmittedStore] = useState<Store | null>(null);

  React.useEffect(() => {
    updatePageSEO({
      title: `${t('becomeSeller')} | MarketSpace Multi-Vendor Platform`,
      description: 'انضم كبائع أو مطعم أو مقدم خدمة في منصة MarketSpace وابدأ تجارتك الرقمية مع وصول لآلاف العملاء في الصومال والشرق الأوسط.',
      type: 'website',
      language,
    });
  }, [language, t]);

  const sellerTypesList: {
    type: SellerType;
    titleAr: string;
    titleEn: string;
    descAr: string;
    descEn: string;
    icon: any;
    accent: string;
  }[] = [
    {
      type: 'store',
      titleAr: 'متجر تجاري (Retail Store)',
      titleEn: 'Retail Store',
      descAr: 'لمبيعات مستحضرات التجميل، الإلكترونيات، الأزياء، والعطور مع إدارة المخزون والمقاسات والألوان.',
      descEn: 'Sell cosmetics, electronics, apparel, and goods with inventory, sizes, and colors management.',
      icon: StoreIcon,
      accent: 'emerald',
    },
    {
      type: 'restaurant',
      titleAr: 'مطعم أو مقهى (Restaurant & Food)',
      titleEn: 'Restaurant & Food',
      descAr: 'لإدارة قائمة الوجبات، الأطباق اليومية، الإضافات (Add-ons)، وأوقات التوصيل ورسوم الشحن.',
      descEn: 'Manage food menu, daily dishes, addons, delivery times, and local restaurant orders.',
      icon: Utensils,
      accent: 'amber',
    },
    {
      type: 'service',
      titleAr: 'مقدم خدمات (Service Provider)',
      titleEn: 'Service Provider',
      descAr: 'للمبرمجين، المصممين، شركات النقل، الصيانة، والاستشارات مع نظام الحجوزات المباشر.',
      descEn: 'For IT, developers, designers, logistics, repairs, and consulting with direct booking.',
      icon: Briefcase,
      accent: 'purple',
    },
    {
      type: 'classified',
      titleAr: 'سوق المستعمل والإعلانات (Classifieds)',
      titleEn: 'Used & Classifieds',
      descAr: 'لبيع وشراء السيارات المستعملة، العقارات، الأجهزة الشخصية، والوظائف مع تفاوض مباشر.',
      descEn: 'Post used vehicles, properties, gadgets, and classified listings with direct contact.',
      icon: Tag,
      accent: 'blue',
    },
  ];

  const handleCreateStore = (e: React.FormEvent) => {
    e.preventDefault();
    const userId = user?.id || `usr_seller_${Date.now()}`;

    const newStore = storeService.createStore({
      slug: formData.slug || formData.name.toLowerCase().replace(/\s+/g, '-'),
      name: formData.name,
      sellerId: userId,
      sellerType,
      logo: formData.logo,
      cover: formData.cover,
      description: {
        ar: formData.descAr || formData.name,
        en: formData.descEn || formData.name,
        so: formData.descSo || formData.name,
      },
      phone: formData.phone,
      whatsapp: formData.whatsapp,
      email: formData.email,
      city: formData.city,
      district: formData.district,
      address: {
        ar: formData.addressAr,
        en: formData.addressEn,
        so: formData.addressSo,
      },
      openingHours: formData.openingHours,
      category: formData.category,
      categories: [formData.category],
      deliveryAvailable: formData.deliveryAvailable,
      deliveryFee: Number(formData.deliveryFee),
      minOrder: Number(formData.minOrder),
      paymentMethods: ['evc_plus', 'zaad', 'cash_on_delivery'],
    });

    // Create formal seller application in Firestore
    sellerApplicationService.createApplication({
      userId,
      userName: user?.name || formData.name,
      sellerType,
      businessName: formData.name,
      phone: formData.phone,
      email: formData.email,
      location: `${formData.city}, ${formData.district}`,
      description: formData.descAr || formData.descEn || '',
    }).catch(console.warn);

    // Update user profile
    if (user) {
      updateUser({
        storeId: newStore.id,
        sellerType,
        sellerStatus: 'pending',
      });
    }

    setSubmittedStore(newStore);
    setStep(4);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0B1120] py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        {/* Header Title */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900 text-[#0E11B7] dark:text-blue-400 px-4 py-1.5 rounded-full text-xs font-semibold mb-3">
            <Sparkles className="w-3.5 h-3.5" />
            MarketSpace Multi-Vendor Ecosystem
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 dark:text-white tracking-tight">
            {language === 'ar' ? 'افتح متجرك أو نشاطك على MarketSpace' : 'Launch Your Business on MarketSpace'}
          </h1>
          <p className="mt-3 text-gray-600 dark:text-gray-400 max-w-2xl mx-auto text-sm sm:text-base">
            {language === 'ar'
              ? 'سواء كنت تملك متجراً للمنتجات، أو مطعماً للأطعمة، أو تقدم خدمات احترافية، منصة MarketSpace تمنحك كافة الأدوات الرقمية للنمو.'
              : 'Whether you run a retail shop, a restaurant, or offer professional services, MarketSpace equips you with modern commerce tools.'}
          </p>
        </div>

        {/* Stepper Progress Bar */}
        <div className="mb-10">
          <div className="flex items-center justify-between relative">
            <div className="absolute top-1/2 left-0 right-0 h-1 bg-gray-200 dark:bg-gray-800 -translate-y-1/2 z-0" />
            {[
              { num: 1, label: language === 'ar' ? 'نوع النشاط' : 'Business Type' },
              { num: 2, label: language === 'ar' ? 'بيانات المتجر' : 'Store Details' },
              { num: 3, label: language === 'ar' ? 'التوصيل والتواصل' : 'Delivery & Contact' },
              { num: 4, label: language === 'ar' ? 'المراجعة والاعتماد' : 'Review & Status' },
            ].map(s => {
              const isActive = step === s.num;
              const isDone = step > s.num;
              return (
                <div key={s.num} className="relative z-10 flex flex-col items-center">
                  <div
                    className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm transition-all ${
                      isDone
                        ? 'bg-emerald-600 text-white'
                        : isActive
                        ? 'bg-[#0E11B7] text-white ring-4 ring-blue-100 dark:ring-blue-900/40'
                        : 'bg-white dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-700 text-gray-500'
                    }`}
                  >
                    {isDone ? <CheckCircle2 className="w-5 h-5" /> : s.num}
                  </div>
                  <span className={`text-xs mt-2 font-medium ${isActive ? 'text-[#0E11B7] dark:text-blue-400 font-bold' : 'text-gray-500'}`}>
                    {s.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Step 1: Choose Seller Type */}
        {step === 1 && (
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 sm:p-8 shadow-sm">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
              {language === 'ar' ? 'الخطوة 1: حدد نوع نشاطك التجاري' : 'Step 1: Select Your Business Category'}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
              {language === 'ar'
                ? 'يوفر كل نوع تجربة مخصصة لك ولعملائك مع أدوات مناسبة لنوع المنتجات أو الوجبات أو الخدمات.'
                : 'Each seller type unlocks tailored dashboards and customer ordering interfaces.'}
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
              {sellerTypesList.map(item => {
                const isSelected = sellerType === item.type;
                const Icon = item.icon;
                return (
                  <div
                    key={item.type}
                    onClick={() => setSellerType(item.type)}
                    className={`cursor-pointer rounded-xl p-5 border-2 transition-all ${
                      isSelected
                        ? 'border-[#0E11B7] bg-blue-50/40 dark:bg-blue-950/30 shadow-md ring-1 ring-[#0E11B7]'
                        : 'border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 bg-gray-50/50 dark:bg-gray-800/40'
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      <div className={`p-3 rounded-lg ${isSelected ? 'bg-[#0E11B7] text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'}`}>
                        <Icon className="w-6 h-6" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <h3 className="font-bold text-gray-900 dark:text-white text-base">
                            {language === 'ar' ? item.titleAr : item.titleEn}
                          </h3>
                          {isSelected && <CheckCircle2 className="w-5 h-5 text-[#0E11B7]" />}
                        </div>
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1.5 leading-relaxed">
                          {language === 'ar' ? item.descAr : item.descEn}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="bg-[#0E11B7] hover:bg-[#0c0ea3] text-white px-6 py-2.5 rounded-xl font-semibold text-sm transition flex items-center gap-2 shadow-lg shadow-blue-600/20"
              >
                <span>{language === 'ar' ? 'المتابعة للخطوة التالية' : 'Next Step'}</span>
                <ArrowRight className="w-4 h-4 rtl:rotate-180" />
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Store Identity & Profile */}
        {step === 2 && (
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 sm:p-8 shadow-sm">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
              {language === 'ar' ? 'الخطوة 2: هوية وبيانات النشاط' : 'Step 2: Business Profile & Identity'}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
              {language === 'ar' ? 'أدخل اسم متجرك ورابط الصفحة والصور الترويجية' : 'Enter your store name, URL slug, and brand visuals'}
            </p>

            <div className="space-y-4 mb-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    {language === 'ar' ? 'اسم المتجر / المطعم / مقدم الخدمة *' : 'Business / Store Name *'}
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={e => {
                      const val = e.target.value;
                      setFormData(prev => ({
                        ...prev,
                        name: val,
                        slug: prev.slug || val.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-'),
                      }));
                    }}
                    placeholder={language === 'ar' ? 'مثال: روز كوزمتكس، أو كافيه السلطان' : 'e.g. Rose Cosmetics'}
                    className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-[#0E11B7] outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    {language === 'ar' ? 'رابط المتجر المخصص (URL Slug) *' : 'Store URL Slug *'}
                  </label>
                  <div className="flex items-center bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg overflow-hidden text-xs">
                    <span className="px-2.5 py-2 text-gray-500 bg-gray-100 dark:bg-gray-700/50 border-r dark:border-gray-700">
                      marketspace.so/store/
                    </span>
                    <input
                      type="text"
                      required
                      value={formData.slug}
                      onChange={e => setFormData({ ...formData, slug: e.target.value.toLowerCase().replace(/\s+/g, '-') })}
                      placeholder="rose-cosmetics"
                      className="w-full bg-transparent px-2 py-2 text-sm text-gray-900 dark:text-white outline-none"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  {language === 'ar' ? 'الوصف بالعربية *' : 'Description (Arabic) *'}
                </label>
                <textarea
                  rows={2}
                  value={formData.descAr}
                  onChange={e => setFormData({ ...formData, descAr: e.target.value })}
                  placeholder="نبذة مختصرة عن المنتجات وجودتها والخدمات المقدمة..."
                  className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-[#0E11B7] outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  {language === 'ar' ? 'الوصف بالإنجليزية أو الصومالية' : 'Description (English or Somali)'}
                </label>
                <textarea
                  rows={2}
                  value={formData.descEn}
                  onChange={e => setFormData({ ...formData, descEn: e.target.value, descSo: e.target.value })}
                  placeholder="Brief description about your offerings..."
                  className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-[#0E11B7] outline-none"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    {language === 'ar' ? 'رابط شعار المتجر (Logo URL)' : 'Logo Image URL'}
                  </label>
                  <input
                    type="url"
                    value={formData.logo}
                    onChange={e => setFormData({ ...formData, logo: e.target.value })}
                    className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-[#0E11B7] outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    {language === 'ar' ? 'رابط صورة الغلاف (Cover Banner URL)' : 'Cover Banner URL'}
                  </label>
                  <input
                    type="url"
                    value={formData.cover}
                    onChange={e => setFormData({ ...formData, cover: e.target.value })}
                    className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-[#0E11B7] outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="px-4 py-2 rounded-xl text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
              >
                {language === 'ar' ? 'رجوع' : 'Back'}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!formData.name) {
                    alert('يرجى إدخال اسم المتجر للمتابعة');
                    return;
                  }
                  setStep(3);
                }}
                className="bg-[#0E11B7] hover:bg-[#0c0ea3] text-white px-6 py-2.5 rounded-xl font-semibold text-sm transition flex items-center gap-2 shadow-lg shadow-blue-600/20"
              >
                <span>{language === 'ar' ? 'التالي: معلومات التواصل والتوصيل' : 'Next: Contact & Delivery'}</span>
                <ArrowRight className="w-4 h-4 rtl:rotate-180" />
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Contact & Delivery Settings */}
        {step === 3 && (
          <form onSubmit={handleCreateStore} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 sm:p-8 shadow-sm">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
              {language === 'ar' ? 'الخطوة 3: معلومات التواصل والتوصيل' : 'Step 3: Contact, Hours & Delivery'}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
              {language === 'ar' ? 'حدد رقم الهاتف، الواتساب لتلقي الطلبات، وأوقات العمل والمدينة' : 'Specify contact hotline, WhatsApp order line, and operating hours'}
            </p>

            <div className="space-y-4 mb-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1 flex items-center gap-1">
                    <Phone className="w-3.5 h-3.5 text-blue-600" />
                    {language === 'ar' ? 'رقم الهاتف المعتمد *' : 'Phone Number *'}
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.phone}
                    onChange={e => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-[#0E11B7] outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1 flex items-center gap-1">
                    <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                    {language === 'ar' ? 'رقم الواتساب للطلبات المباشرة *' : 'WhatsApp for Orders *'}
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.whatsapp}
                    onChange={e => setFormData({ ...formData, whatsapp: e.target.value })}
                    className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-[#0E11B7] outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    {language === 'ar' ? 'المدينة *' : 'City *'}
                  </label>
                  <select
                    value={formData.city}
                    onChange={e => setFormData({ ...formData, city: e.target.value })}
                    className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-[#0E11B7] outline-none"
                  >
                    <option value="Mogadishu">Mogadishu (مقديشو)</option>
                    <option value="Hargeisa">Hargeisa (هرجيسا)</option>
                    <option value="Garowe">Garowe (غاروي)</option>
                    <option value="Kismayo">Kismayo (كسمايو)</option>
                    <option value="Bosaso">Bosaso (بوساسو)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    {language === 'ar' ? 'الحي أو المنطقة *' : 'District *'}
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.district}
                    onChange={e => setFormData({ ...formData, district: e.target.value })}
                    placeholder="Taleh, KM4, Hodan..."
                    className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-[#0E11B7] outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-amber-500" />
                    {language === 'ar' ? 'ساعات العمل *' : 'Opening Hours *'}
                  </label>
                  <input
                    type="text"
                    value={formData.openingHours}
                    onChange={e => setFormData({ ...formData, openingHours: e.target.value })}
                    placeholder="08:00 AM - 10:00 PM"
                    className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-[#0E11B7] outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                <div className="bg-gray-50 dark:bg-gray-800/60 p-4 rounded-xl border border-gray-200 dark:border-gray-700/60">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">
                      {language === 'ar' ? 'خدمة التوصيل للعملاء' : 'Delivery Service'}
                    </span>
                    <input
                      type="checkbox"
                      checked={formData.deliveryAvailable}
                      onChange={e => setFormData({ ...formData, deliveryAvailable: e.target.checked })}
                      className="w-4 h-4 text-[#0E11B7] rounded focus:ring-blue-500"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-500">
                      {language === 'ar' ? 'رسوم التوصيل الافتراضية ($):' : 'Default Delivery Fee ($):'}
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      value={formData.deliveryFee}
                      onChange={e => setFormData({ ...formData, deliveryFee: Number(e.target.value) })}
                      className="w-20 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded px-2 py-1 text-sm text-gray-900 dark:text-white outline-none"
                    />
                  </div>
                </div>

                <div className="bg-gray-50 dark:bg-gray-800/60 p-4 rounded-xl border border-gray-200 dark:border-gray-700/60">
                  <span className="block text-sm font-semibold text-gray-900 dark:text-white mb-2">
                    {language === 'ar' ? 'الحد الأدنى للطلب ($)' : 'Minimum Order Amount ($)'}
                  </span>
                  <input
                    type="number"
                    min="0"
                    value={formData.minOrder}
                    onChange={e => setFormData({ ...formData, minOrder: Number(e.target.value) })}
                    className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded px-3 py-1.5 text-sm text-gray-900 dark:text-white outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="px-4 py-2 rounded-xl text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
              >
                {language === 'ar' ? 'رجوع' : 'Back'}
              </button>
              <button
                type="submit"
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-2.5 rounded-xl font-bold text-sm transition flex items-center gap-2 shadow-lg shadow-emerald-600/20"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{language === 'ar' ? 'إرسال طلب الانضمام للمراجعة' : 'Submit for Review'}</span>
              </button>
            </div>
          </form>
        )}

        {/* Step 4: Submission Confirmation & Status */}
        {step === 4 && submittedStore && (
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-8 text-center shadow-lg">
            <div className="w-16 h-16 bg-amber-100 dark:bg-amber-950/60 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <Clock className="w-8 h-8 animate-pulse" />
            </div>

            <h2 className="text-2xl font-black text-gray-900 dark:text-white mb-2">
              {language === 'ar' ? 'تم استلام طلب متجرك بنجاح!' : 'Your Application Has Been Received!'}
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 max-w-md mx-auto mb-6">
              {language === 'ar'
                ? `طلب فتح المتجر "${submittedStore.name}" قيد مراجعة فريق الإدارة للتحقق من هوية النشاط والتراخيص وفق سياسات المنصة.`
                : `Your store application for "${submittedStore.name}" is currently under review by our moderation team.`}
            </p>

            <div className="bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 rounded-xl p-4 max-w-sm mx-auto mb-8 text-start text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-500">معرف النشاط:</span>
                <span className="font-mono font-bold text-gray-900 dark:text-white">{submittedStore.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">الرابط المخصص:</span>
                <span className="font-mono text-blue-600 dark:text-blue-400">/store/{submittedStore.slug}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">الحالة الحالية:</span>
                <span className="inline-flex items-center gap-1 bg-amber-50 dark:bg-amber-950/50 text-amber-600 px-2 py-0.5 rounded font-semibold">
                  <Clock className="w-3 h-3" /> قيد المراجعة (Pending Review)
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-4">
              <button
                onClick={() => onNavigate(`/store/${submittedStore.slug}`)}
                className="bg-[#0E11B7] hover:bg-[#0c0ea3] text-white px-6 py-2.5 rounded-xl font-semibold text-sm transition shadow"
              >
                {language === 'ar' ? 'معاينة صفحة المتجر' : 'Preview Store Page'}
              </button>

              <button
                onClick={() => onNavigate('/admin')}
                className="bg-gray-800 hover:bg-gray-700 text-amber-300 border border-gray-700 px-6 py-2.5 rounded-xl font-semibold text-sm transition flex items-center gap-2"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>{language === 'ar' ? 'تجربة: اعتماد الطلب من لوحة الإدارة' : 'Demo: Approve in Admin'}</span>
              </button>

              <button
                onClick={() => onNavigate('/seller')}
                className="text-gray-600 dark:text-gray-300 hover:text-gray-900 px-4 py-2.5 text-sm font-medium transition"
              >
                {language === 'ar' ? 'لوحة تحكم البائع' : 'Seller Dashboard'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
