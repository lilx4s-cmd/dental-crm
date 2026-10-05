import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './auth-context';
import { apiRequest, refreshAccessToken } from '@/lib/api-client';

const replace = jest.fn();
jest.mock('next/navigation', () => ({ usePathname: () => '/login', useRouter: () => ({ replace, push: jest.fn() }) }));
jest.mock('../lib/api-client', () => ({ apiRequest: jest.fn(), refreshAccessToken: jest.fn(), setCsrfToken: jest.fn(), clearCsrfToken: jest.fn() }));
const token = () => 'fixture.' + btoa(JSON.stringify({ sub: 'fixture-user', email: 'fixture@example.test', role: 'SUPER_ADMIN', exp: Math.floor(Date.now() / 1000) + 900 })) + '.fixture';
function Status() { const auth = useAuth(); return <output>{auth.ready ? auth.user?.email ?? 'signed out' : 'restoring'}</output>; }
const show = () => render(<QueryClientProvider client={new QueryClient()}><AuthProvider><Status /></AuthProvider></QueryClientProvider>);

beforeEach(() => {
  document.cookie = 'access_token=; path=/; Max-Age=0';
  document.cookie = 'csrf_token=; path=/; Max-Age=0';
  jest.clearAllMocks();
});

it('restores a remembered login after its short-lived access cookie has expired', async () => {
  document.cookie = 'csrf_token=fixture-csrf; path=/';
  (refreshAccessToken as jest.Mock).mockResolvedValue(token());
  (apiRequest as jest.Mock).mockResolvedValue({ sub: 'fixture-user', email: 'fixture@example.test', role: 'SUPER_ADMIN' });
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
