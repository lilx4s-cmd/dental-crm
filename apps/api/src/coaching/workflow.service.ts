import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { JwtPayload, Role, hasPermission } from '@dental-crm/shared';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CoachingService } from './coaching.service';
import { leadScope, mayManage, teamLeadScope } from './access';
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
@Injectable()
export class CoachingWorkflowService {
  constructor(private readonly prisma: PrismaService, private readonly coaching: CoachingService) {}
  async instruction(leadId: string, message: string, priority: string, user: JwtPayload) {
    const lead = await this.coaching.assertLead(leadId,user,true);
    if (!lead.assignedToId) throw new BadRequestException('Assign a salesperson first');
    return this.prisma.$transaction(async (tx) => {
      const instruction = await tx.supervisorInstruction.create({ data: { leadId,salespersonId:lead.assignedToId!,supervisorId:user.sub,message:message.trim(),priority } });
      await tx.leadActivity.create({ data: { leadId,userId:user.sub,note:`Supervisor instruction: ${message.trim()}` } });
      await tx.notification.create({ data: { userId:lead.assignedToId!,channel:'IN_APP',status:'SENT',sentAt:new Date(),title:'Supervisor instruction',body:message.trim(),relatedEntityType:'SupervisorInstruction',relatedEntityId:instruction.id } });
      return instruction;
    });
  }
  async completeInstruction(id: string, user: JwtPayload) {
    return this.prisma.$transaction(async (tx) => {
      const instruction = await tx.supervisorInstruction.findFirst({ where: { id,salespersonId:user.sub } });
      if (!instruction) throw new NotFoundException('Instruction not found');
      const claim = await tx.supervisorInstruction.updateMany({ where: { id,salespersonId:user.sub,status:'OPEN' },data: { status:'COMPLETED',completedAt:new Date(),readAt:new Date() } });
      if (claim.count) {
        await tx.leadActivity.create({ data: { leadId:instruction.leadId,userId:user.sub,note:`Supervisor instruction completed: ${instruction.message}` } });
        await tx.notification.create({ data: { userId:instruction.supervisorId,channel:'IN_APP',status:'SENT',title:'Instruction completed',body:instruction.message,relatedEntityType:'SupervisorInstruction',relatedEntityId:id } });
      }
      return { success:true };
    });
  }
  async reassign(leadId: string, assigneeId: string, reason: string, user: JwtPayload) {
    await this.coaching.assertLead(leadId,user,true);
    if (!hasPermission(user,'supervision.reassign',hasPermission(user,'leads.assign',user.role===Role.SUPER_ADMIN))) throw new ForbiddenException('Lead reassignment permission required');
    const employee = await this.prisma.user.findFirst({ where: { id:assigneeId,isActive:true },include: { accessProfile:true } });
    if (!employee || !hasPermission({ role:employee.role,permissions:employee.accessProfile?.permissions as Record<string,boolean>|undefined },'leads.read',employee.role!=='DENTIST')) throw new BadRequestException('Choose an active salesperson with lead access');
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${leadId}))`;
      await tx.lead.update({ where: { id:leadId },data: { assignedToId:assigneeId } });
      await tx.supervisorInstruction.updateMany({ where: { leadId,status:'OPEN' },data: { salespersonId:assigneeId } });
      await tx.leadTask.updateMany({ where: { leadId,completedAt:null },data: { assignedToId:assigneeId } });
      await tx.leadActivity.create({ data: { leadId,userId:user.sub,note:`Reassigned to ${employee.firstName} ${employee.lastName}: ${reason.trim()}` } });
      return { success:true };
    });
  }
  async waiting(leadId: string, dto: { reason: string|null; reviewAt?: string; temperature?: string },user: JwtPayload) {
    await this.coaching.assertLead(leadId,user);
    if (!hasPermission(user,'leads.write',user.role!=='DENTIST')) throw new ForbiddenException('Lead edit permission required');
    if (dto.reason && (!dto.reviewAt || new Date(dto.reviewAt)<=new Date())) throw new BadRequestException('A waiting state needs a future review time');
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.lead.update({ where: { id:leadId },data: { waitingReason:dto.reason,reviewAt:dto.reason ? new Date(dto.reviewAt!):null,temperature:dto.temperature } });
      await tx.leadActivity.create({ data: { leadId,userId:user.sub,note:dto.reason ? `${dto.reason}; review at ${dto.reviewAt}`:'Waiting state cleared' } });
      return result;
    });
  }
  async assessment(leadId: string,user: JwtPayload) {
    const assessment = await this.prisma.clinicalAssessment.findUnique({ where: { leadId } });
    if (assessment?.reviewerId!==user.sub) await this.coaching.assertLead(leadId,user);
    const requirements = await this.prisma.assessmentRequirement.findMany({ where: { clinicId:'singleton',category:assessment?.treatmentCategory ?? 'DENTAL' },orderBy: { key:'asc' } });
    return { assessment,requirements };
  }
  async checklist(leadId: string,dto: { category: string; checklist: Record<string,boolean>; evidence?: Record<string,string> },user: JwtPayload) {
    const lead = await this.coaching.assertLead(leadId,user);
    if (!hasPermission(user,'leads.write',user.role!=='DENTIST')) throw new ForbiddenException('Lead edit permission required');
    const existing = await this.prisma.clinicalAssessment.findUnique({ where: { leadId } });
    if (existing?.status==='COMPLETED') throw new BadRequestException('Completed clinical assessments cannot be overwritten');
    if (Object.values(dto.checklist).some((value)=>typeof value!=='boolean')) throw new BadRequestException('Checklist values must be true or false');
    const requirements = await this.prisma.assessmentRequirement.findMany({ where: { category:dto.category,clinicId:'singleton' } });
    if (!requirements.length) throw new BadRequestException('Configure assessment requirements for this category first');
    const allowed = new Set(requirements.map((r) => r.key));
    if (Object.keys(dto.checklist).some((key) => !allowed.has(key))) throw new BadRequestException('Unknown assessment requirement');
    const ready = requirements.filter((r) => r.required).every((r) => dto.checklist[r.key]===true);
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.clinicalAssessment.upsert({ where: { leadId },create: { leadId,treatmentCategory:dto.category,checklist:dto.checklist },update: { treatmentCategory:dto.category,checklist:dto.checklist,status:'COLLECTING_INFORMATION',requestedAt:null,reviewerId:null } });
      await tx.leadActivity.create({ data: { leadId,userId:user.sub,note:`Assessment checklist updated (${dto.category}): ${ready?'required information collected':'information still missing'}. Verified by ${user.sub}.` } });
      return result;
    });
  }
  async requestAssessment(leadId: string,reviewerId: string,user: JwtPayload) {
    await this.coaching.assertLead(leadId,user);
    if (!hasPermission(user,'leads.write',user.role!=='DENTIST')) throw new ForbiddenException('Lead edit permission required');
    const { assessment,requirements } = await this.assessment(leadId,user);
    if (!assessment) throw new BadRequestException('Complete the assessment checklist first');
    if (assessment.status==='COMPLETED') throw new BadRequestException('Assessment already completed');
    const missing = requirements.filter((r) => r.required && (assessment.checklist as Record<string,boolean>)[r.key]!==true);
    if (missing.length) throw new BadRequestException(`Still missing: ${missing.map((r) => r.label).join(', ')}`);
    const reviewer = await this.prisma.user.findFirst({ where: { id:reviewerId,isActive:true },include: { accessProfile:true } });
    if (!reviewer || !hasPermission({ role:reviewer.role,permissions:reviewer.accessProfile?.permissions as Record<string,boolean>|undefined },'assessments.review', ['DENTIST','CLINIC_MANAGER','SUPER_ADMIN'].includes(reviewer.role))) throw new BadRequestException('Choose an authorized clinical reviewer');
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.clinicalAssessment.update({ where: { leadId },data: { status:'UNDER_REVIEW',requestedById:user.sub,reviewerId,requestedAt:assessment.requestedAt ?? new Date() } });
      await tx.leadActivity.create({ data: { leadId,userId:user.sub,note:`Doctor assessment requested from ${reviewer.firstName} ${reviewer.lastName}.` } });
      await tx.notification.create({ data: { userId:reviewerId,channel:'IN_APP',status:'SENT',title:'Clinical assessment requested',body:'Required information is ready for your review.',relatedEntityType:'Lead',relatedEntityId:leadId } });
      return result;
    });
  }
  async completeAssessment(leadId: string,notes: string,user: JwtPayload) {
    if (!hasPermission(user,'assessments.review',['DENTIST','CLINIC_MANAGER','SUPER_ADMIN'].includes(user.role))) throw new ForbiddenException('Clinical review permission required');
    const assessment = await this.prisma.clinicalAssessment.findUnique({ where: { leadId },include: { lead:true } });
    if (!assessment || (assessment.reviewerId!==user.sub && user.role!==Role.SUPER_ADMIN)) throw new NotFoundException('Assigned assessment not found');
    if (!['UNDER_REVIEW','READY_FOR_REVIEW'].includes(assessment.status)) throw new BadRequestException('Assessment is not awaiting review');
    return this.prisma.$transaction(async (tx) => {
      const claim = await tx.clinicalAssessment.updateMany({ where: { id:assessment.id,status: { in:['UNDER_REVIEW','READY_FOR_REVIEW'] } },data: { status:'COMPLETED',completedAt:new Date(),clinicalNotes:notes.trim() } });
      if (!claim.count) throw new BadRequestException('Assessment changed; refresh and try again');
      await tx.leadActivity.create({ data: { leadId,userId:user.sub,note:'Doctor assessment completed. Clinical notes are saved in the assessment.' } });
      if (assessment.lead.assignedToId) await tx.notification.create({ data: { userId:assessment.lead.assignedToId,channel:'IN_APP',status:'SENT',title:'Doctor assessment completed',body:'The clinical assessment is ready. Review it before preparing the offer.',relatedEntityType:'Lead',relatedEntityId:leadId } });
      return { success:true };
    });
  }
  async issueQuote(leadId: string,planId: string,reason: string,user: JwtPayload) {
    const lead = await this.coaching.assertLead(leadId,user);
    if (!hasPermission(user,'plans.write',['SUPER_ADMIN','CLINIC_MANAGER','SALES_CONSULTANT','DENTIST'].includes(user.role))) throw new ForbiddenException('Treatment plan write permission required');
    const plan = await this.prisma.treatmentPlan.findUnique({ where: { id:planId },include: { items:true } });
    if (!plan || plan.patientId!==lead.patient?.id) throw new BadRequestException('Choose a treatment plan belonging to this patient');
    if (!plan.items.length || Number(plan.totalCost)<=0) throw new BadRequestException('Add priced treatment items before issuing the quote');
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${leadId}))`;
      const previous = await tx.quoteVersion.findFirst({ where: { leadId },orderBy: { version:'desc' } });
      if (previous && plan.currency===previous.currency && Number(plan.totalCost)<Number(previous.total) && !hasPermission(user,'quotes.approve_discount',mayManage(user))) throw new ForbiddenException('A reduced offer requires discount approval');
      const quote = await tx.quoteVersion.create({ data: { leadId,treatmentPlanId:planId,version:(previous?.version ?? 0)+1,currency:plan.currency,total:plan.totalCost,snapshot:json(plan),createdById:user.sub,approvedById:mayManage(user)?user.sub:null,sentAt:new Date(),changeReason:reason.trim() } });
      await tx.quoteVersion.updateMany({ where: { leadId,id: { not:quote.id },status:'SENT' },data: { status:'SUPERSEDED' } });
      await tx.leadActivity.create({ data: { leadId,userId:user.sub,note:`Treatment plan issued as Quote V${quote.version}: ${quote.total} ${quote.currency}. ${reason.trim()}` } });
      const r = await tx.salesRule.findUnique({ where: { clinicId_key: { clinicId:'singleton',key:'QUOTE_FOLLOW_UP' } } });
      if (lead.assignedToId && r?.enabled) await tx.leadTask.create({ data: { leadId,quoteVersionId:quote.id,title:'Follow up on the sent treatment plan',dueDate:new Date(quote.sentAt!.getTime()+(r.thresholdMinutes ?? 2880)*60_000),assignedToId:lead.assignedToId,createdById:user.sub } });
      return quote;
    });
  }
  async paymentPromise(leadId: string,dto: { dueAt:string; amount:number; currency:string; responsibleUserId?:string },user: JwtPayload) {
    const lead = await this.coaching.assertLead(leadId,user);
    if (!hasPermission(user,'leads.write',user.role!=='DENTIST')) throw new ForbiddenException('Lead edit permission required');
    const responsibleUserId = dto.responsibleUserId ?? lead.assignedToId;
    if (!responsibleUserId) throw new BadRequestException('Choose the person responsible for payment follow-up');
    if (responsibleUserId!==lead.assignedToId && !mayManage(user)) throw new ForbiddenException('Only a supervisor can assign another responsible person');
    if (!(await this.prisma.user.findFirst({ where: { id:responsibleUserId,isActive:true } }))) throw new BadRequestException('Responsible user is inactive');
    return this.prisma.$transaction(async (tx) => {
      const promise = await tx.paymentPromise.create({ data: { ...dto,dueAt:new Date(dto.dueAt),responsibleUserId,leadId,createdById:user.sub } });
      await tx.leadActivity.create({ data: { leadId,userId:user.sub,note:`Payment promised: ${dto.amount} ${dto.currency} by ${dto.dueAt}.` } });
      return promise;
    });
  }
  async requirement(dto: { category:string; key:string; label:string; required:boolean },user: JwtPayload) {
    if (!hasPermission(user,'sales_rules.edit',user.role===Role.SUPER_ADMIN)) throw new ForbiddenException('Sales rule edit permission required');
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.assessmentRequirement.upsert({ where: { clinicId_category_key: { clinicId:'singleton',category:dto.category,key:dto.key } },create:dto,update: { label:dto.label,required:dto.required } });
      await tx.auditLog.create({ data: { userId:user.sub,action:'UPDATE',entityType:'AssessmentRequirement',entityId:result.id,newValues:json(result) } });
      await tx.$executeRaw`INSERT INTO coaching_dirty ("leadId",revision,"updatedAt",attempts,"retryAt") SELECT "leadId",1,CURRENT_TIMESTAMP,0,CURRENT_TIMESTAMP FROM clinical_assessments WHERE "treatmentCategory"=${dto.category} ON CONFLICT ("leadId") DO UPDATE SET revision=coaching_dirty.revision+1,"retryAt"=CURRENT_TIMESTAMP`;
      return result;
    });
  }
}
