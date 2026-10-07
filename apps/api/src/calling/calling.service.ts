import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { JwtPayload, canSeeAllLeads, hasPermission } from '@dental-crm/shared';
import { CallOutcome, Prisma, VoiceAttempt } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { assertPlaceCalls, callableNumber, canPlaceCalls, TERMINAL } from './calling.policy';
import { CallingProviderError, TelnyxProvider } from './telnyx.provider';
const ATTEMPT_SELECT = { id: true, leadId: true, userId: true, phoneNumber: true, status: true, answeredAt: true, endedAt: true, failureReason: true, createdAt: true, callLog: { select: { outcome: true, notes: true, durationSeconds: true } } } as const;
type Tx = Prisma.TransactionClient;
function duplicate(error: unknown) { return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'; }
function eventDate(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.getTime() < Date.now() + 60000 ? date : null;
}
@Injectable()
export class CallingService {
  private readonly logger = new Logger('Calling');
  constructor(private readonly prisma: PrismaService, private readonly provider: TelnyxProvider) {}
  status(user: JwtPayload) {
    const setup = this.provider.setup();
    return { ...setup, canPlaceCalls: canPlaceCalls(user), ...(user.role === 'SUPER_ADMIN' ? {} : { missing: undefined, issues: undefined }) };
  }
  async queue(user: JwtPayload, search = '') {
    if (!hasPermission(user, 'leads.read', ['SUPER_ADMIN', 'SALES_CONSULTANT', 'RECEPTION'].includes(user.role))) return [];
    const own = canSeeAllLeads(user) ? {} : { assignedToId: user.sub };
    const rows = await this.prisma.lead.findMany({
      where: { ...own, status: 'ACTIVE', mergedIntoId: null, phone: { not: null }, ...(search.trim() ? { OR: [{ firstName: { contains: search.trim().slice(0, 100), mode: 'insensitive' } }, { lastName: { contains: search.trim().slice(0, 100), mode: 'insensitive' } }, { phone: { contains: search.trim().slice(0, 100) } }] } : {}) },
      orderBy: { updatedAt: 'desc' }, take: 500,
      select: { id: true, firstName: true, lastName: true, phone: true, country: true, assignedToId: true, patient: { select: { id: true } }, callLogs: { take: 1, orderBy: { occurredAt: 'desc' }, select: { occurredAt: true, outcome: true } } },
    });
    return rows.flatMap(row => { const phone = callableNumber(row.phone, row.country); return phone ? [{ id: row.id, name: `${row.firstName} ${row.lastName ?? ''}`.trim(), phone, patientId: row.patient?.id ?? null, canCall: canPlaceCalls(user) && row.assignedToId === user.sub, lastCall: row.callLogs[0] ?? null }] : []; });
  }
  history(user: JwtPayload) {
    const management = ['SUPER_ADMIN', 'CLINIC_MANAGER'].includes(user.role) && canSeeAllLeads(user);
    return this.prisma.voiceAttempt.findMany({ where: management ? {} : { userId: user.sub }, select: ATTEMPT_SELECT, orderBy: { createdAt: 'desc' }, take: 50 });
  }
  async session(user: JwtPayload) {
    assertPlaceCalls(user); this.provider.assertReady();
    const agent = await this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${user.sub} FOR UPDATE`;
      const existing = await tx.voiceAgent.findUnique({ where: { userId: user.sub } });
      if (existing && existing.expiresAt.getTime() > Date.now() + 5 * 60000) return existing;
      const expiresAt = new Date(Date.now() + 60 * 60000);
      const credential = await this.provider.createCredential(user.sub, expiresAt);
      return tx.voiceAgent.upsert({ where: { userId: user.sub }, create: { userId: user.sub, credentialId: credential.id, sipUsername: credential.sip_username, expiresAt }, update: { credentialId: credential.id, sipUsername: credential.sip_username, expiresAt } });
    }, { timeout: 20000 });
    return { loginToken: await this.provider.token(agent.credentialId), expiresAt: agent.expiresAt };
  }
  private async assertLead(id: string, user: JwtPayload) {
    const lead = await this.prisma.lead.findFirst({ where: { id, assignedToId: user.sub, status: 'ACTIVE', mergedIntoId: null }, select: { id: true, phone: true, country: true } });
    if (!lead) throw new NotFoundException('Assigned active patient record not found.');
    const phone = callableNumber(lead.phone, lead.country);
    if (!phone) throw new BadRequestException('Only valid US and Canadian patient numbers can be called.');
    return phone;
  }
  async start(id: string, leadId: string, user: JwtPayload) {
    assertPlaceCalls(user); this.provider.assertReady();
    const existing = await this.prisma.voiceAttempt.findUnique({ where: { id }, select: ATTEMPT_SELECT });
    if (existing) { if (existing.userId !== user.sub || existing.leadId !== leadId) throw new NotFoundException('Call not found.'); return existing; }
    const phoneNumber = await this.assertLead(leadId, user);
    const agent = await this.prisma.voiceAgent.findUnique({ where: { userId: user.sub } });
    if (!agent || agent.expiresAt.getTime() < Date.now() + 60000) throw new ConflictException('Connect your browser before starting a call.');
    try {
      // The row and active-user reservation exist before any external dial is requested.
      await this.prisma.voiceAttempt.create({ data: { id, userId: user.sub, activeUserId: user.sub, leadId, phoneNumber, staffDestination: `sip:${agent.sipUsername}@sip.telnyx.com` } });
    } catch (error) {
      if (!duplicate(error)) throw error;
      const same = await this.prisma.voiceAttempt.findFirst({ where: { id, userId: user.sub, leadId }, select: ATTEMPT_SELECT });
      if (same) return same;
      throw new ConflictException('You already have an active call. End it before dialing another patient.');
    }
    try {
      await this.locked(id, async (tx, attempt) => {
        if (TERMINAL.includes(attempt.status)) return;
        const callId = await this.provider.dial(id, 'staff', attempt.staffDestination);
        await tx.voiceAttempt.update({ where: { id }, data: { staffCallId: callId } });
      });
    } catch (error) {
      if (error instanceof CallingProviderError && !error.unconfirmed) {
        await this.locked(id, async (tx, attempt) => { if (!TERMINAL.includes(attempt.status)) await this.finish(tx, attempt, 'FAILED', 'FAILED', new Date()); });
        return this.findAttempt(id, user);
      }
      // A timeout can mean Telnyx accepted the call. Keep its reservation until a signed
      // event or the reconciliation worker can close it; never retry with a fresh command.
      await this.prisma.voiceAttempt.updateMany({ where: { id, endedAt: null }, data: { failureReason: 'Call confirmation is delayed. Use End call before trying again.' } });
    }
    return this.findAttempt(id, user);
  }
  async findAttempt(id: string, user: JwtPayload) {
    const result = await this.prisma.voiceAttempt.findFirst({ where: { id, userId: user.sub }, select: ATTEMPT_SELECT });
    if (!result) throw new NotFoundException('Call not found.');
    return result;
  }
  private locked<T>(id: string, work: (tx: Tx, attempt: VoiceAttempt) => Promise<T>) {
    return this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM voice_attempts WHERE id = ${id} FOR UPDATE`;
      const attempt = await tx.voiceAttempt.findUnique({ where: { id } });
      if (!attempt) throw new NotFoundException('Call not found.');
      return work(tx, attempt);
    }, { maxWait: 15000, timeout: 40000 });
  }
  private async finish(tx: Tx, attempt: VoiceAttempt, status: string, outcome: CallOutcome, endedAt: Date, answeredAt = attempt.answeredAt) {
    const durationSeconds = answeredAt ? Math.max(0, Math.floor((endedAt.getTime() - answeredAt.getTime()) / 1000)) : 0;
    const lead = await tx.lead.findUnique({ where: { id: attempt.leadId }, select: { patient: { select: { id: true } } } });
    const log = attempt.callLogId ? null : await tx.callLog.create({ data: { leadId: attempt.leadId, patientId: lead?.patient?.id, userId: attempt.userId, phoneNumber: attempt.phoneNumber, direction: 'OUTBOUND', outcome, durationSeconds, occurredAt: attempt.createdAt } });
    return tx.voiceAttempt.update({ where: { id: attempt.id }, data: { status, activeUserId: null, endedAt, answeredAt, ...(log ? { callLogId: log.id } : {}) } });
  }
  private async endLegs(attempt: VoiceAttempt, except?: string) {
    // Do not hide network errors. A failed stop retains the active-user reservation so
    // another patient cannot be called while a previous call may still be running.
    for (const callId of [attempt.staffCallId, attempt.patientCallId]) {
      if (callId && callId !== except) await this.provider.hangup(attempt.id, callId);
    }
  }
  async stop(id: string, user: JwtPayload) {
    // An actor can always cancel their own call, including after call permissions are revoked.
    await this.findAttempt(id, user);
    await this.locked(id, async (tx, attempt) => {
      if (TERMINAL.includes(attempt.status)) return;
      if (!attempt.staffCallId || (attempt.patientDialUnconfirmed && !attempt.patientCallId)) {
        await this.endLegs(attempt);
        await tx.voiceAttempt.update({ where: { id }, data: { status: 'CANCELLING', failureReason: 'Waiting for calling service to confirm cancellation.' } });
        return;
      }
      await this.endLegs(attempt);
      await this.finish(tx, attempt, 'CANCELLED', attempt.answeredAt ? 'ANSWERED' : 'MISSED', new Date());
    });
    return this.findAttempt(id, user);
  }
  async save(id: string, dto: { outcome?: CallOutcome; notes?: string; followUpAt?: string }, user: JwtPayload) {
    assertPlaceCalls(user); await this.findAttempt(id, user);
    return this.locked(id, async (tx, attempt) => {
      if (!TERMINAL.includes(attempt.status) || !attempt.callLogId) throw new ConflictException('End the call before saving its outcome.');
      await this.assertLead(attempt.leadId, user);
      if (dto.followUpAt && new Date(dto.followUpAt).getTime() <= Date.now()) throw new BadRequestException('Follow-up must be in the future.');
      await tx.callLog.update({ where: { id: attempt.callLogId }, data: { outcome: dto.outcome, notes: dto.notes } });
      if (dto.followUpAt) {
        // A stable id makes a retried save update the existing task instead of duplicating it.
        await tx.leadTask.upsert({ where: { id }, create: { id, leadId: attempt.leadId, title: 'Call follow-up', dueDate: new Date(dto.followUpAt), assignedToId: user.sub, createdById: user.sub }, update: { dueDate: new Date(dto.followUpAt) } });
      }
      return { saved: true };
    });
  }
  async webhook(body: unknown) {
    const data = (body as { data?: { id?: string; event_type?: string; occurred_at?: string; payload?: Record<string, unknown> } })?.data;
    if (!data?.id || typeof data.id !== 'string' || data.id.length > 100 || !data.payload || !data.event_type || !eventDate(data.occurred_at)) throw new BadRequestException('Invalid calling event.');
    const p = data.payload;
    if (p.connection_id !== this.provider.value('TELNYX_CALL_CONTROL_CONNECTION_ID')) return;
    let state: { id?: string; leg?: string };
    try { state = JSON.parse(Buffer.from(String(p.client_state), 'base64').toString()); } catch { return; }
    if (!state || !/^[0-9a-f-]{36}$/i.test(state.id ?? '') || !['staff', 'patient'].includes(state.leg ?? '') || typeof p.call_control_id !== 'string') return;
    const id = state.id!;
    const exists = await this.prisma.voiceAttempt.findUnique({ where: { id } });
    if (!exists) return;
    try {
      await this.locked(id, async (tx, attempt) => {
        await tx.voiceWebhookEvent.create({ data: { id: data.id! } });
        const callId = p.call_control_id as string;
        const leg = state.leg;
        const storedId = leg === 'staff' ? attempt.staffCallId : attempt.patientCallId;
        if (storedId && storedId !== callId) throw new BadRequestException('Call identifier mismatch.');
        if (p.to !== (leg === 'staff' ? attempt.staffDestination : attempt.phoneNumber)) throw new BadRequestException('Call destination mismatch.');
        if (TERMINAL.includes(attempt.status)) {
          if (data.event_type !== 'call.hangup') await this.provider.hangup(id, callId);
          return;
        }
        if (!storedId) {
          await tx.voiceAttempt.update({ where: { id }, data: leg === 'staff' ? { staffCallId: callId } : { patientCallId: callId, patientDialUnconfirmed: false } });
          if (leg === 'staff') attempt.staffCallId = callId; else { attempt.patientCallId = callId; attempt.patientDialUnconfirmed = false; }
        }
        if (attempt.status === 'CANCELLING') {
          if (attempt.patientDialUnconfirmed && leg === 'staff') {
            if (data.event_type !== 'call.hangup') await this.provider.hangup(id, callId);
            return;
          }
          await this.endLegs(attempt, data.event_type === 'call.hangup' ? callId : undefined);
          await this.finish(tx, attempt, 'CANCELLED', 'FAILED', new Date()); return;
        }
        if (data.event_type === 'call.answered' && leg === 'staff' && attempt.status === 'STAFF_RINGING') {
          // Re-check assignment at the actual point a patient is dialed.
          const lead = await tx.lead.findFirst({ where: { id: attempt.leadId, assignedToId: attempt.userId, status: 'ACTIVE', mergedIntoId: null } });
          const staff = await tx.user.findUnique({ where: { id: attempt.userId }, include: { accessProfile: true } });
          const allowed = staff?.isActive && canPlaceCalls({ sub: staff.id, email: staff.email, role: staff.role, permissions: staff.accessProfile?.permissions as Record<string, boolean> | undefined });
          if (!allowed || !lead || callableNumber(lead.phone, lead.country) !== attempt.phoneNumber || !this.provider.setup().ready) {
            await this.endLegs(attempt);
            await this.finish(tx, attempt, 'CANCELLED', 'FAILED', new Date()); return;
          }
          try {
            const patientCallId = await this.provider.dial(id, 'patient', attempt.phoneNumber, callId);
            await tx.voiceAttempt.update({ where: { id }, data: { patientCallId, status: 'PATIENT_RINGING', failureReason: null } });
          } catch (error) {
            if (error instanceof CallingProviderError && !error.unconfirmed) {
              await this.endLegs(attempt);
              await this.finish(tx, attempt, 'FAILED', 'FAILED', new Date());
            } else {
              // Commit the uncertain intent, rather than rolling it back and sending
              // another patient dial on the next staff-answer delivery.
              await tx.voiceAttempt.update({ where: { id }, data: { status: 'PATIENT_CONNECTING', patientDialUnconfirmed: true, failureReason: 'Patient call confirmation is delayed. End the call before trying another patient.' } });
            }
          }
        } else if (data.event_type === 'call.initiated' && leg === 'patient' && attempt.status === 'PATIENT_CONNECTING') {
          await tx.voiceAttempt.update({ where: { id }, data: { status: 'PATIENT_RINGING', failureReason: null } });
        } else if ((data.event_type === 'call.answered' || data.event_type === 'call.bridged') && leg === 'patient') {
          await tx.voiceAttempt.update({ where: { id }, data: { status: 'CONNECTED', answeredAt: attempt.answeredAt ?? eventDate(data.occurred_at) } });
        } else if (data.event_type === 'call.hangup') {
          const answeredAt = attempt.answeredAt ?? (leg === 'patient' ? eventDate(p.answered_time) : null);
          const outcome: CallOutcome = answeredAt ? 'ANSWERED' : leg === 'staff' && !attempt.patientCallId ? 'FAILED' : p.hangup_cause === 'user_busy' ? 'BUSY' : 'MISSED';
          await this.endLegs(attempt, callId);
          await this.finish(tx, attempt, 'ENDED', outcome, eventDate(data.occurred_at)!, answeredAt);
        }
      });
    } catch (error) {
      if (duplicate(error)) return;
      throw error; // non-2xx tells Telnyx to retry; command ids make external actions idempotent
    }
  }
  @Cron('*/1 * * * *')
  async reconcile() {
    if (!this.provider.value('TELNYX_API_KEY')) return;
    const stale = await this.prisma.voiceAttempt.findMany({ where: { activeUserId: { not: null }, createdAt: { lt: new Date(Date.now() - 16 * 60000) } }, take: 20 });
    for (const row of stale) {
      try { await this.locked(row.id, async (tx, attempt) => {
        if (TERMINAL.includes(attempt.status)) return;
        await this.endLegs(attempt);
        await this.finish(tx, attempt, 'FAILED', 'FAILED', new Date());
      }); } catch { this.logger.warn(`Call ${row.id} needs reconciliation; its staff reservation is retained.`); }
    }
    await this.prisma.voiceWebhookEvent.deleteMany({ where: { receivedAt: { lt: new Date(Date.now() - 7 * 86400000) } } });
  }
}
