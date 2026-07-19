import { NextRequest, NextResponse } from 'next/server';

const PUBLIC_PATHS = ['/login'];
const DASHBOARD_PREFIX = ['/dashboard', '/patients', '/pipeline', '/team', '/campaigns', '/appointments', '/finance', '/settings', '/inbox', '/reports'];

function getTokenFromCookie(req: NextRequest): string | null {
  return req.cookies.get('access_token')?.value ?? null;
}

function decodeJwtPayload(token: string): { role?: string; exp?: number } | null {
  try {
    const base64 = token.split('.')[1];
    const json = Buffer.from(base64, 'base64').toString('utf-8');
    return JSON.parse(json) as { role?: string; exp?: number };
  } catch {
    return null;
  }
}

function isTokenExpired(payload: { exp?: number }): boolean {
  if (!payload.exp) return true;
  return Date.now() / 1000 > payload.exp;
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p));
  const isDashboard = DASHBOARD_PREFIX.some((p) => pathname === p || pathname.startsWith(p));

  const token = getTokenFromCookie(req);
  const payload = token ? decodeJwtPayload(token) : null;
  const isAuthenticated = !!payload && !isTokenExpired(payload);

  if (isAuthenticated && isPublic) {
    return NextResponse.redirect(new URL('/dashboard', req.url));
  }

  if (!isAuthenticated && isDashboard) {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
