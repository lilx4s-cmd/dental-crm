import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Same-origin transport for the existing auth service. Tokens remain HttpOnly and revocable. */
async function proxyAuth(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  if (path.some((part) => !/^[a-zA-Z0-9_-]+$/.test(part))) {
    return NextResponse.json({ message: 'Invalid auth route' }, { status: 400 });
  }
  // Cookie-authenticated mutations must originate from this app. The API also checks its CSRF
  // token on refresh; keeping both checks prevents the proxy from bypassing that protection.
  const origin = request.headers.get('origin');
  if (request.method !== 'GET' && origin !== request.nextUrl.origin) {
    return NextResponse.json({ message: 'Request origin is not allowed' }, { status: 403 });
  }
  const base = (process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001').replace(/\/$/, '');
  const target = new URL(`/api/auth/${path.join('/')}${request.nextUrl.search}`, base);
  const headers = new Headers();
  for (const name of ['authorization', 'content-type', 'x-csrf-token', 'user-agent']) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  // The upstream never needs other app cookies.
  const authCookies = (request.headers.get('cookie') ?? '').split(';').map((part) => part.trim())
    .filter((part) => /^(refresh_token|csrf_token)=/.test(part));
  if (authCookies.length) headers.set('cookie', authCookies.join('; '));
  if (origin) headers.set('origin', origin);

  try {
    const upstream = await fetch(target, {
      method: request.method,
      headers,
      body: request.method === 'GET' ? undefined : await request.text(),
      cache: 'no-store',
      redirect: 'manual',
      signal: AbortSignal.timeout(45_000),
    });
    const response = new NextResponse(upstream.status === 204 ? null : await upstream.arrayBuffer(), {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('content-type') ?? 'application/json',
        'Cache-Control': 'no-store',
      },
    });
    const remember = request.cookies.get('crm_remember')?.value === '1';
    for (const raw of upstream.headers.getSetCookie()) {
      if (!/^(refresh_token|csrf_token)=/.test(raw)) continue;
      // Host-only, first-party cookies. A shared-device sign-in leaves session cookies instead
      // of persistent ones; deletion headers keep their zero expiry even without Remember me.
      const deleting = /max-age=0\b/i.test(raw);
      let cookie = raw.replace(/;\s*Domain=[^;]+/ig, '').replace(/;\s*SameSite=[^;]+/ig, '');
      if (!remember && !deleting) cookie = cookie.replace(/;\s*(Max-Age|Expires)=[^;]+/ig, '');
      if (request.nextUrl.protocol !== 'https:') cookie = cookie.replace(/;\s*Secure\b/ig, '');
      if (request.nextUrl.protocol === 'https:' && !/;\s*Secure\b/i.test(cookie)) cookie += '; Secure';
      response.headers.append('Set-Cookie', `${cookie}; SameSite=Lax`);
    }
    return response;
  } catch {
    return NextResponse.json({ message: 'The sign-in service is temporarily unavailable. Please try again.' }, {
      status: 502, headers: { 'Cache-Control': 'no-store' },
    });
  }
}

export { proxyAuth as GET, proxyAuth as POST, proxyAuth as DELETE };
