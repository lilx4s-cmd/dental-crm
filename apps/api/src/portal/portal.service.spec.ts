import { NotFoundException } from '@nestjs/common';
import { PortalService } from './portal.service';
import { consultationExample } from '@dental-crm/shared';
jest.mock('../pdf/pdf.service', () => ({
  PdfService: class {}
}));
function fixture() {
  const example = consultationExample();
  const plan = {
    id: 'plan-1',
    consultation: example.plan,
    depositAmount: '300.00',
    cardFeePercent: '3.00',
    cashDiscountPercent: '2.00',
    paymentTerms: example.payment.terms,
    patient: example.patient
  };
  const prisma = {
    treatmentPlanShareLink: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'link-1',
        treatmentPlanId: plan.id
      }),
      update: jest.fn()
    },
    treatmentPlan: {
      findUnique: jest.fn().mockResolvedValue(plan)
    },
    documentVersion: {
      findFirst: jest.fn().mockResolvedValue(null)
    }
  };
  const settings = {
    get: jest.fn().mockResolvedValue({
      ...example.clinic,
      documentConfiguration: {
        ...example.config,
        priceList: [{
          type: 'implant',
          currency: 'USD',
          unitPrice: 999
        }],
        invoicePaymentInstructions: 'Private billing configuration'
      }
    })
  };
  const pdf = {
    generateTreatmentPlanPdf: jest.fn().mockResolvedValue(Buffer.from('PDF'))
  };
  return {
    prisma,
    settings,
    pdf,
    service: new PortalService(prisma as never, settings as never, pdf as never)
  };
}
it('selects only patient-facing quote amounts and explicitly whitelists clinic identity', async () => {
  const f = fixture();
  const result = await f.service.getPlan('opaque-token');
  const select = f.prisma.treatmentPlan.findUnique.mock.calls[0][0].select;
  expect(select).toMatchObject({
    cardFeePercent: true,
    cashDiscountPercent: true,
    depositAmount: true,
    paymentTerms: true,
    patient: {
      select: {
        firstName: true,
        lastName: true
      }
    }
  });
  expect(select).not.toHaveProperty('commissionAmount');
  expect(select).not.toHaveProperty('clinicCosts');
  expect(result.clinic.identity).toMatchObject({
    accentColor: '#183858',
    representative: 'Example Patient Coordinator'
  });
  expect(JSON.stringify(result.clinic)).not.toContain('priceList');
  expect(JSON.stringify(result.clinic)).not.toContain('Private billing configuration');
});
it('uses stored document bytes and leaves previously issued versions intact', async () => {
  const f = fixture(),
    bytes = Buffer.from('previously issued PDF');
  f.prisma.documentVersion.findFirst.mockResolvedValue({
    pdfData: bytes
  } as never);
  expect(await f.service.getPdf('opaque-token')).toBe(bytes);
  expect(f.pdf.generateTreatmentPlanPdf).not.toHaveBeenCalled();
});
it('carries saved payment terms to the PDF fallback when no version exists', async () => {
  const f = fixture();
  await f.service.getPdf('opaque-token');
  expect(f.pdf.generateTreatmentPlanPdf).toHaveBeenCalledWith(expect.objectContaining({
    depositAmount: '300.00',
    cardFeePercent: '3.00',
    cashDiscountPercent: '2.00'
  }), expect.objectContaining({
    email: 'clinic@example.org',
    documentConfiguration: expect.any(Object)
  }));
});
it('rejects expired share links without reading patient or clinic data', async () => {
  const f = fixture();
  f.prisma.treatmentPlanShareLink.findUnique.mockResolvedValue({
    expiresAt: new Date(0)
  } as never);
  await expect(f.service.getPlan('expired')).rejects.toBeInstanceOf(NotFoundException);
  expect(f.prisma.treatmentPlan.findUnique).not.toHaveBeenCalled();
  expect(f.settings.get).not.toHaveBeenCalled();
});
