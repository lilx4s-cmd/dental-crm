import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { JwtPayload, Role, hasPermission } from '@dental-crm/shared';
import { PrismaService } from '../prisma/prisma.service';
import { CoachingService } from './coaching.service';
import { issueScope, leadScope, mayManage, mayViewTeam, teamLeadScope } from './access';
import { issuePriority } from './rules';
import { Prisma } from '@prisma/client';
const LEAD = { id:true,firstName:true,lastName:true,stage:true,temperature:true };
const PERSON = { id:true,firstName:true,lastName:true };
@Injectable()
export class CoachingViewsService {
  constructor(private readonly prisma:PrismaService,private readonly coaching:CoachingService) {}
  async myDay(user:JwtPayload) {
    const now = new Date();
    const dayStart = new Date(now); dayStart.setUTCHours(0,0,0,0);
    const [settings] = await Promise.all([this.prisma.clinicSettings.findFirst({ select: { timezone:true } })]);
    const timezone = settings?.timezone ?? 'Europe/Istanbul';
    // Find clinic midnight by subtracting the clinic's current wall-clock time from UTC now.
    const parts = new Intl.DateTimeFormat('en-GB',{ timeZone:timezone,hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23' }).formatToParts(now);
    const part = (key:string) => Number(parts.find((p) => p.type===key)?.value ?? 0);
    const start = new Date(now.getTime()-(part('hour')*3600+part('minute')*60+part('second'))*1000-now.getMilliseconds());
    const scope = { assignedToId:user.sub,status:'ACTIVE' as const,mergedIntoId:null };
    const [issues,instructions,tasks,waiting,notifications,clinical,doneMessages,doneTasks,doneQuotes,doneBookings] = await Promise.all([
      this.prisma.coachingIssue.findMany({ where: { AND:[issueScope(user),{ assignedUserId:user.sub,status: { in:['OPEN','ACKNOWLEDGED','ESCALATED'] } }] },include: { lead: { select:LEAD } },take:100,orderBy: [{priority:'desc'},{detectedAt:'asc'}] }),
      this.prisma.supervisorInstruction.findMany({ where: { salespersonId:user.sub,status:'OPEN' },include: { lead: { select:LEAD },supervisor: { select:PERSON } },orderBy: { createdAt:'asc' },take:100 }),
      this.prisma.leadTask.findMany({ where: { assignedToId:user.sub,completedAt:null,review:null,lead: { assignedToId:user.sub,mergedIntoId:null } },include: { lead: { select:LEAD } },orderBy: { dueDate:'asc' },take:50 }),
      this.prisma.lead.findMany({ where: { ...scope,OR:[{ waitingReason: { not:null } },{ assessment: { status: { in:['UNDER_REVIEW','READY_FOR_REVIEW'] } } },{ paymentPromises: { some: { status:'EXPECTED' } } },{ patient: { appointments: { some: { startTime: { gte:now },status: { in:['SCHEDULED','CONFIRMED'] } } } } }] },select: { ...LEAD,waitingReason:true,reviewAt:true,assessment: { select: { status:true,requestedAt:true } },paymentPromises: { where: { status:'EXPECTED' },select: { id:true,dueAt:true,amount:true,currency:true } },patient: { select: { appointments: { where: { startTime: { gte:now },status: { in:['SCHEDULED','CONFIRMED'] } },select: { startTime:true },take:1,orderBy: { startTime:'asc' } } } } },take:50 }),
      this.prisma.notification.findMany({ where: { userId:user.sub,channel:'IN_APP',readAt:null },orderBy: { createdAt:'desc' },take:30 }),
      this.prisma.clinicalAssessment.findMany({ where: { reviewerId:user.sub,status: { in:['READY_FOR_REVIEW','UNDER_REVIEW'] } },include: { lead: { select:LEAD } },take:50 }),
      this.prisma.message.count({ where: { senderUserId:user.sub,direction:'OUTBOUND',status: { in:['SENT','DELIVERED','READ'] },sentAt: { gte:start } } }),
      this.prisma.leadTask.count({ where: { assignedToId:user.sub,completedAt: { gte:start } } }),
      this.prisma.quoteVersion.count({ where: { createdById:user.sub,sentAt: { gte:start } } }),
      this.prisma.appointment.count({ where: { createdById:user.sub,createdAt: { gte:start },status: { notIn:['CANCELLED','NO_SHOW'] } } }),
    ]);
    issues.sort((a,b) => issuePriority(b)-issuePriority(a));
    const contacts = await this.prisma.contactEvidence.count({ where: { firstContactUserId:user.sub,firstContactAt: { gte:start } } });
    const replies = await this.prisma.responseObservation.count({ where: { assignedUserId:user.sub,respondedAt: { gte:start } } });
    const person = await this.prisma.user.findUnique({ where:{ id:user.sub },select:{ firstName:true } });
    return { firstName:person?.firstName,issues,instructions,tasks,waiting,notifications,clinical,doneToday: { contacts,replies,outboundMessages:doneMessages,followUps:doneTasks,quotes:doneQuotes,bookings:doneBookings },timezone,updatedAt:now };
  }
  async leadCoach(id:string,user:JwtPayload) {
    const assessment = await this.prisma.clinicalAssessment.findUnique({ where: { leadId:id },select: { reviewerId:true } });
    if (assessment?.reviewerId!==user.sub || !hasPermission(user,'assessments.review',['DENTIST','CLINIC_MANAGER','SUPER_ADMIN'].includes(user.role))) await this.coaching.assertLead(id,user);
    const [issues,instructions,lead,requirements,quotes,plans,users] = await Promise.all([
      this.prisma.coachingIssue.findMany({ where: { leadId:id,status: { in:['OPEN','ACKNOWLEDGED','ESCALATED'] } },orderBy: { detectedAt:'asc' } }),
      this.prisma.supervisorInstruction.findMany({ where: { leadId:id,...(mayManage(user)?{}:{ salespersonId:user.sub }) },include: { supervisor: { select:PERSON } },orderBy: { createdAt:'desc' },take:20 }),
      this.prisma.lead.findUnique({ where: { id },include: { assessment:true,contactEvidence:true,paymentPromises: { orderBy: { dueAt:'asc' } },tasks: { where: { completedAt:null },orderBy: { dueDate:'asc' },take:5 },patient: { select: { id:true } } } }),
      this.prisma.assessmentRequirement.findMany({ where: { clinicId:'singleton' },orderBy: { key:'asc' } }),
      this.prisma.quoteVersion.findMany({ where: { leadId:id },select: { id:true,version:true,status:true,total:true,currency:true,sentAt:true,changeReason:true,treatmentPlanId:true },orderBy: { version:'desc' },take:20 }),
      this.prisma.treatmentPlan.findMany({ where: { patient: { convertedFromLeadId:id } },select: { id:true,title:true,totalCost:true,currency:true },take:20 }),
      this.prisma.user.findMany({ where: { isActive:true },select: { ...PERSON,role:true,accessProfile: { select: { permissions:true } } } }),
    ]);
    issues.sort((a,b) => issuePriority(b)-issuePriority(a));
    const reviewers = users.filter((u) => hasPermission({ role:u.role,permissions:u.accessProfile?.permissions as Record<string,boolean>|undefined },'assessments.review',['DENTIST','CLINIC_MANAGER','SUPER_ADMIN'].includes(u.role))).map(({ accessProfile,...u }) => u);
    const assignees = users.filter((u) => hasPermission({ role:u.role,permissions:u.accessProfile?.permissions as Record<string,boolean>|undefined },'leads.read',u.role!=='DENTIST')).map(({ accessProfile,...u })=>u);
    return { issues,instructions,lead,requirements,quotes,plans,reviewers,assignees,health:issues.some((i) => i.severity==='RED')?'CRITICAL':issues.length?'NEEDS_ATTENTION':'ON_TRACK' };
  }
  async summary(user:JwtPayload) {
    if (!hasPermission(user,'supervision.view',mayViewTeam(user))) throw new ForbiddenException('Team supervision view permission required');
    const scope = teamLeadScope(user);
    const [groups,employees,issues,instructions] = await Promise.all([
      this.prisma.coachingIssue.groupBy({ by:['ruleKey','severity'],where: { lead:scope,status: { in:['OPEN','ACKNOWLEDGED','ESCALATED'] } },_count: { _all:true } }),
      this.prisma.lead.groupBy({ by:['assignedToId'],where: { AND:[scope,{ status:'ACTIVE',mergedIntoId:null }] },_count: { _all:true } }),
      this.prisma.coachingIssue.groupBy({ by:['assignedUserId','severity'],where: { lead:scope,status: { in:['OPEN','ACKNOWLEDGED','ESCALATED'] } },_count: { _all:true } }),
      this.prisma.supervisorInstruction.findMany({ where: { lead:scope },include: { salesperson: { select:PERSON },lead: { select:LEAD } },orderBy: { createdAt:'desc' },take:30 }),
    ]);
    const ids = [...new Set([...employees.map((e) => e.assignedToId),...issues.map((i) => i.assignedUserId)].filter((id):id is string => !!id))];
    const people = await this.prisma.user.findMany({ where: { id: { in:ids } },select:PERSON });
    return { counts:groups,employees:people.map((person) => ({ ...person,openLeads:employees.find((e) => e.assignedToId===person.id)?._count._all ?? 0,red:issues.filter((i) => i.assignedUserId===person.id && i.severity==='RED').reduce((sum,i) => sum+i._count._all,0),orange:issues.filter((i) => i.assignedUserId===person.id && i.severity==='ORANGE').reduce((sum,i) => sum+i._count._all,0),yellow:issues.filter((i) => i.assignedUserId===person.id && i.severity==='YELLOW').reduce((sum,i) => sum+i._count._all,0) })),instructions };
  }
  async reports(user:JwtPayload,q: { from?:string;to?:string;employeeId?:string;source?:string;country?:string;stage?:string }) {
    if (!hasPermission(user,'reports.read',mayManage(user))) throw new ForbiddenException('Reports view permission required');
    const from = q.from ? new Date(q.from):new Date(Date.now()-30*86400000);
    const to = q.to ? new Date(q.to):new Date();
    if (from>to) throw new ForbiddenException('Invalid report date range');
    const scopedLead: Prisma.LeadWhereInput = { AND:[mayViewTeam(user)?teamLeadScope(user):{ assignedToId:user.sub },{ ...(q.employeeId?{ assignedToId:q.employeeId }:{}),...(q.source?{ source:q.source as Prisma.EnumLeadSourceFilter }:{}),...(q.country?{ country:q.country }:{}),...(q.stage?{ stage:q.stage as Prisma.EnumPipelineStageFilter }:{}) }] };
    const [firstContacts,replies,tasks,issues,lost,stages,campaigns] = await Promise.all([
      this.prisma.firstContactObservation.findMany({where:{lead:scopedLead,assignedAt:{gte:from,lte:to}},select:{responseSeconds:true,contactedAt:true,slaSeconds:true}}),
      this.prisma.responseObservation.findMany({ where: { lead:scopedLead,inboundAt: { gte:from,lte:to } },select: { responseSeconds:true,slaSeconds:true,respondedAt:true } }),
      this.prisma.leadTask.findMany({ where: { lead:scopedLead,dueDate: { gte:from,lte:to } },select: { completedAt:true,dueDate:true } }),
      this.prisma.coachingIssue.findMany({ where: { lead:scopedLead,detectedAt: { gte:from,lte:to } },select: { ruleKey:true,status:true,assignedUserId:true,detectedAt:true,escalatedAt:true,events: { where: { kind: { in:['REMIND','DISMISS','RESOLVE','ESCALATE'] } },select: { id:true } } } }),
      this.prisma.lead.groupBy({ by:['lostReasonCode'],where: { AND:[scopedLead,{ status:'LOST',stageChangedAt: { gte:from,lte:to } }] },_count: { _all:true } }),
      this.prisma.lead.findMany({ where: { AND:[scopedLead,{ status:'ACTIVE',mergedIntoId:null }] },select: { stage:true,stageChangedAt:true,campaignId:true } }),
      this.prisma.lead.groupBy({ by:['campaignId','stage','status'],where: { AND:[scopedLead,{ createdAt: { gte:from,lte:to } }] },_count: { _all:true } }),
    ]);
    const average = (values:number[]) => values.length?Math.round(values.reduce((sum,v) => sum+v,0)/values.length):null;
    const percent = (success:number,total:number) => total?Math.round(success/total*100):null;
    const grouped = (key:'ruleKey'|'assignedUserId') => Object.entries(issues.reduce((acc,i) => { const k=i[key] ?? 'unassigned'; acc[k]=(acc[k] ?? 0)+1;return acc; },{} as Record<string,number>)).map(([key,count]) => ({ key,count }));
    const days = Object.entries(issues.reduce((acc,i) => { const day=i.detectedAt.toISOString().slice(0,10);acc[day]=(acc[day] ?? 0)+1;return acc; },{} as Record<string,number>)).map(([date,count]) => ({ date,count }));
    return { from,to,averageFirstResponseSeconds:average(firstContacts.flatMap((c) => c.responseSeconds===null?[]:[c.responseSeconds])),newLeadSlaPercent:percent(firstContacts.filter((c) => c.responseSeconds!==null && c.responseSeconds<=c.slaSeconds).length,firstContacts.length),averageReplySeconds:average(replies.flatMap((r) => r.responseSeconds===null?[]:[r.responseSeconds])),replySlaPercent:percent(replies.filter((r) => r.responseSeconds!==null && r.responseSeconds<=r.slaSeconds).length,replies.length),followUpCompletionPercent:percent(tasks.filter((t) => t.completedAt && t.completedAt<=t.dueDate).length,tasks.length),unansweredMessages:replies.filter((r) => !r.respondedAt).length,issuesByRule:grouped('ruleKey'),issuesByEmployee:grouped('assignedUserId'),issuesOverTime:days,supervisorInterventions:issues.reduce((sum,i) => sum+i.events.length,0),lostReasons:lost.map((l) => ({ reason:l.lostReasonCode ?? 'UNRECORDED',count:l._count._all })),stageAging:Object.entries(stages.reduce((acc,l) => { const group=acc[l.stage] ?? { count:0,totalHours:0 };group.count++;group.totalHours+=(Date.now()-l.stageChangedAt.getTime())/3600000;acc[l.stage]=group;return acc; },{} as Record<string,{ count:number;totalHours:number }>)).map(([stage,v]) => ({ stage,count:v.count,averageHours:Math.round(v.totalHours/v.count) })),campaignFunnel:campaigns.map((c) => ({ campaignId:c.campaignId,stage:c.stage,status:c.status,leads:c._count._all })),sampleSizes: { assignedLeads:firstContacts.length,inboundMessages:replies.length,tasks:tasks.length },definitions: { contact:'Successful outbound message or recorded outbound call after assignment.',reply:'Each captured inbound message paired with its first subsequent successful outbound reply in the same conversation.',followUp:'Task completed at or before its due time. Reschedule history remains in the timeline.' } };
  }
  async requirements(user:JwtPayload) {
    if (!hasPermission(user,'sales_rules.view',mayManage(user))) throw new ForbiddenException('Sales rule view permission required');
    return this.prisma.assessmentRequirement.findMany({ where: { clinicId:'singleton' },orderBy: [{ category:'asc' },{ key:'asc' }] });
  }
  async readNotification(id:string,user:JwtPayload) {
    const result = await this.prisma.notification.updateMany({ where: { id,userId:user.sub },data: { readAt:new Date(),status:'READ' } });
    if (!result.count) throw new NotFoundException('Notification not found');
    return { success:true };
  }
}
