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

it('records both directions with a beep and stable commands, without transcription', async () => {
  const p = provider(); jest.spyOn(p, 'request').mockResolvedValue({ data: { result: 'ok' } });
  await p.record('attempt', 'patient/call');
  expect(p.request).toHaveBeenCalledWith('/calls/patient%2Fcall/actions/record_start', expect.objectContaining({ format: 'mp3', channels: 'dual', play_beep: true, transcription: false, command_id: commandId('attempt', 'record-start') }));
  await p.record('attempt', 'patient/call', true);
  expect(p.request).toHaveBeenLastCalledWith('/calls/patient%2Fcall/actions/record_stop', { command_id: commandId('attempt', 'record-stop') });
});
it('does not return another call’s recording even if provider ignores its filter', async () => {
  const p = provider({ TELNYX_CALL_CONTROL_CONNECTION_ID: 'connection' });
  jest.spyOn(p, 'request').mockResolvedValue({ data: [{ call_control_id: 'other', connection_id: 'connection', status: 'completed', download_urls: { mp3: 'https://example.org/other' } }] });
  await expect(p.recordingUrl('patient-call')).rejects.toThrow('not available');
  expect(p.request).toHaveBeenCalledWith(expect.stringContaining('filter%5Bcall_control_id%5D=patient-call'), undefined, 'GET');
});
it('returns a refreshed HTTPS recording link only for the matching completed call', async () => {
  const p = provider({ TELNYX_CALL_CONTROL_CONNECTION_ID: 'connection' });
  jest.spyOn(p, 'request').mockResolvedValue({ data: [{ call_control_id: 'patient-call', connection_id: 'connection', status: 'completed', download_urls: { mp3: 'https://example.org/private?signature=temporary' } }] });
  expect(await p.recordingUrl('patient-call')).toContain('https://example.org/private');
});
