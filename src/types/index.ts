export type Language = 'ar' | 'en' | 'so';

export type ThemeMode = 'light' | 'dark' | 'system';

export type UserRole =
  | 'CUSTOMER'
  | 'SELLER'
  | 'RESTAURANT'
  | 'SERVICE_PROVIDER'
  | 'ADMIN'
  | 'SUPER_ADMIN';

export type SellerType = 'store' | 'restaurant' | 'service' | 'classified';

export type SellerStatus = 'pending' | 'approved' | 'rejected' | 'suspended';

export interface User {
  id: string;
  name: string;
  displayName?: string;
  email: string;
  phone?: string;
  phoneNumber?: string;
  uid?: string;
  role: UserRole;
  status?: 'active' | 'suspended';
  avatar?: string;
  storeId?: string;
  sellerType?: SellerType;
  sellerStatus?: SellerStatus;
  isVerified?: boolean;
  createdAt: string;
  lastActiveAt?: string;
}

export type MarketplaceType =
  | 'shop'
  | 'restaurants'
  | 'stores'
  | 'services'
  | 'offers'
  | 'ads';

export type ProductCondition = 'new' | 'used' | 'dropshipping';

export type ProductType =
  | 'products'
  | 'stores'
  | 'store-products'
  | 'restaurants'
  | 'restaurant-products'
  | 'services'
  | 'dropshipping'
  | 'used'
  | 'ads';

export interface LocalizedString {
  ar: string;
  en: string;
  so: string;
}

export interface ProductColor {
  name: LocalizedString;
  hex?: string;
  image?: string;
}

export interface ProductSeller {
  id: string;
  name: string;
  slug?: string;
  logo?: string;
  rating?: number;
  phone?: string;
  whatsapp?: string;
  location?: LocalizedString;
  isOpen?: boolean;
  minOrder?: number;
  deliveryTime?: LocalizedString;
}

export interface ProductAddon {
  id: string;
  name: LocalizedString;
  price: number;
}

export type ProductLifecycleStatus =
  | 'draft'
  | 'pending_review'
  | 'published'
  | 'hidden'
  | 'rejected'
  | 'archived'
  | 'approved'
  | 'pending';

export interface InventoryLogEntry {
  id: string;
  date: string;
  previousStock: number;
  newStock: number;
  change: number;
  reason: 'restock' | 'order_fulfillment' | 'adjustment' | 'manual_update';
  actor: string;
}

export interface Product {
  id: string;
  slug: string;
  sku?: string;
  title: LocalizedString;
  name?: LocalizedString; // Canonical alias for title (backwards compatibility)
  description: LocalizedString;
  price: number;
  oldPrice?: number;
  discount?: number;
  currency: string;
  images: string[];
  thumbnail: string;
  type: ProductType;
  marketplaceType?: MarketplaceType;
  productCondition?: ProductCondition;
  category: string;
  inventoryMode?: string; // Inventory tracking mode alias
  subcategory?: string;
  categories: string[];
  tags: string[];
  sizes?: string[];
  colors?: ProductColor[];
  brand?: string;
  rating: number;
  reviewsCount: number;
  stock: number;
  lowStockThreshold?: number;
  inventoryHistory?: InventoryLogEntry[];
  isOffer?: boolean;
  offerExpires?: string;
  features?: LocalizedString[];
  specs?: Record<string, string>;
  addons?: ProductAddon[];
  seller?: ProductSeller;
  sellerId?: string; // Ownership
  storeId?: string;  // Ownership
  prepTime?: LocalizedString;
  prepTimeMinutes?: number;
  dietaryTags?: string[];
  menuCategory?: string;
  deliveryTime?: LocalizedString;
  condition?: LocalizedString; // for used items
  isNegotiable?: boolean;      // for classified items
  supplier?: string;           // for dropshipping
  sourceCountry?: string;      // e.g. China, Turkey
  affiliateUrl?: string;
  isPublished?: boolean;
  status?: ProductLifecycleStatus;
  rejectionReason?: string;
  isSponsored?: boolean;
  sponsoredExpires?: string;
  isFeatured?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Store {
  id: string;
  slug: string;
  name: string;
  sellerId: string;
  sellerType: SellerType;
  logo: string;
  cover: string;
  description: LocalizedString;
  phone: string;
  contactPhone?: string;
  whatsapp: string;
  email: string;
  city: string;
  district: string;
  address: LocalizedString;
  location?: any;
  restaurantMetadata?: {
    cuisine?: string[];
    averagePrepTimeMinutes?: number;
    isHalalCertified?: boolean;
    [key: string]: any;
  };
  openingHours: string;
  category: string;
  categories: string[];
  socialLinks?: {
    facebook?: string;
    instagram?: string;
    twitter?: string;
  };
  deliveryAvailable: boolean;
  deliveryFee: number;
  shippingFee?: number;
  minOrder: number;
  paymentMethods: string[];
  rating: number;
  reviewsCount: number;
  followersCount: number;
  isVerified: boolean;
  verified?: boolean;
  status: SellerStatus;
  commissionRate?: number;
  isFeatured?: boolean;
  featuredExpires?: string;
  currentPlanId?: string;
  currentPlanTier?: string;
  createdAt: string;
}

export interface RestaurantMealAddon {
  id: string;
  name: LocalizedString;
  price: number;
  isAvailable: boolean;
}

export interface ServiceItem {
  id: string;
  storeId: string;
  sellerId: string;
  title: LocalizedString;
  description: LocalizedString;
  price: number;
  pricingType: 'fixed' | 'starting_at' | 'hourly' | 'contact_only';
  duration?: string;
  actionType: 'order' | 'booking' | 'contact';
  image?: string;
  category: string;
  isActive: boolean;
}

export interface ServiceBooking {
  id: string;
  bookingCode: string;
  serviceId: string;
  serviceTitle: string;
  serviceName?: string;
  price?: number;
  storeId: string;
  storeName: string;
  sellerId: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  date: string;
  time: string;
  scheduledDate?: string;
  scheduledTime?: string;
  timeSlot?: string;
  location: string;
  notes?: string;
  status: 'requested' | 'accepted' | 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | 'confirmed';
  createdAt: string;
}

export interface CartItem {
  id: string; // unique item id based on product + options
  product: Product;
  productName?: string;
  price?: number;
  quantity: number;
  selectedColor?: string;
  selectedSize?: string;
  selectedAddons?: ProductAddon[];
  customerNotes?: string;
  sellerId?: string;
  storeId?: string;
}

export interface FilterState {
  search: string;
  category: string;
  type: string;
  minPrice: number | null;
  maxPrice: number | null;
  minRating: number;
  sortBy: 'latest' | 'price-low' | 'price-high' | 'rating' | 'popular';
  onlyOffers: boolean;
  color: string;
  sellerType?: SellerType | 'all';
  onlyVerified?: boolean;
  location?: string;
}

export interface CategoryInfo {
  id: string;
  slug: string;
  name: LocalizedString;
  icon: string;
  description: LocalizedString;
  accentColor: string;
  itemCount: number;
  bannerImage?: string;
}

export type StoreOrderStatus =
  | 'pending'
  | 'confirmed'
  | 'preparing'
  | 'ready'
  | 'shipped'
  | 'delivered'
  | 'cancelled';

export type RestaurantOrderStatus =
  | 'pending'
  | 'accepted'
  | 'preparing'
  | 'ready'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled';

export type ServiceOrderStatus =
  | 'requested'
  | 'accepted'
  | 'scheduled'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export interface OrderStatusHistoryEntry {
  status: string;
  timestamp: string;
  actor: string;
  note?: string;
}

export interface VendorSubOrder {
  id?: string;
  subOrderId: string;
  parentOrderId: string;
  storeId: string;
  storeName: string;
  sellerId: string;
  sellerType: SellerType;
  items: CartItem[];
  subtotal: number;
  deliveryFee: number;
  total: number;
  commissionRate: number;
  platformCommission: number;
  sellerRevenue: number;
  vendorEarnings?: number;
  effectiveCommissionRate?: number;
  commissionPolicyUsed?: 'seller_specific' | 'category' | 'seller_type' | 'global';
  discount?: number;
  couponCode?: string;
  refundStatus?: 'none' | 'requested' | 'approved' | 'refunded' | 'rejected';
  refundAmount?: number;
  status: StoreOrderStatus | RestaurantOrderStatus | ServiceOrderStatus;
  sellerPhone?: string;
  sellerWhatsapp?: string;
  statusHistory?: OrderStatusHistoryEntry[];
  trackingNumber?: string;
}

export interface OrderDetails {
  orderId: string;
  id?: string; // Canonical alias for orderId (backwards compatibility)
  customerId?: string;
  sellerIds?: string[];
  vendorStoreIds?: string[];
  customerName: string;
  phone: string;
  email?: string;
  city: string;
  address: string;
  shippingAddress?: {
    fullName?: string;
    city?: string;
    phoneNumber?: string;
    addressLine1?: string;
  };
  paymentMethod: 'cash_on_delivery' | 'evc_plus' | 'zaad' | 'sahall' | 'card';
  paymentStatus?: 'pending' | 'unpaid' | 'paid_pending_review' | 'paid';
  notes?: string;
  items: CartItem[];
  vendorOrders?: VendorSubOrder[];
  subtotal: number;
  shipping: number;
  tax: number;
  total: number;
  discount?: number;
  couponCode?: string;
  refundStatus?: 'none' | 'requested' | 'approved' | 'refunded' | 'rejected';
  refundAmount?: number;
  createdAt: string;
  status: 'pending' | 'processing' | 'shipped' | 'delivered' | 'completed' | 'cancelled';
  statusHistory?: OrderStatusHistoryEntry[];
  deliveryTrackingCode?: string;
}

export type Order = OrderDetails;
export type Booking = ServiceBooking;

export interface Review {
  id: string;
  targetType: 'product' | 'store' | 'restaurant' | 'service';
  targetId: string;
  userId: string;
  customerId?: string; // Canonical alias for userId
  userName: string;
  userAvatar?: string;
  rating: number;
  comment: string;
  isVerifiedPurchase: boolean;
  verifiedPurchase?: boolean;
  orderId?: string;
  isHidden?: boolean;
  status?: 'published' | 'hidden' | 'removed';
  sellerReply?: {
    comment: string;
    repliedAt: string;
  };
  createdAt: string;
}

export type PayoutStatus = 'pending' | 'approved' | 'processing' | 'paid' | 'rejected' | 'cancelled' | 'processed';
export type PayoutSettlementType = 'MANUAL_SETTLEMENT' | 'REAL_PROVIDER' | 'MOCK' | 'UNAVAILABLE';

export interface PayoutRequest {
  id: string;
  sellerId: string;
  storeId: string;
  sellerName?: string;
  storeName?: string;
  amount: number;
  approvedAmount?: number;
  paymentMethod: 'zaad' | 'sahall' | 'evc_plus' | 'bank_transfer' | 'stc_pay' | 'paypal';
  method?: string; // Canonical alias for paymentMethod (backwards compatibility)
  settlementType?: PayoutSettlementType;
  accountNumber: string;
  accountName: string;
  status: PayoutStatus;
  requestedAt: string;
  createdAt?: string; // Canonical alias for requestedAt (backwards compatibility)
  processedAt?: string;
  reviewedBy?: string;
  notes?: string;
  reference?: string;
  referenceCode?: string; // Canonical alias for reference (backwards compatibility)
}

export type NotificationEventType =
  | 'SELLER_APPLICATION_SUBMITTED'
  | 'SELLER_APPROVED'
  | 'SELLER_REJECTED'
  | 'NEW_ORDER'
  | 'ORDER_CONFIRMED'
  | 'ORDER_PREPARING'
  | 'ORDER_READY'
  | 'ORDER_SHIPPED'
  | 'ORDER_OUT_FOR_DELIVERY'
  | 'ORDER_DELIVERED'
  | 'ORDER_CANCELLED'
  | 'PAYMENT_REFERENCE_SUBMITTED'
  | 'PAYMENT_CONFIRMED'
  | 'PAYMENT_REJECTED'
  | 'BOOKING_CREATED'
  | 'BOOKING_ACCEPTED'
  | 'BOOKING_REJECTED'
  | 'BOOKING_COMPLETED'
  | 'PAYOUT_REQUESTED'
  | 'PAYOUT_APPROVED'
  | 'PAYOUT_REJECTED'
  | 'PAYOUT_PAID'
  | 'DELIVERY_ASSIGNED'
  | 'DELIVERY_FAILED'
  | 'DELIVERY_RESCHEDULED'
  | 'NEW_MESSAGE'
  | 'NEW_REVIEW'
  | 'system';

export interface NotificationItem {
  id: string;
  userId: string;
  type: 'order' | 'booking' | 'review' | 'system' | 'approval' | 'delivery' | 'payment' | 'payout' | 'message';
  eventType?: NotificationEventType;
  title: LocalizedString;
  message: LocalizedString;
  entityType?: 'order' | 'sub_order' | 'booking' | 'payout' | 'payment' | 'delivery' | 'conversation' | 'store' | 'system';
  entityId?: string;
  read: boolean;
  link?: string;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  actorId: string;
  actorRole: UserRole;
  actorEmail?: string;
  action: string;
  targetType:
    | 'user'
    | 'seller'
    | 'store'
    | 'restaurant'
    | 'service'
    | 'product'
    | 'order'
    | 'payment'
    | 'payout'
    | 'review'
    | 'delivery'
    | 'settings'
    | 'address'
    | 'message'
    | 'subscription'
    | 'promotion'
    | 'campaign'
    | 'coupon'
    | 'refund'
    | 'featured';
  targetId: string;
  targetName?: string;
  resourceType?: string;
  resourceId?: string;
  requestId?: string;
  beforeState?: Record<string, unknown> | null;
  afterState?: Record<string, unknown> | null;
  reason?: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export type DeliveryType =
  | 'seller_delivery'
  | 'platform_delivery'
  | 'pickup'
  | 'SELLER_DELIVERY'
  | 'PLATFORM_DELIVERY'
  | 'CUSTOMER_PICKUP';

export type DeliveryAssignmentStatus =
  | 'PENDING'
  | 'ASSIGNED'
  | 'PREPARING'
  | 'READY'
  | 'PICKED_UP'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'FAILED'
  | 'CANCELLED'
  | 'RESCHEDULED'
  | 'pending_fulfillment'
  | 'preparing'
  | 'ready'
  | 'shipped'
  | 'out_for_delivery'
  | 'delivered'
  | 'failed'
  | 'cancelled';

export interface DeliveryAssignment {
  id: string;
  orderId: string;
  subOrderId?: string;
  storeId: string;
  storeName: string;
  sellerId: string;
  customerId?: string;
  customerName: string;
  customerPhone: string;
  city: string;
  district?: string;
  address: string;
  landmark?: string;
  deliveryType: DeliveryType;
  deliveryModel?: string;
  driverId?: string | null;
  assignedDriver: string | null;
  driverName?: string;
  driverPhone?: string;
  vehicleId?: string;
  vehicleInfo?: string;
  vehicleType?: string;
  vehiclePlateNumber?: string;
  trackingCode?: string;
  trackingNumber?: string;
  status: DeliveryAssignmentStatus;
  // Lifecycle timestamps
  timestamps: {
    created: string;
    assignedAt?: string;
    preparing?: string;
    ready?: string;
    pickedUpAt?: string;
    dispatched?: string;
    outForDelivery?: string;
    outForDeliveryAt?: string;
    delivered?: string;
    deliveredAt?: string;
    failed?: string;
    failedAt?: string;
    rescheduledAt?: string;
    cancelled?: string;
  };
  notes?: string;
  deliveryNotes?: string;
  // Failure / Redelivery details
  failureReason?:
    | 'customer_unavailable'
    | 'wrong_address'
    | 'phone_unreachable'
    | 'store_issue'
    | 'driver_issue'
    | 'other'
    | string;
  failedBy?: string;
  failureNotes?: string;
  // Future proof of delivery architecture
  deliveryProofType?: 'recipient_confirmation' | 'photo' | 'signature' | 'manual_verification';
  deliveryProofUrl?: string;
  recipientName?: string;
  recipientConfirmation?: string;
  completedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export type DriverStatus = 'AVAILABLE' | 'ASSIGNED' | 'ON_DELIVERY' | 'OFFLINE' | 'SUSPENDED';

export interface DriverProfile {
  id: string;
  name: string;
  phone: string;
  email?: string;
  status: DriverStatus;
  vehicleId?: string;
  vehicleType?: 'motorcycle' | 'car' | 'van' | 'bicycle';
  plateNumber?: string;
  currentZone?: string;
  rating?: number;
  totalDeliveries?: number;
  isDemo?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Vehicle {
  id: string;
  type: 'motorcycle' | 'car' | 'van' | 'bicycle';
  plateNumber: string;
  model?: string;
  status: 'ACTIVE' | 'MAINTENANCE' | 'INACTIVE';
  assignedDriverId?: string;
  isDemo?: boolean;
  createdAt: string;
}

export interface SavedAddress {
  id: string;
  userId: string;
  label: 'home' | 'work' | 'other' | 'HOME' | 'WORK' | 'OTHER';
  customLabel?: string;
  recipientName: string;
  phone: string;
  city: string;
  district?: string;
  address: string;
  landmark?: string;
  deliveryNotes?: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Conversation {
  id: string;
  participantIds: string[];
  participantDetails: {
    id: string;
    name: string;
    role: UserRole;
    avatar?: string;
  }[];
  contextType: 'order' | 'booking' | 'product' | 'store' | 'general';
  contextId?: string;
  contextTitle?: string;
  lastMessage?: string;
  lastMessageAt?: string;
  lastSenderId?: string;
  unreadCount?: Record<string, number>;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderRole: UserRole;
  text: string;
  createdAt: string;
  readAt?: string;
}

export interface MobileMoneyAccountConfig {
  accountNumber: string;
  accountName: string;
}

export interface PlatformSettings {
  defaultCommissionRate: number;
  minPayoutThreshold: number;
  minimumPayoutAmount?: number;
  cardPaymentAvailable: boolean;
  evcPlusMerchantNumber: string;
  zaadMerchantNumber: string;
  sahalMerchantNumber: string;
  platformDeliveryEnabled: boolean;
  sellerDeliveryEnabled: boolean;
  customerPickupEnabled: boolean;
  supportPhone: string;
  supportEmail: string;
  payoutProcessingDays: number;
  sellerPlansEnabled?: boolean;
  advertisingEnabled?: boolean;
  featuredStoresEnabled?: boolean;
  promotionsEnabled?: boolean;
  couponsEnabled?: boolean;
  sellerTypeCommissionRates?: Record<string, number>;
  categoryCommissionRates?: Record<string, number>;
  mobileMoneyAccounts?: {
    evcPlus: MobileMoneyAccountConfig;
    zaad: MobileMoneyAccountConfig;
    sahall: MobileMoneyAccountConfig;
  };
  autoApproveSellers?: boolean;
  autoApproveProducts?: boolean;
  maintenanceMode?: boolean;
  updatedAt: string;
  updatedBy: string;
}

export * from './monetization';
