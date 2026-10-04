import { render, screen, waitFor } from '@testing-library/react';
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
    await screen.findByText('Get a QR code');
    expect((apiRequest as jest.Mock).mock.calls.some(([path]) => path.endsWith('/connect'))).toBe(false);
  });
  it('lets the owner pair a clinic work number and keeps the team oversight panel', async () => {
    mockRole = 'SUPER_ADMIN';
    (apiRequest as jest.Mock).mockImplementation(async (path: string) => path.endsWith('/sessions') ? [] : { sessionId: 'user:test-staff', enabled: true, needsSetup: false, state: 'connected', error: null, linkedNumber: '905550000000' });
    show();
    expect(screen.getByText('Clinic work WhatsApp')).toBeInTheDocument();
    expect(screen.getByText('Team WhatsApp connections')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('+905550000000')).toBeInTheDocument());
  });
});
