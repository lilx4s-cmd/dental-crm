import { Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';
import { LeadsModule } from '../leads/leads.module';

@Module({
  // The assistant answers from the pipeline, and reuses LeadsService so its access scoping is the
  // same code the screens rely on rather than a second implementation.
  imports: [LeadsModule],
  controllers: [AiController],
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}
