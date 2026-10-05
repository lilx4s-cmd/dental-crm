'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useRef,
  ReactNode,
} from 'react';
import { useRouter, usePathname } from 'next/navigation';
import {
  apiRequest,
  clearCsrfToken,
  setCsrfToken,
  refreshAccessToken,
  cancelPendingRefresh,
} from '@/lib/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { PROTECTED_PATH_PREFIXES, matchesPrefix } from '@/lib/route-config';
import { safeReturnRoute } from '@/lib/return-route';
import { clearSessionCookies, setRememberSession, writeAccessCookie } from '@/lib/session-cookies';
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
  login: (email: string, password: string, remember?: boolean) => Promise<LoginResult>;
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
  const queryClient = useQueryClient();
  const lastAccess = useRef<string | null>(null);
  const sessionRevision = useRef(0);
  const beginSessionChange = useCallback(() => {
    sessionRevision.current += 1;
    cancelPendingRefresh();
    setReady(true);
    return sessionRevision.current;
  }, []);
  const pathname = usePathname();

  // Restore the session on load. The access token lives in a cookie that survives
  // refreshes, but the in-memory user state does not — without rehydrating it here,
  // a refresh would leave the user "logged in" (cookie present, middleware allows the
  // dashboard) yet with no user object, so the Topbar would hide the logout button and
  // strand the user with no way to sign out. Decoding the cookie restores `user` so the
  // UI matches the real auth state, with no dependency on the (cold-starting) API.
  useEffect(() => {
    let cancelled = false;
    const revision = sessionRevision.current;
    const isCurrent = () => !cancelled && revision === sessionRevision.current;
    const restore = async () => {
      let token = readCookie('access_token');
      let payload = token ? decodeJwt(token) : null;
      if (
        (!token && readCookie('csrf_token')) ||
        (token && (!payload || !payload.exp || payload.exp * 1000 <= Date.now()))
      ) {
        token = await refreshAccessToken();
        payload = token ? decodeJwt(token) : null;
      }
      if (!isCurrent()) return;
      if (token && payload) {
        const me = await apiRequest<JwtPayload>('/api/auth/me', {}, token).catch(() => null);
        if (!isCurrent()) return;
        if (me) {
          setUser(me);
          setAccessToken(readCookie('access_token') ?? token);
        } else {
          setUser(null);
          setAccessToken(null);
        }
      } else {
        document.cookie = 'access_token=; path=/; max-age=0';
      }
      setReady(true);
    };
    void restore();
    const refreshed = (event: Event) => {
      const revision = sessionRevision.current;
      const token = (event as CustomEvent<string>).detail;
      setAccessToken(token);
      void apiRequest<JwtPayload>('/api/auth/me', {}, token)
        .then((me) => {
          if (!cancelled && revision === sessionRevision.current) setUser(me);
        })
        .catch(() => {});
    };
    window.addEventListener('crm:session-refreshed', refreshed);
    return () => {
      cancelled = true;
      window.removeEventListener('crm:session-refreshed', refreshed);
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    const signature = JSON.stringify([user.sub, user.role, user.permissions]);
    if (lastAccess.current !== null && lastAccess.current !== signature) queryClient.clear();
    lastAccess.current = signature;
  }, [user, queryClient]);
  useEffect(() => {
    if (!accessToken) return;
    const revision = sessionRevision.current;
    let cancelled = false;
    const update = () => {
      void apiRequest<JwtPayload>('/api/auth/me', {}, accessToken)
        .then((me) => {
          if (!cancelled && revision === sessionRevision.current) setUser(me);
        })
        .catch(() => {});
    };
    const timer = setInterval(update, 45000);
    window.addEventListener('focus', update);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener('focus', update);
    };
  }, [accessToken]);

  // Client-side fallback for route protection, checked on every navigation.
  // middleware.ts is supposed to redirect unauthenticated requests away from
  // dashboard routes, but Vercel can serve a prerendered dashboard page straight
  // from its edge cache without re-invoking Edge Middleware, so a logged-out
  // visitor can land here with a 200 and no session. Catch that case here instead
  // of leaving them staring at an empty shell with every data fetch failing silently.
  useEffect(() => {
    if (!ready) return;
    if (pathname === '/login' && accessToken && user) {
      const from = new URLSearchParams(window.location.search).get('from');
      router.replace(safeReturnRoute(from, landingRoute(user.role)));
      return;
    }
    if (!matchesPrefix(pathname, PROTECTED_PATH_PREFIXES)) return;
    if (!accessToken || !user) {
      router.replace(`/login?from=${encodeURIComponent(pathname + window.location.search)}`);
    }
  }, [pathname, router, ready, accessToken, user]);

  const setAuth = useCallback(
    (u: JwtPayload, token: string) => {
      beginSessionChange();
      setUser(u);
      setAccessToken(token);
    },
    [beginSessionChange],
  );

  /** Everything that happens once a sign-in is genuinely finished, by either route. */
  const establishSession = useCallback(
    async (token: string, revision: number) => {
      const me = await apiRequest<JwtPayload>('/api/auth/me', {}, token);
      if (revision !== sessionRevision.current) return;
      setReady(true);
      setUser(me);
      setAccessToken(token);
      writeAccessCookie(token);
      // The dashboard is management's, so sending everyone there greeted half the clinic with a page
      // they are not allowed to load. Each role lands on the first page it can actually use.
      const from = new URLSearchParams(window.location.search).get('from');
      router.push(safeReturnRoute(from, landingRoute(me.role)));
    },
    [router],
  );

  /**
   * Returns a challenge instead of signing in when the account has 2FA on.
   *
   * The caller has to handle that branch — `isTwoFactorChallenge` makes ignoring it a type error
   * rather than a silent half-login.
   */
  const login = useCallback(
    async (email: string, password: string, remember = true): Promise<LoginResult> => {
      const revision = beginSessionChange();
      setRememberSession(remember);
      const result = await apiRequest<LoginResult>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      if (revision !== sessionRevision.current || isTwoFactorChallenge(result)) return result;
      // Paired with the httpOnly cookie the API just set; /auth/refresh needs both.
      setCsrfToken(result.csrfToken);
      await establishSession(result.accessToken, revision);
      return result;
    },
    [establishSession, beginSessionChange],
  );

  const completeTwoFactor = useCallback(
    async (challengeToken: string, code: string) => {
      const revision = beginSessionChange();
      const result = await apiRequest<AuthTokens>('/api/auth/login/2fa', {
        method: 'POST',
        body: JSON.stringify({ challengeToken, code }),
      });
      if (revision !== sessionRevision.current) return;
      setCsrfToken(result.csrfToken);
      await establishSession(result.accessToken, revision);
    },
    [establishSession, beginSessionChange],
  );

  const logout = useCallback(async () => {
    const revision = beginSessionChange();
    queryClient.clear();
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.getRegistration();
        const subscription = await registration?.pushManager.getSubscription();
        if (subscription) {
          await apiRequest(
            '/api/staff-alerts/devices',
            { method: 'DELETE', body: JSON.stringify({ endpoint: subscription.endpoint }) },
            accessToken ?? undefined,
          );
          await subscription.unsubscribe();
        }
      } catch {
        /* Logout remains available if browser push cleanup fails. */
      }
    }
    await apiRequest('/api/auth/logout', { method: 'POST' }, accessToken ?? undefined).catch(
      () => {},
    );
    if (revision !== sessionRevision.current) return;
    setUser(null);
    setAccessToken(null);
    clearSessionCookies();
    clearCsrfToken();
    router.push('/login');
  }, [accessToken, router, queryClient, beginSessionChange]);

  return (
    <AuthContext.Provider
      value={{ ready, user, accessToken, login, completeTwoFactor, logout, setAuth }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
