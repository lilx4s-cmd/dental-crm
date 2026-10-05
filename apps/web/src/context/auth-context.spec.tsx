import { act, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './auth-context';
import { apiRequest, refreshAccessToken } from '@/lib/api-client';

const replace = jest.fn();
jest.mock('next/navigation', () => ({
  usePathname: () => '/login',
  useRouter: () => ({ replace, push: jest.fn() }),
}));
jest.mock('../lib/api-client', () => ({
  apiRequest: jest.fn(),
  refreshAccessToken: jest.fn(),
  cancelPendingRefresh: jest.fn(),
  setCsrfToken: jest.fn(),
  clearCsrfToken: jest.fn(),
}));
const token = () =>
  'fixture.' +
  btoa(
    JSON.stringify({
      sub: 'fixture-user',
      email: 'fixture@example.test',
      role: 'SUPER_ADMIN',
      exp: Math.floor(Date.now() / 1000) + 900,
    }),
  ) +
  '.fixture';
let auth: ReturnType<typeof useAuth>;
function Status() {
  auth = useAuth();
  return <output>{auth.ready ? (auth.user?.email ?? 'signed out') : 'restoring'}</output>;
}
const show = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AuthProvider>
        <Status />
      </AuthProvider>
    </QueryClientProvider>,
  );

beforeEach(() => {
  document.cookie = 'access_token=; path=/; Max-Age=0';
  document.cookie = 'csrf_token=; path=/; Max-Age=0';
  jest.clearAllMocks();
});

it('restores a remembered login after its short-lived access cookie has expired', async () => {
  document.cookie = 'csrf_token=fixture-csrf; path=/';
  (refreshAccessToken as jest.Mock).mockResolvedValue(token());
  (apiRequest as jest.Mock).mockResolvedValue({
    sub: 'fixture-user',
    email: 'fixture@example.test',
    role: 'SUPER_ADMIN',
  });
  show();
  expect(await screen.findByText('fixture@example.test')).toBeInTheDocument();
  expect(refreshAccessToken).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(replace).toHaveBeenCalledWith('/dashboard'));
});

it('leaves a revoked session on the sign-in page without redirecting it in a loop', async () => {
  document.cookie = 'access_token=' + token() + '; path=/';
  (apiRequest as jest.Mock).mockRejectedValue(new Error('Session revoked'));
  show();
  expect(await screen.findByText('signed out')).toBeInTheDocument();
  expect(replace).not.toHaveBeenCalled();
});

it('a delayed check of an old session cannot sign out a new successful login', async () => {
  const oldToken =
    'fixture.' +
    btoa(JSON.stringify({ sub: 'old-user', exp: Math.floor(Date.now() / 1000) + 900 })) +
    '.fixture';
  const newToken = token();
  let rejectOld!: (reason: Error) => void;
  const pending = new Promise((_, reject) => {
    rejectOld = reject;
  });
  document.cookie = `access_token=${oldToken}; path=/`;
  const currentUser = { sub: 'fixture-user', email: 'fixture@example.test', role: 'SUPER_ADMIN' };
  (apiRequest as jest.Mock).mockImplementation(
    (path: string, _init: unknown, accessToken?: string) => {
      if (path === '/api/auth/login')
        return Promise.resolve({ accessToken: newToken, csrfToken: 'new-csrf' });
      return accessToken === oldToken ? pending : Promise.resolve(currentUser);
    },
  );
  show();
  await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('/api/auth/me', {}, oldToken));
  await act(async () => {
    await auth.login('fixture@example.test', 'synthetic-test-password');
  });
  await act(async () => {
    rejectOld(new Error('Old session expired'));
  });
  expect(screen.getByText('fixture@example.test')).toBeInTheDocument();
  expect(document.cookie).toContain(`access_token=${encodeURIComponent(newToken)}`);
});

it('a delayed old session cannot restore access after logout', async () => {
  let resolveOld!: (user: unknown) => void;
  const pending = new Promise((resolve) => {
    resolveOld = resolve;
  });
  document.cookie = `access_token=${token()}; path=/`;
  (apiRequest as jest.Mock).mockImplementation((path: string) =>
    path === '/api/auth/me' ? pending : Promise.resolve({}),
  );
  show();
  await waitFor(() => expect(apiRequest).toHaveBeenCalled());
  await act(async () => {
    await auth.logout();
  });
  await act(async () => {
    resolveOld({ sub: 'fixture-user', email: 'fixture@example.test', role: 'SUPER_ADMIN' });
  });
  expect(screen.getByText('signed out')).toBeInTheDocument();
  expect(document.cookie).not.toContain('access_token=');
});
