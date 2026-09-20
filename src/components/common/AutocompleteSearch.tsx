import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  Clock,
  X,
  Store,
  UtensilsCrossed,
  Wrench,
  ShoppingBag,
  Sparkles,
  ArrowRight,
} from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import { discoveryService, AutocompleteItem } from '../../services/discoveryService';

interface AutocompleteSearchProps {
  initialValue?: string;
  placeholder?: string;
  onSearchSubmit?: (query: string) => void;
  onNavigateDirect?: (url: string) => void;
  onNavigate?: (path: string) => void;
  className?: string;
  autoFocus?: boolean;
  compact?: boolean;
}

export const AutocompleteSearch: React.FC<AutocompleteSearchProps> = ({
  initialValue = '',
  placeholder,
  onSearchSubmit,
  onNavigateDirect,
  onNavigate,
  className = '',
  autoFocus = false,
  compact = false,
}) => {
  const effectiveNavigateDirect = onNavigateDirect || onNavigate;
  const effectiveSearchSubmit = onSearchSubmit || ((q: string) => {
    if (onNavigate) {
      onNavigate(`/search?q=${encodeURIComponent(q)}`);
    }
  });
  const { language, t, isRTL } = useLanguage();
  const [query, setQuery] = useState(initialValue);
  const [isOpen, setIsOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<AutocompleteItem[]>([]);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync initial value
  useEffect(() => {
    setQuery(initialValue);
  }, [initialValue]);

  // Load recent searches on focus
  const loadRecentSearches = () => {
    const list = discoveryService.getRecentSearches();
    setRecentSearches(list);
  };

  // Update suggestions when query changes
  useEffect(() => {
    if (!query.trim()) {
      setSuggestions([]);
      setSelectedIndex(-1);
      return;
    }
    const results = discoveryService.getAutocompleteSuggestions(query, language);
    setSuggestions(results);
    setSelectedIndex(-1);
  }, [query, language]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSubmit = (searchQuery: string) => {
    const trimmed = searchQuery.trim();
    if (!trimmed) return;
    discoveryService.recordSearch(trimmed);
    setIsOpen(false);
    effectiveSearchSubmit(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const totalItems = query.trim() ? suggestions.length : recentSearches.length;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev < totalItems - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev > 0 ? prev - 1 : totalItems - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex >= 0) {
        if (query.trim() && suggestions[selectedIndex]) {
          const item = suggestions[selectedIndex];
          if (effectiveNavigateDirect && item.url) {
            discoveryService.recordSearch(item.text);
            setIsOpen(false);
            effectiveNavigateDirect(item.url);
            return;
          }
          handleSubmit(item.text);
          return;
        } else if (!query.trim() && recentSearches[selectedIndex]) {
          const term = recentSearches[selectedIndex];
          setQuery(term);
          handleSubmit(term);
          return;
        }
      }
      handleSubmit(query);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  const handleRemoveRecent = (e: React.MouseEvent, term: string) => {
    e.stopPropagation();
    discoveryService.removeRecentSearch(term);
    setRecentSearches(prev => prev.filter(item => item !== term));
  };

  const handleClearAllRecents = (e: React.MouseEvent) => {
    e.stopPropagation();
    discoveryService.clearRecentSearches();
    setRecentSearches([]);
  };

  const getItemIcon = (type: AutocompleteItem['type']) => {
    switch (type) {
      case 'restaurant':
        return <UtensilsCrossed className="w-3.5 h-3.5 text-orange-500" />;
      case 'store':
        return <Store className="w-3.5 h-3.5 text-blue-600" />;
      case 'service':
        return <Wrench className="w-3.5 h-3.5 text-emerald-600" />;
      case 'category':
        return <Sparkles className="w-3.5 h-3.5 text-indigo-600" />;
      default:
        return <ShoppingBag className="w-3.5 h-3.5 text-[#0E11B7]" />;
    }
  };

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      {/* Search Input Box */}
      <form
        onSubmit={e => {
          e.preventDefault();
          handleSubmit(query);
        }}
        className="relative flex items-center w-full"
      >
        <input
          ref={inputRef}
          type="search"
          autoFocus={autoFocus}
          value={query}
          onFocus={() => {
            loadRecentSearches();
            setIsOpen(true);
          }}
          onChange={e => {
            setQuery(e.target.value);
            if (!isOpen) setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder || t('searchPlaceholder')}
          className={`w-full ${
            compact ? 'h-10 text-xs' : 'h-11 text-sm'
          } ps-4 pe-24 bg-gray-100 dark:bg-[#111722] border border-gray-200 dark:border-[#293142] rounded-full text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-[#0E11B7] focus:ring-2 focus:ring-[#0E11B7]/15 transition-all`}
        />

        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              inputRef.current?.focus();
            }}
            aria-label="Clear Search"
            className="absolute end-20 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-full"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}

        <button
          type="submit"
          aria-label={t('search')}
          className={`absolute end-1.5 ${
            compact ? 'top-1 h-8 px-3 text-xs' : 'top-1.5 h-8 px-4 text-xs'
          } bg-[#0E11B7] hover:bg-[#070A86] text-white font-bold rounded-full flex items-center gap-1.5 shadow-xs transition-colors`}
        >
          <Search className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">{t('search')}</span>
        </button>
      </form>

      {/* Autocomplete Dropdown Panel */}
      {isOpen && (
        <div
          className={`absolute top-full mt-2 w-full bg-white dark:bg-[#151A23] border border-gray-200 dark:border-[#293142] rounded-2xl shadow-2xl z-50 overflow-hidden animate-fadeIn ${
            isRTL ? 'text-right' : 'text-left'
          }`}
        >
          {/* 1. When query is empty: Show Recent Searches */}
          {!query.trim() && (
            <div className="p-3">
              {recentSearches.length > 0 ? (
                <>
                  <div className="flex items-center justify-between px-2 pb-2 text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                    <span className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      <span>{language === 'ar' ? 'عمليات البحث الأخيرة' : language === 'so' ? 'Baaditaannadii Dhawaa' : 'Recent Searches'}</span>
                    </span>
                    <button
                      type="button"
                      onClick={handleClearAllRecents}
                      className="text-rose-500 hover:underline capitalize text-[10px]"
                    >
                      {language === 'ar' ? 'مسح السجل' : language === 'so' ? 'Tirtir Dhammaan' : 'Clear All'}
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {recentSearches.map((term, idx) => (
                      <div
                        key={idx}
                        onClick={() => {
                          setQuery(term);
                          handleSubmit(term);
                        }}
                        className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold cursor-pointer transition-colors ${
                          selectedIndex === idx
                            ? 'bg-[#0E11B7] text-white'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700'
                        }`}
                      >
                        <Clock className="w-3 h-3 text-gray-400" />
                        <span>{term}</span>
                        <button
                          type="button"
                          onClick={(e) => handleRemoveRecent(e, term)}
                          className="hover:text-rose-500 p-0.5 rounded-full"
                          title="Remove"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="py-4 text-center text-xs text-gray-400">
                  {language === 'ar'
                    ? 'اكتب اسم منتج، متجر، أو وجبة للبدء بالبحث'
                    : language === 'so'
                    ? 'Ku qor magac alaab, dukaan, ama cunto si aad u baarto'
                    : 'Type a product, store, or dish name to search'}
                </div>
              )}
            </div>
          )}

          {/* 2. When query has text: Show Matching Suggestions */}
          {query.trim() && suggestions.length > 0 && (
            <div className="py-2 divide-y divide-gray-100 dark:divide-gray-800/60">
              <div className="px-3 py-1 text-[10px] font-black uppercase text-gray-400 tracking-wider">
                {language === 'ar' ? 'نتائج ومطابقات فورية' : language === 'so' ? 'Natiijooyin Degdeg ah' : 'Instant Matches'}
              </div>

              <div className="max-h-80 overflow-y-auto">
                {suggestions.map((item, idx) => (
                  <div
                    key={item.id}
                    onClick={() => {
                      if (effectiveNavigateDirect && item.url) {
                        discoveryService.recordSearch(item.text);
                        setIsOpen(false);
                        effectiveNavigateDirect(item.url);
                      } else {
                        handleSubmit(item.text);
                      }
                    }}
                    className={`flex items-center justify-between px-3.5 py-2.5 cursor-pointer transition-colors ${
                      selectedIndex === idx
                        ? 'bg-[#EEF2FF] dark:bg-[#0E11B7]/20 text-[#0E11B7] dark:text-[#3B82F6]'
                        : 'hover:bg-gray-50 dark:hover:bg-gray-800/60 text-gray-800 dark:text-gray-200'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {item.image ? (
                        <img
                          src={item.image}
                          alt=""
                          className="w-9 h-9 rounded-lg object-cover shrink-0 border border-gray-200 dark:border-gray-700"
                        />
                      ) : (
                        <div className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center shrink-0">
                          {getItemIcon(item.type)}
                        </div>
                      )}

                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold truncate">
                            {item.text}
                          </span>
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 uppercase shrink-0">
                            {item.domain}
                          </span>
                        </div>
                        {item.subtitle && (
                          <span className="text-[11px] text-gray-400 block truncate">
                            {item.subtitle}
                          </span>
                        )}
                      </div>
                    </div>

                    <ArrowRight className="w-3.5 h-3.5 text-gray-400 rtl:rotate-180 shrink-0 ms-2" />
                  </div>
                ))}
              </div>

              {/* View All in /search bar at bottom */}
              <div
                onClick={() => handleSubmit(query)}
                className="p-2.5 text-center bg-gray-50 dark:bg-[#111722] hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer text-xs font-black text-[#0E11B7] dark:text-[#3B82F6] flex items-center justify-center gap-1.5"
              >
                <Search className="w-3.5 h-3.5" />
                <span>
                  {language === 'ar'
                    ? `عرض جميع النتائج لـ "${query}"`
                    : language === 'so'
                    ? `Eeg dhammaan natiijooyinka "${query}"`
                    : `View all results for "${query}"`}
                </span>
              </div>
            </div>
          )}

          {/* 3. Query has text but no suggestions */}
          {query.trim() && suggestions.length === 0 && (
            <div className="p-4 text-center space-y-2">
              <p className="text-xs text-gray-500">
                {language === 'ar'
                  ? `لا توجد اقتراحات مطابقة لـ "${query}"`
                  : language === 'so'
                  ? `Ma jiro wax u dhigma "${query}"`
                  : `No immediate suggestions for "${query}"`}
              </p>
              <button
                type="button"
                onClick={() => handleSubmit(query)}
                className="text-xs font-bold text-[#0E11B7] hover:underline"
              >
                {language === 'ar' ? 'البحث في الكتالوج بالكامل ←' : 'Search entire catalog →'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
