// SlotSync Frontend Auth Context
// Manages authenticated owner/staff session, business profile, and onboarding state

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { apiClient } from '../lib/apiClient';

export interface UserSession {
  id: string;
  email: string;
}

export interface BusinessSession {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  onboarding_step: number;
  published: number;
  is_demo: number;
}

export interface AuthContextValue {
  user: UserSession | null;
  business: BusinessSession | null;
  role: 'owner' | 'staff' | null;
  isLoading: boolean;
  refreshSession: () => Promise<void>;
  logout: () => Promise<void>;
  updateBusinessLocally: (updates: Partial<BusinessSession>) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserSession | null>(null);
  const [business, setBusiness] = useState<BusinessSession | null>(null);
  const [role, setRole] = useState<'owner' | 'staff' | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshSession = useCallback(async () => {
    try {
      const res = await apiClient.get<{
        user: UserSession;
        business: BusinessSession;
        role: 'owner' | 'staff';
      }>('/api/auth/me');

      if (res.data) {
        setUser(res.data.user);
        setBusiness(res.data.business);
        setRole(res.data.role);
      } else {
        setUser(null);
        setBusiness(null);
        setRole(null);
      }
    } catch {
      setUser(null);
      setBusiness(null);
      setRole(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  const logout = async () => {
    try {
      await apiClient.post('/api/auth/logout', {});
    } finally {
      setUser(null);
      setBusiness(null);
      setRole(null);
      window.location.href = '/login';
    }
  };

  const updateBusinessLocally = (updates: Partial<BusinessSession>) => {
    setBusiness((prev) => (prev ? { ...prev, ...updates } : null));
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        business,
        role,
        isLoading,
        refreshSession,
        logout,
        updateBusinessLocally,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
