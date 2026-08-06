import { Module } from '@nestjs/common';
import { LeadsService } from './leads.service';
import { LeadsController } from './leads.controller';
import { TagsModule } from '../tags/tags.module';

@Module({
  // For TagsService.currentOrganizationId — tagging a deal has to know which clinic it belongs to.
  imports: [TagsModule],
  controllers: [LeadsController],
  providers: [LeadsService],
  exports: [LeadsService],
})
export class LeadsModule {}
