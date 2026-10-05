import { GoogleCalendarService } from './google-calendar.service';
jest.mock('../common/crypto/secret-box', () => ({
  encryptSecret: (s: string) => s,
  decryptSecret: (s: string) => s,
  hasDedicatedEncryptionKey: () => true,
}));
function fixture() {
  const db = {
    calendarConnection: {
      findUnique: jest
        .fn()
        .mockResolvedValue({
          status: 'CONNECTED',
          calendarId: 'clinic',
          credentials: JSON.stringify({
            access_token: 'expired',
            refresh_token: 'offline',
            expires_at: 0,
          }),
        }),
      update: jest.fn(),
    },
    calendarSync: { updateMany: jest.fn() },
    calendarOAuthState: {
      findUnique: jest.fn(),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    user: { findUnique: jest.fn() },
  };
  const service = new GoogleCalendarService(
    db as never,
    {
      get: (key: string) =>
        ({
          GOOGLE_CALENDAR_CLIENT_ID: 'id',
          GOOGLE_CALENDAR_CLIENT_SECRET: 'secret',
          GOOGLE_CALENDAR_REDIRECT_URI: 'https://clinic.example/callback',
        })[key],
    } as never,
  );
  return {
    db,
    service,
    internal: service as unknown as { token: () => Promise<{ token: string; calendarId: string }> },
  };
}
afterEach(() => jest.restoreAllMocks());
it('refreshes expired access tokens and preserves the offline token', async () => {
  const f = fixture();
  jest
    .spyOn(global, 'fetch')
    .mockResolvedValue(
      new Response(JSON.stringify({ access_token: 'renewed', expires_in: 3600 }), { status: 200 }),
    );
  const token = await f.internal.token();
  expect(token.token).toBe('renewed');
  expect(
    JSON.parse(f.db.calendarConnection.update.mock.calls[0][0].data.credentials).refresh_token,
  ).toBe('offline');
});
it('keeps the connection retryable after a temporary Google token failure', async () => {
  const f = fixture();
  jest
    .spyOn(global, 'fetch')
    .mockResolvedValue(
      new Response(JSON.stringify({ error: 'temporarily_unavailable' }), { status: 503 }),
    );
  await expect(f.internal.token()).rejects.toThrow('OAuth');
  expect(f.db.calendarConnection.update).not.toHaveBeenCalled();
});
it('requires reconnection when Google permanently revokes the refresh token', async () => {
  const f = fixture();
  jest
    .spyOn(global, 'fetch')
    .mockResolvedValue(new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 }));
  await expect(f.internal.token()).rejects.toThrow('OAuth');
  expect(f.db.calendarConnection.update).toHaveBeenCalledWith(
    expect.objectContaining({ data: { status: 'DISCONNECTED' } }),
  );
});
it('rejects expired OAuth state before contacting Google', async () => {
  const f = fixture();
  f.db.calendarOAuthState.findUnique.mockResolvedValue({ userId: 'admin', expiresAt: new Date(0) });
  const fetch = jest.spyOn(global, 'fetch');
  await expect(f.service.callback('code', 'state')).rejects.toThrow('expired');
  expect(fetch).not.toHaveBeenCalled();
});
it('rechecks administrator permissions when the Google callback arrives', async () => {
  const f = fixture();
  f.db.calendarOAuthState.findUnique.mockResolvedValue({
    userId: 'admin',
    expiresAt: new Date(Date.now() + 60000),
  });
  f.db.user.findUnique.mockResolvedValue({
    role: 'CLINIC_MANAGER',
    isActive: true,
    accessProfile: { permissions: { 'settings.write': false } },
  });
  const fetch = jest.spyOn(global, 'fetch');
  await expect(f.service.callback('code', 'state')).rejects.toThrow('Administrator');
  expect(fetch).not.toHaveBeenCalled();
});
