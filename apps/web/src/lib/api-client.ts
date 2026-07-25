// NEXT_PUBLIC_API_URL is the bare API origin (no /api suffix) — every call site
// below is responsible for including the `/api` prefix itself, matching the
// NestJS app's global prefix (see apps/api/src/main.ts's setGlobalPrefix('api')).
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

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
    fetch(`${API_URL}${path}`, {
      credentials: 'include',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });

  let res = await request(accessToken);

  if (res.status === 401 && accessToken) {
    const newToken = await refreshAccessToken();
    if (!newToken) throw new Error('Your session has expired. Please sign in again.');
    res = await request(newToken);
  }

  if (!res.ok) {
    // The API sends JSON errors even on endpoints that normally return a file.
    const message = await res
      .clone()
      .json()
      .then((e: { message?: string }) => e.message)
      .catch(() => undefined);
    throw new Error(message ?? `Download failed (${res.status})`);
  }

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

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers,
  });

  if (res.status === 401 && accessToken) {
    if (!isRefreshing) {
      isRefreshing = true;
      const newToken = await refreshAccessToken();
      isRefreshing = false;
      processQueue(newToken);
      if (!newToken) throw new Error('Session expired');

      const retryRes = await fetch(`${API_URL}${path}`, {
        ...options,
        credentials: 'include',
        headers: { ...headers, Authorization: `Bearer ${newToken}` },
      });
      if (!retryRes.ok) throw new Error(await retryRes.text());
      return retryRes.json() as Promise<T>;
    } else {
      return new Promise((resolve, reject) => {
        refreshQueue.push((token) => {
          if (!token) return reject(new Error('Session expired'));
          fetch(`${API_URL}${path}`, {
            ...options,
            credentials: 'include',
            headers: { ...headers, Authorization: `Bearer ${token}` },
          })
            .then((r) => r.json() as Promise<T>)
            .then(resolve)
            .catch(reject);
        });
      });
    }
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error((err as { message: string }).message ?? res.statusText);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
