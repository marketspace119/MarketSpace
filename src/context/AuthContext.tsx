import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User as FirebaseUser,
} from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { User, UserRole } from '../types';
import { orderService } from '../services/orderService';
import { addressService } from '../services/addressService';
import { notificationService } from '../services/notificationService';
import { messagingService } from '../services/messagingService';

interface AuthContextType {
  user: User | null;
  firebaseUser: FirebaseUser | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password?: string) => Promise<boolean>;
  register: (data: { name: string; email: string; password?: string; phone?: string; role?: UserRole }) => Promise<User>;
  logout: () => Promise<void>;
  updateUser: (updates: Partial<User>) => Promise<void>;
  switchDemoRole: (role: UserRole) => void;
  hasRole: (roles: UserRole | UserRole[]) => boolean;
}

const AUTH_USER_KEY = 'marketspace_auth_user_v1';

export const DEMO_ACCOUNTS: Record<UserRole, User> = {
  CUSTOMER: {
    id: 'user_customer_01',
    name: 'Ahmed Noor',
    email: 'customer@marketspace.so',
    phone: '+252 612 1100 22',
    role: 'CUSTOMER',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80',
    createdAt: '2025-01-01T00:00:00Z',
  },
  SELLER: {
    id: 'user_seller_01',
    name: 'Mustafa Cosmetics',
    email: 'seller@marketspace.so',
    phone: '+252 612 4949 52',
    role: 'SELLER',
    storeId: 'store_cosmetics_01',
    sellerType: 'store',
    sellerStatus: 'approved',
    isVerified: true,
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&q=80',
    createdAt: '2025-01-15T00:00:00Z',
  },
  RESTAURANT: {
    id: 'user_restaurant_01',
    name: 'Chef Sultan',
    email: 'restaurant@marketspace.so',
    phone: '+252 612 1122 33',
    role: 'RESTAURANT',
    storeId: 'store_restaurant_01',
    sellerType: 'restaurant',
    sellerStatus: 'approved',
    isVerified: true,
    avatar: 'https://images.unsplash.com/photo-1577219491135-ce391730fb2c?auto=format&fit=crop&w=150&q=80',
    createdAt: '2025-01-10T00:00:00Z',
  },
  SERVICE_PROVIDER: {
    id: 'user_service_01',
    name: 'Eng. Hassan Tech',
    email: 'service@marketspace.so',
    phone: '+252 617 3344 55',
    role: 'SERVICE_PROVIDER',
    storeId: 'store_service_01',
    sellerType: 'service',
    sellerStatus: 'approved',
    isVerified: true,
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=150&q=80',
    createdAt: '2025-02-15T00:00:00Z',
  },
  ADMIN: {
    id: 'user_admin_01',
    name: 'MarketSpace Manager',
    email: 'admin@marketspace.so',
    phone: '+252 612 4949 53',
    role: 'ADMIN',
    avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=150&q=80',
    createdAt: '2025-01-01T00:00:00Z',
  },
  SUPER_ADMIN: {
    id: 'user_superadmin_01',
    name: 'MarketSpace Super Admin',
    email: 'superadmin@marketspace.so',
    phone: '+252 612 4949 00',
    role: 'SUPER_ADMIN',
    avatar: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=150&q=80',
    createdAt: '2025-01-01T00:00:00Z',
  },
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [user, setUser] = useState<User | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const stored = localStorage.getItem(AUTH_USER_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Synchronize state with Firebase Auth state listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser);
      if (fbUser) {
        const idToken = await fbUser.getIdToken();
        setToken(idToken);

        // Fetch user profile from Firestore users collection
        try {
          const userDocRef = doc(db, 'users', fbUser.uid);
          const userDocSnap = await getDoc(userDocRef);

          // Check admin collection
          const adminDocRef = doc(db, 'admins', fbUser.uid);
          const adminDocSnap = await getDoc(adminDocRef);

          if (userDocSnap.exists()) {
            const data = userDocSnap.data() as User;
            // Elevate if present in admin collection or platform owner email (STRICT REQUIREMENT: email_verified === true)
            let effectiveRole = data.role;
            const isVerifiedOwner = fbUser.emailVerified === true &&
              (fbUser.email === 'spacecompanies119@gmail.com' || fbUser.email === 'marketspace119@gmail.com');
            if (adminDocSnap.exists() || isVerifiedOwner) {
              effectiveRole = 'SUPER_ADMIN';
            }
            const updatedUser: User = {
              ...data,
              id: fbUser.uid,
              email: fbUser.email || data.email,
              name: fbUser.displayName || data.name,
              avatar: fbUser.photoURL || data.avatar,
              role: effectiveRole,
            };
            setUser(updatedUser);
            localStorage.setItem(AUTH_USER_KEY, JSON.stringify(updatedUser));
          } else {
            // Initial user record creation in Firestore
            let initialRole: UserRole = 'CUSTOMER';
            const isVerifiedOwner = fbUser.emailVerified === true &&
              (fbUser.email === 'spacecompanies119@gmail.com' || fbUser.email === 'marketspace119@gmail.com');
            if (adminDocSnap.exists() || isVerifiedOwner) {
              initialRole = 'SUPER_ADMIN';
            }
            const newUser: User = {
              id: fbUser.uid,
              email: fbUser.email || '',
              name: fbUser.displayName || fbUser.email?.split('@')[0] || 'User',
              role: initialRole,
              avatar: fbUser.photoURL || undefined,
              createdAt: new Date().toISOString(),
            };
            await setDoc(userDocRef, newUser);
            setUser(newUser);
            localStorage.setItem(AUTH_USER_KEY, JSON.stringify(newUser));
          }
        } catch (err) {
          console.warn('Firestore user fetch failed, keeping local user state:', err);
        }
      } else {
        // If not authenticated in Firebase, keep user if it was a demo switch, otherwise clear
        const stored = localStorage.getItem(AUTH_USER_KEY);
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            if (!parsed.id?.startsWith('usr_') && !Object.values(DEMO_ACCOUNTS).some(d => d.id === parsed.id)) {
              setUser(null);
              setToken(null);
              localStorage.removeItem(AUTH_USER_KEY);
            }
          } catch {
            setUser(null);
          }
        }
      }
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const login = async (email: string, password?: string): Promise<boolean> => {
    const isProd = (import.meta as unknown as { env?: { PROD?: boolean } }).env?.PROD;

    // 1. If password is provided, authenticate against Firebase Auth
    if (password && password.length >= 6) {
      try {
        const userCredential = await signInWithEmailAndPassword(auth, email.trim(), password);
        const fbUser = userCredential.user;
        const idToken = await fbUser.getIdToken();
        setToken(idToken);
        return true;
      } catch (err: any) {
        console.error('Firebase Auth sign-in error:', err.message);
        const isDemo = Object.values(DEMO_ACCOUNTS).some(d => d.email.toLowerCase() === email.trim().toLowerCase());
        if (isProd || !isDemo) {
          throw new Error(err.message || 'Invalid credentials');
        }
      }
    }

    // 2. In production, never permit password-less or fallback demo logins
    if (isProd) {
      throw new Error('Direct password authentication required in production');
    }

    // 3. Demo accounts support for development sandbox only
    const matchedRole = Object.keys(DEMO_ACCOUNTS).find(
      r => DEMO_ACCOUNTS[r as UserRole].email.toLowerCase() === email.toLowerCase()
    );

    if (matchedRole) {
      const demoUser = DEMO_ACCOUNTS[matchedRole as UserRole];
      setUser(demoUser);
      setToken(`demo_token_${demoUser.id}_${Date.now()}`);
      localStorage.setItem(AUTH_USER_KEY, JSON.stringify(demoUser));
      return true;
    }

    // 4. Fallback standard customer login in dev sandbox only
    const fallbackUser: User = {
      id: `usr_${Date.now()}`,
      name: email.split('@')[0],
      email,
      role: 'CUSTOMER',
      createdAt: new Date().toISOString(),
    };
    setUser(fallbackUser);
    setToken(`token_${fallbackUser.id}`);
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(fallbackUser));
    return true;
  };

  const register = async (data: {
    name: string;
    email: string;
    password?: string;
    phone?: string;
    role?: UserRole;
  }): Promise<User> => {
    // Strict Zero-Trust on registration: Public registration ALWAYS defaults to CUSTOMER
    // Nobody can self-assign ADMIN or SUPER_ADMIN
    const safeRole: UserRole = 'CUSTOMER';
    const isProd = (import.meta as unknown as { env?: { PROD?: boolean } }).env?.PROD;

    let fbUid: string | null = null;
    if (data.password && data.password.length >= 6) {
      try {
        const userCredential = await createUserWithEmailAndPassword(auth, data.email.trim(), data.password);
        fbUid = userCredential.user.uid;
      } catch (err: any) {
        console.warn('Firebase Auth registration note:', err.message);
        if (isProd || err.code === 'auth/email-already-in-use') {
          throw new Error(err.message || 'Registration failed');
        }
      }
    }

    const userId = fbUid || `usr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const newUser: User = {
      id: userId,
      name: data.name.trim(),
      email: data.email.trim(),
      phone: data.phone?.trim(),
      role: safeRole,
      createdAt: new Date().toISOString(),
    };

    setUser(newUser);
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(newUser));

    // Persist to Cloud Firestore users collection
    setDoc(doc(db, 'users', userId), newUser).catch(err => {
      console.warn('Could not write new user to Firestore immediately:', err);
    });

    return newUser;
  };

  const logout = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.warn('Signout error:', err);
    }
    setUser(null);
    setToken(null);
    localStorage.removeItem(AUTH_USER_KEY);
    // Purge user-isolated data caches on logout
    orderService.clearUserCache();
    addressService.clearUserCache();
    notificationService.clearUserCache();
    messagingService.clearUserCache();
  };

  const updateUser = async (updates: Partial<User>) => {
    setUser(prev => {
      if (!prev) return null;
      // Strip sensitive security fields from self-service client updates
      const safe = { ...updates };
      delete safe.id;
      delete safe.role; // Role mutations cannot occur via client profile updater
      delete safe.isVerified;
      delete safe.sellerStatus;
      const updated = { ...prev, ...safe };
      localStorage.setItem(AUTH_USER_KEY, JSON.stringify(updated));

      // Persist to Cloud Firestore
      if (prev.id) {
        updateDoc(doc(db, 'users', prev.id), safe).catch(err => {
          console.warn('Could not update Firestore user document:', err);
        });
      }

      return updated;
    });
  };

  const switchDemoRole = (role: UserRole) => {
    // Purge previous user caches before switching identities
    orderService.clearUserCache();
    addressService.clearUserCache();

    const targetUser = DEMO_ACCOUNTS[role];
    setUser(targetUser);
    setToken(`demo_token_${targetUser.id}_${Date.now()}`);
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(targetUser));
  };

  const hasRole = (roles: UserRole | UserRole[]): boolean => {
    if (!user) return false;
    const isProd = (import.meta as unknown as { env?: { PROD?: boolean } }).env?.PROD;
    const targetRoles = Array.isArray(roles) ? roles : [roles];
    const requiresAdmin = targetRoles.includes('ADMIN') || targetRoles.includes('SUPER_ADMIN');

    // In production, admin privileges strictly require an authenticated Firebase user
    if (requiresAdmin && isProd && !firebaseUser) {
      return false;
    }

    if (user.role === 'SUPER_ADMIN') return true;
    return targetRoles.includes(user.role);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        firebaseUser,
        token,
        isAuthenticated: !!user,
        isLoading,
        login,
        register,
        logout,
        updateUser,
        switchDemoRole,
        hasRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
