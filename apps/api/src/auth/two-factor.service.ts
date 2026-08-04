import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { authenticator } from 'otplib';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';
import * as QRCode from 'qrcode';

import { PrismaService } from '../prisma/prisma.service';
import { decryptSecret, encryptSecret } from '../common/crypto/secret-box';

const BCRYPT_ROUNDS = 10;
const RECOVERY_CODE_COUNT = 8;

/**
 * The form a recovery code is stored and compared in.
 *
 * Someone typing a code off a piece of paper months later will include or omit the hyphen, add a
 * space, or use capitals. None of that should be the difference between getting back into the
 * clinic's records and not.
 */
function normaliseRecoveryCode(code: string): string {
  return code.replace(/[\s-]/g, '').toLowerCase();
}

/**
 * TOTP second factor.
 *
 * This system holds passport scans, radiographs and medical histories, and until now one phished
 * password was total access to all of it. A second factor is the difference between a stolen
 * password being a serious incident and being a catastrophe.
 *
 * Enrolment is deliberately two-step: generating a secret does *not* turn 2FA on. The user must
 * first prove their authenticator produces a matching code. Enabling on generation is how people
 * lock themselves out — they scan the QR, something goes wrong, and the account now demands codes
 * from an app that never worked.
 */
@Injectable()
export class TwoFactorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    // A code is only valid for 30 seconds, and clocks drift. One step either side accepts a code
    // up to 30 seconds stale, which covers ordinary phone drift without meaningfully widening the
    // window an attacker has for a code they have somehow observed.
    authenticator.options = { window: 1 };
  }

  /**
   * Starts enrolment: a fresh secret, and a QR to scan.
   *
   * The secret is stored immediately but `twoFactorEnabledAt` stays null, so sign-in is unchanged
   * until `confirm` succeeds. Re-running this before confirming simply replaces the pending
   * secret, which is what someone who scanned it into the wrong phone needs.
   */
  async beginEnrolment(userId: string): Promise<{ secret: string; qrDataUrl: string }> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.twoFactorEnabledAt) {
      throw new BadRequestException('Two-factor authentication is already on for this account.');
    }

    const secret = authenticator.generateSecret();
    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorSecret: encryptSecret(secret) },
    });

    const clinic = this.config.get<string>('mail.from') ? 'Kerem Clinic CRM' : 'Dental CRM';
    const uri = authenticator.keyuri(user.email, clinic, secret);

    return {
      // Shown alongside the QR for anyone whose camera will not cooperate, or who is enrolling a
      // desktop authenticator.
      secret,
      qrDataUrl: await QRCode.toDataURL(uri),
    };
  }

  /**
   * Finishes enrolment once the user proves the app works, and hands back recovery codes.
   *
   * The codes are returned exactly once, in clear, and stored only as hashes — the same bargain as
   * a password. A phone is lost or wiped often enough that 2FA without a recovery path is 2FA that
   * eventually locks a clinic out of its own records.
   */
  async confirmEnrolment(userId: string, code: string, ip?: string): Promise<{ recoveryCodes: string[] }> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.twoFactorEnabledAt) {
      throw new BadRequestException('Two-factor authentication is already on for this account.');
    }
    if (!user.twoFactorSecret) {
      throw new BadRequestException('Start setup again — there is no pending secret for this account.');
    }
    if (!this.verifyTotp(user.twoFactorSecret, code)) {
      throw new BadRequestException('That code is not right. Check the app and try the current code.');
    }

    const codes = Array.from({ length: RECOVERY_CODE_COUNT }, () => this.generateRecoveryCode());
    // Hash the normalised form, which is what redemption compares against. Hashing the hyphenated
    // display form would mean no recovery code ever matched — and the one moment that is
    // discovered is the moment someone has lost their phone and needs it to work.
    const hashes = await Promise.all(codes.map((c) => bcrypt.hash(normaliseRecoveryCode(c), BCRYPT_ROUNDS)));

    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { twoFactorEnabledAt: new Date() } }),
      this.prisma.twoFactorRecoveryCode.deleteMany({ where: { userId } }),
      this.prisma.twoFactorRecoveryCode.createMany({
        data: hashes.map((codeHash) => ({ userId, codeHash })),
      }),
      this.prisma.auditLog.create({
        data: {
          userId,
          action: 'TWO_FACTOR_ENABLED',
          entityType: 'User',
          entityId: userId,
          ipAddress: ip,
        },
      }),
    ]);

    return { recoveryCodes: codes };
  }

  /**
   * Turns 2FA off, which requires the current password.
   *
   * Not merely a session: an unattended logged-in screen is a realistic way for someone to have
   * another person's session, and removing a second factor should cost more than walking past a
   * desk.
   */
  async disable(userId: string, currentPassword: string, ip?: string): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
      throw new UnauthorizedException('That password is not right.');
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { twoFactorSecret: null, twoFactorEnabledAt: null },
      }),
      this.prisma.twoFactorRecoveryCode.deleteMany({ where: { userId } }),
      this.prisma.auditLog.create({
        data: {
          userId,
          action: 'TWO_FACTOR_DISABLED',
          entityType: 'User',
          entityId: userId,
          ipAddress: ip,
        },
      }),
    ]);
  }

  /**
   * Checks a six-digit code, or a recovery code, at sign-in.
   *
   * Recovery codes are tried only when the TOTP code does not match, and each is spent on use.
   */
  async verifyChallenge(userId: string, code: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.twoFactorEnabledAt || !user.twoFactorSecret) return false;

    if (this.verifyTotp(user.twoFactorSecret, code)) return true;

    return this.consumeRecoveryCode(userId, code);
  }

  async isEnabled(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { twoFactorEnabledAt: true },
    });
    return !!user?.twoFactorEnabledAt;
  }

  /** How many recovery codes are left, so the user can be told before they run out. */
  async remainingRecoveryCodes(userId: string): Promise<number> {
    return this.prisma.twoFactorRecoveryCode.count({ where: { userId, usedAt: null } });
  }

  private verifyTotp(encryptedSecret: string, code: string): boolean {
    let secret: string;
    try {
      secret = decryptSecret(encryptedSecret);
    } catch {
      // A secret that will not decrypt — wrong key, or an edited row — must never be treated as a
      // pass. The user falls through to a recovery code, which is the correct outcome.
      return false;
    }
    // otplib throws on malformed input rather than returning false.
    try {
      return authenticator.verify({ token: code.replace(/\s/g, ''), secret });
    } catch {
      return false;
    }
  }

  private async consumeRecoveryCode(userId: string, candidate: string): Promise<boolean> {
    const normalised = normaliseRecoveryCode(candidate);
    const codes = await this.prisma.twoFactorRecoveryCode.findMany({
      where: { userId, usedAt: null },
    });

    for (const stored of codes) {
      if (await bcrypt.compare(normalised, stored.codeHash)) {
        await this.prisma.twoFactorRecoveryCode.update({
          where: { id: stored.id },
          data: { usedAt: new Date() },
        });
        return true;
      }
    }
    return false;
  }

  /**
   * A recovery code: 10 lowercase base32 characters, hyphenated for reading aloud.
   *
   * Base32's alphabet has no 0/O or 1/l, which matters for something a person copies off a screen
   * onto paper and types back months later under pressure.
   */
  private generateRecoveryCode(): string {
    const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789';
    const bytes = randomBytes(10);
    const chars = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
    return `${chars.slice(0, 5)}-${chars.slice(5)}`;
  }
}
