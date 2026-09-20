import React, { useState } from 'react';
import { Phone, Mail, MapPin, MessageSquare, Send, CheckCircle2 } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

export const ContactPage: React.FC = () => {
  const { t } = useLanguage();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [isSent, setIsSent] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSent(true);
    setTimeout(() => {
      setName('');
      setEmail('');
      setPhone('');
      setSubject('');
      setMessage('');
    }, 1500);
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-10 animate-fadeIn">
      <div className="text-center space-y-2 max-w-xl mx-auto">
        <h1 className="text-3xl sm:text-4xl font-black text-gray-900 dark:text-white">
          {t('contactUs')}
        </h1>
        <p className="text-xs sm:text-sm text-gray-500 leading-relaxed">
          فريق دعم العملاء وخدمة التجار في MarketSpace جاهز لمساعدتك والإجابة عن جميع استفساراتك على مدار الساعة.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
        {/* Contact Info Sidebar */}
        <div className="md:col-span-5 space-y-4">
          <div className="p-6 rounded-3xl bg-white dark:bg-[#151A23] border border-gray-200 dark:border-[#293142] shadow-xs space-y-5">
            <h3 className="font-black text-base text-gray-900 dark:text-white">
              معلومات التواصل المباشر
            </h3>

            <div className="space-y-4 text-xs">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-[#0E11B7] dark:text-[#3B82F6] flex items-center justify-center flex-shrink-0">
                  <MapPin className="w-4 h-4" />
                </div>
                <div>
                  <span className="block font-bold text-gray-900 dark:text-white">{t('headOffice')}</span>
                  <p className="text-gray-500 mt-0.5">{t('addressValue')}</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-[#0E11B7] dark:text-[#3B82F6] flex items-center justify-center flex-shrink-0">
                  <Phone className="w-4 h-4" />
                </div>
                <div>
                  <span className="block font-bold text-gray-900 dark:text-white">{t('phone')}</span>
                  <a href="tel:+252612494952" className="text-gray-500 hover:text-[#0E11B7] block mt-0.5">
                    {t('phoneValue')}
                  </a>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-[#0E11B7] dark:text-[#3B82F6] flex items-center justify-center flex-shrink-0">
                  <Mail className="w-4 h-4" />
                </div>
                <div>
                  <span className="block font-bold text-gray-900 dark:text-white">{t('email')}</span>
                  <a href="mailto:MarketSpace119@gmail.com" className="text-gray-500 hover:text-[#0E11B7] block mt-0.5">
                    {t('emailValue')}
                  </a>
                </div>
              </div>
            </div>

            {/* Quick WhatsApp Action */}
            <div className="pt-2">
              <a
                href="https://wa.me/252612494952"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full h-11 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center justify-center gap-2 shadow-md shadow-emerald-600/20 transition-all"
              >
                <MessageSquare className="w-4 h-4" />
                <span>تحدث معنا عبر WhatsApp</span>
              </a>
            </div>
          </div>
        </div>

        {/* Contact Form */}
        <div className="md:col-span-7">
          <form
            onSubmit={handleSubmit}
            className="p-6 sm:p-8 rounded-3xl bg-white dark:bg-[#151A23] border border-gray-200 dark:border-[#293142] shadow-xs space-y-4"
          >
            <h3 className="font-black text-base text-gray-900 dark:text-white">
              أرسل لنا رسالة
            </h3>

            {isSent && (
              <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs font-bold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                <span>تم إرسال رسالتك بنجاح! سيتواصل معك أحد ممثلي الخدمة قريباً.</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                  الاسم الكامل *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="محمد أحمد"
                  className="w-full h-10 px-3 text-xs bg-gray-50 dark:bg-[#111722] border border-gray-200 dark:border-[#293142] rounded-xl text-gray-900 dark:text-white focus:outline-none focus:border-[#0E11B7]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                  رقم الهاتف *
                </label>
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="+252 61..."
                  className="w-full h-10 px-3 text-xs bg-gray-50 dark:bg-[#111722] border border-gray-200 dark:border-[#293142] rounded-xl text-gray-900 dark:text-white focus:outline-none focus:border-[#0E11B7]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                البريد الإلكتروني
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="name@example.com"
                className="w-full h-10 px-3 text-xs bg-gray-50 dark:bg-[#111722] border border-gray-200 dark:border-[#293142] rounded-xl text-gray-900 dark:text-white focus:outline-none focus:border-[#0E11B7]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                موضوع الرسالة
              </label>
              <input
                type="text"
                value={subject}
                onChange={e => setSubject(e.target.value)}
                placeholder="استفسار عن طلب، فتح متجر، أو شحن..."
                className="w-full h-10 px-3 text-xs bg-gray-50 dark:bg-[#111722] border border-gray-200 dark:border-[#293142] rounded-xl text-gray-900 dark:text-white focus:outline-none focus:border-[#0E11B7]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                نص الرسالة *
              </label>
              <textarea
                rows={4}
                required
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder="اكتب تفاصيل استفسارك هنا..."
                className="w-full p-3 text-xs bg-gray-50 dark:bg-[#111722] border border-gray-200 dark:border-[#293142] rounded-xl text-gray-900 dark:text-white focus:outline-none focus:border-[#0E11B7]"
              />
            </div>

            <button
              type="submit"
              className="h-11 px-6 rounded-xl bg-[#0E11B7] hover:bg-[#070A86] text-white font-black text-xs flex items-center justify-center gap-2 shadow-md shadow-[#0E11B7]/20 transition-all"
            >
              <Send className="w-3.5 h-3.5" />
              <span>إرسال الرسالة</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
