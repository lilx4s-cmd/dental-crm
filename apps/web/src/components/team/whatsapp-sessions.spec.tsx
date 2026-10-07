// Phone fixtures use the reserved NANPA 202-555-0100 through 0199 example range.
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WhatsAppSessions } from './whatsapp-sessions';
import { apiRequest } from '@/lib/api-client';

let mockRole = 'SALES_CONSULTANT';
jest.mock('../../context/auth-context', () => ({ useAuth: () => ({ user: { sub: 'test-staff', role: mockRole }, accessToken: 'test-token' }) }));
jest.mock('../../lib/api-client', () => ({ apiRequest: jest.fn() }));

describe('work WhatsApp setup', () => {
  beforeEach(() => { jest.clearAllMocks(); mockRole = 'SALES_CONSULTANT'; });
  function show() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(<QueryClientProvider client={client}><WhatsAppSessions /></QueryClientProvider>);
  }
  it('prepares a first-time QR once without requiring a Connect click', async () => {
    let state = 'disconnected';
    (apiRequest as jest.Mock).mockImplementation(async (path: string) => {
      if (path.endsWith('/connect')) state = 'awaiting_scan';
      return { sessionId: 'user:test-staff', enabled: true, needsSetup: true, state, linkedNumber: null, error: null, qrDataUrl: state === 'awaiting_scan' ? 'data:image/png;base64,dGVzdA==' : null };
    });
    show();
    expect(await screen.findByAltText('Link your work WhatsApp account')).toBeInTheDocument();
    expect((apiRequest as jest.Mock).mock.calls.filter(([path]) => path.endsWith('/connect'))).toHaveLength(1);
  });
  it('does not automatically reconnect an existing disconnected account', async () => {
    (apiRequest as jest.Mock).mockResolvedValue({ sessionId: 'user:test-staff', enabled: true, needsSetup: false, state: 'disconnected', error: null });
    show();
    await screen.findByText('Get a new QR code');
    expect((apiRequest as jest.Mock).mock.calls.some(([path]) => path.endsWith('/connect'))).toBe(false);
  });
  it('lets the owner pair a clinic work number and keeps the team oversight panel', async () => {
    mockRole = 'SUPER_ADMIN';
    (apiRequest as jest.Mock).mockImplementation(async (path: string) => path.endsWith('/sessions') ? [] : { sessionId: 'user:test-staff', enabled: true, needsSetup: false, state: 'connected', error: null, linkedNumber: '12025550100' });
    show();
    expect(screen.getByText('Clinic work WhatsApp')).toBeInTheDocument();
    expect(screen.getByText('Team WhatsApp connections')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('+12025550100')).toBeInTheDocument());
  });
  it('requests fresh pairing from a stuck connection and displays the returned QR', async () => {
    let paired = false;
    (apiRequest as jest.Mock).mockImplementation(async (path: string) => {
      if (path.endsWith('/new-qr')) paired = true;
      return { sessionId: 'user:test-staff', enabled: true, needsSetup: false, state: paired ? 'awaiting_scan' : 'connecting', error: null, qrDataUrl: paired ? 'data:image/png;base64,dGVzdA==' : null };
    });
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Get a new QR code' }));
    expect(await screen.findByAltText('Link your work WhatsApp account')).toBeInTheDocument();
    expect(apiRequest).toHaveBeenCalledWith('/api/whatsapp/sessions/me/new-qr', { method: 'POST' }, 'test-token');
  });

  it('allows signing out and resetting a disconnected session before requesting a new QR', async () => {
    (apiRequest as jest.Mock).mockResolvedValue({ sessionId: 'user:test-staff', enabled: true, needsSetup: false, state: 'disconnected', error: null });
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Sign out & reset' }));
    expect(screen.getByRole('alertdialog', { name: 'Sign out of WhatsApp?' })).toBeInTheDocument();
    expect((apiRequest as jest.Mock).mock.calls.some(([path]) => path.endsWith('/logout'))).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('/api/whatsapp/sessions/me/logout', { method: 'POST' }, 'test-token'));
  });

  it('can cancel sign-out in the in-app dialog without resetting the session', async () => {
    (apiRequest as jest.Mock).mockResolvedValue({ sessionId: 'user:test-staff', enabled: true, needsSetup: false, state: 'connected', error: null });
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Sign out & reset' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect((apiRequest as jest.Mock).mock.calls.some(([path]) => path.endsWith('/logout'))).toBe(false);
  });

  it('keeps saved chat counts visible when sign-out returns a partial session status', async () => {
    let signedOut = false;
    let finishRefetch!: (value: unknown) => void;
    (apiRequest as jest.Mock).mockImplementation(async (path: string) => {
      if (path.endsWith('/logout')) { signedOut = true; return { sessionId: 'user:test-staff', enabled: true, needsSetup: false, state: 'disconnected', linkedNumber: null, error: null }; }
      if (signedOut) return new Promise(resolve => { finishRefetch = resolve; });
      return { sessionId: 'user:test-staff', enabled: true, needsSetup: false, state: 'connected', storedConversations: 12, storedMessages: 80, error: null };
    });
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Sign out & reset' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByText('Disconnected')).toBeInTheDocument();
    expect(screen.getByText('Saved chats: 12')).toBeInTheDocument();
    expect((apiRequest as jest.Mock).mock.calls.some(([path]) => path.endsWith('/connect'))).toBe(false);
    finishRefetch({ sessionId: 'user:test-staff', enabled: true, needsSetup: false, state: 'disconnected', storedConversations: 12, storedMessages: 80, error: null });
  });

  it('confirms and disconnects the selected team member', async () => {
    mockRole = 'CLINIC_MANAGER';
    let signedOut = false;
    (apiRequest as jest.Mock).mockImplementation(async (path: string) => {
      const session = { sessionId: 'user:colleague', user: { id: 'colleague', firstName: 'Example', lastName: 'Staff' }, enabled: true, state: signedOut ? 'disconnected' : 'connected', error: null };
      if (path.endsWith('/logout')) { signedOut = true; return { ...session, state: 'disconnected' }; }
      return [session];
    });
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Disconnect' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('/api/whatsapp/sessions/colleague/logout', { method: 'POST' }, 'test-token'));
    expect(await screen.findByText('Disconnected')).toBeInTheDocument();
  });

  it('syncs missing names without requesting a new pairing code', async () => {
    (apiRequest as jest.Mock).mockResolvedValue({ sessionId: 'user:test-staff', enabled: true, needsSetup: false, state: 'connected', error: null, linkedNumber: '12025550100' });
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Sync contact names' }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('/api/whatsapp/sessions/me/sync-contacts', { method: 'POST' }, 'test-token'));
    expect((apiRequest as jest.Mock).mock.calls.some(([path]) => path.endsWith('/new-qr') || path.endsWith('/logout'))).toBe(false);
  });

});
