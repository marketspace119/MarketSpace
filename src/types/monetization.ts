import { LocalizedString } from './index';

export type SellerPlanTier = 'FREE' | 'BASIC' | 'BUSINESS' | 'PREMIUM';

export type SubscriptionStatus = 'ACTIVE' | 'TRIAL' | 'PENDING_PAYMENT' | 'PENDING_REVIEW' | 'PAST_DUE' | 'CANCELLED' | 'EXPIRED';

export interface SellerPlan {
  id: string;
  tier: SellerPlanTier;
  name: LocalizedString;
  description: LocalizedString;
  price: number;
  currency: string;
  billingPeriod: 'monthly' | 'yearly';
  maxProducts: number;
  maxImages: number;
  featuredListingAllowed: boolean;
  analyticsLevel: 'basic' | 'standard' | 'advanced';
  prioritySupport: boolean;
  customStorefront: boolean;
  commissionAdjustment: number; // e.g. -2 for 2% discount from standard commission
  active: boolean;
  createdAt: string;
  updatedAt: string;
  priceMonthly?: number;
  listingLimit?: number;
  commissionDiscountPercent?: number;
  featuredProductsCount?: number;
}

export interface SellerSubscription {
  id: string;
  sellerId: string;
  storeId: string;
  planId: string;
  planTier: SellerPlanTier;
  status: SubscriptionStatus;
  billingClassification: 'MANUAL' | 'FREE';
  price: number;
  paymentMethod?: string;
  paymentReference?: string;
  paymentReferenceNumber?: string;
  amountPaid?: number;
  submittedAt?: string;
  startDate: string;
  endDate: string;
  approvedBy?: string;
  approvedAt?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export type CommissionPolicySource = 'seller_specific' | 'category' | 'seller_type' | 'global';

export interface CommissionPolicy {
  globalRate: number; // e.g. 10 (%)
  sellerTypeRates: Record<string, number>; // e.g. { restaurant: 6, service: 8, store: 10, classified: 5 }
  categoryRates: Record<string, number>; // e.g. { electronics: 7, cosmetics: 9, fashion: 12 }
  sellerSpecificRates: Record<string, number>; // e.g. { 'user_seller_01': 8 }
}

export interface CommissionPolicyRule {
  id: string;
  level: 'GLOBAL' | 'SELLER_TYPE' | 'CATEGORY' | 'SELLER_SPECIFIC';
  targetId?: string;
  targetName?: string;
  ratePercent: number;
  isActive: boolean;
}

export interface CommissionResolution {
  effectiveRate: number;
  source: CommissionPolicySource;
  baseRate: number;
  planDiscount: number;
}

export type FeaturedPlacement = 'home_featured' | 'directory_top' | 'spotlight';

export interface FeaturedListing {
  id: string;
  targetType: 'store' | 'restaurant' | 'service' | 'product';
  targetId: string;
  sellerId: string;
  title: LocalizedString;
  placement: FeaturedPlacement;
  priority: number;
  startAt: string;
  endAt: string;
  status: 'active' | 'scheduled' | 'expired' | 'cancelled';
  fee: number;
  createdAt: string;
  createdBy: string;
}

export type PromotionRequestStatus =
  | 'DRAFT'
  | 'PENDING_PAYMENT'
  | 'PENDING_REVIEW'
  | 'APPROVED'
  | 'SCHEDULED'
  | 'ACTIVE'
  | 'EXPIRED'
  | 'REJECTED';

export interface PromotionRequest {
  id: string;
  productId: string;
  productTitle: LocalizedString;
  sellerId: string;
  storeId: string;
  placement: 'search_top' | 'category_sponsor' | 'home_deals' | 'home_hero' | 'category_top' | 'search_boost';
  budget: number;
  durationDays: number;
  startAt?: string;
  endAt?: string;
  status: PromotionRequestStatus;
  productImage?: string;
  cost?: number;
  paymentReferenceNumber?: string;
  rejectionReason?: string;
  adminNotes?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type AdCampaignStatus =
  | 'DRAFT'
  | 'PENDING_REVIEW'
  | 'APPROVED'
  | 'SCHEDULED'
  | 'ACTIVE'
  | 'PAUSED'
  | 'EXPIRED'
  | 'REJECTED';

export type AdPlacement =
  | 'home_banner'
  | 'shop_listing'
  | 'category_page'
  | 'store_directory'
  | 'restaurant_directory'
  | 'services_directory';

export interface AdCampaign {
  id: string;
  advertiserId: string;
  sellerId?: string;
  advertiserName: string;
  placement: AdPlacement;
  title: LocalizedString;
  description?: LocalizedString;
  creativeUrl: string;
  targetUrl: string;
  budget: number;
  spent: number;
  startAt: string;
  endAt: string;
  status: AdCampaignStatus;
  billingClassification: 'MANUAL';
  paymentReference?: string;
  paymentVerified?: boolean;
  reviewedBy?: string;
  reviewedAt?: string;
  impressions?: number;
  clicks?: number;
  createdAt: string;
  updatedAt: string;
}

export interface Coupon {
  id: string;
  code: string; // e.g. "WELCOME10", "EID2026"
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  minOrderAmount: number;
  maxDiscountAmount?: number;
  sellerId?: string; // Optional: restriction to a specific merchant
  storeId?: string;
  applicableCategory?: string; // Optional: restriction to a specific category
  usageLimit: number;
  usedCount: number;
  perCustomerLimit: number;
  customerUsage: Record<string, number>;
  active: boolean;
  startAt: string;
  expireAt: string;
  createdAt: string;
  createdBy: string;
}

export type RefundStatus =
  | 'PENDING'
  | 'REFUND_REQUESTED'
  | 'REFUND_APPROVED'
  | 'APPROVED'
  | 'REFUND_REJECTED'
  | 'REJECTED'
  | 'REFUNDED';

export interface RefundRequest {
  id: string;
  orderId: string;
  subOrderId?: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  sellerId: string;
  storeId: string;
  amount: number;
  reason: 'wrong_item' | 'damaged' | 'missing' | 'delayed' | 'other';
  notes: string;
  status: RefundStatus;
  settlementType?: 'MANUAL_MOBILE_TRANSFER' | 'CASH' | 'STORE_CREDIT';
  settlementReference?: string;
  adminNotes?: string;
  processedBy?: string;
  processedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type AnalyticsEventType =
  | 'PRODUCT_VIEW'
  | 'STORE_VIEW'
  | 'AD_IMPRESSION'
  | 'AD_CLICK'
  | 'PROMOTION_VIEW'
  | 'PROMOTION_CLICK'
  | 'CHECKOUT_STARTED'
  | 'ORDER_COMPLETED';

export interface AnalyticsEvent {
  id: string;
  type: AnalyticsEventType;
  targetType: 'product' | 'store' | 'campaign' | 'promotion' | 'checkout' | 'order';
  targetId: string;
  sellerId?: string;
  sessionId: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

export interface PlatformMonetizationSummary {
  gmv: number;
  platformCommission: number;
  subscriptionRevenue: number;
  advertisingRevenue: number;
  promotionRevenue: number;
  totalPayouts: number;
  totalRefunds: number;
  netPlatformRevenue: number;
  ordersCount: number;
  activeSubscriptionsCount: number;
  activeCampaignsCount: number;
}
