import { CallingService } from './calling.service';
import { PrismaService } from '../prisma/prisma.service';
import { TelnyxProvider } from './telnyx.provider';
import { JwtPayload, Role } from '@dental-crm/shared';
const user = { sub: 'staff', role: Role.SALES_CONSULTANT, email: 'staff@example.org' } as JwtPayload;
const id = 'b87d7a66-5f64-47c0-a4d9-9b1503870100';
function fixture(status = 'STAFF_RINGING') {
  const row = { id, userId: 'staff', leadId: 'lead', phoneNumber: '+12025550100', staffDestination: 'sip:agent@sip.telnyx.com', staffCallId: 'staff-call', patientCallId: null as string | null, patientDialUnconfirmed: false, recordingStatus: 'NONE', recordingConsentAt: null as Date | null, status, activeUserId: 'staff', answeredAt: null, endedAt: null, callLogId: null, createdAt: new Date() };
  const voiceAttempt = { findUnique: jest.fn(async () => ({ ...row })), findFirst: jest.fn(async () => ({ ...row })), findMany: jest.fn(async () => []), create: jest.fn(), updateMany: jest.fn(), update: jest.fn(async ({ data }) => Object.assign(row, data)) };
  const tx = { voiceAttempt, $queryRaw: jest.fn(), voiceWebhookEvent: { create: jest.fn() }, user: { findUnique: jest.fn(async () => ({ id: 'staff', role: Role.SALES_CONSULTANT, email: user.email, isActive: true, accessProfile: null })) }, lead: { findFirst: jest.fn(async () => ({ id: 'lead', phone: '+12025550100', country: 'US' })), findUnique: jest.fn(async () => ({ patient: null })) }, callLog: { create: jest.fn(async () => ({ id: 'log' })), update: jest.fn() }, leadTask: { upsert: jest.fn() } };
  const prisma = { ...tx, voiceAgent: { findUnique: jest.fn(async () => ({ sipUsername: 'agent', expiresAt: new Date(Date.now() + 3600000) })) }, $transaction: jest.fn(async work => work(tx)) };
  const provider = { assertReady: jest.fn(), setup: jest.fn(() => ({ ready: true })), value: jest.fn(() => 'connection'), dial: jest.fn(async () => 'patient-call'), hangup: jest.fn(async () => undefined), record: jest.fn(async () => undefined), recordingUrl: jest.fn(async () => 'https://example.org/private-recording') };
  const service = new CallingService(prisma as unknown as PrismaService, provider as unknown as TelnyxProvider);
  const event = (type: string, leg = 'staff', callId = 'staff-call') => ({ data: { id: `event-${type}-${leg}`, event_type: type, occurred_at: new Date().toISOString(), payload: { connection_id: 'connection', to: leg === 'staff' ? row.staffDestination : row.phoneNumber, call_control_id: callId, client_state: Buffer.from(JSON.stringify({ id, leg })).toString('base64') } } });
  return { row, tx, prisma, provider, service, event };
}
describe('staff-first patient calling', () => {
  it('does not dial a patient just because staff is ringing', async () => {
    const f = fixture(); await f.service.webhook(f.event('call.initiated'));
    expect(f.provider.dial).not.toHaveBeenCalled();
  });
  it('dials only after staff answers and bridges the patient on answer', async () => {
    const f = fixture(); await f.service.webhook(f.event('call.answered'));
    expect(f.provider.dial).toHaveBeenCalledWith(id, 'patient', '+12025550100', 'staff-call');
    expect(f.row.status).toBe('PATIENT_RINGING');
    await f.service.webhook(f.event('call.answered'));
    expect(f.provider.dial).toHaveBeenCalledTimes(1);
  });
  it('does not dial after assignment or staff permission is revoked', async () => {
    const f = fixture(); f.tx.lead.findFirst.mockResolvedValueOnce(null as never);
    await f.service.webhook(f.event('call.answered'));
    expect(f.provider.dial).not.toHaveBeenCalled(); expect(f.row.status).toBe('CANCELLED');
  });
  it('records a failed staff connection and never rings the patient', async () => {
    const f = fixture(); await f.service.webhook(f.event('call.hangup'));
    expect(f.provider.dial).not.toHaveBeenCalled();
    expect(f.tx.callLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ outcome: 'FAILED' }) });
    expect(f.row.activeUserId).toBeNull();
  });
  it('closes both legs and does not reopen a call on a late answer', async () => {
    const f = fixture('PATIENT_RINGING'); f.row.patientCallId = 'patient-call';
    await f.service.webhook(f.event('call.hangup', 'patient', 'patient-call'));
    expect(f.provider.hangup).toHaveBeenCalledWith(id, 'staff-call');
    await f.service.webhook(f.event('call.answered'));
    expect(f.provider.dial).not.toHaveBeenCalled(); expect(f.tx.callLog.create).toHaveBeenCalledTimes(1);
  });
  it('rejects a mismatched destination even with valid client state', async () => {
    const f = fixture(); const event = f.event('call.answered'); event.data.payload.to = 'sip:other@sip.telnyx.com';
    await expect(f.service.webhook(event)).rejects.toThrow('destination mismatch');
    expect(f.provider.dial).not.toHaveBeenCalled();
  });
  it('retains reservation if hangup cannot be confirmed', async () => {
    const f = fixture(); f.provider.hangup.mockRejectedValueOnce(new Error('network') as never);
    await expect(f.service.stop(id, user)).rejects.toThrow('network');
    expect(f.row.activeUserId).toBe('staff');
  });
  it('does not create another dial to cancel an unconfirmed start', async () => {
    const f = fixture(); f.row.staffCallId = null as never;
    await f.service.stop(id, user);
    expect(f.provider.dial).not.toHaveBeenCalled(); expect(f.row.status).toBe('CANCELLING');
  });
  it('keeps owners read-only even if a caller tries to elevate permissions', async () => {
    const f = fixture(); await expect(f.service.start(id, 'lead', { ...user, role: Role.SUPER_ADMIN, permissions: { 'calls.place': true } })).rejects.toThrow('cannot place');
    expect(f.provider.dial).not.toHaveBeenCalled();
  });
  it('returns an existing attempt without dialing again, but conceals other users attempts', async () => {
    const f = fixture(); await f.service.start(id, 'lead', user); expect(f.provider.dial).not.toHaveBeenCalled();
    await expect(f.service.start(id, 'lead', { ...user, sub: 'other' })).rejects.toThrow('not found');
  });
});

it('does not dial when staff access is withdrawn while the headset rings', async () => {
  const f = fixture(); f.tx.user.findUnique.mockResolvedValueOnce({ id: 'staff', email: user.email, role: Role.SALES_CONSULTANT, isActive: false, accessProfile: null });
  await f.service.webhook(f.event('call.answered'));
  expect(f.provider.dial).not.toHaveBeenCalled();
});
it('saves a follow-up through a stable task id rather than creating duplicates', async () => {
  const f = fixture('ENDED'); f.row.callLogId = 'log' as never;
  await f.service.save(id, { notes: 'Requested WhatsApp follow-up', followUpAt: new Date(Date.now() + 86400000).toISOString() }, user);
  expect(f.tx.leadTask.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { id }, create: expect.objectContaining({ leadId: 'lead', assignedToId: 'staff' }) }));
});

it('allows cancelling an actor’s own call after place permission is revoked', async () => {
  const f = fixture(); await f.service.stop(id, { ...user, permissions: { 'calls.place': false } });
  expect(f.provider.hangup).toHaveBeenCalledWith(id, 'staff-call');
  expect(f.row.status).toBe('CANCELLED');
});

it('commits an unconfirmed patient dial without repeating it on a retry', async () => {
  const f = fixture(); f.provider.dial.mockRejectedValueOnce(new Error('network timeout') as never);
  await f.service.webhook(f.event('call.answered'));
  expect(f.row.status).toBe('PATIENT_CONNECTING');
  await f.service.webhook(f.event('call.answered'));
  expect(f.provider.dial).toHaveBeenCalledTimes(1);
  await f.service.stop(id, user);
  expect(f.row.status).toBe('CANCELLING');
  expect(f.row.activeUserId).toBe('staff');
  await f.service.webhook(f.event('call.hangup'));
  expect(f.row.activeUserId).toBe('staff');
  await f.service.webhook(f.event('call.initiated', 'patient', 'patient-call'));
  expect(f.provider.hangup).toHaveBeenCalledWith(id, 'patient-call');
  expect(f.row.status).toBe('CANCELLED');
});

describe('call recording access and consent', () => {
  it('requires patient consent and a connected patient leg', async () => {
    const f = fixture('CONNECTED'); f.row.patientCallId = 'patient-call';
    await expect(f.service.record(id, false, user)).rejects.toThrow('agreed');
    f.row.status = 'PATIENT_RINGING';
    await expect(f.service.record(id, true, user)).rejects.toThrow('connected');
    expect(f.provider.record).not.toHaveBeenCalled();
  });
  it('records consent, records only the patient leg, and stops without redialing', async () => {
    const f = fixture('CONNECTED'); f.row.patientCallId = 'patient-call';
    await f.service.record(id, true, user);
    expect(f.row.recordingConsentAt).toBeInstanceOf(Date);
    expect(f.row.recordingStatus).toBe('RECORDING');
    expect(f.provider.record).toHaveBeenCalledWith(id, 'patient-call', false);
    await f.service.record(id, true, user);
    expect(f.provider.record).toHaveBeenCalledTimes(1);
    await f.service.record(id, false, user, true);
    expect(f.row.recordingStatus).toBe('STOPPED');
    expect(f.provider.record).toHaveBeenLastCalledWith(id, 'patient-call', true);
    expect(f.provider.dial).not.toHaveBeenCalled();
  });
  it('retains uncertain start and stop status instead of claiming success', async () => {
    const f = fixture('CONNECTED'); f.row.patientCallId = 'patient-call';
    f.provider.record.mockRejectedValueOnce(new Error('network') as never);
    await f.service.record(id, true, user);
    expect(f.row.recordingStatus).toBe('REQUESTED');
    f.provider.record.mockRejectedValueOnce(new Error('network') as never);
    await f.service.record(id, false, user, true);
    expect(f.row.recordingStatus).toBe('STOPPING');
    await f.service.record(id, true, user);
    expect(f.provider.record).toHaveBeenCalledTimes(2);
  });
  it('rejects recording after assignment or caller permission is withdrawn', async () => {
    const f = fixture('CONNECTED'); f.row.patientCallId = 'patient-call';
    f.tx.lead.findFirst.mockResolvedValueOnce(null as never);
    await expect(f.service.record(id, true, user)).rejects.toThrow('not found');
    await expect(f.service.record(id, true, { ...user, permissions: { 'calls.place': false } })).rejects.toThrow();
    expect(f.provider.record).not.toHaveBeenCalled();
  });
  it('restricts playback to authorized own assigned calls or management', async () => {
    const f = fixture('ENDED'); f.row.patientCallId = 'patient-call'; f.row.recordingConsentAt = new Date(); f.row.recordingStatus = 'RECORDING';
    await f.service.recording(id, user);
    expect(f.tx.voiceAttempt.findFirst).toHaveBeenLastCalledWith({ where: { id, userId: user.sub, lead: { assignedToId: user.sub, mergedIntoId: null } } });
    f.tx.voiceAttempt.findFirst.mockResolvedValueOnce(null as never);
    await expect(f.service.recording(id, user)).rejects.toThrow('not found');
    await expect(f.service.recording(id, { ...user, permissions: { 'calls.read': false } })).rejects.toThrow('not found');
    await f.service.recording(id, { ...user, role: Role.SUPER_ADMIN });
    expect(f.tx.voiceAttempt.findFirst).toHaveBeenLastCalledWith({ where: { id } });
  });
});

it('handles a late recording error without redialing or reopening the ended call', async () => {
  const f = fixture('ENDED'); f.row.patientCallId = 'patient-call'; f.row.recordingConsentAt = new Date();
  const event = f.event('call.recording.error', 'patient', 'patient-call');
  delete (event.data.payload as Partial<typeof event.data.payload>).to;
  await f.service.webhook(event);
  expect(f.row.recordingStatus).toBe('ERROR');
  expect(f.row.status).toBe('ENDED');
  expect(f.provider.hangup).not.toHaveBeenCalled();
  expect(f.provider.dial).not.toHaveBeenCalled();
});
