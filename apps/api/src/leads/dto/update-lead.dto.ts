import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateLeadDto } from './create-lead.dto';

export class UpdateLeadDto extends PartialType(OmitType(CreateLeadDto, ['conversationId'] as const)) {}
