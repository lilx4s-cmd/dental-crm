import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';

import { PrismaService } from '../prisma/prisma.service';
import { ConversationsService } from '../conversations/conversations.service';
import { WhatsAppService } from './whatsapp.service';

const APP_SECRET = 'meta-app-secret';

async function serviceWith(overrides: Record<string, string | undefined> = {}) {
  const values: Record<string, string | undefined> = {
    'whatsapp.token': 'token',
    'whatsapp.phoneNumberId': '123456',
    'whatsapp.webhookVerifyToken': 'verify-me',
    'whatsapp.appSecret': APP_SECRET,
    ...overrides,
  };

  const moduleRef = await Test.createTestingModule({
    providers: [
      WhatsAppService,
      { provide: ConfigService, useValue: { get: (k: string) => values[k] } },
      { provide: PrismaService, useValue: {} },
      { provide: ConversationsService, useValue: {} },
    ],
  }).compile();

  return moduleRef.get(WhatsAppService);
}

const sign = (body: Buffer, secret = APP_SECRET) =>
  `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;

// The inbound webhook is public by necessity, so the signature is the only thing standing between
// a real patient message and anyone who has guessed the URL.
describe('WhatsApp webhook signature', () => {
  const body = Buffer.from(JSON.stringify({ entry: [{ changes: [] }] }));

  it('accepts a payload Meta actually signed', async () => {
    const s = await serviceWith();
    expect(s.verifySignature(body, sign(body))).toBe(true);
  });

  it('rejects a payload signed with the wrong secret', async () => {
    const s = await serviceWith();
    expect(s.verifySignature(body, sign(body, 'not-the-secret'))).toBe(false);
  });

  it('rejects a payload that was altered after signing', async () => {
    const s = await serviceWith();
    const signature = sign(body);
    const tampered = Buffer.from(JSON.stringify({ entry: [{ changes: ['injected'] }] }));
    expect(s.verifySignature(tampered, signature)).toBe(false);
  });

  it('rejects a request with no signature at all', async () => {
    const s = await serviceWith();
    expect(s.verifySignature(body, undefined)).toBe(false);
  });

  it('rejects everything when no app secret is configured', async () => {
    // The Facebook webhook waves requests through in this case. Copying that here would leave an
    // open write path into the clinic's conversation history for anyone who found the URL.
    const s = await serviceWith({ 'whatsapp.appSecret': undefined });
    expect(s.verifySignature(body, sign(body))).toBe(false);
  });

  it('survives a signature of the wrong length without throwing', async () => {
    // timingSafeEqual throws on mismatched lengths, so the guard has to come first.
    const s = await serviceWith();
    expect(() => s.verifySignature(body, 'sha256=short')).not.toThrow();
    expect(s.verifySignature(body, 'sha256=short')).toBe(false);
  });
});

describe('WhatsApp handshake', () => {
  it('echoes the challenge when the token matches', async () => {
    const s = await serviceWith();
    expect(s.verifyWebhook('subscribe', 'verify-me', 'challenge-123')).toBe('challenge-123');
  });

  it('refuses a wrong token', async () => {
    const s = await serviceWith();
    expect(s.verifyWebhook('subscribe', 'guess', 'challenge-123')).toBeNull();
  });

  it('refuses when no verify token is configured, rather than accepting any', async () => {
    const s = await serviceWith({ 'whatsapp.webhookVerifyToken': undefined });
    expect(s.verifyWebhook('subscribe', 'anything', 'challenge-123')).toBeNull();
  });
});

describe('WhatsApp status', () => {
  it('reports ready when everything is present', async () => {
    const s = await serviceWith();
    expect(s.status()).toMatchObject({ configured: true, missing: [], canSend: true, canReceive: true });
  });

  it('names what is missing and separates sending from receiving', async () => {
    // Sending and receiving fail independently — a clinic can be able to receive but not reply,
    // and being told only "not configured" would hide which half is broken.
    const s = await serviceWith({ 'whatsapp.token': undefined });
    const status = s.status();

    expect(status.missing).toEqual(['WHATSAPP_CLOUD_API_TOKEN']);
    expect(status.canSend).toBe(false);
    expect(status.canReceive).toBe(true);
  });

  it('never reports the secrets themselves', async () => {
    const s = await serviceWith();
    expect(JSON.stringify(s.status())).not.toContain(APP_SECRET);
  });
});
