import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import OperationsFinancePage from './page';
import { apiRequest } from '../../../lib/api-client';

jest.mock('../../../context/auth-context', () => ({
  useAuth: () => ({ accessToken: 'fixture', user: { role: 'SUPER_ADMIN' } }),
}));
jest.mock('../../../lib/api-client', () => ({ apiRequest: jest.fn() }));
jest.mock('../../../hooks/use-patients', () => ({ usePatients: () => ({ data: { data: [] } }) }));

function show() {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <OperationsFinancePage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  Object.defineProperty(crypto, 'randomUUID', {
    configurable: true,
    value: () => 'fixture-request',
  });
  (apiRequest as jest.Mock).mockImplementation((path: string) => {
    if (path.endsWith('/catalog')) return Promise.resolve([]);
    if (path.endsWith('/compensation')) return Promise.resolve({ staff: [], rules: [] });
    if (path.endsWith('/google'))
      return Promise.resolve({
        configured: true,
        connection: { account: 'fixture@example.test', status: 'CONNECTED' },
        required: [],
      });
    if (/\/(expenses|commissions)\?/.test(path)) return Promise.resolve({ data: [], total: 0 });
    return Promise.resolve({});
  });
});

it('keeps catalog editing usable after a save failure and displays the server reason', async () => {
  show();
  fireEvent.click(screen.getByRole('button', { name: 'Catalog' }));
  (apiRequest as jest.Mock).mockRejectedValue(new Error('Catalog is temporarily unavailable'));
  fireEvent.click(screen.getByRole('button', { name: 'Save new catalog version' }));
  expect(await screen.findByRole('status')).toHaveTextContent('Catalog is temporarily unavailable');
  expect(screen.getByRole('button', { name: 'Save new catalog version' })).toBeEnabled();
});

it('validates a blank effective date without sending or locking the catalog form', () => {
  show();
  fireEvent.click(screen.getByRole('button', { name: 'Catalog' }));
  fireEvent.change(screen.getByLabelText('effectiveAt'), { target: { value: '' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save new catalog version' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Choose a valid effective date');
  expect(screen.getByRole('button', { name: 'Save new catalog version' })).toBeEnabled();
  expect((apiRequest as jest.Mock).mock.calls.some(([, init]) => init?.method === 'POST')).toBe(
    false,
  );
});

it('shows Calendar loading errors and makes retry available', async () => {
  show();
  fireEvent.click(screen.getByRole('button', { name: 'Google Calendar' }));
  const load = screen.getByRole('button', { name: 'Load writable calendars' });
  await waitFor(() => expect(load).toBeEnabled());
  (apiRequest as jest.Mock).mockRejectedValue(new Error('Google access was revoked. Reconnect.'));
  fireEvent.click(load);
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Google access was revoked. Reconnect.',
  );
  expect(load).toBeEnabled();
});

it('prevents a second expense save while the first request is pending', async () => {
  let finish!: (data: unknown) => void;
  (apiRequest as jest.Mock).mockImplementation((path: string, init?: RequestInit) => {
    if (path.endsWith('/expenses') && init?.method === 'POST')
      return new Promise((resolve) => {
        finish = resolve;
      });
    return Promise.resolve(
      path.endsWith('/catalog') ? [] : path.includes('/expenses?') ? { data: [], total: 0 } : {},
    );
  });
  show();
  const save = screen.getByRole('button', { name: 'Save expense' });
  fireEvent.click(save);
  expect(save).toBeDisabled();
  fireEvent.click(save);
  expect(
    (apiRequest as jest.Mock).mock.calls.filter(([, init]) => init?.method === 'POST'),
  ).toHaveLength(1);
  finish({});
  await waitFor(() => expect(save).toBeEnabled());
});
