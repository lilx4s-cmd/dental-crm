import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CallingPage from './page';
import { apiRequest } from '@/lib/api-client';
const mockAuth = { user: { sub: 'staff', role: 'SALES_CONSULTANT', permissions: {} as Record<string, boolean> }, accessToken: 'test-token' };
const mockHandlers: Record<string, (event?: unknown) => void> = {};
const mockDisconnect = jest.fn();
const mockConnect = jest.fn(async () => mockHandlers['telnyx.ready']());
jest.mock('@/context/auth-context', () => ({ useAuth: () => mockAuth }));
jest.mock('@/lib/api-client', () => ({ apiRequest: jest.fn(), ApiError: class extends Error {} }));
jest.mock('@telnyx/webrtc', () => ({ TelnyxRTC: jest.fn().mockImplementation(() => ({ on: (name: string, fn: (event?: unknown) => void) => { mockHandlers[name] = fn; }, connect: mockConnect, disconnect: mockDisconnect })) }));
jest.mock('sonner', () => ({ toast: { error: jest.fn(), success: jest.fn() } }));
const row = { id: 'lead', name: 'Example Patient', phone: '+12025550100', canCall: true, lastCall: null };
let ready = false;
let rows = [row];
let attempt: Record<string, unknown> | null;
const mockGetUserMedia = jest.fn(async () => ({ getTracks: () => [{ stop: jest.fn() }] }));
function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return { ...render(<QueryClientProvider client={client}><CallingPage /></QueryClientProvider>), client };
}
beforeEach(() => {
  Object.defineProperty(crypto, 'randomUUID', { configurable: true, value: () => 'b87d7a66-5f64-47c0-a4d9-9b1503870100' });
  jest.clearAllMocks(); ready = false; attempt = null; rows = [row];
  mockAuth.user = { sub: 'staff', role: 'SALES_CONSULTANT', permissions: {} };
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: mockGetUserMedia } });
  (apiRequest as jest.Mock).mockImplementation(async (path: string, options?: RequestInit) => {
    if (path.endsWith('/status')) return { ready, canPlaceCalls: mockAuth.user.role === 'SALES_CONSULTANT', configured: ready, enabled: ready, callerNumber: null };
    if (path.includes('/queue')) return rows;
    if (path.endsWith('/history')) return [];
    if (path.endsWith('/session')) return { loginToken: 'temporary-token' };
    if (path.endsWith('/attempts') && options?.method === 'POST') { const { id } = JSON.parse(options.body as string); attempt = { id, leadId: 'lead', userId: 'staff', phoneNumber: row.phone, status: 'STAFF_RINGING', callLog: null }; return attempt; }
    if (path.includes('/attempts/')) return attempt;
    return {};
  });
});
it('shows activation status and does not request microphone or a token on page load', async () => {
  show(); expect(await screen.findByText('Calling awaits clinic activation')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Connect headset' })).toBeDisabled();
  expect(mockGetUserMedia).not.toHaveBeenCalled();
  expect((apiRequest as jest.Mock).mock.calls.some(([path]) => path.endsWith('/session'))).toBe(false);
});
it('keeps the owner read-only', async () => {
  mockAuth.user.role = 'SUPER_ADMIN'; show(); await screen.findByText('Calling awaits clinic activation');
  expect(screen.queryByRole('button', { name: 'Connect headset' })).not.toBeInTheDocument();
  expect(mockGetUserMedia).not.toHaveBeenCalled();
});
it('connects only on request, dials an assigned patient, and stops on leaving the page', async () => {
  ready = true; const view = show();
  fireEvent.click(await screen.findByRole('button', { name: 'Connect headset' }));
  await screen.findByRole('button', { name: 'Headset connected' });
  fireEvent.click(screen.getByRole('button', { name: /Example Patient/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Call patient' }));
  await waitFor(() => expect((apiRequest as jest.Mock).mock.calls.some(([path, options]) => path.endsWith('/attempts') && options.method === 'POST')).toBe(true));
  view.unmount();
  expect(mockDisconnect).toHaveBeenCalled();
  expect((apiRequest as jest.Mock).mock.calls.some(([path, options]) => path.endsWith('/stop') && options.keepalive)).toBe(true);
});
it('does not interrupt a call when the access token refreshes', async () => {
  ready = true; const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree = () => <QueryClientProvider client={client}><CallingPage /></QueryClientProvider>;
  const view = render(tree()); fireEvent.click(await screen.findByRole('button', { name: 'Connect headset' }));
  await screen.findByRole('button', { name: 'Headset connected' });
  mockAuth.accessToken = 'refreshed-token'; view.rerender(tree());
  expect(mockDisconnect).not.toHaveBeenCalled();
  mockAuth.accessToken = 'test-token';
});

it('starts the next staff-first attempt only after staff saves and enables queue advancement', async () => {
  ready = true; rows = [row, { ...row, id: 'lead-2', name: 'Second Patient' }];
  const view = show(); fireEvent.click(await screen.findByRole('button', { name: 'Connect headset' }));
  await screen.findByRole('button', { name: 'Headset connected' });
  fireEvent.click(screen.getByRole('button', { name: /Example Patient/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Call patient' }));
  await screen.findByText('Answer on your headset to dial the patient');
  await waitFor(() => expect(attempt).not.toBeNull());
  attempt = { ...attempt, status: 'ENDED', callLog: { outcome: 'MISSED', notes: null, durationSeconds: 0 } };
  await act(async () => { view.client.setQueryData(['calling-attempt', 'staff', attempt?.id], attempt); });
  expect((apiRequest as jest.Mock).mock.calls.filter(([path]) => path.endsWith('/attempts'))).toHaveLength(1);
  fireEvent.click(await screen.findByRole('checkbox', { name: 'Call next patient after saving' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save call outcome' }));
  await waitFor(() => expect((apiRequest as jest.Mock).mock.calls.filter(([path]) => path.endsWith('/attempts'))).toHaveLength(2));
  const starts = (apiRequest as jest.Mock).mock.calls.filter(([path]) => path.endsWith('/attempts'));
  expect(JSON.parse(starts[1][1].body).leadId).toBe('lead-2');
});

it('requires explicit consent, shows recording status, and loads playback only on request', async () => {
  ready = true;
  const original = (apiRequest as jest.Mock).getMockImplementation()!;
  (apiRequest as jest.Mock).mockImplementation(async (path: string, options?: RequestInit) => {
    if (path.endsWith('/recording/stop')) { attempt = { ...attempt, recordingStatus: 'STOPPED' }; return attempt; }
    if (path.endsWith('/recording') && options?.method === 'POST') { attempt = { ...attempt, recordingStatus: 'RECORDING', recordingConsentAt: new Date().toISOString() }; return attempt; }
    if (path.endsWith('/recording')) return { url: 'https://example.org/temporary-audio' };
    if (path.endsWith('/history')) return attempt?.recordingConsentAt ? [attempt] : [];
    return original(path, options);
  });
  const view = show();
  fireEvent.click(await screen.findByRole('button', { name: 'Connect headset' }));
  await screen.findByRole('button', { name: 'Headset connected' });
  fireEvent.click(screen.getByRole('button', { name: /Example Patient/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Call patient' }));
  await screen.findByText('Answer on your headset to dial the patient');
  attempt = { ...attempt, status: 'CONNECTED', recordingStatus: 'NONE' };
  act(() => view.client.setQueryData(['calling-attempt', 'staff', 'b87d7a66-5f64-47c0-a4d9-9b1503870100'], attempt));
  const start = await screen.findByRole('button', { name: 'Start recording' });
  expect(start).toBeDisabled();
  fireEvent.click(screen.getByLabelText('Patient agreed to recording'));
  fireEvent.click(start);
  await screen.findByText('Recording is active');
  expect((apiRequest as jest.Mock).mock.calls.some(([path, options]) => path.endsWith('/recording') && options?.body === JSON.stringify({ consent: true }))).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Stop recording' }));
  await screen.findByText('Recording stopped');
  attempt = { ...attempt, status: 'ENDED' };
  act(() => view.client.setQueryData(['calling-attempt', 'staff', 'b87d7a66-5f64-47c0-a4d9-9b1503870100'], attempt));
  expect(screen.queryByLabelText('Saved call recording')).not.toBeInTheDocument();
  fireEvent.click(await screen.findByRole('button', { name: 'Listen to recording' }));
  const audio = await screen.findByLabelText('Saved call recording');
  expect(audio).toHaveAttribute('src', 'https://example.org/temporary-audio');
  expect(audio).not.toHaveAttribute('autoplay');
});
