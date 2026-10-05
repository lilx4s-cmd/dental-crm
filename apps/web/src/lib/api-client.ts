// NEXT_PUBLIC_API_URL is the bare API origin (no /api suffix) — every call site
// below is responsible for including the `/api` prefix itself, matching the
// NestJS app's global prefix (see apps/api/src/main.ts's setGlobalPrefix('api')).
import { writeAccessCookie, writeSessionCookie } from './session-cookies';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

// Authentication stays on the app's origin so refresh cookies also work in browsers that block
// third-party cookies. Other endpoints keep using the existing API and its access controls.
const requestUrl = (path: string) => (path.startsWith('/api/auth/') ? path : `${API_URL}${path}`);

/**
 * A failed request, with the status kept.
 *
 * Every failure used to arrive as `new Error(someMessage)`, which meant a screen could tell that
 * something went wrong but not *what*: a coordinator who is not allowed to see radiographs and a
 * coordinator whose network dropped got the same treatment. The status is what lets a page say
 * "you don't have access to this" instead of "something went wrong", and what lets the query
 * client decide whether retrying could possibly help — retrying a 403 just doubles the wait
 * before the user is told no.
 *
 * `status` is 0 when the request never reached the server (offline, DNS, CORS).
 */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly path?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Nothing the user does will change the answer — do not retry these. */
  get isPermanent(): boolean {
    return this.status >= 400 && this.status < 500 && this.status !== 408 && this.status !== 429;
  }

  get isForbidden(): boolean {
    return this.status === 403;
  }

  get isOffline(): boolean {
    return this.status === 0;
  }
}

/** Turns a non-ok Response into an ApiError, preferring the API's own message. */
async function toApiError(res: Response, path: string): Promise<ApiError> {
  // Nest sends `{ statusCode, message }`, but an error from in front of the app — a proxy, a
  // gateway timeout — is HTML, and dumping that into a toast is worse than saying nothing.
  const message = await res
    .clone()
    .json()
    .then((body: { message?: string | string[] }) =>
      Array.isArray(body.message) ? body.message.join(', ') : body.message,
    )
    .catch(() => undefined);
  return new ApiError(
    message ?? res.statusText ?? `Request failed (${res.status})`,
    res.status,
    path,
  );
}

/** fetch, but a transport failure becomes an ApiError with status 0 rather than a raw TypeError. */
async function send(path: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(requestUrl(path), { ...init, credentials: 'include' });
  } catch {
    throw new ApiError('Could not reach the server. Check your connection.', 0, path);
  }
}

/**
 * The CSRF token for `/auth/refresh`, kept where this app can actually read it.
 *
 * The same-origin auth proxy forwards the matching httpOnly cookie to the API. The readable
 * token arrives in the response body and survives reloads in an app cookie. Another origin
 * cannot read that value or pass the proxy's origin check.
 */
const CSRF_STORAGE_KEY = 'csrf_token';
let csrfToken: string | null = null;

export function setCsrfToken(token: string | undefined | null): void {
  if (!token) return;
  csrfToken = token;
  if (typeof document !== 'undefined') {
    writeSessionCookie(CSRF_STORAGE_KEY, token);
  }
}

export function clearCsrfToken(): void {
  csrfToken = null;
  if (typeof document !== 'undefined') {
    document.cookie = `${CSRF_STORAGE_KEY}=; path=/; max-age=0`;
  }
}

function readCsrfToken(): string | null {
  if (typeof document === 'undefined') return csrfToken;
  // Another tab can rotate the session. Read the cookie again instead of presenting a stale
  // in-memory token alongside the browser's new refresh cookie.
  const match = document.cookie.match(new RegExp(`(?:^|; )${CSRF_STORAGE_KEY}=([^;]*)`));
  csrfToken = match ? decodeURIComponent(match[1]) : null;
  return csrfToken;
}

let refreshPromise: Promise<string | null> | null = null;
let refreshController: AbortController | null = null;
let refreshRevision = 0;

/** A new sign-in/logout supersedes refresh work for the previous session. */
export function cancelPendingRefresh(): void {
  refreshRevision += 1;
  refreshController?.abort();
  refreshController = null;
  refreshPromise = null;
}

export function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    const controller = new AbortController();
    const revision = refreshRevision;
    refreshController = controller;
    const run = () => performRefresh(revision, controller.signal);
    const refresh =
      typeof navigator !== 'undefined' && navigator.locks
        ? navigator.locks
            .request('crm-session-refresh', { signal: controller.signal }, run)
            .then((token) => token)
        : run();
    const pending = refresh
      .catch(() => null)
      .finally(() => {
        if (refreshPromise === pending) {
          refreshPromise = null;
          refreshController = null;
        }
      });
    refreshPromise = pending;
  }
  return refreshPromise;
}
async function performRefresh(revision: number, signal: AbortSignal): Promise<string | null> {
  try {
    if (signal.aborted || revision !== refreshRevision) return null;
    const token = readCsrfToken();
    const res = await fetch(requestUrl('/api/auth/refresh'), {
      method: 'POST',
      credentials: 'include',
      signal,
      headers: token ? { 'X-CSRF-Token': token } : undefined,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { accessToken: string; csrfToken?: string };
    if (signal.aborted || revision !== refreshRevision) return null;
    // Rotated with the refresh token, so the next refresh presents the pair that matches the
    // cookies the browser now holds.
    setCsrfToken(data.csrfToken);
    if (typeof document !== 'undefined') {
      writeAccessCookie(data.accessToken);
      window.dispatchEvent(new CustomEvent('crm:session-refreshed', { detail: data.accessToken }));
    }
    return data.accessToken;
  } catch {
    return null;
  }
}

/**
 * Fetches a binary response (PDFs) through the same expired-token refresh as apiRequest.
 *
 * Access tokens live 15 minutes. A download written as a bare fetch therefore starts failing
 * quietly once a session passes that mark, while every other call keeps working because it
 * refreshes — which reads as "the PDF is broken" rather than "you need a new token".
 */
export async function apiRequestBlob(path: string, accessToken?: string): Promise<Blob> {
  return (await sendWithRefresh(path, {}, accessToken)).blob();
}

/** Shared by both download helpers: one request, one retry after a token refresh, then unwrap. */
async function sendWithRefresh(
  path: string,
  init: RequestInit,
  accessToken?: string,
): Promise<Response> {
  const revision = refreshRevision;
  const request = (token?: string) =>
    send(path, {
      ...init,
      headers: {
        ...(init.headers as Record<string, string>),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });

  let res = await request(accessToken);

  if (res.status === 401 && accessToken) {
    if (revision !== refreshRevision)
      throw new ApiError('The session changed. Please try again.', 401, path);
    const newToken = await refreshAccessToken();
    if (!newToken) throw new ApiError('Your session has expired. Please sign in again.', 401, path);
    if (revision !== refreshRevision)
      throw new ApiError('The session changed. Please try again.', 401, path);
    res = await request(newToken);
  }

  if (!res.ok) throw await toApiError(res, path);

  return res;
}

/**
 * A download produced by a request with a body — the CSV export, which POSTs a selection.
 *
 * Returns the server's filename and its row count alongside the file. Both arrive in headers,
 * which the browser only exposes cross-origin because the API lists them in `exposedHeaders`; the
 * count is how the UI can say "40 of the 45 you selected" rather than handing over a spreadsheet
 * that is quietly short because five deals belonged to somebody else.
 */
export async function apiRequestDownload(
  path: string,
  init: RequestInit,
  accessToken?: string,
): Promise<{ blob: Blob; filename: string | null; count: number | null }> {
  const res = await sendWithRefresh(
    path,
    {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init.headers as Record<string, string>) },
    },
    accessToken,
  );

  const disposition = res.headers.get('Content-Disposition');
  const countHeader = res.headers.get('X-Export-Count');

  return {
    blob: await res.blob(),
    filename: disposition?.match(/filename="([^"]+)"/)?.[1] ?? null,
    count: countHeader === null ? null : Number(countHeader),
  };
}

/**
 * Hands a blob to the browser as a file.
 *
 * The object URL is revoked on the next tick rather than immediately: revoking it in the same
 * synchronous block as the click races the download in Safari and Firefox, which read the URL
 * asynchronously and get nothing. Not revoking it at all leaks the whole file for the life of the
 * tab, and someone exporting a thousand deals repeatedly will notice.
 */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
  accessToken?: string,
): Promise<T> {
  const revision = refreshRevision;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

  // One place decides what a response means, so a request that succeeds after a token refresh is
  // checked exactly as strictly as one that succeeded first time. The queued branch below used to
  // call `.json()` without checking `ok`, which resolved `{ statusCode: 403, message: 'Forbidden' }`
  // to the caller *as data* — a query would report success and render the error object.
  const unwrap = async (res: Response): Promise<T> => {
    if (!res.ok) throw await toApiError(res, path);
    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
  };

  const res = await send(path, { ...options, headers });

  if (res.status === 401 && accessToken) {
    if (revision !== refreshRevision)
      throw new ApiError('The session changed. Please try again.', 401, path);
    // Every caller shares refreshAccessToken's promise, including PDF downloads and restoration.
    const newToken = await refreshAccessToken();
    if (!newToken) throw new ApiError('Your session has expired. Please sign in again.', 401, path);
    if (revision !== refreshRevision)
      throw new ApiError('The session changed. Please try again.', 401, path);
    return unwrap(
      await send(path, {
        ...options,
        headers: { ...headers, Authorization: `Bearer ${newToken}` },
      }),
    );
  }

  return unwrap(res);
}
