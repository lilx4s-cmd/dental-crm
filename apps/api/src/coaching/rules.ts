export type Severity = 'YELLOW' | 'ORANGE' | 'RED';
export type RuleConfig = { key: string; name: string; description: string; enabled: boolean; thresholdMinutes: number | null; warningMinutes: number | null; escalationMinutes: number; severity: string; settings: Record<string, unknown> };
const rule = (key: string, name: string, minutes: number | null, severity: Severity = 'ORANGE', settings: Record<string, unknown> = {}): RuleConfig => ({ key, name, description: name, enabled: true, thresholdMinutes: minutes, warningMinutes: null, escalationMinutes: 30, severity, settings });
export const DEFAULT_RULES: RuleConfig[] = [
  rule('NEW_LEAD_NOT_CONTACTED', 'New lead first contact', 5, 'RED'),
  rule('PATIENT_WAITING_REPLY', 'Incoming patient reply', 10, 'RED'),
  rule('OVERDUE_FOLLOW_UP', 'Overdue follow-up', 60),
  rule('NO_NEXT_ACTION', 'Next step missing', 0, 'YELLOW'),
  rule('STUCK_IN_STAGE', 'Lead stuck in stage', 1440, 'YELLOW', { stageMinutes: { NEW_DEAL: 60, CONTACTED: 1440, WAITING_PHOTOS: 2880, CONSULTATION: 1440, OFFER_SENT: 2880, NEGOTIATION: 1440, WAITING_FOR_TICKET: 2880, TICKET: 10080, SECOND_VISIT: 129600 } }),
  rule('QUOTE_FOLLOW_UP', 'Follow-up after quote', 2880),
  rule('INCOMPLETE_ASSESSMENT', 'Assessment information incomplete', 0, 'YELLOW'),
  rule('DOCTOR_REVIEW_DELAY', 'Doctor review pending', 240),
  rule('PRICE_WITHOUT_QUOTE', 'Price discussion without treatment plan', 0, 'YELLOW'),
  rule('LOST_REASON_MISSING', 'Lost reason missing', 0),
  rule('HOT_LEAD_NEGLECTED', 'Hot lead inactivity', 720, 'RED'),
  rule('ACTIVE_LEAD_INACTIVITY', 'Active lead inactivity', 1440),
  rule('PATIENT_STOPPED_REPLYING', 'Follow-up after patient stops replying', 1440),
  rule('PAYMENT_PROMISE_OVERDUE', 'Promised payment follow-up', 0),
  rule('DUPLICATE_LEAD', 'Possible duplicate lead', 0, 'YELLOW'),
  rule('SUSPICIOUS_MOVEMENT', 'Pipeline movement needs review', 0),
  rule('REPEATED_NEGLIGENCE', 'Repeated response delays', 0, 'YELLOW', { count: 3 }),
  rule('REPEATED_RESCHEDULE', 'Repeated follow-up rescheduling', 0, 'ORANGE', { count: 3 }),
];
export const LOST_REASONS = ['PRICE', 'NO_RESPONSE', 'COMPETITOR', 'TRAVEL_PROBLEM', 'FINANCING', 'NOT_ELIGIBLE', 'NOT_READY', 'TRUST_CONCERN', 'LANGUAGE', 'FAKE_LEAD', 'DUPLICATE', 'BOOKED_ELSEWHERE', 'OTHER'];
export const DEFAULT_REQUIREMENTS = {
  DENTAL: [['SMILE', 'Smile photo'], ['UPPER', 'Upper teeth photo'], ['LOWER', 'Lower teeth photo'], ['HISTORY', 'Medical history'], ['MEDICATION', 'Current medication (including none)']],
  HAIR: [['FRONT', 'Front photo'], ['TOP', 'Top photo'], ['DONOR', 'Back/donor photo'], ['SIDES', 'Side views'], ['HISTORY', 'Medical history']],
  AESTHETIC: [['PHOTOS', 'Requested treatment photos'], ['HISTORY', 'Medical history']],
};
export type Finding = { ruleKey: string; severity: Severity; title: string; description: string; recommendedAction: string; category: string; assignedUserId: string | null; fingerprint: string; firstViolationAt: Date; dueAt: Date | null; actionPath: string; metadata: Record<string, unknown> };
export type RuleContext = {
  id: string; status: string; stage: string; mergedIntoId: string | null; assignedToId: string | null; supervisorId: string | null; createdAt: Date; assignedAt: Date; stageChangedAt: Date; temperature: string; waitingReason: string | null; reviewAt: Date | null; lostReasonCode: string | null; estimatedValue: unknown;
  firstContactAt: Date | null; lastMeaningfulActivityAt: Date | null; lastInboundAt: Date | null; lastOutboundAt: Date | null;
  waiting: { conversationId: string; since: Date; messageId: string }[];
  tasks: { id: string; dueDate: Date; completedAt: Date | null; rescheduleCount: number; assignedToId: string | null }[];
  upcomingAppointment: boolean; quote: { id: string; sentAt: Date | null } | null;
  missingRequirements: string[]; assessment: { id: string; status: string; requestedAt: Date | null; reviewerId: string | null } | null;
  promises: { id: string; dueAt: Date; amount: number; currency: string; responsibleUserId: string; paid: number }[];
  duplicateIds: string[]; bookingEvidence: boolean; repeatedReplyMisses: number;
};
const severityRank = { YELLOW: 0, ORANGE: 1, RED: 2 };
export function issuePriority(issue: { severity: string; ruleKey: string; detectedAt: Date; escalatedAt?: Date | null; lead?: { temperature?: string; stage?: string } }, now = new Date()) {
  return (severityRank[issue.severity as Severity] ?? 0) * 1_000_000 + (issue.ruleKey === 'PATIENT_WAITING_REPLY' ? 300_000 : 0) + (issue.escalatedAt ? 100_000 : 0) + (issue.lead?.temperature === 'HOT' ? 50_000 : 0) + (['NEGOTIATION', 'WAITING_FOR_TICKET'].includes(issue.lead?.stage ?? '') ? 20_000 : 0) + Math.min(10_000, Math.max(0, (now.getTime() - issue.detectedAt.getTime()) / 60_000));
}
export function evaluateRules(c: RuleContext, rules: RuleConfig[], now: Date): Finding[] {
  if (c.mergedIntoId || c.status === 'ARCHIVED') return [];
  const findings: Finding[] = [];
  const minutes = (date: Date) => (now.getTime() - date.getTime()) / 60_000;
  const waitingLegitimately = !!c.waitingReason && !!c.reviewAt && c.reviewAt > now;
  const latestActivity = c.lastMeaningfulActivityAt ?? c.assignedAt;
  for (const r of rules.filter((r) => r.enabled)) {
    const threshold = r.thresholdMinutes ?? 0;
    const add = (title: string, description: string, action: string, since: Date, fingerprint: string, options: Partial<Finding> = {}) => {
      const severity = r.warningMinutes !== null && minutes(since) < threshold ? 'YELLOW' : r.severity as Severity;
      findings.push({ ruleKey: r.key, severity, title, description, recommendedAction: action, category: 'SALES', assignedUserId: c.assignedToId, fingerprint, firstViolationAt: since, dueAt: new Date(since.getTime() + threshold * 60_000), actionPath: `/pipeline?leadId=${c.id}`, metadata: {}, ...options });
    };
    const elapsed = (since: Date) => minutes(since) >= (r.warningMinutes ?? threshold);
    if (r.key === 'LOST_REASON_MISSING' && c.status === 'LOST' && !c.lostReasonCode) add('Lost reason missing', 'This closed lead has no structured lost reason.', 'Choose why the patient did not proceed.', c.stageChangedAt, c.stageChangedAt.toISOString());
    if (r.key==='SUSPICIOUS_MOVEMENT' && c.status==='WON' && !c.bookingEvidence) add('Pipeline steps need review','This won lead has no booking or payment evidence.','Review the recorded exception and confirm the supporting information.',c.stageChangedAt,`won:${c.stageChangedAt.toISOString()}`,{assignedUserId:c.supervisorId ?? c.assignedToId});
    if (c.status !== 'ACTIVE') continue;
    switch (r.key) {
      case 'NEW_LEAD_NOT_CONTACTED':
        if (c.assignedToId && !c.firstContactAt && elapsed(c.assignedAt)) add('New patient still waiting', `No successful message or recorded outbound call since assignment (${Math.floor(minutes(c.assignedAt))} minutes).`, 'Contact the patient now.', c.assignedAt, c.assignedAt.toISOString());
        break;
      case 'PATIENT_WAITING_REPLY': {
        const wait = [...c.waiting].sort((a, b) => a.since.getTime() - b.since.getTime())[0];
        if (wait && elapsed(wait.since)) add('Patient waiting for your reply', `The patient wrote ${Math.floor(minutes(wait.since))} minutes ago. A successful reply is still missing.`, 'Read the message and reply now. If you need to check something, tell the patient.', wait.since, wait.messageId, { actionPath: `/inbox?c=${wait.conversationId}`, metadata: { conversationId: wait.conversationId } });
        break;
      }
      case 'OVERDUE_FOLLOW_UP': {
        const task = c.tasks.filter((t) => !t.completedAt && t.dueDate < now).sort((a,b) => a.dueDate.getTime() - b.dueDate.getTime())[0];
        if (task) add('Follow-up overdue', `Planned for ${task.dueDate.toISOString()}. The task is still open.`, 'Contact the patient and complete the task, or reschedule with a reason.', task.dueDate, `${task.id}:${task.dueDate.toISOString()}`, { assignedUserId: task.assignedToId ?? c.assignedToId, severity: minutes(task.dueDate) >= threshold ? 'RED' : 'ORANGE', metadata: { taskId: task.id } });
        break;
      }
      case 'NO_NEXT_ACTION':
        if (c.assignedToId && c.firstContactAt && !c.tasks.some((t) => !t.completedAt) && !c.upcomingAppointment && !waitingLegitimately && !['UNDER_REVIEW','READY_FOR_REVIEW'].includes(c.assessment?.status ?? '')) add('The next step is still missing', 'This active patient has no scheduled task, appointment, or timed waiting state.', 'Schedule a follow-up, request information, or set a waiting reason and review time.', latestActivity, `next:${latestActivity.toISOString()}`, { severity: 'YELLOW' });
        break;
      case 'STUCK_IN_STAGE': {
        const stageMinutes = (r.settings.stageMinutes as Record<string, number> | undefined)?.[c.stage] ?? threshold;
        if (!waitingLegitimately && minutes(c.stageChangedAt) >= stageMinutes && (!c.lastMeaningfulActivityAt || minutes(c.lastMeaningfulActivityAt) >= stageMinutes)) add('Patient has stayed in this stage', `Stage ${c.stage} has not progressed for ${Math.floor(minutes(c.stageChangedAt) / 60)} hours.`, 'Review the patient’s situation and plan the next step.', c.stageChangedAt, `${c.stage}:${c.stageChangedAt.toISOString()}`);
        break;
      }
      case 'QUOTE_FOLLOW_UP':
        if (c.quote?.sentAt && !waitingLegitimately && elapsed(c.quote.sentAt) && (!c.lastMeaningfulActivityAt || c.lastMeaningfulActivityAt <= c.quote.sentAt)) add('Treatment plan needs follow-up', 'The sent treatment plan has had no later contact.', 'Ask whether the patient reviewed the plan and has any questions.', c.quote.sentAt, c.quote.id);
        break;
      case 'INCOMPLETE_ASSESSMENT':
        if (c.assessment && c.assessment.status !== 'COMPLETED' && c.missingRequirements.length) add('Assessment information incomplete', `Still missing: ${c.missingRequirements.join(', ')}.`, 'Collect the missing information before requesting doctor review.', c.createdAt, `${c.assessment.id}:${c.missingRequirements.join('|')}`, { metadata: { missing: c.missingRequirements } });
        break;
      case 'DOCTOR_REVIEW_DELAY':
        if (c.assessment?.requestedAt && ['READY_FOR_REVIEW','UNDER_REVIEW'].includes(c.assessment.status) && !c.missingRequirements.length && elapsed(c.assessment.requestedAt)) add('Doctor review pending', 'The clinical review target has passed. This delay belongs to the clinical team.', 'Complete the clinical assessment or arrange a reviewer.', c.assessment.requestedAt, c.assessment.id, { category: 'CLINICAL', assignedUserId: c.assessment.reviewerId ?? c.supervisorId });
        break;
      case 'PRICE_WITHOUT_QUOTE':
        if (['OFFER_SENT', 'NEGOTIATION'].includes(c.stage) && Number(c.estimatedValue) > 0 && !c.quote) add('Formal treatment plan missing', 'A price is recorded, but no sent treatment plan version is saved.', 'Save and issue the formal treatment plan.', c.stageChangedAt, c.stageChangedAt.toISOString());
        break;
      case 'HOT_LEAD_NEGLECTED':
        if (c.temperature === 'HOT' && !waitingLegitimately && elapsed(latestActivity)) add('Hot patient needs attention', `No meaningful contact for ${Math.floor(minutes(latestActivity)/60)} hours.`, 'Follow up now about the patient’s booking decision.', latestActivity, latestActivity.toISOString());
        break;
      case 'ACTIVE_LEAD_INACTIVITY':
        if (c.temperature !== 'HOT' && c.firstContactAt && !waitingLegitimately && elapsed(latestActivity)) add('Active patient needs follow-up', 'The contact target has passed with no new interaction.', 'Review the conversation and contact the patient.', latestActivity, latestActivity.toISOString());
        break;
      case 'PATIENT_STOPPED_REPLYING':
        if (c.lastOutboundAt && (!c.lastInboundAt || c.lastOutboundAt > c.lastInboundAt) && !waitingLegitimately && elapsed(c.lastOutboundAt)) add('Patient reply pending', 'The patient has not replied to your last message.', 'Send a useful follow-up or record when you will check again.', c.lastOutboundAt, c.lastOutboundAt.toISOString());
        break;
      case 'PAYMENT_PROMISE_OVERDUE': {
        const promise = c.promises.find((p) => p.dueAt < now && p.paid < p.amount);
        if (promise) add('Promised payment needs follow-up', `${promise.amount} ${promise.currency} was expected by ${promise.dueAt.toISOString()}; matching recorded payments do not cover it yet.`, 'Check the payment record and contact the patient about the deposit.', promise.dueAt, promise.id, { assignedUserId: promise.responsibleUserId, category: 'PAYMENT' });
        break;
      }
      case 'DUPLICATE_LEAD':
        if (c.duplicateIds.length) add('Possible existing patient found', 'Another active lead has the same normalized phone, WhatsApp number, or email.', 'Review the existing lead; merge or record why these are separate enquiries.', c.createdAt, c.duplicateIds.sort().join('|'), { metadata: { leadIds: c.duplicateIds } });
        break;
      case 'SUSPICIOUS_MOVEMENT':
        if ((c.stage === 'TICKET' && !c.bookingEvidence) || (c.stage === 'OFFER_SENT' && c.assessment && c.missingRequirements.length)) add('Pipeline steps need review', 'The current stage is missing expected booking or assessment evidence.', 'Review the missing information before continuing.', c.stageChangedAt, `${c.stage}:${c.stageChangedAt.toISOString()}`);
        break;
      case 'REPEATED_NEGLIGENCE':
        if (c.repeatedReplyMisses >= Number(r.settings.count ?? 3)) add('Response target needs attention', `Your team member has ${c.repeatedReplyMisses} late reply cycles this week.`, 'Check waiting replies first when opening My Day. Your supervisor can help plan coverage.', now, `week:${Math.floor(now.getTime() / 604800000)}`, { assignedUserId: c.supervisorId ?? c.assignedToId });
        break;
      case 'REPEATED_RESCHEDULE': {
        const task = c.tasks.find((t) => !t.completedAt && t.rescheduleCount >= Number(r.settings.count ?? 3));
        if (task) add('Follow-up has been rescheduled repeatedly', `This task was moved ${task.rescheduleCount} times.`, 'Review the follow-up plan with your supervisor.', task.dueDate, task.id, { assignedUserId: c.supervisorId ?? c.assignedToId, metadata: { taskId: task.id } });
        break;
      }
    }
  }
  return findings;
}
