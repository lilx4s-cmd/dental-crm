import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { Response } from 'express';

/**
 * Tells every cache between here and the browser not to keep API responses.
 *
 * The API was sending no Cache-Control header at all, and "absent" does not mean "do not cache".
 * HTTP lets a cache apply its own heuristics to a response that says nothing, so a patient's
 * record, an invoice or a WhatsApp thread could legitimately be held by any proxy on the path —
 * clinic wifi, a hotel network a coordinator works from, a corporate gateway — and by the
 * browser's own disk cache, where it survives logout and the back button.
 *
 * `no-store` is the only directive that forbids writing the response down anywhere; `no-cache`
 * merely requires revalidation, which still leaves a copy on disk. `private` is redundant
 * alongside it and included because some intermediaries only honour the older directives.
 *
 * This costs nothing: every response here is either personal to one user or a few hundred bytes of
 * configuration. Nothing the API returns is worth caching, and the static assets that genuinely
 * benefit are served by Vercel's CDN, where they are already immutable for a year.
 */
@Injectable()
export class CacheControlInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const res = context.switchToHttp().getResponse<Response>();

    // Set before the handler runs, so a route that streams its own body — the plan PDF, a signed
    // download redirect — is covered too. Those carry x-rays and treatment plans, which are the
    // last things that should sit in a shared cache.
    res.setHeader('Cache-Control', 'no-store, private');
    res.setHeader('Pragma', 'no-cache');

    return next.handle();
  }
}
