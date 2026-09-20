import React, { useState, useEffect } from 'react';
import {
  Briefcase,
  Calendar,
  Clock,
  MapPin,
  Phone,
  MessageCircle,
  ShieldCheck,
  Star,
  CheckCircle2,
  Send,
  Sparkles,
  DollarSign,
  UserCheck,
} from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { Store, Product, ServiceBooking } from '../types';
import { storeService } from '../services/storeService';
import { productService } from '../services/productService';
import { bookingService } from '../services/bookingService';
import { updatePageSEO } from '../services/seo';

interface ServiceProviderPageProps {
  slug: string;
  onNavigate: (path: string) => void;
}

export const ServiceProviderPage: React.FC<ServiceProviderPageProps> = ({ slug, onNavigate }) => {
  const { language, t } = useLanguage();
  const { user } = useAuth();

  const [provider, setProvider] = useState<Store | null>(null);
  const [services, setServices] = useState<Product[]>([]);
  const [selectedService, setSelectedService] = useState<Product | null>(null);
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
  const [bookingSuccess, setBookingSuccess] = useState<ServiceBooking | null>(null);

  // Booking Form State
  const [bookingDate, setBookingDate] = useState<string>('2025-04-10');
  const [bookingTime, setBookingTime] = useState<string>('10:00 AM');
  const [customerName, setCustomerName] = useState<string>(user?.name || '');
  const [customerPhone, setCustomerPhone] = useState<string>(user?.phone || '+252 61');
  const [locationType, setLocationType] = useState<'on_site' | 'remote'>('remote');
  const [bookingNotes, setBookingNotes] = useState<string>('');

  useEffect(() => {
    const foundStore = storeService.getStoreBySlug(slug);
    if (foundStore && foundStore.sellerType === 'service') {
      setProvider(foundStore);
      const provServices = productService.getAllProducts({
        storeId: foundStore.id,
        onlyPublished: true,
      });
      setServices(provServices);

      updatePageSEO({
        title: `${foundStore.name} | خدمات برمجية وتقنية احترافية`,
        description: foundStore.description[language] || foundStore.description.en,
        image: foundStore.cover,
        type: 'profile',
        breadcrumbs: [
          { name: t('home'), url: '/' },
          { name: t('services'), url: '/shop?type=services' },
          { name: foundStore.name, url: `/service/${foundStore.slug}` },
        ],
        language,
      });
    } else {
      updatePageSEO({
        title: language === 'ar' ? 'مقدم الخدمة غير موجود | MarketSpace' : language === 'so' ? 'Bixiyaha Adeegga Lama Helin | MarketSpace' : 'Service Provider Not Found | MarketSpace',
        description: language === 'ar' ? 'لم يتم العثور على مقدم الخدمة المطلوب.' : 'The requested service provider could not be found.',
        type: 'website',
        language,
      });
    }
  }, [slug, language, t, user?.name, user?.phone]);

  if (!provider) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center p-8">
        <Briefcase className="w-16 h-16 text-gray-300 mb-3" />
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">مقدم الخدمة غير موجود</h2>
        <p className="text-gray-500 mb-6">لم يتم العثور على مقدم الخدمة المطلوب.</p>
        <button
          onClick={() => onNavigate('/shop?type=services')}
          className="bg-[#0E11B7] text-white px-6 py-2 rounded-xl font-medium"
        >
          استعراض دليل الخدمات
        </button>
      </div>
    );
  }

  const handleOpenBooking = (service?: Product) => {
    if (service) setSelectedService(service);
    setIsBookingModalOpen(true);
    setBookingSuccess(null);
  };

  const handleSubmitBooking = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName || !customerPhone) return;

    const newBooking = bookingService.createBooking({
      serviceId: selectedService?.id || 'service_general',
      serviceTitle: selectedService?.title?.[language] || 'استشارة وخدمة فنية',
      sellerId: provider.sellerId,
      storeId: provider.id,
      storeName: provider.name,
      customerId: user?.id || `cust_${Date.now()}`,
      customerName,
      customerPhone,
      customerEmail: user?.email,
      date: bookingDate,
      time: bookingTime,
      location: locationType === 'remote' ? 'عن بُعد (Online / Remote)' : `${provider.city} - موقع العميل`,
      notes: bookingNotes,
      price: selectedService?.price || 0,
    });

    setBookingSuccess(newBooking);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0B1120] pb-20">
      {/* Cover */}
      <div className="relative h-64 sm:h-80 w-full overflow-hidden bg-gray-900">
        <img
          src={provider.cover}
          alt={provider.name}
          className="w-full h-full object-cover opacity-85"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent" />
      </div>

      {/* Profile Card */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-20 sm:-mt-24 relative z-10">
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 shadow-xl mb-8">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="flex items-center gap-5">
              <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl border-4 border-white dark:border-gray-900 overflow-hidden shadow-lg bg-white shrink-0">
                <img
                  src={provider.logo}
                  alt={provider.name}
                  className="w-full h-full object-cover"
                />
              </div>

              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white">
                    {provider.name}
                  </h1>
                  {provider.isVerified && (
                    <span className="inline-flex items-center gap-1 bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 text-xs font-bold px-2.5 py-0.5 rounded-full border border-purple-200 dark:border-purple-800">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      مقدم خدمة معتمد
                    </span>
                  )}
                </div>

                <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1.5 max-w-xl">
                  {provider.description[language] || provider.description.en}
                </p>

                <div className="flex flex-wrap items-center gap-4 mt-3 text-xs text-gray-500">
                  <div className="flex items-center gap-1 text-amber-500 font-bold">
                    <Star className="w-4 h-4 fill-current" />
                    <span>{provider.rating} ({provider.reviewsCount} تقييم)</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <MapPin className="w-4 h-4 text-rose-500" />
                    <span>{provider.city}, {provider.district}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock className="w-4 h-4 text-emerald-500" />
                    <span>{provider.openingHours}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => handleOpenBooking()}
                className="bg-[#0E11B7] hover:bg-[#0c0ea3] text-white px-5 py-2.5 rounded-xl font-bold text-sm transition flex items-center gap-1.5 shadow shadow-blue-600/20"
              >
                <Calendar className="w-4 h-4" />
                <span>حجز موعد خدمة</span>
              </button>

              <a
                href={`https://wa.me/${provider.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(`مرحباً ${provider.name}، أود الاستفسار عن خدماتكم التقنية عبر MarketSpace.`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm transition flex items-center gap-1.5 shadow"
              >
                <MessageCircle className="w-4 h-4" />
                <span>استشارة واتساب</span>
              </a>
            </div>
          </div>
        </div>

        {/* Services Showcase */}
        <div>
          <h2 className="text-xl font-extrabold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-600" />
            باقات الخدمات المتاحة
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {services.map(service => (
              <div
                key={service.id}
                className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 shadow-sm hover:shadow-md transition flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between mb-3">
                    <div className="p-3 bg-purple-50 dark:bg-purple-950 text-purple-600 dark:text-purple-400 rounded-xl">
                      <Briefcase className="w-6 h-6" />
                    </div>
                    <span className="text-lg font-black text-emerald-600 dark:text-emerald-400">
                      ${service.price.toFixed(2)}
                    </span>
                  </div>

                  <h3 className="font-bold text-base text-gray-900 dark:text-white mb-2">
                    {service.title[language] || service.title.en}
                  </h3>
                  <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed line-clamp-3">
                    {service.description[language] || service.description.en}
                  </p>

                  <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800 text-xs text-gray-500 space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                      <span>تسليم احترافي مع دعم فني مستمر</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                      <span>تواصل مباشر عبر الواتساب والمنصة</span>
                    </div>
                  </div>
                </div>

                <div className="mt-6 flex gap-2">
                  <button
                    onClick={() => handleOpenBooking(service)}
                    className="flex-1 bg-[#0E11B7] hover:bg-[#0c0ea3] text-white py-2.5 rounded-xl font-bold text-xs transition flex items-center justify-center gap-1.5 shadow"
                  >
                    <Calendar className="w-4 h-4" />
                    <span>طلب الخدمة وحجز موعد</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Booking Modal */}
      {isBookingModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-2xl max-w-lg w-full border border-gray-200 dark:border-gray-800 p-6 shadow-2xl overflow-y-auto max-h-[90vh]">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100 dark:border-gray-800">
              <h3 className="font-bold text-lg text-gray-900 dark:text-white">
                حجز موعد خدمة مع {provider.name}
              </h3>
              <button
                onClick={() => setIsBookingModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            {bookingSuccess ? (
              <div className="py-6 text-center">
                <div className="w-14 h-14 bg-emerald-100 dark:bg-emerald-950 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-3">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <h4 className="text-xl font-bold text-gray-900 dark:text-white mb-1">
                  تم إرسال طلب الحجز بنجاح!
                </h4>
                <p className="text-xs text-gray-600 dark:text-gray-400 mb-4">
                  كود الحجز المرجعي: <span className="font-mono font-bold text-blue-600">{bookingSuccess.bookingCode}</span>
                </p>
                <p className="text-xs text-gray-500 max-w-xs mx-auto mb-6">
                  سيقوم مقدم الخدمة بالتواصل معك هاتفياً أو عبر الواتساب لتأكيد الموعد والتفاصيل الفنية.
                </p>
                <button
                  onClick={() => setIsBookingModalOpen(false)}
                  className="bg-[#0E11B7] text-white px-6 py-2 rounded-xl text-xs font-bold"
                >
                  حسناً، تم
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmitBooking} className="space-y-4 mt-4 text-xs">
                <div>
                  <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">الخدمة المختارة:</label>
                  <select
                    value={selectedService?.id || ''}
                    onChange={e => {
                      const s = services.find(x => x.id === e.target.value);
                      if (s) setSelectedService(s);
                    }}
                    className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl p-2.5 text-xs text-gray-900 dark:text-white"
                  >
                    {services.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.title[language] || s.title.en} (${s.price})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">تاريخ الموعد:</label>
                    <input
                      type="date"
                      required
                      value={bookingDate}
                      onChange={e => setBookingDate(e.target.value)}
                      className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl p-2.5 text-xs text-gray-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">الوقت المفضل:</label>
                    <input
                      type="text"
                      value={bookingTime}
                      onChange={e => setBookingTime(e.target.value)}
                      placeholder="10:00 AM"
                      className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl p-2.5 text-xs text-gray-900 dark:text-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">اسم العميل:</label>
                    <input
                      type="text"
                      required
                      value={customerName}
                      onChange={e => setCustomerName(e.target.value)}
                      placeholder="الاسم الكامل"
                      className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl p-2.5 text-xs text-gray-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">رقم الهاتف:</label>
                    <input
                      type="text"
                      required
                      value={customerPhone}
                      onChange={e => setCustomerPhone(e.target.value)}
                      placeholder="+252 61..."
                      className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl p-2.5 text-xs text-gray-900 dark:text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">طريقة تقديم الخدمة:</label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="locationType"
                        checked={locationType === 'remote'}
                        onChange={() => setLocationType('remote')}
                      />
                      <span>أونلاين / عن بُعد</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="locationType"
                        checked={locationType === 'on_site'}
                        onChange={() => setLocationType('on_site')}
                      />
                      <span>حضور ميداني في موقع العمل</span>
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">ملاحظات ومتطلبات العمل:</label>
                  <textarea
                    rows={3}
                    value={bookingNotes}
                    onChange={e => setBookingNotes(e.target.value)}
                    placeholder="اشرح باختصار تفاصيل المشروع أو الاستشارة المطلوبة..."
                    className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl p-2.5 text-xs text-gray-900 dark:text-white"
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsBookingModalOpen(false)}
                    className="flex-1 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 font-bold"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    className="flex-1 bg-[#0E11B7] hover:bg-[#0c0ea3] text-white py-2.5 rounded-xl font-bold flex items-center justify-center gap-1.5 shadow"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>تأكيد الحجز</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
