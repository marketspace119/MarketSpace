import { useState, useEffect } from 'react';
import { Product } from '../types';
import { productService } from '../services/productService';

export function useCatalog(filters?: {
  sellerId?: string;
  storeId?: string;
  type?: string;
  category?: string;
  onlyPublished?: boolean;
  status?: 'approved' | 'pending' | 'rejected' | 'hidden';
}) {
  const [products, setProducts] = useState<Product[]>(() =>
    productService.getAllProducts(filters)
  );
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // Initial fetch
    setProducts(productService.getAllProducts(filters));

    // Subscribe to catalog changes
    const unsubscribe = productService.subscribe(() => {
      setProducts(productService.getAllProducts(filters));
    });

    return () => {
      unsubscribe();
    };
  }, [
    filters?.sellerId,
    filters?.storeId,
    filters?.type,
    filters?.category,
    filters?.onlyPublished,
    filters?.status,
  ]);

  return { products, isLoading };
}
