// Phone fixtures use the reserved NANPA 202-555-0100 through 0199 example range.
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WhatsAppWebCard } from './whatsapp-web-card';
import { apiRequest } from '@/lib/api-client';

jest.mock('../../context/auth-context', () => ({ useAuth: () => ({ accessToken: 'test-token' }) }));
jest.mock('../../lib/api-client', () => ({ apiRequest: jest.fn() }));

describe('shared clinic WhatsApp recovery', () => {
  beforeEach(() => jest.clearAllMocks());
  function show() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(<QueryClientProvider client={client}><WhatsAppWebCard /></QueryClientProvider>);
  }
  it('requests a fresh QR even when the old connection is stuck on Connecting', async () => {
    let prepared = false;
    (apiRequest as jest.Mock).mockImplementation(async (path: string) => {
      if (path.endsWith('/new-qr')) prepared = true;
      return { enabled: true, state: prepared ? 'awaiting_scan' : 'connecting', qrDataUrl: prepared ? 'data:image/png;base64,dGVzdA==' : null };
    });
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Get a new QR code' }));
    expect(await screen.findByAltText('WhatsApp pairing QR code')).toBeInTheDocument();
    expect(apiRequest).toHaveBeenCalledWith('/api/whatsapp/web/new-qr', { method: 'POST' }, 'test-token');
  });
  it('can sign out and reset a disconnected shared session', async () => {
    (apiRequest as jest.Mock).mockResolvedValue({ enabled: true, state: 'disconnected', qrDataUrl: null });
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Sign out & reset' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('/api/whatsapp/web/logout', { method: 'POST' }, 'test-token'));
  });
  it('can start syncing names while the phone stays linked', async () => {
    (apiRequest as jest.Mock).mockResolvedValue({ enabled: true, state: 'connected', linkedNumber: '12025550100' });
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Sync contact names' }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('/api/whatsapp/web/sync-contacts', { method: 'POST' }, 'test-token'));
    expect((apiRequest as jest.Mock).mock.calls.some(([path]) => path.endsWith('/logout'))).toBe(false);
  });
});
