import { TravelFinanceService } from '../travel-finance/travel-finance.service';
import { z } from 'zod';
import { DOCUMENT_LANGUAGES } from '@dental-crm/shared';
import {
  ForbiddenException,
  BadRequestException,
  ConflictException,
  Injectable,
  Optional,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { randomBytes, createHash, randomUUID } from 'crypto';
import * as QRCode from 'qrcode';
import {
  ConsultationSchema,
  DocumentConfigurationSchema,
  consultationTotals,
  consultationCopy,
  hasPermission,
  canSeeAllLeads,
  canSupervise,
  Role,
  type JwtPayload,
  type Consultation,
} from '@dental-crm/shared';
import { PrismaService } from '../prisma/prisma.service';
import { TreatmentPlansService } from '../treatment-plans/treatment-plans.service';
import { InvoicesService } from '../invoices/invoices.service';
import { MailService } from '../mail/mail.service';
import { renderConsultationPdf, type DocumentContext } from './consultation-pdf';
const metadata = {
  id: true,
  kind: true,
  sourceId: true,
  version: true,
  patientId: true,
  leadId: true,
  treatmentPlanId: true,
  invoiceId: true,
  warrantyId: true,
  language: true,
  createdAt: true,
  createdById: true,
} as const;
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly plans: TreatmentPlansService,
    private readonly invoices: InvoicesService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
    @Optional() private readonly finance?:TravelFinanceService,
  ) {}
  async assertPatientAccess(patientId: string, user: JwtPayload) {
    if (
      user.role !== Role.SALES_CONSULTANT &&
      hasPermission(
        user,
        'patients.read',
        [Role.SUPER_ADMIN, Role.CLINIC_MANAGER, Role.DENTIST, Role.RECEPTION].includes(
          user.role as 'SUPER_ADMIN' | 'CLINIC_MANAGER' | 'DENTIST' | 'RECEPTION',
        ),
      )
    )
      return;
    const patient = await this.prisma.patient.findFirst({
      where: {
        id: patientId,
        convertedFromLead: canSeeAllLeads(user)
          ? {}
          : canSupervise(user)
            ? { OR: [{ assignedToId: user.sub }, { supervisorId: user.sub }] }
            : { assignedToId: user.sub },
      },
      select: { id: true },
    });
    if (!patient) throw new NotFoundException('Patient not available');
  }
  async context(patientId?: string, leadId?: string, user?: JwtPayload) {
    if (!patientId && !leadId) throw new BadRequestException('Choose a patient or deal');
    const patient = await this.prisma.patient.findFirst({
      where: patientId ? { id: patientId } : { convertedFromLeadId: leadId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        convertedFromLeadId: true,
        email: true,
        phone: true,
        diagnosis: true,
        medicalConditions: true,
        medications: true,
        allergies: true,
        previousSurgeries: true,
        takesBloodThinners: true,
        isPregnant: true,
        isSmoker: true,
        dateOfBirth: true,
        nationality: true,
        convertedFromLead: { select: { preferredLanguage: true } },
      },
    });
    if (!patient)
      throw new NotFoundException(
        'Link this deal to its existing patient record before creating documents',
      );
    if (leadId && patient.convertedFromLeadId !== leadId)
      throw new BadRequestException('Patient and deal do not match');
    if (user) await this.assertPatientAccess(patient.id, user);
    const clinic = await this.prisma.clinicSettings.findUnique({ where: { id: 'singleton' } });
    if (!clinic) throw new BadRequestException('Configure clinic settings first');
    const config = DocumentConfigurationSchema.parse(clinic.documentConfiguration ?? {});
    const catalog = await this.prisma.costCatalogVersion.findMany({
      where: { effectiveAt: { lte: new Date() } },
      orderBy: [{ key: 'asc' }, { version: 'desc' }],
      take: 1000,
    });
    const latest = new Map<string, (typeof catalog)[number]>();
    for (const item of catalog) if (!latest.has(item.key)) latest.set(item.key, item);
    const types: Record<string, (typeof config.priceList)[number]['type']> = {
      IMPLANT: 'implant',
      CROWN: 'crown',
      VENEER: 'veneer',
      EXTRACTION: 'extraction',
      GRAFT: 'graft',
      SINUS: 'sinus',
      TEMPORARY: 'temporary',
    };
    for (const entry of latest.values()) {
      const c = entry.details as {
        category: string;
        currency: string;
        sellingPrice: string | null;
        material?: string;
        brand?: string;
      };
      if (!entry.active || !types[c.category] || c.sellingPrice === null) continue;
      const price = {
        type: types[c.category],
        currency: c.currency,
        unitPrice: Number(c.sellingPrice),
        material: c.material ?? '',
        brand: c.brand ?? '',
      };
      config.priceList = config.priceList.filter(
        (p) =>
          !(
            p.type === price.type &&
            p.currency === price.currency &&
            p.material === price.material &&
            p.brand === price.brand
          ),
      );
      config.priceList.push(price);
    }

    const payment = {
      terms: clinic.defaultPaymentTerms,
      cardFee: clinic.defaultCardFeePercent == null ? null : Number(clinic.defaultCardFeePercent),
      cashDiscount:
        clinic.defaultCashDiscountPercent == null
          ? null
          : Number(clinic.defaultCashDiscountPercent),
      depositPercent:
        clinic.defaultDepositPercent == null ? null : Number(clinic.defaultDepositPercent),
    };
    return {
      patient,
      clinic,
      config,
      payment,
      preferredLanguage: patient.convertedFromLead?.preferredLanguage ?? 'en',
      mailConfigured: this.mail.isConfigured,
    };
  }
  private parse(input: unknown): Consultation {
    const parsed = ConsultationSchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues.map((i) => i.message));
    return parsed.data;
  }
  async preview(patientId: string, input: unknown, user?: JwtPayload) {
    const plan = this.parse(input),
      source = await this.context(patientId, undefined, user);
    return renderConsultationPdf({ ...source, plan, generatedAt: new Date().toISOString() });
  }
  async createPlan(patientId: string, input: unknown, createdById: string, user?: JwtPayload) {
    const consultation = this.parse(input),
      source = await this.context(patientId, undefined, user),
      t = consultationCopy(consultation.language);
    if(user)for(const line of consultation.lines){const configured=source.config.priceList.find(p=>p.type===line.type&&p.currency===consultation.currency&&(!p.material||p.material.toLowerCase()===(line.material??'').toLowerCase())&&(!p.brand||p.brand.toLowerCase()===(line.brand??'').toLowerCase()));if(configured&&(line.unitPrice!==configured.unitPrice||line.discount>0)){if(!hasPermission(user,'quotes.approve_discount',user.role===Role.SUPER_ADMIN||user.role===Role.CLINIC_MANAGER))throw new ForbiddenException('Catalog price exceptions require price-approval permission');if(!line.overrideReason?.trim()||line.overrideReason.trim().length<3)throw new BadRequestException('Record the reason for each price exception');}}
    const price = consultationTotals(consultation);
    await renderConsultationPdf({
      ...source,
      plan: consultation,
      generatedAt: new Date().toISOString(),
    });
    const plan = await this.plans.create(
      {
        patientId,
        title: consultation.treatmentText,
        currency: consultation.currency,
        language: consultation.language,
        items: consultation.lines.map((l) => ({
          description: l.description || t[l.type],
          quantity: l.quantity,
          toothNumber: l.positions.join(', ') || undefined,
          unitPrice: l.unitPrice ?? undefined,
          cost: l.quantity * (l.unitPrice ?? 0) - l.discount,
          discount: l.discount,
          phaseNumber: l.visit,
          material: l.material,
          brand: l.brand,
          toothCondition:
            l.type === 'rootCanal'
              ? 'ROOT_CANAL'
              : l.type === 'sinus'
                ? 'SINUS_LIFT'
                : l.type === 'graft'
                  ? 'BONE_GRAFT'
                  : l.type === 'implantCrown'
                    ? 'CROWN'
                    : l.type === 'temporary'
                      ? 'CROWN'
                      : (l.type.toUpperCase() as 'IMPLANT'),
        })),
        phases: consultation.visits.map((v) => ({
          phaseNumber: v.number,
          healingPeriodMonths: v.number === 1 ? consultation.healing?.maxMonths : undefined,
        })),
        packageIncludes: [],
        depositAmount:
          source.payment.depositPercent == null
            ? undefined
            : Math.round(price.total * source.payment.depositPercent) / 100,
      },
      createdById,
    );
    await this.prisma.treatmentPlan.update({
      where: { id: plan.id },
      data: { consultation: json(consultation), totalCost: price.total },
    });
    if(this.finance&&source.patient.convertedFromLeadId)await this.finance.estimateFromPlan(source.patient.id,source.patient.convertedFromLeadId,plan.id,consultation,createdById);
    return this.generate('PLAN', plan.id, createdById, {
      ...source,
      plan: consultation,
      generatedAt: new Date().toISOString(),
    });
  }
  async list(patientId?: string, leadId?: string, user?: JwtPayload) {
    const source = await this.context(patientId, leadId, user);
    return this.prisma.documentVersion.findMany({
      where: { patientId: source.patient.id },
      select: metadata,
      orderBy: { createdAt: 'desc' },
    });
  }
  async download(id: string, user?: JwtPayload) {
    const document = await this.prisma.documentVersion.findUnique({ where: { id } });
    if (!document) throw new NotFoundException('Document not found');
    if (
      user &&
      document.kind === 'INVOICE' &&
      !hasPermission(
        user,
        'finance.read',
        user.role === Role.SUPER_ADMIN || user.role === Role.CLINIC_MANAGER,
      )
    )
      throw new ForbiddenException('Finance permission is required');
    if (user) await this.assertPatientAccess(document.patientId, user);
    return document;
  }
  async planContext(id: string): Promise<DocumentContext> {
    const plan = await this.prisma.treatmentPlan.findUnique({ where: { id } });
    if (!plan) throw new NotFoundException('Plan not found');
    if (!plan.consultation)
      throw new BadRequestException(
        'Create a visual consultation proposal before generating this document',
      );
    const source = await this.context(plan.patientId);
    return {
      ...source,
      payment: {
        ...source.payment,
        terms: plan.paymentTerms,
        cardFee: plan.cardFeePercent == null ? null : Number(plan.cardFeePercent),
        cashDiscount: plan.cashDiscountPercent == null ? null : Number(plan.cashDiscountPercent),
        depositAmount: plan.depositAmount == null ? null : Number(plan.depositAmount),
      },
      plan: this.parse(plan.consultation),
      generatedAt: new Date().toISOString(),
    };
  }
  async regenerate(id: string, userId: string, user: JwtPayload) {
    const doc = await this.download(id, user);
    if (
      doc.kind === 'INVOICE' &&
      !hasPermission(
        user,
        'finance.write',
        user.role === Role.SUPER_ADMIN || user.role === Role.CLINIC_MANAGER,
      )
    )
      throw new BadRequestException('Invoice generation requires finance permission');
    if (
      doc.kind === 'WARRANTY' &&
      !([Role.SUPER_ADMIN, Role.CLINIC_MANAGER, Role.DENTIST] as Role[]).includes(user.role)
    )
      throw new BadRequestException('Warranty generation requires clinical permission');
    if (doc.kind === 'PLAN')
      return this.generate('PLAN', doc.sourceId, userId, await this.planContext(doc.sourceId));
    if (doc.kind === 'INVOICE') return this.invoiceDocument(doc.sourceId, userId);
    return this.warrantyDocument(doc.sourceId, userId);
  }
  async createInvoice(planId: string, userId: string) {
    const context = await this.planContext(planId),
      p = context.plan,
      t = consultationCopy(p.language);
    if (consultationTotals(p).unpriced) throw new BadRequestException(t.unpriced);
    const existingInvoice = await this.prisma.invoice.findFirst({
      where: { treatmentPlanId: planId, status: { notIn: ['CANCELLED', 'REFUNDED'] } },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if (existingInvoice) return this.invoiceDocument(existingInvoice.id, userId);
    const invoice = await this.invoices.create(
      {
        patientId: context.patient.id,
        treatmentPlanId: planId,
        currency: p.currency,
        discount: p.lines.reduce((s, l) => s + l.discount, 0),
        items: [
          ...p.lines.map((l) => ({
            description: `${t.visit} ${l.visit} · ${t[l.type]}`,
            quantity: l.quantity,
            unitPrice: l.unitPrice!,
          })),
          ...p.visits.flatMap((v) => [
            ...(v.nights > 0
              ? [
                  {
                    description: `${t.visit} ${v.number} · ${t.hotel}${v.hotelIncluded ? ' · ' + t.included : ''}`,
                    quantity: v.nights,
                    unitPrice: v.hotelIncluded ? 0 : v.hotelRate,
                  },
                ]
              : []),
            ...(v.transfer !== 'excluded'
              ? [
                  {
                    description: `${t.visit} ${v.number} · ${t.transfer}${v.transfer === 'included' ? ' · ' + t.included : ''}`,
                    quantity: 1,
                    unitPrice: v.transfer === 'paid' ? v.transferPrice : 0,
                  },
                ]
              : []),
          ]),
        ],
      },
      userId,
    );
    return this.invoiceDocument(invoice.id, userId);
  }
  async invoiceDocument(invoiceId: string, userId: string) {
    const record = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { items: true, payments: true },
    });
    if (!record) throw new NotFoundException('Invoice not found');
    const context =
      record.treatmentPlanId &&
      (await this.prisma.treatmentPlan.findUnique({ where: { id: record.treatmentPlanId } }))
        ?.consultation
        ? await this.planContext(record.treatmentPlanId)
        : await this.baseContext(record.patientId, record.currency);
    if (record.patientId !== context.patient.id || record.currency !== context.plan.currency)
      throw new BadRequestException('Invoice patient/currency does not match the plan');
    return this.generate('INVOICE', invoiceId, userId, {
      ...context,
      invoice: json(record) as unknown as DocumentContext['invoice'],
    });
  }
  async baseContext(
    patientId: string,
    currency: string,
    language?: string,
  ): Promise<DocumentContext> {
    const source = await this.context(patientId),
      lang = z.enum(DOCUMENT_LANGUAGES).safeParse(language ?? source.preferredLanguage);
    return {
      ...source,
      generatedAt: new Date().toISOString(),
      plan: {
        version: 1,
        language: lang.success ? lang.data : 'en',
        currency,
        treatmentText: '',
        lines: [],
        visits: [],
        healing: null,
        includedServices: [],
        findings: {},
      },
    };
  }
  async completeItem(itemId: string, completedAt: string) {
    const date = new Date(completedAt);
    if (!completedAt || !Number.isFinite(date.getTime()) || date > new Date())
      throw new BadRequestException(
        'Enter the actual completion date; future dates are not allowed',
      );
    const item = await this.prisma.treatmentPlanItem.findUnique({ where: { id: itemId } });
    if (!item || item.status === 'CANCELLED')
      throw new BadRequestException('Choose an active treatment item');
    return this.prisma.treatmentPlanItem.update({
      where: { id: itemId },
      data: { status: 'COMPLETED', completedAt: date },
    });
  }
  async warrantyDocument(warrantyId: string, userId: string) {
    const record = await this.prisma.warranty.findUnique({
      where: { id: warrantyId },
      include: {
        treatmentPlanItem: { include: { treatmentPlan: { include: { assignedDentist: true } } } },
      },
    });
    if (!record) throw new NotFoundException('Warranty not found');
    if (record.treatmentPlanItem.status !== 'COMPLETED' || !record.treatmentPlanItem.completedAt)
      throw new BadRequestException(
        'Warranty certificates can only be issued for completed treatment',
      );
    const item = record.treatmentPlanItem,
      context = item.treatmentPlan.consultation
        ? await this.planContext(item.treatmentPlanId)
        : await this.baseContext(
            item.treatmentPlan.patientId,
            item.treatmentPlan.currency,
            item.treatmentPlan.language,
          );
    const number = record.certificateNumber ?? 'WAR-' + record.id.toUpperCase();
    if (!record.certificateNumber)
      await this.prisma.warranty.update({
        where: { id: warrantyId },
        data: { certificateNumber: number },
      });
    const dentist = item.treatmentPlan.assignedDentist;
    return this.generate('WARRANTY', warrantyId, userId, {
      ...context,
      warranty: {
        certificateNumber: number,
        startDate: record.startDate.toISOString(),
        completedAt: record.treatmentPlanItem.completedAt!.toISOString(),
        durationMonths: record.durationMonths,
        lifetime: record.lifetime,
        termsAndConditions: record.termsAndConditions,
        maintenanceRequirements: record.maintenanceRequirements,
        exclusions: record.exclusions,
        description: item.description,
        positions: item.toothNumber,
        material: item.material,
        brand: item.brand,
        dentist: dentist ? `${dentist.firstName} ${dentist.lastName}` : undefined,
      },
    });
  }
  async generate(
    kind: 'PLAN' | 'INVOICE' | 'WARRANTY',
    sourceId: string,
    userId: string,
    context: DocumentContext,
  ) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const last = await this.prisma.documentVersion.findFirst({
        where: { kind, sourceId },
        orderBy: { version: 'desc' },
        select: { version: true },
      });
      const version = (last?.version ?? 0) + 1,
        id = randomUUID(),
        token = randomBytes(32).toString('hex');
      const origins = this.config.get<string[]>('cors.origin') ?? [];
      const verificationQr = origins[0]
        ? await QRCode.toDataURL(`${origins[0]}/documents/verify/${token}`)
        : undefined;
      const snapshot: DocumentContext = {
        ...context,
        kind,
        documentId: id,
        version,
        verificationQr,
      };
      const pdfData = await renderConsultationPdf(snapshot);
      try {
        return await this.prisma.documentVersion.create({
          data: {
            id,
            kind,
            sourceId,
            version,
            patientId: context.patient.id,
            leadId: (
              context.patient as typeof context.patient & { convertedFromLeadId?: string | null }
            ).convertedFromLeadId,
            treatmentPlanId: kind === 'PLAN' ? sourceId : undefined,
            invoiceId: kind === 'INVOICE' ? sourceId : undefined,
            warrantyId: kind === 'WARRANTY' ? sourceId : undefined,
            language: context.plan.language,
            createdById: userId,
            snapshot: json(snapshot),
            pdfData,
            verificationHash: createHash('sha256').update(token).digest('hex'),
          },
          select: metadata,
        });
      } catch (e) {
        if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
      }
    }
    throw new ConflictException('Another document was generated concurrently; please try again');
  }
  async verify(token: string) {
    if (!/^[0-9a-f]{64}$/.test(token)) throw new NotFoundException('Document not found');
    const doc = await this.prisma.documentVersion.findUnique({
      where: { verificationHash: createHash('sha256').update(token).digest('hex') },
      select: { id: true, kind: true, version: true, createdAt: true },
    });
    if (!doc) throw new NotFoundException('Document not found');
    return doc;
  }
  async send(id: string, user: JwtPayload) {
    const doc = await this.download(id, user),
      source = await this.context(doc.patientId);
    if (!source.patient.email)
      throw new BadRequestException('Add a verified patient email to the existing record first');
    if (!this.mail.isConfigured) throw new BadRequestException('Email delivery is not configured');
    const t = consultationCopy((doc.snapshot as unknown as DocumentContext).plan.language);
    await this.mail.send({
      to: source.patient.email,
      subject: `${source.clinic.clinicName} · ${t[doc.kind === 'PLAN' ? 'plan' : doc.kind === 'INVOICE' ? 'invoice' : 'certificate']}`,
      text: `${source.patient.firstName} ${source.patient.lastName}\n${source.clinic.clinicName}\n${t.confirmation}`,
      attachments: [
        {
          filename: `${doc.kind.toLowerCase()}-${doc.id}.pdf`,
          content: doc.pdfData,
          contentType: 'application/pdf',
        },
      ],
    });
    return { sent: true };
  }
}
