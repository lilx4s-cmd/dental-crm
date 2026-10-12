import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  CLINICAL,
  Role,
  canSeeAllLeads,
  canSupervise,
  hasPermission,
  type JwtPayload,
} from '@dental-crm/shared';
import { PrismaService } from '../prisma/prisma.service';

/** One policy for proposal, legacy plan, lab and attachment access. Never accepts a missing actor. */
export function patientCaseWhere(user: JwtPayload): Prisma.PatientWhereInput {
  if (
    user.role !== Role.SALES_CONSULTANT &&
    hasPermission(user, 'patients.read', (CLINICAL as readonly string[]).includes(user.role))
  )
    return {};
  return {
    convertedFromLead: canSeeAllLeads(user)
      ? {}
      : canSupervise(user)
        ? { OR: [{ assignedToId: user.sub }, { supervisorId: user.sub }] }
        : { assignedToId: user.sub },
  };
}

export async function assertPatientCaseAccess(
  prisma: PrismaService,
  patientId: string,
  user: JwtPayload,
): Promise<string> {
  const patient = await prisma.patient.findFirst({
    where: { id: patientId, ...patientCaseWhere(user) },
    select: { id: true },
  });
  if (!patient) throw new NotFoundException('Patient not available');
  return patient.id;
}

export type CaseRecord = 'PATIENT' | 'PLAN' | 'PLAN_ITEM' | 'LAB_ORDER' | 'WARRANTY';
export async function assertCaseRecordAccess(
  prisma: PrismaService,
  type: CaseRecord,
  id: string,
  user: JwtPayload,
): Promise<string> {
  if (type === 'PATIENT') return assertPatientCaseAccess(prisma, id, user);
  let patientId: string | undefined;
  if (type === 'PLAN')
    patientId = (
      await prisma.treatmentPlan.findUnique({ where: { id }, select: { patientId: true } })
    )?.patientId;
  if (type === 'PLAN_ITEM')
    patientId = (
      await prisma.treatmentPlanItem.findUnique({
        where: { id },
        select: { treatmentPlan: { select: { patientId: true } } },
      })
    )?.treatmentPlan.patientId;
  if (type === 'LAB_ORDER')
    patientId = (
      await prisma.labOrder.findUnique({
        where: { id },
        select: { treatmentPlan: { select: { patientId: true } } },
      })
    )?.treatmentPlan.patientId;
  if (type === 'WARRANTY')
    patientId = (
      await prisma.warranty.findUnique({
        where: { id },
        select: {
          treatmentPlanItem: { select: { treatmentPlan: { select: { patientId: true } } } },
        },
      })
    )?.treatmentPlanItem.treatmentPlan.patientId;
  if (!patientId) throw new NotFoundException('Record not available');
  return assertPatientCaseAccess(prisma, patientId, user);
}
