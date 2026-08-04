import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';

import { PasswordResetService } from './password-reset.service';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';

const activeUser = {
  id: 'user-1',
  email: 'coordinator@clinic.com',
  firstName: 'Ayşe',
  isActive: true,
};

const mockPrisma = {
  user: { findUnique: jest.fn(), update: jest.fn() },
  passwordResetToken: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  refreshToken: { updateMany: jest.fn() },
  auditLog: { create: jest.fn() },
  $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
};

const mockMail = { send: jest.fn().mockResolvedValue(undefined) };
const mockConfig = {
  get: jest.fn((key: string) => ({ webUrl: 'https://crm.example.com' }[key])),
};

/** What the service stores, so a test can hand back the row a raw token would find. */
const hashOf = (raw: string) => createHash('sha256').update(raw).digest('hex');

describe('PasswordResetService', () => {
  let service: PasswordResetService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PasswordResetService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: MailService, useValue: mockMail },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();
    service = module.get(PasswordResetService);
    jest.clearAllMocks();
    mockPrisma.passwordResetToken.create.mockResolvedValue({});
    mockPrisma.passwordResetToken.updateMany.mockResolvedValue({ count: 0 });
  });

  describe('request', () => {
    it('emails a link for a known active account', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(activeUser);

      await service.request(activeUser.email, '1.2.3.4');

      expect(mockMail.send).toHaveBeenCalledTimes(1);
      const sent = mockMail.send.mock.calls[0][0];
      expect(sent.to).toBe(activeUser.email);
      expect(sent.text).toContain('https://crm.example.com/reset-password?token=');
    });

    it('stores only a hash, never the token that was emailed', async () => {
      // A leaked database read must yield nothing redeemable, the same way the password column
      // yields nothing usable.
      mockPrisma.user.findUnique.mockResolvedValue(activeUser);

      await service.request(activeUser.email);

      const stored = mockPrisma.passwordResetToken.create.mock.calls[0][0].data.tokenHash;
      const emailed = (mockMail.send.mock.calls[0][0].text as string).match(/token=([\w-]+)/)![1];
      expect(stored).not.toBe(emailed);
      expect(stored).toBe(hashOf(emailed));
    });

    it('retires any outstanding link before issuing a new one', async () => {
      // Two live links means a stale one in an older email still works — the thing a reset is
      // trying to stop.
      mockPrisma.user.findUnique.mockResolvedValue(activeUser);

      await service.request(activeUser.email);

      expect(mockPrisma.passwordResetToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: activeUser.id, usedAt: null } }),
      );
    });

    it('says nothing and sends nothing for an unknown address', async () => {
      // The observable behaviour must be identical to the success case. C-6 closed a timing oracle
      // on the login form; answering "no such account" here reopens it through another door.
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.request('nobody@example.com')).resolves.toBeUndefined();
      expect(mockMail.send).not.toHaveBeenCalled();
      expect(mockPrisma.passwordResetToken.create).not.toHaveBeenCalled();
    });

    it('treats a deactivated account as unknown', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...activeUser, isActive: false });

      await expect(service.request(activeUser.email)).resolves.toBeUndefined();
      expect(mockMail.send).not.toHaveBeenCalled();
    });

    it('matches the address regardless of case or stray whitespace', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(activeUser);

      await service.request('  Coordinator@Clinic.COM  ');

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'coordinator@clinic.com' },
      });
    });

    it('issues a different token every time', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(activeUser);

      await service.request(activeUser.email);
      await service.request(activeUser.email);

      const [a, b] = mockPrisma.passwordResetToken.create.mock.calls.map(
        (c) => c[0].data.tokenHash,
      );
      expect(a).not.toBe(b);
    });
  });

  describe('reset', () => {
    const liveToken = (overrides = {}) => ({
      id: 'token-1',
      userId: activeUser.id,
      expiresAt: new Date(Date.now() + 30 * 60_000),
      usedAt: null,
      user: activeUser,
      ...overrides,
    });

    it('sets the password and spends the token', async () => {
      mockPrisma.passwordResetToken.findUnique.mockResolvedValue(liveToken());

      await service.reset('raw-token', 'a memorable new phrase');

      const written = mockPrisma.user.update.mock.calls[0][0].data;
      expect(written.passwordHash).toMatch(/^\$2[aby]\$/);
      expect(mockPrisma.passwordResetToken.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'token-1' } }),
      );
    });

    it('ends every session', async () => {
      // A reset is usually done because something is wrong. Leaving the old sessions alive would
      // take away nothing.
      mockPrisma.passwordResetToken.findUnique.mockResolvedValue(liveToken());

      await service.reset('raw-token', 'a memorable new phrase');

      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: activeUser.id, revokedAt: null } }),
      );
    });

    it('clears a lockout, since a reset is the way out of one', async () => {
      // Otherwise someone locked out by an attacker's guessing resets their password and is still
      // shut out for the next hour — exactly when they most need in.
      mockPrisma.passwordResetToken.findUnique.mockResolvedValue(liveToken());

      await service.reset('raw-token', 'a memorable new phrase');

      const written = mockPrisma.user.update.mock.calls[0][0].data;
      expect(written.failedLoginAttempts).toBe(0);
      expect(written.lockedUntil).toBeNull();
    });

    it('audits the reset', async () => {
      mockPrisma.passwordResetToken.findUnique.mockResolvedValue(liveToken());

      await service.reset('raw-token', 'a memorable new phrase', '1.2.3.4', 'Firefox');

      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ action: 'PASSWORD_RESET' }) }),
      );
    });

    it('looks the token up by its hash, not its raw value', async () => {
      mockPrisma.passwordResetToken.findUnique.mockResolvedValue(liveToken());

      await service.reset('raw-token', 'a memorable new phrase');

      expect(mockPrisma.passwordResetToken.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tokenHash: hashOf('raw-token') } }),
      );
    });

    it('refuses an expired link', async () => {
      mockPrisma.passwordResetToken.findUnique.mockResolvedValue(
        liveToken({ expiresAt: new Date(Date.now() - 1000) }),
      );

      await expect(service.reset('raw-token', 'a memorable new phrase')).rejects.toThrow(
        BadRequestException,
      );
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('refuses a link that has already been used', async () => {
      mockPrisma.passwordResetToken.findUnique.mockResolvedValue(
        liveToken({ usedAt: new Date(Date.now() - 60_000) }),
      );

      await expect(service.reset('raw-token', 'a memorable new phrase')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('refuses a token that never existed', async () => {
      mockPrisma.passwordResetToken.findUnique.mockResolvedValue(null);

      await expect(service.reset('made-up', 'a memorable new phrase')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('refuses a valid link belonging to a deactivated account', async () => {
      // Someone disabled between requesting and clicking must not be let back in.
      mockPrisma.passwordResetToken.findUnique.mockResolvedValue(
        liveToken({ user: { ...activeUser, isActive: false } }),
      );

      await expect(service.reset('raw-token', 'a memorable new phrase')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('gives every refusal the same message, so a token cannot be probed', async () => {
      const cases = [
        liveToken({ expiresAt: new Date(Date.now() - 1000) }),
        liveToken({ usedAt: new Date() }),
        null,
        liveToken({ user: { ...activeUser, isActive: false } }),
      ];

      const messages = new Set<string>();
      for (const row of cases) {
        mockPrisma.passwordResetToken.findUnique.mockResolvedValue(row);
        await service.reset('raw-token', 'a memorable new phrase').catch((e: Error) => {
          messages.add(e.message);
        });
      }

      expect(messages.size).toBe(1);
    });
  });
});
