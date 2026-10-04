import { Module } from '@nestjs/common';
import { CoachingController } from './coaching.controller';
import { CoachingService } from './coaching.service';
import { CoachingWorkflowService } from './workflow.service';
import { CoachingViewsService } from './views.service';
@Module({ controllers:[CoachingController],providers:[CoachingService,CoachingWorkflowService,CoachingViewsService],exports:[CoachingService] })
export class CoachingModule {}
