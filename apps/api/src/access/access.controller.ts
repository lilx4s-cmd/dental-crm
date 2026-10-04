import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { IsObject, IsString, IsUUID, MaxLength, MinLength, ValidateIf } from 'class-validator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtPayload, Role } from '@dental-crm/shared';
import { AccessService } from './access.service';
class ProfileDto {
  @IsString() @MinLength(2) @MaxLength(80) name!: string;
  @IsObject() permissions!: Record<string, boolean>;
}
class AssignProfileDto {
  @ValidateIf((o: AssignProfileDto) => o.profileId !== null) @IsUUID() profileId!: string | null;
}
@Controller('access')
@Roles(Role.SUPER_ADMIN)
export class AccessController {
  constructor(private readonly service: AccessService) {}
  @Get('profiles') list() {
    return this.service.list();
  }
  @Post('profiles') create(@Body() dto: ProfileDto, @CurrentUser() user: JwtPayload) {
    return this.service.save(dto, user);
  }
  @Patch('profiles/:id') update(
    @Param('id') id: string,
    @Body() dto: ProfileDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.save(dto, user, id);
  }
  @Patch('users/:id/profile') assign(
    @Param('id') id: string,
    @Body() dto: AssignProfileDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.assign(id, dto.profileId, user);
  }
}
