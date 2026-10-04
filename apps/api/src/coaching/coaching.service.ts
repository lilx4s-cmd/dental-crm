import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Cron, Interval } from '@nestjs/schedule';
import { JwtPayload, Role, canSeeAllLeads, hasPermission } from '@dental-crm/shared';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_RULES, DEFAULT_REQUIREMENTS, evaluateRules, issuePriority, RuleConfig, RuleContext, Finding } from './rules';
import { allocatePayments } from './payments';
import { issueScope, leadScope, mayEditRules, mayManage, mayViewTeam, teamLeadScope } from './access';
const ACTIVE = ['OPEN', 'ACKNOWLEDGED', 'ESCALATED'];
const PERSON = { id: true, firstName: true, lastName: true };
const ISSUE_INCLUDE = { lead: { select: { id: true, firstName: true, lastName: true, stage: true, country: true, source: true, temperature: true, assignedToId: true, supervisorId: true } }, assignedUser: { select: PERSON }, supervisorUser: { select: PERSON } };
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
@Injectable()
export class CoachingService implements OnModuleInit {
  private readonly logger = new Logger(CoachingService.name);
  private draining = false;
  constructor(private readonly prisma: PrismaService) {}
  async onModuleInit() { await this.ensureDefaults(); }
  async ensureDefaults() {
    for (const r of DEFAULT_RULES) await this.prisma.salesRule.upsert({ where: { clinicId_key: { clinicId: 'singleton', key: r.key } }, create: { ...r, settings: json(r.settings) }, update: {} });
    for (const [category, requirements] of Object.entries(DEFAULT_REQUIREMENTS)) for (const [key, label] of requirements) await this.prisma.assessmentRequirement.upsert({ where: { clinicId_category_key: { clinicId: 'singleton', category, key } }, create: { category, key, label }, update: {} });
  }
  @Interval(1000)
  async drain() {
    if (this.draining) return;
    this.draining = true;
    try {
      const pending = await this.prisma.coachingDirty.findMany({ where: { retryAt: { lte: new Date() } }, orderBy: { updatedAt: 'asc' }, take: 25 });
      for (const item of pending) {
        try {
          await this.evaluateLead(item.leadId);
          await this.prisma.coachingDirty.deleteMany({ where: { leadId: item.leadId, revision: item.revision } });
        } catch (error) {
          // Failed items retain their revision and retry with bounded backoff, never blocking the queue.
          await this.prisma.coachingDirty.updateMany({ where: { leadId: item.leadId, revision: item.revision }, data: { attempts: { increment: 1 }, retryAt: new Date(Date.now() + Math.min(300_000, 1000 * 2 ** Math.min(item.attempts, 8))), lastError: 'Evaluation failed; retry scheduled' } });
          this.logger.error(`Coaching evaluation failed for ${item.leadId}: ${error instanceof Error ? error.message : 'unknown error'}`);
        }
      }
    } catch (error) { this.logger.error(`Coaching queue failed: ${error instanceof Error ? error.message : 'unknown error'}`); }
    finally { this.draining = false; }
  }
  @Cron('*/5 * * * *')
  async reconcile() {
    try {
      // Enqueue ids only. Workers consume small batches; page requests never scan messages.
      await this.prisma.$executeRaw`INSERT INTO coaching_dirty ("leadId",revision,"updatedAt",attempts,"retryAt") SELECT id,1,CURRENT_TIMESTAMP,0,CURRENT_TIMESTAMP FROM leads WHERE (status='ACTIVE' AND "mergedIntoId" IS NULL) OR EXISTS (SELECT 1 FROM coaching_issues i WHERE i."leadId"=leads.id AND i.status IN ('OPEN','ACKNOWLEDGED','ESCALATED')) ON CONFLICT ("leadId") DO NOTHING`;
    } catch (error) { this.logger.error(`Coaching reconciliation failed: ${error instanceof Error ? error.message : 'unknown error'}`); }
  }
  async evaluateLead(leadId: string, now = new Date()) {
    return this.prisma.$transaction(async (tx) => {
      // Same lock for events, scheduler, dismissals and instructions. Released on commit/rollback.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${leadId}))`;
      const lead = await tx.lead.findUnique({ where: { id: leadId }, include: { tasks: true, assessment: true, patient: { include: { appointments: { where: { status: { in: ['SCHEDULED','CONFIRMED','CHECKED_IN','COMPLETED'] } }, orderBy:{startTime:'desc'}, take:20 }, invoices: { include: { payments: { where: { status: 'COMPLETED' } } } } } }, quoteVersions: { where: { sentAt: { not: null }, status: { in: ['SENT','ACCEPTED'] } }, orderBy: { version: 'desc' }, take: 1 }, paymentPromises: { where: { status: { not:'CANCELLED' } }, orderBy: { createdAt: 'asc' } } } });
      if (!lead) return;
      const configs = await tx.salesRule.findMany({ where: { clinicId: 'singleton' } });
      const rules = configs.map((r) => ({ ...r, settings: r.settings as Record<string, unknown> })) as RuleConfig[];
      const requirements = lead.assessment ? await tx.assessmentRequirement.findMany({ where: { clinicId: 'singleton', category: lead.assessment.treatmentCategory, required: true } }) : [];
      const checklist = (lead.assessment?.checklist ?? {}) as Record<string, unknown>;
      // First contact is based on successful delivery time, not queued creation time or stage changes.
      type ContactRow = { at: Date; userId: string | null; channel: string };
      const contacts = await tx.$queryRaw<ContactRow[]>`SELECT COALESCE(m."sentAt",m."createdAt") AS at,m."senderUserId" AS "userId",c.channel::text AS channel FROM messages m JOIN conversations c ON c.id=m."conversationId" LEFT JOIN patients p ON p.id=c."patientId" WHERE (c."leadId"=${leadId} OR p."convertedFromLeadId"=${leadId}) AND m.direction='OUTBOUND' AND m.status IN ('SENT','DELIVERED','READ') AND COALESCE(m."sentAt",m."createdAt") >= ${lead.assignedAt} UNION ALL SELECT "occurredAt", "userId", 'CALL' FROM call_logs WHERE ("leadId"=${leadId} OR "patientId"=${lead.patient?.id ?? ''}) AND direction='OUTBOUND' AND "occurredAt">=${lead.assignedAt} ORDER BY at ASC`;
      type MessageAggregate = { lastInboundAt: Date | null; lastOutboundAt: Date | null };
      const [aggregate] = await tx.$queryRaw<MessageAggregate[]>`SELECT max(m."createdAt") FILTER (WHERE m.direction='INBOUND') AS "lastInboundAt",max(COALESCE(m."sentAt",m."createdAt")) FILTER (WHERE m.direction='OUTBOUND' AND m.status IN ('SENT','DELIVERED','READ')) AS "lastOutboundAt" FROM messages m JOIN conversations c ON c.id=m."conversationId" LEFT JOIN patients p ON p.id=c."patientId" WHERE c."leadId"=${leadId} OR p."convertedFromLeadId"=${leadId}`;
      type WaitRow = { conversationId: string; since: Date; messageId: string };
      const waiting = await tx.$queryRaw<WaitRow[]>`SELECT c.id AS "conversationId",w."createdAt" AS since,w.id AS "messageId" FROM conversations c LEFT JOIN patients p ON p.id=c."patientId" JOIN LATERAL (SELECT m.id,m."createdAt" FROM messages m WHERE m."conversationId"=c.id AND m.direction='INBOUND' AND m."createdAt">COALESCE((SELECT max(COALESCE(o."sentAt",o."createdAt")) FROM messages o WHERE o."conversationId"=c.id AND o.direction='OUTBOUND' AND o.status IN ('SENT','DELIVERED','READ')),'-infinity'::timestamp) ORDER BY m."createdAt" ASC,m.id ASC LIMIT 1) w ON TRUE WHERE (c."leadId"=${leadId} OR p."convertedFromLeadId"=${leadId})`;
      const replyRule = rules.find((r) => r.key === 'PATIENT_WAITING_REPLY');
      // Freeze the SLA used when a reply was received. Later settings never rewrite history.
      await tx.$executeRaw`INSERT INTO response_observations (id,"leadId","inboundMessageId","assignedUserId","inboundAt","slaSeconds","createdAt") SELECT gen_random_uuid()::text,${leadId},m.id,${lead.assignedToId},m."createdAt",${(replyRule?.thresholdMinutes ?? 10)*60},CURRENT_TIMESTAMP FROM messages m JOIN conversations c ON c.id=m."conversationId" LEFT JOIN patients p ON p.id=c."patientId" WHERE (c."leadId"=${leadId} OR p."convertedFromLeadId"=${leadId}) AND m.direction='INBOUND' AND m."createdAt">=${lead.assignedAt} ON CONFLICT ("inboundMessageId") DO NOTHING`;
      await tx.$executeRaw`UPDATE response_observations r SET "respondedAt"=answers.at,"responseSeconds"=GREATEST(0,EXTRACT(EPOCH FROM (answers.at-r."inboundAt"))::int) FROM (SELECT r2.id,min(COALESCE(o."sentAt",o."createdAt")) AS at FROM response_observations r2 JOIN messages inbound ON inbound.id=r2."inboundMessageId" JOIN messages o ON o."conversationId"=inbound."conversationId" AND o.direction='OUTBOUND' AND o.status IN ('SENT','DELIVERED','READ') AND COALESCE(o."sentAt",o."createdAt")>=r2."inboundAt" WHERE r2."leadId"=${leadId} AND r2."respondedAt" IS NULL GROUP BY r2.id) answers WHERE r.id=answers.id`;
      const response = await tx.responseObservation.findFirst({ where: { leadId, respondedAt: { not: null } }, orderBy: { respondedAt: 'desc' } });
      const first = contacts[0];
      const last = contacts[contacts.length-1];
      await tx.firstContactObservation.upsert({where:{leadId_assignedAt:{leadId,assignedAt:lead.assignedAt}},create:{leadId,assignedAt:lead.assignedAt,assignedUserId:lead.assignedToId,slaSeconds:(rules.find(r=>r.key==='NEW_LEAD_NOT_CONTACTED')?.thresholdMinutes ?? 5)*60,contactedAt:first?.at,responseSeconds:first?Math.max(0,Math.floor((first.at.getTime()-lead.assignedAt.getTime())/1000)):null},update:{contactedAt:first?.at ?? null,responseSeconds:first?Math.max(0,Math.floor((first.at.getTime()-lead.assignedAt.getTime())/1000)):null}});
      const activityTimes = [aggregate?.lastInboundAt, aggregate?.lastOutboundAt, last?.at].filter((v): v is Date => !!v);
      const lastMeaningfulActivityAt = activityTimes.length ? new Date(Math.max(...activityTimes.map((v) => v.getTime()))) : null;
      await tx.contactEvidence.upsert({ where: { leadId }, create: { leadId, firstContactAt: first?.at, firstContactUserId: first?.userId, firstContactChannel: first?.channel, lastInboundAt: aggregate?.lastInboundAt, lastOutboundAt: aggregate?.lastOutboundAt, lastMeaningfulActivityAt, lastContactedByUserId: last?.userId, firstResponseTimeSeconds: first ? Math.max(0, Math.floor((first.at.getTime()-lead.assignedAt.getTime())/1000)) : null, latestResponseTimeSeconds: response?.responseSeconds }, update: { firstContactAt: first?.at ?? null, firstContactUserId: first?.userId ?? null, firstContactChannel: first?.channel ?? null, lastInboundAt: aggregate?.lastInboundAt, lastOutboundAt: aggregate?.lastOutboundAt, lastMeaningfulActivityAt, lastContactedByUserId: last?.userId ?? null, firstResponseTimeSeconds: first ? Math.max(0, Math.floor((first.at.getTime()-lead.assignedAt.getTime())/1000)) : null, latestResponseTimeSeconds: response?.responseSeconds ?? null } });
      const contactMatches: Prisma.LeadWhereInput[] = [];
      for (const number of [lead.phone,lead.whatsappNumber].filter((v): v is string => !!v)) contactMatches.push({ phone: number },{ whatsappNumber: number });
      if (lead.email) contactMatches.push({ email: { equals: lead.email.trim(), mode: 'insensitive' } });
      const duplicates = contactMatches.length ? await tx.lead.findMany({ where: { id: { not: leadId }, mergedIntoId: null, status: 'ACTIVE', OR: contactMatches }, select: { id: true }, take: 20 }) : [];
      const lateReplies = await tx.$queryRaw<{ count: bigint }[]>`SELECT count(*) AS count FROM response_observations WHERE "assignedUserId"=${lead.assignedToId} AND "inboundAt">=${new Date(now.getTime()-7*86400000)} AND ("responseSeconds">"slaSeconds" OR ("respondedAt" IS NULL AND "inboundAt"<${now} - "slaSeconds" * interval '1 second'))`;
      const payments = lead.patient?.invoices.flatMap((invoice) => invoice.payments) ?? [];
      const paidAmounts=allocatePayments(lead.paymentPromises.map(p=>({...p,amount:Number(p.amount)})),payments.map(p=>({amount:Number(p.amount),currency:p.currency,at:p.paidAt ?? p.createdAt})));
      for(const promise of lead.paymentPromises) if(promise.status==='EXPECTED' && (paidAmounts.get(promise.id) ?? 0)>=Number(promise.amount)) await tx.paymentPromise.update({where:{id:promise.id},data:{status:'FULFILLED'}});
      const repeatedAnchor = await tx.lead.findFirst({where:{assignedToId:lead.assignedToId,status:'ACTIVE',mergedIntoId:null},orderBy:{createdAt:'asc'},select:{id:true}});
      const context: RuleContext = { ...lead, firstContactAt: first?.at ?? null, lastMeaningfulActivityAt, lastInboundAt: aggregate?.lastInboundAt ?? null, lastOutboundAt: aggregate?.lastOutboundAt ?? null, waiting, upcomingAppointment: !!lead.patient?.appointments.some(a=>a.startTime>=now && a.status!=='COMPLETED'), quote: lead.quoteVersions[0] ?? null, missingRequirements: requirements.filter((r) => checklist[r.key] !== true).map((r) => r.label), promises: lead.paymentPromises.filter(p=>p.status==='EXPECTED').map((promise) => ({ ...promise, amount: Number(promise.amount), paid: paidAmounts.get(promise.id) ?? 0 })), duplicateIds: duplicates.map((d) => d.id), bookingEvidence: !!lead.patient?.appointments.length || payments.length>0, repeatedReplyMisses: repeatedAnchor?.id===leadId ? Number(lateReplies[0]?.count ?? 0) : 0 };
      const findings = evaluateRules(context, rules, now);
      // Unassigned clinical issues go to an active manager; never to the salesperson by accident.
      const manager = !lead.supervisorId ? await tx.user.findFirst({ where: { isActive: true, role: { in: ['CLINIC_MANAGER','SUPER_ADMIN'] } }, orderBy: { createdAt: 'asc' }, select: { id: true } }) : null;
      const supervisorId = lead.supervisorId ?? manager?.id ?? null;
      for (const finding of findings) if (finding.category === 'CLINICAL' && !finding.assignedUserId) finding.assignedUserId = supervisorId;
      await this.syncIssues(tx, leadId, lead.patient?.id ?? null, supervisorId, findings, rules, now, {temperature:lead.temperature,stage:lead.stage});
      // Sent versions generate one real follow-up, not one per reconciliation.
      const quote = lead.quoteVersions[0];
      if (quote?.sentAt && lead.assignedToId) {
        const config = rules.find((r) => r.key === 'QUOTE_FOLLOW_UP');
        if (config?.enabled) await tx.leadTask.upsert({ where: { quoteVersionId: quote.id }, create: { leadId, quoteVersionId: quote.id, title: 'Follow up on the sent treatment plan', dueDate: new Date(quote.sentAt.getTime()+(config.thresholdMinutes ?? 2880)*60000), assignedToId: lead.assignedToId, createdById: quote.createdById }, update: {} });
      }
      return findings;
    }, { timeout: 20_000 });
  }
  private async event(tx: Prisma.TransactionClient, issue: { id: string; leadId: string; title: string }, kind: string, note: string, actorId?: string) {
    await tx.coachingIssueEvent.create({ data: { issueId: issue.id, kind, note, actorId } });
    await tx.leadActivity.create({ data: { leadId: issue.leadId, userId: actorId, note: `${issue.title}: ${note}` } });
  }
  private async notify(tx: Prisma.TransactionClient, userId: string | null, title: string, body: string, type: string, id: string) {
    if (!userId) return;
    await tx.notification.create({ data: { userId, channel: 'IN_APP', status: 'SENT', sentAt: new Date(), title, body, relatedEntityType: type, relatedEntityId: id } });
  }
  private async syncIssues(tx: Prisma.TransactionClient, leadId: string, patientId: string | null, supervisorUserId: string | null, findings: Finding[], rules: RuleConfig[], now: Date, leadHints:{temperature:string;stage:string}) {
    const existing = await tx.coachingIssue.findMany({ where: { leadId, status: { in: [...ACTIVE,'DISMISSED'] } }, orderBy: { detectedAt: 'desc' } });
    const keys = new Set(findings.map((f) => f.ruleKey));
    for (const issue of existing.filter((i) => ACTIVE.includes(i.status))) {
      if (!keys.has(issue.ruleKey) || findings.find((f) => f.ruleKey===issue.ruleKey)?.fingerprint !== issue.fingerprint) {
        await tx.coachingIssue.update({ where: { id: issue.id }, data: { status: 'RESOLVED', resolvedAt: now, autoResolved: true, resolutionReason: 'Underlying condition no longer applies' } });
        await this.event(tx,issue,'AUTO_RESOLVED','Automatically resolved after the underlying condition changed.');
        await tx.notification.updateMany({ where: { relatedEntityType: 'CoachingIssue', relatedEntityId: issue.id, readAt: null }, data: { readAt: now, status: 'READ' } });
      }
    }
    for (const finding of findings) {
      const same = existing.find((i) => i.ruleKey===finding.ruleKey && i.fingerprint===finding.fingerprint && ACTIVE.includes(i.status));
      if (!same && existing.some((i) => i.ruleKey===finding.ruleKey && i.status==='DISMISSED' && i.dismissedFingerprint===finding.fingerprint)) continue;
      const rule = rules.find((r) => r.key===finding.ruleKey)!;
      const redSince = finding.severity==='RED' ? same?.redSince ?? now : null;
      const escalationDue = !!redSince && now.getTime()-redSince.getTime() >= rule.escalationMinutes*60_000;
      const priority=Math.floor(issuePriority({ ...finding,detectedAt:same?.detectedAt ?? now,escalatedAt:same?.escalatedAt,lead:leadHints },now));
      const issue = same ? await tx.coachingIssue.update({ where: { id: same.id }, data: { ...finding, priority, metadata: json(finding.metadata), lastViolationAt: now, supervisorUserId, redSince, status: same.status, assignedUserId: finding.assignedUserId } }) : await tx.coachingIssue.create({ data: { ...finding, priority, metadata: json(finding.metadata), leadId, patientId, supervisorUserId, detectedAt: now, lastViolationAt: now, redSince } });
      if (!same) {
        await this.event(tx,issue,'DETECTED','Coaching issue detected.');
        await this.notify(tx,issue.assignedUserId,issue.title,issue.recommendedAction,'CoachingIssue',issue.id);
      } else if (same.severity!==finding.severity) await this.event(tx,issue,'SEVERITY_CHANGED',`Priority changed to ${finding.severity}.`);
      if (escalationDue && !issue.escalatedAt && supervisorUserId) {
        await tx.coachingIssue.update({ where: { id: issue.id }, data: { status: 'ESCALATED', escalatedAt: now } });
        await this.event(tx,issue,'ESCALATED','Escalated to the lead supervisor.');
        await this.notify(tx,supervisorUserId,`Needs attention: ${issue.title}`,issue.recommendedAction,'CoachingIssue',issue.id);
      }
    }
  }
  async list(user: JwtPayload, filter: { leadId?: string; severity?: string; ruleKey?: string; employeeId?: string; country?: string; source?: string; stage?: string; from?: string; to?: string; status?: string; page?: number } = {}) {
    const where: Prisma.CoachingIssueWhereInput = { AND: [issueScope(user), { status: filter.status ?? { in: ACTIVE }, ...(filter.leadId ? { leadId: filter.leadId } : {}), ...(filter.severity ? { severity: filter.severity } : {}), ...(filter.ruleKey ? { ruleKey: filter.ruleKey } : {}), ...(filter.employeeId ? { assignedUserId: filter.employeeId } : {}), ...(filter.from || filter.to ? { detectedAt: { ...(filter.from ? { gte: new Date(filter.from) } : {}), ...(filter.to ? { lte: new Date(filter.to) } : {}) } } : {}), lead: { ...(filter.country ? { country: filter.country } : {}), ...(filter.source ? { source: filter.source as Prisma.EnumLeadSourceFilter } : {}), ...(filter.stage ? { stage: filter.stage as Prisma.EnumPipelineStageFilter } : {}) } }] };
    const page = filter.page ?? 1;
    const [issues,total] = await Promise.all([this.prisma.coachingIssue.findMany({ where, include: ISSUE_INCLUDE, orderBy: [{ priority:'desc' },{ detectedAt:'asc' }], take: 100, skip: (page-1)*100 }),this.prisma.coachingIssue.count({ where })]);
    issues.sort((a,b) => issuePriority(b)-issuePriority(a));
    return { issues, total, page };
  }
  async assertLead(id: string, user: JwtPayload, manage = false) {
    const lead = await this.prisma.lead.findFirst({ where: { AND: [{ id },manage ? teamLeadScope(user) : leadScope(user)] }, include: { patient: { select: { id: true } } } });
    if (!lead) throw new NotFoundException('Lead not found');
    if (manage && !mayManage(user)) throw new ForbiddenException('Supervision management permission required');
    return lead;
  }
  async issueAction(id: string, action: 'acknowledge'|'dismiss'|'resolve'|'escalate'|'remind', note: string | undefined, user: JwtPayload) {
    const visible = await this.prisma.coachingIssue.findFirst({ where: { AND: [{ id },issueScope(user)] } });
    if (!visible) throw new NotFoundException('Issue not found');
    if (action!=='acknowledge') await this.assertLead(visible.leadId,user,true);
    if (action==='dismiss' && !hasPermission(user,'supervision.dismiss',mayManage(user))) throw new ForbiddenException('Dismiss permission required');
    if (action==='acknowledge' && visible.assignedUserId!==user.sub) throw new ForbiddenException('Only the responsible person can acknowledge this issue');
    if (['dismiss','resolve'].includes(action) && (!note || note.trim().length<3)) throw new BadRequestException('A reason is required');
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${visible.leadId}))`;
      const issue = await tx.coachingIssue.findUnique({ where: { id } });
      if (!issue || !ACTIVE.includes(issue.status)) throw new BadRequestException('This issue is already closed');
      if (action==='remind') {
        // At most one unread reminder per issue/recipient, rather than repeated popups.
        const unread = await tx.notification.findFirst({ where: { userId: issue.assignedUserId ?? '', relatedEntityType: 'CoachingReminder', relatedEntityId: id, readAt: null } });
        if (!unread) await this.notify(tx,issue.assignedUserId,`Supervisor reminder: ${issue.title}`,note?.trim() || issue.recommendedAction,'CoachingReminder',id);
      } else {
        await tx.coachingIssue.update({ where: { id }, data: action==='acknowledge' ? { acknowledgedAt: new Date(), status: issue.status==='ESCALATED' ? 'ESCALATED' : 'ACKNOWLEDGED' } : action==='escalate' ? { status: 'ESCALATED', escalatedAt: issue.escalatedAt ?? new Date() } : { status: action==='dismiss' ? 'DISMISSED':'RESOLVED', resolvedAt: new Date(), resolutionReason: note!.trim(), dismissedFingerprint: issue.fingerprint, autoResolved: false } });
        if (action==='escalate' && !issue.escalatedAt) await this.notify(tx,issue.supervisorUserId,issue.title,note || issue.recommendedAction,'CoachingIssue',id);
      }
      await this.event(tx,issue,action.toUpperCase(),note?.trim() || action,user.sub);
      return { success: true };
    });
  }
  async rules(user: JwtPayload) {
    if (!hasPermission(user,'sales_rules.view',mayManage(user))) throw new ForbiddenException('Sales rule view permission required');
    return this.prisma.salesRule.findMany({ where: { clinicId:'singleton' }, orderBy: { createdAt:'asc' } });
  }
  async updateRule(id: string, dto: Partial<RuleConfig>, user: JwtPayload) {
    if (!mayEditRules(user)) throw new ForbiddenException('Sales rule edit permission required');
    const current = await this.prisma.salesRule.findFirst({ where: { id,clinicId:'singleton' } });
    if (!current) throw new NotFoundException('Rule not found');
    const threshold = dto.thresholdMinutes ?? current.thresholdMinutes;
    const warning = dto.warningMinutes === undefined ? current.warningMinutes : dto.warningMinutes;
    if (warning!==null && threshold!==null && warning>threshold) throw new BadRequestException('Warning threshold must not exceed the SLA target');
    if (dto.settings) {
      for (const [key,value] of Object.entries(dto.settings)) {
        if (!['stageMinutes','count'].includes(key)) throw new BadRequestException('Unknown rule setting');
        if (key==='count' && (!Number.isInteger(value) || Number(value)<1 || Number(value)>100)) throw new BadRequestException('Count must be an integer from 1 to 100');
        if (key==='stageMinutes' && (!value || typeof value!=='object' || Array.isArray(value) || Object.values(value).some((v) => !Number.isInteger(v) || Number(v)<0 || Number(v)>525600))) throw new BadRequestException('Stage thresholds must be nonnegative minutes');
      }
    }
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.salesRule.update({ where: { id }, data: { enabled:dto.enabled, thresholdMinutes:dto.thresholdMinutes, warningMinutes:dto.warningMinutes, escalationMinutes:dto.escalationMinutes, severity:dto.severity, ...(dto.settings ? { settings:json(dto.settings) } : {}) } });
      await tx.auditLog.create({ data: { userId:user.sub,action:'UPDATE',entityType:'SalesRule',entityId:id,oldValues:json(current),newValues:json(result) } });
      await tx.$executeRaw`INSERT INTO coaching_dirty ("leadId",revision,"updatedAt",attempts,"retryAt") SELECT id,1,CURRENT_TIMESTAMP,0,CURRENT_TIMESTAMP FROM leads WHERE status='ACTIVE' ON CONFLICT ("leadId") DO UPDATE SET revision=coaching_dirty.revision+1,"retryAt"=CURRENT_TIMESTAMP`;
      return result;
    });
  }
}
