import { Test } from '@nestjs/testing';
import { INestApplication,ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule,JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import request = require('supertest');
import { randomUUID } from 'crypto';
import { Role,JwtPayload } from '@dental-crm/shared';
import { PrismaService } from '../src/prisma/prisma.service';
import { CoachingService } from '../src/coaching/coaching.service';
import { CoachingController } from '../src/coaching/coaching.controller';
import { CoachingViewsService } from '../src/coaching/views.service';
import { CoachingWorkflowService } from '../src/coaching/workflow.service';
import { ConversationsService } from '../src/conversations/conversations.service';
import { JwtStrategy } from '../src/auth/strategies/jwt.strategy';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { RolesGuard } from '../src/common/guards/roles.guard';
import { OUTBOUND_SENDER } from '../src/conversations/outbound-sender';
const testDB = process.env.COACHING_TEST_DB==='1' ? describe : describe.skip;
testDB('Sales supervision acceptance with real database, API authentication and fake WhatsApp transport',()=>{
  let app:INestApplication;
  let prisma:PrismaService;
  let service:CoachingService;
  let workflow:CoachingWorkflowService;
  let conversations:ConversationsService;
  let jwt:JwtService;
  let sales:JwtPayload;let supervisor:JwtPayload;let outsider:JwtPayload;let doctor:JwtPayload;
  let leadId:string;let conversationId:string;
  const at=(minutes:number)=>new Date(Date.now()-minutes*60_000);
  const sender={ sendText:jest.fn().mockResolvedValue('web') };
  const token=(user:JwtPayload)=>jwt.sign(user);
  beforeAll(async()=>{
    prisma=new PrismaService();await prisma.$connect();
    const fixture=await Test.createTestingModule({ imports:[PassportModule,JwtModule.register({ secret:'isolated-coaching-test-secret-123456789' })],controllers:[CoachingController],providers:[
      { provide:PrismaService,useValue:prisma },CoachingService,CoachingWorkflowService,CoachingViewsService,ConversationsService,
      { provide:OUTBOUND_SENDER,useValue:sender },
      { provide:ConfigService,useValue:{ get:(key:string)=>key==='jwt.accessSecret'?'isolated-coaching-test-secret-123456789':undefined } },
      JwtStrategy,{ provide:APP_GUARD,useClass:JwtAuthGuard },{ provide:APP_GUARD,useClass:RolesGuard },
    ] }).compile();
    app=fixture.createNestApplication();app.useGlobalPipes(new ValidationPipe({ whitelist:true,transform:true }));app.setGlobalPrefix('api');await app.init();
    service=app.get(CoachingService);workflow=app.get(CoachingWorkflowService);conversations=app.get(ConversationsService);jwt=app.get(JwtService);
    const actors=await Promise.all(['sales','supervisor','outsider','doctor'].map((name)=>prisma.user.create({ data:{ email:`${name}@acceptance.test`,passwordHash:'not-used',firstName:name,lastName:'Test',role:name==='supervisor'?'SUPER_ADMIN':name==='doctor'?'DENTIST':'SALES_CONSULTANT' } })));
    [sales,supervisor,outsider,doctor]=actors.map((u)=>({ sub:u.id,email:u.email,role:u.role as Role }));
    await prisma.clinicSettings.create({ data:{ clinicName:'Isolated test clinic' } });
    const lead=await prisma.lead.create({ data:{ firstName:'Synthetic',lastName:'Patient',source:'WEBSITE',phone:'905551234567',assignedToId:sales.sub,supervisorId:supervisor.sub,assignedAt:at(6),createdAt:at(6),stageChangedAt:at(6) } });leadId=lead.id;
    const conversation=await conversations.startConversation({ leadId },sales.sub);conversationId=conversation.id;
  },30000);
  afterAll(async()=>{if(app) await app.close();if(prisma)await prisma.$disconnect();});
  it('detects first contact, creates exactly one issue, and shows it in My Day',async()=>{
    await service.drain();await service.evaluateLead(leadId);
    const issues=await prisma.coachingIssue.findMany({ where:{ leadId,ruleKey:'NEW_LEAD_NOT_CONTACTED',status:'OPEN' } });expect(issues).toHaveLength(1);
    const response=await request(app.getHttpServer()).get('/api/coaching/my-day').set('Authorization',`Bearer ${token(sales)}`).expect(200);
    expect(response.body.issues.some((i:any)=>i.ruleKey==='NEW_LEAD_NOT_CONTACTED')).toBe(true);
    expect(await prisma.coachingDirty.count({ where:{ leadId } })).toBe(0);
  });
  it('successful WhatsApp dispatch automatically clears first-contact warning',async()=>{
    const message=await conversations.sendMessage(conversationId,{ content:'Welcome. How can we help?' },sales.sub);expect(message.status).toBe('SENT');expect(sender.sendText).toHaveBeenCalled();
    await service.evaluateLead(leadId);
    const issue=await prisma.coachingIssue.findFirstOrThrow({ where:{ leadId,ruleKey:'NEW_LEAD_NOT_CONTACTED' } });expect(issue.status).toBe('RESOLVED');expect(issue.autoResolved).toBe(true);
    expect((await prisma.contactEvidence.findUniqueOrThrow({ where:{ leadId } })).firstContactAt).toBeTruthy();
  });
  it('detects waiting reply, excludes failed sends and does not reset clock after another inbound',async()=>{
    const now=new Date();
    await prisma.lead.update({ where:{id:leadId},data:{assignedAt:at(20)} });
    await prisma.message.updateMany({ where:{ conversationId,direction:'OUTBOUND' },data:{ createdAt:at(15),sentAt:at(15) } });
    await prisma.message.create({ data:{ conversationId,direction:'INBOUND',content:'Can I come on the 18th?',createdAt:new Date(now.getTime()-11*60000),status:'DELIVERED' } });
    await prisma.message.create({ data:{ conversationId,direction:'INBOUND',content:'Please confirm',createdAt:at(1),status:'DELIVERED' } });
    await prisma.message.create({ data:{ conversationId,direction:'OUTBOUND',content:'Failed reply',status:'FAILED',createdAt:at(0.5),senderUserId:sales.sub } });
    await service.evaluateLead(leadId,now);
    const issue=await prisma.coachingIssue.findFirstOrThrow({ where:{ leadId,ruleKey:'PATIENT_WAITING_REPLY',status:'OPEN' } });expect(issue.description).toContain('11 minutes');
    await service.evaluateLead(leadId,new Date(now.getTime()+31*60_000));
    const escalated=await prisma.coachingIssue.findUniqueOrThrow({ where:{ id:issue.id } });expect(escalated.status).toBe('ESCALATED');
    await service.evaluateLead(leadId,new Date(now.getTime()+32*60_000));
    expect(await prisma.coachingIssue.count({ where:{ leadId,ruleKey:'PATIENT_WAITING_REPLY' } })).toBe(1);
    expect(await prisma.coachingIssueEvent.count({ where:{ issueId:issue.id,kind:'ESCALATED' } })).toBe(1);
    expect(await prisma.notification.count({ where:{ userId:supervisor.sub,relatedEntityId:issue.id } })).toBe(1);
  });
  it('acknowledging never resolves; instruction reaches salesperson and completion reaches supervisor',async()=>{
    const issue=await prisma.coachingIssue.findFirstOrThrow({ where:{ leadId,ruleKey:'PATIENT_WAITING_REPLY',status:'ESCALATED' } });
    await request(app.getHttpServer()).post(`/api/coaching/issues/${issue.id}/acknowledge`).set('Authorization',`Bearer ${token(sales)}`).expect(201);
    expect((await prisma.coachingIssue.findUniqueOrThrow({ where:{ id:issue.id } })).status).toBe('ESCALATED');
    const response=await request(app.getHttpServer()).post('/api/coaching/instructions').set('Authorization',`Bearer ${token(supervisor)}`).send({ leadId,message:'Confirm the travel date today.',priority:'RED' }).expect(201);
    const day=await request(app.getHttpServer()).get('/api/coaching/my-day').set('Authorization',`Bearer ${token(sales)}`).expect(200);expect(day.body.instructions).toHaveLength(1);
    await request(app.getHttpServer()).post(`/api/coaching/instructions/${response.body.id}/complete`).set('Authorization',`Bearer ${token(sales)}`).expect(201);
    expect((await prisma.supervisorInstruction.findUniqueOrThrow({ where:{ id:response.body.id } })).status).toBe('COMPLETED');
  });
  it('successful reply auto-resolves and next-action issue clears after task scheduling',async()=>{
    await conversations.sendMessage(conversationId,{ content:'Yes, I am checking availability for the 18th.' },sales.sub);await service.evaluateLead(leadId);
    expect((await prisma.coachingIssue.findFirstOrThrow({ where:{ leadId,ruleKey:'PATIENT_WAITING_REPLY' } })).status).toBe('RESOLVED');
    expect(await prisma.coachingIssue.count({ where:{ leadId,ruleKey:'NO_NEXT_ACTION',status:'OPEN' } })).toBe(1);
    await prisma.leadTask.create({ data:{ leadId,title:'Confirm availability',dueDate:new Date(Date.now()+3600000),assignedToId:sales.sub,createdById:sales.sub } });await service.evaluateLead(leadId);
    expect(await prisma.coachingIssue.count({ where:{ leadId,ruleKey:'NO_NEXT_ACTION',status:'OPEN' } })).toBe(0);
  });
  it('overdue task auto-resolves on completion; repeated reschedules persist and are audited',async()=>{
    const task=await prisma.leadTask.create({ data:{ leadId,title:'Overdue follow-up',dueDate:at(61),assignedToId:sales.sub,createdById:sales.sub } });await service.evaluateLead(leadId);
    expect(await prisma.coachingIssue.count({ where:{ leadId,ruleKey:'OVERDUE_FOLLOW_UP',status:'OPEN' } })).toBe(1);
    for(let n=1;n<=3;n++) await prisma.leadTask.update({ where:{ id:task.id },data:{ dueDate:new Date(Date.now()+n*60000),rescheduleReason:`Patient requested change ${n}` } });
    expect((await prisma.leadTask.findUniqueOrThrow({ where:{ id:task.id } })).rescheduleCount).toBe(3);await service.evaluateLead(leadId);
    expect(await prisma.coachingIssue.count({ where:{ leadId,ruleKey:'REPEATED_RESCHEDULE',status:'OPEN' } })).toBe(1);
    await prisma.leadTask.update({ where:{ id:task.id },data:{ completedAt:new Date() } });await service.evaluateLead(leadId);
    expect(await prisma.coachingIssue.count({ where:{ leadId,ruleKey:'OVERDUE_FOLLOW_UP',status:'OPEN' } })).toBe(0);
    expect(await prisma.leadActivity.count({ where:{ leadId,note:{ startsWith:'Follow-up rescheduled:' } } })).toBe(3);
  });
  it('clinical checklist blocks incomplete requests, assigns delay to doctor, and protects final notes',async()=>{
    await workflow.checklist(leadId,{ category:'DENTAL',checklist:{ SMILE:true } },sales);
    await expect(workflow.requestAssessment(leadId,doctor.sub,sales)).rejects.toThrow('Still missing');
    await workflow.checklist(leadId,{ category:'DENTAL',checklist:{ SMILE:true,UPPER:true,LOWER:true,HISTORY:true,MEDICATION:true } },sales);
    await workflow.requestAssessment(leadId,doctor.sub,sales);await prisma.clinicalAssessment.update({ where:{ leadId },data:{ requestedAt:at(241) } });await service.evaluateLead(leadId);
    const issue=await prisma.coachingIssue.findFirstOrThrow({ where:{ leadId,ruleKey:'DOCTOR_REVIEW_DELAY',status:'OPEN' } });expect(issue.assignedUserId).toBe(doctor.sub);
    await expect(workflow.completeAssessment(leadId,'Final notes',sales)).rejects.toThrow('Clinical review permission');
    await workflow.completeAssessment(leadId,'Synthetic assessment completed.',doctor);await service.evaluateLead(leadId);
    expect((await prisma.coachingIssue.findUniqueOrThrow({ where:{ id:issue.id } })).status).toBe('RESOLVED');
    await expect(workflow.checklist(leadId,{ category:'DENTAL',checklist:{} },sales)).rejects.toThrow('cannot be overwritten');
  });
  it('permissions enforce own leads and prevent employee dismissal/rule changes',async()=>{
    await request(app.getHttpServer()).get('/api/coaching/issues').expect(401);
    const list=await request(app.getHttpServer()).get(`/api/coaching/issues?leadId=${leadId}`).set('Authorization',`Bearer ${token(outsider)}`).expect(200);expect(list.body.total).toBe(0);
    await request(app.getHttpServer()).get(`/api/coaching/leads/${leadId}`).set('Authorization',`Bearer ${token(outsider)}`).expect(404);
    const issue=await prisma.coachingIssue.findFirst({ where:{ leadId,status:'OPEN' } });
    if(issue) await request(app.getHttpServer()).post(`/api/coaching/issues/${issue.id}/dismiss`).set('Authorization',`Bearer ${token(sales)}`).send({ note:'Already handled' }).expect(403);
    const rule=await prisma.salesRule.findFirstOrThrow();await request(app.getHttpServer()).patch(`/api/coaching/sales-rules/${rule.id}`).set('Authorization',`Bearer ${token(sales)}`).send({ thresholdMinutes:15 }).expect(403);
  });
  it('sent quote snapshots keep prior prices and create one follow-up per version',async()=>{
    const patient=await prisma.patient.create({data:{firstName:'Synthetic',lastName:'Patient',convertedFromLeadId:leadId}});
    const plan=await prisma.treatmentPlan.create({data:{patientId:patient.id,createdById:sales.sub,title:'Synthetic dental plan',totalCost:3500,currency:'EUR',items:{create:{description:'Crowns',quantity:24,cost:3500}}}});
    const first=await workflow.issueQuote(leadId,plan.id,'Initial offer shared',sales);
    await prisma.treatmentPlan.update({where:{id:plan.id},data:{totalCost:3000}});
    await expect(workflow.issueQuote(leadId,plan.id,'Reduced offer',sales)).rejects.toThrow('discount approval');
    const second=await workflow.issueQuote(leadId,plan.id,'Approved revision shared',supervisor);
    expect(second.version).toBe(2);
    expect(Number((await prisma.quoteVersion.findUniqueOrThrow({where:{id:first.id}})).total)).toBe(3500);
    await service.evaluateLead(leadId);await service.evaluateLead(leadId);
    expect(await prisma.leadTask.count({where:{quoteVersionId:second.id}})).toBe(1);
  });
  it('payment promises resolve only from matching recorded payments and retain payment timeline',async()=>{
    const promise=await workflow.paymentPromise(leadId,{dueAt:at(1).toISOString(),amount:300,currency:'EUR'},sales);
    await service.evaluateLead(leadId);
    const issue=await prisma.coachingIssue.findFirstOrThrow({where:{leadId,ruleKey:'PAYMENT_PROMISE_OVERDUE',status:'OPEN'}});
    const patient=await prisma.patient.findUniqueOrThrow({where:{convertedFromLeadId:leadId}});
    const invoice=await prisma.invoice.create({data:{invoiceNumber:'ACCEPTANCE-1',patientId:patient.id,createdById:supervisor.sub,total:300,currency:'EUR',subtotal:300}});
    await prisma.payment.create({data:{invoiceId:invoice.id,amount:300,currency:'USD',method:'CASH',status:'COMPLETED',paidAt:new Date(),createdById:supervisor.sub}});
    await service.evaluateLead(leadId);expect((await prisma.coachingIssue.findUniqueOrThrow({where:{id:issue.id}})).status).toBe('OPEN');
    await prisma.payment.create({data:{invoiceId:invoice.id,amount:300,currency:'EUR',method:'CASH',status:'COMPLETED',paidAt:new Date(),createdById:supervisor.sub}});
    await service.evaluateLead(leadId);expect((await prisma.coachingIssue.findUniqueOrThrow({where:{id:issue.id}})).status).toBe('RESOLVED');
    expect((await prisma.paymentPromise.findUniqueOrThrow({where:{id:promise.id}})).status).toBe('FULFILLED');
    expect(await prisma.leadActivity.count({where:{leadId,note:{startsWith:'Payment record:'}}})).toBe(2);
  });
  it('SLA observations preserve targets when settings change',async()=>{
    const observed=await prisma.responseObservation.findFirstOrThrow({where:{leadId}});
    const rule=await prisma.salesRule.findUniqueOrThrow({where:{clinicId_key:{clinicId:'singleton',key:'PATIENT_WAITING_REPLY'}}});
    await service.updateRule(rule.id,{thresholdMinutes:25},supervisor);await service.evaluateLead(leadId);
    expect((await prisma.responseObservation.findUniqueOrThrow({where:{id:observed.id}})).slaSeconds).toBe(600);
  });
  it('timeline and reports retain resolved issues and SLA history',async()=>{
    const timeline=await prisma.leadActivity.findMany({ where:{ leadId } });expect(timeline.some((e)=>e.note?.includes('Automatically resolved'))).toBe(true);expect(timeline.some((e)=>e.note?.includes('Escalated'))).toBe(true);expect(timeline.some((e)=>e.note?.includes('Supervisor instruction'))).toBe(true);
    const report=await request(app.getHttpServer()).get('/api/coaching/reports').set('Authorization',`Bearer ${token(supervisor)}`).expect(200);
    expect(report.body.sampleSizes.inboundMessages).toBe(2);expect(report.body.averageReplySeconds).toBeGreaterThan(0);expect(report.body.issuesByRule.some((r:any)=>r.key==='PATIENT_WAITING_REPLY')).toBe(true);
  });
});
