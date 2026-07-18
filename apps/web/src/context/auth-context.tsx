'use client';

import { createContext, useCallback, useContext, useState, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { apiRequest } from '@/lib/api-client';
import { JwtPayload, AuthTokens } from '@dental-crm/shared';

interface AuthContextValue {
  user: JwtPayload | null;
  accessToken: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setAuth: (user: JwtPayload, token: string) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<JwtPayload | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const router = useRouter();

  const setAuth = useCallback((u: JwtPayload, token: string) => {
    setUser(u);
    setAccessToken(token);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { accessToken: token } = await apiRequest<AuthTokens>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    const me = await apiRequest<JwtPayload>('/auth/me', {}, token);
    setUser(me);
    setAccessToken(token);
    document.cookie = `access_token=${token}; path=/; SameSite=Strict`;
    router.push('/dashboard');
  }, [router]);

  const logout = useCallback(async () => {
    await apiRequest('/auth/logout', { method: 'POST' }, accessToken ?? undefined).catch(() => {});
    setUser(null);
    setAccessToken(null);
    document.cookie = 'access_token=; path=/; max-age=0';
    router.push('/login');
  }, [accessToken, router]);

  return (
    <AuthContext.Provider value={{ user, accessToken, login, logout, setAuth }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
