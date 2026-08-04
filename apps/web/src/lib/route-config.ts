// Single source of truth for which paths require a logged-in session.
//
// Two independent gates read this list:
//  - middleware.ts: redirects server-side, before the page is served.
//  - auth-context.tsx: redirects client-side, after mount.
//
// Both are necessary. Vercel can serve a prerendered dashboard page straight from
// its edge cache (X-Vercel-Cache: HIT) without re-invoking Edge Middleware, so an
// unauthenticated request can get a 200 with the page shell instead of a redirect.
// The client-side check in auth-context.tsx is the fallback that catches that case
// once the page hydrates. Keep any new dashboard route in this one array so neither
// gate can drift out of sync with the other.
// Account recovery belongs here for the same reason /login does: anyone on these pages is by
// definition not signed in, so any gate reading this list has to let them through.
//
// Worth knowing: this array currently has no consumers. The middleware.ts described above is not
// in the tree, so the client-side check is doing the whole job on its own. Kept accurate rather
// than deleted — a stale allowlist reconnected later is exactly how a recovery page ends up
// redirecting the one person who cannot sign in.
export const PUBLIC_PATHS = ['/login', '/forgot-password', '/reset-password'];

export const PROTECTED_PATH_PREFIXES = [
  '/dashboard',
  '/my-day',
  '/patients',
  '/pipeline',
  '/team',
  '/campaigns',
  '/appointments',
  '/finance',
  '/settings',
  '/inbox',
  '/reports',
];

export function matchesPrefix(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
