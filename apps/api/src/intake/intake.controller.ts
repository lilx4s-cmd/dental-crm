import { Body, Controller, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public } from '../common/decorators/public.decorator';
import { IntakeService } from './intake.service';
import {
  ConfirmIntakeAttachmentDto,
  CreateIntakeDto,
  IntakeUploadUrlDto,
} from './dto/create-intake.dto';

/**
 * The public patient enquiry form. Every route is unauthenticated by design — this is a link the
 * clinic hands out — so `@Public()` sits at class level, mirroring the patient portal, and
 * main.ts applies a tighter rate limit to `/api/intake` than the rest of the API.
 */
@ApiTags('intake')
@Controller('intake')
@Public()
export class IntakeController {
  constructor(private readonly intakeService: IntakeService) {}

  @Post()
  @ApiOperation({ summary: 'Submit the public patient enquiry form' })
  submit(@Body() dto: CreateIntakeDto) {
    return this.intakeService.submit(dto);
  }

  // Attachments are a second step on purpose: the enquiry is saved first, so a storage outage
  // costs the clinic some photos rather than the whole enquiry.
  @Post(':id/upload-url')
  @ApiOperation({ summary: 'Signed URL for attaching a photo or x-ray to a submission' })
  createUploadUrl(@Param('id') id: string, @Body() dto: IntakeUploadUrlDto) {
    return this.intakeService.createUploadUrl(id, dto);
  }

  @Post(':id/attachments')
  @ApiOperation({ summary: 'Confirm an uploaded attachment' })
  confirmAttachment(@Param('id') id: string, @Body() dto: ConfirmIntakeAttachmentDto) {
    return this.intakeService.confirmAttachment(id, dto);
  }
}
