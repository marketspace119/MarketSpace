import React from 'react';
import {
  Wrench,
  Clock,
  Star,
  CheckCircle2,
  Briefcase,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';
import { Product } from '../../types';
import { useLanguage } from '../../i18n/LanguageContext';

interface ServiceCardProps {
  service: Product;
  onNavigate?: (path: string) => void;
  onBookService?: (service: Product) => void;
}

export const ServiceCard: React.FC<ServiceCardProps> = ({
  service,
  onNavigate,
  onBookService,
}) => {
  const { language, t } = useLanguage();

  const title = service.title[language] || service.title.en;
  const description = service.description[language] || service.description.en;

  const handleClick = () => {
    if (service.seller?.slug && onNavigate) {
      onNavigate(`/service/${service.seller.slug}`);
    } else if (onNavigate) {
      onNavigate(`/product/${service.slug}`);
    } else {
      window.location.hash = `#/product/${service.slug}`;
    }
  };

  const handleBook = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onBookService) {
      onBookService(service);
    } else {
      handleClick();
    }
  };

  return (
    <div
      id={`service-card-${service.id}`}
      onClick={handleClick}
      className="group flex flex-col justify-between bg-white dark:bg-[#151A23] rounded-2xl border border-gray-200 dark:border-[#293142] overflow-hidden hover:border-emerald-500/40 hover:shadow-xl transition-all duration-300 cursor-pointer"
    >
      {/* Media & Provider Tag */}
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-gray-100 dark:bg-gray-800">
        <img
          src={service.thumbnail || service.images[0]}
          alt={title}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />

        {/* Badge: Verified Service */}
        <div className="absolute top-3 start-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-600 text-white text-[10px] font-bold shadow-md">
          <ShieldCheck className="w-3 h-3" />
          <span>{t('services')}</span>
        </div>

        {/* Provider Name Tag */}
        {service.seller?.name && (
          <div className="absolute bottom-2 start-3 px-2.5 py-1 rounded-lg bg-black/75 backdrop-blur-sm text-white text-[11px] font-semibold flex items-center gap-1.5">
            <Briefcase className="w-3 h-3 text-emerald-400" />
            <span>{service.seller.name}</span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4 flex flex-col flex-grow justify-between gap-3">
        <div>
          <div className="flex items-center justify-between gap-2 mb-1">
            <h3 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white line-clamp-1 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
              {title}
            </h3>
            {service.rating > 0 && (
              <span className="flex items-center gap-1 text-xs font-bold text-amber-500 shrink-0">
                <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                {service.rating.toFixed(1)}
              </span>
            )}
          </div>

          <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 leading-relaxed">
            {description}
          </p>
        </div>

        {/* Delivery / Turnaround Specs */}
        <div className="flex items-center gap-3 text-[11px] text-gray-500 dark:text-gray-400 py-1.5 px-2.5 rounded-lg bg-gray-50 dark:bg-[#1A222E]">
          <Clock className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
          <span>{t('duration')}: 1-3 {language === 'ar' ? 'أيام عمل' : 'business days'}</span>
        </div>

        {/* Price & Action */}
        <div className="pt-2 border-t border-gray-100 dark:border-[#222B38] flex items-center justify-between gap-2">
          <div>
            <span className="text-[10px] text-gray-400 block">{t('startingFrom')}</span>
            <span className="text-base sm:text-lg font-black text-gray-900 dark:text-white">
              ${service.price.toFixed(2)}
            </span>
          </div>

          <button
            type="button"
            onClick={handleBook}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md shadow-emerald-600/20 active:scale-95 transition-all"
          >
            <span>{t('bookService')}</span>
            <ArrowRight className="w-3.5 h-3.5 rtl:rotate-180" />
          </button>
        </div>
      </div>
    </div>
  );
};
