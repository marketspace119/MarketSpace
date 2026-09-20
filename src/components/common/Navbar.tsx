import React, { useState, useRef, useEffect } from 'react';
import {
  Search,
  Heart,
  ShoppingBag,
  Moon,
  Sun,
  Menu,
  X,
  Phone,
  Mail,
  MessageSquare,
  ChevronDown,
  Trash2,
  ArrowRight,
  Sparkles,
  UtensilsCrossed,
  Wrench,
  Boxes,
  Recycle,
  Tag,
  ExternalLink,
  Store as StoreIcon,
  Shield,
  User as UserIcon,
  Package,
  Bell,
  MapPin,
} from 'lucide-react';
import { MarketSpaceLogo } from './MarketSpaceLogo';
import { useLanguage } from '../../i18n/LanguageContext';
import { useTheme } from '../../context/ThemeContext';
import { useFavorites } from '../../context/FavoritesContext';
import { useCart } from '../../context/CartContext';
import { useAuth } from '../../context/AuthContext';
import { Language } from '../../types';
import { notificationService } from '../../services/notificationService';
import { messagingService } from '../../services/messagingService';
import { AutocompleteSearch } from './AutocompleteSearch';

interface NavbarProps {
  currentPath: string;
  onNavigate: (path: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ currentPath, onNavigate }) => {
  const { language, setLanguage, t, isRTL } = useLanguage();
  const { isDark, toggleTheme } = useTheme();
  const { favoritesCount } = useFavorites();
  const {
    items,
    totalItems,
    subtotal,
    removeItem,
    isCartOpen,
    setIsCartOpen,
    closeCart,
    lastAddedItem,
    pauseCartTimer,
    resumeCartTimer,
  } = useCart();
  const { user, firebaseUser } = useAuth();

  const [searchQuery, setSearchQuery] = useState('');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [activeSubmenu, setActiveSubmenu] = useState<string | null>(null);
  const [unreadNotifs, setUnreadNotifs] = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const cartDropdownRef = useRef<HTMLDivElement>(null);

  // Subscribe to real-time notification & message counts
  useEffect(() => {
    if (!user || !firebaseUser || firebaseUser.uid !== user.id) {
      setUnreadNotifs(0);
      setUnreadMessages(0);
      return;
    }

    const unsubNotifs = notificationService.subscribeToUserNotifications(user.id, items => {
      const count = items.filter(n => !n.read).length;
      setUnreadNotifs(count);
    });

    const unsubMessages = messagingService.subscribeToConversations(user.id, convs => {
      const count = convs.reduce((acc, c) => acc + (c.unreadCount?.[user.id] || 0), 0);
      setUnreadMessages(count);
    });

    return () => {
      unsubNotifs();
      unsubMessages();
    };
  }, [user, firebaseUser]);

  // If currently on /cart page, close the top dropdown
  useEffect(() => {
    if (currentPath === '/cart') {
      closeCart();
    }
  }, [currentPath, closeCart]);

  // Close cart dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (cartDropdownRef.current && !cartDropdownRef.current.contains(e.target as Node)) {
        closeCart();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [closeCart]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    onNavigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
  };

  const navLinks = [
    {
      id: 'home',
      label: t('home'),
      path: '/',
    },
    {
      id: 'shop',
      label: t('shop'),
      path: '/shop',
      sublinks: [
        { label: t('allShopProducts'), path: '/shop' },
        { label: t('breadcrumbNew'), path: '/shop/new' },
        { label: t('breadcrumbUsed'), path: '/shop/used' },
        { label: t('breadcrumbDropshipping'), path: '/shop/dropshipping' },
      ],
    },
    {
      id: 'restaurants',
      label: t('restaurants'),
      path: '/restaurants',
      sublinks: [
        { label: language === 'ar' ? 'جميع المطابخ والقوائم' : 'All Dining Menus', path: '/restaurants' },
        { label: 'Burger Crown Restaurant', path: '/restaurant/burger-crown' },
      ],
    },
    {
      id: 'stores',
      label: t('stores'),
      path: '/stores',
      sublinks: [
        { label: language === 'ar' ? 'دليل المتاجر المعتمدة' : 'All Verified Stores', path: '/stores' },
        { label: 'Elegance Cosmetics Boutique', path: '/store/elegance-cosmetics' },
        { label: 'Modern Electronics Pro', path: '/store/modern-electronics' },
      ],
    },
    {
      id: 'services',
      label: t('services'),
      path: '/services',
      sublinks: [
        { label: language === 'ar' ? 'جميع الخدمات والاستشارات' : 'All Services & Consulting', path: '/services' },
        { label: 'Somali Tech Solutions', path: '/service/somali-tech' },
      ],
    },
    {
      id: 'offers',
      label: t('offers'),
      path: '/offers',
      highlight: true,
    },
    {
      id: 'categories',
      label: t('categoriesIndex'),
      path: '/categories',
    },
    {
      id: 'nearby',
      label: t('nearbyTitle'),
      path: '/nearby',
    },
    {
      id: 'following',
      label: t('followingTitle'),
      path: '/following',
    },
    {
      id: 'ads',
      label: t('ads'),
      path: '/ads',
    },
    {
      id: 'track',
      label: t('trackOrder'),
      path: '/orders',
    },
  ];

  return (
    <header className="sticky top-0 z-40 w-full bg-white/95 dark:bg-[#151A23]/95 backdrop-blur-md border-b border-gray-200 dark:border-[#293142] transition-colors">
      {/* Top Notification Strip */}
      <div className="bg-[#0E11B7] text-white text-xs py-1.5 px-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 truncate">
            <a
              href="https://wa.me/252612494952"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 hover:text-emerald-300 transition-colors"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>WhatsApp: +252 612 4949 52</span>
            </a>
            <span className="hidden sm:inline opacity-40">|</span>
            <a
              href="tel:+252612494953"
              className="hidden sm:flex items-center gap-1.5 hover:text-blue-200 transition-colors"
            >
              <Phone className="w-3.5 h-3.5" />
              <span>+252 612 4949 53</span>
            </a>
            <span className="hidden md:inline opacity-40">|</span>
            <a
              href="mailto:marketspace119@gmail.com"
              className="hidden md:flex items-center gap-1.5 hover:text-blue-200 transition-colors"
            >
              <Mail className="w-3.5 h-3.5" />
              <span>MarketSpace119@gmail.com</span>
            </a>
          </div>

          <div className="flex items-center gap-3 text-[11px] font-semibold">
            <button
              onClick={() => onNavigate('/about')}
              className="hover:underline opacity-90 hover:opacity-100"
            >
              {t('about')}
            </button>
            <button
              onClick={() => onNavigate('/contact')}
              className="hover:underline opacity-90 hover:opacity-100"
            >
              {t('contact')}
            </button>
          </div>
        </div>
      </div>

      {/* Main Header Bar */}
      <div className="max-w-7xl mx-auto px-4 py-3 sm:py-3.5 flex items-center justify-between gap-4">
        {/* Logo */}
        <div
          onClick={() => onNavigate('/')}
          className="cursor-pointer flex-shrink-0"
        >
          <MarketSpaceLogo showTagline />
        </div>

        {/* Global Search Bar (Desktop) */}
        <div className="hidden md:flex items-center flex-1 max-w-xl mx-4">
          <AutocompleteSearch onNavigate={onNavigate} />
        </div>

        {/* Header Right Actions */}
        <div className="flex items-center gap-2 sm:gap-2.5 flex-shrink-0">
          {/* Language Switcher */}
          <div className="relative">
            <select
              aria-label={t('language')}
              value={language}
              onChange={(e) => setLanguage(e.target.value as Language)}
              className="h-10 ps-2.5 pe-7 text-xs font-bold bg-gray-100 dark:bg-[#111722] text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-[#293142] rounded-full appearance-none cursor-pointer focus:outline-none focus:border-[#0E11B7] transition-colors"
            >
              <option value="ar">العربية (AR)</option>
              <option value="en">English (EN)</option>
              <option value="so">Soomaali (SO)</option>
            </select>
            <ChevronDown className="w-3.5 h-3.5 absolute end-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500" />
          </div>

          {/* Dark / Light Toggle */}
          <button
            type="button"
            onClick={toggleTheme}
            aria-label="Toggle Theme"
            className="w-10 h-10 rounded-full flex items-center justify-center bg-gray-100 dark:bg-[#111722] text-gray-700 dark:text-gray-300 hover:text-[#0E11B7] dark:hover:text-[#3B82F6] border border-gray-200 dark:border-[#293142] transition-colors"
          >
            {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
          </button>

          {/* Wishlist Link */}
          <button
            type="button"
            onClick={() => onNavigate('/favorites')}
            aria-label={t('wishlist')}
            className="relative w-10 h-10 rounded-full flex items-center justify-center bg-gray-100 dark:bg-[#111722] text-gray-700 dark:text-gray-300 hover:text-rose-600 border border-gray-200 dark:border-[#293142] transition-colors"
          >
            <Heart className="w-4 h-4" />
            {favoritesCount > 0 && (
              <span className="absolute -top-1 -end-1 w-5 h-5 rounded-full bg-[#E11D48] text-white text-[10px] font-black flex items-center justify-center shadow-xs">
                {favoritesCount}
              </span>
            )}
          </button>

          {/* Customer Orders Tracking Link */}
          <button
            type="button"
            onClick={() => onNavigate('/orders')}
            aria-label={language === 'ar' ? 'طلباتي' : language === 'so' ? 'Dalbkayga' : 'My Orders'}
            title={language === 'ar' ? 'طلباتي وتتبع الشحنات' : language === 'so' ? 'Dalbkayga & Raadinta' : 'My Orders & Tracking'}
            className="w-10 h-10 rounded-full flex items-center justify-center bg-gray-100 dark:bg-[#111722] text-gray-700 dark:text-gray-300 hover:text-[#0E11B7] dark:hover:text-[#3B82F6] border border-gray-200 dark:border-[#293142] transition-colors"
          >
            <Package className="w-4 h-4" />
          </button>

          {/* Customer Address Book Link */}
          <button
            type="button"
            onClick={() => onNavigate('/addresses')}
            aria-label={t('addressBook')}
            title={t('addressBook')}
            className="w-10 h-10 rounded-full flex items-center justify-center bg-gray-100 dark:bg-[#111722] text-gray-700 dark:text-gray-300 hover:text-[#0E11B7] dark:hover:text-[#3B82F6] border border-gray-200 dark:border-[#293142] transition-colors"
          >
            <MapPin className="w-4 h-4" />
          </button>

          {/* Messages Link */}
          <button
            type="button"
            onClick={() => onNavigate('/messages')}
            aria-label={t('messages')}
            title={t('messages')}
            className="relative w-10 h-10 rounded-full flex items-center justify-center bg-gray-100 dark:bg-[#111722] text-gray-700 dark:text-gray-300 hover:text-[#0E11B7] dark:hover:text-[#3B82F6] border border-gray-200 dark:border-[#293142] transition-colors"
          >
            <MessageSquare className="w-4 h-4" />
            {unreadMessages > 0 && (
              <span className="absolute -top-1 -end-1 w-5 h-5 rounded-full bg-[#0E11B7] text-white text-[10px] font-black flex items-center justify-center shadow-xs">
                {unreadMessages > 9 ? '9+' : unreadMessages}
              </span>
            )}
          </button>

          {/* Notifications Link */}
          <button
            type="button"
            onClick={() => onNavigate('/notifications')}
            aria-label={t('notifications')}
            title={t('notifications')}
            className="relative w-10 h-10 rounded-full flex items-center justify-center bg-gray-100 dark:bg-[#111722] text-gray-700 dark:text-gray-300 hover:text-[#0E11B7] dark:hover:text-[#3B82F6] border border-gray-200 dark:border-[#293142] transition-colors"
          >
            <Bell className="w-4 h-4" />
            {unreadNotifs > 0 && (
              <span className="absolute -top-1 -end-1 w-5 h-5 rounded-full bg-[#E11D48] text-white text-[10px] font-black flex items-center justify-center shadow-xs">
                {unreadNotifs > 9 ? '9+' : unreadNotifs}
              </span>
            )}
          </button>

          {/* User Account / Login Button */}
          <button
            type="button"
            onClick={() => onNavigate('/login')}
            aria-label={user ? user.name : t('login')}
            title={user ? `${user.name} (${user.role})` : t('login')}
            className="h-10 px-3 rounded-full flex items-center gap-1.5 bg-gray-100 dark:bg-[#111722] text-gray-700 dark:text-gray-300 hover:text-[#0E11B7] dark:hover:text-[#3B82F6] border border-gray-200 dark:border-[#293142] transition-colors text-xs font-bold"
          >
            {user?.avatar ? (
              <img src={user.avatar} alt={user.name} className="w-5 h-5 rounded-full object-cover" />
            ) : (
              <UserIcon className="w-4 h-4" />
            )}
            <span className="hidden xl:inline max-w-[80px] truncate">{user ? user.name.split(' ')[0] : t('login')}</span>
          </button>

          {/* Cart Trigger with Dropdown */}
          <div className="relative" ref={cartDropdownRef}>
            <button
              type="button"
              onClick={() => setIsCartOpen(!isCartOpen)}
              className="flex items-center gap-2 h-10 px-3.5 rounded-full bg-[#EEF2FF] dark:bg-[#0E11B7]/15 text-[#0E11B7] dark:text-[#3B82F6] border border-[#0E11B7]/25 hover:bg-[#0E11B7] hover:text-white dark:hover:bg-[#0E11B7] dark:hover:text-white transition-all shadow-xs group"
            >
              <div className="relative">
                <ShoppingBag className="w-4 h-4" />
                {totalItems > 0 && (
                  <span className="absolute -top-1.5 -end-1.5 w-4 h-4 rounded-full bg-[#E11D48] text-white text-[9px] font-black flex items-center justify-center">
                    {totalItems}
                  </span>
                )}
              </div>
              <span className="text-xs font-black hidden sm:inline">
                ${subtotal.toFixed(2)}
              </span>
            </button>

            {/* Cart Dropdown Preview */}
            {isCartOpen && (
              <div
                onMouseEnter={pauseCartTimer}
                onMouseLeave={resumeCartTimer}
                className={`absolute top-full mt-2 w-80 sm:w-96 bg-white dark:bg-[#151A23] border border-gray-200 dark:border-[#293142] rounded-2xl shadow-2xl p-4 z-50 animate-slideDown ${
                  isRTL ? 'start-0' : 'end-0'
                }`}
              >
                <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-[#293142]">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-gray-900 dark:text-white">
                      {t('myCart')} ({totalItems})
                    </span>
                    {lastAddedItem && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400">
                        {language === 'ar' ? 'أضيف للتو' : language === 'so' ? 'Hada lagu daray' : 'Just Added'}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={closeCart}
                    aria-label="Close cart"
                    className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {items.length === 0 ? (
                  <div className="py-8 text-center text-gray-500 text-xs">
                    <ShoppingBag className="w-8 h-8 mx-auto mb-2 opacity-30 text-[#0E11B7]" />
                    <p>{t('emptyCart')}</p>
                  </div>
                ) : (
                  <>
                    <div className="max-h-60 overflow-y-auto divide-y divide-gray-100 dark:divide-[#293142] py-2">
                      {items.map(item => {
                        const isRecentlyAdded = lastAddedItem?.id === item.id;
                        return (
                          <div
                            key={item.id}
                            className={`py-2.5 px-2 rounded-xl flex items-center gap-3 transition-colors ${
                              isRecentlyAdded
                                ? 'bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200/50 dark:border-blue-800/40'
                                : ''
                            }`}
                          >
                            <img
                              src={item.product.thumbnail || item.product.images[0]}
                              alt=""
                              className="w-12 h-12 rounded-lg object-cover bg-gray-50 dark:bg-[#111722]"
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-bold text-gray-900 dark:text-white truncate">
                                {item.product.title[language] || item.product.title.en}
                              </p>
                              <p className="text-[11px] text-gray-500">
                                {item.quantity} × ${item.product.price.toFixed(2)}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => removeItem(item.id)}
                              aria-label="Remove item"
                              className="text-gray-400 hover:text-rose-600 p-1"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        );
                      })}
                    </div>

                    <div className="pt-3 border-t border-gray-100 dark:border-[#293142]">
                      <div className="flex justify-between text-xs font-black text-gray-900 dark:text-white mb-3">
                        <span>{t('subtotal')}:</span>
                        <span>${subtotal.toFixed(2)}</span>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            closeCart();
                            onNavigate('/cart');
                          }}
                          className="py-2 px-3 text-center text-xs font-bold border border-gray-300 dark:border-[#293142] rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                        >
                          {t('cart')}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            closeCart();
                            onNavigate('/cart');
                          }}
                          className="py-2 px-3 text-center text-xs font-extrabold bg-[#0E11B7] hover:bg-[#070A86] text-white rounded-xl shadow-xs transition-colors"
                        >
                          {t('checkout')}
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Multi-Vendor Dashboard or Become Seller Action */}
          {user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN' ? (
            <button
              type="button"
              onClick={() => onNavigate('/admin')}
              className="hidden sm:flex items-center gap-1.5 h-10 px-3.5 rounded-full bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow transition-all"
              title="لوحة الإدارة"
            >
              <Shield className="w-4 h-4" />
              <span>لوحة الإدارة</span>
            </button>
          ) : user?.role === 'SELLER' || user?.role === 'RESTAURANT' || user?.role === 'SERVICE_PROVIDER' ? (
            <button
              type="button"
              onClick={() => onNavigate('/seller-dashboard')}
              className="hidden sm:flex items-center gap-1.5 h-10 px-3.5 rounded-full bg-[#0E11B7] hover:bg-[#0c0ea3] text-white font-bold text-xs shadow transition-all"
              title="لوحة البائع"
            >
              <StoreIcon className="w-4 h-4" />
              <span>لوحة البائع</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onNavigate('/become-seller')}
              className="hidden sm:flex items-center gap-1.5 h-10 px-3.5 rounded-full bg-gradient-to-r from-[#0E11B7] to-indigo-700 hover:opacity-95 text-white font-bold text-xs shadow transition-all"
              title={t('becomeSeller')}
            >
              <StoreIcon className="w-3.5 h-3.5" />
              <span>{t('becomeSeller')}</span>
            </button>
          )}

          {/* Mobile Menu Toggle Button */}
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            aria-label="Toggle Mobile Menu"
            className="md:hidden w-10 h-10 rounded-full flex items-center justify-center bg-gray-100 dark:bg-[#111722] text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-[#293142]"
          >
            {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Secondary Navigation (Mega Menu Strip) */}
      <nav className="hidden md:block bg-white dark:bg-[#151A23] border-t border-gray-100 dark:border-[#293142]">
        <div className="max-w-7xl mx-auto px-4 flex items-center justify-start gap-1 py-1 overflow-x-auto scrollbar-none">
          {navLinks.map((link) => {
            const isActive = currentPath === link.path;
            const hasSub = link.sublinks && link.sublinks.length > 0;

            return (
              <div
                key={link.id}
                className="relative group"
                onMouseEnter={() => hasSub && setActiveSubmenu(link.id)}
                onMouseLeave={() => hasSub && setActiveSubmenu(null)}
              >
                <button
                  type="button"
                  onClick={() => onNavigate(link.path)}
                  className={`inline-flex items-center gap-1 py-2 px-3.5 rounded-full text-xs font-bold transition-colors whitespace-nowrap ${
                    isActive
                      ? 'bg-[#EEF2FF] text-[#0E11B7] dark:bg-[#0E11B7]/20 dark:text-[#3B82F6]'
                      : link.highlight
                      ? 'text-[#E11D48] hover:bg-rose-50 dark:hover:bg-rose-950/30'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                  }`}
                >
                  {link.highlight && <Sparkles className="w-3 h-3 text-[#E11D48] animate-pulse" />}
                  <span>{link.label}</span>
                  {hasSub && <ChevronDown className="w-3 h-3 opacity-60" />}
                </button>

                {/* Submenu Dropdown */}
                {hasSub && activeSubmenu === link.id && (
                  <div
                    className={`absolute top-full mt-1 min-w-[220px] bg-white dark:bg-[#151A23] border border-gray-200 dark:border-[#293142] rounded-2xl shadow-xl p-2 z-50 ${
                      isRTL ? 'start-0' : 'start-0'
                    }`}
                  >
                    {link.sublinks?.map((sub, sIdx) => (
                      <button
                        key={sIdx}
                        type="button"
                        onClick={() => {
                          setActiveSubmenu(null);
                          onNavigate(sub.path);
                        }}
                        className="w-full text-start py-2 px-3 rounded-lg text-xs font-semibold text-gray-700 dark:text-gray-300 hover:bg-[#EEF2FF] hover:text-[#0E11B7] dark:hover:bg-gray-800 dark:hover:text-white transition-colors flex items-center justify-between"
                      >
                        <span>{sub.label}</span>
                        <ArrowRight className="w-3 h-3 opacity-40 rtl:rotate-180" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </nav>

      {/* Mobile Drawer Navigation */}
      {isMobileMenuOpen && (
        <div className="md:hidden border-t border-gray-200 dark:border-[#293142] bg-white dark:bg-[#151A23] px-4 py-4 space-y-4 max-h-[80vh] overflow-y-auto">
          {/* Search bar inside mobile drawer */}
          <div className="w-full">
            <AutocompleteSearch
              onNavigate={(path) => {
                setIsMobileMenuOpen(false);
                onNavigate(path);
              }}
            />
          </div>

          {/* Links list */}
          <div className="flex flex-col gap-1">
            {navLinks.map((link) => (
              <div key={link.id} className="border-b border-gray-50 dark:border-[#293142]/40 pb-1">
                <button
                  type="button"
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    onNavigate(link.path);
                  }}
                  className={`w-full flex items-center justify-between py-2 px-2 text-start text-xs font-bold rounded-lg ${
                    currentPath === link.path
                      ? 'bg-[#EEF2FF] text-[#0E11B7] dark:bg-[#0E11B7]/20 dark:text-[#3B82F6]'
                      : 'text-gray-800 dark:text-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <span>{link.label}</span>
                  {link.highlight && <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 text-[10px] font-black">SALE</span>}
                </button>

                {link.sublinks && (
                  <div className="ps-3 py-1 flex flex-col gap-1">
                    {link.sublinks.map((sub, sIdx) => (
                      <button
                        key={sIdx}
                        type="button"
                        onClick={() => {
                          setIsMobileMenuOpen(false);
                          onNavigate(sub.path);
                        }}
                        className="text-start py-1 px-2 text-[11px] text-gray-600 dark:text-gray-400 hover:text-[#0E11B7] flex items-center gap-1.5"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-[#0E11B7]/40" />
                        <span>{sub.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
          {/* Quick User Actions in Mobile Drawer */}
          <div className="pt-2 border-t border-gray-200 dark:border-[#293142] grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setIsMobileMenuOpen(false);
                onNavigate('/orders');
              }}
              className="py-2.5 px-3 rounded-xl bg-gray-100 dark:bg-[#111722] text-gray-800 dark:text-gray-200 text-xs font-bold flex items-center justify-center gap-2 border border-gray-200 dark:border-[#293142]"
            >
              <Package className="w-4 h-4 text-[#0E11B7]" />
              <span>{language === 'ar' ? 'طلباتي' : language === 'so' ? 'Dalbkayga' : 'My Orders'}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setIsMobileMenuOpen(false);
                onNavigate('/addresses');
              }}
              className="py-2.5 px-3 rounded-xl bg-gray-100 dark:bg-[#111722] text-gray-800 dark:text-gray-200 text-xs font-bold flex items-center justify-center gap-2 border border-gray-200 dark:border-[#293142]"
            >
              <MapPin className="w-4 h-4 text-[#0E11B7]" />
              <span>{t('addressBook')}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setIsMobileMenuOpen(false);
                onNavigate('/notifications');
              }}
              className="relative py-2.5 px-3 rounded-xl bg-gray-100 dark:bg-[#111722] text-gray-800 dark:text-gray-200 text-xs font-bold flex items-center justify-center gap-2 border border-gray-200 dark:border-[#293142]"
            >
              <Bell className="w-4 h-4 text-[#0E11B7]" />
              <span>{t('notifications')}</span>
              {unreadNotifs > 0 && (
                <span className="w-4 h-4 rounded-full bg-[#E11D48] text-white text-[9px] font-black flex items-center justify-center">
                  {unreadNotifs}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                setIsMobileMenuOpen(false);
                onNavigate('/messages');
              }}
              className="relative py-2.5 px-3 rounded-xl bg-gray-100 dark:bg-[#111722] text-gray-800 dark:text-gray-200 text-xs font-bold flex items-center justify-center gap-2 border border-gray-200 dark:border-[#293142]"
            >
              <MessageSquare className="w-4 h-4 text-[#0E11B7]" />
              <span>{t('messages')}</span>
              {unreadMessages > 0 && (
                <span className="w-4 h-4 rounded-full bg-[#0E11B7] text-white text-[9px] font-black flex items-center justify-center">
                  {unreadMessages}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                setIsMobileMenuOpen(false);
                onNavigate('/favorites');
              }}
              className="py-2.5 px-3 rounded-xl bg-gray-100 dark:bg-[#111722] text-gray-800 dark:text-gray-200 text-xs font-bold flex items-center justify-center gap-2 border border-gray-200 dark:border-[#293142]"
            >
              <Heart className="w-4 h-4 text-rose-600" />
              <span>{t('wishlist')}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setIsMobileMenuOpen(false);
                onNavigate('/login');
              }}
              className="py-2.5 px-3 rounded-xl bg-gray-100 dark:bg-[#111722] text-gray-800 dark:text-gray-200 text-xs font-bold flex items-center justify-center gap-2 border border-gray-200 dark:border-[#293142] col-span-2"
            >
              {user?.avatar ? (
                <img src={user.avatar} alt={user.name} className="w-4 h-4 rounded-full object-cover" />
              ) : (
                <UserIcon className="w-4 h-4 text-[#0E11B7]" />
              )}
              <span>{user ? `${user.name} (${user.role})` : t('login')}</span>
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
