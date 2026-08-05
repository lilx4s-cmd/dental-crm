import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';

import { FacebookService } from './facebook.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  lead: { create: jest.fn(), findFirst: jest.fn() },
  campaign: { findFirst: jest.fn() },
};

let settings: Record<string, string | undefined> = {};
const mockConfig = { get: (key: string) => settings[key] };

/** The shape Meta actually posts: identifiers nested under changes[].value, and no answers. */
function webhookBody(value: Record<string, unknown>, field = 'leadgen') {
  return { object: 'page', entry: [{ id: '1', time: 1, changes: [{ field, value }] }] };
}

function graphResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

describe('FacebookService', () => {
  let service: FacebookService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FacebookService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();
    service = module.get(FacebookService);
    jest.clearAllMocks();
    settings = { FACEBOOK_PAGE_ACCESS_TOKEN: 'page-token' };
    mockPrisma.lead.findFirst.mockResolvedValue(null);
    mockPrisma.lead.create.mockResolvedValue({ id: 'lead-1' });
    mockPrisma.campaign.findFirst.mockResolvedValue(null);
    global.fetch = jest.fn() as unknown as typeof fetch;
  });

  describe('payload shape', () => {
    it('reads leadgen_id from changes[].value, where Meta actually puts it', async () => {
      // The bug this replaces: the old code read `entry.leadgen_id` and `entry.field_data`
      // directly off the entry. Neither exists, so `if (!entry.leadgen_id) continue` skipped every
      // delivery and the integration silently created nothing — confirmed against production,
      // where zero leads carry a leadgen_id.
      (global.fetch as jest.Mock).mockResolvedValue(
        graphResponse({ id: 'L1', field_data: [{ name: 'full_name', values: ['Ahmed Al-Rashid'] }] }),
      );

      await service.handleLeadGenEvent(webhookBody({ leadgen_id: 'L1', form_id: 'F1' }));

      expect(mockPrisma.lead.create).toHaveBeenCalledTimes(1);
      expect(mockPrisma.lead.create.mock.calls[0][0].data.firstName).toBe('Ahmed');
    });

    it('ignores the other things a page subscription delivers', async () => {
      // Comments, mentions and ratings arrive on the same webhook. They are not malformed leads.
      await service.handleLeadGenEvent(webhookBody({ comment_id: 'C1' } as never, 'feed'));
      expect(mockPrisma.lead.create).not.toHaveBeenCalled();
    });

    it('survives an empty or malformed body', async () => {
      await expect(service.handleLeadGenEvent({})).resolves.toBeUndefined();
      await expect(service.handleLeadGenEvent({ entry: [{}] })).resolves.toBeUndefined();
      expect(mockPrisma.lead.create).not.toHaveBeenCalled();
    });
  });

  describe('fetching the answers', () => {
    it('calls the Graph API for the fields the webhook does not carry', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(
        graphResponse({
          id: 'L1',
          field_data: [
            { name: 'first_name', values: ['Ahmed'] },
            { name: 'last_name', values: ['Al-Rashid'] },
            { name: 'email', values: ['ahmed@example.com'] },
            { name: 'phone_number', values: ['+966555123456'] },
          ],
        }),
      );

      await service.handleLeadGenEvent(webhookBody({ leadgen_id: 'L1' }));

      const url = (global.fetch as jest.Mock).mock.calls[0][0] as string;
      expect(url).toContain('/L1?');
      expect(url).toContain('field_data');

      const data = mockPrisma.lead.create.mock.calls[0][0].data;
      expect(data.firstName).toBe('Ahmed');
      expect(data.lastName).toBe('Al-Rashid');
      expect(data.email).toBe('ahmed@example.com');
    });

    it('reads the country from the number\'s own dialling code', async () => {
      // So a Saudi lead is not filed as Turkish — the bug the country column exists to prevent.
      (global.fetch as jest.Mock).mockResolvedValue(
        graphResponse({ id: 'L1', field_data: [{ name: 'phone_number', values: ['+966 55 512 3456'] }] }),
      );

      await service.handleLeadGenEvent(webhookBody({ leadgen_id: 'L1' }));

      const data = mockPrisma.lead.create.mock.calls[0][0].data;
      expect(data.country).toBe('SA');
      expect(data.phone).toBe('966555123456');
    });

    it('does not guess a country from a local-format number', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(
        graphResponse({ id: 'L1', field_data: [{ name: 'phone_number', values: ['055 512 3456'] }] }),
      );

      await service.handleLeadGenEvent(webhookBody({ leadgen_id: 'L1' }));
      expect(mockPrisma.lead.create.mock.calls[0][0].data.country).toBeUndefined();
    });

    it('keeps answers it has no column for, rather than discarding them', async () => {
      // On an Arabic-language form the field names are Arabic, so this is where the answers are.
      (global.fetch as jest.Mock).mockResolvedValue(
        graphResponse({
          id: 'L1',
          field_data: [
            { name: 'full_name', values: ['Ahmed'] },
            { name: 'كم عدد الأسنان', values: ['12'] },
          ],
        }),
      );

      await service.handleLeadGenEvent(webhookBody({ leadgen_id: 'L1' }));
      expect(mockPrisma.lead.create.mock.calls[0][0].data.notes).toContain('12');
    });
  });

  describe('when the Graph call cannot be made', () => {
    it('still records the enquiry, with the identifiers to find it in Meta', async () => {
      // Silently dropping it is what the old code did. An empty lead that says why is recoverable;
      // a lead that never existed is not.
      settings = {};

      await service.handleLeadGenEvent(webhookBody({ leadgen_id: 'L1', ad_id: 'A1' }));

      expect(mockPrisma.lead.create).toHaveBeenCalledTimes(1);
      const data = mockPrisma.lead.create.mock.calls[0][0].data;
      expect(data.notes).toContain('leadgen_id: L1');
      expect(data.notes).toContain('ad_id: A1');
      expect(data.notes).toMatch(/could not be fetched/i);
    });

    it('records it when the Graph API refuses', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(graphResponse({ error: 'nope' }, false, 403));

      await service.handleLeadGenEvent(webhookBody({ leadgen_id: 'L1' }));
      expect(mockPrisma.lead.create).toHaveBeenCalledTimes(1);
    });

    it('records it when the Graph API is unreachable', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('ETIMEDOUT'));

      await service.handleLeadGenEvent(webhookBody({ leadgen_id: 'L1' }));
      expect(mockPrisma.lead.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('retries', () => {
    it('does not create a second deal for a leadgen_id already captured', async () => {
      // Meta re-sends any delivery it did not get a 200 for. Two deals for one enquiry costs two
      // salespeople's time and telephones the patient twice.
      mockPrisma.lead.findFirst.mockResolvedValue({ id: 'existing' });

      await service.handleLeadGenEvent(webhookBody({ leadgen_id: 'L1' }));
      expect(mockPrisma.lead.create).not.toHaveBeenCalled();
    });

    it('keeps processing the other leads when one fails', async () => {
      // A batch that threw halfway would be re-sent whole, duplicating whatever it had stored.
      (global.fetch as jest.Mock).mockResolvedValue(graphResponse({ id: 'L', field_data: [] }));
      mockPrisma.lead.create
        .mockRejectedValueOnce(new Error('constraint violation'))
        .mockResolvedValueOnce({ id: 'lead-2' });

      await service.handleLeadGenEvent({
        entry: [
          { changes: [{ field: 'leadgen', value: { leadgen_id: 'L1' } }] },
          { changes: [{ field: 'leadgen', value: { leadgen_id: 'L2' } }] },
        ],
      });

      expect(mockPrisma.lead.create).toHaveBeenCalledTimes(2);
    });
  });

  describe('signature verification', () => {
    it('refuses everything when no app secret is configured', () => {
      // An integration nobody finished setting up must not accept payloads from whoever finds the
      // URL. This returned true when unconfigured.
      expect(service.verifySignature(Buffer.from('{}'), 'sha256=whatever')).toBe(false);
    });

    it('refuses a missing body or signature', () => {
      expect(service.verifySignature(undefined, 'sha256=x')).toBe(false);
      expect(service.verifySignature(Buffer.from('{}'), undefined)).toBe(false);
    });
  });

  describe('webhook handshake', () => {
    it('refuses when no verify token is configured', () => {
      settings = {};
      expect(service.verifyWebhook('subscribe', '', 'challenge')).toBeNull();
    });

    it('echoes the challenge for the right token', () => {
      settings = { FACEBOOK_WEBHOOK_VERIFY_TOKEN: 'secret' };
      expect(service.verifyWebhook('subscribe', 'secret', 'challenge')).toBe('challenge');
      expect(service.verifyWebhook('subscribe', 'wrong', 'challenge')).toBeNull();
    });
  });
});
