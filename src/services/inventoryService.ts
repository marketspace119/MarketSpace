import { doc, Transaction } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { productService } from './productService';

export interface InventoryAuditMetadata {
  orderId: string;
  customerId: string;
  timestamp: string;
  reason?: string;
}

export const inventoryService = {
  /**
   * Dedicated atomic inventory decrement for orders.
   * Can be executed inside a Firestore transaction.
   */
  async decrementStockInTransaction(
    transaction: Transaction,
    productId: string,
    quantity: number,
    auditMetadata: InventoryAuditMetadata
  ): Promise<{ previousStock: number; newStock: number }> {
    const safeQty = Math.max(1, Math.min(999, Math.floor(quantity)));
    const productRef = doc(db, 'products', productId);
    const snap = await transaction.get(productRef);

    if (!snap.exists()) {
      throw new Error(`Product with ID "${productId}" not found in inventory.`);
    }

    const data = snap.data();
    const currentStock = typeof data.stock === 'number' ? data.stock : 0;

    if (currentStock < safeQty) {
      throw new Error(`Insufficient stock for "${data.slug || productId}". Available: ${currentStock}, Requested: ${safeQty}`);
    }

    const newStock = Math.max(0, currentStock - safeQty);
    const now = new Date().toISOString();

    transaction.update(productRef, {
      stock: newStock,
      updatedAt: now,
      lastInventoryAudit: {
        orderId: auditMetadata.orderId,
        action: 'DECREMENT',
        quantity: safeQty,
        previousStock: currentStock,
        newStock,
        timestamp: now,
      },
    });

    return { previousStock: currentStock, newStock };
  },

  /**
   * Fallback local memory & cache inventory decrement with safety bounds
   */
  decrementLocalStock(productId: string, quantity: number): number {
    const safeQty = Math.max(1, Math.min(999, Math.floor(quantity)));
    const product = productService.getProductById(productId);
    if (!product) throw new Error(`Product "${productId}" not found`);
    const current = product.stock ?? 0;
    if (current < safeQty) {
      throw new Error(`Insufficient stock for "${product.slug}". Available: ${current}, Requested: ${safeQty}`);
    }
    const next = Math.max(0, current - safeQty);
    productService.updateLocalStockOnly(productId, next);
    return next;
  },

  /**
   * Restores product stock upon order cancellation or item return.
   */
  async restoreStockOnCancellation(
    productId: string,
    quantity: number,
    auditMetadata: InventoryAuditMetadata
  ): Promise<{ previousStock: number; newStock: number }> {
    const safeQty = Math.max(1, Math.min(999, Math.floor(quantity)));
    const product = productService.getProductById(productId);
    const currentStock = product?.stock ?? 0;
    const newStock = currentStock + safeQty;

    // Update local memory and cache
    productService.updateLocalStockOnly(productId, newStock);

    // Persist to Cloud Firestore with inventory audit metadata
    const now = new Date().toISOString();
    const productRef = doc(db, 'products', productId);
    updateDoc(productRef, {
      stock: newStock,
      updatedAt: now,
      lastInventoryAudit: {
        orderId: auditMetadata.orderId,
        action: 'RESTORE_CANCELLED',
        quantity: safeQty,
        previousStock: currentStock,
        newStock,
        timestamp: now,
        reason: auditMetadata.reason || 'Order cancelled',
      },
    }).catch(err => {
      console.warn(`[InventoryService] Firestore stock restore warning for ${productId}:`, err);
    });

    return { previousStock: currentStock, newStock };
  },

  /**
   * Atomic inventory stock increment inside a transaction.
   */
  async incrementStockInTransaction(
    transaction: Transaction,
    productId: string,
    quantity: number,
    auditMetadata: InventoryAuditMetadata
  ): Promise<{ previousStock: number; newStock: number }> {
    const safeQty = Math.max(1, Math.min(999, Math.floor(quantity)));
    const productRef = doc(db, 'products', productId);
    const snap = await transaction.get(productRef);

    if (!snap.exists()) {
      throw new Error(`Product with ID "${productId}" not found in inventory.`);
    }

    const data = snap.data();
    const currentStock = typeof data.stock === 'number' ? data.stock : 0;
    const newStock = currentStock + safeQty;
    const now = new Date().toISOString();

    transaction.update(productRef, {
      stock: newStock,
      updatedAt: now,
      lastInventoryAudit: {
        orderId: auditMetadata.orderId,
        action: 'RESTORE_CANCELLED',
        quantity: safeQty,
        previousStock: currentStock,
        newStock,
        timestamp: now,
        reason: auditMetadata.reason || 'Sub-order cancelled',
      },
    });

    return { previousStock: currentStock, newStock };
  },
};
