import { Controller, Get, Patch, Body } from '@nestjs/common';
import { ApiOperation, ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { IsArray, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { Roles } from '../common/decorators/roles.decorator';
import { ALL_STAFF, CLINIC_SETTINGS_WRITE } from '../common/access-policy';
import { SettingsService } from './settings.service';

class UpdateSettingsDto {
  @IsString() @IsOptional() clinicName?: string;
  @IsString() @IsOptional() address?: string;
  @IsString() @IsOptional() city?: string;
  @IsString() @IsOptional() country?: string;
  @IsString() @IsOptional() timezone?: string;
  @IsString() @IsOptional() currency?: string;
  @IsString() @IsOptional() logoUrl?: string;
  @IsString() @IsOptional() phone?: string;
  @IsString() @IsOptional() email?: string;
  @IsString() @IsOptional() whatsapp?: string;
  @IsString() @IsOptional() website?: string;

  // The standing terms every new plan starts from. Set once here; copied onto each plan at the
  // moment it is created, so changing them later never rewrites a proposal already sent.
  @IsArray() @IsString({ each: true }) @IsOptional() defaultPackageIncludes?: string[];
  @IsNumber() @Min(0) @Max(100) @IsOptional() defaultCardFeePercent?: number;
  @IsNumber() @Min(0) @Max(100) @IsOptional() defaultCashDiscountPercent?: number;
  @IsNumber() @Min(0) @Max(100) @IsOptional() defaultDepositPercent?: number;
  @IsString() @IsOptional() defaultPaymentTerms?: string;
  @IsString() @IsOptional() defaultWarrantyTerms?: string;
}

@ApiTags('Settings')
@ApiBearerAuth()
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  /**
   * Readable by everyone: the clinic's name and currency are wanted all over the product — the
   * WhatsApp links on every deal card open with it — and none of it is sensitive.
   */
  @Get()
  @Roles(...ALL_STAFF)
  @ApiOperation({ summary: 'Clinic name, address, timezone and currency' })
  get() {
    return this.settingsService.get();
  }

  /**
   * Writable by one person. This had no restriction at all, so any staff login could rename the
   * clinic or change its currency — and currency is stamped on invoices.
   */
  @Patch()
  @Roles(...CLINIC_SETTINGS_WRITE)
  @ApiOperation({ summary: 'Update clinic configuration (Super Admin only)' })
  update(@Body() dto: UpdateSettingsDto) {
    return this.settingsService.update(dto);
  }
}
