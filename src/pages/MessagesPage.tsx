import React, { useState, useEffect, useRef } from 'react';
import {
  MessageSquare,
  Send,
  Phone,
  Store as StoreIcon,
  ShoppingBag,
  ExternalLink,
  Clock,
  User,
  CheckCircle2,
  Sparkles,
  ChevronLeft,
} from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { Conversation, ChatMessage, UserRole } from '../types';
import { messagingService } from '../services/messagingService';

interface MessagesPageProps {
  onNavigate: (path: string) => void;
  conversationIdFromRoute?: string;
  activeConvIdFromRoute?: string;
  initialStoreId?: string;
}

export const MessagesPage: React.FC<MessagesPageProps> = ({
  onNavigate,
  conversationIdFromRoute,
  activeConvIdFromRoute,
}) => {
  const effectiveConvId = conversationIdFromRoute || activeConvIdFromRoute;
  const { language, t, isRTL } = useLanguage();
  const { user, firebaseUser } = useAuth();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Subscribe to user conversations
  useEffect(() => {
    if (!user || !firebaseUser || firebaseUser.uid !== user.id) {
      setConversations([]);
      return;
    }
    const unsub = messagingService.subscribeToConversations(user.id, list => {
      setConversations(list);

      // Select from route or first
      if (effectiveConvId) {
        const found = list.find(c => c.id === effectiveConvId);
        if (found) setSelectedConversation(found);
      } else if (!selectedConversation && list.length > 0) {
        setSelectedConversation(list[0]);
      }
    });

    return () => unsub();
  }, [user, firebaseUser, effectiveConvId]);

  // Subscribe to selected conversation messages
  useEffect(() => {
    if (!selectedConversation) {
      setMessages([]);
      return;
    }

    // Mark as read
    if (user) {
      messagingService.markConversationRead(selectedConversation.id, user.id);
    }

    const unsub = messagingService.subscribeToMessages(selectedConversation.id, msgs => {
      setMessages(msgs);
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 50);
    });

    return () => unsub();
  }, [selectedConversation, user]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedConversation || !messageInput.trim() || isSending) return;

    try {
      setIsSending(true);
      const text = messageInput.trim();
      setMessageInput('');
      await messagingService.sendMessage({
        conversationId: selectedConversation.id,
        senderId: user.id,
        senderName: user.name || user.email.split('@')[0],
        senderRole: user.role,
        text,
      });
      setIsSending(false);
    } catch (err: any) {
      setIsSending(false);
      alert(err.message || 'Failed to send message');
    }
  };

  const getOtherParticipant = (conv: Conversation) => {
    if (!user) return conv.participantDetails[0] || { name: 'Support', role: 'ADMIN' };
    return (
      conv.participantDetails.find(p => p.id !== user.id) ||
      conv.participantDetails[0] || { name: 'Merchant', role: 'SELLER' }
    );
  };

  return (
    <div className="min-h-screen bg-gray-50/50 dark:bg-[#0B1120] py-6">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        {/* Top Header Card */}
        <div className="bg-white dark:bg-[#151A23] p-5 rounded-3xl border border-gray-200 dark:border-[#293142] shadow-xs mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-black text-gray-900 dark:text-white">
                {t('messages')}
              </h1>
              <p className="text-xs text-gray-500">
                {t('messagesSubtitle')}
              </p>
            </div>
          </div>
        </div>

        {/* Messaging Layout Container */}
        <div className="grid grid-cols-1 lg:grid-cols-12 bg-white dark:bg-[#151A23] rounded-3xl border border-gray-200 dark:border-[#293142] shadow-xs overflow-hidden min-h-[600px]">
          {/* Left Sidebar: Conversations List */}
          <div className={`lg:col-span-4 border-e border-gray-200 dark:border-[#293142] flex flex-col ${selectedConversation ? 'hidden lg:flex' : 'flex'}`}>
            <div className="p-4 border-b border-gray-100 dark:border-[#293142] flex items-center justify-between">
              <h2 className="text-xs font-black text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                {language === 'ar' ? 'المحادثات النشطة' : 'Active Conversations'} ({conversations.length})
              </h2>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-gray-100 dark:divide-[#293142]">
              {conversations.length === 0 ? (
                <div className="p-8 text-center text-gray-400">
                  <MessageSquare className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p className="text-xs">{t('noConversations')}</p>
                </div>
              ) : (
                conversations.map(conv => {
                  const other = getOtherParticipant(conv);
                  const isSelected = selectedConversation?.id === conv.id;
                  const unread = user ? conv.unreadCount?.[user.id] || 0 : 0;

                  return (
                    <div
                      key={conv.id}
                      onClick={() => setSelectedConversation(conv)}
                      className={`p-4 cursor-pointer transition-colors flex items-start gap-3 ${
                        isSelected
                          ? 'bg-blue-50/60 dark:bg-[#0E11B7]/15 border-s-4 border-[#0E11B7]'
                          : 'hover:bg-gray-50 dark:hover:bg-gray-800/40'
                      }`}
                    >
                      <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-700 dark:text-gray-300 font-black text-sm shrink-0">
                        {other.name?.charAt(0) || 'M'}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-bold text-gray-900 dark:text-white truncate">
                            {other.name}
                          </h4>
                          <span className="text-[10px] text-gray-400">
                            {new Date(conv.updatedAt).toLocaleTimeString(
                              language === 'ar' ? 'ar-SA' : 'en-US',
                              { hour: '2-digit', minute: '2-digit' }
                            )}
                          </span>
                        </div>

                        {conv.contextTitle && (
                          <span className="inline-block mt-0.5 text-[10px] font-semibold text-[#0E11B7] dark:text-[#3B82F6] truncate max-w-full">
                            {conv.contextTitle}
                          </span>
                        )}

                        <p className="text-xs text-gray-500 truncate mt-1">
                          {conv.lastMessage || (language === 'ar' ? 'محادثة جديدة' : 'New conversation')}
                        </p>
                      </div>

                      {unread > 0 && (
                        <span className="w-5 h-5 rounded-full bg-[#E11D48] text-white text-[10px] font-black flex items-center justify-center shrink-0">
                          {unread}
                        </span>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Main Panel: Active Conversation View */}
          <div className={`lg:col-span-8 flex flex-col ${!selectedConversation ? 'hidden lg:flex' : 'flex'}`}>
            {selectedConversation ? (
              <>
                {/* Active Chat Header */}
                {(() => {
                  const other = getOtherParticipant(selectedConversation);
                  return (
                    <div className="p-4 border-b border-gray-100 dark:border-[#293142] flex items-center justify-between bg-white dark:bg-[#151A23]">
                      <div className="flex items-center gap-3">
                        {/* Mobile Back Button */}
                        <button
                          type="button"
                          onClick={() => setSelectedConversation(null)}
                          className="lg:hidden p-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300"
                        >
                          <ChevronLeft className="w-4 h-4 rtl:rotate-180" />
                        </button>

                        <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-[#0E11B7]/20 flex items-center justify-center text-[#0E11B7] dark:text-[#3B82F6] font-black text-sm">
                          {other.name?.charAt(0) || 'M'}
                        </div>

                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-black text-gray-900 dark:text-white">
                              {other.name}
                            </h3>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
                              {other.role}
                            </span>
                          </div>
                          {selectedConversation.contextTitle && (
                            <p className="text-[11px] text-gray-500">
                              {selectedConversation.contextTitle}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Quick Contact Badges */}
                      <div className="flex items-center gap-2">
                        <a
                          href={messagingService.getWhatsAppLink(
                            '252615000000',
                            `MarketSpace message regarding ${selectedConversation.contextTitle || 'order'}`
                          )}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 text-xs font-bold transition-colors"
                        >
                          <span>{t('whatsappVendor')}</span>
                        </a>
                      </div>
                    </div>
                  );
                })()}

                {/* Messages Stream */}
                <div className="flex-1 p-4 sm:p-6 overflow-y-auto space-y-4 bg-gray-50/30 dark:bg-[#111722]/40 max-h-[460px]">
                  {messages.length === 0 ? (
                    <div className="py-12 text-center text-gray-400 text-xs">
                      <p>{language === 'ar' ? 'ابدأ المحادثة بإرسال رسالتك الأولى أدناه' : 'Start the discussion by typing your first message below'}</p>
                    </div>
                  ) : (
                    messages.map(msg => {
                      const isMe = user?.id === msg.senderId;
                      return (
                        <div
                          key={msg.id}
                          className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                        >
                          <div className="flex items-center gap-1.5 mb-1 px-1">
                            <span className="text-[10px] font-bold text-gray-400">
                              {isMe ? (language === 'ar' ? 'أنت' : 'You') : msg.senderName}
                            </span>
                            <span className="text-[9px] text-gray-400">
                              {new Date(msg.createdAt).toLocaleTimeString(
                                language === 'ar' ? 'ar-SA' : 'en-US',
                                { hour: '2-digit', minute: '2-digit' }
                              )}
                            </span>
                          </div>

                          <div
                            className={`max-w-[80%] sm:max-w-md p-3.5 rounded-2xl text-xs leading-relaxed ${
                              isMe
                                ? 'bg-[#0E11B7] text-white rounded-br-none'
                                : 'bg-white dark:bg-[#151A23] text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-[#293142] rounded-bl-none shadow-xs'
                            }`}
                          >
                            <p className="whitespace-pre-wrap break-words">{msg.text}</p>
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Message Input Bar */}
                <form
                  onSubmit={handleSendMessage}
                  className="p-3 sm:p-4 border-t border-gray-100 dark:border-[#293142] bg-white dark:bg-[#151A23] flex items-center gap-2"
                >
                  <input
                    type="text"
                    value={messageInput}
                    onChange={e => setMessageInput(e.target.value.slice(0, 2000))}
                    placeholder={t('typeMessagePlaceholder')}
                    className="flex-1 h-11 px-4 rounded-full bg-gray-50 dark:bg-[#111722] border border-gray-200 dark:border-[#293142] text-xs text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-[#0E11B7]"
                  />

                  <button
                    type="submit"
                    disabled={!messageInput.trim() || isSending}
                    className="h-11 px-5 rounded-full bg-[#0E11B7] hover:bg-[#070A86] disabled:opacity-50 text-white font-bold text-xs flex items-center gap-2 shadow-xs transition-colors"
                  >
                    <span>{t('sendMessage')}</span>
                    <Send className="w-3.5 h-3.5 rtl:rotate-180" />
                  </button>
                </form>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-gray-400">
                <MessageSquare className="w-12 h-12 mb-3 opacity-30 text-[#0E11B7]" />
                <h3 className="font-bold text-sm text-gray-700 dark:text-gray-300">
                  {language === 'ar' ? 'حدد محادثة لبدء التواصل' : 'Select a conversation to start chatting'}
                </h3>
                <p className="text-xs text-gray-500 mt-1 max-w-sm">
                  {language === 'ar'
                    ? 'يمكنك مراسلة البائعين مباشرة من صفحة تفاصيل الطلب أو صفحة المتجر'
                    : 'You can contact merchants directly from order tracking or store pages.'}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
