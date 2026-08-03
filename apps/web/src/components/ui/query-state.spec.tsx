import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ApiError } from '@/lib/api-client';
import { QueryError, DataState, describeError } from './query-state';

/**
 * These assertions are about what the user is told, which is the part that has no type to protect
 * it. Offering "Try again" on a permission denial is not a cosmetic slip — it invites someone to
 * keep pressing a button that will never work, on a screen that should be telling them to ask an
 * administrator.
 */

describe('describeError', () => {
  it('names a permission denial as one, and offers no retry', () => {
    const shape = describeError(new ApiError('Forbidden resource', 403));
    expect(shape.title).toMatch(/role/i);
    expect(shape.retryable).toBe(false);
  });

  it('blames the connection, not the server, when the request never arrived', () => {
    const shape = describeError(new ApiError('Could not reach the server.', 0));
    expect(shape.title).toMatch(/reach the server/i);
    expect(shape.retryable).toBe(true);
  });

  it('treats a server fault as worth retrying', () => {
    expect(describeError(new ApiError('boom', 500)).retryable).toBe(true);
  });

  it('does not offer to retry a 404', () => {
    expect(describeError(new ApiError('Patient not found', 404)).retryable).toBe(false);
  });

  it('handles an error that is not an ApiError at all', () => {
    // React Query surfaces whatever was thrown, and not everything goes through apiRequest.
    expect(describeError(new Error('render blew up')).detail).toBe('render blew up');
    expect(describeError('a string').detail).toMatch(/something went wrong/i);
  });
});

describe('QueryError', () => {
  it('offers a retry that calls back', async () => {
    const onRetry = jest.fn();
    render(<QueryError error={new ApiError('boom', 503)} onRetry={onRetry} />);

    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('hides the retry on a permission denial even when a handler is passed', async () => {
    const onRetry = jest.fn();
    render(<QueryError error={new ApiError('Forbidden resource', 403)} onRetry={onRetry} />);

    expect(screen.queryByRole('button', { name: /try again/i })).not.toBeInTheDocument();
    expect(screen.getByText(/administrator/i)).toBeInTheDocument();
  });

  it('announces itself to a screen reader', () => {
    render(<QueryError error={new ApiError('boom', 500)} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});

describe('DataState', () => {
  const skeleton = <div data-testid="skeleton" />;

  it('shows the error rather than the empty state when a request failed', () => {
    // The whole point. `isEmpty` is true here because the data never arrived, and the old code
    // everywhere in this app would have rendered "nothing yet" from exactly this state.
    render(
      <DataState
        isLoading={false}
        isError
        error={new ApiError('boom', 500)}
        isEmpty
        skeleton={skeleton}
        empty={<p>No patients yet</p>}
      >
        <p>rows</p>
      </DataState>,
    );

    expect(screen.queryByText('No patients yet')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('shows the empty state for a genuinely empty result', () => {
    render(
      <DataState isLoading={false} isError={false} isEmpty skeleton={skeleton} empty={<p>No patients yet</p>}>
        <p>rows</p>
      </DataState>,
    );

    expect(screen.getByText('No patients yet')).toBeInTheDocument();
  });

  it('prefers the skeleton while loading, even if an earlier attempt failed', () => {
    render(
      <DataState isLoading isError error={new ApiError('boom', 500)} skeleton={skeleton}>
        <p>rows</p>
      </DataState>,
    );

    expect(screen.getByTestId('skeleton')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('renders the children when a caller supplied no empty state', () => {
    // A table that draws its own "no rows" line should keep drawing it.
    render(
      <DataState isLoading={false} isError={false} isEmpty skeleton={skeleton}>
        <p>rows</p>
      </DataState>,
    );

    expect(screen.getByText('rows')).toBeInTheDocument();
  });
});
