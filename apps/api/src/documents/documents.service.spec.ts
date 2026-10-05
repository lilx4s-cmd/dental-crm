import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { DocumentsService } from './documents.service';
import {
  Role,
  DocumentConfigurationSchema,
  parseConsultation,
  type JwtPayload,
} from '@dental-crm/shared';
jest.mock('./consultation-pdf', () => ({
  renderConsultationPdf: jest.fn().mockResolvedValue(Buffer.from('%PDF synthetic')),
}));
const config = DocumentConfigurationSchema.parse({
  priceList: [{ type: 'implant', currency: 'USD', unitPrice: 350 }],
});
const proposal = {
  version: 1,
  language: 'en',
  currency: 'USD',
  treatmentText: 'implant',
  lines: parseConsultation('implant', 'USD', config).lines,
  visits: [
    {
      number: 1,
      nights: 5,
      hotelRate: 60,
      hotelIncluded: false,
      transfer: 'included',
      transferPrice: 0,
      itinerary: [],
    },
  ],
  healing: null,
  includedServices: [],
  findings: {},
};
function fixture() {
  const prisma = {
    costCatalogVersion: { findMany: jest.fn().mockResolvedValue([]) },
    patient: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'p1',
        firstName: 'Test',
        lastName: 'Patient',
        convertedFromLeadId: 'l1',
        email: 'test@example.invalid',
      }),
    },
    clinicSettings: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ clinicName: 'Test clinic', documentConfiguration: config }),
    },
    treatmentPlan: { findUnique: jest.fn(), update: jest.fn() },
    treatmentPlanItem: { findUnique: jest.fn(), update: jest.fn() },
    documentVersion: { findFirst: jest.fn(), create: jest.fn(), findUnique: jest.fn() },
    invoice: { findFirst: jest.fn(), findUnique: jest.fn() },
    warranty: { findUnique: jest.fn() },
  };
  const plans = { create: jest.fn().mockResolvedValue({ id: 'plan1' }) },
    invoices = { create: jest.fn() },
    mail = { isConfigured: false, send: jest.fn() };
  const service = new DocumentsService(
    prisma as never,
    plans as never,
    invoices as never,
    mail as never,
    { get: () => [] } as never,
  );
  return { prisma, plans, invoices, mail, service };
}
it('uses existing patient/deal mappings and refuses a mismatched deal', async () => {
  const { service, prisma } = fixture();
  await expect(service.context('p1', 'wrong-lead')).rejects.toBeInstanceOf(BadRequestException);
  expect(prisma.patient.findFirst).toHaveBeenCalledWith(
    expect.objectContaining({ where: { id: 'p1' } }),
  );
});
it('stores the exact PDF and snapshot as a new version without updating earlier versions', async () => {
  const f = fixture();
  f.prisma.documentVersion.findFirst.mockResolvedValue({ version: 3 });
  f.prisma.documentVersion.create.mockImplementation(async (args) => args.data);
  const doc = await f.service.createPlan('p1', proposal, 'staff1');
  const stored = f.prisma.documentVersion.create.mock.calls[0][0].data;
  expect(doc.version).toBe(4);
  expect(doc.patientId).toBe('p1');
  expect(doc.leadId).toBe('l1');
  expect(stored.pdfData.toString()).toBe('%PDF synthetic');
  expect(stored.snapshot.plan).toEqual(proposal);
  expect(f.prisma.treatmentPlan.update).toHaveBeenCalledWith(
    expect.objectContaining({ data: expect.objectContaining({ totalCost: 650 }) }),
  );
});
it('downloads stored bytes rather than regenerating a signed plan from live data', async () => {
  const f = fixture();
  const bytes = Buffer.from('old signed PDF');
  f.prisma.documentVersion.findUnique.mockResolvedValue({
    id: 'doc1',
    kind: 'PLAN',
    pdfData: bytes,
  });
  expect((await f.service.download('doc1')).pdfData).toBe(bytes);
  expect(f.prisma.patient.findFirst).not.toHaveBeenCalled();
});
it('keeps finance documents behind finance permission', async () => {
  const f = fixture();
  f.prisma.documentVersion.findUnique.mockResolvedValue({ kind: 'INVOICE' });
  await expect(
    f.service.download('doc1', { role: Role.SALES_CONSULTANT } as JwtPayload),
  ).rejects.toBeInstanceOf(ForbiddenException);
});
it('reuses an existing invoice and its payments instead of creating duplicate debt', async () => {
  const f = fixture();
  f.prisma.treatmentPlan.findUnique.mockResolvedValue({
    id: 'plan1',
    patientId: 'p1',
    consultation: proposal,
  });
  f.prisma.invoice.findFirst.mockResolvedValue({ id: 'inv1' });
  const regenerate = jest
    .spyOn(f.service, 'invoiceDocument')
    .mockResolvedValue({ id: 'version2' } as never);
  await f.service.createInvoice('plan1', 'staff1');
  expect(f.invoices.create).not.toHaveBeenCalled();
  expect(regenerate).toHaveBeenCalledWith('inv1', 'staff1');
});
it('does not issue a certificate for planned treatment', async () => {
  const f = fixture();
  f.prisma.warranty.findUnique.mockResolvedValue({ treatmentPlanItem: { status: 'PLANNED' } });
  await expect(f.service.warrantyDocument('w1', 'staff1')).rejects.toBeInstanceOf(
    BadRequestException,
  );
});
it('requires a real completion date and rejects future dates', async () => {
  const f = fixture();
  await expect(f.service.completeItem('item1', '2999-01-01')).rejects.toBeInstanceOf(
    BadRequestException,
  );
  await expect(f.service.completeItem('item1', '')).rejects.toBeInstanceOf(BadRequestException);
  expect(f.prisma.treatmentPlanItem.update).not.toHaveBeenCalled();
});
it('does not claim successful sending without a configured transport', async () => {
  const f = fixture();
  f.prisma.documentVersion.findUnique.mockResolvedValue({ patientId: 'p1', kind: 'PLAN' });
  await expect(f.service.send('doc1', { role: Role.DENTIST } as JwtPayload)).rejects.toBeInstanceOf(
    BadRequestException,
  );
  expect(f.mail.send).not.toHaveBeenCalled();
});

it('rejects sales document access outside the normal assigned lead scope', async () => {
  const f = fixture();
  f.prisma.documentVersion.findUnique.mockResolvedValue({
    kind: 'PLAN',
    patientId: 'someone-else',
  });
  f.prisma.patient.findFirst.mockResolvedValue(null);
  await expect(
    f.service.download('doc1', { sub: 'seller', role: Role.SALES_CONSULTANT } as JwtPayload),
  ).rejects.toThrow('not available');
  expect(f.prisma.patient.findFirst).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { id: 'someone-else', convertedFromLead: { assignedToId: 'seller' } },
    }),
  );
});
it('reuses real effective catalog selling prices without exposing internal catalog costs', async () => {
  const f = fixture();
  f.prisma.costCatalogVersion.findMany.mockResolvedValue([
    {
      key: 'implant',
      active: true,
      details: {
        category: 'IMPLANT',
        currency: 'USD',
        sellingPrice: '400.00',
        cost: '125.00',
        brand: '',
      },
    },
  ]);
  const context = await f.service.context('p1');
  expect(context.config.priceList).toContainEqual(
    expect.objectContaining({ type: 'implant', unitPrice: 400 }),
  );
  expect(JSON.stringify(context.config.priceList)).not.toContain('125.00');
});
