import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { JwtPayload, Role } from '@dental-crm/shared';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Permission } from '../common/decorators/permission.decorator';
import { PATIENT_FACING } from '../common/access-policy';
import { SupervisionService } from './supervision.service';
class QueueDto {
  @IsOptional() @IsString() @MaxLength(100) search?: string;
}
class FlagDto {
  @IsUUID() leadId!: string;
  @IsString() @MinLength(3) @MaxLength(2000) note!: string;
  @IsOptional() @IsDateString() dueAt?: string;
}
class CorrectionDto {
  @IsString() @MinLength(3) @MaxLength(2000) note!: string;
}
class DecisionDto extends CorrectionDto {
  @IsIn(['OPEN', 'RESOLVED']) status!: 'OPEN' | 'RESOLVED';
}
class SupervisorDto {
  @ValidateIf((o: SupervisorDto) => o.supervisorId !== null)
  @IsUUID()
  supervisorId!: string | null;
}
@Controller('supervision')
@Roles(...PATIENT_FACING)
export class SupervisionController {
  constructor(private readonly service: SupervisionService) {}
  @Get() @Permission('leads.read') queue(
    @Query() query: QueueDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.queue(user, query.search);
  }
  @Post('reviews') @Roles(Role.SUPER_ADMIN) @Permission('leads.review') flag(
    @Body() dto: FlagDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.flag(dto, user);
  }
  @Patch('leads/:id/supervisor') @Roles(Role.SUPER_ADMIN) @Permission('leads.review') assign(
    @Param('id') id: string,
    @Body() dto: SupervisorDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.assign(id, dto.supervisorId, user);
  }
  @Post('reviews/:id/correction') @Permission('leads.read') submit(
    @Param('id') id: string,
    @Body() dto: CorrectionDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.submit(id, dto.note, user);
  }
  @Patch('reviews/:id/decision') @Roles(Role.SUPER_ADMIN) @Permission('leads.review') decide(
    @Param('id') id: string,
    @Body() dto: DecisionDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.decide(id, dto, user);
  }
}
