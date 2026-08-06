import { Test } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Role, type JwtPayload } from '@dental-crm/shared';

import { LeadsService } from './leads.service';
import { PrismaService } from '../prisma/prisma.service';
import { TagsService } from '../tags/tags.service';
import { toCsv, exportFilename } from './lead-csv';

const mockPrisma: Record<string, any> = {
  lead: { findMany: jest.fn(), updateMany: jest.fn(), deleteMany: jest.fn() },
  leadActivity: { createMany: jest.fn() },
  leadTask: { createMany: jest.fn() },
  user: { findUnique: jest.fn() },
  $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
};

const as = (role: Role, sub = 'u1'): JwtPayload => ({ sub, email: 'x@clinic.com', role });
const admin = as(Role.SUPER_ADMIN, 'admin-1');
const sales = as(Role.SALES_CONSULTANT, 'sales-1');

/**
 * Bulk actions are the only place in the pipeline where one click changes a hundred records, so
 * the interesting cases are all about what the request is *not* allowed to do: reach past the
 * caller's own deals, destroy an outcome while restoring visibility, or delete a record something
 * else depends on.
 */
describe('LeadsService — bulk actions', () => {
  let service: LeadsService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        LeadsService,
        { provide: PrismaService, useValue: mockPrisma },
        // Bulk archive, note, export and delete never resolve an organisation; tagging does, and
        // is covered in tags.spec.ts.
        { provide: TagsService, useValue: { currentOrganizationId: async () => 'org-1' } },
      ],
    }).compile();
    service = moduleRef.get(LeadsService);
    jest.clearAllMocks();
    mockPrisma.lead.findMany.mockResolvedValue([]);
    mockPrisma.lead.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.lead.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.leadActivity.createMany.mockResolvedValue({ count: 0 });
    mockPrisma.$transaction.mockImplementation((ops: unknown[]) => Promise.all(ops));
  });

  describe('the selection is a request, not a permission', () => {
    it('scopes a sales consultant to their own deals', async () => {
      // The ids come from a browser. Without this the endpoint is a way to edit anybody's pipeline
      // by guessing uuids — and the board's own scoping would hide the evidence.
      await service.bulkNote({ leadIds: ['a', 'b'], note: 'called' }, sales);
      expect(mockPrisma.lead.findMany.mock.calls[0][0].where.assignedToId).toBe('sales-1');
    });

    it('does not scope a super admin', async () => {
      await service.bulkNote({ leadIds: ['a'], note: 'called' }, admin);
      expect(mockPrisma.lead.findMany.mock.calls[0][0].where.assignedToId).toBeUndefined();
    });

    it('never acts on a merged duplicate', async () => {
      await service.bulkNote({ leadIds: ['a'], note: 'called' }, admin);
      expect(mockPrisma.lead.findMany.mock.calls[0][0].where.mergedIntoId).toBeNull();
    });

    it('collapses repeated ids', async () => {
      // Otherwise a selection sent twice writes the note twice to the same deal.
      await service.bulkNote({ leadIds: ['a', 'a', 'b'], note: 'called' }, admin);
      expect(mockPrisma.lead.findMany.mock.calls[0][0].where.id.in).toEqual(['a', 'b']);
    });
  });

  describe('archive', () => {
    it('takes deals off the board by status, not by deleting them', async () => {
      mockPrisma.lead.findMany.mockResolvedValue([
        { id: 'a', stage: 'CONTACTED', status: 'ACTIVE' },
      ]);

      const result = await service.bulkArchive({ leadIds: ['a'] }, admin);

      expect(mockPrisma.lead.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'ARCHIVED' } }),
      );
      expect(result.changed).toBe(1);
    });

    it('records the archiving in each deal’s history', async () => {
      mockPrisma.lead.findMany.mockResolvedValue([{ id: 'a', stage: 'CONTACTED', status: 'ACTIVE' }]);
      await service.bulkArchive({ leadIds: ['a'] }, admin);
      const rows = mockPrisma.leadActivity.createMany.mock.calls[0][0].data;
      expect(rows[0]).toMatchObject({ leadId: 'a', userId: 'admin-1', note: 'Archived' });
    });

    it('skips deals already archived', async () => {
      // Repeating the action should not fill the history with entries saying nothing happened.
      mockPrisma.lead.findMany.mockResolvedValue([{ id: 'a', stage: 'CONTACTED', status: 'ARCHIVED' }]);

      const result = await service.bulkArchive({ leadIds: ['a'] }, admin);

      expect(result.changed).toBe(0);
      expect(mockPrisma.lead.updateMany).not.toHaveBeenCalled();
      expect(mockPrisma.leadActivity.createMany).not.toHaveBeenCalled();
    });

    it('restores a won deal as won, not as open', async () => {
      // `status` carries the outcome as well as the visibility. Writing ACTIVE back on restore
      // would quietly remove a closed sale from every conversion figure the clinic reports.
      mockPrisma.lead.findMany.mockResolvedValue([
        { id: 'won', stage: 'DONE', status: 'ARCHIVED' },
        { id: 'lost', stage: 'LOST', status: 'ARCHIVED' },
        { id: 'open', stage: 'NEGOTIATION', status: 'ARCHIVED' },
      ]);

      await service.bulkArchive({ leadIds: ['won', 'lost', 'open'], archived: false }, admin);

      const written = mockPrisma.lead.updateMany.mock.calls.map((c: [{ data: { status: string }; where: { id: { in: string[] } } }]) => [
        c[0].data.status,
        c[0].where.id.in,
      ]);
      expect(written).toEqual(
        expect.arrayContaining([
          ['WON', ['won']],
          ['LOST', ['lost']],
          ['ACTIVE', ['open']],
        ]),
      );
    });

    it('issues no statement for an outcome nothing restores to', async () => {
      mockPrisma.lead.findMany.mockResolvedValue([{ id: 'open', stage: 'NEW_DEAL', status: 'ARCHIVED' }]);
      await service.bulkArchive({ leadIds: ['open'], archived: false }, admin);
      expect(mockPrisma.lead.updateMany).toHaveBeenCalledTimes(1);
    });

    it('writes the status change and the history in one transaction', async () => {
      // A deal archived with no record of who did it is the version of this that causes arguments.
      mockPrisma.lead.findMany.mockResolvedValue([{ id: 'a', stage: 'CONTACTED', status: 'ACTIVE' }]);
      await service.bulkArchive({ leadIds: ['a'] }, admin);
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });
  });

  describe('note', () => {
    it('writes one history row per deal, attributed to the caller', async () => {
      mockPrisma.lead.findMany.mockResolvedValue([
        { id: 'a', stage: 'CONTACTED', status: 'ACTIVE' },
        { id: 'b', stage: 'OFFER_SENT', status: 'ACTIVE' },
      ]);

      const result = await service.bulkNote({ leadIds: ['a', 'b'], note: '  Called, no answer  ' }, sales);

      const rows = mockPrisma.leadActivity.createMany.mock.calls[0][0].data;
      expect(rows).toHaveLength(2);
      expect(rows[0].note).toBe('Called, no answer');
      expect(rows[0].userId).toBe('sales-1');
      expect(result.noted).toBe(2);
    });

    it('stamps the deal’s current stage on both ends', async () => {
      // Null stages make the row read as a stage change to nowhere in the activity feed.
      mockPrisma.lead.findMany.mockResolvedValue([{ id: 'a', stage: 'OFFER_SENT', status: 'ACTIVE' }]);
      await service.bulkNote({ leadIds: ['a'], note: 'x' }, admin);
      const row = mockPrisma.leadActivity.createMany.mock.calls[0][0].data[0];
      expect(row.fromStage).toBe('OFFER_SENT');
      expect(row.toStage).toBe('OFFER_SENT');
    });

    it('refuses a note that is only whitespace', async () => {
      await expect(service.bulkNote({ leadIds: ['a'], note: '   ' }, admin)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('writes nothing when the selection resolves to nothing', async () => {
      const result = await service.bulkNote({ leadIds: ['someone-elses'], note: 'x' }, sales);
      expect(result.noted).toBe(0);
      expect(mockPrisma.leadActivity.createMany).not.toHaveBeenCalled();
    });
  });

  describe('reminders', () => {
    const TOMORROW = new Date(Date.now() + 86_400_000).toISOString();

    beforeEach(() => {
      mockPrisma.leadTask = { createMany: jest.fn().mockResolvedValue({ count: 0 }) };
      mockPrisma.user = { findUnique: jest.fn().mockResolvedValue({ isActive: true }) };
    });

    it('gives each deal its own task', async () => {
      // One shared task would be marked done once and vanish from thirty-nine other people's
      // lists, which is the opposite of a reminder.
      mockPrisma.lead.findMany.mockResolvedValue([
        { id: 'a', stage: 'CONTACTED', status: 'ACTIVE', assignedToId: 'u1' },
        { id: 'b', stage: 'CONTACTED', status: 'ACTIVE', assignedToId: 'u2' },
      ]);

      const result = await service.bulkTask(
        { leadIds: ['a', 'b'], title: 'Chase flights', dueDate: TOMORROW },
        admin,
      );

      expect(mockPrisma.leadTask.createMany.mock.calls[0][0].data).toHaveLength(2);
      expect(result.created).toBe(2);
    });

    it('falls to whoever owns each deal, not to whoever clicked', async () => {
      // Forty deals across four salespeople become forty tasks on those four lists. Assigning
      // them all to the caller hands one person everyone else's work and takes it off theirs.
      mockPrisma.lead.findMany.mockResolvedValue([
        { id: 'a', stage: 'CONTACTED', status: 'ACTIVE', assignedToId: 'sales-7' },
        { id: 'b', stage: 'CONTACTED', status: 'ACTIVE', assignedToId: 'sales-9' },
      ]);

      await service.bulkTask({ leadIds: ['a', 'b'], title: 'x', dueDate: TOMORROW }, admin);

      const rows = mockPrisma.leadTask.createMany.mock.calls[0][0].data;
      expect(rows.map((r: { assignedToId: string }) => r.assignedToId)).toEqual(['sales-7', 'sales-9']);
      // The caller is still recorded as the author of every one of them.
      expect(rows.every((r: { createdById: string }) => r.createdById === 'admin-1')).toBe(true);
    });

    it('honours an explicit assignee', async () => {
      mockPrisma.lead.findMany.mockResolvedValue([
        { id: 'a', stage: 'CONTACTED', status: 'ACTIVE', assignedToId: 'sales-7' },
      ]);

      await service.bulkTask(
        { leadIds: ['a'], title: 'x', dueDate: TOMORROW, assignedToId: 'sales-1' },
        admin,
      );

      expect(mockPrisma.leadTask.createMany.mock.calls[0][0].data[0].assignedToId).toBe('sales-1');
    });

    it('counts the tasks that landed on nobody', async () => {
      // An unowned deal produces a real task that appears on no work list. Counted so the UI can
      // say so rather than reporting a clean success.
      mockPrisma.lead.findMany.mockResolvedValue([
        { id: 'a', stage: 'CONTACTED', status: 'ACTIVE', assignedToId: null },
        { id: 'b', stage: 'CONTACTED', status: 'ACTIVE', assignedToId: 'u1' },
      ]);

      const result = await service.bulkTask({ leadIds: ['a', 'b'], title: 'x', dueDate: TOMORROW }, admin);

      expect(result.unassigned).toBe(1);
    });

    it('refuses a deactivated assignee', async () => {
      // The work list scopes to the signed-in user, and nobody signs in as a deactivated account —
      // so the tasks would exist and be invisible to everyone.
      mockPrisma.user.findUnique.mockResolvedValue({ isActive: false });

      await expect(
        service.bulkTask({ leadIds: ['a'], title: 'x', dueDate: TOMORROW, assignedToId: 'gone' }, admin),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrisma.leadTask.createMany).not.toHaveBeenCalled();
    });

    it('refuses a title that is only whitespace', async () => {
      await expect(
        service.bulkTask({ leadIds: ['a'], title: '   ', dueDate: TOMORROW }, admin),
      ).rejects.toThrow(BadRequestException);
    });

    it('refuses a date it cannot parse', async () => {
      await expect(
        service.bulkTask({ leadIds: ['a'], title: 'x', dueDate: 'next tuesday' }, admin),
      ).rejects.toThrow(BadRequestException);
    });

    it('is scoped to the caller’s own deals', async () => {
      await service.bulkTask({ leadIds: ['a'], title: 'x', dueDate: TOMORROW }, sales);
      expect(mockPrisma.lead.findMany.mock.calls[0][0].where.assignedToId).toBe('sales-1');
    });

    it('writes nothing when the selection resolves to nothing', async () => {
      const result = await service.bulkTask(
        { leadIds: ['someone-elses'], title: 'x', dueDate: TOMORROW },
        sales,
      );
      expect(result.created).toBe(0);
      expect(mockPrisma.leadTask.createMany).not.toHaveBeenCalled();
    });
  });

  describe('export', () => {
    const row = {
      firstName: 'Ayşe', lastName: 'Yılmaz', phone: '905551234567', whatsappNumber: null,
      email: 'a@example.com', country: 'TR', source: 'FACEBOOK', stage: 'OFFER_SENT',
      status: 'ACTIVE', estimatedValue: { toString: () => '12000.50' }, currency: 'USD',
      lostReason: null, notes: null, stageChangedAt: new Date('2026-08-01T00:00:00Z'),
      createdAt: new Date('2026-07-01T00:00:00Z'), utmSource: null, utmMedium: null,
      utmCampaign: null, campaign: null, assignedTo: { firstName: 'Kerem', lastName: 'Demir' },
    };

    it('exports the label people read, not the enum', async () => {
      mockPrisma.lead.findMany.mockResolvedValue([row]);
      const { csv } = await service.bulkExport({ leadIds: ['a'] }, admin);
      expect(csv).toContain('Offer Sent');
      expect(csv).not.toContain('OFFER_SENT');
    });

    it('keeps money exact', async () => {
      // Prisma returns a Decimal. Number() on it is approximate and this column is a price.
      mockPrisma.lead.findMany.mockResolvedValue([row]);
      const { csv } = await service.bulkExport({ leadIds: ['a'] }, admin);
      expect(csv).toContain('12000.50');
    });

    it('is scoped like everything else', async () => {
      await service.bulkExport({ leadIds: ['a'] }, sales);
      expect(mockPrisma.lead.findMany.mock.calls[0][0].where.assignedToId).toBe('sales-1');
    });

    it('reports how many rows it actually produced', async () => {
      // Two ids in, one row out means one was somebody else's. The UI says so rather than handing
      // over a short spreadsheet.
      mockPrisma.lead.findMany.mockResolvedValue([row]);
      const { count } = await service.bulkExport({ leadIds: ['a', 'b'] }, sales);
      expect(count).toBe(1);
    });
  });

  describe('delete', () => {
    it('refuses a caller who is not a super admin, even if the route let them through', async () => {
      // The delete query is deliberately unscoped, so the role check has to live in the service
      // too — a missing scope is the vulnerability, not a gap.
      await expect(service.bulkDelete({ leadIds: ['a'], confirm: true }, sales)).rejects.toThrow(
        ForbiddenException,
      );
      expect(mockPrisma.lead.findMany).not.toHaveBeenCalled();
    });

    it('refuses without confirmation', async () => {
      await expect(service.bulkDelete({ leadIds: ['a'], confirm: false }, admin)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockPrisma.lead.findMany).not.toHaveBeenCalled();
    });

    it('refuses a deal that became a patient', async () => {
      // Patient.leadId is SetNull, so this would succeed and take the link with it — the patient
      // survives, the enquiry and the marketing spend behind it do not.
      mockPrisma.lead.findMany.mockResolvedValue([
        { id: 'a', firstName: 'Ahmed', lastName: 'Al-Rashid', patient: { id: 'p1' }, mergedFrom: [] },
      ]);

      await expect(service.bulkDelete({ leadIds: ['a'], confirm: true }, admin)).rejects.toThrow(
        /become a patient/,
      );
      expect(mockPrisma.lead.deleteMany).not.toHaveBeenCalled();
    });

    it('refuses the survivor of a merge', async () => {
      mockPrisma.lead.findMany.mockResolvedValue([
        { id: 'a', firstName: 'A', lastName: null, patient: null, mergedFrom: [{ id: 'b' }] },
      ]);

      await expect(service.bulkDelete({ leadIds: ['a'], confirm: true }, admin)).rejects.toThrow(
        /duplicate merge/,
      );
    });

    it('refuses the whole batch, not the safe part of it', async () => {
      // Deleting nine of ten and reporting success leaves nobody able to say which nine.
      mockPrisma.lead.findMany.mockResolvedValue([
        { id: 'a', firstName: 'A', lastName: null, patient: null, mergedFrom: [] },
        { id: 'b', firstName: 'B', lastName: null, patient: { id: 'p1' }, mergedFrom: [] },
      ]);

      await expect(service.bulkDelete({ leadIds: ['a', 'b'], confirm: true }, admin)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockPrisma.lead.deleteMany).not.toHaveBeenCalled();
    });

    it('deletes when nothing depends on them', async () => {
      mockPrisma.lead.findMany.mockResolvedValue([
        { id: 'a', firstName: 'A', lastName: null, patient: null, mergedFrom: [] },
      ]);
      mockPrisma.lead.deleteMany.mockResolvedValue({ count: 1 });

      const result = await service.bulkDelete({ leadIds: ['a'], confirm: true }, admin);

      expect(result.deleted).toBe(1);
    });
  });
});

/**
 * The CSV itself. Both of these were found by opening the file, not by reading the code.
 */
describe('lead CSV', () => {
  it('neutralises a name that would run as a formula', () => {
    // A lead's name is text somebody typed on a landing page. `=HYPERLINK(...)` in that field is
    // evaluated when a coordinator opens their own pipeline export.
    const csv = toCsv(['Name'], [['=cmd|calc']]);
    expect(csv).toContain(`"'=cmd|calc"`);
  });

  it('escapes quotes rather than ending the field', () => {
    expect(toCsv(['Name'], [['Ali "Abu" Hassan']])).toContain('"Ali ""Abu"" Hassan"');
  });

  it('starts with a BOM so Excel reads it as UTF-8', () => {
    // Without it every Turkish and Arabic name arrives mangled and it looks like a bad export
    // rather than three missing bytes.
    expect(toCsv(['Name'], [['Ayşe']]).charCodeAt(0)).toBe(0xfeff);
  });

  it('writes nothing for null rather than the word null', () => {
    // Bare rather than `"",""`: an unquoted empty field is the same value to every reader, and
    // `String(null)` would put the literal text "null" in a column of phone numbers.
    expect(toCsv(['A', 'B'], [[null, undefined]])).toContain('\r\n,\r\n');
  });

  it('produces a filename that cannot break the header it travels in', () => {
    expect(exportFilename('deals/../../etc', new Date('2026-08-05T12:30:00Z'))).toBe(
      'dealsetc-2026-08-05-12-30-00.csv',
    );
  });
});
