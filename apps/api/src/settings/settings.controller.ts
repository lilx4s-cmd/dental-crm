import { Controller, Get, Patch, Body } from '@nestjs/common';
import { ApiOperation, ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
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
