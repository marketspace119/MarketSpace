import {
  Product,
  PayoutRequest,
  Store,
  OrderDetails,
  LocalizedString,
  PayoutStatus,
  ServiceBooking,
  Review,
} from '../types';
import { MobilePaymentSubmission } from '../services/paymentService';

/**
 * MarketSpace Canonical Data Boundary Normalization Layer
 * Enforces single source of truth schemas, ensures backwards compatibility with legacy documents,
 * and guarantees 100% crash-proof contracts across services and UI components.
 */

export function normalizeLocalizedString(raw: any, defaultFallback = ''): LocalizedString {
  if (typeof raw === 'string') {
    const val = raw.trim() || defaultFallback;
    return { ar: val, en: val, so: val };
  }
  if (raw && typeof raw === 'object') {
    const ar = typeof raw.ar === 'string' && raw.ar.trim() ? raw.ar : (raw.en || raw.so || defaultFallback);
    const en = typeof raw.en === 'string' && raw.en.trim() ? raw.en : (raw.ar || raw.so || defaultFallback);
    const so = typeof raw.so === 'string' && raw.so.trim() ? raw.so : (raw.en || raw.ar || defaultFallback);
    return { ar, en, so };
  }
  return {
    ar: defaultFallback,
    en: defaultFallback,
    so: defaultFallback,
  };
}

export function normalizeProduct(raw: any): Product {
  if (!raw || typeof raw !== 'object') {
    return {
      id: `prod_fallback_${Date.now()}`,
      slug: `fallback-product-${Date.now()}`,
      title: { ar: 'منتج غير متوفر', en: 'Unavailable Product', so: 'Alaab aan la heli karin' },
      name: { ar: 'منتج غير متوفر', en: 'Unavailable Product', so: 'Alaab aan la heli karin' },
      description: { ar: '', en: '', so: '' },
      price: 0,
      currency: 'USD',
      images: ['https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=100'],
      thumbnail: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=100',
      type: 'products',
      category: 'general',
      categories: ['general'],
      tags: [],
      rating: 5.0,
      reviewsCount: 0,
      stock: 0,
      isPublished: false,
      status: 'rejected',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  const rawTitle = raw.title || raw.name || raw.localizedTitle;
  const title = normalizeLocalizedString(rawTitle, 'منتج / Product');
  const description = normalizeLocalizedString(raw.description, '');

  const id = String(raw.id || `prod_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`);
  const slug = String(raw.slug || id);

  const images: string[] = Array.isArray(raw.images) && raw.images.length > 0
    ? raw.images.filter((img: any) => typeof img === 'string')
    : (raw.thumbnail && typeof raw.thumbnail === 'string' ? [raw.thumbnail] : []);

  const thumbnail = typeof raw.thumbnail === 'string' && raw.thumbnail
    ? raw.thumbnail
    : (images[0] || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=100');

  const priceNum = typeof raw.price === 'number' && !isNaN(raw.price) ? raw.price : Number(raw.price);
  const safePrice = isNaN(priceNum) || priceNum < 0 ? 0 : priceNum;

  const stockNum = typeof raw.stock === 'number' && !isNaN(raw.stock)
    ? raw.stock
    : (typeof raw.stockQuantity === 'number' ? raw.stockQuantity : Number(raw.stock) || 0);

  return {
    ...raw,
    id,
    slug,
    sku: raw.sku ? String(raw.sku) : undefined,
    title,
    // Provide canonical name alias so any component accessing p.name receives valid LocalizedString
    name: title,
    description,
    price: safePrice,
    oldPrice: typeof raw.oldPrice === 'number' ? raw.oldPrice : (raw.oldPrice ? Number(raw.oldPrice) : undefined),
    discount: typeof raw.discount === 'number' ? raw.discount : undefined,
    currency: typeof raw.currency === 'string' ? raw.currency : 'USD',
    images: images.length > 0 ? images : [thumbnail],
    thumbnail,
    type: raw.type || 'products',
    marketplaceType: raw.marketplaceType || 'b2c',
    productCondition: raw.productCondition || 'new',
    category: typeof raw.category === 'string' ? raw.category : 'general',
    subcategory: raw.subcategory ? String(raw.subcategory) : undefined,
    categories: Array.isArray(raw.categories) ? raw.categories : [raw.category || 'general'],
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    sizes: Array.isArray(raw.sizes) ? raw.sizes : undefined,
    colors: Array.isArray(raw.colors) ? raw.colors : undefined,
    brand: raw.brand ? String(raw.brand) : undefined,
    rating: typeof raw.rating === 'number' && !isNaN(raw.rating) ? raw.rating : 5.0,
    reviewsCount: typeof raw.reviewsCount === 'number' ? raw.reviewsCount : 0,
    stock: stockNum,
    lowStockThreshold: typeof raw.lowStockThreshold === 'number' ? raw.lowStockThreshold : 5,
    sellerId: raw.sellerId ? String(raw.sellerId) : undefined,
    storeId: raw.storeId ? String(raw.storeId) : undefined,
    isPublished: raw.isPublished !== false,
    status: raw.status || 'approved',
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : new Date().toISOString(),
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString(),
  };
}

export function normalizePayout(raw: any): PayoutRequest {
  if (!raw || typeof raw !== 'object') {
    const fallbackId = `pay_${Date.now()}`;
    const now = new Date().toISOString();
    return {
      id: fallbackId,
      sellerId: 'unknown_seller',
      storeId: 'unknown_store',
      amount: 0,
      paymentMethod: 'zaad',
      method: 'zaad',
      settlementType: 'MANUAL_SETTLEMENT',
      accountNumber: 'N/A',
      accountName: 'Beneficiary',
      status: 'pending',
      requestedAt: now,
      createdAt: now,
      reference: '',
      referenceCode: '',
    };
  }

  const rawMethod = raw.paymentMethod || raw.method || 'zaad';
  const method = String(rawMethod).toLowerCase();
  const validMethods = ['zaad', 'sahall', 'evc_plus', 'bank_transfer', 'stc_pay', 'paypal'];
  const safeMethod = validMethods.includes(method)
    ? (method as PayoutRequest['paymentMethod'])
    : 'zaad';

  const requestedAt = typeof raw.requestedAt === 'string' && raw.requestedAt
    ? raw.requestedAt
    : (typeof raw.createdAt === 'string' && raw.createdAt ? raw.createdAt : new Date().toISOString());

  const amtNum = typeof raw.amount === 'number' && !isNaN(raw.amount) ? raw.amount : Number(raw.amount);
  const safeAmount = isNaN(amtNum) || amtNum < 0 ? 0 : amtNum;

  const ref = String(raw.reference || raw.referenceCode || raw.transactionRef || '');

  const payout: PayoutRequest = {
    ...raw,
    id: String(raw.id || `pay_${Date.now()}`),
    sellerId: String(raw.sellerId || ''),
    storeId: String(raw.storeId || ''),
    amount: safeAmount,
    paymentMethod: safeMethod,
    // Canonical alias for legacy callers accessing p.method
    method: safeMethod,
    settlementType: raw.settlementType || 'MANUAL_SETTLEMENT',
    accountNumber: String(raw.accountNumber || ''),
    accountName: String(raw.accountName || raw.sellerName || 'Beneficiary'),
    status: (raw.status as PayoutStatus) || 'pending',
    requestedAt,
    // Canonical alias for legacy callers accessing p.createdAt
    createdAt: requestedAt,
    notes: raw.notes ? String(raw.notes) : '',
    reference: ref,
    // Canonical alias for legacy callers accessing p.referenceCode
    referenceCode: ref,
  };

  if (raw.sellerName) payout.sellerName = String(raw.sellerName);
  else delete (payout as any).sellerName;

  if (raw.storeName) payout.storeName = String(raw.storeName);
  else delete (payout as any).storeName;

  if (typeof raw.approvedAmount === 'number' && !isNaN(raw.approvedAmount)) payout.approvedAmount = raw.approvedAmount;
  else delete (payout as any).approvedAmount;

  if (raw.processedAt) payout.processedAt = String(raw.processedAt);
  else delete (payout as any).processedAt;

  if (raw.reviewedBy) payout.reviewedBy = String(raw.reviewedBy);
  else delete (payout as any).reviewedBy;

  return payout;
}

export function normalizeStore(raw: any): Store {
  if (!raw || typeof raw !== 'object') {
    return {
      id: `store_${Date.now()}`,
      slug: `store-${Date.now()}`,
      name: 'Unknown Store',
      sellerId: 'unknown',
      sellerType: 'store',
      logo: 'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=300',
      cover: 'https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=1200',
      description: { ar: '', en: '', so: '' },
      phone: '',
      whatsapp: '',
      email: '',
      city: 'Mogadishu',
      district: '',
      address: { ar: '', en: '', so: '' },
      openingHours: '08:00 AM - 10:00 PM',
      category: 'general',
      categories: ['general'],
      deliveryAvailable: true,
      deliveryFee: 0,
      minOrder: 0,
      paymentMethods: ['cash_on_delivery'],
      rating: 5.0,
      reviewsCount: 0,
      followersCount: 0,
      isVerified: false,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
  }

  // Handle both string and LocalizedString store names
  let nameStr = 'Store';
  if (typeof raw.name === 'string') {
    nameStr = raw.name;
  } else if (raw.name && typeof raw.name === 'object') {
    nameStr = raw.name.ar || raw.name.en || raw.name.so || 'Store';
  }

  return {
    ...raw,
    id: String(raw.id || `store_${Date.now()}`),
    slug: String(raw.slug || raw.id || `store-${Date.now()}`),
    name: nameStr,
    sellerId: String(raw.sellerId || ''),
    sellerType: raw.sellerType || 'store',
    logo: raw.logo || 'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=300',
    cover: raw.cover || 'https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=1200',
    description: normalizeLocalizedString(raw.description, ''),
    phone: String(raw.phone || ''),
    whatsapp: String(raw.whatsapp || ''),
    email: String(raw.email || ''),
    city: String(raw.city || raw.location?.city || 'Mogadishu'),
    district: String(raw.district || ''),
    address: normalizeLocalizedString(raw.address, ''),
    openingHours: String(raw.openingHours || '08:00 AM - 10:00 PM'),
    category: String(raw.category || 'general'),
    categories: Array.isArray(raw.categories) ? raw.categories : [raw.category || 'general'],
    deliveryAvailable: raw.deliveryAvailable !== false,
    deliveryFee: typeof raw.deliveryFee === 'number' ? raw.deliveryFee : Number(raw.deliveryFee) || 0,
    minOrder: typeof raw.minOrder === 'number' ? raw.minOrder : Number(raw.minOrder) || 0,
    paymentMethods: Array.isArray(raw.paymentMethods) ? raw.paymentMethods : ['cash_on_delivery'],
    rating: typeof raw.rating === 'number' ? raw.rating : 5.0,
    reviewsCount: typeof raw.reviewsCount === 'number' ? raw.reviewsCount : 0,
    followersCount: typeof raw.followersCount === 'number' ? raw.followersCount : 0,
    isVerified: Boolean(raw.isVerified),
    status: raw.status || 'approved',
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : new Date().toISOString(),
  };
}

export function normalizeOrder(raw: any): OrderDetails {
  const orderId = String(raw?.orderId || raw?.id || `ord_${Date.now()}`);
  const customerName = String(raw?.customerName || raw?.shippingAddress?.fullName || 'Customer');
  const city = String(raw?.city || raw?.shippingAddress?.city || 'Mogadishu');
  const phone = String(raw?.phone || raw?.shippingAddress?.phoneNumber || '');
  const address = String(raw?.address || raw?.shippingAddress?.addressLine1 || '');

  const totalNum = typeof raw?.total === 'number' && !isNaN(raw?.total) ? raw.total : Number(raw?.total);
  const safeTotal = isNaN(totalNum) || totalNum < 0 ? 0 : totalNum;

  const paymentMethod = typeof raw?.paymentMethod === 'string' ? raw.paymentMethod : 'cash_on_delivery';

  return {
    ...raw,
    orderId,
    id: orderId, // Canonical alias for callers reading order.id
    customerName,
    city,
    phone,
    address,
    shippingAddress: {
      fullName: customerName,
      city,
      phoneNumber: phone,
      addressLine1: address,
    },
    paymentMethod: paymentMethod as any,
    paymentStatus: raw?.paymentStatus || 'pending',
    items: Array.isArray(raw?.items) ? raw.items : [],
    vendorOrders: Array.isArray(raw?.vendorOrders) ? raw.vendorOrders : [],
    subtotal: typeof raw?.subtotal === 'number' ? raw.subtotal : safeTotal,
    shipping: typeof raw?.shipping === 'number' ? raw.shipping : 0,
    tax: typeof raw?.tax === 'number' ? raw.tax : 0,
    total: safeTotal,
    createdAt: typeof raw?.createdAt === 'string' ? raw.createdAt : new Date().toISOString(),
    status: raw?.status || 'pending',
  };
}

export function normalizePaymentSubmission(raw: any): MobilePaymentSubmission {
  const id = String(raw?.id || `sub_${Date.now()}`);
  const orderId = String(raw?.orderId || '');
  const method = String(raw?.method || 'evc_plus');
  const validMethods = ['evc_plus', 'zaad', 'sahall'];
  const safeMethod = validMethods.includes(method) ? (method as any) : 'evc_plus';

  const amountNum = typeof raw?.amount === 'number' && !isNaN(raw?.amount) ? raw.amount : Number(raw?.amount);
  const safeAmount = isNaN(amountNum) || amountNum < 0 ? 0 : amountNum;

  return {
    ...raw,
    id,
    orderId,
    customerId: String(raw?.customerId || ''),
    method: safeMethod,
    amount: safeAmount,
    referenceNumber: String(raw?.referenceNumber || ''),
    senderPhone: String(raw?.senderPhone || ''),
    status: raw?.status || 'PENDING_PAYMENT',
    createdAt: typeof raw?.createdAt === 'string' ? raw.createdAt : new Date().toISOString(),
  };
}
