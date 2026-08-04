import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { authenticator } from 'otplib';
import * as bcrypt from 'bcrypt';

import { TwoFactorService } from './two-factor.service';
import { PrismaService } from '../prisma/prisma.service';
import { decryptSecret, encryptSecret } from '../common/crypto/secret-box';

const mockPrisma = {
  user: { findUnique: jest.fn(), findUniqueOrThrow: jest.fn(), update: jest.fn() },
  twoFactorRecoveryCode: {
    findMany: jest.fn(),
    createMany: jest.fn(),
    deleteMany: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  auditLog: { create: jest.fn() },
  $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
};

const mockConfig = { get: jest.fn(() => undefined) };

const baseUser = {
  id: 'user-1',
  email: 'dentist@clinic.com',
  passwordHash: '',
  twoFactorSecret: null as string | null,
  twoFactorEnabledAt: null as Date | null,
};

describe('TwoFactorService', () => {
  let service: TwoFactorService;

  beforeAll(async () => {
    // A real key, so encryptSecret/decryptSecret exercise the real path rather than a stub.
    process.env.JWT_ACCESS_SECRET = 'a-test-signing-secret-of-more-than-32-characters';
    baseUser.passwordHash = await bcrypt.hash('the current password', 10);
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TwoFactorService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();
    service = module.get(TwoFactorService);
    jest.clearAllMocks();
    mockPrisma.user.update.mockResolvedValue({});
    mockPrisma.twoFactorRecoveryCode.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.twoFactorRecoveryCode.createMany.mockResolvedValue({ count: 8 });
  });

  describe('enrolment', () => {
    it('stores the secret encrypted, never in clear', async () => {
      // A leaked database read must not hand over the second factor alongside the password hashes,
      // which is the exact situation a second factor exists to survive.
      mockPrisma.user.findUniqueOrThrow.mockResolvedValue(baseUser);

      const { secret } = await service.beginEnrolment('user-1');

      const stored = mockPrisma.user.update.mock.calls[0][0].data.twoFactorSecret;
      expect(stored).not.toContain(secret);
      expect(decryptSecret(stored)).toBe(secret);
    });

    it('does not switch 2FA on until a code is proved', async () => {
      // Enabling on generation is how people lock themselves out: they scan the QR, something goes
      // wrong, and the account now demands codes from an app that never worked.
      mockPrisma.user.findUniqueOrThrow.mockResolvedValue(baseUser);

      await service.beginEnrolment('user-1');

      expect(mockPrisma.user.update.mock.calls[0][0].data.twoFactorEnabledAt).toBeUndefined();
    });

    it('returns a scannable QR and the secret in text', async () => {
      mockPrisma.user.findUniqueOrThrow.mockResolvedValue(baseUser);

      const { qrDataUrl, secret } = await service.beginEnrolment('user-1');

      expect(qrDataUrl).toMatch(/^data:image\/png;base64,/);
      // Shown for anyone whose camera will not cooperate, or on a desktop authenticator.
      expect(secret).toMatch(/^[A-Z2-7]+$/);
    });

    it('refuses to start again for an account that already has 2FA on', async () => {
      mockPrisma.user.findUniqueOrThrow.mockResolvedValue({
        ...baseUser,
        twoFactorEnabledAt: new Date(),
      });

      await expect(service.beginEnrolment('user-1')).rejects.toThrow(BadRequestException);
    });

    it('turns 2FA on and issues recovery codes once a real code verifies', async () => {
      const secret = authenticator.generateSecret();
      mockPrisma.user.findUniqueOrThrow.mockResolvedValue({
        ...baseUser,
        twoFactorSecret: encryptSecret(secret),
      });

      // A genuine TOTP code from the same secret, not a stub — this is the round-trip that
      // matters, and mocking it would test nothing.
      const { recoveryCodes } = await service.confirmEnrolment(
        'user-1',
        authenticator.generate(secret),
      );

      expect(recoveryCodes).toHaveLength(8);
      expect(mockPrisma.user.update.mock.calls[0][0].data.twoFactorEnabledAt).toBeInstanceOf(Date);
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ action: 'TWO_FACTOR_ENABLED' }) }),
      );
    });

    it('rejects a wrong code and leaves 2FA off', async () => {
      mockPrisma.user.findUniqueOrThrow.mockResolvedValue({
        ...baseUser,
        twoFactorSecret: encryptSecret(authenticator.generateSecret()),
      });

      await expect(service.confirmEnrolment('user-1', '000000')).rejects.toThrow(BadRequestException);
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('recovery codes', () => {
    it('stores the same form it later compares, so a code actually works', async () => {
      // The bug this pins: codes are displayed hyphenated (abcde-fghij) and redeemed normalised.
      // Hashing the display form would mean no recovery code ever matched — discovered only at the
      // moment someone has lost their phone and needs one.
      const secret = authenticator.generateSecret();
      mockPrisma.user.findUniqueOrThrow.mockResolvedValue({
        ...baseUser,
        twoFactorSecret: encryptSecret(secret),
      });

      const { recoveryCodes } = await service.confirmEnrolment(
        'user-1',
        authenticator.generate(secret),
      );
      const storedHashes = mockPrisma.twoFactorRecoveryCode.createMany.mock.calls[0][0].data;

      mockPrisma.user.findUnique.mockResolvedValue({
        ...baseUser,
        twoFactorEnabledAt: new Date(),
        twoFactorSecret: encryptSecret(secret),
      });
      mockPrisma.twoFactorRecoveryCode.findMany.mockResolvedValue([
        { id: 'code-1', codeHash: storedHashes[0].codeHash },
      ]);
      mockPrisma.twoFactorRecoveryCode.update.mockResolvedValue({});

      await expect(service.verifyChallenge('user-1', recoveryCodes[0])).resolves.toBe(true);
    });

    it('accepts a code typed without the hyphen, or in capitals', async () => {
      // Someone reading it off paper months later under pressure will not reproduce it exactly.
      const raw = 'abcde-fghij';
      mockPrisma.user.findUnique.mockResolvedValue({
        ...baseUser,
        twoFactorEnabledAt: new Date(),
        twoFactorSecret: encryptSecret(authenticator.generateSecret()),
      });
      mockPrisma.twoFactorRecoveryCode.findMany.mockResolvedValue([
        { id: 'code-1', codeHash: await bcrypt.hash('abcdefghij', 10) },
      ]);
      mockPrisma.twoFactorRecoveryCode.update.mockResolvedValue({});

      await expect(service.verifyChallenge('user-1', raw.toUpperCase())).resolves.toBe(true);
    });

    it('spends a recovery code on use', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...baseUser,
        twoFactorEnabledAt: new Date(),
        twoFactorSecret: encryptSecret(authenticator.generateSecret()),
      });
      mockPrisma.twoFactorRecoveryCode.findMany.mockResolvedValue([
        { id: 'code-1', codeHash: await bcrypt.hash('abcdefghij', 10) },
      ]);
      mockPrisma.twoFactorRecoveryCode.update.mockResolvedValue({});

      await service.verifyChallenge('user-1', 'abcde-fghij');

      expect(mockPrisma.twoFactorRecoveryCode.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'code-1' }, data: { usedAt: expect.any(Date) } }),
      );
    });
  });

  describe('verifyChallenge', () => {
    it('accepts a current TOTP code', async () => {
      const secret = authenticator.generateSecret();
      mockPrisma.user.findUnique.mockResolvedValue({
        ...baseUser,
        twoFactorEnabledAt: new Date(),
        twoFactorSecret: encryptSecret(secret),
      });

      await expect(
        service.verifyChallenge('user-1', authenticator.generate(secret)),
      ).resolves.toBe(true);
    });

    it('refuses when 2FA is not on, whatever the code', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(baseUser);
      await expect(service.verifyChallenge('user-1', '123456')).resolves.toBe(false);
    });

    it('refuses rather than passing when the stored secret will not decrypt', async () => {
      // A wrong key or an edited row must never be treated as a pass; the user falls through to a
      // recovery code, which is the correct outcome.
      mockPrisma.user.findUnique.mockResolvedValue({
        ...baseUser,
        twoFactorEnabledAt: new Date(),
        twoFactorSecret: 'v1.corrupt.corrupt.corrupt',
      });
      mockPrisma.twoFactorRecoveryCode.findMany.mockResolvedValue([]);

      await expect(service.verifyChallenge('user-1', '123456')).resolves.toBe(false);
    });

    it('does not throw on malformed input', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...baseUser,
        twoFactorEnabledAt: new Date(),
        twoFactorSecret: encryptSecret(authenticator.generateSecret()),
      });
      mockPrisma.twoFactorRecoveryCode.findMany.mockResolvedValue([]);

      await expect(service.verifyChallenge('user-1', 'not-a-code!!')).resolves.toBe(false);
    });
  });

  describe('disable', () => {
    it('requires the current password', async () => {
      // An unattended logged-in screen is a realistic way to hold someone else's session. Removing
      // a second factor should cost more than walking past a desk.
      mockPrisma.user.findUniqueOrThrow.mockResolvedValue({
        ...baseUser,
        twoFactorEnabledAt: new Date(),
      });

      await expect(service.disable('user-1', 'the wrong password')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('clears the secret and every recovery code', async () => {
      mockPrisma.user.findUniqueOrThrow.mockResolvedValue({
        ...baseUser,
        twoFactorEnabledAt: new Date(),
      });

      await service.disable('user-1', 'the current password');

      expect(mockPrisma.user.update.mock.calls[0][0].data).toEqual({
        twoFactorSecret: null,
        twoFactorEnabledAt: null,
      });
      expect(mockPrisma.twoFactorRecoveryCode.deleteMany).toHaveBeenCalled();
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ action: 'TWO_FACTOR_DISABLED' }) }),
      );
    });
  });
});
