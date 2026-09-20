import React, { useState, useEffect } from 'react';
import { LanguageProvider, useLanguage } from './i18n/LanguageContext';
import { ThemeProvider } from './context/ThemeContext';
import { FavoritesProvider } from './context/FavoritesContext';
import { CartProvider } from './context/CartContext';
import { Navbar } from './components/common/Navbar';
import { Footer } from './components/common/Footer';
import { QuickViewModal } from './components/common/QuickViewModal';
import { ToastContainer, ToastMessage } from './components/common/Toast';
import { HomePage } from './pages/HomePage';
import { ShopPage } from './pages/ShopPage';
import { ProductDetailPage } from './pages/ProductDetailPage';
import { CartPage } from './pages/CartPage';
import { FavoritesPage } from './pages/FavoritesPage';
import { OffersPage } from './pages/OffersPage';
import { SearchPage } from './pages/SearchPage';
import { AboutPage } from './pages/AboutPage';
import { ContactPage } from './pages/ContactPage';
import { BecomeSellerPage } from './pages/BecomeSellerPage';
import { StorePage } from './pages/StorePage';
import { RestaurantPage } from './pages/RestaurantPage';
import { ServiceProviderPage } from './pages/ServiceProviderPage';
import { SellerDashboardPage } from './pages/SellerDashboardPage';
import { AdminDashboardPage } from './pages/AdminDashboardPage';
import { StoresDirectoryPage } from './pages/StoresDirectoryPage';
import { RestaurantsDirectoryPage } from './pages/RestaurantsDirectoryPage';
import { ServicesDirectoryPage } from './pages/ServicesDirectoryPage';
import { AdsPage } from './pages/AdsPage';
import { OrdersPage } from './pages/OrdersPage';
import { LegalPage } from './pages/LegalPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { MessagesPage } from './pages/MessagesPage';
import { AddressesPage } from './pages/AddressesPage';
import { CategoriesPage } from './pages/CategoriesPage';
import { FollowingPage } from './pages/FollowingPage';
import { NearbyPage } from './pages/NearbyPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { LoginPage } from './pages/LoginPage';
import { AuthProvider } from './context/AuthContext';
import { RoleSwitcherBanner } from './components/common/RoleSwitcherBanner';
import { Product } from './types';
import { updatePageSEO } from './services/seo';
import { seedService } from './services/seedService';
import { storeService } from './services/storeService';
import { productService } from './services/productService';
import { orderService } from './services/orderService';
import { reviewService } from './services/reviewService';
import { bookingService } from './services/bookingService';

function AppContent() {
  const { language, t } = useLanguage();

  // Hash-based navigation
  const [currentHash, setCurrentHash] = useState(() => {
    return window.location.hash || '#/';
  });

  // Quick View state
  const [quickViewProduct, setQuickViewProduct] = useState<Product | null>(null);

  // Toast notifications state
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = (type: 'success' | 'error' | 'info', message: string, title?: string) => {
    const id = Date.now().toString() + Math.random().toString();
    setToasts(prev => [...prev, { id, type, title, message }]);
  };

  const dismissToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  // Sync hash changes
  useEffect(() => {
    const handleHashChange = () => {
      setCurrentHash(window.location.hash || '#/');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Initialize Firestore catalog and sync real-time collections
  useEffect(() => {
    seedService.seedInitialCatalogIfNeeded().then(() => {
      storeService.syncWithFirestore();
      productService.syncWithFirestore();
      orderService.syncWithFirestore();
      reviewService.syncWithFirestore();
      bookingService.syncWithFirestore();
    });
  }, []);

  const navigate = (path: string) => {
    const targetHash = path.startsWith('#') ? path : `#${path.startsWith('/') ? path : '/' + path}`;
    window.location.hash = targetHash;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Parse path and query parameters
  const rawPath = currentHash.replace(/^#/, '') || '/';
  const [pathOnly, queryString] = rawPath.split('?');
  const searchParams = new URLSearchParams(queryString || '');

  // Dynamic SEO update based on page
  useEffect(() => {
    if (pathOnly === '/' || pathOnly === '') {
      updatePageSEO({
        title: 'MarketSpace | السوق الرقمي الشامل للتجارة والمطاعم والخدمات',
        description: 'منصة MarketSpace للتجارة الإلكترونية، المطاعم، الدروبشيبينغ، والخدمات مع دعم الدفع عبر EVC Plus و Zaad وبطاقات الائتمان في الصومال والشرق الأوسط.',
        type: 'website',
        breadcrumbs: [{ name: t('home'), url: '/' }],
        language,
      });
    } else if (pathOnly === '/shop') {
      updatePageSEO({
        title: `${t('shop')} | MarketSpace`,
        description: 'تصفح تشكيلة واسعة من المنتجات، الإلكترونيات، العناية والجمال، وجبات المطاعم، والخدمات التقنية.',
        type: 'website',
        breadcrumbs: [
          { name: t('home'), url: '/' },
          { name: t('shop'), url: '/shop' },
        ],
        language,
      });
    } else if (pathOnly === '/cart') {
      updatePageSEO({
        title: `${t('cart')} | MarketSpace`,
        description: 'مراجعة سلة الشراء، تفاصيل المنتجات، وإتمام الطلب مع خيارات الدفع المحلي والعالمي.',
        type: 'website',
        breadcrumbs: [
          { name: t('home'), url: '/' },
          { name: t('cart'), url: '/cart' },
        ],
        language,
      });
    } else if (pathOnly === '/offers') {
      updatePageSEO({
        title: `${t('offers')} | MarketSpace`,
        description: 'أقوى العروض والتخفيضات اليومية مع خصومات تصل إلى 50% على أفضل المنتجات والخدمات.',
        type: 'website',
        breadcrumbs: [
          { name: t('home'), url: '/' },
          { name: t('offers'), url: '/offers' },
        ],
        language,
      });
    }
  }, [pathOnly, language, t]);

  // Route Rendering
  const renderCurrentView = () => {
    // 1. Product Detail: /product/:slug
    if (pathOnly.startsWith('/product/')) {
      const slug = pathOnly.replace('/product/', '');
      return (
        <ProductDetailPage
          slug={slug}
          onNavigate={navigate}
          onQuickView={setQuickViewProduct}
        />
      );
    }

    // 2. Shop Sub-modes & Directory Pages
    if (pathOnly === '/shop/new') {
      return (
        <ShopPage
          mode="new"
          onNavigate={navigate}
          onQuickView={setQuickViewProduct}
        />
      );
    }

    if (pathOnly === '/shop/used') {
      return (
        <ShopPage
          mode="used"
          onNavigate={navigate}
          onQuickView={setQuickViewProduct}
        />
      );
    }

    if (pathOnly === '/shop/dropshipping') {
      return (
        <ShopPage
          mode="dropshipping"
          onNavigate={navigate}
          onQuickView={setQuickViewProduct}
        />
      );
    }

    // 2.1 Main Shop Page: /shop (with backward compatibility for query strings)
    if (pathOnly === '/shop') {
      const typeParam = searchParams.get('type') || undefined;
      const catParam = searchParams.get('category') || undefined;

      // Backward-compatible query handling
      if (typeParam === 'restaurants') {
        return <RestaurantsDirectoryPage onNavigate={navigate} />;
      }
      if (typeParam === 'services') {
        return <ServicesDirectoryPage onNavigate={navigate} />;
      }
      if (typeParam === 'ads') {
        return <AdsPage onNavigate={navigate} />;
      }
      if (typeParam === 'stores') {
        return <StoresDirectoryPage onNavigate={navigate} />;
      }
      if (typeParam === 'used') {
        return (
          <ShopPage
            mode="used"
            initialCategory={catParam}
            onNavigate={navigate}
            onQuickView={setQuickViewProduct}
          />
        );
      }
      if (typeParam === 'dropshipping') {
        return (
          <ShopPage
            mode="dropshipping"
            initialCategory={catParam}
            onNavigate={navigate}
            onQuickView={setQuickViewProduct}
          />
        );
      }

      return (
        <ShopPage
          mode="all"
          initialCategory={catParam}
          initialType={typeParam}
          onNavigate={navigate}
          onQuickView={setQuickViewProduct}
        />
      );
    }

    // 2.2 Restaurants Directory: /restaurants
    if (pathOnly === '/restaurants') {
      return <RestaurantsDirectoryPage onNavigate={navigate} />;
    }

    // 2.3 Services Directory: /services
    if (pathOnly === '/services') {
      return <ServicesDirectoryPage onNavigate={navigate} />;
    }

    // 2.4 Commercial Ads Page: /ads
    if (pathOnly === '/ads') {
      return <AdsPage onNavigate={navigate} />;
    }

    // 3. Cart & Checkout: /cart
    if (pathOnly === '/cart') {
      return <CartPage onNavigate={navigate} />;
    }

    // 4. Wishlist / Favorites: /favorites
    if (pathOnly === '/favorites') {
      return (
        <FavoritesPage
          onNavigate={navigate}
          onQuickView={setQuickViewProduct}
        />
      );
    }

    // 5. Offers & Flash Sales: /offers
    if (pathOnly === '/offers') {
      return (
        <OffersPage
          onNavigate={navigate}
          onQuickView={setQuickViewProduct}
        />
      );
    }

    // 6. Search Results: /search
    if (pathOnly === '/search') {
      const queryParam = searchParams.get('q') || '';
      return (
        <SearchPage
          initialQuery={queryParam}
          onNavigate={navigate}
          onQuickView={setQuickViewProduct}
        />
      );
    }

    // 6.1 Categories Index: /categories
    if (pathOnly === '/categories') {
      return <CategoriesPage onNavigate={navigate} />;
    }

    // 6.2 Following Feed: /following
    if (pathOnly === '/following') {
      return <FollowingPage onNavigate={navigate} />;
    }

    // 6.3 Location-Aware Nearby Discovery: /nearby
    if (pathOnly === '/nearby') {
      return <NearbyPage onNavigate={navigate} />;
    }

    // 7. About: /about
    if (pathOnly === '/about') {
      return <AboutPage onNavigate={navigate} />;
    }

    // 8. Contact: /contact
    if (pathOnly === '/contact') {
      return <ContactPage />;
    }

    // 9. Become a Seller Onboarding Wizard: /become-seller
    if (pathOnly === '/become-seller') {
      return <BecomeSellerPage onNavigate={navigate} />;
    }

    // 10. Stores Directory: /stores
    if (pathOnly === '/stores') {
      return <StoresDirectoryPage onNavigate={navigate} />;
    }

    // 11. Retail Storefront: /store/:slug
    if (pathOnly.startsWith('/store/')) {
      const slug = pathOnly.replace('/store/', '');
      return (
        <StorePage
          slug={slug}
          onNavigate={navigate}
          onQuickView={setQuickViewProduct}
        />
      );
    }

    // 12. Restaurant Storefront: /restaurant/:slug
    if (pathOnly.startsWith('/restaurant/')) {
      const slug = pathOnly.replace('/restaurant/', '');
      return <RestaurantPage slug={slug} onNavigate={navigate} />;
    }

    // 13. Service Provider Page: /service/:slug
    if (pathOnly.startsWith('/service/')) {
      const slug = pathOnly.replace('/service/', '');
      return <ServiceProviderPage slug={slug} onNavigate={navigate} />;
    }

    // 14. Customer Orders & Tracking: /orders or /orders/:orderId
    if (pathOnly === '/orders' || pathOnly.startsWith('/orders/')) {
      const orderIdParam = pathOnly.startsWith('/orders/') ? pathOnly.replace('/orders/', '') : undefined;
      return <OrdersPage onNavigate={navigate} orderIdFromRoute={orderIdParam} />;
    }

    // 14.1 Notifications Center: /notifications
    if (pathOnly === '/notifications') {
      return <NotificationsPage onNavigate={navigate} />;
    }

    // 14.2 Messaging Center: /messages
    if (pathOnly === '/messages') {
      const convIdParam = searchParams.get('convId') || undefined;
      return <MessagesPage onNavigate={navigate} activeConvIdFromRoute={convIdParam} />;
    }

    // 14.3 Customer Address Book: /addresses or /profile/addresses
    if (pathOnly === '/addresses' || pathOnly === '/profile/addresses') {
      return <AddressesPage onNavigate={navigate} />;
    }

    // 14.4 Authentication & Account Login: /login or /register
    if (pathOnly === '/login' || pathOnly === '/register') {
      return <LoginPage onNavigate={navigate} />;
    }

    // 15. Legal & Policies: /terms, /privacy, /returns, /faq
    if (pathOnly === '/terms') {
      return <LegalPage type="terms" onNavigate={navigate} />;
    }
    if (pathOnly === '/privacy') {
      return <LegalPage type="privacy" onNavigate={navigate} />;
    }
    if (pathOnly === '/returns') {
      return <LegalPage type="returns" onNavigate={navigate} />;
    }
    if (pathOnly === '/faq') {
      return <LegalPage type="faq" onNavigate={navigate} />;
    }

    // 16. Seller Dashboard & Sub-routes: /seller-dashboard or /seller/*
    if (pathOnly === '/seller-dashboard' || pathOnly === '/seller' || pathOnly.startsWith('/seller/')) {
      return <SellerDashboardPage onNavigate={navigate} />;
    }

    // 17. Admin Central Dashboard: /admin
    if (pathOnly === '/admin' || pathOnly.startsWith('/admin/')) {
      return <AdminDashboardPage onNavigate={navigate} currentPath={pathOnly} />;
    }

    // 18. Root / Home Page
    if (pathOnly === '/' || pathOnly === '') {
      return (
        <HomePage
          onNavigate={navigate}
          onQuickView={setQuickViewProduct}
        />
      );
    }

    // 19. Dedicated 404 Not Found Page for unknown paths
    return (
      <NotFoundPage
        onNavigate={navigate}
        attemptedPath={pathOnly}
      />
    );
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-[#0B1120] text-gray-900 dark:text-gray-100 selection:bg-[#0E11B7] selection:text-white transition-colors">
      {/* Role Switcher Floating/Top Banner for Reviewer and Multi-Vendor Testing */}
      <RoleSwitcherBanner onNavigate={navigate} />

      {/* Header & Mega Navigation */}
      <Navbar currentPath={pathOnly} onNavigate={navigate} />

      {/* Main Content Area */}
      <main className="flex-1 w-full">
        {renderCurrentView()}
      </main>

      {/* Global Footer */}
      <Footer onNavigate={navigate} />

      {/* Quick View Lightbox Modal */}
      <QuickViewModal
        product={quickViewProduct}
        isOpen={!!quickViewProduct}
        onClose={() => setQuickViewProduct(null)}
        onNavigateDetail={(slug) => {
          setQuickViewProduct(null);
          navigate(`/product/${slug}`);
        }}
      />

      {/* Floating Interactive Toast Feedback */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <AuthProvider>
          <FavoritesProvider>
            <CartProvider>
              <AppContent />
            </CartProvider>
          </FavoritesProvider>
        </AuthProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}
