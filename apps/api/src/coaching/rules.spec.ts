import { DEFAULT_RULES, evaluateRules, issuePriority, RuleContext } from './rules';
const now=new Date('2026-10-04T12:00:00Z');
const ago=(minutes:number)=>new Date(now.getTime()-minutes*60000);
const context=(over:Partial<RuleContext>={}):RuleContext=>({ id:'l1',status:'ACTIVE',stage:'CONTACTED',mergedIntoId:null,assignedToId:'sales',supervisorId:'manager',createdAt:ago(60),assignedAt:ago(60),stageChangedAt:ago(60),temperature:'WARM',waitingReason:null,reviewAt:null,lostReasonCode:null,estimatedValue:null,firstContactAt:ago(30),lastMeaningfulActivityAt:ago(30),lastInboundAt:ago(30),lastOutboundAt:ago(31),waiting:[],tasks:[],upcomingAppointment:false,quote:null,missingRequirements:[],assessment:null,promises:[],duplicateIds:[],bookingEvidence:false,repeatedReplyMisses:0,...over });
const finding=(key:string,over:Partial<RuleContext>)=>evaluateRules(context(over),DEFAULT_RULES,now).find((f)=>f.ruleKey===key);
describe('deterministic coaching rules',()=>{
  it('new lead breaches at five minutes and clears on contact',()=>{
    expect(finding('NEW_LEAD_NOT_CONTACTED',{ firstContactAt:null,assignedAt:ago(4) })).toBeUndefined();
    expect(finding('NEW_LEAD_NOT_CONTACTED',{ firstContactAt:null,assignedAt:ago(6) })?.severity).toBe('RED');
    expect(finding('NEW_LEAD_NOT_CONTACTED',{ firstContactAt:ago(1) })).toBeUndefined();
  });
  it('reply SLA preserves the earliest unanswered message and clears after reply',()=>{
    const waiting=[{ conversationId:'c1',messageId:'m1',since:ago(11) }];
    expect(finding('PATIENT_WAITING_REPLY',{ waiting })?.fingerprint).toBe('m1');
    expect(finding('PATIENT_WAITING_REPLY',{ waiting:[] })).toBeUndefined();
    expect(finding('PATIENT_WAITING_REPLY',{ waiting:[{ ...waiting[0],since:ago(3) }] })).toBeUndefined();
  });
  it('overdue tasks escalate after sixty minutes and clear when completed',()=>{
    const task={ id:'t',dueDate:ago(61),completedAt:null,rescheduleCount:0,assignedToId:'other' };
    expect(finding('OVERDUE_FOLLOW_UP',{ tasks:[task] })).toMatchObject({ severity:'RED',assignedUserId:'other' });
    expect(finding('OVERDUE_FOLLOW_UP',{ tasks:[{ ...task,completedAt:now }] })).toBeUndefined();
  });
  it('next action clears with task, appointment, or legitimate timed waiting',()=>{
    expect(finding('NO_NEXT_ACTION',{})).toBeDefined();
    expect(finding('NO_NEXT_ACTION',{ upcomingAppointment:true })).toBeUndefined();
    expect(finding('NO_NEXT_ACTION',{ waitingReason:'PATIENT',reviewAt:new Date(now.getTime()+60000) })).toBeUndefined();
    expect(finding('NO_NEXT_ACTION',{ waitingReason:'PATIENT',reviewAt:ago(1) })).toBeDefined();
  });
  it('stage aging uses per-stage limits and recent actual activity',()=>{
    expect(finding('STUCK_IN_STAGE',{ stage:'OFFER_SENT',stageChangedAt:ago(3000),lastMeaningfulActivityAt:ago(3000) })).toBeDefined();
    expect(finding('STUCK_IN_STAGE',{ stage:'OFFER_SENT',stageChangedAt:ago(3000),lastMeaningfulActivityAt:ago(3) })).toBeUndefined();
  });
  it('quote follow-up clears after meaningful contact',()=>{
    const quote={ id:'q',sentAt:ago(3000) };
    expect(finding('QUOTE_FOLLOW_UP',{ quote,lastMeaningfulActivityAt:ago(3001) })).toBeDefined();
    expect(finding('QUOTE_FOLLOW_UP',{ quote,lastMeaningfulActivityAt:ago(1) })).toBeUndefined();
  });
  it('missing medical information clears when requirements are satisfied',()=>{
    const assessment={ id:'a',status:'COLLECTING_INFORMATION',requestedAt:null,reviewerId:null };
    expect(finding('INCOMPLETE_ASSESSMENT',{ assessment,missingRequirements:['Upper photo'] })?.description).toContain('Upper photo');
    expect(finding('INCOMPLETE_ASSESSMENT',{ assessment,missingRequirements:[] })).toBeUndefined();
  });
  it('doctor delay belongs to clinical reviewer and clears on completion',()=>{
    const assessment={ id:'a',status:'UNDER_REVIEW',requestedAt:ago(241),reviewerId:'doctor' };
    expect(finding('DOCTOR_REVIEW_DELAY',{ assessment })).toMatchObject({ assignedUserId:'doctor',category:'CLINICAL' });
    expect(finding('DOCTOR_REVIEW_DELAY',{ assessment:{ ...assessment,status:'COMPLETED' } })).toBeUndefined();
  });
  it('requires a formal quote in offer stages',()=>{
    expect(finding('PRICE_WITHOUT_QUOTE',{ stage:'OFFER_SENT',estimatedValue:3500 })).toBeDefined();
    expect(finding('PRICE_WITHOUT_QUOTE',{ stage:'OFFER_SENT',estimatedValue:3500,quote:{ id:'q',sentAt:now } })).toBeUndefined();
  });
  it('flags missing lost reasons',()=>{
    expect(finding('LOST_REASON_MISSING',{ status:'LOST' })).toBeDefined();
    expect(finding('LOST_REASON_MISSING',{ status:'LOST',lostReasonCode:'PRICE' })).toBeUndefined();
  });
  it('hot lead and normal activity thresholds differ',()=>{
    expect(finding('HOT_LEAD_NEGLECTED',{ temperature:'HOT',lastMeaningfulActivityAt:ago(721) })?.severity).toBe('RED');
    expect(finding('ACTIVE_LEAD_INACTIVITY',{ temperature:'WARM',lastMeaningfulActivityAt:ago(721) })).toBeUndefined();
    expect(finding('ACTIVE_LEAD_INACTIVITY',{ lastMeaningfulActivityAt:ago(1441) })).toBeDefined();
  });
  it('only unpaid promised amounts create payment warnings',()=>{
    const promise={ id:'p',dueAt:ago(1),amount:300,currency:'EUR',responsibleUserId:'finance',paid:0 };
    expect(finding('PAYMENT_PROMISE_OVERDUE',{ promises:[promise] })?.assignedUserId).toBe('finance');
    expect(finding('PAYMENT_PROMISE_OVERDUE',{ promises:[{ ...promise,paid:300 }] })).toBeUndefined();
  });
  it('shows probable duplicates without merging automatically',()=>{
    expect(finding('DUPLICATE_LEAD',{ duplicateIds:['other'] })).toBeDefined();
    expect(finding('DUPLICATE_LEAD',{ duplicateIds:[] })).toBeUndefined();
  });
  it('flags suspicious booking and clears with evidence',()=>{
    expect(finding('SUSPICIOUS_MOVEMENT',{ stage:'TICKET' })).toBeDefined();
    expect(finding('SUSPICIOUS_MOVEMENT',{ stage:'TICKET',bookingEvidence:true })).toBeUndefined();
  });
  it('tracks repeated reply misses and reschedules for supervisor',()=>{
    expect(finding('REPEATED_NEGLIGENCE',{ repeatedReplyMisses:3 })?.assignedUserId).toBe('manager');
    expect(finding('REPEATED_RESCHEDULE',{ tasks:[{ id:'t',dueDate:now,completedAt:null,rescheduleCount:3,assignedToId:'sales' }] })?.assignedUserId).toBe('manager');
  });
  it('patient silence creates constructive follow-up',()=>{
    expect(finding('PATIENT_STOPPED_REPLYING',{ lastOutboundAt:ago(1441),lastInboundAt:ago(1500) })).toBeDefined();
  });
  it('disabled rules and archived/merged leads do not produce warnings',()=>{
    expect(evaluateRules(context(),DEFAULT_RULES.map((r)=>({ ...r,enabled:false })),now)).toEqual([]);
    expect(evaluateRules(context({ status:'ARCHIVED' }),DEFAULT_RULES,now)).toEqual([]);
    expect(evaluateRules(context({ mergedIntoId:'other' }),DEFAULT_RULES,now)).toEqual([]);
  });
  it('waiting patient takes priority over stale cold follow-up',()=>{
    const base={ severity:'RED',detectedAt:ago(2880) };
    expect(issuePriority({ ...base,ruleKey:'PATIENT_WAITING_REPLY',detectedAt:ago(11) },now)).toBeGreaterThan(issuePriority({ ...base,ruleKey:'HOT_LEAD_NEGLECTED' },now));
  });
});
