import { LeadsService } from './leads.service';
import { Role, whatsappContactPhone, countryOptions, searchCountries } from '@dental-crm/shared';
import { CreateLeadDto } from './dto/create-lead.dto';
import { validate } from 'class-validator';

const user = { sub: 'staff', role: Role.SALES_CONSULTANT } as any;
const dto = { firstName: 'Fictional', source: 'WHATSAPP', currency: 'EUR', estimatedValue: 2500, conversationId: 'chat' } as CreateLeadDto;
function setup(overrides = {}) {
  const conversation = { id: 'chat', channel: 'WHATSAPP', externalThreadId: '447700900123@s.whatsapp.net', whatsappSessionId: 'user:staff', assignedToId: 'staff', leadId: null, patient: null, ...overrides };
  const created = { id: 'deal', firstName: 'Fictional', assignedTo: { id: 'staff' }, supervisorId: null };
  const tx = { conversation: { findFirst: jest.fn().mockResolvedValue(conversation), update: jest.fn().mockResolvedValue({}) }, lead: { findFirst: jest.fn().mockResolvedValue(null), findUnique: jest.fn().mockResolvedValue(created), create: jest.fn().mockResolvedValue(created) }, patient: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) }, $queryRaw: jest.fn().mockResolvedValue([]), $executeRaw: jest.fn().mockResolvedValue(1) };
  const prisma = { ...tx, $transaction: jest.fn((fn: any) => fn(tx)) };
  return { service: new LeadsService(prisma as any, {} as any), tx, prisma, conversation, created };
}
describe('WhatsApp to deal', () => {
  it('creates with the real contact number, currency and amount, then links the existing conversation', async () => {
    const { service, tx } = setup();
    await expect(service.create({ ...dto, whatsappNumber: '+15555555555' }, user)).resolves.toMatchObject({ id: 'deal', reusedExisting: false });
    expect(tx.lead.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ whatsappNumber: '447700900123', phone: '447700900123', currency: 'EUR', estimatedValue: 2500, assignedToId: 'staff' }) }));
    expect(tx.conversation.update).toHaveBeenCalledWith({ where: { id: 'chat' }, data: { leadId: 'deal' } });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
  });
  it('reuses the linked deal without overwriting its prices or patient history', async () => {
    const { service, tx } = setup({ leadId: 'deal' });
    await expect(service.create(dto, user)).resolves.toMatchObject({ reusedExisting: true });
    expect(tx.lead.create).not.toHaveBeenCalled(); expect(tx.patient.updateMany).not.toHaveBeenCalled();
  });
  it('reuses a matching active deal', async () => {
    const { service, tx } = setup(); tx.lead.findFirst.mockResolvedValue({ id: 'deal' } as any);
    await expect(service.create(dto, user)).resolves.toMatchObject({ reusedExisting: true });
    expect(tx.lead.create).not.toHaveBeenCalled();
  });
  it('never links a deal assigned to another salesperson', async () => {
    const { service, tx } = setup({ leadId: 'private' }); tx.lead.findUnique.mockResolvedValue({ id: 'private', assignedTo: { id: 'other' } } as any);
    await expect(service.create(dto, user)).rejects.toThrow('responsible staff'); expect(tx.conversation.update).not.toHaveBeenCalled();
  });
  it('uses the inbox account scope before acquiring locks', async () => {
    const { service, tx } = setup(); tx.conversation.findFirst.mockResolvedValue(null);
    await expect(service.create(dto, user)).rejects.toThrow('Conversation not found');
    expect(tx.conversation.findFirst.mock.calls[0][0].where.AND[0].OR).toContainEqual({ whatsappSessionId: 'user:staff' });
    expect(tx.$queryRaw).not.toHaveBeenCalled(); expect(tx.lead.create).not.toHaveBeenCalled();
  });
  it.each([
    { whatsappSessionId: 'default', assignedToId: 'other' },
    { whatsappSessionId: 'user:other', assignedToId: null },
  ])('cannot take another salesperson’s contact by submitting its own assignee', async overrides => {
    const { service, tx } = setup(overrides);
    const viewer = { ...user, permissions: { 'conversations.all': true, 'leads.assign': false } };
    await expect(service.create({ ...dto, assignedToId: user.sub }, viewer)).rejects.toThrow('responsible salesperson');
    expect(tx.lead.create).not.toHaveBeenCalled();
    expect(tx.conversation.update).not.toHaveBeenCalled();
  });
  it('preserves the responsible salesperson when an authorized manager creates the deal', async () => {
    const { service, tx } = setup({ assignedToId: 'other' });
    await service.create(dto, { sub: 'manager', email: 'manager@example.org', role: Role.SUPER_ADMIN });
    expect(tx.lead.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ assignedToId: 'other' }) }));
    expect(tx.conversation.update).toHaveBeenCalledWith({ where: { id: 'chat' }, data: { leadId: 'deal' } });
  });
  it.each(['123456789@lid', '123456789@g.us', 'status@broadcast'])('rejects non-phone identifier %s', async externalThreadId => {
    const { service, tx } = setup({ externalThreadId });
    await expect(service.create(dto, user)).rejects.toThrow('verified WhatsApp'); expect(tx.lead.create).not.toHaveBeenCalled();
  });
  it('reuses the existing patient record', async () => {
    const { service, tx } = setup({ patient: { id: 'patient', convertedFromLeadId: null } });
    await service.create(dto, user);
    expect(tx.patient.updateMany).toHaveBeenCalledWith({ where: { id: 'patient', convertedFromLeadId: null }, data: { convertedFromLeadId: 'deal' } });
  });
  it('propagates a link failure through the transaction, rather than reporting success', async () => {
    const { service, tx } = setup(); tx.conversation.update.mockRejectedValue(new Error('link failed'));
    await expect(service.create(dto, user)).rejects.toThrow('link failed');
  });
  it('accepts a first name without requiring an unknown surname', async () => {
    const input = Object.assign(new CreateLeadDto(), { firstName: 'Fictional', source: 'WHATSAPP', currency: 'USD' });
    expect(await validate(input)).toEqual([]);
  });
});
describe('contact input catalog', () => {
  it('includes a complete unique country catalog, with formerly missing countries', () => {
    const options = countryOptions('en'); expect(options).toHaveLength(250); expect(new Set(options.map(x => x.code)).size).toBe(250);
    for (const code of ['LB', 'CA', 'US', 'PL', 'FI', 'AU', 'CH']) expect(options.some(x => x.code === code)).toBe(true);
    expect(searchCountries(options, 'USA').some(x => x.code === 'US')).toBe(true);
    expect(searchCountries(countryOptions('ar'), 'لبنان').some(x => x.code === 'LB')).toBe(true);
  });
  it('extracts only actual individual telephone identifiers', () => {
    expect(whatsappContactPhone('447700900123@c.us')).toBe('+447700900123');
    expect(whatsappContactPhone('447700900123@lid')).toBeUndefined();
  });
});
