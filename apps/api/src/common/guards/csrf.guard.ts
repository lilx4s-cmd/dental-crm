import { CanActivate, ExecutionContext, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { timingSafeEqual } from 'node:crypto';

export const CSRF_COOKIE = 'csrf_token';
export const CSRF_HEADER = 'x-csrf-token';

/**
 * Cross-site request forgery protection for the one endpoint that is authenticated by a cookie.
 *
 * Everything else in this API authenticates with an `Authorization: Bearer` header, which a
 * browser never attaches by itself — those routes are CSRF-immune by construction. `/auth/refresh`
 * is the exception: it is authenticated by the refresh cookie, and that cookie is `SameSite=none`
 * in production because the app is served from Vercel and the API from Render, which are separate
 * registrable domains. A Strict cookie is simply never sent, so this is not a setting that can be
 * tightened; it is the price of the deployment shape.
 *
 * The impact today is bounded — CORS stops an attacker reading the rotated token, so a forged
 * request signs the victim out rather than taking their account. But "bounded because of a
 * different control" is not the same as defended, and a signed-out clinic mid-appointment is not
 * nothing.
 *
 * Two independent checks:
 *
 * 1. **Origin/Referer must be on the CORS allowlist.** Browsers attach `Origin` to every
 *    cross-origin POST and a page cannot forge it. This needs no client state, so it protects
 *    every session immediately, including ones that predate this guard.
 *
 * 2. **Double-submit token.** The API holds one copy in an httpOnly cookie and the client sends
 *    the other in a header. Classic double-submit has the client read the cookie — impossible
 *    here, since the cookie belongs to the API's domain and the web app cannot read it. So the
 *    token is delivered in the sign-in *response body* instead: CORS stops an attacker reading
 *    that, so they cannot produce the header.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  private readonly logger = new Logger(CsrfGuard.name);

  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    this.assertTrustedOrigin(req);
    this.assertMatchingToken(req);
    return true;
  }

  private assertTrustedOrigin(req: Request): void {
    // The same list, and the same fallback, that main.ts hands to enableCors. Sharing both means
    // this guard can never refuse an origin CORS has already accepted — if they could disagree,
    // the disagreement would show up as everyone being signed out every fifteen minutes. The
    // fallback in particular matters: with CORS_ORIGIN unset, main.ts allows localhost:3000, and
    // an empty list here would have broken local development while passing every test.
    const allowed = this.config.get<string[]>('cors.origin') ?? ['http://localhost:3000'];
    // Referer is the fallback for the handful of clients that omit Origin; only its origin part is
    // compared, since the path is irrelevant and carries no authority.
    const origin = req.headers.origin ?? this.originOf(req.headers.referer);

    if (!origin) {
      // A same-origin form post can legitimately omit both — but this endpoint is only ever
      // called cross-origin by the app's own fetch, which always sends Origin. Refusing is the
      // safe reading, and a missing header is exactly what a forged request looks like.
      throw new ForbiddenException('This request is missing its origin and cannot be trusted.');
    }

    if (!allowed.includes(origin)) {
      this.logger.warn(`Refused a cookie-authenticated request from an untrusted origin: ${origin}`);
      throw new ForbiddenException('This request came from an origin this server does not trust.');
    }
  }

  private assertMatchingToken(req: Request): void {
    const cookie = req.cookies?.[CSRF_COOKIE] as string | undefined;

    // A session created before this guard shipped has no CSRF cookie. Refusing outright would
    // sign out everyone who was logged in at deploy time; the origin check above still applies to
    // them, and their refresh token expires within seven days, after which every session has one.
    // Remove this branch — and the fallback it allows — once that window has passed.
    if (!cookie) return;

    const header = req.headers[CSRF_HEADER];
    const presented = Array.isArray(header) ? header[0] : header;

    if (!presented || !this.equal(cookie, presented)) {
      throw new ForbiddenException('This request is missing a valid CSRF token.');
    }
  }

  /** Constant-time, so a mismatch cannot be narrowed down one character at a time. */
  private equal(a: string, b: string): boolean {
    const left = Buffer.from(a);
    const right = Buffer.from(b);
    if (left.length !== right.length) return false;
    return timingSafeEqual(left, right);
  }

  private originOf(referer: string | undefined): string | undefined {
    if (!referer) return undefined;
    try {
      return new URL(referer).origin;
    } catch {
      return undefined;
    }
  }
}
