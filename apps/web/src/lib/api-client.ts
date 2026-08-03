// NEXT_PUBLIC_API_URL is the bare API origin (no /api suffix) — every call site
// below is responsible for including the `/api` prefix itself, matching the
// NestJS app's global prefix (see apps/api/src/main.ts's setGlobalPrefix('api')).
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

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
  return new ApiError(message ?? res.statusText ?? `Request failed (${res.status})`, res.status, path);
}

/** fetch, but a transport failure becomes an ApiError with status 0 rather than a raw TypeError. */
async function send(path: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(`${API_URL}${path}`, { ...init, credentials: 'include' });
  } catch {
    throw new ApiError('Could not reach the server. Check your connection.', 0, path);
  }
}

let isRefreshing = false;
let refreshQueue: Array<(token: string | null) => void> = [];

function processQueue(token: string | null) {
  refreshQueue.forEach((cb) => cb(token));
  refreshQueue = [];
}

async function refreshAccessToken(): Promise<string | null> {
  try {
    const res = await fetch(`${API_URL}/api/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { accessToken: string };
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
  const request = (token?: string) =>
    send(path, { headers: token ? { Authorization: `Bearer ${token}` } : undefined });

  let res = await request(accessToken);

  if (res.status === 401 && accessToken) {
    const newToken = await refreshAccessToken();
    if (!newToken) throw new ApiError('Your session has expired. Please sign in again.', 401, path);
    res = await request(newToken);
  }

  if (!res.ok) throw await toApiError(res, path);

  return res.blob();
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
  accessToken?: string,
): Promise<T> {
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
    if (!isRefreshing) {
      isRefreshing = true;
      const newToken = await refreshAccessToken();
      isRefreshing = false;
      processQueue(newToken);
      if (!newToken) throw new ApiError('Your session has expired. Please sign in again.', 401, path);

      return unwrap(
        await send(path, { ...options, headers: { ...headers, Authorization: `Bearer ${newToken}` } }),
      );
    }

    // A refresh is already in flight. Wait for its result rather than starting a second one —
    // concurrent refreshes race, and the loser's rotated token is already invalid when it lands.
    return new Promise<T>((resolve, reject) => {
      refreshQueue.push((token) => {
        if (!token) {
          reject(new ApiError('Your session has expired. Please sign in again.', 401, path));
          return;
        }
        send(path, { ...options, headers: { ...headers, Authorization: `Bearer ${token}` } })
          .then(unwrap)
          .then(resolve, reject);
      });
    });
  }

  return unwrap(res);
}
