import { ConfigService } from '@nestjs/config';
import { generateKeyPairSync, sign } from 'crypto';
import { TelnyxProvider, commandId } from './telnyx.provider';
const pair = generateKeyPairSync('ed25519');
const publicKey = pair.publicKey.export({ format: 'der', type: 'spki' }).subarray(-32).toString('base64');
function provider(extra: Record<string, string> = {}) {
  const config = { TELNYX_PUBLIC_KEY: publicKey, ...extra };
  return new TelnyxProvider({ get: (key: string) => config[key as keyof typeof config] } as ConfigService);
}
describe('Telnyx connection safety', () => {
  it('is disabled by default and never exposes API key', () => {
    const result = provider({ TELNYX_API_KEY: 'private-key' }).setup();
    expect(result.ready).toBe(false); expect(JSON.stringify(result)).not.toContain('private-key');
  });
  it('does not activate with missing fields or an insecure webhook', () => {
    expect(provider({ TELNYX_ENABLED: 'true', TELNYX_WEBHOOK_URL: 'http://example.org/api/calling/webhook' }).setup().ready).toBe(false);
  });
  it('verifies exact raw bytes and rejects forged, modified, stale, or absent deliveries', () => {
    const p = provider(); const raw = Buffer.from('{"data":{"id":"event"}}'); const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = sign(null, Buffer.concat([Buffer.from(`${timestamp}|`), raw]), pair.privateKey).toString('base64');
    expect(() => p.verifyWebhook(raw, timestamp, signature)).not.toThrow();
    expect(() => p.verifyWebhook(Buffer.from('different'), timestamp, signature)).toThrow();
    expect(() => p.verifyWebhook(raw, String(Number(timestamp) - 400), signature)).toThrow();
    expect(() => p.verifyWebhook(undefined, timestamp, signature)).toThrow();
  });
  it('uses stable but different command ids per attempt and action', () => {
    expect(commandId('attempt', 'dial-patient')).toBe(commandId('attempt', 'dial-patient'));
    expect(commandId('attempt', 'dial-patient')).not.toBe(commandId('attempt', 'dial-staff'));
  });
  it('never puts the API key in browser authentication', async () => {
    const p = provider(); jest.spyOn(p, 'request').mockResolvedValue('header.payload.signature');
    expect(await p.token('credential')).toBe('header.payload.signature');
    expect(p.request).toHaveBeenCalledWith('/telephony_credentials/credential/token');
  });
});
