import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  encryptSecret,
  decryptSecret,
  hasDedicatedEncryptionKey,
} from '../common/crypto/secret-box';
import { bookingSchema, flightInstant } from './policy';
import { Prisma } from '@prisma/client';
import { hasPermission } from '@dental-crm/shared';
const json = (v: unknown) => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
type Tokens = { access_token: string; refresh_token?: string; expires_at: number };
@Injectable()
export class GoogleCalendarService {
  private running = false;
  private log = new Logger(GoogleCalendarService.name);
  constructor(
    private db: PrismaService,
    private config: ConfigService,
  ) {}
  private env() {
    return {
      client_id: this.config.get<string>('GOOGLE_CALENDAR_CLIENT_ID'),
      client_secret: this.config.get<string>('GOOGLE_CALENDAR_CLIENT_SECRET'),
      redirect_uri: this.config.get<string>('GOOGLE_CALENDAR_REDIRECT_URI'),
    };
  }
  async status() {
    const c = await this.db.calendarConnection.findUnique({
      where: { id: 'singleton' },
      select: { account: true, calendarId: true, status: true, updatedAt: true },
    });
    return {
      connection: c,
      configured: Object.values(this.env()).every(Boolean) && hasDedicatedEncryptionKey(),
      required: [
        'GOOGLE_CALENDAR_CLIENT_ID',
        'GOOGLE_CALENDAR_CLIENT_SECRET',
        'GOOGLE_CALENDAR_REDIRECT_URI',
        'ENCRYPTION_KEY (32+ characters)',
      ],
      cancellationRule:
        'Delete arrival/departure events without invitation emails; retain CRM records and attachments.',
    };
  }
  async connect(userId: string) {
    if (!(await this.status()).configured)
      throw new BadRequestException('Configure Google OAuth and a dedicated ENCRYPTION_KEY first');
    const state = randomBytes(32).toString('base64url');
    await this.db.calendarOAuthState.create({
      data: {
        hash: createHash('sha256').update(state).digest('hex'),
        userId,
        expiresAt: new Date(Date.now() + 10 * 60000),
      },
    });
    const env = this.env();
    const q = new URLSearchParams({
      client_id: env.client_id!,
      redirect_uri: env.redirect_uri!,
      response_type: 'code',
      access_type: 'offline',
      prompt: 'consent',
      scope:
        'openid email https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.calendarlist.readonly',
      state,
    });
    return { url: 'https://accounts.google.com/o/oauth2/v2/auth?' + q.toString() };
  }
  async callback(code: string, state: string) {
    if (!state || state.length > 200 || !code || code.length > 3000)
      throw new BadRequestException('Invalid OAuth response');
    const hash = createHash('sha256').update(state).digest('hex');
    const record = await this.db.calendarOAuthState.findUnique({ where: { hash } });
    if (!record || record.expiresAt < new Date())
      throw new BadRequestException('OAuth session expired; reconnect from CRM settings');
    const user = await this.db.user.findUnique({
      where: { id: record.userId },
      select: { role: true, isActive: true, accessProfile: { select: { permissions: true } } },
    });
    if (
      !user?.isActive ||
      !['SUPER_ADMIN', 'CLINIC_MANAGER'].includes(user.role) ||
      !hasPermission(
        { role: user.role, permissions: user.accessProfile?.permissions } as never,
        'settings.write',
        true,
      )
    )
      throw new BadRequestException('Administrator access is required');
    const consumed = await this.db.calendarOAuthState.deleteMany({ where: { hash } });
    if (consumed.count !== 1) throw new BadRequestException('OAuth response already used');
    const data = await this.tokenRequest({ code, grant_type: 'authorization_code' });
    if (!data.refresh_token)
      throw new BadRequestException(
        'Offline access was not granted. Revoke this app in Google account settings and reconnect.',
      );
    const profile = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${data.access_token}` },
      signal: AbortSignal.timeout(15000),
    });
    if (!profile.ok) throw new BadRequestException('Google account identity could not be verified');
    const identity = (await profile.json()) as { email?: string; email_verified?: boolean };
    if (!identity.email || !identity.email_verified)
      throw new BadRequestException('A verified Google account is required');
    const existing = await this.db.calendarConnection.findUnique({ where: { id: 'singleton' } });
    if (existing?.account && existing.account !== identity.email && existing.calendarId)
      throw new BadRequestException(
        'Reconnect the same clinic account to preserve existing event ownership. A calendar migration requires an administrator review.',
      );
    await this.db.calendarConnection.upsert({
      where: { id: 'singleton' },
      create: {
        credentials: encryptSecret(JSON.stringify(data)),
        account: identity.email,
        status: 'CONNECTED',
      },
      update: {
        credentials: encryptSecret(JSON.stringify(data)),
        account: identity.email,
        status: 'CONNECTED',
      },
    });
    await this.db.calendarSync.updateMany({
      where: { state: 'DISCONNECTED' },
      data: { state: 'PENDING', nextAt: new Date() },
    });
    return {
      connected: true,
      account: identity.email,
      next: 'Return to Travel settings and select the clinic target calendar.',
    };
  }
  private async tokenRequest(params: Record<string, string>) {
    const env = this.env();
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        ...params,
        client_id: env.client_id!,
        client_secret: env.client_secret!,
        ...(params.grant_type === 'authorization_code' ? { redirect_uri: env.redirect_uri! } : {}),
      }),
      signal: AbortSignal.timeout(15000),
    });
    const data = (await response.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      error?: string;
      scope?: string;
    };
    if (!response.ok || !data.access_token) {
      const error = new ServiceUnavailableException(
        `Google OAuth: ${data.error ?? response.status}. Reconnect the clinic account.`,
      );
      Object.assign(error, {
        permanent: ['invalid_grant', 'invalid_client', 'unauthorized_client'].includes(
          data.error ?? '',
        ),
      });
      throw error;
    }
    if (
      params.grant_type === 'authorization_code' &&
      ![
        'https://www.googleapis.com/auth/calendar.events',
        'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
      ].every((scope) => data.scope?.split(' ').includes(scope))
    )
      throw new BadRequestException(
        'Both calendar permissions must be granted. Reconnect and allow calendar event and calendar list access.',
      );
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Date.now() + (data.expires_in ?? 3600) * 1000,
    };
  }
  private async token() {
    const c = await this.db.calendarConnection.findUnique({ where: { id: 'singleton' } });
    if (!c?.credentials || c.status !== 'CONNECTED')
      throw new ServiceUnavailableException('Google Calendar disconnected');
    let t = JSON.parse(decryptSecret(c.credentials)) as Tokens;
    if (t.expires_at < Date.now() + 60000) {
      try {
        if (!t.refresh_token) throw new Error('Offline token missing');
        const next = await this.tokenRequest({
          refresh_token: t.refresh_token,
          grant_type: 'refresh_token',
        });
        t = { ...next, refresh_token: next.refresh_token ?? t.refresh_token };
        await this.db.calendarConnection.update({
          where: { id: 'singleton' },
          data: { credentials: encryptSecret(JSON.stringify(t)) },
        });
      } catch (e) {
        if ((e as { permanent?: boolean }).permanent || !t.refresh_token)
          await this.db.calendarConnection.update({
            where: { id: 'singleton' },
            data: { status: 'DISCONNECTED' },
          });
        throw e;
      }
    }
    return { token: t.access_token, calendarId: c.calendarId };
  }
  async calendars() {
    const items: { id: string; accessRole: string; summary: string }[] = [];
    let pageToken: string | undefined;
    do {
      const query = new URLSearchParams({ minAccessRole: 'writer', maxResults: '250' });
      if (pageToken) query.set('pageToken', pageToken);
      const page = (await this.request('/users/me/calendarList?' + query, {})) as {
        items?: typeof items;
        nextPageToken?: string;
      };
      items.push(...(page.items ?? []));
      pageToken = page.nextPageToken;
    } while (pageToken);
    return { items };
  }
  async selectCalendar(id: string) {
    if (!id || id.length > 500) throw new BadRequestException('Invalid calendar');
    const list = (await this.calendars()) as { items?: { id: string; accessRole: string }[] };
    if (!list.items?.some((c) => c.id === id && ['owner', 'writer'].includes(c.accessRole)))
      throw new BadRequestException('Choose a writable calendar from the connected account');
    const c = await this.db.calendarConnection.findUnique({ where: { id: 'singleton' } });
    if (
      c?.calendarId &&
      c.calendarId !== id &&
      (await this.db.calendarSync.count({ where: { NOT: { eventIds: { equals: {} } } } }))
    )
      throw new BadRequestException(
        'Existing events belong to the selected calendar; moving them requires an explicit migration',
      );
    await this.db.calendarConnection.update({
      where: { id: 'singleton' },
      data: { calendarId: id },
    });
    await this.db.calendarSync.updateMany({
      where: { state: { in: ['DISCONNECTED', 'FAILED'] } },
      data: { state: 'PENDING', nextAt: new Date(), attempts: 0 },
    });
    return { saved: true };
  }
  async disconnect() {
    await this.db.calendarConnection.updateMany({
      where: { id: 'singleton' },
      data: { credentials: null, status: 'DISCONNECTED' },
    });
    await this.db.calendarSync.updateMany({
      where: { state: { not: 'SYNCED' } },
      data: { state: 'DISCONNECTED', error: 'Clinic account disconnected' },
    });
    return { disconnected: true };
  }
  private async request(path: string, options: RequestInit) {
    const t = await this.token();
    const r = await fetch('https://www.googleapis.com/calendar/v3' + path, {
      ...options,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t.token}` },
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) {
      if (r.status === 401)
        await this.db.calendarConnection.update({
          where: { id: 'singleton' },
          data: { status: 'DISCONNECTED' },
        });
      const error = new Error(`Google Calendar HTTP ${r.status}`) as Error & { status: number };
      error.status = r.status;
      throw error;
    }
    return r.status === 204 ? null : r.json();
  }
  async retry(bookingId: string) {
    await this.db.calendarSync.update({
      where: { bookingId },
      data: { state: 'PENDING', attempts: 0, nextAt: new Date(), error: null },
    });
    return { queued: true };
  }
  @Cron('*/30 * * * * *') async sweep() {
    if (
      this.running ||
      !(
        this.config.get('NODE_ENV') === 'production' ||
        this.config.get('TRAVEL_WORKER_ENABLED') === 'true'
      )
    )
      return;
    this.running = true;
    try {
      await this.run();
    } catch (e) {
      this.log.error((e as Error).message);
    } finally {
      this.running = false;
    }
  }
  async run() {
    await this.db.calendarSync.updateMany({
      where: { state: 'PROCESSING', lockedAt: { lt: new Date(Date.now() - 5 * 60000) } },
      data: { state: 'PENDING', nextAt: new Date() },
    });
    const jobs = await this.db.calendarSync.findMany({
      where: {
        state: { in: ['PENDING', 'FAILED'] },
        nextAt: { lte: new Date() },
        attempts: { lt: 10 },
      },
      orderBy: { nextAt: 'asc' },
      take: 20,
    });
    for (const job of jobs) {
      const lockedAt = new Date();
      const claim = await this.db.calendarSync.updateMany({
        where: {
          bookingId: job.bookingId,
          revision: job.revision,
          state: { in: ['PENDING', 'FAILED'] },
          OR: [{ lockedAt: null }, { lockedAt: { lt: new Date(Date.now() - 5 * 60000) } }],
        },
        data: { state: 'PROCESSING', lockedAt },
      });
      if (!claim.count) continue;
      try {
        await this.sync(job.bookingId, job.revision, job.eventIds);
      } catch (e) {
        const c = await this.db.calendarConnection.findUnique({
          where: { id: 'singleton' },
          select: { status: true, calendarId: true },
        });
        await this.db.calendarSync.updateMany({
          where: { bookingId: job.bookingId, revision: job.revision, state: 'PROCESSING' },
          data: {
            state: c?.status === 'CONNECTED' && c.calendarId ? 'FAILED' : 'DISCONNECTED',
            attempts: { increment: 1 },
            error: (e as Error).message.slice(0, 500),
            nextAt: new Date(Date.now() + Math.min(3600000, 30000 * 2 ** job.attempts)),
            lockedAt: null,
          },
        });
      } finally {
        await this.db.calendarSync.updateMany({
          where: { bookingId: job.bookingId, lockedAt },
          data: { lockedAt: null },
        });
      }
    }
  }
  async sync(bookingId: string, revision: number, previous: Prisma.JsonValue) {
    const booking = await this.db.travelBooking.findUniqueOrThrow({
      where: { id: bookingId },
      include: {
        lead: { select: { assignedTo: { select: { firstName: true, lastName: true } } } },
      },
    });
    if (booking.revision !== revision) return;
    const details = bookingSchema.parse(booking.details);
    const auth = await this.token();
    if (!auth.calendarId) throw new BadRequestException('Select a target clinic calendar');
    const ids = previous as Record<string, string>;
    const root = '/calendars/' + encodeURIComponent(auth.calendarId) + '/events';
    const next = { ...ids };
    for (const kind of ['arrival', 'departure'] as const) {
      const current = await this.db.travelBooking.findUniqueOrThrow({
        where: { id: bookingId },
        select: { revision: true },
      });
      if (current.revision !== revision) return;
      const flight = details[kind];
      const cycle = booking.calendarCycle ?? 1;
      const priorCycle = Number(ids[kind + 'Cycle'] ?? ids.cycle ?? 1);
      if (ids[kind] && priorCycle !== cycle) {
        try {
          await this.request(root + '/' + ids[kind] + '?sendUpdates=none', { method: 'DELETE' });
        } catch (e) {
          if (![404, 410].includes((e as { status?: number }).status ?? 0)) throw e;
        }
        delete next[kind];
        delete next[kind + 'Cycle'];
      }
      const id =
        (priorCycle === cycle ? ids[kind] : undefined) ??
        createHash('sha256')
          .update(bookingId + ':' + kind + ':' + booking.calendarCycle)
          .digest('hex');
      if (['CANCELLED', 'DRAFT'].includes(details.status) || !flight) {
        {
          try {
            await this.request(root + '/' + id + '?sendUpdates=none', { method: 'DELETE' });
          } catch (e) {
            if (![404, 410].includes((e as { status?: number }).status ?? 0)) throw e;
          }
          delete next[kind];
          delete next[kind + 'Cycle'];
          await this.db.calendarSync.updateMany({
            where: { bookingId, revision, state: 'PROCESSING' },
            data: { eventIds: json(next) },
          });
        }
        continue;
      }
      const instant = flightInstant(flight);
      const staff = booking.lead.assignedTo;
      const url = (this.config.get<string>('WEB_APP_URL') ?? '') + '/travel?bookingId=' + bookingId;
      const event = {
        id,
        summary: `Patient ${kind} · Visit ${booking.visit} · ${flight.number}`,
        description: `Salesperson: ${staff ? staff.firstName + ' ' + staff.lastName : 'Unassigned'}\nFlight: ${flight.number} ${flight.origin} → ${flight.destination}\nPassengers: ${details.passengers}\nVisit: ${booking.visit}\nHotel: ${details.hotel.name || 'Not entered'}; ${details.hotel.checkIn || 'Missing check-in'} / ${details.hotel.checkOut || 'Missing check-out'}\nPickup: ${details.readiness.airportPickup?.state || 'MISSING'}\nDeparture transfer: ${details.readiness.airportDeparture?.state || 'MISSING'}\nClinic transfers: ${details.readiness.clinicTransfers?.state || 'MISSING'}\nAppointment: ${details.readiness.appointment?.state || 'MISSING'}\nCRM: ${url}`,
        location: kind === 'arrival' ? flight.destination : flight.origin,
        start: { dateTime: instant.toISOString(), timeZone: flight.timezone },
        end: {
          dateTime: new Date(instant.getTime() + 30 * 60000).toISOString(),
          timeZone: flight.timezone,
        },
        extendedProperties: { private: { crmBookingId: bookingId, crmRevision: String(revision) } },
      };
      try {
        await this.request(root + '/' + id + '?sendUpdates=none', {
          method: 'PUT',
          body: JSON.stringify(event),
        });
      } catch (e) {
        if ((e as { status?: number }).status !== 404) throw e;
        try {
          await this.request(root + '?sendUpdates=none', {
            method: 'POST',
            body: JSON.stringify(event),
          });
        } catch (insertError) {
          if ((insertError as { status?: number }).status !== 409) throw insertError;
          await this.request(root + '/' + id + '?sendUpdates=none', {
            method: 'PUT',
            body: JSON.stringify(event),
          });
        }
      }
      next[kind] = id;
      next[kind + 'Cycle'] = String(cycle);
      await this.db.calendarSync.updateMany({
        where: { bookingId, revision, state: 'PROCESSING' },
        data: { eventIds: json(next) },
      });
    }
    await this.db.calendarSync.updateMany({
      where: { bookingId, revision, state: 'PROCESSING' },
      data: { state: 'SYNCED', error: null, lockedAt: null, eventIds: json(next) },
    });
  }
}
