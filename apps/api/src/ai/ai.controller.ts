import { Body, Controller, Param, Post } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { PLAN_STAFF_ROLES, PLAN_COORDINATION_ROLES } from '../treatment-plans/treatment-plans.controller';
import { AiService } from './ai.service';
import { GenerateSummaryDto } from './dto/generate-summary.dto';
import { SuggestItemsDto } from './dto/suggest-items.dto';
import { DraftWhatsAppMessageDto } from './dto/draft-whatsapp-message.dto';

// No shared @Controller() prefix: the generate-summary route deliberately lives under
// /treatment-plans/:id/... (matching that resource's existing route family) while the other
// two AI helpers live under /ai/... — this controller just declares full paths for each.
@Controller()
export class AiController {
  constructor(private readonly aiService: AiService) {}

  // Staff-triggered only â€” never exposed on the public @Public() portal routes. The portal
  // only ever displays the cached aiSummary field written here.
  @Post('treatment-plans/:id/generate-summary')
  @Roles(...PLAN_COORDINATION_ROLES)
  generateSummary(@Param('id') id: string, @Body() dto: GenerateSummaryDto) {
    return this.aiService.generatePlanSummary(id, dto.language);
  }

  @Post('ai/suggest-items')
  @Roles(...PLAN_STAFF_ROLES)
  suggestItems(@Body() dto: SuggestItemsDto) {
    return this.aiService.suggestItems(dto.diagnosisText, dto.categoryNames);
  }

  @Post('ai/draft-whatsapp-message')
  @Roles(...PLAN_COORDINATION_ROLES)
  draftWhatsAppMessage(@Body() dto: DraftWhatsAppMessageDto) {
    return this.aiService.draftWhatsAppMessage(dto.patientId, dto.treatmentPlanId, dto.context);
  }
}
