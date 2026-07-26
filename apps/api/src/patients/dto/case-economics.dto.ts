import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

/**
 * The two figures the clinic enters by hand. Everything else on the case view is derived from
 * invoices and payments, so there is nothing else to accept here.
 *
 * Commission is a plain amount rather than a percentage for now: the clinic is still deciding
 * whether it is a rate per salesperson, a rate per deal, or a negotiated figure per case. An
 * amount holds all three without committing to any of them.
 */
export class UpdateCaseEconomicsDto {
  @ApiPropertyOptional({ description: 'What delivering this case costs the clinic' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  serviceCost?: number;

  @ApiPropertyOptional({ description: 'What the salesperson takes on this case' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  salesCommission?: number;

  @ApiPropertyOptional({ description: 'Who earned the commission' })
  @IsOptional()
  @IsString()
  commissionUserId?: string;
}
