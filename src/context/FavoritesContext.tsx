import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { useAuth } from './AuthContext';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

interface FavoritesContextType {
  favorites: string[];
  isFavorite: (productId: string) => boolean;
  toggleFavorite: (productId: string) => void;
  removeFavorite: (productId: string) => void;
  clearFavorites: () => void;
  favoritesCount: number;
}

const FavoritesContext = createContext<FavoritesContextType | undefined>(undefined);

const STORAGE_KEY = 'marketspace_favorites';

export const FavoritesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const currentUserId = user?.id || (user as any)?.uid || null;
  const prevUserIdRef = useRef<string | null>(null);

  const [favorites, setFavorites] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Sync with Firestore when user logs in / changes
  useEffect(() => {
    let isCancelled = false;

    if (currentUserId) {
      // User logged in: Load authoritative favorites from Firestore
      getDoc(doc(db, 'userFavorites', currentUserId))
        .then(snap => {
          if (isCancelled) return;
          if (snap.exists()) {
            const data = snap.data();
            const serverFavorites = Array.isArray(data?.productIds) ? data.productIds : [];
            // Merge with any guest favorites
            setFavorites(prev => {
              const combined = Array.from(new Set([...serverFavorites, ...prev]));
              try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(combined));
              } catch {}
              return combined;
            });
          } else {
            // First time: persist existing local favorites to Firestore
            setFavorites(prev => {
              if (prev.length > 0) {
                setDoc(doc(db, 'userFavorites', currentUserId), {
                  userId: currentUserId,
                  productIds: prev,
                  updatedAt: new Date().toISOString(),
                }).catch(() => {});
              }
              return prev;
            });
          }
        })
        .catch(err => {
          console.warn('[FavoritesContext] Offline or Firestore read error:', err.message);
        });
    } else if (prevUserIdRef.current && !currentUserId) {
      // User logged out: clear state to prevent cross-account leakage
      setFavorites([]);
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {}
    }

    prevUserIdRef.current = currentUserId;
    return () => {
      isCancelled = true;
    };
  }, [currentUserId]);

  const persistFavorites = (newFavorites: string[]) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newFavorites));
    } catch (e) {
      console.error('Failed to persist favorites to storage', e);
    }

    // Authoritative Cloud Firestore persistence for logged-in accounts
    if (currentUserId) {
      setDoc(doc(db, 'userFavorites', currentUserId), {
        userId: currentUserId,
        productIds: newFavorites,
        updatedAt: new Date().toISOString(),
      }).catch(err => {
        console.warn('[FavoritesContext] Failed to persist to Firestore:', err.message);
      });
    }
  };

  const isFavorite = (productId: string): boolean => {
    return favorites.includes(productId);
  };

  const toggleFavorite = (productId: string) => {
    setFavorites(prev => {
      const next = prev.includes(productId) ? prev.filter(id => id !== productId) : [...prev, productId];
      persistFavorites(next);
      return next;
    });
  };

  const removeFavorite = (productId: string) => {
    setFavorites(prev => {
      const next = prev.filter(id => id !== productId);
      persistFavorites(next);
      return next;
    });
  };

  const clearFavorites = () => {
    setFavorites([]);
    persistFavorites([]);
  };

  return (
    <FavoritesContext.Provider
      value={{
        favorites,
        isFavorite,
        toggleFavorite,
        removeFavorite,
        clearFavorites,
        favoritesCount: favorites.length,
      }}
    >
      {children}
    </FavoritesContext.Provider>
  );
};

export const useFavorites = (): FavoritesContextType => {
  const context = useContext(FavoritesContext);
  if (!context) {
    throw new Error('useFavorites must be used within a FavoritesProvider');
  }
  return context;
};
