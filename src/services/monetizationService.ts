import { PlatformMonetizationSummary, Order, PayoutRequest } from '../types';
import { orderService } from './orderService';
import { subscriptionService } from './subscriptionService';
import { adCampaignService } from './adCampaignService';
import { promotionService } from './promotionService';
import { payoutService } from './payoutService';
import { refundService } from './refundService';

export type MonetizationDateFilter =
  | 'today'
  | '7days'
  | '30days'
  | 'this_month'
  | 'previous_month'
  | 'all';

function isWithinRange(dateStr: string, filter: MonetizationDateFilter): boolean {
  if (filter === 'all') return true;
  const d = new Date(dateStr);
  const now = new Date();

  if (filter === 'today') {
    return (
      d.getDate() === now.getDate() &&
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear()
    );
  }

  if (filter === '7days') {
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return d >= sevenDaysAgo && d <= now;
  }

  if (filter === '30days') {
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    return d >= thirtyDaysAgo && d <= now;
  }

  if (filter === 'this_month') {
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }

  if (filter === 'previous_month') {
    const prevMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
    const prevYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
    return d.getMonth() === prevMonth && d.getFullYear() === prevYear;
  }

  return true;
}

export const monetizationService = {
  getPlatformFinancialSummary(): PlatformMonetizationSummary {
    return this.getPlatformSummary('30days');
  },

  /**
   * Platform-wide Authoritative Monetization & Revenue Breakdown
   */
  getPlatformSummary(filter: MonetizationDateFilter = '30days'): PlatformMonetizationSummary {
    const orders: Order[] = orderService.getAllOrders();
    const subs = subscriptionService.getSubscriptions();
    const campaigns = adCampaignService.getAllCampaigns();
    const promos = promotionService.getAllPromotionRequests();
    const payouts: PayoutRequest[] = payoutService.getAllPayouts();
    const refunds = refundService.getAllRefunds();

    // 1. Orders / GMV / Commission
    let gmv = 0;
    let platformCommission = 0;
    let ordersCount = 0;

    for (const ord of orders) {
      if (isWithinRange(ord.createdAt, filter) && ord.status !== 'cancelled') {
        gmv += Number(ord.total) || 0;
        ordersCount++;

        if (ord.vendorOrders && ord.vendorOrders.length > 0) {
          for (const vo of ord.vendorOrders) {
            platformCommission += Number(vo.platformCommission) || 0;
          }
        } else {
          // Fallback if no sub-orders
          platformCommission += (Number(ord.total) || 0) * 0.1;
        }
      }
    }

    // 2. Subscription Revenue (only active verified/paid subscriptions)
    let subscriptionRevenue = 0;
    let activeSubscriptionsCount = 0;
    for (const sub of subs) {
      if (sub.status === 'ACTIVE') activeSubscriptionsCount++;
      if (
        sub.price > 0 &&
        sub.status === 'ACTIVE' &&
        isWithinRange(sub.createdAt || sub.startDate, filter)
      ) {
        subscriptionRevenue += Number(sub.price) || 0;
      }
    }

    // 3. Advertising Revenue (paid verified campaigns)
    let advertisingRevenue = 0;
    let activeCampaignsCount = 0;
    for (const c of campaigns) {
      if (c.status === 'ACTIVE') activeCampaignsCount++;
      if (
        c.paymentVerified &&
        (c.status === 'ACTIVE' || c.status === 'APPROVED' || c.status === 'EXPIRED') &&
        isWithinRange(c.createdAt, filter)
      ) {
        advertisingRevenue += Number(c.spent || c.budget) || 0;
      }
    }

    // 4. Promoted Products Revenue (approved/active paid promotions)
    let promotionRevenue = 0;
    for (const p of promos) {
      if (
        (p.status === 'ACTIVE' || p.status === 'APPROVED' || p.status === 'EXPIRED') &&
        isWithinRange(p.createdAt, filter)
      ) {
        promotionRevenue += Number(p.budget) || 0;
      }
    }

    // 5. Payouts disbursed
    let totalPayouts = 0;
    for (const po of payouts) {
      if (po.status === 'paid' && isWithinRange(po.processedAt || po.requestedAt, filter)) {
        totalPayouts += Number(po.amount) || 0;
      }
    }

    // 6. Refunds settled
    let totalRefunds = 0;
    for (const ref of refunds) {
      if (ref.status === 'REFUNDED' && isWithinRange(ref.processedAt || ref.createdAt, filter)) {
        totalRefunds += Number(ref.amount) || 0;
      }
    }

    // 7. Net Platform Revenue = Platform Commission + Subscriptions + Ads + Promos - (Refunds commission clawback ~10%)
    const refundsPlatformDeduction = totalRefunds * 0.1;
    const netPlatformRevenue = Math.max(
      0,
      platformCommission +
        subscriptionRevenue +
        advertisingRevenue +
        promotionRevenue -
        refundsPlatformDeduction
    );

    return {
      gmv: Number((Number(gmv) || 0).toFixed(2)),
      platformCommission: Number((Number(platformCommission) || 0).toFixed(2)),
      subscriptionRevenue: Number((Number(subscriptionRevenue) || 0).toFixed(2)),
      advertisingRevenue: Number((Number(advertisingRevenue) || 0).toFixed(2)),
      promotionRevenue: Number((Number(promotionRevenue) || 0).toFixed(2)),
      totalPayouts: Number((Number(totalPayouts) || 0).toFixed(2)),
      totalRefunds: Number((Number(totalRefunds) || 0).toFixed(2)),
      netPlatformRevenue: Number((Number(netPlatformRevenue) || 0).toFixed(2)),
      ordersCount,
      activeSubscriptionsCount,
      activeCampaignsCount,
    };
  },

  /**
   * Seller Financial Dashboard Statistics (Truthful & Deterministic)
   */
  getSellerFinancials(sellerId: string): {
    grossSales: number;
    platformCommission: number;
    discounts: number;
    refunds: number;
    netSales: number;
    pendingBalance: number;
    availableBalance: number;
    paidBalance: number;
  } {
    const orders: Order[] = orderService.getAllOrders();
    const payouts: PayoutRequest[] = payoutService.getPayoutRequestsBySeller(sellerId);
    const refunds = refundService.getRefundsBySeller(sellerId);

    let grossSales = 0;
    let platformCommission = 0;
    let discounts = 0;
    let pendingFulfillmentRevenue = 0;
    let deliveredRevenue = 0;

    for (const ord of orders) {
      if (ord.status === 'cancelled') continue;
      const sub = ord.vendorOrders?.find(v => v.sellerId === sellerId);
      if (sub) {
        grossSales += Number(sub.subtotal) || 0;
        platformCommission += Number(sub.platformCommission) || 0;
        discounts += Number(sub.discount) || 0;

        const isDelivered =
          sub.status === 'delivered' ||
          sub.status === 'completed' ||
          ord.status === 'delivered' ||
          ord.status === 'completed';

        if (isDelivered) {
          deliveredRevenue += Number(sub.sellerRevenue) || 0;
        } else {
          pendingFulfillmentRevenue += Number(sub.sellerRevenue) || 0;
        }
      }
    }

    let totalRefunds = 0;
    for (const r of refunds) {
      if (r.status === 'REFUNDED') {
        totalRefunds += Number(r.amount) || 0;
      }
    }

    let paidBalance = 0;
    for (const p of payouts) {
      if (p.status === 'paid') {
        paidBalance += Number(p.amount) || 0;
      }
    }

    const netSales = Math.max(0, grossSales - platformCommission - discounts - totalRefunds);
    const availableBalance = Math.max(0, deliveredRevenue - paidBalance - totalRefunds);

    return {
      grossSales: Number((Number(grossSales) || 0).toFixed(2)),
      platformCommission: Number((Number(platformCommission) || 0).toFixed(2)),
      discounts: Number((Number(discounts) || 0).toFixed(2)),
      refunds: Number((Number(totalRefunds) || 0).toFixed(2)),
      netSales: Number((Number(netSales) || 0).toFixed(2)),
      pendingBalance: Number((Number(pendingFulfillmentRevenue) || 0).toFixed(2)),
      availableBalance: Number((Number(availableBalance) || 0).toFixed(2)),
      paidBalance: Number((Number(paidBalance) || 0).toFixed(2)),
    };
  },
};
