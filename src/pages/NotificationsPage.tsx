import React, { useState, useEffect } from 'react';
import {
  Bell,
  CheckCircle2,
  Package,
  Truck,
  CreditCard,
  Calendar,
  MessageSquare,
  AlertCircle,
  ExternalLink,
  CheckCheck,
  Filter,
  Clock,
} from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { NotificationItem } from '../types';
import { notificationService } from '../services/notificationService';

interface NotificationsPageProps {
  onNavigate: (path: string) => void;
}

export const NotificationsPage: React.FC<NotificationsPageProps> = ({ onNavigate }) => {
  const { language, t, isRTL } = useLanguage();
  const { user, firebaseUser } = useAuth();

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [filterType, setFilterType] = useState<'all' | 'order' | 'delivery' | 'payment' | 'message'>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !firebaseUser || firebaseUser.uid !== user.id) {
      setNotifications([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    // Real-time subscription with cleanup
    const unsubscribe = notificationService.subscribeToUserNotifications(user.id, items => {
      setNotifications(items);
      setLoading(false);
    });

    return () => {
      unsubscribe();
    };
  }, [user, firebaseUser]);

  const handleNotificationClick = async (notif: NotificationItem) => {
    if (!notif.read) {
      await notificationService.markAsRead(notif.id);
    }
    if (notif.link) {
      onNavigate(notif.link);
    }
  };

  const handleMarkAllRead = async () => {
    if (!user) return;
    await notificationService.markAllAsRead(user.id);
  };

  const filtered = notifications.filter(n => {
    if (filterType === 'all') return true;
    return n.type === filterType;
  });

  const unreadCount = notifications.filter(n => !n.read).length;

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'delivery':
        return <Truck className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />;
      case 'order':
        return <Package className="w-5 h-5 text-[#0E11B7] dark:text-blue-400" />;
      case 'payment':
      case 'payout':
        return <CreditCard className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />;
      case 'booking':
        return <Calendar className="w-5 h-5 text-purple-600 dark:text-purple-400" />;
      case 'message':
        return <MessageSquare className="w-5 h-5 text-amber-600 dark:text-amber-400" />;
      default:
        return <Bell className="w-5 h-5 text-gray-500" />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50/50 dark:bg-[#0B1120] py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-[#151A23] p-6 rounded-3xl border border-gray-200 dark:border-[#293142] shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-[#0E11B7]/15 flex items-center justify-center text-[#0E11B7] dark:text-[#3B82F6]">
              <Bell className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-black text-gray-900 dark:text-white">
                  {t('notifications')}
                </h1>
                {unreadCount > 0 && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-[#E11D48] text-white">
                    {unreadCount} {language === 'ar' ? 'جديد' : 'New'}
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                {t('notificationsSubtitle')}
              </p>
            </div>
          </div>

          {unreadCount > 0 && (
            <button
              type="button"
              onClick={handleMarkAllRead}
              className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-full bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 font-bold text-xs transition-colors self-start sm:self-auto"
            >
              <CheckCheck className="w-4 h-4 text-[#0E11B7] dark:text-[#3B82F6]" />
              <span>{t('markAllAsRead')}</span>
            </button>
          )}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          {(
            [
              { id: 'all', label: language === 'ar' ? 'الكل' : 'All' },
              { id: 'order', label: language === 'ar' ? 'الطلبات' : 'Orders' },
              { id: 'delivery', label: language === 'ar' ? 'التوصيل' : 'Delivery' },
              { id: 'payment', label: language === 'ar' ? 'المدفوعات' : 'Payments' },
              { id: 'message', label: language === 'ar' ? 'الرسائل' : 'Messages' },
            ] as const
          ).map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilterType(tab.id)}
              className={`px-4 py-2 rounded-full text-xs font-bold transition-all whitespace-nowrap ${
                filterType === tab.id
                  ? 'bg-[#0E11B7] text-white shadow-xs'
                  : 'bg-white dark:bg-[#151A23] text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-[#293142] hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* List */}
        <div className="space-y-3">
          {filtered.length === 0 ? (
            <div className="p-12 text-center rounded-3xl bg-white dark:bg-[#151A23] border border-gray-200 dark:border-[#293142]">
              <Bell className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <h3 className="font-bold text-sm text-gray-900 dark:text-white">
                {t('noNotifications')}
              </h3>
              <p className="text-xs text-gray-500 mt-1">
                {language === 'ar'
                  ? 'سيتم إشعارك فور حدوث أي تحديث على طلباتك أو شحناتك'
                  : 'You will receive immediate alerts whenever your orders or shipments update.'}
              </p>
            </div>
          ) : (
            filtered.map(item => (
              <div
                key={item.id}
                onClick={() => handleNotificationClick(item)}
                className={`p-4 sm:p-5 rounded-2xl border transition-all cursor-pointer flex items-start gap-4 ${
                  !item.read
                    ? 'bg-blue-50/40 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900/50 shadow-xs'
                    : 'bg-white dark:bg-[#151A23] border-gray-200/80 dark:border-[#293142] hover:border-gray-300 dark:hover:border-gray-700'
                }`}
              >
                <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-[#111722] flex items-center justify-center shrink-0 mt-0.5">
                  {getTypeIcon(item.type)}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-sm font-black text-gray-900 dark:text-white truncate">
                      {item.title[language] || item.title.en}
                    </h4>
                    <span className="text-[11px] text-gray-400 whitespace-nowrap flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(item.createdAt).toLocaleTimeString(
                        language === 'ar' ? 'ar-SA' : 'en-US',
                        { hour: '2-digit', minute: '2-digit' }
                      )}
                    </span>
                  </div>

                  <p className="text-xs text-gray-600 dark:text-gray-300 mt-1 leading-relaxed">
                    {item.message[language] || item.message.en}
                  </p>

                  <div className="flex items-center justify-between mt-3 pt-2 border-t border-gray-100 dark:border-[#293142]/60">
                    <span className="text-[10px] uppercase font-bold text-gray-400">
                      {new Date(item.createdAt).toLocaleDateString(
                        language === 'ar' ? 'ar-SA' : 'en-US'
                      )}
                    </span>

                    {item.link && (
                      <span className="text-xs font-bold text-[#0E11B7] dark:text-[#3B82F6] flex items-center gap-1 hover:underline">
                        <span>{language === 'ar' ? 'عرض التفاصيل' : 'View Details'}</span>
                        <ExternalLink className="w-3 h-3" />
                      </span>
                    )}
                  </div>
                </div>

                {!item.read && (
                  <div className="w-2.5 h-2.5 rounded-full bg-[#0E11B7] dark:bg-[#3B82F6] shrink-0 mt-2" />
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
