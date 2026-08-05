import { Test } from '@nestjs/testing';
import { Role, type JwtPayload } from '@dental-crm/shared';

import { SearchService } from './search.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  lead: { findMany: jest.fn() },
  patient: { findMany: jest.fn() },
};

const as = (role: Role, sub = 'u1'): JwtPayload => ({ sub, email: 'x@clinic.com', role });

/**
 * The query is the easy part. The access rules are what matter, because a search box that finds
 * records it cannot open is worse than no search box — it confirms a patient exists to somebody
 * who is not allowed to know that.
 */
describe('SearchService', () => {
  let service: SearchService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [SearchService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = moduleRef.get(SearchService);
    jest.clearAllMocks();
    mockPrisma.lead.findMany.mockResolvedValue([]);
    mockPrisma.patient.findMany.mockResolvedValue([]);
  });

  describe('who can find what', () => {
    it('does not search patients for a sales consultant', async () => {
      // Same gate as PatientsController's @Roles(...CLINICAL). Reaching the patient table at all
      // for this role would be the leak.
      await service.search('ahmed', as(Role.SALES_CONSULTANT));
      expect(mockPrisma.patient.findMany).not.toHaveBeenCalled();
      expect(mockPrisma.lead.findMany).toHaveBeenCalled();
    });

    it('does not search the pipeline for a dentist', async () => {
      await service.search('ahmed', as(Role.DENTIST));
      expect(mockPrisma.lead.findMany).not.toHaveBeenCalled();
      expect(mockPrisma.patient.findMany).toHaveBeenCalled();
    });

    it('searches both for a clinic manager', async () => {
      await service.search('ahmed', as(Role.CLINIC_MANAGER));
      expect(mockPrisma.lead.findMany).toHaveBeenCalled();
      expect(mockPrisma.patient.findMany).toHaveBeenCalled();
    });

    it('scopes leads to the caller unless they are a super admin', async () => {
      // The same rule the board applies. Without it, search becomes a way around the scoping
      // every other screen enforces.
      await service.search('ahmed', as(Role.SALES_CONSULTANT, 'sales-1'));
      expect(mockPrisma.lead.findMany.mock.calls[0][0].where.assignedToId).toBe('sales-1');

      jest.clearAllMocks();
      mockPrisma.lead.findMany.mockResolvedValue([]);
      await service.search('ahmed', as(Role.SUPER_ADMIN));
      expect(mockPrisma.lead.findMany.mock.calls[0][0].where.assignedToId).toBeUndefined();
    });

    it('never returns a merged duplicate', async () => {
      // Offering both halves of a merge is offering a record and its own shadow.
      await service.search('ahmed', as(Role.SUPER_ADMIN));
      expect(mockPrisma.lead.findMany.mock.calls[0][0].where.mergedIntoId).toBeNull();
    });
  });

  describe('what counts as a match', () => {
    it('refuses to search on one character', async () => {
      // One character matches most of the database and costs a full scan to prove it.
      await expect(service.search('a', as(Role.SUPER_ADMIN))).resolves.toEqual([]);
      expect(mockPrisma.lead.findMany).not.toHaveBeenCalled();
    });

    it('ignores surrounding whitespace', async () => {
      await service.search('  a  ', as(Role.SUPER_ADMIN));
      expect(mockPrisma.lead.findMany).not.toHaveBeenCalled();
    });

    it('matches name and email', async () => {
      await service.search('ahmed', as(Role.SUPER_ADMIN));
      const or = mockPrisma.lead.findMany.mock.calls[0][0].where.OR;
      expect(or.some((c: Record<string, unknown>) => 'firstName' in c)).toBe(true);
      expect(or.some((c: Record<string, unknown>) => 'email' in c)).toBe(true);
    });

    it('strips punctuation from a phone search', async () => {
      // "+90 555" must find a number stored as 905551234567. The stored side is already
      // canonicalised; this is the typed side.
      await service.search('+90 555', as(Role.SUPER_ADMIN));
      const or = mockPrisma.lead.findMany.mock.calls[0][0].where.OR;
      const phone = or.find((c: Record<string, unknown>) => 'phone' in c);
      expect(phone.phone.contains).toBe('90555');
    });

    it('does not treat a short numeric run as a phone number', async () => {
      // "Ali 2" should not become a phone search for "2".
      await service.search('Ali 2', as(Role.SUPER_ADMIN));
      const or = mockPrisma.lead.findMany.mock.calls[0][0].where.OR;
      expect(or.some((c: Record<string, unknown>) => 'phone' in c)).toBe(false);
    });

    it('matches a patient by case number, which is what staff say aloud', async () => {
      await service.search('P-1042', as(Role.CLINIC_MANAGER));
      const or = mockPrisma.patient.findMany.mock.calls[0][0].where.OR;
      expect(or.some((c: Record<string, unknown>) => 'caseNumber' in c)).toBe(true);
    });
  });

  describe('results', () => {
    it('gives each hit somewhere to go', async () => {
      mockPrisma.lead.findMany.mockResolvedValue([
        { id: 'l1', firstName: 'Ahmed', lastName: 'Al-Rashid', phone: '905551234567', stage: 'NEW_DEAL', status: 'ACTIVE' },
      ]);
      mockPrisma.patient.findMany.mockResolvedValue([
        { id: 'p1', firstName: 'Sara', lastName: 'Yilmaz', phone: null, caseNumber: 'P-1042', isActive: true },
      ]);

      const hits = await service.search('a', as(Role.SUPER_ADMIN)).catch(() => []);
      const real = await service.search('ah', as(Role.SUPER_ADMIN));

      expect(hits).toEqual([]);
      expect(real.find((h) => h.type === 'lead')?.href).toContain('/pipeline');
      expect(real.find((h) => h.type === 'patient')?.href).toBe('/patients/p1');
    });

    it('bounds how many it returns', async () => {
      await service.search('ahmed', as(Role.SUPER_ADMIN));
      expect(mockPrisma.lead.findMany.mock.calls[0][0].take).toBeLessThanOrEqual(10);
    });
  });
});
