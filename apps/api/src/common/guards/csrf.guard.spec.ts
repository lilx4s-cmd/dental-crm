import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CsrfGuard } from './csrf.guard';

const ALLOWED = ['https://dental-crm-web.vercel.app', 'http://localhost:3000'];

const config = { get: () => ALLOWED } as unknown as ConfigService;

function contextFor(req: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers: {}, cookies: {}, ...req }) }),
  } as unknown as ExecutionContext;
}

describe('CsrfGuard', () => {
  const guard = new CsrfGuard(config);

  describe('origin', () => {
    it('allows a request from the app itself', () => {
      expect(
        guard.canActivate(
          contextFor({
            headers: { origin: ALLOWED[0], 'x-csrf-token': 'tok' },
            cookies: { csrf_token: 'tok' },
          }),
        ),
      ).toBe(true);
    });

    it('refuses a request from anywhere else', () => {
      // The attack this exists for: a page on another origin that causes the browser to send the
      // refresh cookie. It cannot forge Origin — the browser sets it.
      expect(() =>
        guard.canActivate(
          contextFor({
            headers: { origin: 'https://evil.example.com', 'x-csrf-token': 'tok' },
            cookies: { csrf_token: 'tok' },
          }),
        ),
      ).toThrow(ForbiddenException);
    });

    it('falls back to the Referer when Origin is absent', () => {
      expect(
        guard.canActivate(
          contextFor({
            headers: { referer: `${ALLOWED[0]}/settings`, 'x-csrf-token': 'tok' },
            cookies: { csrf_token: 'tok' },
          }),
        ),
      ).toBe(true);
    });

    it('compares only the origin part of a Referer, not the path', () => {
      // A path is attacker-controlled and carries no authority; matching on the full URL would be
      // both wrong and trivially bypassable.
      expect(() =>
        guard.canActivate(
          contextFor({
            headers: { referer: `https://evil.example.com/${ALLOWED[0]}`, 'x-csrf-token': 'tok' },
            cookies: { csrf_token: 'tok' },
          }),
        ),
      ).toThrow(ForbiddenException);
    });

    it('refuses when neither header is present', () => {
      // A missing origin is exactly what a forged request looks like, and this endpoint is only
      // ever called cross-origin by the app's own fetch, which always sends one.
      expect(() => guard.canActivate(contextFor({}))).toThrow(ForbiddenException);
    });

    it('is not fooled by an unparseable Referer', () => {
      expect(() =>
        guard.canActivate(contextFor({ headers: { referer: 'not a url' } })),
      ).toThrow(ForbiddenException);
    });
  });

  describe('double-submit token', () => {
    const from = (headers: Record<string, string>, cookies: Record<string, string> = {}) =>
      contextFor({ headers: { origin: ALLOWED[0], ...headers }, cookies });

    it('requires the header to match the cookie', () => {
      expect(guard.canActivate(from({ 'x-csrf-token': 'abc' }, { csrf_token: 'abc' }))).toBe(true);
    });

    it('refuses a mismatched token', () => {
      expect(() =>
        guard.canActivate(from({ 'x-csrf-token': 'wrong' }, { csrf_token: 'abc' })),
      ).toThrow(ForbiddenException);
    });

    it('refuses a missing header when the cookie exists', () => {
      expect(() => guard.canActivate(from({}, { csrf_token: 'abc' }))).toThrow(ForbiddenException);
    });

    it('refuses a token of the wrong length without leaking that fact through timing', () => {
      // Length is compared before timingSafeEqual because that function throws on unequal
      // lengths; the early return is the reason a short token is rejected rather than crashing.
      expect(() =>
        guard.canActivate(from({ 'x-csrf-token': 'ab' }, { csrf_token: 'abc' })),
      ).toThrow(ForbiddenException);
    });

    it('takes the first value when a header is sent twice', () => {
      // Express gives an array for repeated headers. Reading it as a string would compare against
      // "abc,evil" and fail, or worse, pass somewhere less careful.
      expect(
        guard.canActivate(from({ 'x-csrf-token': ['abc', 'evil'] as never }, { csrf_token: 'abc' })),
      ).toBe(true);
    });

    it('allows a session that predates the guard, on the origin check alone', () => {
      // Sessions created before this shipped have no CSRF cookie. Refusing them would sign out
      // everyone who was logged in at deploy time. The origin check still applies, and the
      // fallback disappears on its own once every refresh token has been rotated.
      expect(guard.canActivate(from({}, {}))).toBe(true);
    });

    it('does not let an untrusted origin through that fallback', () => {
      // The grandfathering must not become a hole: no cookie still means no cross-origin access.
      expect(() =>
        guard.canActivate(contextFor({ headers: { origin: 'https://evil.example.com' }, cookies: {} })),
      ).toThrow(ForbiddenException);
    });
  });

  describe('allowlist parity with CORS', () => {
    it('falls back to the same origin main.ts does when CORS_ORIGIN is unset', () => {
      // If the two disagreed, the disagreement would surface as every user being signed out every
      // fifteen minutes. An empty fallback here would have broken local development entirely while
      // every other test still passed.
      const unset = { get: () => undefined } as unknown as ConfigService;
      const guardWithoutConfig = new CsrfGuard(unset);

      expect(
        guardWithoutConfig.canActivate(
          contextFor({ headers: { origin: 'http://localhost:3000' }, cookies: {} }),
        ),
      ).toBe(true);
    });
  });
});
