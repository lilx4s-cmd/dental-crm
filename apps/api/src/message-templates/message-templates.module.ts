import { Module } from '@nestjs/common';
import { MessageTemplatesService } from './message-templates.service';
import { MessageTemplatesController } from './message-templates.controller';
import { TagsModule } from '../tags/tags.module';

@Module({
  // For TagsService.currentOrganizationId — the one place that resolves which clinic a row is for.
  imports: [TagsModule],
  controllers: [MessageTemplatesController],
  providers: [MessageTemplatesService],
  exports: [MessageTemplatesService],
})
export class MessageTemplatesModule {}
