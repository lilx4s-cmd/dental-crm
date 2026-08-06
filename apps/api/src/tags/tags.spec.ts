import { Test } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Role, type JwtPayload } from '@dental-crm/shared';

import { TagsService, DEFAULT_ORGANIZATION_SLUG } from './tags.service';
import { LeadsService } from '../leads/leads.service';
import { PrismaService } from '../prisma/prisma.service';

const ORG = 'org-1';

const mockPrisma = {
  organization: { findUnique: jest.fn() },
  tag: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
  lead: { findMany: jest.fn(), findUnique: jest.fn() },
  leadTag: { findMany: jest.fn(), createMany: jest.fn(), deleteMany: jest.fn(), groupBy: jest.fn() },
  leadTagHistory: { createMany: jest.fn(), findMany: jest.fn() },
  $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
};

const admin: JwtPayload = { sub: 'admin-1', email: 'a@clinic.com', role: Role.SUPER_ADMIN };

describe('TagsService', () => {
  let service: TagsService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [TagsService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = moduleRef.get(TagsService);
    jest.clearAllMocks();
    mockPrisma.organization.findUnique.mockResolvedValue({ id: ORG });
    mockPrisma.tag.findMany.mockResolvedValue([]);
    mockPrisma.tag.findFirst.mockResolvedValue(null);
  });

  describe('which clinic a tag belongs to', () => {
    it('resolves the organisation by slug, not by a hardcoded id', async () => {
      // A staging copy or a fresh developer database has its own uuid for the same clinic.
      await service.currentOrganizationId();
      expect(mockPrisma.organization.findUnique.mock.calls[0][0].where.slug).toBe(
        DEFAULT_ORGANIZATION_SLUG,
      );
    });

    it('reads it once and remembers it', async () => {
      // One row, never edited, wanted by nearly every tag operation.
      await service.currentOrganizationId();
      await service.currentOrganizationId();
      expect(mockPrisma.organization.findUnique).toHaveBeenCalledTimes(1);
    });

    it('fails loudly when the row is missing', async () => {
      // Silently creating one would hide a database that never had the migration run against it.
      mockPrisma.organization.findUnique.mockResolvedValue(null);
      await expect(service.currentOrganizationId()).rejects.toThrow(/migrate deploy/);
    });

    it('scopes every read to it', async () => {
      await service.findAll();
      expect(mockPrisma.tag.findMany.mock.calls[0][0].where.organizationId).toBe(ORG);
    });
  });

  describe('creating', () => {
    it('collapses whitespace in the name', async () => {
      mockPrisma.tag.create.mockResolvedValue({ id: 't1' });
      await service.create({ name: '  Hollywood   Smile  ' }, admin);
      expect(mockPrisma.tag.create.mock.calls[0][0].data.name).toBe('Hollywood Smile');
    });

    it('refuses a name that is only whitespace', async () => {
      await expect(service.create({ name: '   ' }, admin)).rejects.toThrow(BadRequestException);
    });

    it('rejects a duplicate regardless of case', async () => {
      // The database index is exact, so "VIP" and "vip" would both satisfy it and then sit next to
      // each other in the picker as two tags nobody can tell apart.
      mockPrisma.tag.findFirst.mockResolvedValue({ name: 'VIP' });
      await expect(service.create({ name: 'vip' }, admin)).rejects.toThrow(ConflictException);
      expect(mockPrisma.tag.findFirst.mock.calls[0][0].where.name.mode).toBe('insensitive');
    });

    it('records who made it, and defaults colour and category', async () => {
      mockPrisma.tag.create.mockResolvedValue({ id: 't1' });
      await service.create({ name: 'VIP' }, admin);
      expect(mockPrisma.tag.create.mock.calls[0][0].data).toMatchObject({
        createdById: 'admin-1',
        color: 'SLATE',
        category: 'GENERAL',
        organizationId: ORG,
      });
    });
  });

  describe('editing', () => {
    it('does not treat a tag as a duplicate of itself', async () => {
      // Renaming "VIP" to "VIP " would otherwise fail against its own row.
      mockPrisma.tag.findFirst.mockResolvedValueOnce({ id: 't1' }).mockResolvedValueOnce(null);
      mockPrisma.tag.update.mockResolvedValue({ id: 't1' });

      await service.update('t1', { name: 'VIP' });

      expect(mockPrisma.tag.findFirst.mock.calls[1][0].where.NOT).toEqual({ id: 't1' });
    });

    it('404s for a tag belonging to another organisation', async () => {
      mockPrisma.tag.findFirst.mockResolvedValue(null);
      await expect(service.update('elsewhere', { name: 'x' })).rejects.toThrow(NotFoundException);
    });
  });

  describe('listing', () => {
    it('reports what deleting a tag would cost', async () => {
      mockPrisma.tag.findMany.mockResolvedValue([
        { id: 't1', name: 'VIP', color: 'RED', category: 'HANDLING', createdAt: new Date(), _count: { leads: 12, patients: 3 } },
      ]);

      const [tag] = await service.findAll();

      expect(tag.usageCount).toBe(15);
    });

    it('groups by category before name', async () => {
      // Sorted here so the picker, the filter bar and the deal sheet cannot each choose their own
      // order for the same list.
      mockPrisma.tag.findMany.mockResolvedValue([
        { id: '1', name: 'Zebra', color: 'RED', category: 'HANDLING', createdAt: new Date(), _count: { leads: 0, patients: 0 } },
        { id: '2', name: 'Alpha', color: 'RED', category: 'GENERAL', createdAt: new Date(), _count: { leads: 0, patients: 0 } },
        { id: '3', name: 'Beta', color: 'RED', category: 'HANDLING', createdAt: new Date(), _count: { leads: 0, patients: 0 } },
      ]);

      const names = (await service.findAll()).map((t) => t.name);

      // HANDLING before GENERAL, alphabetical within.
      expect(names).toEqual(['Beta', 'Zebra', 'Alpha']);
    });
  });
});

/**
 * Tagging a deal. The behaviour worth pinning down is what gets written when the answer is
 * "nothing changed", because a checkbox is clicked far more often than it changes anything.
 */
describe('LeadsService — tagging', () => {
  let leads: LeadsService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        LeadsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: TagsService, useValue: { currentOrganizationId: async () => ORG } },
      ],
    }).compile();
    leads = moduleRef.get(LeadsService);
    jest.clearAllMocks();
    mockPrisma.lead.findMany.mockResolvedValue([{ id: 'l1', stage: 'CONTACTED', status: 'ACTIVE' }]);
    mockPrisma.tag.findMany.mockResolvedValue([{ id: 't1', name: 'VIP' }]);
    mockPrisma.leadTag.findMany.mockResolvedValue([]);
    mockPrisma.leadTag.groupBy.mockResolvedValue([]);
    mockPrisma.leadTag.createMany.mockResolvedValue({ count: 1 });
    mockPrisma.leadTag.deleteMany.mockResolvedValue({ count: 1 });
    mockPrisma.leadTagHistory.createMany.mockResolvedValue({ count: 1 });
    mockPrisma.$transaction.mockImplementation((ops: unknown[]) => Promise.all(ops));
  });

  it('writes the join and the history together', async () => {
    // A LeadTag row without its history entry is the failure worth preventing: the tag is on the
    // card and nothing says who put it there, which is the question tags create.
    await leads.bulkTag({ leadIds: ['l1'], tagIds: ['t1'] }, admin);

    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mockPrisma.leadTag.createMany).toHaveBeenCalled();
    expect(mockPrisma.leadTagHistory.createMany.mock.calls[0][0].data[0]).toMatchObject({
      leadId: 'l1',
      tagId: 't1',
      tagName: 'VIP',
      action: 'ADDED',
      userId: 'admin-1',
      organizationId: ORG,
    });
  });

  it('writes nothing when the tag is already on the deal', async () => {
    // Idempotent: the caller is a checkbox, and the honest answer to "make sure this is on" when
    // it already is, is nothing at all — not a second history row saying it was added again.
    mockPrisma.leadTag.findMany.mockResolvedValue([{ leadId: 'l1', tagId: 't1' }]);

    const result = await leads.bulkTag({ leadIds: ['l1'], tagIds: ['t1'] }, admin);

    expect(result.changed).toBe(0);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('writes nothing when removing a tag the deal does not have', async () => {
    mockPrisma.leadTag.findMany.mockResolvedValue([]);
    const result = await leads.bulkTag({ leadIds: ['l1'], tagIds: ['t1'], remove: true }, admin);
    expect(result.changed).toBe(0);
  });

  it('records the removal with the name the tag had', async () => {
    mockPrisma.leadTag.findMany.mockResolvedValue([{ leadId: 'l1', tagId: 't1' }]);

    await leads.bulkTag({ leadIds: ['l1'], tagIds: ['t1'], remove: true }, admin);

    expect(mockPrisma.leadTag.deleteMany).toHaveBeenCalled();
    expect(mockPrisma.leadTagHistory.createMany.mock.calls[0][0].data[0]).toMatchObject({
      action: 'REMOVED',
      tagName: 'VIP',
    });
  });

  it('will not attach a tag from another organisation', async () => {
    // Scoped in the query, so a tag id from anywhere else is simply not found.
    await leads.bulkTag({ leadIds: ['l1'], tagIds: ['t1'] }, admin);
    expect(mockPrisma.tag.findMany.mock.calls[0][0].where.organizationId).toBe(ORG);
  });

  it('is scoped to the caller’s own deals', async () => {
    const sales: JwtPayload = { sub: 'sales-1', email: 's@clinic.com', role: Role.SALES_CONSULTANT };
    await leads.bulkTag({ leadIds: ['l1'], tagIds: ['t1'] }, sales);
    expect(mockPrisma.lead.findMany.mock.calls[0][0].where.assignedToId).toBe('sales-1');
  });

  it('refuses to push a deal past the tag cap', async () => {
    // A record carrying twenty tags filters into every list, which is the same as carrying none.
    mockPrisma.leadTag.groupBy.mockResolvedValue([{ leadId: 'l1', _count: { _all: 12 } }]);

    await expect(leads.bulkTag({ leadIds: ['l1'], tagIds: ['t1'] }, admin)).rejects.toThrow(
      BadRequestException,
    );
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('counts what is already there, not just what is being added', async () => {
    mockPrisma.leadTag.groupBy.mockResolvedValue([{ leadId: 'l1', _count: { _all: 11 } }]);
    await expect(leads.bulkTag({ leadIds: ['l1'], tagIds: ['t1'] }, admin)).resolves.toMatchObject({
      changed: 1,
    });
  });

  it('does not check the cap when removing', async () => {
    mockPrisma.leadTag.findMany.mockResolvedValue([{ leadId: 'l1', tagId: 't1' }]);
    await leads.bulkTag({ leadIds: ['l1'], tagIds: ['t1'], remove: true }, admin);
    expect(mockPrisma.leadTag.groupBy).not.toHaveBeenCalled();
  });

  it('reads history rather than the join, so removals appear', async () => {
    mockPrisma.lead.findUnique.mockResolvedValue({ id: 'l1', assignedToId: 'admin-1' });
    mockPrisma.leadTagHistory.findMany.mockResolvedValue([]);

    await leads.getTagHistory('l1', admin);

    expect(mockPrisma.leadTagHistory.findMany).toHaveBeenCalled();
    expect(mockPrisma.leadTagHistory.findMany.mock.calls[0][0].orderBy).toEqual({ createdAt: 'desc' });
  });
});
