import React, { useState } from 'react';
import {
  Sparkles,
  Bot,
  Send,
  X,
  ShieldCheck,
  Loader2,
  AlertCircle,
  FileText,
  Package,
  Store,
  HelpCircle,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../i18n/LanguageContext';
import { aiService } from '../../services/aiService';

interface AIAssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: 'business' | 'seller' | 'customer';
  defaultOrderId?: string;
  defaultStoreId?: string;
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  scope?: string;
  timestamp: string;
  isError?: boolean;
}

export const AIAssistantModal: React.FC<AIAssistantModalProps> = ({
  isOpen,
  onClose,
  initialMode,
  defaultOrderId,
  defaultStoreId,
}) => {
  const { user } = useAuth();
  const { language } = useLanguage();

  const isPlatformAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';
  const isSeller = user?.role === 'SELLER';

  // Determine starting mode based on role
  const defaultMode: 'business' | 'seller' | 'customer' =
    initialMode || (isPlatformAdmin ? 'business' : isSeller ? 'seller' : 'customer');

  const [mode, setMode] = useState<'business' | 'seller' | 'customer'>(defaultMode);
  const [prompt, setPrompt] = useState('');
  const [orderId, setOrderId] = useState(defaultOrderId || '');
  const [storeId, setStoreId] = useState(defaultStoreId || '');
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      id: 'welcome',
      sender: 'assistant',
      text:
        language === 'ar'
          ? 'مرحباً! أنا المساعد الذكي لمنصة MarketSpace. أعمل بوضع القراءة التحليلية الآمنة، كيف يمكنني مساعدتك اليوم؟'
          : language === 'so'
          ? 'Ku soo dhawoow Kaaliyaha Garaadka Macmalka ah ee MarketSpace. Sideen maanta kuu caawin karaa?'
          : 'Hello! I am MarketSpace AI. Operating in secure, read-only mode. How can I assist you today?',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);

  if (!isOpen) return null;

  const quickPrompts: Record<'business' | 'seller' | 'customer', string[]> = {
    business: [
      language === 'ar' ? 'لخص حالة المبيعات والطلبات الأخيرة' : 'Summarize recent sales & order volume',
      language === 'ar' ? 'ما هي المنتجات التي تقترب من النفاد؟' : 'Identify low-stock catalog alerts',
      language === 'ar' ? 'تقييم كفاءة عمليات الشحن والتوصيل' : 'Evaluate fulfillment & operational status',
    ],
    seller: [
      language === 'ar' ? 'لخص أداء مبيعات متجري' : 'Summarize my store performance',
      language === 'ar' ? 'هل لدي منتجات منخفضة المخزون؟' : 'Check my low-stock products',
      language === 'ar' ? 'اكتب وصفاً تسويقياً احترافياً لمنتج جديد' : 'Write compelling marketing copy for a new item',
    ],
    customer: [
      language === 'ar' ? 'ما هي سياسة الاسترجاع في المنصة؟' : 'What is the platform return policy?',
      language === 'ar' ? 'ما هي خيارات الدفع عبر الهاتف المتاحة؟' : 'What mobile money methods are accepted?',
      language === 'ar' ? 'تتبع حالة طلبي' : 'Check status of my order',
    ],
  };

  const handleSend = async (textToSend?: string) => {
    const text = (textToSend || prompt).trim();
    if (!text || isLoading) return;

    const userMsgId = 'msg_' + Date.now();
    const userMsg: ChatMessage = {
      id: userMsgId,
      sender: 'user',
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages(prev => [...prev, userMsg]);
    setPrompt('');
    setIsLoading(true);

    try {
      const res = await aiService.queryAssistant(mode, text, {
        storeId: storeId || undefined,
        orderId: orderId || undefined,
      });

      const assistantMsg: ChatMessage = {
        id: 'reply_' + Date.now(),
        sender: 'assistant',
        text: res.response || 'No response returned.',
        scope: res.scope,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages(prev => [...prev, assistantMsg]);
    } catch (err: any) {
      const errorMsg: ChatMessage = {
        id: 'err_' + Date.now(),
        sender: 'assistant',
        text: err?.message || 'Failed to process AI query. Please try again.',
        isError: true,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      id="ai-assistant-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn"
      role="dialog"
      aria-modal="true"
    >
      <div
        id="ai-assistant-modal-container"
        className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col h-[650px] max-h-[90vh] overflow-hidden"
      >
        {/* Header */}
        <div
          id="ai-assistant-header"
          className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-rose-500 to-amber-500 flex items-center justify-center text-white shadow-md">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-slate-900 dark:text-white text-base">MarketSpace AI</h3>
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                  <ShieldCheck className="w-3 h-3" /> Read-Only & Isolated
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {language === 'ar'
                  ? 'مساعد ذكي للتحليلات وخدمة العملاء'
                  : 'Role-bounded analytical and customer intelligence'}
              </p>
            </div>
          </div>
          <button
            id="close-ai-assistant-btn"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            aria-label="Close Assistant"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Role Mode Selector */}
        <div
          id="ai-assistant-mode-tabs"
          className="flex items-center gap-2 px-6 py-2.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 text-xs"
        >
          <span className="font-semibold text-slate-500 dark:text-slate-400">Mode:</span>
          {isPlatformAdmin && (
            <button
              id="tab-business-assistant"
              onClick={() => setMode('business')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition ${
                mode === 'business'
                  ? 'bg-rose-500 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'
              }`}
            >
              <FileText className="w-3.5 h-3.5" /> Business Intelligence
            </button>
          )}

          {(isSeller || isPlatformAdmin) && (
            <button
              id="tab-seller-assistant"
              onClick={() => setMode('seller')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition ${
                mode === 'seller'
                  ? 'bg-rose-500 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'
              }`}
            >
              <Store className="w-3.5 h-3.5" /> Seller Assistant
            </button>
          )}

          <button
            id="tab-customer-assistant"
            onClick={() => setMode('customer')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition ${
              mode === 'customer'
                ? 'bg-rose-500 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'
            }`}
          >
            <HelpCircle className="w-3.5 h-3.5" /> Customer Support
          </button>
        </div>

        {/* Chat Stream */}
        <div id="ai-chat-stream" className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.map(msg => (
            <div
              key={msg.id}
              className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
                  msg.sender === 'user'
                    ? 'bg-rose-500 text-white rounded-br-xs'
                    : msg.isError
                    ? 'bg-rose-50 text-rose-900 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-200 dark:border-rose-900 rounded-bl-xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-bl-xs'
                }`}
              >
                <div className="whitespace-pre-wrap">{msg.text}</div>
              </div>
              <span className="text-[10px] text-slate-400 mt-1 px-1">{msg.timestamp}</span>
            </div>
          ))}

          {isLoading && (
            <div className="flex items-center gap-2 text-slate-400 text-xs p-2">
              <Loader2 className="w-4 h-4 animate-spin text-rose-500" />
              <span>Analyzing authorized marketplace data...</span>
            </div>
          )}
        </div>

        {/* Quick Suggestion Chips */}
        <div className="px-6 py-2 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2 overflow-x-auto no-scrollbar">
          <Sparkles className="w-3.5 h-3.5 text-rose-500 shrink-0" />
          <div className="flex gap-2">
            {quickPrompts[mode].map((qPrompt, idx) => (
              <button
                key={idx}
                onClick={() => handleSend(qPrompt)}
                disabled={isLoading}
                className="whitespace-nowrap text-xs bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 px-3 py-1 rounded-full transition disabled:opacity-50"
              >
                {qPrompt}
              </button>
            ))}
          </div>
        </div>

        {/* Input Bar */}
        <div
          id="ai-assistant-input-bar"
          className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40"
        >
          {mode === 'customer' && (
            <div className="mb-2 flex items-center gap-2">
              <Package className="w-3.5 h-3.5 text-slate-400" />
              <input
                id="ai-optional-order-id"
                type="text"
                placeholder="Optional Order ID (e.g. ord_12345)"
                value={orderId}
                onChange={e => setOrderId(e.target.value)}
                className="text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-rose-500 w-64"
              />
            </div>
          )}

          <form
            onSubmit={e => {
              e.preventDefault();
              handleSend();
            }}
            className="flex items-center gap-2"
          >
            <input
              id="ai-prompt-input"
              type="text"
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              maxLength={2000}
              placeholder={
                language === 'ar'
                  ? 'اكتب استفسارك هنا (مثلاً: لخص حالة المبيعات)...'
                  : 'Ask MarketSpace AI a question...'
              }
              disabled={isLoading}
              className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-transparent transition"
            />
            <button
              id="ai-send-btn"
              type="submit"
              disabled={isLoading || !prompt.trim()}
              className="px-4 py-2.5 bg-rose-500 hover:bg-rose-600 text-white rounded-xl font-medium text-sm flex items-center gap-2 transition disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </form>
          <div className="flex items-center justify-between mt-2 text-[10px] text-slate-400 px-1">
            <span>Security Protected • Financial mutations strictly manual</span>
            <span>{prompt.length} / 2000</span>
          </div>
        </div>
      </div>
    </div>
  );
};
