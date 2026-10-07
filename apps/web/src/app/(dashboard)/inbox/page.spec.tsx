import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import InboxPage from './page';
import { apiRequest } from '@/lib/api-client';

let mockParams = new URLSearchParams();
const mockReplace = jest.fn((url: string) => { mockParams = new URLSearchParams(url.split('?')[1]); });
jest.mock('next/navigation', () => ({
  useSearchParams: () => mockParams,
  useRouter: () => ({ replace: mockReplace }),
}));
jest.mock('@/context/auth-context', () => ({ useAuth: () => ({
  accessToken: 'fixture', user: { sub: 'owner', role: 'SUPER_ADMIN' },
}) }));
jest.mock('@/lib/api-client', () => ({ apiRequest: jest.fn() }));

function chat(id: string, sessionId: string, name: string) {
  return {
    id, channel: 'WHATSAPP', whatsappSessionId: sessionId, whatsappContactName: name,
    externalThreadId: id, unreadCount: 0, isPinned: false, pinnedAt: null,
    isArchived: false, lastMessageAt: '2026-10-07T12:00:00Z', createdAt: '2026-10-07T12:00:00Z',
    patient: null, lead: null, assignedTo: null, messages: [],
  };
}
const ownChat = chat('own-chat', 'user:owner', 'Own contact');
const teamChat = chat('team-chat', 'user:sales', 'Team contact');
const fixtureRequest = (path: string): Promise<unknown> => {
  if (path === '/api/whatsapp/sessions/me') return Promise.resolve({ sessionId: 'user:owner', linkedNumber: '900001', state: 'connected' });
  if (path === '/api/whatsapp/sessions') return Promise.resolve([{ sessionId: 'user:sales', linkedNumber: '900002', state: 'connected', user: { firstName: 'Sales', lastName: 'One' } }]);
  if (path.startsWith('/api/conversations?')) {
    const params = new URLSearchParams(path.split('?')[1]);
    return Promise.resolve(params.get('whatsappSessionId') === 'user:owner' ? [ownChat] : [teamChat]);
  }
  if (path === '/api/conversations/team-chat') return Promise.resolve(teamChat);
  if (path.startsWith('/api/conversations/sending-status')) return Promise.resolve({ canSend: false });
  throw new Error(`Unexpected API request: ${path}`);
};

let client: QueryClient;
beforeEach(() => {
  mockParams = new URLSearchParams(); mockReplace.mockClear();
  (apiRequest as jest.Mock).mockReset().mockImplementation(fixtureRequest);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => client.clear());
function view() { return <QueryClientProvider client={client}><InboxPage /></QueryClientProvider>; }

it('opens only the signed-in user’s work account and displays the linked number', async () => {
  render(view());
  expect(await screen.findByText('Own contact')).toBeInTheDocument();
  expect(screen.queryByText('Team contact')).not.toBeInTheDocument();
  expect(screen.getByLabelText('WhatsApp account')).toHaveValue('user:owner');
  expect(await screen.findByRole('option', { name: 'My WhatsApp · +900001' })).toBeInTheDocument();
  expect(screen.getByText('Connected')).toBeInTheDocument();
  const lists = (apiRequest as jest.Mock).mock.calls.map(([path]) => path as string).filter(path => path.startsWith('/api/conversations?'));
  expect(lists.length).toBeGreaterThan(0);
  expect(lists.every(path => new URLSearchParams(path.split('?')[1]).get('whatsappSessionId') === 'user:owner')).toBe(true);
});

it('does not show the previous number’s chats while the next account loads', async () => {
  let resolveTeam!: (value: unknown) => void;
  const pendingTeam = new Promise(resolve => { resolveTeam = resolve; });
  (apiRequest as jest.Mock).mockImplementation((path: string) => path.startsWith('/api/conversations?') && path.includes('user%3Asales') ? pendingTeam : fixtureRequest(path));
  const page = render(view());
  await screen.findByText('Own contact');
  await screen.findByRole('option', { name: 'Sales One · +900002' });
  fireEvent.change(screen.getByLabelText('WhatsApp account'), { target: { value: 'user:sales' } });
  page.rerender(view());
  await waitFor(() => expect(screen.queryByText('Own contact')).not.toBeInTheDocument());
  expect(screen.queryByText('Team contact')).not.toBeInTheDocument();
  expect(screen.getByLabelText('WhatsApp account')).toHaveValue('user:sales');
  resolveTeam([teamChat]);
  expect(await screen.findByText('Team contact')).toBeInTheDocument();
  expect(screen.queryByText('Own contact')).not.toBeInTheDocument();
});

it('opens a pipeline conversation on its actual account and removes the old thread when switching', async () => {
  mockParams = new URLSearchParams('c=team-chat');
  const page = render(view());
  await waitFor(() => expect(screen.getByLabelText('WhatsApp account')).toHaveValue('user:sales'));
  expect(screen.queryByText('Own contact')).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('WhatsApp account'), { target: { value: 'user:owner' } });
  expect(mockReplace).toHaveBeenLastCalledWith('/inbox?session=user%3Aowner');
  page.rerender(view());
  expect(await screen.findByText('Own contact')).toBeInTheDocument();
  expect(screen.queryByText('Team contact')).not.toBeInTheDocument();
});

it('does not display a different account’s thread from a conflicting deep link', async () => {
  mockParams = new URLSearchParams('session=user%3Aowner&c=team-chat');
  render(view());
  expect(await screen.findByText('Own contact')).toBeInTheDocument();
  await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('/api/conversations/team-chat', {}, 'fixture'));
  expect(screen.queryByText('Team contact')).not.toBeInTheDocument();
  expect(screen.getByLabelText('WhatsApp account')).toHaveValue('user:owner');
});
