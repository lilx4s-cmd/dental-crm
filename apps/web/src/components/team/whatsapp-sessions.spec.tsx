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
    const confirm = jest.spyOn(window, 'confirm').mockReturnValue(true);
    (apiRequest as jest.Mock).mockResolvedValue({ sessionId: 'user:test-staff', enabled: true, needsSetup: false, state: 'disconnected', error: null });
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Sign out & reset' }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('/api/whatsapp/sessions/me/logout', { method: 'POST' }, 'test-token'));
    expect(confirm).toHaveBeenCalled(); confirm.mockRestore();
  });

  it('syncs missing names without requesting a new pairing code', async () => {
    (apiRequest as jest.Mock).mockResolvedValue({ sessionId: 'user:test-staff', enabled: true, needsSetup: false, state: 'connected', error: null, linkedNumber: '12025550100' });
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Sync contact names' }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('/api/whatsapp/sessions/me/sync-contacts', { method: 'POST' }, 'test-token'));
    expect((apiRequest as jest.Mock).mock.calls.some(([path]) => path.endsWith('/new-qr') || path.endsWith('/logout'))).toBe(false);
  });

});
