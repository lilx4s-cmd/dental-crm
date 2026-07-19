'use client';

import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { apiRequest } from '@/lib/api-client';
import { PROTECTED_PATH_PREFIXES, matchesPrefix } from '@/lib/route-config';
import { JwtPayload, AuthTokens } from '@dental-crm/shared';

interface AuthContextValue {
  user: JwtPayload | null;
  accessToken: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setAuth: (user: JwtPayload, token: string) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Read a browser cookie by name (client-side only).
function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
}

// Decode a JWT payload without verifying the signature (safe here: the API is the
// source of truth; this only drives client UI state such as showing the user menu).
function decodeJwt(token: string): JwtPayload | null {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join(''),
    );
    return JSON.parse(json) as JwtPayload;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<JwtPayload | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  // Restore the session on load. The access token lives in a cookie that survives
  // refreshes, but the in-memory user state does not — without rehydrating it here,
  // a refresh would leave the user "logged in" (cookie present, middleware allows the
  // dashboard) yet with no user object, so the Topbar would hide the logout button and
  // strand the user with no way to sign out. Decoding the cookie restores `user` so the
  // UI matches the real auth state, with no dependency on the (cold-starting) API.
  useEffect(() => {
    const token = readCookie('access_token');
    if (!token) return;
    const payload = decodeJwt(token);
    if (payload && (!payload.exp || payload.exp * 1000 > Date.now())) {
      setUser(payload);
      setAccessToken(token);
    } else {
      // Expired or malformed cookie: clear it so the login page is reachable again
      // (middleware redirects authenticated users away from /login).
      document.cookie = 'access_token=; path=/; max-age=0';
    }
  }, []);

  // Client-side fallback for route protection, checked on every navigation.
  // middleware.ts is supposed to redirect unauthenticated requests away from
  // dashboard routes, but Vercel can serve a prerendered dashboard page straight
  // from its edge cache without re-invoking Edge Middleware, so a logged-out
  // visitor can land here with a 200 and no session. Catch that case here instead
  // of leaving them staring at an empty shell with every data fetch failing silently.
  useEffect(() => {
    if (!matchesPrefix(pathname, PROTECTED_PATH_PREFIXES)) return;
    const token = readCookie('access_token');
    const payload = token ? decodeJwt(token) : null;
    const valid = !!payload && (!payload.exp || payload.exp * 1000 > Date.now());
    if (!valid) {
      router.replace(`/login?from=${encodeURIComponent(pathname)}`);
    }
  }, [pathname, router]);

  const setAuth = useCallback((u: JwtPayload, token: string) => {
    setUser(u);
    setAccessToken(token);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { accessToken: token } = await apiRequest<AuthTokens>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    const me = await apiRequest<JwtPayload>('/api/auth/me', {}, token);
    setUser(me);
    setAccessToken(token);
    document.cookie = `access_token=${token}; path=/; SameSite=Strict`;
    router.push('/dashboard');
  }, [router]);

  const logout = useCallback(async () => {
    await apiRequest('/api/auth/logout', { method: 'POST' }, accessToken ?? undefined).catch(() => {});
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
