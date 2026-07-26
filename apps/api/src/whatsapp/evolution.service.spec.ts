import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';

import { WhatsAppService } from './whatsapp.service';
import { EvolutionService } from './evolution.service';

const TOKEN = 'shared-webhook-token';

async function build(overrides: Record<string, string | undefined> = {}) {
  const values: Record<string, string | undefined> = {
    'evolution.url': 'https://wa.example.com/',
    'evolution.apiKey': 'global-key',
    'evolution.instance': 'clinic',
    'evolution.webhookToken': TOKEN,
    ...overrides,
  };
  const storeInbound = jest.fn().mockResolvedValue(undefined);

  const moduleRef = await Test.createTestingModule({
    providers: [
      EvolutionService,
      { provide: ConfigService, useValue: { get: (k: string) => values[k] } },
      { provide: WhatsAppService, useValue: { storeInbound } },
    ],
  }).compile();

  return { service: moduleRef.get(EvolutionService), storeInbound };
}

const upsert = (over: Record<string, unknown> = {}) => ({
  event: 'messages.upsert',
  data: {
    key: { remoteJid: '905551112233@s.whatsapp.net', fromMe: false, id: 'MSG-1' },
    message: { conversation: 'Hello, I would like a quote' },
    ...over,
  },
});

// This endpoint is public and writes into the clinic's conversation history, so what it accepts
// and what it stores are both pinned.
describe('Evolution webhook authorisation', () => {
  it('accepts the configured token', async () => {
    const { service } = await build();
    expect(service.verifyWebhookToken(TOKEN)).toBe(true);
  });

  it('rejects a wrong token, a missing one, and a truncated one', async () => {
    const { service } = await build();
    expect(service.verifyWebhookToken('wrong-token-here')).toBe(false);
    expect(service.verifyWebhookToken(undefined)).toBe(false);
    // Length mismatch must not throw — timingSafeEqual does.
    expect(() => service.verifyWebhookToken('short')).not.toThrow();
    expect(service.verifyWebhookToken('short')).toBe(false);
  });

  it('rejects everything when no token is configured', async () => {
    // An unauthenticated public webhook is a way to write arbitrary conversations into the CRM.
    const { service } = await build({ 'evolution.webhookToken': undefined });
    expect(service.verifyWebhookToken(TOKEN)).toBe(false);
  });
});

describe('Evolution inbound handling', () => {
  it('stores a patient message against their number', async () => {
    const { service, storeInbound } = await build();
    await service.handleWebhook(upsert());

    expect(storeInbound).toHaveBeenCalledWith('905551112233', 'Hello, I would like a quote', 'MSG-1');
  });

  it('reads the caption when a photo arrives', async () => {
    const { service, storeInbound } = await build();
    await service.handleWebhook(upsert({ message: { imageMessage: { caption: 'my x-ray' } } }));

    expect(storeInbound).toHaveBeenCalledWith('905551112233', 'my x-ray', 'MSG-1');
  });

  it('ignores messages the clinic sent itself', async () => {
    // Storing these as patient replies would corrupt the thread and the follow-up timing My Day
    // derives from it.
    const { service, storeInbound } = await build();
    await service.handleWebhook(upsert({ key: { remoteJid: '905551112233@s.whatsapp.net', fromMe: true, id: 'M' } }));

    expect(storeInbound).not.toHaveBeenCalled();
  });

  it('ignores groups and status broadcasts', async () => {
    const { service, storeInbound } = await build();
    await service.handleWebhook(upsert({ key: { remoteJid: '12345@g.us', fromMe: false, id: 'M' } }));

    expect(storeInbound).not.toHaveBeenCalled();
  });

  it('ignores a message with no id, which nothing could deduplicate', async () => {
    const { service, storeInbound } = await build();
    await service.handleWebhook(upsert({ key: { remoteJid: '905551112233@s.whatsapp.net', fromMe: false } }));

    expect(storeInbound).not.toHaveBeenCalled();
  });

  it('ignores events other than messages.upsert', async () => {
    const { service, storeInbound } = await build();
    await service.handleWebhook({ event: 'connection.update', data: {} });

    expect(storeInbound).not.toHaveBeenCalled();
  });
});

describe('Evolution configuration', () => {
  it('is unconfigured without a URL and key', async () => {
    const { service } = await build({ 'evolution.url': undefined });
    expect(service.configured).toBe(false);
    await expect(service.status()).resolves.toMatchObject({ state: 'not_configured' });
  });

  it('reports an unreachable gateway rather than throwing', async () => {
    // This drives a status card; an unreachable gateway is information to show, not an error that
    // should take the settings page down.
    const { service } = await build();
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) as never;

    await expect(service.status()).resolves.toMatchObject({ state: 'unreachable' });
  });
});
