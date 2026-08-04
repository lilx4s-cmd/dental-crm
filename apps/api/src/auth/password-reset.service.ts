import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'node:crypto';
import {
  PASSWORD_RESET_TOKEN_BYTES,
  isRedeemable,
  passwordResetExpiry,
} from '@dental-crm/shared';

import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';

const BCRYPT_ROUNDS = 10;

/**
 * Password reset by emailed link.
 *
 * The gap this closes: there was no way for a staff member to recover a forgotten password. The
 * only remedy was an administrator running an admin reset — and if the administrator was the one
 * locked out, hand-editing the production database.
 *
 * Three properties, each of which is easy to get wrong:
 *
 * 1. **Requesting a reset reveals nothing.** The endpoint answers identically whether or not the
 *    address belongs to anyone. C-6 just closed a timing oracle on the login form; adding a
 *    "no account with that email" here would reopen the same hole through a different door.
 * 2. **Only a hash is stored.** The raw token exists in the email and the URL and nowhere else, so
 *    reading the database gives an attacker nothing they can redeem.
 * 3. **A reset ends every session.** A reset is usually done *because* something is wrong; leaving
 *    the old sessions alive would take away nothing.
 */
@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Sends a reset link, if the address belongs to an active account.
   *
   * Always resolves. The caller returns 204 either way — see property 1 above.
   */
  async request(email: string, ip?: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });

    if (!user || !user.isActive) {
      // Logged, not returned. An operator investigating "I never got the email" needs to see this;
      // the person at the keyboard must not be able to tell it apart from success.
      this.logger.log(`Password reset requested for an unknown or inactive address (ip: ${ip ?? 'unknown'})`);
      return;
    }

    const rawToken = randomBytes(PASSWORD_RESET_TOKEN_BYTES).toString('base64url');
    const now = new Date();

    await this.prisma.$transaction([
      // Any earlier outstanding link is retired. Two live links for one account means a stale one
      // sitting in an older email still works, which is the thing a reset is trying to stop.
      this.prisma.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: now },
      }),
      this.prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: this.hash(rawToken),
          expiresAt: passwordResetExpiry(now),
          requestIp: ip,
        },
      }),
    ]);

    const url = `${this.config.get<string>('webUrl')}/reset-password?token=${rawToken}`;

    await this.mail.send({
      to: user.email,
      subject: 'Reset your Kerem Clinic CRM password',
      text: [
        `Hello ${user.firstName},`,
        '',
        'Someone asked to reset the password on your clinic CRM account. If that was you, open',
        'this link within the next hour:',
        '',
        url,
        '',
        'If it was not you, you can ignore this message — your password has not changed, and',
        'nobody can use this link without your mailbox.',
      ].join('\n'),
    });
  }

  /**
   * Redeems a link and sets the new password.
   *
   * The password itself is validated by `@IsStrongPassword()` on the DTO, so by the time this runs
   * it has already cleared the same policy an admin-set password does.
   */
  async reset(rawToken: string, newPassword: string, ip?: string, userAgent?: string): Promise<void> {
    const now = new Date();
    const stored = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: this.hash(rawToken) },
      include: { user: true },
    });

    if (!isRedeemable(stored, now) || !stored?.user?.isActive) {
      // One message for expired, already used, never existed, and belonging to a disabled account.
      // Distinguishing them would let someone test tokens for validity.
      throw new BadRequestException(
        'This reset link is no longer valid. Request a new one and use the most recent email.',
      );
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: stored.userId },
        data: {
          passwordHash,
          // A reset is the intended way out of a lockout, so it clears one. Otherwise someone
          // locked out by an attacker's guessing would reset their password and still be shut out
          // for the next hour, which is exactly when they most need in.
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      }),
      this.prisma.passwordResetToken.update({ where: { id: stored.id }, data: { usedAt: now } }),
      // Property 3: every session ends. Access tokens live 15 minutes, so this closes renewal
      // rather than cutting off in-flight requests.
      this.prisma.refreshToken.updateMany({
        where: { userId: stored.userId, revokedAt: null },
        data: { revokedAt: now },
      }),
      this.prisma.auditLog.create({
        data: {
          userId: stored.userId,
          action: 'PASSWORD_RESET',
          entityType: 'User',
          entityId: stored.userId,
          ipAddress: ip,
          userAgent,
        },
      }),
    ]);
  }

  /**
   * SHA-256, not bcrypt, and deliberately.
   *
   * bcrypt's slowness defends a *low-entropy* secret — a password someone chose — against offline
   * guessing. This token is 256 bits from a CSPRNG, so there is nothing to guess and the cost buys
   * nothing. It would, however, be paid on every redemption, and the lookup is by hash, which
   * bcrypt's per-row salt makes impossible without scanning every token in the table.
   */
  private hash(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex');
  }
}
