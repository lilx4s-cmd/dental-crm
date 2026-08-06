import { Test } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Role, type JwtPayload } from '@dental-crm/shared';

import { MessageTemplatesService } from './message-templates.service';
import { TagsService } from '../tags/tags.service';
import { PrismaService } from '../prisma/prisma.service';

const ORG = 'org-1';

const mockPrisma: Record<string, any> = {
  messageTemplate: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  clinicSettings: { findFirst: jest.fn() },
  user: { findUnique: jest.fn() },
};

const admin: JwtPayload = { sub: 'admin-1', email: 'a@clinic.com', role: Role.SUPER_ADMIN };

describe('MessageTemplatesService', () => {
  let service: MessageTemplatesService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        MessageTemplatesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: TagsService, useValue: { currentOrganizationId: async () => ORG } },
      ],
    }).compile();
    service = moduleRef.get(MessageTemplatesService);
    jest.clearAllMocks();
    mockPrisma.messageTemplate.findMany.mockResolvedValue([]);
    mockPrisma.messageTemplate.findFirst.mockResolvedValue(null);
    mockPrisma.messageTemplate.update.mockResolvedValue({});
    mockPrisma.clinicSettings.findFirst.mockResolvedValue({ clinicName: 'Kerem Clinic' });
    mockPrisma.user.findUnique.mockResolvedValue({ firstName: 'Leyla' });
  });

  describe('the list the composer reads', () => {
    it('puts the most-used first', async () => {
      // A clinic curating twenty templates uses six. Alphabetical buries those six among fourteen
      // that are read once a quarter.
      await service.findAll();
      expect(mockPrisma.messageTemplate.findMany.mock.calls[0][0].orderBy).toEqual([
        { useCount: 'desc' },
        { title: 'asc' },
      ]);
    });

    it('hides retired templates by default', async () => {
      await service.findAll();
      expect(mockPrisma.messageTemplate.findMany.mock.calls[0][0].where.isActive).toBe(true);
    });

    it('shows them when the management screen asks', async () => {
      await service.findAll(true);
      expect(mockPrisma.messageTemplate.findMany.mock.calls[0][0].where.isActive).toBeUndefined();
    });

    it('is scoped to the clinic', async () => {
      await service.findAll();
      expect(mockPrisma.messageTemplate.findMany.mock.calls[0][0].where.organizationId).toBe(ORG);
    });
  });

  describe('creating', () => {
    it('rejects a duplicate title regardless of case', async () => {
      mockPrisma.messageTemplate.findFirst.mockResolvedValue({ title: 'Price list' });
      await expect(service.create({ title: 'PRICE LIST', body: 'x' }, admin)).rejects.toThrow(
        ConflictException,
      );
    });

    it('refuses an empty body', async () => {
      // A template that inserts nothing is a menu item that does nothing.
      await expect(service.create({ title: 'Price list', body: '   ' }, admin)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('records who wrote it', async () => {
      mockPrisma.messageTemplate.create.mockResolvedValue({ id: 't1' });
      await service.create({ title: ' Price list ', body: ' Hello ' }, admin);
      expect(mockPrisma.messageTemplate.create.mock.calls[0][0].data).toMatchObject({
        title: 'Price list',
        body: 'Hello',
        createdById: 'admin-1',
        organizationId: ORG,
      });
    });
  });

  describe('retiring', () => {
    it('deactivates rather than deletes', async () => {
      // Removing it from the picker should not take its usage count with it, nor mean re-typing
      // four thousand characters somebody wrote carefully.
      mockPrisma.messageTemplate.findFirst.mockResolvedValue({ id: 't1' });

      await service.deactivate('t1');

      expect(mockPrisma.messageTemplate.update.mock.calls[0][0].data).toEqual({ isActive: false });
      expect(mockPrisma.messageTemplate.delete).toBeUndefined();
    });

    it('404s for a template belonging to another clinic', async () => {
      mockPrisma.messageTemplate.findFirst.mockResolvedValue(null);
      await expect(service.deactivate('elsewhere')).rejects.toThrow(NotFoundException);
    });
  });

  describe('filling one in', () => {
    const withBody = (body: string) => mockPrisma.messageTemplate.findFirst.mockResolvedValue({ id: 't1', body });

    it('substitutes the recipient and the clinic', async () => {
      withBody('Hello {{firstName}}, this is {{staffName}} at {{clinic}}.');

      const { body } = await service.render('t1', { firstName: 'Ahmed', lastName: 'Al-Rashid' }, admin);

      expect(body).toBe('Hello Ahmed, this is Leyla at Kerem Clinic.');
    });

    it('builds a full name from both parts', async () => {
      withBody('Dear {{name}},');
      const { body } = await service.render('t1', { firstName: 'Ahmed', lastName: 'Al-Rashid' }, admin);
      expect(body).toBe('Dear Ahmed Al-Rashid,');
    });

    it('does not leave a half-filled name when there is no surname', async () => {
      withBody('Dear {{name}},');
      const { body } = await service.render('t1', { firstName: 'Ahmed', lastName: null }, admin);
      expect(body).toBe('Dear Ahmed,');
    });

    it('empties a placeholder it cannot fill rather than printing it', async () => {
      // Sending a patient their own name is good. Sending them "{{firstName}}" is worse than
      // opening with "Hello,".
      withBody('Hello {{firstName}},');
      const { body } = await service.render('t1', {}, admin);
      expect(body).toBe('Hello ,');
      expect(body).not.toContain('{{');
    });

    it('tolerates spaces inside the braces', async () => {
      withBody('Hello {{ firstName }}');
      const { body } = await service.render('t1', { firstName: 'Ahmed' }, admin);
      expect(body).toBe('Hello Ahmed');
    });

    it('leaves an unknown placeholder visible', async () => {
      // A typo should be caught in the composer, not silently blanked into a message that reads
      // as though a sentence went missing.
      withBody('Your {{treatmnet}} is booked');
      const { body } = await service.render('t1', { firstName: 'Ahmed' }, admin);
      expect(body).toBe('Your {{treatmnet}} is booked');
    });

    it('counts the use', async () => {
      withBody('Hello');
      await service.render('t1', {}, admin);
      expect(mockPrisma.messageTemplate.update.mock.calls[0][0].data).toEqual({
        useCount: { increment: 1 },
      });
    });

    it('404s for a template from another clinic', async () => {
      mockPrisma.messageTemplate.findFirst.mockResolvedValue(null);
      await expect(service.render('elsewhere', {}, admin)).rejects.toThrow(NotFoundException);
    });
  });
});
