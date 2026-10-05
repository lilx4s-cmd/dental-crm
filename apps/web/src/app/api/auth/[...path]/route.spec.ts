/** @jest-environment node */
import { NextRequest } from 'next/server';
import { POST, GET } from './route';

const context = (path: string) => ({ params: Promise.resolve({ path: path.split('/') }) });
const request = (path: string, method = 'POST', cookie = '') => new NextRequest('https://crm.test/api/auth/' + path, {
  method, headers: { origin: 'https://crm.test', cookie, 'content-type': 'application/json' },
  ...(method === 'GET' ? {} : { body: '{}' }),
});

beforeEach(() => { global.fetch = jest.fn(); });

it('keeps refresh and CSRF cookies first-party, secure, HttpOnly and persistent when remembered', async () => {
  const upstream = new Response('{}');
  upstream.headers.append('set-cookie', 'refresh_token=fixture-refresh; Path=/api/auth; HttpOnly; Secure; SameSite=None; Max-Age=604800; Domain=api.test');
  upstream.headers.append('set-cookie', 'csrf_token=fixture-csrf; Path=/api/auth; HttpOnly; Secure; SameSite=None; Max-Age=604800');
  (fetch as jest.Mock).mockResolvedValue(upstream);
  const response = await POST(request('login', 'POST', 'crm_remember=1; unrelated=private-fixture'), context('login'));
  const cookies = response.headers.getSetCookie();
  expect(cookies).toHaveLength(2);
  for (const cookie of cookies) {
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Max-Age=604800');
    expect(cookie).not.toContain('Domain=');
  }
  expect((fetch as jest.Mock).mock.calls[0][1].headers.get('cookie')).toBeNull();
  expect(response.headers.get('cache-control')).toBe('no-store');
});

it('uses browser-session cookies when Remember me is unchecked', async () => {
  const upstream = new Response('{}', { headers: { 'set-cookie': 'refresh_token=fixture; Path=/api/auth; HttpOnly; Max-Age=604800; Expires=Thu, 01 Oct 2037 00:00:00 GMT' } });
  (fetch as jest.Mock).mockResolvedValue(upstream);
  const response = await POST(request('login', 'POST', 'crm_remember=0'), context('login'));
  expect(response.headers.get('set-cookie')).not.toMatch(/Max-Age|Expires/);
});

it('forwards the CSRF header and only the authentication cookies', async () => {
  (fetch as jest.Mock).mockResolvedValue(new Response('{}'));
  const req = request('refresh', 'POST', 'refresh_token=fixture; csrf_token=fixture-csrf; unrelated=private-fixture');
  req.headers.set('x-csrf-token', 'fixture-csrf');
  await POST(req, context('refresh'));
  const forwarded = (fetch as jest.Mock).mock.calls[0][1].headers;
  expect(forwarded.get('cookie')).toBe('refresh_token=fixture; csrf_token=fixture-csrf');
  expect(forwarded.get('x-csrf-token')).toBe('fixture-csrf');
});

it('preserves logout deletion headers even on a shared device', async () => {
  (fetch as jest.Mock).mockResolvedValue(new Response(null, { status: 204, headers: { 'set-cookie': 'refresh_token=; Path=/api/auth; Max-Age=0; HttpOnly' } }));
  const response = await POST(request('logout'), context('logout'));
  expect(response.status).toBe(204);
  expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
});

it('rejects cross-site writes before contacting the upstream', async () => {
  const req = request('refresh'); req.headers.set('origin', 'https://untrusted.test');
  const response = await POST(req, context('refresh'));
  expect(response.status).toBe(403);
  expect(fetch).not.toHaveBeenCalled();
});

it('preserves API errors and offers a readable error when the upstream is unavailable', async () => {
  (fetch as jest.Mock).mockResolvedValueOnce(new Response('{"message":"Invalid credentials"}', { status: 401 }));
  expect((await POST(request('login'), context('login'))).status).toBe(401);
  (fetch as jest.Mock).mockRejectedValueOnce(new Error('offline'));
  const response = await GET(request('me', 'GET'), context('me'));
  expect(response.status).toBe(502);
  expect(await response.json()).toEqual({ message: expect.stringMatching(/temporarily unavailable/) });
});
