import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Package,
  ShoppingBag,
  Calendar,
  Settings,
  Plus,
  Edit2,
  Trash2,
  Eye,
  EyeOff,
  CheckCircle2,
  Clock,
  DollarSign,
  Users,
  Store as StoreIcon,
  Phone,
  MessageCircle,
  Truck,
  AlertCircle,
  ExternalLink,
  Star,
  Reply,
  History,
  AlertTriangle,
  Send,
  CreditCard,
  FileText,
  Search,
  Filter,
  ArrowUpRight,
  ShieldCheck,
  Check,
  X,
  Zap,
  Sparkles,
  ShieldAlert,
} from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { Product, Store, VendorSubOrder, ServiceBooking, Review, PayoutRequest, OrderDispute, DeliveryAssignment, DriverProfile } from '../types';
import { storeService } from '../services/storeService';
import { productService } from '../services/productService';
import { orderService } from '../services/orderService';
import { bookingService } from '../services/bookingService';
import { reviewService } from '../services/reviewService';
import { payoutService } from '../services/payoutService';
import { disputeService } from '../services/disputeService';
import { deliveryService } from '../services/deliveryService';
import { ImageUploadWidget } from '../components/ImageUploadWidget';
import { SellerMonetizationTab } from '../components/monetization/SellerMonetizationTab';

interface SellerDashboardPageProps {
  onNavigate: (path: string) => void;
}

export const SellerDashboardPage: React.FC<SellerDashboardPageProps> = ({ onNavigate }) => {
  const { language, t } = useLanguage();
  const { user, switchDemoRole } = useAuth();

  const metaEnv = (import.meta as unknown as { env?: { PROD?: boolean; VITE_ENABLE_DEV_ROLE_SWITCHER?: string } }).env;
  const isProd = metaEnv?.PROD;
  const isDevExplicitlyAllowed = metaEnv?.VITE_ENABLE_DEV_ROLE_SWITCHER === 'true';
  const showDevRoleSwitcher = !isProd || isDevExplicitlyAllowed;

  const [activeTab, setActiveTab] = useState<
    'overview' | 'products' | 'orders' | 'bookings' | 'reviews' | 'payouts' | 'monetization' | 'settings' | 'disputes' | 'deliveries'
  >('overview');

  const [store, setStore] = useState<Store | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<{ order: any; vendorSubOrder: VendorSubOrder }[]>([]);
  const [bookings, setBookings] = useState<ServiceBooking[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [payouts, setPayouts] = useState<PayoutRequest[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryAssignment[]>([]);
  const [sellerDisputes, setSellerDisputes] = useState<OrderDispute[]>([]);
  const [availableDrivers, setAvailableDrivers] = useState<DriverProfile[]>([]);

  // Dispute Response Modal
  const [selectedDisputeToRespond, setSelectedDisputeToRespond] = useState<OrderDispute | null>(null);
  const [disputeResponseText, setDisputeResponseText] = useState('');
  const [disputeProposedResolution, setDisputeProposedResolution] = useState<'refund' | 'replacement' | 'decline'>('refund');
  const [isSubmittingDisputeResponse, setIsSubmittingDisputeResponse] = useState(false);

  // Delivery Driver Assignment Modal
  const [selectedDeliveryToAssign, setSelectedDeliveryToAssign] = useState<DeliveryAssignment | null>(null);
  const [selectedDriverIdToAssign, setSelectedDriverIdToAssign] = useState('');
  const [isAssigningDriver, setIsAssigningDriver] = useState(false);

  // Feedback Toast
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Product Filter & Search
  const [productSearch, setProductSearch] = useState('');
  const [productStatusFilter, setProductStatusFilter] = useState('all');

  // Product Add / Edit Modal
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [productFormData, setProductFormData] = useState({
    titleAr: '',
    titleEn: '',
    descAr: '',
    descEn: '',
    sku: '',
    price: 25.0,
    oldPrice: 35.0,
    stock: 20,
    lowStockThreshold: 5,
    category: 'cosmetics',
    type: 'cosmetics',
    imageUrl: '',
    isOffer: false,
    status: 'published' as any,
    prepTimeMinutes: 20,
    dietaryTags: [] as string[],
  });

  // Inventory History Modal
  const [historyProduct, setHistoryProduct] = useState<Product | null>(null);

  // Order Fulfillment Modal
  const [selectedFulfillment, setSelectedFulfillment] = useState<{
    parentOrderId: string;
    subOrder: VendorSubOrder;
  } | null>(null);
  const [newFulfillmentStatus, setNewFulfillmentStatus] = useState<VendorSubOrder['status']>('preparing');
  const [trackingNumberInput, setTrackingNumberInput] = useState('');
  const [fulfillmentNoteInput, setFulfillmentNoteInput] = useState('');

  // Payout Modal
  const [isPayoutModalOpen, setIsPayoutModalOpen] = useState(false);
  const [isSubmittingPayout, setIsSubmittingPayout] = useState(false);
  const [financialSummary, setFinancialSummary] = useState<{
    totalEarned: number;
    totalRefunds: number;
    totalReservedOrPaid: number;
    availableBalance: number;
    netRevenue: number;
  } | null>(null);
  const [payoutFormData, setPayoutFormData] = useState({
    amount: 50.0,
    paymentMethod: 'zaad' as const,
    accountNumber: '',
    accountName: '',
  });

  // Review Reply State
  const [replyingReviewId, setReplyingReviewId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');

  // Load seller's store and all relevant data
  useEffect(() => {
    if (!user) return;

    let targetStore: Store | undefined;
    if (user.storeId) {
      targetStore = storeService.getStoreById(user.storeId);
    }
    if (!targetStore) {
      const allStores = storeService.getAllStores();
      targetStore = allStores.find(s => s.sellerId === user.id);
    }

    if (targetStore) {
      setStore(targetStore);

      // Load products
      const sellerProds = productService.getAllProducts({ storeId: targetStore.id });
      setProducts(sellerProds);

      // Load orders
      const sellerOrders = orderService.getOrdersBySellerId(user.id, user.id, user.role);
      setOrders(sellerOrders);

      // Load bookings
      const sellerBookings = bookingService.getBookingsBySellerId(user.id, user.id, user.role);
      setBookings(sellerBookings);

      // Load reviews
      const prodIds = sellerProds.map(p => p.id);
      const storeReviews = reviewService.getReviewsByStore(targetStore.id, prodIds);
      setReviews(storeReviews);

      // Load payouts
      const sellerPayouts = payoutService.getPayoutRequestsBySeller(user.id);
      setPayouts(sellerPayouts);

      // Load disputes for this seller
      const sellerDisps = disputeService.getDisputesBySeller(user.id);
      setSellerDisputes(sellerDisps);

      // Load deliveries & fleet for this store
      deliveryService.ensureAssignmentsFromOrders(sellerOrders.map(o => o.order));
      const storeDelivs = deliveryService.getAssignmentsByStore(targetStore.id);
      setDeliveries(storeDelivs.length > 0 ? storeDelivs : deliveryService.getAssignmentsBySeller(user.id));
      setAvailableDrivers(deliveryService.getAvailableDrivers());

      // FIN-01 / FIN-02: Authoritative Server Financial Summary
      payoutService.getFinancialSummary(user.id).then(summary => {
        setFinancialSummary(summary);
      }).catch(err => {
        console.warn('Authoritative financial summary fetch:', err?.message);
      });
    } else {
      setStore(null);
      setProducts([]);
      setOrders([]);
      setBookings([]);
      setReviews([]);
      setPayouts([]);
      setDeliveries([]);
      setSellerDisputes([]);
      setFinancialSummary(null);
    }
  }, [user]);

  const isVendorRole =
    user &&
    (user.role === 'SELLER' ||
      user.role === 'RESTAURANT' ||
      user.role === 'SERVICE_PROVIDER' ||
      user.role === 'ADMIN' ||
      user.role === 'SUPER_ADMIN');

  if (!isVendorRole) {
    return (
      <div className="min-h-[75vh] flex items-center justify-center p-4 bg-gray-50 dark:bg-[#0B1120]">
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-8 max-w-md w-full text-center shadow-lg">
          <div className="w-16 h-16 bg-blue-50 dark:bg-blue-950/60 text-[#0E11B7] rounded-2xl flex items-center justify-center mx-auto mb-4">
            <StoreIcon className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
            لوحة تحكم البائع والشركاء
          </h2>
          <p className="text-xs text-gray-500 mb-6 leading-relaxed">
            {showDevRoleSwitcher
              ? 'أنت مسجل حالياً كعميل أو زائر. لتجربة لوحة تحكم التاجر، يمكنك التبديل إلى حساب بائع أو فتح متجرك الآن:'
              : 'لوحة التحكم هذه مخصصة للبائعين وأصحاب المتاجر والمطاعم المعتمدين في منصة MarketSpace.'}
          </p>

          <div className="space-y-3">
            {showDevRoleSwitcher && (
              <>
                <button
                  onClick={() => switchDemoRole('SELLER')}
                  className="w-full bg-[#0E11B7] hover:bg-[#0c0ea3] text-white py-2.5 rounded-xl font-semibold text-xs transition flex items-center justify-center gap-2 shadow"
                >
                  <span>تجربة دور بائع التجزئة (Retail Seller)</span>
                </button>
                <button
                  onClick={() => switchDemoRole('RESTAURANT')}
                  className="w-full bg-amber-600 hover:bg-amber-700 text-white py-2.5 rounded-xl font-semibold text-xs transition flex items-center justify-center gap-2 shadow"
                >
                  <span>تجربة دور صاحب مطعم (Restaurant)</span>
                </button>
                <button
                  onClick={() => switchDemoRole('SERVICE_PROVIDER')}
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white py-2.5 rounded-xl font-semibold text-xs transition flex items-center justify-center gap-2 shadow"
                >
                  <span>تجربة دور مقدم خدمة (Service Provider)</span>
                </button>
              </>
            )}
            <button
              onClick={() => onNavigate('/become-seller')}
              className="w-full bg-[#0E11B7] hover:bg-[#0c0ea3] text-white py-2.5 rounded-xl font-bold text-xs transition shadow"
            >
              {t('becomeSeller')}
            </button>
            <button
              onClick={() => onNavigate('/')}
              className="w-full border border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 py-2.5 rounded-xl font-semibold text-xs transition"
            >
              {t('backToHome')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!store) {
    return (
      <div className="min-h-[75vh] flex items-center justify-center p-4 bg-gray-50 dark:bg-[#0B1120]">
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-8 max-w-md w-full text-center shadow-lg">
          <div className="w-16 h-16 bg-amber-50 dark:bg-amber-950/60 text-amber-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Clock className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
            طلب المتجر قيد المراجعة أو غير مسجل
          </h2>
          <p className="text-xs text-gray-500 mb-6 leading-relaxed">
            لم نتمكن من العثور على متجر معتمد مرتبط بهذا الحساب. إذا كنت قد أرسلت طلب تسجيل متجر جديد، يرجى الانتظار حتى اعتماده من إدارة المنصة، أو تقديم طلب فتح متجر جديد.
          </p>
          <div className="space-y-3">
            <button
              onClick={() => onNavigate('/become-seller')}
              className="w-full bg-[#0E11B7] hover:bg-[#0c0ea3] text-white py-2.5 rounded-xl font-semibold text-xs transition shadow"
            >
              تقديم طلب تسجيل متجر جديد
            </button>
            <button
              onClick={() => onNavigate('/')}
              className="w-full border border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 py-2.5 rounded-xl font-semibold text-xs transition"
            >
              العودة إلى الصفحة الرئيسية
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Financial calculations (FIN-01: Single Source of Truth via Authoritative Server Summary)
  const totalRevenue = financialSummary
    ? financialSummary.totalEarned
    : orders.reduce((sum, o) => sum + (o.vendorSubOrder.sellerRevenue || 0), 0);
  const totalWithdrawn = financialSummary
    ? financialSummary.totalReservedOrPaid
    : payouts
        .filter(p => p.status === 'processed' || p.status === 'approved' || p.status === 'paid')
        .reduce((sum, p) => sum + p.amount, 0);
  const availableBalance = financialSummary
    ? financialSummary.availableBalance
    : Math.max(0, totalRevenue - totalWithdrawn);
  const totalOrdersCount = orders.length;
  const activeProductsCount = products.filter(p => p.isPublished && p.status === 'published').length;
  const lowStockProducts = products.filter(p => (p.stock || 0) <= (p.lowStockThreshold ?? 5));

  // Product handlers
  const handleOpenCreateProduct = () => {
    setEditingProduct(null);
    setProductFormData({
      titleAr: '',
      titleEn: '',
      descAr: '',
      descEn: '',
      sku: `SKU-${Date.now().toString().slice(-6)}`,
      price: 25.0,
      oldPrice: 35.0,
      stock: 20,
      lowStockThreshold: 5,
      category: store?.category || 'cosmetics',
      type: store?.sellerType === 'restaurant' ? 'restaurant' : store?.category || 'cosmetics',
      imageUrl: 'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=600&q=80',
      isOffer: false,
      status: 'published',
      prepTimeMinutes: 20,
      dietaryTags: [],
    });
    setIsProductModalOpen(true);
  };

  const handleOpenEditProduct = (prod: Product) => {
    setEditingProduct(prod);
    setProductFormData({
      titleAr: prod.title.ar,
      titleEn: prod.title.en,
      descAr: prod.description.ar,
      descEn: prod.description.en,
      sku: prod.sku || `SKU-${prod.id.slice(-6)}`,
      price: prod.price,
      oldPrice: prod.oldPrice || prod.price * 1.2,
      stock: prod.stock || 0,
      lowStockThreshold: prod.lowStockThreshold ?? 5,
      category: prod.category,
      type: prod.type,
      imageUrl: prod.thumbnail || prod.images[0] || '',
      isOffer: prod.isOffer || false,
      status: prod.status || 'published',
      prepTimeMinutes: prod.prepTimeMinutes || 20,
      dietaryTags: prod.dietaryTags || [],
    });
    setIsProductModalOpen(true);
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!store || !user) return;

    if (editingProduct) {
      await productService.updateProductAuthoritative(
        editingProduct.id,
        {
          title: { ar: productFormData.titleAr, en: productFormData.titleEn, so: productFormData.titleEn },
          description: { ar: productFormData.descAr, en: productFormData.descEn, so: productFormData.descEn },
          sku: productFormData.sku,
          price: Number(productFormData.price),
          oldPrice: Number(productFormData.oldPrice),
          stock: Number(productFormData.stock),
          lowStockThreshold: Number(productFormData.lowStockThreshold),
          category: productFormData.category,
          type: productFormData.type as any,
          thumbnail: productFormData.imageUrl,
          images: [productFormData.imageUrl],
          isOffer: productFormData.isOffer,
          status: productFormData.status,
          isPublished: productFormData.status === 'published',
          prepTimeMinutes: Number(productFormData.prepTimeMinutes),
          dietaryTags: productFormData.dietaryTags,
        },
        user.id,
        user.role
      );
    } else {
      await productService.createProductAuthoritative(
        {
          title: { ar: productFormData.titleAr, en: productFormData.titleEn, so: productFormData.titleEn },
          description: { ar: productFormData.descAr, en: productFormData.descEn, so: productFormData.descEn },
          slug: productFormData.titleEn.toLowerCase().replace(/\s+/g, '-') || `prod-${Date.now()}`,
          sku: productFormData.sku,
          price: Number(productFormData.price),
          oldPrice: Number(productFormData.oldPrice),
          currency: 'USD',
          stock: Number(productFormData.stock),
          lowStockThreshold: Number(productFormData.lowStockThreshold),
          category: productFormData.category,
          categories: [productFormData.category],
          tags: [productFormData.category],
          type: productFormData.type as any,
          thumbnail: productFormData.imageUrl,
          images: [productFormData.imageUrl],
          isOffer: productFormData.isOffer,
          isPublished: productFormData.status === 'published',
          status: productFormData.status,
          prepTimeMinutes: Number(productFormData.prepTimeMinutes),
          dietaryTags: productFormData.dietaryTags,
          sellerId: user.id,
          storeId: store.id,
        },
        user.id,
        store.id
      );
    }

    setProducts(productService.getAllProducts({ storeId: store.id }));
    setIsProductModalOpen(false);
  };

  const handleDeleteProduct = async (id: string) => {
    if (!user) return;
    if (window.confirm('هل أنت متأكد من رغبتك في حذف هذا المنتج نهائياً؟')) {
      await productService.deleteProductAuthoritative(id, user.id, user.role);
      setProducts(products.filter(p => p.id !== id));
    }
  };

  const handleQuickStockAdjust = async (product: Product, delta: number) => {
    if (!user || !store) return;
    const current = product.stock || 0;
    const newStock = Math.max(0, current + delta);
    await productService.updateProductAuthoritative(
      product.id,
      { stock: newStock },
      user.id,
      user.role
    );
    setProducts(productService.getAllProducts({ storeId: store.id }));
  };

  const handleTogglePublish = async (product: Product) => {
    if (!user || !store) return;
    const nextStatus = product.status === 'published' ? 'hidden' : 'published';
    await productService.updateProductAuthoritative(
      product.id,
      { status: nextStatus, isPublished: nextStatus === 'published' },
      user.id,
      user.role
    );
    setProducts(productService.getAllProducts({ storeId: store.id }));
  };

  // Order Fulfillment
  const handleOpenFulfillment = (parentOrderId: string, subOrder: VendorSubOrder) => {
    setSelectedFulfillment({ parentOrderId, subOrder });
    setNewFulfillmentStatus(subOrder.status);
    setTrackingNumberInput(subOrder.trackingNumber || '');
    setFulfillmentNoteInput('');
  };

  const handleConfirmFulfillment = async () => {
    if (!user || !selectedFulfillment) return;
    try {
      await orderService.updateVendorOrderStatus(
        selectedFulfillment.parentOrderId,
        selectedFulfillment.subOrder.subOrderId,
        newFulfillmentStatus,
        user.id,
        user.role,
        fulfillmentNoteInput || undefined,
        trackingNumberInput || undefined
      );
      setOrders(orderService.getOrdersBySellerId(user.id, user.id, user.role));
      setSelectedFulfillment(null);
      showToast(language === 'ar' ? 'تم تحديث حالة الطلب بنجاح' : 'Order status updated successfully', 'success');
    } catch (err: any) {
      console.error('Failed to update vendor order status:', err);
      showToast(err?.message || 'Failed to update order status', 'error');
    }
  };

  // Booking updates
  const handleUpdateBookingStatus = (bookingId: string, newStatus: any) => {
    if (!user) return;
    bookingService.updateBookingStatus(bookingId, newStatus, user.id, user.role);
    setBookings(bookingService.getBookingsBySellerId(user.id, user.id, user.role));
    showToast(language === 'ar' ? 'تم تحديث حالة الحجز' : 'Booking status updated', 'success');
  };

  // Review reply
  const handleSendReviewReply = async (reviewId: string) => {
    if (!replyText.trim()) return;
    try {
      const updated = await reviewService.replyToReview(reviewId, replyText, user.id, store?.id);
      setReviews(reviews.map(r => (r.id === reviewId ? updated : r)));
      setReplyingReviewId(null);
      setReplyText('');
      showToast(language === 'ar' ? 'تم إرسال ردك على التقييم بنجاح' : 'Review reply submitted', 'success');
    } catch (err: any) {
      showToast(err.message || 'فشل إرسال الرد', 'error');
    }
  };

  // Dispute response handler
  const handleRespondToDispute = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedDisputeToRespond || !disputeResponseText.trim()) return;

    setIsSubmittingDisputeResponse(true);
    try {
      disputeService.sellerRespond({
        disputeId: selectedDisputeToRespond.id,
        sellerId: user.id,
        message: disputeResponseText.trim(),
        proposedAction:
          disputeProposedResolution === 'refund'
            ? 'accept_refund'
            : disputeProposedResolution === 'replacement'
            ? 'send_replacement'
            : 'reject',
      });
      setSellerDisputes(disputeService.getDisputesBySeller(user.id));
      setSelectedDisputeToRespond(null);
      setDisputeResponseText('');
      showToast(language === 'ar' ? 'تم إرسال ردك على النزاع بنجاح' : 'Response submitted successfully', 'success');
    } catch (err: any) {
      showToast(err.message || 'فشل إرسال الرد على النزاع', 'error');
    } finally {
      setIsSubmittingDisputeResponse(false);
    }
  };

  // Driver assignment handler
  const handleAssignDriver = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedDeliveryToAssign || !selectedDriverIdToAssign) return;

    const drv = availableDrivers.find(d => d.id === selectedDriverIdToAssign);
    if (!drv) {
      showToast(language === 'ar' ? 'يرجى اختيار مندوب' : 'Please select driver', 'error');
      return;
    }

    setIsAssigningDriver(true);
    try {
      await deliveryService.assignDriver({
        assignmentId: selectedDeliveryToAssign.id,
        deliveryType: 'PLATFORM_DELIVERY',
        driverId: drv.id,
        driverName: drv.name,
        driverPhone: drv.phone,
        vehicleInfo: `${drv.vehicleType} (${drv.plateNumber})`,
        actorId: user.id,
        actorRole: user.role,
      });

      if (store) {
        setDeliveries(deliveryService.getAssignmentsByStore(store.id));
      } else {
        setDeliveries(deliveryService.getAssignmentsBySeller(user.id));
      }
      setSelectedDeliveryToAssign(null);
      setSelectedDriverIdToAssign('');
      showToast(
        language === 'ar'
          ? `تم إسناد الشحنة بنجاح إلى المندوب: ${drv.name}`
          : `Driver ${drv.name} assigned to delivery`,
        'success'
      );
    } catch (err: any) {
      showToast(err.message || 'فشل إسناد المندوب', 'error');
    } finally {
      setIsAssigningDriver(false);
    }
  };

  // Fast shipment transition
  const handleMarkShipmentStatus = async (assignmentId: string, targetStatus: 'READY' | 'PICKED_UP') => {
    if (!user) return;
    try {
      await deliveryService.updateStatus({
        assignmentId,
        status: targetStatus,
        actorId: user.id,
        actorRole: user.role,
        notes: `Seller updated status to ${targetStatus}`,
      });
      if (store) {
        setDeliveries(deliveryService.getAssignmentsByStore(store.id));
      } else {
        setDeliveries(deliveryService.getAssignmentsBySeller(user.id));
      }
      showToast(
        language === 'ar'
          ? `تم تحديث حالة الشحنة إلى: ${targetStatus}`
          : `Shipment updated to ${targetStatus}`,
        'success'
      );
    } catch (err: any) {
      showToast(err.message || 'Failed to update shipment status', 'error');
    }
  };

  // Payout request
  const handleRequestPayout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !store || isSubmittingPayout) return;
    if (payoutFormData.amount <= 0 || payoutFormData.amount > availableBalance) {
      showToast(language === 'ar' ? 'المبلغ المطلوب غير صالح أو يتجاوز الرصيد المتاح.' : 'Invalid payout amount', 'error');
      return;
    }

    setIsSubmittingPayout(true);
    try {
      const newPayout = await payoutService.createPayoutRequest({
        sellerId: user.id,
        storeId: store.id,
        amount: Number(payoutFormData.amount),
        paymentMethod: payoutFormData.paymentMethod,
        accountNumber: payoutFormData.accountNumber,
        accountName: payoutFormData.accountName,
      });

      setPayouts([newPayout, ...payouts]);
      setIsPayoutModalOpen(false);
      payoutService.getFinancialSummary(user.id).then(s => setFinancialSummary(s)).catch(() => {});
      showToast(language === 'ar' ? 'تم تقديم طلب السحب بنجاح، وستتم معالجته خلال 24 ساعة.' : 'Payout request submitted', 'success');
    } catch (err: any) {
      showToast(err.message || 'فشل تقديم طلب السحب', 'error');
    } finally {
      setIsSubmittingPayout(false);
    }
  };

  // Filtered products
  const filteredProducts = products.filter(p => {
    const matchesSearch =
      productSearch.trim() === '' ||
      p.title.ar.toLowerCase().includes(productSearch.toLowerCase()) ||
      p.title.en.toLowerCase().includes(productSearch.toLowerCase()) ||
      (p.sku && p.sku.toLowerCase().includes(productSearch.toLowerCase()));

    const matchesStatus =
      productStatusFilter === 'all' ||
      p.status === productStatusFilter ||
      (productStatusFilter === 'published' && p.isPublished && (!p.status || p.status === 'approved'));

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0B1120] pb-24 text-gray-900 dark:text-white">
      {/* Top Seller Header Bar */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-4 sm:px-8 py-4 sticky top-0 z-30 shadow-xs">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shrink-0">
              <img
                src={store.logo || 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=150'}
                alt={store.name}
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-black">{store.name}</h1>
                <span className="text-[10px] bg-blue-50 dark:bg-blue-950 text-[#0E11B7] dark:text-blue-400 font-bold px-2 py-0.5 rounded-full uppercase">
                  {store.sellerType}
                </span>
                {store.isVerified && (
                  <span className="inline-flex items-center gap-1 text-[10px] bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-full font-bold">
                    <ShieldCheck className="w-3 h-3" />
                    <span>موثق</span>
                  </span>
                )}
              </div>
              <div className="text-xs text-gray-500 flex items-center gap-2 mt-0.5">
                <span>عمولة المنصة: {store.commissionRate || 10}%</span>
                <span>•</span>
                <span>الرصيد القابل للسحب: <strong className="text-emerald-600 dark:text-emerald-400">${availableBalance.toFixed(2)}</strong></span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() =>
                onNavigate(
                  store.sellerType === 'restaurant'
                    ? `/restaurant/${store.slug}`
                    : store.sellerType === 'service'
                    ? `/service/${store.slug}`
                    : `/store/${store.slug}`
                )
              }
              className="text-xs font-semibold text-gray-700 dark:text-gray-300 hover:text-[#0E11B7] flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 transition"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>معاينة واجهة المتجر</span>
            </button>
            <button
              onClick={handleOpenCreateProduct}
              className="bg-[#0E11B7] hover:bg-[#0c0ea3] text-white px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 shadow transition"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة منتج / وجبة جديدة</span>
            </button>
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="max-w-7xl mx-auto px-4 sm:px-8 mt-6">
        <div className="flex items-center gap-2 border-b border-gray-200 dark:border-gray-800 pb-2 overflow-x-auto scrollbar-none">
          {[
            { id: 'overview', label: language === 'ar' ? 'نظرة عامة' : 'Overview', icon: LayoutDashboard },
            { id: 'products', label: `${language === 'ar' ? 'المنتجات والخدمات' : 'Catalog'} (${products.length})`, icon: Package },
            { id: 'orders', label: `${language === 'ar' ? 'الطلبات الواردة' : 'Orders'} (${orders.length})`, icon: ShoppingBag },
            { id: 'deliveries', label: `${language === 'ar' ? 'الشحنات والتوصيل' : 'Deliveries'} (${deliveries.length})`, icon: Truck },
            { id: 'disputes', label: `${language === 'ar' ? 'النزاعات والشكاوى' : 'Disputes'} (${sellerDisputes.length})`, icon: ShieldAlert },
            { id: 'bookings', label: `${language === 'ar' ? 'الحجوزات' : 'Bookings'} (${bookings.length})`, icon: Calendar },
            { id: 'reviews', label: `${language === 'ar' ? 'التقييمات' : 'Reviews'} (${reviews.length})`, icon: Star },
            { id: 'payouts', label: `${language === 'ar' ? 'المالية والسحوبات' : 'Payouts'} (${payouts.length})`, icon: DollarSign },
            { id: 'monetization', label: language === 'ar' ? 'الخطط والترويج' : 'Plans & Promotions', icon: Zap },
            { id: 'settings', label: language === 'ar' ? 'إعدادات المتجر' : 'Settings', icon: Settings },
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition whitespace-nowrap ${
                  isActive
                    ? 'bg-[#0E11B7] text-white shadow'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Contents */}
      <div className="max-w-7xl mx-auto px-4 sm:px-8 mt-6">
        {/* Tab 1: Overview */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Low stock alert banner */}
            {lowStockProducts.length > 0 && (
              <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-2xl p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0">
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-xs text-amber-900 dark:text-amber-200">
                      تنبيه: مخزون منخفض لـ {lowStockProducts.length} أصناف!
                    </h4>
                    <p className="text-[11px] text-amber-700 dark:text-amber-300">
                      يرجى تحديث المخزون لتفادي نفاد المنتجات وإلغاء طلبات العملاء.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setActiveTab('products')}
                  className="bg-amber-600 hover:bg-amber-700 text-white px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 transition"
                >
                  إدارة المخزون
                </button>
              </div>
            )}

            {/* Stat Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5 shadow-xs">
                <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
                  <span>صافي الأرباح المكتسبة</span>
                  <DollarSign className="w-4 h-4 text-emerald-500" />
                </div>
                <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                  ${totalRevenue.toFixed(2)}
                </div>
                <span className="text-[11px] text-gray-400 mt-1 block">
                  بعد خصم عمولة المنصة ({store.commissionRate || 10}%)
                </span>
              </div>

              <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5 shadow-xs">
                <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
                  <span>الرصيد المتاح للسحب</span>
                  <CreditCard className="w-4 h-4 text-[#0E11B7]" />
                </div>
                <div className="text-2xl font-black text-gray-900 dark:text-white">
                  ${availableBalance.toFixed(2)}
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-[10px] text-gray-400">تم سحب: ${totalWithdrawn.toFixed(2)}</span>
                  <button
                    onClick={() => {
                      setPayoutFormData({
                        ...payoutFormData,
                        amount: Math.min(50, availableBalance),
                      });
                      setIsPayoutModalOpen(true);
                    }}
                    disabled={availableBalance <= 0}
                    className="text-[11px] bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-2.5 py-1 rounded-lg font-bold"
                  >
                    طلب سحب
                  </button>
                </div>
              </div>

              <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5 shadow-xs">
                <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
                  <span>المنتجات والوجبات المعروضة</span>
                  <Package className="w-4 h-4 text-purple-500" />
                </div>
                <div className="text-2xl font-black text-gray-900 dark:text-white">
                  {activeProductsCount} / {products.length}
                </div>
                <span className="text-[11px] text-gray-400 mt-1 block">
                  أصناف منشورة في الواجهة
                </span>
              </div>

              <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5 shadow-xs">
                <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
                  <span>تقييم العملاء</span>
                  <Star className="w-4 h-4 text-amber-500" />
                </div>
                <div className="text-2xl font-black text-amber-500 flex items-center gap-1">
                  <span>{store.rating || 5.0}</span>
                  <span className="text-sm">★</span>
                </div>
                <span className="text-[11px] text-gray-400 mt-1 block">
                  إجمالي {reviews.length} تقييم وتعليق
                </span>
              </div>
            </div>

            {/* Recent Orders Overview */}
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 shadow-xs">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-bold text-sm">أحدث الطلبات الواردة</h3>
                  <p className="text-xs text-gray-500">متابعة شحنات العملاء ومعالجتها في الوقت الفعلي</p>
                </div>
                <button
                  onClick={() => setActiveTab('orders')}
                  className="text-xs font-semibold text-[#0E11B7] dark:text-blue-400 hover:underline flex items-center gap-1"
                >
                  <span>عرض الكل ({orders.length})</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {orders.length === 0 ? (
                <div className="text-center py-10 text-gray-400 text-xs">
                  لا توجد طلبات واردة حتى الآن. ستظهر الطلبات هنا بمجرد إتمام العميل للشراء.
                </div>
              ) : (
                <div className="divide-y divide-gray-100 dark:divide-gray-800">
                  {orders.slice(0, 4).map(({ order, vendorSubOrder }) => (
                    <div key={vendorSubOrder.subOrderId} className="py-3 flex items-center justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs">#{vendorSubOrder.subOrderId}</span>
                          <span className="text-[11px] text-gray-500">
                            ({order.customerName} - {order.city})
                          </span>
                        </div>
                        <div className="text-[11px] text-gray-400 mt-0.5">
                          {vendorSubOrder.items.length} أصناف • مستحقاتك: ${vendorSubOrder.sellerRevenue.toFixed(2)}
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <span
                          className={`text-[10px] font-bold px-2.5 py-1 rounded-full uppercase ${
                            vendorSubOrder.status === 'delivered'
                              ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                              : vendorSubOrder.status === 'cancelled'
                              ? 'bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300'
                              : 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300'
                          }`}
                        >
                          {vendorSubOrder.status}
                        </span>

                        <button
                          onClick={() => handleOpenFulfillment(order.orderId, vendorSubOrder)}
                          className="text-xs bg-[#0E11B7] hover:bg-[#0c0ea3] text-white px-3 py-1 rounded-lg font-bold"
                        >
                          تحديث الشحنة
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Products */}
        {activeTab === 'products' && (
          <div className="space-y-4">
            {/* Header & Filter Controls */}
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 shadow-xs">
              <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
                <div className="relative flex-1 max-w-xs">
                  <Search className="w-4 h-4 absolute right-3 top-3 text-gray-400" />
                  <input
                    type="text"
                    placeholder="بحث بالاسم أو كود SKU..."
                    value={productSearch}
                    onChange={e => setProductSearch(e.target.value)}
                    className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl pr-9 pl-3 py-2 text-xs"
                  />
                </div>

                <div className="flex items-center gap-1.5">
                  <Filter className="w-3.5 h-3.5 text-gray-400" />
                  <select
                    value={productStatusFilter}
                    onChange={e => setProductStatusFilter(e.target.value)}
                    className="bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2 text-xs"
                  >
                    <option value="all">جميع الحالات ({products.length})</option>
                    <option value="published">منشور (Published)</option>
                    <option value="draft">مسودة (Draft)</option>
                    <option value="pending_review">قيد المراجعة</option>
                    <option value="hidden">مخفي (Hidden)</option>
                  </select>
                </div>
              </div>

              <button
                onClick={handleOpenCreateProduct}
                className="bg-[#0E11B7] hover:bg-[#0c0ea3] text-white px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 shadow"
              >
                <Plus className="w-4 h-4" />
                <span>إضافة صنف جديد</span>
              </button>
            </div>

            {/* Products Table */}
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden shadow-xs">
              {filteredProducts.length === 0 ? (
                <div className="text-center py-12 text-gray-400 text-xs">
                  لا توجد منتجات مطابقة لخيارات البحث أو الفلترة.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-gray-50 dark:bg-gray-800/60 text-gray-500 font-semibold border-b border-gray-100 dark:border-gray-800">
                      <tr>
                        <th className="py-3.5 px-4">المنتج / الوجبة</th>
                        <th className="py-3.5 px-4">كود SKU</th>
                        <th className="py-3.5 px-4">السعر</th>
                        <th className="py-3.5 px-4">المخزون المتوفر</th>
                        <th className="py-3.5 px-4">الحالة</th>
                        <th className="py-3.5 px-4 text-center">الإجراءات</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {filteredProducts.map(prod => {
                        const isLowStock = (prod.stock || 0) <= (prod.lowStockThreshold ?? 5);
                        return (
                          <tr key={prod.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/40 transition">
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-3">
                                <img
                                  src={prod.thumbnail || prod.images[0]}
                                  alt={prod.title.ar}
                                  className="w-10 h-10 rounded-lg object-cover bg-gray-100 dark:bg-gray-800 shrink-0"
                                  referrerPolicy="no-referrer"
                                />
                                <div>
                                  <div className="font-bold">{prod.title.ar}</div>
                                  <div className="text-[11px] text-gray-400">{prod.title.en}</div>
                                </div>
                              </div>
                            </td>

                            <td className="py-3 px-4 font-mono text-[11px] text-gray-500">
                              {prod.sku || '—'}
                            </td>

                            <td className="py-3 px-4 font-bold text-emerald-600 dark:text-emerald-400">
                              ${prod.price.toFixed(2)}
                            </td>

                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2">
                                <span className={`font-bold ${isLowStock ? 'text-amber-600 dark:text-amber-400' : ''}`}>
                                  {prod.stock || 0}
                                </span>
                                {isLowStock && (
                                  <span className="text-[9px] bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 rounded font-bold">
                                    منخفض
                                  </span>
                                )}
                                <div className="flex items-center gap-1 mr-2">
                                  <button
                                    onClick={() => handleQuickStockAdjust(prod, 1)}
                                    title="زيادة المخزون +1"
                                    className="w-5 h-5 rounded bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 font-bold flex items-center justify-center text-xs"
                                  >
                                    +
                                  </button>
                                  <button
                                    onClick={() => handleQuickStockAdjust(prod, -1)}
                                    title="خصم من المخزون -1"
                                    className="w-5 h-5 rounded bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 font-bold flex items-center justify-center text-xs"
                                  >
                                    -
                                  </button>
                                  <button
                                    onClick={async () => {
                                      setHistoryProduct(prod);
                                      try {
                                        const logs = await productService.getProductInventoryHistory(prod.id);
                                        setHistoryProduct(prev => (prev && prev.id === prod.id ? { ...prev, inventoryHistory: logs } : prev));
                                      } catch {}
                                    }}
                                    title="عرض سجل حركات المخزون"
                                    className="text-gray-400 hover:text-blue-600 p-1"
                                  >
                                    <History className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            </td>

                            <td className="py-3 px-4">
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                  prod.status === 'published'
                                    ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                                    : prod.status === 'draft'
                                    ? 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                                    : prod.status === 'pending_review'
                                    ? 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300'
                                    : 'bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300'
                                }`}
                              >
                                {prod.status || 'published'}
                              </span>
                            </td>

                            <td className="py-3 px-4 text-center">
                              <div className="flex items-center justify-center gap-2">
                                <button
                                  onClick={() => handleTogglePublish(prod)}
                                  title={prod.status === 'published' ? 'إخفاء المنتج' : 'نشر المنتج'}
                                  className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 p-1"
                                >
                                  {prod.status === 'published' ? (
                                    <Eye className="w-4 h-4 text-emerald-600" />
                                  ) : (
                                    <EyeOff className="w-4 h-4 text-gray-400" />
                                  )}
                                </button>
                                <button
                                  onClick={() => handleOpenEditProduct(prod)}
                                  title="تعديل المنتج"
                                  className="text-gray-400 hover:text-blue-600 p-1"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleDeleteProduct(prod.id)}
                                  title="حذف المنتج"
                                  className="text-gray-400 hover:text-red-600 p-1"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 3: Orders */}
        {activeTab === 'orders' && (
          <div className="space-y-4">
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-4 flex items-center justify-between shadow-xs">
              <div>
                <h3 className="font-bold text-sm">إدارة الطلبات والشحنات</h3>
                <p className="text-xs text-gray-500">معالجة كل شحنة تابعة لمتجرك وإصدار أكواد التتبع</p>
              </div>
              <span className="text-xs font-bold text-gray-500">
                إجمالي الطلبات: {orders.length}
              </span>
            </div>

            {orders.length === 0 ? (
              <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-12 text-center text-gray-400 text-xs">
                لا توجد طلبات موجهة إلى متجرك حتى الآن.
              </div>
            ) : (
              <div className="space-y-4">
                {orders.map(({ order, vendorSubOrder }) => (
                  <div
                    key={vendorSubOrder.subOrderId}
                    className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 shadow-xs"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-gray-100 dark:border-gray-800">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm">شحنة #{vendorSubOrder.subOrderId}</span>
                          <span className="text-xs text-gray-400">(طلب #{order.orderId})</span>
                          <span
                            className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase ${
                              vendorSubOrder.status === 'delivered'
                                ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                                : vendorSubOrder.status === 'cancelled'
                                ? 'bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300'
                                : 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300'
                            }`}
                          >
                            {vendorSubOrder.status}
                          </span>
                        </div>
                        <span className="text-[11px] text-gray-400 block mt-1">
                          تاريخ الطلب: {new Date(order.createdAt).toLocaleString('ar-SA')}
                        </span>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="text-left">
                          <span className="text-[11px] text-gray-400 block">صافي مستحقاتك:</span>
                          <span className="text-base font-black text-emerald-600 dark:text-emerald-400">
                            ${vendorSubOrder.sellerRevenue.toFixed(2)}
                          </span>
                        </div>
                        <button
                          onClick={() => handleOpenFulfillment(order.orderId, vendorSubOrder)}
                          className="bg-[#0E11B7] hover:bg-[#0c0ea3] text-white px-4 py-2 rounded-xl text-xs font-bold shadow flex items-center gap-1.5"
                        >
                          <Truck className="w-3.5 h-3.5" />
                          <span>تحديث حالة الشحنة والتتبع</span>
                        </button>
                      </div>
                    </div>

                    {/* Customer & Address Details */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 py-4 text-xs border-b border-gray-100 dark:border-gray-800">
                      <div>
                        <span className="text-gray-400 block mb-1 font-semibold">بيانات العميل:</span>
                        <div className="font-bold">{order.customerName}</div>
                        <div className="text-gray-500 font-mono mt-0.5">{order.phone}</div>
                      </div>

                      <div>
                        <span className="text-gray-400 block mb-1 font-semibold">عنوان التوصيل:</span>
                        <div className="font-bold">{order.city}</div>
                        <div className="text-gray-500 mt-0.5">{order.address}</div>
                      </div>

                      <div>
                        <span className="text-gray-400 block mb-1 font-semibold">طريقة الدفع & التتبع:</span>
                        <div className="font-bold uppercase">{order.paymentMethod.replace(/_/g, ' ')}</div>
                        <div className="text-gray-500 mt-0.5">
                          رقم التتبع: <strong className="font-mono text-gray-800 dark:text-gray-200">{vendorSubOrder.trackingNumber || 'لم يحدد بعد'}</strong>
                        </div>
                      </div>
                    </div>

                    {/* Items List */}
                    <div className="pt-4">
                      <h4 className="font-bold text-xs mb-2">الأصناف المطلوبة من متجرك:</h4>
                      <div className="divide-y divide-gray-100 dark:divide-gray-800/60">
                        {vendorSubOrder.items.map((item, idx) => {
                          const itemThumbnail = item.product?.thumbnail || (item.product?.images && item.product.images[0]) || (item as any).thumbnail || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=200';
                          const itemTitle = item.product?.title?.ar || (typeof item.product?.title === 'string' ? item.product.title : (item as any).title?.ar || (item as any).title?.en || 'Product');
                          const itemPrice = Number(item.product?.price ?? (item as any).price ?? 0);
                          return (
                            <div key={idx} className="py-2 flex items-center justify-between text-xs">
                              <div className="flex items-center gap-3">
                                <img
                                  src={itemThumbnail}
                                  alt={itemTitle}
                                  className="w-8 h-8 rounded object-cover bg-gray-100 dark:bg-gray-800"
                                  referrerPolicy="no-referrer"
                                />
                                <div>
                                  <span className="font-semibold">{itemTitle}</span>
                                  <span className="text-gray-400 text-[11px] block">
                                    ${itemPrice.toFixed(2)} × {item.quantity}
                                  </span>
                                </div>
                              </div>
                              <span className="font-bold text-emerald-600 dark:text-emerald-400">
                                ${(itemPrice * item.quantity).toFixed(2)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Status History Timeline */}
                    {vendorSubOrder.statusHistory && vendorSubOrder.statusHistory.length > 0 && (
                      <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-800">
                        <span className="text-[11px] font-bold text-gray-400 block mb-2">سجل حركات الطلب:</span>
                        <div className="space-y-1.5">
                          {vendorSubOrder.statusHistory.map((hist, hIdx) => (
                            <div key={hIdx} className="text-[11px] flex items-center gap-2 text-gray-500">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                              <span className="font-bold text-gray-700 dark:text-gray-300 uppercase">{hist.status}</span>
                              <span>—</span>
                              <span>{hist.note}</span>
                              <span className="text-[10px] text-gray-400 mr-auto">
                                {new Date(hist.timestamp).toLocaleTimeString('ar-SA')}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab: Deliveries & Fleet */}
        {activeTab === 'deliveries' && (
          <div className="space-y-4">
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 shadow-xs">
              <div>
                <h3 className="font-bold text-sm">
                  {language === 'ar' ? 'الشحنات وعمليات التوصيل والأسطول' : 'Deliveries & Logistics'}
                </h3>
                <p className="text-xs text-gray-500">
                  {language === 'ar'
                    ? 'إسناد مناديب التوصيل، متابعة خط السير، وتحديث جاهزية الطرود'
                    : 'Assign delivery couriers, track dispatch stages, and manage handover.'}
                </p>
              </div>
              <span className="text-xs font-bold text-gray-500">
                {language === 'ar' ? 'إجمالي الشحنات:' : 'Total Deliveries:'} {deliveries.length}
              </span>
            </div>

            {deliveries.length === 0 ? (
              <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-12 text-center text-gray-400 text-xs">
                <Truck className="w-12 h-12 mx-auto mb-2 opacity-30 text-cyan-600" />
                <p>{language === 'ar' ? 'لا توجد شحنات مسجلة لمتجرك حتى الآن.' : 'No delivery shipments found.'}</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {deliveries.map(deliv => {
                  const isAssigned = !!deliv.assignedDriver || !!deliv.driverName;
                  const isReady = deliv.status === 'READY';
                  const isPreparing = deliv.status === 'PREPARING';

                  return (
                    <div
                      key={deliv.id}
                      className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5 shadow-xs text-xs space-y-3 flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-center justify-between pb-2 border-b border-gray-100 dark:border-gray-800">
                          <span className="font-mono font-bold text-[#0E11B7] dark:text-cyan-400">
                            #{deliv.subOrderId || deliv.orderId}
                          </span>
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                              deliv.status === 'DELIVERED'
                                ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                                : deliv.status === 'CANCELLED'
                                ? 'bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300'
                                : 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300'
                            }`}
                          >
                            {deliv.status}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2 mt-3 text-gray-600 dark:text-gray-300">
                          <div>
                            <span className="text-gray-400 block text-[10px] uppercase">
                              {language === 'ar' ? 'العميل المستلم:' : 'Customer:'}
                            </span>
                            <span className="font-bold text-gray-900 dark:text-white block truncate">
                              {deliv.customerName}
                            </span>
                            <span className="text-[11px] text-gray-500">{deliv.customerPhone}</span>
                          </div>

                          <div>
                            <span className="text-gray-400 block text-[10px] uppercase">
                              {language === 'ar' ? 'عنوان التسليم:' : 'Destination:'}
                            </span>
                            <span className="font-bold text-gray-900 dark:text-white block truncate">
                              {deliv.city}
                            </span>
                            <span className="text-[11px] text-gray-500 truncate block">{deliv.address}</span>
                          </div>
                        </div>

                        {/* Driver info */}
                        <div className="mt-3 p-2.5 rounded-xl bg-gray-50 dark:bg-gray-800/60 flex items-center justify-between">
                          <div>
                            <span className="text-[10px] text-gray-400 block font-semibold">
                              {language === 'ar' ? 'مندوب التوصيل:' : 'Assigned Courier:'}
                            </span>
                            <span className="font-bold text-gray-800 dark:text-gray-200">
                              {deliv.driverName || (language === 'ar' ? 'لم يتم الإسناد بعد' : 'Unassigned')}
                            </span>
                          </div>
                          {deliv.driverPhone && (
                            <a
                              href={`tel:${deliv.driverPhone}`}
                              className="text-[11px] font-bold text-emerald-600 hover:underline flex items-center gap-1"
                            >
                              <Phone className="w-3 h-3" />
                              <span>{deliv.driverPhone}</span>
                            </a>
                          )}
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="pt-2 flex flex-wrap items-center gap-2 border-t border-gray-100 dark:border-gray-800">
                        {!isAssigned && deliv.status !== 'DELIVERED' && deliv.status !== 'CANCELLED' && (
                          <button
                            onClick={() => {
                              setSelectedDeliveryToAssign(deliv);
                              setSelectedDriverIdToAssign(availableDrivers[0]?.id || '');
                            }}
                            className="flex-1 bg-cyan-600 hover:bg-cyan-700 text-white py-2 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 shadow"
                          >
                            <Truck className="w-3.5 h-3.5" />
                            <span>{language === 'ar' ? 'إسناد مندوب' : 'Assign Courier'}</span>
                          </button>
                        )}

                        {isPreparing && (
                          <button
                            onClick={() => handleMarkShipmentStatus(deliv.id, 'READY')}
                            className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-2 rounded-xl font-bold text-xs"
                          >
                            {language === 'ar' ? 'جاهز للتسليم للمندوب' : 'Mark Ready'}
                          </button>
                        )}

                        {isReady && (
                          <button
                            onClick={() => handleMarkShipmentStatus(deliv.id, 'PICKED_UP')}
                            className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-xl font-bold text-xs"
                          >
                            {language === 'ar' ? 'تم تسليم الطرد للمندوب' : 'Mark Handed Over'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Tab: Customer Disputes */}
        {activeTab === 'disputes' && (
          <div className="space-y-4">
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 shadow-xs">
              <div>
                <h3 className="font-bold text-sm">
                  {language === 'ar' ? 'النزاعات والشكاوى على الطلبات' : 'Customer Disputes'}
                </h3>
                <p className="text-xs text-gray-500">
                  {language === 'ar'
                    ? 'مراجعة شكاوى العملاء بخصوص المنتجات أو الشحن وتقديم ردود وتسويات مباشرة'
                    : 'Review claims regarding damaged, missing items, or delays and submit solutions.'}
                </p>
              </div>
              <span className="text-xs font-bold text-gray-500">
                {language === 'ar' ? 'إجمالي الشكاوى:' : 'Total Disputes:'} {sellerDisputes.length}
              </span>
            </div>

            {sellerDisputes.length === 0 ? (
              <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-12 text-center text-gray-400 text-xs">
                <ShieldCheck className="w-12 h-12 mx-auto mb-2 text-emerald-500 opacity-60" />
                <h4 className="font-bold text-sm text-gray-800 dark:text-gray-200 mb-1">
                  {language === 'ar' ? 'سجلك نظيف ومميز!' : 'Clean Record!'}
                </h4>
                <p>{language === 'ar' ? 'لا توجد نزاعات أو شكاوى مفتوحة ضد متجرك حالياً.' : 'No customer disputes on your store.'}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {sellerDisputes.map(disp => {
                  const canRespond = disp.status === 'OPEN' || disp.status === 'SELLER_RESPONDED' || disp.status === 'UNDER_ADMIN_REVIEW';

                  return (
                    <div
                      key={disp.id}
                      className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5 shadow-xs text-xs space-y-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-gray-100 dark:border-gray-800">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-[#0E11B7] dark:text-blue-400">
                            #{disp.orderId}
                          </span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 uppercase">
                            {disp.reason.replace('_', ' ')}
                          </span>
                        </div>

                        <span
                          className={`text-[10px] font-bold px-2.5 py-1 rounded-full uppercase ${
                            disp.status === 'RESOLVED_REFUND'
                              ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                              : disp.status === 'RESOLVED_REJECTED'
                              ? 'bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300'
                              : 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300'
                          }`}
                        >
                          {disp.status}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-gray-600 dark:text-gray-300">
                        <div>
                          <span className="text-gray-400 block text-[10px]">
                            {language === 'ar' ? 'العميل المشتكي:' : 'Complainant:'}
                          </span>
                          <p className="font-bold text-gray-900 dark:text-white">
                            {disp.customerName} ({disp.customerPhone || 'N/A'})
                          </p>
                          <span className="text-gray-400 block text-[10px] mt-2">
                            {language === 'ar' ? 'الإجراء المطلوب من العميل:' : 'Requested Action:'}
                          </span>
                          <p className="font-semibold text-rose-600 uppercase">
                            {disp.requestedAction.replace('_', ' ')}
                          </p>
                        </div>

                        <div>
                          <span className="text-gray-400 block text-[10px]">
                            {language === 'ar' ? 'شرح العميل للمشكلة:' : 'Customer Description:'}
                          </span>
                          <p className="bg-gray-50 dark:bg-gray-800 p-2.5 rounded-xl text-[11px] text-gray-700 dark:text-gray-200 mt-1">
                            {disp.description}
                          </p>
                        </div>
                      </div>

                      {/* Seller response if already provided */}
                      {disp.sellerResponse && (
                        <div className="bg-blue-50/50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/40 p-3 rounded-xl">
                          <span className="text-[10px] font-bold text-blue-700 dark:text-blue-300 block mb-1">
                            {language === 'ar' ? 'رد متجرك السابق والحل المقترح:' : 'Your Response:'}
                          </span>
                          <p className="text-[11px] text-gray-800 dark:text-gray-200">{disp.sellerResponse.message}</p>
                          {disp.sellerResponse.proposedAction && (
                            <span className="inline-block mt-1 text-[10px] font-bold text-cyan-600 uppercase">
                              {language === 'ar' ? 'الحل المقترح:' : 'Proposed Solution:'} {disp.sellerResponse.proposedAction}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Admin resolution if closed */}
                      {disp.adminResolution?.resolutionNotes && (
                        <div className="bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/40 p-3 rounded-xl">
                          <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 block mb-1">
                            {language === 'ar' ? 'قرار الإدارة النهائي:' : 'Admin Final Decision:'}
                          </span>
                          <p className="text-[11px] text-gray-800 dark:text-gray-200">{disp.adminResolution.resolutionNotes}</p>
                        </div>
                      )}

                      {/* Action */}
                      {canRespond && (
                        <div className="pt-2 flex justify-end">
                          <button
                            onClick={() => {
                              setSelectedDisputeToRespond(disp);
                              setDisputeResponseText(disp.sellerResponse?.message || '');
                              setDisputeProposedResolution(
                                disp.sellerResponse?.proposedAction === 'accept_refund'
                                  ? 'refund'
                                  : disp.sellerResponse?.proposedAction === 'send_replacement'
                                  ? 'replacement'
                                  : 'decline'
                              );
                            }}
                            className="bg-[#0E11B7] hover:bg-[#0c0ea3] text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow"
                          >
                            <Reply className="w-3.5 h-3.5" />
                            <span>
                              {disp.sellerResponse
                                ? language === 'ar' ? 'تعديل رد المتجر' : 'Edit Response'
                                : language === 'ar' ? 'الرد على الشكوى وتقديم حل' : 'Respond & Propose Solution'}
                            </span>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Tab 4: Bookings (Services) */}
        {activeTab === 'bookings' && (
          <div className="space-y-4">
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-4 flex items-center justify-between shadow-xs">
              <div>
                <h3 className="font-bold text-sm">إدارة الحجوزات والمواعيد</h3>
                <p className="text-xs text-gray-500">متابعة طلبات الخدمات وحجز المواعيد مع العملاء</p>
              </div>
              <span className="text-xs font-bold text-gray-500">
                إجمالي الحجوزات: {bookings.length}
              </span>
            </div>

            {bookings.length === 0 ? (
              <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-12 text-center text-gray-400 text-xs">
                لا توجد حجوزات مسجلة لخدماتك حالياً.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {bookings.map(book => (
                  <div
                    key={book.id}
                    className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5 shadow-xs text-xs space-y-3"
                  >
                    <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-gray-800">
                      <div>
                        <span className="font-bold text-sm block">{book.serviceTitle}</span>
                        <span className="text-gray-400 text-[11px] block mt-0.5">
                          العميل: {book.customerName} ({book.customerPhone})
                        </span>
                      </div>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                          book.status === 'confirmed'
                            ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                            : book.status === 'cancelled'
                            ? 'bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300'
                            : 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300'
                        }`}
                      >
                        {book.status}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-gray-600 dark:text-gray-300">
                      <div>
                        <span className="text-gray-400 block text-[10px]">تاريخ الموعد:</span>
                        <span className="font-semibold">{book.date}</span>
                      </div>
                      <div>
                        <span className="text-gray-400 block text-[10px]">الوقت المختار:</span>
                        <span className="font-semibold">{book.timeSlot}</span>
                      </div>
                    </div>

                    {book.notes && (
                      <div className="bg-gray-50 dark:bg-gray-800 p-2.5 rounded-xl text-[11px] text-gray-500">
                        <strong>ملاحظات العميل:</strong> {book.notes}
                      </div>
                    )}

                    <div className="pt-2 flex items-center gap-2">
                      <button
                        onClick={() => handleUpdateBookingStatus(book.id, 'confirmed')}
                        className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-2 rounded-xl font-bold text-xs"
                      >
                        تأكيد الموعد
                      </button>
                      <button
                        onClick={() => handleUpdateBookingStatus(book.id, 'completed')}
                        className="flex-1 bg-[#0E11B7] hover:bg-[#0c0ea3] text-white py-2 rounded-xl font-bold text-xs"
                      >
                        إتمام الخدمة
                      </button>
                      <button
                        onClick={() => handleUpdateBookingStatus(book.id, 'cancelled')}
                        className="px-3 py-2 border border-red-200 dark:border-red-900 text-red-600 rounded-xl font-bold text-xs"
                      >
                        إلغاء
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 5: Reviews */}
        {activeTab === 'reviews' && (
          <div className="space-y-4">
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5 shadow-xs flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="font-bold text-sm">تقييمات وآراء العملاء</h3>
                <p className="text-xs text-gray-500">متابعة تجارب المشترين والرد على الاستفسارات والملاحظات</p>
              </div>

              <div className="flex items-center gap-3">
                <div className="text-right">
                  <div className="text-2xl font-black text-amber-500 flex items-center gap-1">
                    <span>{store.rating || 5.0}</span>
                    <span className="text-sm">★</span>
                  </div>
                  <span className="text-[10px] text-gray-400">بناءً على {reviews.length} تقييم</span>
                </div>
              </div>
            </div>

            {reviews.length === 0 ? (
              <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-12 text-center text-gray-400 text-xs">
                لا توجد تقييمات لمتجرك أو منتجاتك حتى الآن.
              </div>
            ) : (
              <div className="space-y-3">
                {reviews.map(rev => (
                  <div
                    key={rev.id}
                    className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5 shadow-xs text-xs space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-blue-50 dark:bg-blue-950 text-[#0E11B7] font-bold flex items-center justify-center">
                          {rev.userName ? rev.userName[0] : 'U'}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold">{rev.userName}</span>
                            {rev.isVerifiedPurchase && (
                              <span className="text-[9px] bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 font-bold px-1.5 py-0.5 rounded">
                                شراء مؤكد
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-gray-400">
                            {new Date(rev.createdAt).toLocaleDateString('ar-SA')}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center text-amber-500 gap-0.5 font-bold">
                        {Array.from({ length: 5 }).map((_, sIdx) => (
                          <span key={sIdx} className={sIdx < rev.rating ? 'opacity-100' : 'opacity-20'}>
                            ★
                          </span>
                        ))}
                      </div>
                    </div>

                    <p className="text-gray-700 dark:text-gray-300 leading-relaxed bg-gray-50/50 dark:bg-gray-800/40 p-3 rounded-xl">
                      {rev.comment}
                    </p>

                    {/* Existing Seller Reply */}
                    {rev.sellerReply ? (
                      <div className="bg-blue-50/60 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900/40 rounded-xl p-3 space-y-1">
                        <div className="flex items-center justify-between text-[11px] font-bold text-[#0E11B7] dark:text-blue-400">
                          <span className="flex items-center gap-1.5">
                            <Reply className="w-3.5 h-3.5" />
                            <span>رد المتجر ({store.name}):</span>
                          </span>
                          <span className="text-[10px] text-gray-400 font-normal">
                            {new Date(rev.sellerReply.repliedAt).toLocaleDateString('ar-SA')}
                          </span>
                        </div>
                        <p className="text-gray-700 dark:text-gray-300 text-xs">
                          {rev.sellerReply.comment}
                        </p>
                      </div>
                    ) : replyingReviewId === rev.id ? (
                      <div className="pt-2 space-y-2">
                        <textarea
                          rows={2}
                          placeholder="اكتب ردك للعميل هنا بكل احترام ولباقة..."
                          value={replyText}
                          onChange={e => setReplyText(e.target.value)}
                          className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl p-2.5 text-xs text-gray-900 dark:text-white"
                        />
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={() => {
                              setReplyingReviewId(null);
                              setReplyText('');
                            }}
                            className="px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded-lg text-xs"
                          >
                            إلغاء
                          </button>
                          <button
                            onClick={() => handleSendReviewReply(rev.id)}
                            className="bg-[#0E11B7] hover:bg-[#0c0ea3] text-white px-4 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 shadow"
                          >
                            <Send className="w-3.5 h-3.5" />
                            <span>إرسال الرد</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="pt-1 flex justify-end">
                        <button
                          onClick={() => {
                            setReplyingReviewId(rev.id);
                            setReplyText('');
                          }}
                          className="text-xs text-[#0E11B7] dark:text-blue-400 hover:underline flex items-center gap-1 font-semibold"
                        >
                          <Reply className="w-3.5 h-3.5" />
                          <span>الرد على التقييم</span>
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 6: Financials & Payouts */}
        {activeTab === 'payouts' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5 shadow-xs">
                <span className="text-xs text-gray-500 block mb-1 font-semibold">إجمالي المبيعات الصافية:</span>
                <span className="text-2xl font-black text-gray-900 dark:text-white">${totalRevenue.toFixed(2)}</span>
                <span className="text-[11px] text-gray-400 block mt-1">بعد استقطاع عمولة المنصة</span>
              </div>

              <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5 shadow-xs">
                <span className="text-xs text-gray-500 block mb-1 font-semibold">إجمالي المسحوبات المنفذة:</span>
                <span className="text-2xl font-black text-blue-600 dark:text-blue-400">${totalWithdrawn.toFixed(2)}</span>
                <span className="text-[11px] text-gray-400 block mt-1">عبر خدمات الدفع المعتمدة</span>
              </div>

              <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
                <div>
                  <span className="text-xs text-gray-500 block mb-1 font-semibold">الرصيد المتاح للسحب الآن:</span>
                  <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">${availableBalance.toFixed(2)}</span>
                </div>
                <button
                  onClick={() => setIsPayoutModalOpen(true)}
                  disabled={availableBalance <= 0}
                  className="mt-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white py-2 rounded-xl text-xs font-bold shadow transition"
                >
                  طلب سحب جديد
                </button>
              </div>
            </div>

            {/* Payout requests list */}
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 shadow-xs">
              <h3 className="font-bold text-sm mb-4">سجل طلبات السحب والتحويلات المالية</h3>
              {payouts.length === 0 ? (
                <div className="text-center py-10 text-gray-400 text-xs">
                  لم تقم بتقديم أي طلبات سحب حتى الآن.
                </div>
              ) : (
                <div className="divide-y divide-gray-100 dark:divide-gray-800">
                  {payouts.map(p => (
                    <div key={p.id} className="py-3 flex items-center justify-between text-xs gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold">${p.amount.toFixed(2)}</span>
                          <span className="text-[10px] bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded font-mono uppercase">
                            {p.paymentMethod}
                          </span>
                          <span
                            className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase ${
                              p.status === 'processed'
                                ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                                : p.status === 'rejected'
                                ? 'bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300'
                                : 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300'
                            }`}
                          >
                            {p.status}
                          </span>
                        </div>
                        <div className="text-[11px] text-gray-400 mt-0.5">
                          رقم الحساب: {p.accountNumber} ({p.accountName}) • {new Date(p.requestedAt).toLocaleDateString('ar-SA')}
                        </div>
                        {p.notes && <div className="text-[10px] text-gray-500 mt-0.5">{p.notes}</div>}
                      </div>

                      <span className="text-[11px] text-gray-400 font-mono">#{p.id}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 7: Settings */}
        {activeTab === 'settings' && (
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 shadow-xs max-w-3xl space-y-6 text-xs">
            <div>
              <h3 className="text-base font-bold">إعدادات وهوية المتجر</h3>
              <p className="text-gray-500 mt-0.5">تحديث معلومات التواصل، رسوم التوصيل، وشعارات المتجر المعروضة للعملاء</p>
            </div>

            {/* Branding Images Upload */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div>
                <ImageUploadWidget
                  label="شعار المتجر (Logo)"
                  value={store.logo}
                  sellerId={user!.id}
                  folder="branding"
                  onChange={url => setStore({ ...store, logo: url })}
                  aspectRatio="square"
                />
              </div>
              <div>
                <ImageUploadWidget
                  label="غلاف المتجر الرئيسي (Cover Banner)"
                  value={store.cover}
                  sellerId={user!.id}
                  folder="branding"
                  onChange={url => setStore({ ...store, cover: url })}
                  aspectRatio="banner"
                />
              </div>
            </div>

            <div className="space-y-4 pt-4 border-t border-gray-100 dark:border-gray-800">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-gray-500 mb-1 font-semibold">اسم المتجر بالعربية *</label>
                  <input
                    type="text"
                    value={store.name}
                    onChange={e => setStore({ ...store, name: e.target.value })}
                    className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl p-2.5 text-xs text-gray-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-gray-500 mb-1 font-semibold">البريد الإلكتروني:</label>
                  <input
                    type="email"
                    value={store.email || ''}
                    onChange={e => setStore({ ...store, email: e.target.value })}
                    className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl p-2.5 text-xs text-gray-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-gray-500 mb-1 font-semibold">نبذة ووصف المتجر:</label>
                <textarea
                  rows={3}
                  value={typeof store.description === 'string' ? store.description : (store.description?.ar || store.description?.en || '')}
                  onChange={e => {
                    const val = e.target.value;
                    const newDesc = typeof store.description === 'object' && store.description !== null
                      ? { ...store.description, ar: val, en: store.description.en || val }
                      : { ar: val, en: val, so: val };
                    setStore({ ...store, description: newDesc });
                  }}
                  className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl p-2.5 text-xs text-gray-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-gray-500 mb-1 font-semibold">رقم الهاتف:</label>
                  <input
                    type="text"
                    value={store.phone}
                    onChange={e => setStore({ ...store, phone: e.target.value })}
                    className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl p-2.5 text-xs text-gray-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-gray-500 mb-1 font-semibold">رقم الواتساب:</label>
                  <input
                    type="text"
                    value={store.whatsapp}
                    onChange={e => setStore({ ...store, whatsapp: e.target.value })}
                    className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl p-2.5 text-xs text-gray-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-gray-500 mb-1 font-semibold">المدينة:</label>
                  <input
                    type="text"
                    value={store.city}
                    onChange={e => setStore({ ...store, city: e.target.value })}
                    className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl p-2.5 text-xs text-gray-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-gray-500 mb-1 font-semibold">رسوم التوصيل ($):</label>
                  <input
                    type="number"
                    step="0.5"
                    value={store.deliveryFee}
                    onChange={e => setStore({ ...store, deliveryFee: Number(e.target.value) })}
                    className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl p-2.5 text-xs text-gray-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-gray-500 mb-1 font-semibold">الحد الأدنى للطلب ($):</label>
                  <input
                    type="number"
                    value={store.minOrder}
                    onChange={e => setStore({ ...store, minOrder: Number(e.target.value) })}
                    className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl p-2.5 text-xs text-gray-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => {
                    storeService.updateStore(store.id, store, user!.id, user!.role);
                    alert('تم حفظ إعدادات المتجر بنجاح!');
                  }}
                  className="bg-[#0E11B7] hover:bg-[#0c0ea3] text-white px-6 py-2.5 rounded-xl font-bold text-xs shadow transition"
                >
                  حفظ التغييرات
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Monetization, Plans & Promotions Tab */}
        {activeTab === 'monetization' && (
          <SellerMonetizationTab
            store={store}
            sellerId={user?.id || 'user_seller_01'}
            products={products}
            onNavigateTab={(tab) => setActiveTab(tab as any)}
          />
        )}
      </div>

      {/* Product Add / Edit Modal */}
      {isProductModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-gray-900 rounded-2xl max-w-xl w-full border border-gray-200 dark:border-gray-800 p-6 shadow-2xl overflow-y-auto max-h-[90vh]">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100 dark:border-gray-800">
              <h3 className="font-bold text-base text-gray-900 dark:text-white">
                {editingProduct ? 'تعديل الصنف أو المنتج' : 'إضافة صنف / منتج جديد'}
              </h3>
              <button
                onClick={() => setIsProductModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="space-y-4 mt-4 text-xs">
              {/* Image Upload Widget */}
              <ImageUploadWidget
                label="صورة المنتج الرئيسية *"
                value={productFormData.imageUrl}
                sellerId={user!.id}
                folder="products"
                onChange={url => setProductFormData({ ...productFormData, imageUrl: url })}
                aspectRatio="square"
              />

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1">الاسم بالعربية *</label>
                  <input
                    type="text"
                    required
                    value={productFormData.titleAr}
                    onChange={e => setProductFormData({ ...productFormData, titleAr: e.target.value })}
                    className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl p-2.5 text-xs text-gray-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">الاسم بالإنجليزية *</label>
                  <input
                    type="text"
                    required
                    value={productFormData.titleEn}
                    onChange={e => setProductFormData({ ...productFormData, titleEn: e.target.value })}
                    className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl p-2.5 text-xs text-gray-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold mb-1">الوصف بالعربية *</label>
                <textarea
                  rows={2}
                  required
                  value={productFormData.descAr}
                  onChange={e => setProductFormData({ ...productFormData, descAr: e.target.value })}
                  className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl p-2.5 text-xs text-gray-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold mb-1">السعر ($) *</label>
                  <input
                    type="number"
                    step="0.1"
                    required
                    value={productFormData.price}
                    onChange={e => setProductFormData({ ...productFormData, price: Number(e.target.value) })}
                    className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl p-2.5 text-xs text-gray-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">السعر السابق ($)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={productFormData.oldPrice}
                    onChange={e => setProductFormData({ ...productFormData, oldPrice: Number(e.target.value) })}
                    className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl p-2.5 text-xs text-gray-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">كود SKU</label>
                  <input
                    type="text"
                    value={productFormData.sku}
                    onChange={e => setProductFormData({ ...productFormData, sku: e.target.value })}
                    className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl p-2.5 text-xs font-mono text-gray-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1">المخزون المتوفر</label>
                  <input
                    type="number"
                    value={productFormData.stock}
                    onChange={e => setProductFormData({ ...productFormData, stock: Number(e.target.value) })}
                    className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl p-2.5 text-xs text-gray-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">حد المخزون المنخفض للتنبيه</label>
                  <input
                    type="number"
                    value={productFormData.lowStockThreshold}
                    onChange={e => setProductFormData({ ...productFormData, lowStockThreshold: Number(e.target.value) })}
                    className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl p-2.5 text-xs text-gray-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1">حالة المنتج دورة الحياة</label>
                  <select
                    value={productFormData.status}
                    onChange={e => setProductFormData({ ...productFormData, status: e.target.value as any })}
                    className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl p-2.5 text-xs text-gray-900 dark:text-white"
                  >
                    <option value="published">منشور (Published)</option>
                    <option value="draft">مسودة (Draft)</option>
                    <option value="pending_review">قيد المراجعة (Pending)</option>
                    <option value="hidden">مخفي (Hidden)</option>
                  </select>
                </div>

                {store.sellerType === 'restaurant' && (
                  <div>
                    <label className="block font-semibold mb-1">وقت التحضير (بالدقائق)</label>
                    <input
                      type="number"
                      value={productFormData.prepTimeMinutes}
                      onChange={e => setProductFormData({ ...productFormData, prepTimeMinutes: Number(e.target.value) })}
                      className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl p-2.5 text-xs text-gray-900 dark:text-white"
                    />
                  </div>
                )}
              </div>

              <div className="flex gap-2 pt-3 border-t border-gray-100 dark:border-gray-800">
                <button
                  type="button"
                  onClick={() => setIsProductModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 font-bold"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-[#0E11B7] hover:bg-[#0c0ea3] text-white py-2.5 rounded-xl font-bold shadow"
                >
                  حفظ وتأكيد
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Inventory History Modal */}
      {historyProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-gray-900 rounded-2xl max-w-lg w-full border border-gray-200 dark:border-gray-800 p-6 shadow-2xl overflow-hidden text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-gray-800">
              <div>
                <h3 className="font-bold text-sm">سجل حركات المخزون</h3>
                <span className="text-gray-400 text-[11px] block mt-0.5">{historyProduct.title.ar}</span>
              </div>
              <button onClick={() => setHistoryProduct(null)} className="text-gray-400 hover:text-gray-600">
                ✕
              </button>
            </div>

            <div className="py-4 space-y-2 max-h-72 overflow-y-auto">
              {(!historyProduct.inventoryHistory || historyProduct.inventoryHistory.length === 0) ? (
                <div className="text-center py-8 text-gray-400">
                  لا توجد حركات مخزون سابقة مسجلة لهذا الصنف بعد.
                </div>
              ) : (
                historyProduct.inventoryHistory.map(log => (
                  <div key={log.id} className="p-2.5 bg-gray-50 dark:bg-gray-800/60 rounded-xl flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`font-bold ${log.change >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                          {log.change >= 0 ? `+${log.change}` : log.change}
                        </span>
                        <span className="text-gray-500">
                          (من {log.previousStock} إلى {log.newStock})
                        </span>
                      </div>
                      <span className="text-[10px] text-gray-400">
                        السبب: {log.reason} • {new Date(log.date).toLocaleString('ar-SA')}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono text-gray-400">{log.actor}</span>
                  </div>
                ))
              )}
            </div>

            <button
              onClick={() => setHistoryProduct(null)}
              className="w-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 py-2 rounded-xl font-bold mt-2"
            >
              إغلاق النافذة
            </button>
          </div>
        </div>
      )}

      {/* Order Fulfillment Modal */}
      {selectedFulfillment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-gray-900 rounded-2xl max-w-md w-full border border-gray-200 dark:border-gray-800 p-6 shadow-2xl text-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-gray-800">
              <h3 className="font-bold text-sm">تحديث حالة الشحنة والتوصيل</h3>
              <button onClick={() => setSelectedFulfillment(null)} className="text-gray-400">
                ✕
              </button>
            </div>

            <div>
              <label className="block font-semibold mb-1">الحالة الجديدة للشحنة *</label>
              <select
                value={newFulfillmentStatus}
                onChange={e => setNewFulfillmentStatus(e.target.value as any)}
                className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl p-2.5 text-xs text-gray-900 dark:text-white"
              >
                <option value="pending">قيد الانتظار (Pending)</option>
                <option value="processing">جاري التجهيز / التحضير (Processing)</option>
                <option value="shipped">خرجت للشحن / في الطريق (Shipped)</option>
                <option value="delivered">تم التسليم للعميل (Delivered)</option>
                <option value="cancelled">إلغاء الشحنة (Cancelled)</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold mb-1">رقم أو كود التتبع للشحنة (Tracking #)</label>
              <input
                type="text"
                placeholder="مثال: EXP-983210-SO"
                value={trackingNumberInput}
                onChange={e => setTrackingNumberInput(e.target.value)}
                className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl p-2.5 text-xs font-mono text-gray-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block font-semibold mb-1">ملاحظة التحديث للعميل</label>
              <textarea
                rows={2}
                placeholder="مثال: تم تسليم الطرد لمندوب الشحن في مقديشو وستصلكم خلال ساعتين."
                value={fulfillmentNoteInput}
                onChange={e => setFulfillmentNoteInput(e.target.value)}
                className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl p-2.5 text-xs text-gray-900 dark:text-white"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setSelectedFulfillment(null)}
                className="flex-1 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 font-bold"
              >
                إلغاء
              </button>
              <button
                onClick={handleConfirmFulfillment}
                className="flex-1 bg-[#0E11B7] hover:bg-[#0c0ea3] text-white py-2.5 rounded-xl font-bold shadow"
              >
                تأكيد التحديث وإشعار العميل
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payout Modal */}
      {isPayoutModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-gray-900 rounded-2xl max-w-md w-full border border-gray-200 dark:border-gray-800 p-6 shadow-2xl text-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-gray-800">
              <h3 className="font-bold text-sm">طلب سحب أرباح البائع</h3>
              <button onClick={() => setIsPayoutModalOpen(false)} className="text-gray-400">
                ✕
              </button>
            </div>

            <form onSubmit={handleRequestPayout} className="space-y-3">
              <div className="bg-emerald-50 dark:bg-emerald-950/40 p-3 rounded-xl border border-emerald-200 dark:border-emerald-800/40">
                <span className="text-[11px] text-gray-500 block">رصيدك المتاح للسحب:</span>
                <span className="text-xl font-black text-emerald-600 dark:text-emerald-400">${availableBalance.toFixed(2)}</span>
              </div>

              <div>
                <label className="block font-semibold mb-1">المبلغ المطلوب سحبه ($) *</label>
                <input
                  type="number"
                  step="1"
                  min="10"
                  max={availableBalance}
                  required
                  value={payoutFormData.amount}
                  onChange={e => setPayoutFormData({ ...payoutFormData, amount: Number(e.target.value) })}
                  className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl p-2.5 text-xs text-gray-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block font-semibold mb-1">طريقة استلام الأموال *</label>
                <select
                  value={payoutFormData.paymentMethod}
                  onChange={e => setPayoutFormData({ ...payoutFormData, paymentMethod: e.target.value as any })}
                  className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl p-2.5 text-xs text-gray-900 dark:text-white"
                >
                  <option value="zaad">محفظة زاد (Zaad - Telesom)</option>
                  <option value="sahall">محفظة ساهل (Sahal - Golis)</option>
                  <option value="evc_plus">محفظة إي في سي بلس (EVC Plus - Hormuud)</option>
                  <option value="bank_transfer">تحويل بنكي صومالي (Bank Transfer)</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold mb-1">رقم المحفظة أو الحساب *</label>
                <input
                  type="text"
                  required
                  placeholder="+252 6x xxx xxxx"
                  value={payoutFormData.accountNumber}
                  onChange={e => setPayoutFormData({ ...payoutFormData, accountNumber: e.target.value })}
                  className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl p-2.5 text-xs font-mono text-gray-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block font-semibold mb-1">اسم صاحب الحساب بالكامل *</label>
                <input
                  type="text"
                  required
                  placeholder="الاسم الثلاثي المعتمد في المحفظة"
                  value={payoutFormData.accountName}
                  onChange={e => setPayoutFormData({ ...payoutFormData, accountName: e.target.value })}
                  className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl p-2.5 text-xs text-gray-900 dark:text-white"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsPayoutModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 font-bold"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingPayout}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white py-2.5 rounded-xl font-bold shadow"
                >
                  {isSubmittingPayout ? 'جاري المعالجة...' : 'تأكيد وإرسال الطلب'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Seller Dispute Response Modal */}
      {selectedDisputeToRespond && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-3xl max-w-md w-full border border-gray-200 dark:border-gray-800 p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-gray-800">
              <h3 className="font-bold text-sm text-gray-900 dark:text-white flex items-center gap-2">
                <Reply className="w-4 h-4 text-[#0E11B7]" />
                <span>{language === 'ar' ? 'الرد على نزاع العميل' : 'Respond to Dispute'}</span>
              </h3>
              <button
                onClick={() => setSelectedDisputeToRespond(null)}
                className="text-gray-400 hover:text-gray-600 font-bold text-sm"
              >
                ✕
              </button>
            </div>

            <div className="my-3 p-3 bg-gray-50 dark:bg-gray-800/60 rounded-xl text-xs space-y-1">
              <p><strong>{language === 'ar' ? 'الطلب:' : 'Order:'}</strong> #{selectedDisputeToRespond.orderId}</p>
              <p><strong>{language === 'ar' ? 'العميل:' : 'Customer:'}</strong> {selectedDisputeToRespond.customerName}</p>
              <p><strong>{language === 'ar' ? 'السبب:' : 'Reason:'}</strong> {selectedDisputeToRespond.reason}</p>
              <p className="text-gray-500 italic mt-1">"{selectedDisputeToRespond.description}"</p>
            </div>

            <form onSubmit={handleRespondToDispute} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold mb-1">
                  {language === 'ar' ? 'رد المتجر وتوضيح الموقف *' : 'Merchant Statement *'}
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder={language === 'ar' ? 'اشرح وجهة نظر المتجر أو اعتذر وقدم الحل المناسب...' : 'Provide details and proposed resolution...'}
                  value={disputeResponseText}
                  onChange={e => setDisputeResponseText(e.target.value)}
                  className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl p-2.5 text-xs text-gray-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block font-semibold mb-1">
                  {language === 'ar' ? 'التسوية المقترحة من طرفك:' : 'Proposed Resolution:'}
                </label>
                <select
                  value={disputeProposedResolution}
                  onChange={e => setDisputeProposedResolution(e.target.value as any)}
                  className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl p-2.5 text-xs text-gray-900 dark:text-white"
                >
                  <option value="refund">{language === 'ar' ? 'موافقة على الاسترداد المالي (Refund)' : 'Accept Refund'}</option>
                  <option value="replacement">{language === 'ar' ? 'إرسال منتج بديل مجاناً (Replacement)' : 'Free Replacement'}</option>
                  <option value="decline">{language === 'ar' ? 'رفض الشكوى مع التوضيح (Decline with Reason)' : 'Decline Claim'}</option>
                </select>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedDisputeToRespond(null)}
                  className="flex-1 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 font-bold"
                >
                  {language === 'ar' ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingDisputeResponse}
                  className="flex-1 bg-[#0E11B7] hover:bg-[#0c0ea3] disabled:opacity-50 text-white py-2.5 rounded-xl font-bold shadow"
                >
                  {isSubmittingDisputeResponse
                    ? language === 'ar' ? 'جاري الإرسال...' : 'Submitting...'
                    : language === 'ar' ? 'إرسال الرد للإدارة والعميل' : 'Submit Response'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Driver Assignment Modal */}
      {selectedDeliveryToAssign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-3xl max-w-md w-full border border-gray-200 dark:border-gray-800 p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-gray-800">
              <h3 className="font-bold text-sm text-gray-900 dark:text-white flex items-center gap-2">
                <Truck className="w-4 h-4 text-cyan-600" />
                <span>{language === 'ar' ? 'إسناد مندوب توصيل للشحنة' : 'Assign Delivery Courier'}</span>
              </h3>
              <button
                onClick={() => setSelectedDeliveryToAssign(null)}
                className="text-gray-400 hover:text-gray-600 font-bold text-sm"
              >
                ✕
              </button>
            </div>

            <div className="my-3 p-3 bg-gray-50 dark:bg-gray-800/60 rounded-xl text-xs space-y-1">
              <p><strong>{language === 'ar' ? 'الشحنة رقم:' : 'Shipment:'}</strong> #{selectedDeliveryToAssign.subOrderId || selectedDeliveryToAssign.orderId}</p>
              <p><strong>{language === 'ar' ? 'العميل المستلم:' : 'Customer:'}</strong> {selectedDeliveryToAssign.customerName}</p>
              <p><strong>{language === 'ar' ? 'العنوان:' : 'Address:'}</strong> {selectedDeliveryToAssign.address}, {selectedDeliveryToAssign.city}</p>
            </div>

            <form onSubmit={handleAssignDriver} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold mb-1">
                  {language === 'ar' ? 'اختر المندوب المتاح حالياً *' : 'Select Available Courier *'}
                </label>
                <select
                  required
                  value={selectedDriverIdToAssign}
                  onChange={e => setSelectedDriverIdToAssign(e.target.value)}
                  className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl p-2.5 text-xs text-gray-900 dark:text-white"
                >
                  <option value="">{language === 'ar' ? '-- اختر مندوباً من القائمة --' : '-- Select Driver --'}</option>
                  {availableDrivers.map(drv => (
                    <option key={drv.id} value={drv.id}>
                      {drv.name} ({drv.vehicleType} - {drv.plateNumber}) • {drv.currentZone}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedDeliveryToAssign(null)}
                  className="flex-1 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 font-bold"
                >
                  {language === 'ar' ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={isAssigningDriver || !selectedDriverIdToAssign}
                  className="flex-1 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white py-2.5 rounded-xl font-bold shadow"
                >
                  {isAssigningDriver
                    ? language === 'ar' ? 'جاري الإسناد...' : 'Assigning...'
                    : language === 'ar' ? 'تأكيد إسناد المندوب' : 'Confirm Assignment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Floating In-App Toast Banner */}
      {toastMessage && (
        <div
          className={`fixed bottom-6 end-6 z-50 px-4 py-3 rounded-2xl shadow-xl border text-xs font-bold flex items-center gap-2 transition-all ${
            toastMessage.type === 'success'
              ? 'bg-emerald-600 text-white border-emerald-500'
              : 'bg-rose-600 text-white border-rose-500'
          }`}
        >
          {toastMessage.type === 'success' ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          <span>{toastMessage.text}</span>
        </div>
      )}
    </div>
  );
};
