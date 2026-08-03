import { ApiError, apiRequest } from './api-client';

/**
 * The transport every screen depends on.
 *
 * These tests exist because of one bug in particular: the queued-refresh branch resolved its
 * response with `.json()` without checking `ok`, so a 403 arriving while a token refresh was in
 * flight was handed to the caller *as data*. React Query reported success and the component
 * rendered `{ statusCode: 403, message: 'Forbidden' }`. Nothing about that is visible in a type
 * signature, and no page-level error state can catch it — the query never failed.
 */

const API = 'http://localhost:3001';

type FetchMock = jest.Mock<Promise<Response>, [string, RequestInit?]>;
let fetchMock: FetchMock;

/** A Response stand-in — jsdom's Response is not available under this Node/jest combination. */
function res(status: number, body: unknown): Response {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  const self = {
    ok: status >= 200 && status < 300,
    status,
    statusText: `status ${status}`,
    json: async () => JSON.parse(text),
    text: async () => text,
    blob: async () => ({ size: text.length }) as Blob,
    clone: () => self,
  };
  return self as unknown as Response;
}

/** Awaits a rejection as an ApiError, and fails loudly if the promise resolved instead. */
async function rejection(promise: Promise<unknown>): Promise<ApiError> {
  return promise.then(
    (data) => { throw new Error(`expected a rejection, got: ${JSON.stringify(data)}`); },
    (e: ApiError) => e,
  );
}

beforeEach(() => {
  fetchMock = jest.fn() as FetchMock;
  global.fetch = fetchMock as unknown as typeof fetch;
});

describe('apiRequest', () => {
  it('returns the parsed body on success', async () => {
    fetchMock.mockResolvedValueOnce(res(200, { id: 'p1' }));
    await expect(apiRequest('/api/patients/p1')).resolves.toEqual({ id: 'p1' });
  });

  it('returns undefined on 204 rather than trying to parse an empty body', async () => {
    fetchMock.mockResolvedValueOnce(res(204, ''));
    await expect(apiRequest('/api/leads/l1', { method: 'DELETE' })).resolves.toBeUndefined();
  });

  it('throws an ApiError carrying the status and the API message', async () => {
    fetchMock.mockResolvedValueOnce(res(403, { statusCode: 403, message: 'Forbidden resource' }));

    const err = await rejection(apiRequest('/api/patients/p1'));

    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(403);
    expect(err.isForbidden).toBe(true);
    expect(err.isPermanent).toBe(true);
    expect(err.message).toBe('Forbidden resource');
  });

  it('joins the array of messages a validation failure returns', async () => {
    // Nest's ValidationPipe sends `message: string[]`. Rendering that raw puts a JS array in a
    // toast: "phone must be a valid phone number,email must be an email".
    fetchMock.mockResolvedValueOnce(
      res(400, { statusCode: 400, message: ['phone must be valid', 'email must be an email'] }),
    );

    const err = await rejection(apiRequest('/api/leads', { method: 'POST' }));
    expect(err.message).toBe('phone must be valid, email must be an email');
  });

  it('reports a transport failure as status 0 rather than a raw TypeError', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    const err = await rejection(apiRequest('/api/patients'));
    expect(err).toBeInstanceOf(ApiError);
    expect(err.isOffline).toBe(true);
    // Never "Failed to fetch" — the user is not debugging our fetch call.
    expect(err.message).toMatch(/connection/i);
  });

  it('falls back to a readable message when the error body is not JSON', async () => {
    // A gateway timeout comes back as HTML from in front of the app, not from Nest.
    fetchMock.mockResolvedValueOnce(res(504, '<html>Gateway Timeout</html>'));

    const err = await rejection(apiRequest('/api/reports/kpi'));
    expect(err.status).toBe(504);
    expect(err.message).not.toContain('<html>');
  });

  it('is not permanent for the statuses that come back on their own', async () => {
    for (const status of [408, 429, 500, 502, 503]) {
      fetchMock.mockResolvedValueOnce(res(status, { message: 'nope' }));
      const err = await rejection(apiRequest('/api/x'));
      expect([status, err.isPermanent]).toEqual([status, false]);
    }
  });
});

describe('apiRequest — expired access token', () => {
  it('refreshes once and replays the request', async () => {
    fetchMock
      .mockResolvedValueOnce(res(401, { message: 'jwt expired' }))
      .mockResolvedValueOnce(res(200, { accessToken: 'fresh' }))
      .mockResolvedValueOnce(res(200, { id: 'p1' }));

    await expect(apiRequest('/api/patients/p1', {}, 'stale')).resolves.toEqual({ id: 'p1' });

    expect(fetchMock.mock.calls[1][0]).toBe(`${API}/api/auth/refresh`);
    const replayHeaders = fetchMock.mock.calls[2][1]?.headers as Record<string, string>;
    expect(replayHeaders.Authorization).toBe('Bearer fresh');
  });

  it('surfaces a refusal on the replayed request instead of resolving it as data', async () => {
    // The bug this file was written for. A 403 arriving after a successful refresh used to be
    // parsed and handed back as the query's data.
    fetchMock
      .mockResolvedValueOnce(res(401, { message: 'jwt expired' }))
      .mockResolvedValueOnce(res(200, { accessToken: 'fresh' }))
      .mockResolvedValueOnce(res(403, { statusCode: 403, message: 'Forbidden resource' }));

    const err = await rejection(apiRequest('/api/patients/p1', {}, 'stale'));
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(403);
  });

  it('refreshes once for concurrent requests, and every one of them gets the answer', async () => {
    // Two refreshes race, and the loser's rotated token is already invalid when it lands. The
    // queue exists so the second caller waits rather than starting its own.
    let releaseRefresh: (r: Response) => void = () => {};
    const refreshInFlight = new Promise<Response>((resolve) => { releaseRefresh = resolve; });

    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url.endsWith('/api/auth/refresh')) return refreshInFlight;
      const auth = (init?.headers as Record<string, string> | undefined)?.Authorization;
      if (auth === 'Bearer stale') return Promise.resolve(res(401, { message: 'jwt expired' }));
      return Promise.resolve(res(200, { ok: url }));
    });

    const first = apiRequest('/api/patients', {}, 'stale');
    const second = apiRequest('/api/appointments', {}, 'stale');
    // Let both reach the 401 branch before the refresh resolves.
    await Promise.resolve();
    await Promise.resolve();
    releaseRefresh(res(200, { accessToken: 'fresh' }));

    await expect(first).resolves.toEqual({ ok: `${API}/api/patients` });
    await expect(second).resolves.toEqual({ ok: `${API}/api/appointments` });

    const refreshCalls = fetchMock.mock.calls.filter(([u]) => u.endsWith('/api/auth/refresh'));
    expect(refreshCalls).toHaveLength(1);
  });

  it('surfaces a refusal to the caller that waited on someone else\'s refresh', async () => {
    // The exact shape of the original bug. The first caller drove the refresh and took the
    // checked path; the second waited in the queue and took an unchecked `.then(r => r.json())`,
    // so its 403 body was resolved as data. Only the second caller was affected, which is why a
    // test that fires one request could never have caught it.
    let releaseRefresh: (r: Response) => void = () => {};
    const refreshInFlight = new Promise<Response>((resolve) => { releaseRefresh = resolve; });

    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url.endsWith('/api/auth/refresh')) return refreshInFlight;
      const auth = (init?.headers as Record<string, string> | undefined)?.Authorization;
      if (auth === 'Bearer stale') return Promise.resolve(res(401, { message: 'jwt expired' }));
      if (url.includes('/files')) {
        return Promise.resolve(res(403, { statusCode: 403, message: 'Forbidden resource' }));
      }
      return Promise.resolve(res(200, { ok: true }));
    });

    const driver = apiRequest('/api/patients', {}, 'stale');
    const queued = apiRequest('/api/files', {}, 'stale');
    await Promise.resolve();
    await Promise.resolve();
    releaseRefresh(res(200, { accessToken: 'fresh' }));

    await expect(driver).resolves.toEqual({ ok: true });

    const err: ApiError = await queued.then(
      (data) => { throw new Error(`resolved as data: ${JSON.stringify(data)}`); },
      (e) => e,
    );
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(403);
  });

  it('rejects with an ApiError when the refresh itself fails', async () => {
    fetchMock
      .mockResolvedValueOnce(res(401, { message: 'jwt expired' }))
      .mockResolvedValueOnce(res(401, { message: 'refresh token expired' }));

    const err = await rejection(apiRequest('/api/patients', {}, 'stale'));
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(401);
    expect(err.message).toMatch(/sign in again/i);
  });

  it('does not attempt a refresh for an unauthenticated request', async () => {
    // The login screen has no token to refresh; retrying there would turn a wrong password into
    // two round-trips and a confusing error.
    fetchMock.mockResolvedValueOnce(res(401, { message: 'Invalid credentials' }));

    const err = await rejection(apiRequest('/api/auth/login', { method: 'POST' }));
    expect(err.message).toBe('Invalid credentials');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
