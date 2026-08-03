import { ApiError } from './api-client';
import { queryClient } from './query-client';

/**
 * The retry policy, read back off the client the app actually uses.
 *
 * Asserting through `getDefaultOptions()` rather than exporting the predicate: what matters is
 * what the QueryClient was configured with, and a test against an unexported helper would keep
 * passing if someone wired a different function into the client.
 */
const defaults = queryClient.getDefaultOptions();
const retry = defaults.queries?.retry as (failureCount: number, error: unknown) => boolean;

describe('query retry policy', () => {
  it('does not retry what the user is not allowed to see', () => {
    // Re-sending a 403 only doubles the wait before the user is told no.
    expect(retry(0, new ApiError('Forbidden resource', 403))).toBe(false);
  });

  it('does not retry a 404', () => {
    expect(retry(0, new ApiError('Not found', 404))).toBe(false);
  });

  it('retries a server fault, then gives up', () => {
    const err = new ApiError('boom', 500);
    expect(retry(0, err)).toBe(true);
    expect(retry(1, err)).toBe(true);
    expect(retry(2, err)).toBe(false);
  });

  it('retries a dropped connection', () => {
    expect(retry(0, new ApiError('offline', 0))).toBe(true);
  });

  it('retries the two 4xx statuses that mean "later"', () => {
    expect(retry(0, new ApiError('timeout', 408))).toBe(true);
    expect(retry(0, new ApiError('rate limited', 429))).toBe(true);
  });

  it('retries an error it cannot classify', () => {
    expect(retry(0, new Error('something threw'))).toBe(true);
  });

  it('never retries a mutation', () => {
    // "Record payment" retried on a timeout that actually succeeded is a duplicate payment
    // against a patient's invoice.
    expect(defaults.mutations?.retry).toBe(false);
  });

  it('backs off rather than firing three attempts inside a second', () => {
    // A deploy restart closes the door for a few seconds; three immediate attempts all bounce.
    const delay = defaults.queries?.retryDelay as (attempt: number, error: Error) => number;
    expect(delay(0, new Error(''))).toBeGreaterThanOrEqual(1000);
    expect(delay(1, new Error(''))).toBeGreaterThan(delay(0, new Error('')));
    expect(delay(9, new Error(''))).toBeLessThanOrEqual(8000);
  });
});
