import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { INTAKE_CONSENT_TEXT } from '@dental-crm/shared';

import { PrismaService } from '../prisma/prisma.service';
import { FilesService } from '../files/files.service';
import { IntakeService } from './intake.service';
import { CreateIntakeDto } from './dto/create-intake.dto';

// This endpoint is public and writes to the pipeline on every call, so the behaviours pinned here
// are the ones with real consequences: what reaches the CRM, what silently must not, and the
// difference between a question answered "no" and one nobody answered.
describe('IntakeService.submit', () => {
  let service: IntakeService;
  let leadCreate: jest.Mock;
  let submissionCreate: jest.Mock;

  const base: CreateIntakeDto = {
    firstName: 'Amina',
    lastName: 'Benali',
    email: 'amina@example.com',
  };

  beforeEach(async () => {
    leadCreate = jest.fn().mockResolvedValue({ id: 'lead-1' });
    submissionCreate = jest.fn().mockResolvedValue({ id: 'sub-1' });

    const prisma = {
      // The real call runs inside an interactive transaction; hand the callback a client whose
      // create methods are the spies above.
      $transaction: jest.fn((cb: (tx: unknown) => unknown) =>
        cb({ lead: { create: leadCreate }, intakeSubmission: { create: submissionCreate } }),
      ),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        IntakeService,
        { provide: PrismaService, useValue: prisma },
        { provide: FilesService, useValue: { createUploadUrl: jest.fn(), bucketName: () => 'bucket' } },
      ],
    }).compile();

    service = moduleRef.get(IntakeService);
  });

  it('creates exactly one lead and one submission', async () => {
    const result = await service.submit(base);

    expect(leadCreate).toHaveBeenCalledTimes(1);
    expect(submissionCreate).toHaveBeenCalledTimes(1);
    expect(result.submissionId).toBe('sub-1');
    expect(submissionCreate.mock.calls[0][0].data.leadId).toBe('lead-1');
  });

  it('files the lead as a website enquiry, unassigned and at the top of the pipeline', async () => {
    await service.submit(base);
    const data = leadCreate.mock.calls[0][0].data;

    expect(data.source).toBe('WEBSITE');
    expect(data.stage).toBe('NEW_LEAD');
    expect(data.status).toBe('ACTIVE');
    // Nobody has claimed the enquiry yet; the pipeline's "no movement" filter surfaces it.
    expect(data.assignedToId).toBeUndefined();
  });

  it('summarises the enquiry onto the lead so the card is readable without opening it', async () => {
    await service.submit({
      ...base,
      treatmentInterest: ['Dental implants', 'Crowns or bridges'],
      chiefComplaint: 'Two front teeth are loose',
      countryOfResidence: 'France',
    });

    const notes: string = leadCreate.mock.calls[0][0].data.notes;
    expect(notes).toContain('Dental implants, Crowns or bridges');
    expect(notes).toContain('Two front teeth are loose');
    expect(notes).toContain('France');
  });

  it('discards a honeypot submission without touching the database', async () => {
    const result = await service.submit({ ...base, website: 'http://spam.example' });

    expect(leadCreate).not.toHaveBeenCalled();
    expect(submissionCreate).not.toHaveBeenCalled();
    // Reported as accepted on purpose, so the sender stops retrying.
    expect(result.accepted).toBe(true);
    expect(result.submissionId).toBeNull();
  });

  it('refuses a submission with no way to reach the patient', async () => {
    await expect(service.submit({ firstName: 'A', lastName: 'B' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(leadCreate).not.toHaveBeenCalled();
  });

  it('accepts WhatsApp alone as a contact method', async () => {
    await expect(
      service.submit({ firstName: 'A', lastName: 'B', whatsappNumber: '+33612345678' }),
    ).resolves.toMatchObject({ accepted: true });
  });

  it('keeps unanswered medical questions null rather than recording them as "no"', async () => {
    await service.submit({ ...base, isSmoker: false });
    const data = submissionCreate.mock.calls[0][0].data;

    // Answered "no" is false; everything nobody was asked stays undefined so it persists as NULL.
    expect(data.isSmoker).toBe(false);
    expect(data.drinksAlcohol).toBeUndefined();
    expect(data.isPregnant).toBeUndefined();
    expect(data.takesBloodThinners).toBeUndefined();
  });

  it('stamps consent server-side with the exact wording shown', async () => {
    await service.submit(base);
    const data = submissionCreate.mock.calls[0][0].data;

    expect(data.consentText).toBe(INTAKE_CONSENT_TEXT);
    expect(data.consentedAt).toBeInstanceOf(Date);
  });

  it('returns an upload token but never stores it in the clear', async () => {
    const result = await service.submit(base);
    const stored: string = submissionCreate.mock.calls[0][0].data.uploadTokenHash;

    expect(result.uploadToken).toEqual(expect.any(String));
    expect(stored).not.toBe(result.uploadToken);
    expect(stored).toHaveLength(64); // sha256 hex
  });
});
