import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { CartItem, Product, ProductAddon } from '../types';
import { pricingService, UnifiedOrderPricing } from '../services/pricingService';

interface CartContextType {
  items: CartItem[];
  addItem: (
    product: Product,
    quantity?: number,
    selectedColor?: string,
    selectedSize?: string,
    selectedAddons?: ProductAddon[],
    notes?: string
  ) => void;
  removeItem: (cartItemId: string) => void;
  updateQuantity: (cartItemId: string, quantity: number) => void;
  clearCart: () => void;
  totalItems: number;
  subtotal: number;
  shipping: number;
  tax: number;
  discount: number;
  grandTotal: number;
  appliedCoupon: string | null;
  setAppliedCoupon: (code: string | null) => void;
  pricingDetails: UnifiedOrderPricing;
  isCartOpen: boolean;
  setIsCartOpen: (open: boolean) => void;
  openCart: () => void;
  closeCart: () => void;
  lastAddedItem: CartItem | null;
  pauseCartTimer: () => void;
  resumeCartTimer: () => void;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

const STORAGE_KEY = 'marketspace_cart';
const AUTO_CLOSE_DELAY_MS = 3500;

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<CartItem[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [isCartOpen, setIsCartOpenState] = useState<boolean>(false);
  const [lastAddedItem, setLastAddedItem] = useState<CartItem | null>(null);
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null);

  const autoCloseTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isHoveredRef = useRef<boolean>(false);

  // Clear any existing timer
  const clearTimer = useCallback(() => {
    if (autoCloseTimerRef.current) {
      clearTimeout(autoCloseTimerRef.current);
      autoCloseTimerRef.current = null;
    }
  }, []);

  const closeCart = useCallback(() => {
    clearTimer();
    setIsCartOpenState(false);
  }, [clearTimer]);

  const startAutoCloseTimer = useCallback(() => {
    clearTimer();
    if (isHoveredRef.current) return;
    autoCloseTimerRef.current = setTimeout(() => {
      if (!isHoveredRef.current) {
        setIsCartOpenState(false);
      }
    }, AUTO_CLOSE_DELAY_MS);
  }, [clearTimer]);

  const setIsCartOpen = useCallback((open: boolean) => {
    if (open) {
      setIsCartOpenState(true);
      startAutoCloseTimer();
    } else {
      closeCart();
    }
  }, [closeCart, startAutoCloseTimer]);

  const openCart = useCallback(() => {
    setIsCartOpen(true);
  }, [setIsCartOpen]);

  const pauseCartTimer = useCallback(() => {
    isHoveredRef.current = true;
    clearTimer();
  }, [clearTimer]);

  const resumeCartTimer = useCallback(() => {
    isHoveredRef.current = false;
    startAutoCloseTimer();
  }, [startAutoCloseTimer]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => clearTimer();
  }, [clearTimer]);

  // Persist cart to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch (e) {
      console.error('Failed to save cart to localStorage', e);
    }
  }, [items]);

  const generateItemId = (
    productId: string,
    color?: string,
    size?: string,
    addons?: ProductAddon[]
  ): string => {
    const addonsKey = addons && addons.length > 0 ? addons.map(a => a.id).sort().join('-') : 'noaddons';
    return `${productId}_${color || 'def'}_${size || 'def'}_${addonsKey}`;
  };

  const addItem = (
    product: Product,
    quantity = 1,
    selectedColor?: string,
    selectedSize?: string,
    selectedAddons?: ProductAddon[],
    notes?: string
  ) => {
    const safeQty = Math.max(1, Math.min(999, Math.floor(quantity)));
    const id = generateItemId(product.id, selectedColor, selectedSize, selectedAddons);

    const newItem: CartItem = {
      id,
      product,
      quantity: safeQty,
      selectedColor,
      selectedSize,
      selectedAddons,
      customerNotes: notes,
      storeId: product.storeId || 'store_cosmetics_01',
      sellerId: product.sellerId || 'user_seller_01',
    };

    setItems(prev => {
      const existingIndex = prev.findIndex(item => item.id === id);
      if (existingIndex !== -1) {
        const updated = [...prev];
        updated[existingIndex] = {
          ...updated[existingIndex],
          quantity: Math.min(999, updated[existingIndex].quantity + safeQty),
        };
        return updated;
      }
      return [...prev, newItem];
    });

    setLastAddedItem(newItem);

    // Auto-open top cart dropdown with auto-close timer
    setIsCartOpenState(true);
    startAutoCloseTimer();
  };

  const removeItem = (cartItemId: string) => {
    setItems(prev => prev.filter(item => item.id !== cartItemId));
  };

  const updateQuantity = (cartItemId: string, quantity: number) => {
    if (quantity <= 0) {
      removeItem(cartItemId);
      return;
    }
    const safeQty = Math.min(999, Math.floor(quantity));
    setItems(prev =>
      prev.map(item => (item.id === cartItemId ? { ...item, quantity: safeQty } : item))
    );
  };

  const clearCart = () => {
    setItems([]);
    setLastAddedItem(null);
  };

  // Authoritative, unified pricing calculation across all marketplace stores
  const pricingDetails = pricingService.calculateCartTotals(items, appliedCoupon || undefined);

  return (
    <CartContext.Provider
      value={{
        items,
        addItem,
        removeItem,
        updateQuantity,
        clearCart,
        totalItems: pricingDetails.totalItems,
        subtotal: pricingDetails.subtotal,
        shipping: pricingDetails.shipping,
        tax: pricingDetails.tax,
        discount: pricingDetails.discount,
        grandTotal: pricingDetails.grandTotal,
        appliedCoupon,
        setAppliedCoupon,
        pricingDetails,
        isCartOpen,
        setIsCartOpen,
        openCart,
        closeCart,
        lastAddedItem,
        pauseCartTimer,
        resumeCartTimer,
      }}
    >
      {children}
    </CartContext.Provider>
  );
};

export const useCart = (): CartContextType => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
};
