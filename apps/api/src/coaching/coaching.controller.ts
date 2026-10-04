import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsIn, IsInt, IsNumber, IsObject, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength, Matches } from 'class-validator';
import { JwtPayload, LeadSource, PipelineStage } from '@dental-crm/shared';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CoachingService } from './coaching.service';
import { CoachingWorkflowService } from './workflow.service';
import { CoachingViewsService } from './views.service';
import { Permission } from '../common/decorators/permission.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ALL_STAFF } from '../common/access-policy';
class IssueQuery {
  @IsOptional() @IsUUID() leadId?:string;
  @IsOptional() @IsUUID() employeeId?:string;
  @IsOptional() @IsIn(['RED','ORANGE','YELLOW']) severity?:string;
  @IsOptional() @IsString() @MaxLength(100) ruleKey?:string;
  @IsOptional() @IsString() @MaxLength(100) country?:string;
  @IsOptional() @IsIn(Object.values(LeadSource)) source?:string;
  @IsOptional() @IsIn(Object.values(PipelineStage)) stage?:string;
  @IsOptional() @IsDateString() from?:string;
  @IsOptional() @IsDateString() to?:string;
  @IsOptional() @IsIn(['OPEN','ACKNOWLEDGED','ESCALATED','RESOLVED','DISMISSED']) status?:string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100000) page?:number;
}
class ReasonDto { @IsString() @MinLength(3) @MaxLength(2000) note!:string; }
class InstructionDto { @IsUUID() leadId!:string; @IsString() @MinLength(3) @MaxLength(2000) message!:string; @IsIn(['RED','ORANGE','YELLOW']) priority!:string; }
class RuleDto {
  @IsOptional() @IsBoolean() enabled?:boolean;
  @IsOptional() @IsInt() @Min(0) @Max(525600) thresholdMinutes?:number;
  @IsOptional() @IsInt() @Min(0) @Max(525600) warningMinutes?:number|null;
  @IsOptional() @IsInt() @Min(0) @Max(10080) escalationMinutes?:number;
  @IsOptional() @IsIn(['RED','ORANGE','YELLOW']) severity?:string;
  @IsOptional() @IsObject() settings?:Record<string,unknown>;
}
class WaitingDto {
  @IsIn([null,'PATIENT','DOCTOR','XRAY','PAYMENT','TRAVEL_DATE','DECISION']) reason!:string|null;
  @IsOptional() @IsDateString() reviewAt?:string;
  @IsOptional() @IsIn(['HOT','WARM','COLD']) temperature?:string;
}
class ChecklistDto { @IsString() @MinLength(2) @MaxLength(50) category!:string; @IsObject() checklist!:Record<string,boolean>; }
class ReviewerDto { @IsUUID() reviewerId!:string; }
class QuoteDto { @IsUUID() planId!:string; @IsString() @MinLength(3) @MaxLength(1000) reason!:string; }
class PromiseDto { @IsDateString() dueAt!:string; @IsNumber() @Min(0.01) @Max(10000000) amount!:number; @Matches(/^[A-Z]{3}$/) currency!:string; @IsOptional() @IsUUID() responsibleUserId?:string; }
class ReassignDto extends ReasonDto { @IsUUID() assigneeId!:string; }
class RequirementDto { @Matches(/^[A-Z_]{2,50}$/) category!:string; @Matches(/^[A-Z_]{2,50}$/) key!:string; @IsString() @MinLength(3) @MaxLength(200) label!:string; @IsBoolean() required!:boolean; }
@Controller('coaching')
@Roles(...ALL_STAFF)
export class CoachingController {
  constructor(private readonly service:CoachingService,private readonly workflow:CoachingWorkflowService,private readonly views:CoachingViewsService) {}
  @Get('issues') list(@Query() q:IssueQuery,@CurrentUser() u:JwtPayload) { return this.service.list(u,q); }
  @Post('issues/:id/acknowledge') acknowledge(@Param('id') id:string,@CurrentUser() u:JwtPayload) { return this.service.issueAction(id,'acknowledge',undefined,u); }
  @Post('issues/:id/dismiss') dismiss(@Param('id') id:string,@Body() d:ReasonDto,@CurrentUser() u:JwtPayload) { return this.service.issueAction(id,'dismiss',d.note,u); }
  @Post('issues/:id/resolve') resolve(@Param('id') id:string,@Body() d:ReasonDto,@CurrentUser() u:JwtPayload) { return this.service.issueAction(id,'resolve',d.note,u); }
  @Post('issues/:id/escalate') escalate(@Param('id') id:string,@Body() d:ReasonDto,@CurrentUser() u:JwtPayload) { return this.service.issueAction(id,'escalate',d.note,u); }
  @Post('issues/:id/remind') remind(@Param('id') id:string,@Body() d:ReasonDto,@CurrentUser() u:JwtPayload) { return this.service.issueAction(id,'remind',d.note,u); }
  @Get('my-day') myDay(@CurrentUser() u:JwtPayload) { return this.views.myDay(u); }
  @Get('leads/:id') coach(@Param('id') id:string,@CurrentUser() u:JwtPayload) { return this.views.leadCoach(id,u); }
  @Get('summary') summary(@CurrentUser() u:JwtPayload) { return this.views.summary(u); }
  @Get('reports') reports(@Query() q:IssueQuery,@CurrentUser() u:JwtPayload) { return this.views.reports(u,q); }
  @Get('sales-rules') rules(@CurrentUser() u:JwtPayload) { return this.service.rules(u); }
  @Patch('sales-rules/:id') updateRule(@Param('id') id:string,@Body() d:RuleDto,@CurrentUser() u:JwtPayload) { return this.service.updateRule(id,d,u); }
  @Post('requirements') requirement(@Body() d:RequirementDto,@CurrentUser() u:JwtPayload) { return this.workflow.requirement(d,u); }
  @Get('requirements') requirements(@CurrentUser() u:JwtPayload) { return this.views.requirements(u); }
  @Post('instructions') instruction(@Body() d:InstructionDto,@CurrentUser() u:JwtPayload) { return this.workflow.instruction(d.leadId,d.message,d.priority,u); }
  @Post('instructions/:id/complete') complete(@Param('id') id:string,@CurrentUser() u:JwtPayload) { return this.workflow.completeInstruction(id,u); }
  @Post('leads/:id/reassign') reassign(@Param('id') id:string,@Body() d:ReassignDto,@CurrentUser() u:JwtPayload) { return this.workflow.reassign(id,d.assigneeId,d.note,u); }
  @Patch('leads/:id/waiting') waiting(@Param('id') id:string,@Body() d:WaitingDto,@CurrentUser() u:JwtPayload) { return this.workflow.waiting(id,d,u); }
  @Get('leads/:id/assessment') assessment(@Param('id') id:string,@CurrentUser() u:JwtPayload) { return this.workflow.assessment(id,u); }
  @Patch('leads/:id/assessment') checklist(@Param('id') id:string,@Body() d:ChecklistDto,@CurrentUser() u:JwtPayload) { return this.workflow.checklist(id,d,u); }
  @Post('leads/:id/assessment/request') request(@Param('id') id:string,@Body() d:ReviewerDto,@CurrentUser() u:JwtPayload) { return this.workflow.requestAssessment(id,d.reviewerId,u); }
  @Post('leads/:id/assessment/complete') clinicalComplete(@Param('id') id:string,@Body() d:ReasonDto,@CurrentUser() u:JwtPayload) { return this.workflow.completeAssessment(id,d.note,u); }
  @Post('leads/:id/quotes') quote(@Param('id') id:string,@Body() d:QuoteDto,@CurrentUser() u:JwtPayload) { return this.workflow.issueQuote(id,d.planId,d.reason,u); }
  @Post('leads/:id/payment-promises') promise(@Param('id') id:string,@Body() d:PromiseDto,@CurrentUser() u:JwtPayload) { return this.workflow.paymentPromise(id,d,u); }
  @Post('notifications/:id/read') readNotification(@Param('id') id:string,@CurrentUser() u:JwtPayload) { return this.views.readNotification(id,u); }
}
