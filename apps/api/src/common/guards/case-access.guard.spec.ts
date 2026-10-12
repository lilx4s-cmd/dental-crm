jest.mock('../../pdf/pdf.service', () => ({ PdfService: class {} }));
import { Reflector } from '@nestjs/core';
import { ExecutionContext } from '@nestjs/common';
import { JwtPayload } from '@dental-crm/shared';
import { CaseAccessGuard } from './case-access.guard';
import { RolesGuard } from './roles.guard';
import { TreatmentPlansController } from '../../treatment-plans/treatment-plans.controller';
import { LabOrdersController } from '../../lab-orders/lab-orders.controller';
import { AiController } from '../../ai/ai.controller';
import { WarrantiesController } from '../../warranties/warranties.controller';

const sales: JwtPayload = {
  sub: 'sales',
  email: 'sales@example.test',
  role: 'SALES_CONSULTANT',
  permissions: {
    'leads.all': false,
    'patients.read': false,
    'plans.read': true,
    'plans.write': true,
  },
};
function ctx(controller: object, handler: object, request: object): ExecutionContext {
  return {
    getClass: () => controller,
    getHandler: () => handler,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}
function fixture() {
  const prisma = {
    treatmentPlan: {
      findUnique: jest.fn(async ({ where }) => ({
        patientId: where.id === 'own-plan' ? 'own' : 'other',
      })),
    },
    treatmentPlanItem: {
      findUnique: jest.fn().mockResolvedValue({ treatmentPlan: { patientId: 'other' } }),
    },
    labOrder: {
      findUnique: jest.fn().mockResolvedValue({ treatmentPlan: { patientId: 'other' } }),
    },
    warranty: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ treatmentPlanItem: { treatmentPlan: { patientId: 'other' } } }),
    },
    patient: {
      findFirst: jest.fn(async ({ where }) => {
        if (!where.convertedFromLead) return { id: where.id };
        if (where.id === 'own' || Object.keys(where.convertedFromLead).length === 0)
          return { id: where.id };
        return null;
      }),
    },
  };
  return { prisma, guard: new CaseAccessGuard(new Reflector(), prisma as never) };
}
describe('Case authorization at actual API boundaries', () => {
  it('refuses an omitted patient filter before querying any clinical record', async () => {
    const f = fixture();
    await expect(
      f.guard.canActivate(
        ctx(TreatmentPlansController, TreatmentPlansController.prototype.findByPatient, {
          user: sales,
          query: {},
        }),
      ),
    ).rejects.toThrow('Choose a valid');
    expect(f.prisma.patient.findFirst).not.toHaveBeenCalled();
  });
  it.each([
    'findOne',
    'update',
    'downloadPdf',
    'updateItinerary',
    'createShareLink',
    'revokeShareLink',
    'addComment',
    'updateTimelineStep',
    'bookScheduleItem',
    'unbookScheduleItem',
  ] as const)('denies another patient’s %s action', async (name) => {
    const f = fixture();
    await expect(
      f.guard.canActivate(
        ctx(TreatmentPlansController, TreatmentPlansController.prototype[name], {
          user: sales,
          params: { id: 'other-plan' },
        }),
      ),
    ).rejects.toThrow('Patient not available');
    expect(f.prisma.patient.findFirst).toHaveBeenCalledWith({
      where: { id: 'other', convertedFromLead: { assignedToId: 'sales' } },
      select: { id: true },
    });
  });
  it('allows an owned plan and keeps catalogue lookup case-free', async () => {
    const f = fixture();
    expect(
      await f.guard.canActivate(
        ctx(TreatmentPlansController, TreatmentPlansController.prototype.findOne, {
          user: sales,
          params: { id: 'own-plan' },
        }),
      ),
    ).toBe(true);
    f.prisma.patient.findFirst.mockClear();
    expect(
      await f.guard.canActivate(
        ctx(TreatmentPlansController, TreatmentPlansController.prototype.findCategories, {
          user: sales,
        }),
      ),
    ).toBe(true);
    expect(f.prisma.patient.findFirst).not.toHaveBeenCalled();
  });
  it('retains clinic-wide clinical access for a manager', async () => {
    const f = fixture();
    expect(
      await f.guard.canActivate(
        ctx(TreatmentPlansController, TreatmentPlansController.prototype.findOne, {
          user: { ...sales, role: 'CLINIC_MANAGER', permissions: undefined },
          params: { id: 'other-plan' },
        }),
      ),
    ).toBe(true);
  });
  it('allows explicitly delegated all-lead access without permitting a filterless list', async () => {
    const f = fixture();
    expect(
      await f.guard.canActivate(
        ctx(TreatmentPlansController, TreatmentPlansController.prototype.findOne, {
          user: { ...sales, permissions: { 'leads.all': true } },
          params: { id: 'other-plan' },
        }),
      ),
    ).toBe(true);
  });
  it('scopes lab updates and item completion back to the patient', async () => {
    const f = fixture();
    await expect(
      f.guard.canActivate(
        ctx(LabOrdersController, LabOrdersController.prototype.update, {
          user: sales,
          params: { id: 'other-lab' },
        }),
      ),
    ).rejects.toThrow('Patient not available');
  });
  it('blocks mismatched patient and plan IDs even when each is separately accessible', async () => {
    const f = fixture();
    await expect(
      f.guard.canActivate(
        ctx(AiController, AiController.prototype.draftWhatsAppMessage, {
          user: { ...sales, permissions: { 'leads.all': true } },
          body: { patientId: 'own', treatmentPlanId: 'other-plan' },
        }),
      ),
    ).rejects.toThrow('same case');
  });
});
describe('Denied profiles on root-prefix controllers', () => {
  const guard = new RolesGuard(new Reflector());
  const readonly = { ...sales, permissions: { 'plans.read': true, 'plans.write': false } };
  it.each([
    ['create', 'POST'],
    ['update', 'PATCH'],
    ['remove', 'DELETE'],
  ] as const)('denies lab %s when editing is disabled', (name, method) =>
    expect(
      guard.canActivate(
        ctx(LabOrdersController, LabOrdersController.prototype[name], { user: readonly, method }),
      ),
    ).toBe(false),
  );
  it('denies AI plan mutation with a read-only profile', () =>
    expect(
      guard.canActivate(
        ctx(AiController, AiController.prototype.generateSummary, {
          user: readonly,
          method: 'POST',
        }),
      ),
    ).toBe(false));
  it('keeps the original clinical-only warranty boundary even when sales has a write grant', () =>
    expect(
      guard.canActivate(
        ctx(WarrantiesController, WarrantiesController.prototype.issue, {
          user: sales,
          method: 'POST',
        }),
      ),
    ).toBe(false));
  it('allows normal salesperson lab work and denies reception despite a profile grant', () => {
    expect(
      guard.canActivate(
        ctx(LabOrdersController, LabOrdersController.prototype.create, {
          user: sales,
          method: 'POST',
        }),
      ),
    ).toBe(true);
    expect(
      guard.canActivate(
        ctx(LabOrdersController, LabOrdersController.prototype.create, {
          user: { ...sales, role: 'RECEPTION' },
          method: 'POST',
        }),
      ),
    ).toBe(false);
  });
});
