import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

export interface OutboundEmail {
  to: string;
  subject: string;
  /** Plain text is the message. Some staff read mail in clients that never render HTML. */
  text: string;
  html?: string;
}

/**
 * Outbound email.
 *
 * There was no transport of any kind in this API, which is why there was no password reset: a
 * staff member who forgot their password could only be recovered by hand-editing the production
 * database. That is a guaranteed incident, not a hypothetical.
 *
 * SMTP rather than a vendor HTTP API, so the clinic's existing mailbox works without signing up to
 * anything and nothing here is locked to one provider.
 *
 * Two rules that matter more than the plumbing:
 *
 * 1. **Unconfigured must never look like sent.** `send` throws when there is no transport, so a
 *    caller cannot report success for a message nobody will receive. The one exception is
 *    development, where the message is logged in full — that is what makes a reset link testable
 *    on a laptop with no mail server.
 * 2. **A missing mail server must not stop the clinic booting.** Every other integration here
 *    degrades rather than throwing at startup (see env.validation.ts), and mail is no different:
 *    nobody should be unable to see a patient because SMTP is misconfigured.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;

  constructor(private readonly config: ConfigService) {
    const host = this.config.get<string>('mail.host');
    const user = this.config.get<string>('mail.user');
    const password = this.config.get<string>('mail.password');

    if (!host) {
      this.logger.warn(
        'SMTP_HOST is not set — outbound email is disabled. Password reset will refuse rather than fail silently.',
      );
      return;
    }

    this.transporter = nodemailer.createTransport({
      host,
      port: this.config.get<number>('mail.port') ?? 587,
      secure: this.config.get<boolean>('mail.secure') ?? false,
      // A relay on a trusted network legitimately has no credentials; only pass auth when both
      // halves are present, since a half-set pair fails in a way that reads as a server fault.
      auth: user && password ? { user, pass: password } : undefined,
    });
  }

  get isConfigured(): boolean {
    return this.transporter !== null;
  }

  /** Why mail cannot be sent, for a status endpoint or a log line. Null when it can. */
  get unavailableReason(): string | null {
    if (!this.transporter) return 'SMTP_HOST is not configured';
    if (!this.config.get<string>('mail.from')) return 'MAIL_FROM is not configured';
    return null;
  }

  async send(email: OutboundEmail): Promise<void> {
    const from = this.config.get<string>('mail.from');

    if (!this.transporter || !from) {
      // In development the message goes to the log instead. Without this a reset link cannot be
      // exercised on a laptop, and an untestable recovery path is one nobody finds out is broken
      // until the day they need it.
      if (this.config.get<string>('nodeEnv') !== 'production') {
        this.logger.warn(
          `Email not sent (${this.unavailableReason}). In development the message is logged instead:\n` +
            `  To:      ${email.to}\n` +
            `  Subject: ${email.subject}\n` +
            `${email.text.replace(/^/gm, '  ')}`,
        );
        return;
      }
      throw new ServiceUnavailableException(
        'Email is not configured on this server, so this message cannot be sent.',
      );
    }

    await this.transporter.sendMail({
      from,
      to: email.to,
      subject: email.subject,
      text: email.text,
      html: email.html,
    });
  }

  /** Proves the credentials actually work, for a settings screen rather than a guess. */
  async verify(): Promise<{ ok: boolean; detail: string }> {
    if (!this.transporter) return { ok: false, detail: this.unavailableReason ?? 'not configured' };
    try {
      await this.transporter.verify();
      return { ok: true, detail: 'Connected and authenticated.' };
    } catch (error) {
      return { ok: false, detail: error instanceof Error ? error.message : String(error) };
    }
  }
}
