'use client';

import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { apiRequest, clearCsrfToken, setCsrfToken, refreshAccessToken } from '@/lib/api-client';
import { PROTECTED_PATH_PREFIXES, matchesPrefix } from '@/lib/route-config';
import {
  JwtPayload,
  AuthTokens,
  landingRoute,
  isTwoFactorChallenge,
  type LoginResult,
} from '@dental-crm/shared';

interface AuthContextValue {
  ready: boolean;
  user: JwtPayload | null;
  accessToken: string | null;
  login: (email: string, password: string) => Promise<LoginResult>;
  completeTwoFactor: (challengeToken: string, code: string) => Promise<void>;
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
  const [ready, setReady] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  // Restore the session on load. The access token lives in a cookie that survives
  // refreshes, but the in-memory user state does not — without rehydrating it here,
  // a refresh would leave the user "logged in" (cookie present, middleware allows the
  // dashboard) yet with no user object, so the Topbar would hide the logout button and
  // strand the user with no way to sign out. Decoding the cookie restores `user` so the
  // UI matches the real auth state, with no dependency on the (cold-starting) API.
  useEffect(() => {
    let cancelled = false;
    const restore = async () => {
      let token = readCookie('access_token');
      let payload = token ? decodeJwt(token) : null;
      if ((!token && readCookie('csrf_token')) || (token && (!payload || !payload.exp || payload.exp * 1000 <= Date.now()))) {
        token = await refreshAccessToken();
        payload = token ? decodeJwt(token) : null;
      }
      if (cancelled) return;
      if (token && payload) {
        setUser(payload);
        setAccessToken(token);
      } else {
        document.cookie = 'access_token=; path=/; max-age=0';
      }
      setReady(true);
    };
    void restore();
    const refreshed = (event: Event) => {
      const token = (event as CustomEvent<string>).detail;
      const payload = decodeJwt(token);
      if (payload) { setUser(payload); setAccessToken(token); }
    };
    window.addEventListener('crm:session-refreshed', refreshed);
    return () => { cancelled = true; window.removeEventListener('crm:session-refreshed', refreshed); };
  }, []);

  // Client-side fallback for route protection, checked on every navigation.
  // middleware.ts is supposed to redirect unauthenticated requests away from
  // dashboard routes, but Vercel can serve a prerendered dashboard page straight
  // from its edge cache without re-invoking Edge Middleware, so a logged-out
  // visitor can land here with a 200 and no session. Catch that case here instead
  // of leaving them staring at an empty shell with every data fetch failing silently.
  useEffect(() => {
    if (!ready) return;
    if (!matchesPrefix(pathname, PROTECTED_PATH_PREFIXES)) return;
    if (!accessToken || !user) {
      router.replace(`/login?from=${encodeURIComponent(pathname)}`);
    }
  }, [pathname, router, ready, accessToken, user]);

  const setAuth = useCallback((u: JwtPayload, token: string) => {
    setUser(u);
    setAccessToken(token);
  }, []);

  /** Everything that happens once a sign-in is genuinely finished, by either route. */
  const establishSession = useCallback(async (token: string) => {
    const me = await apiRequest<JwtPayload>('/api/auth/me', {}, token);
    setUser(me);
    setAccessToken(token);
    document.cookie = `access_token=${token}; path=/; SameSite=Strict${location.protocol === 'https:' ? '; Secure' : ''}`;
    // The dashboard is management's, so sending everyone there greeted half the clinic with a page
    // they are not allowed to load. Each role lands on the first page it can actually use.
    router.push(landingRoute(me.role));
  }, [router]);

  /**
   * Returns a challenge instead of signing in when the account has 2FA on.
   *
   * The caller has to handle that branch — `isTwoFactorChallenge` makes ignoring it a type error
   * rather than a silent half-login.
   */
  const login = useCallback(async (email: string, password: string): Promise<LoginResult> => {
    const result = await apiRequest<LoginResult>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    if (isTwoFactorChallenge(result)) return result;
    // Paired with the httpOnly cookie the API just set; /auth/refresh needs both.
    setCsrfToken(result.csrfToken);
    await establishSession(result.accessToken);
    return result;
  }, [establishSession]);

  const completeTwoFactor = useCallback(async (challengeToken: string, code: string) => {
    const result = await apiRequest<AuthTokens>('/api/auth/login/2fa', {
      method: 'POST',
      body: JSON.stringify({ challengeToken, code }),
    });
    setCsrfToken(result.csrfToken);
    await establishSession(result.accessToken);
  }, [establishSession]);

  const logout = useCallback(async () => {
    await apiRequest('/api/auth/logout', { method: 'POST' }, accessToken ?? undefined).catch(() => {});
    setUser(null);
    setAccessToken(null);
    document.cookie = 'access_token=; path=/; max-age=0';
    clearCsrfToken();
    router.push('/login');
  }, [accessToken, router]);

  return (
    <AuthContext.Provider value={{ ready, user, accessToken, login, completeTwoFactor, logout, setAuth }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
