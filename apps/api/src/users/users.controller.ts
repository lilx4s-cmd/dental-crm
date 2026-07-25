import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role, JwtPayload } from '@dental-crm/shared';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AdminResetPasswordDto } from './dto/admin-password.dto';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

const ASSIGNEE_LOOKUP_ROLES = [Role.SUPER_ADMIN, Role.CLINIC_MANAGER, Role.SALES_CONSULTANT, Role.RECEPTION];

@ApiTags('Users')
@ApiBearerAuth()
@Roles(Role.SUPER_ADMIN, Role.CLINIC_MANAGER)
@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new user (admin/manager only)' })
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  // Widened past the controller's default (Super Admin/Clinic Manager only) so
  // Sales Consultants and Reception — the roles that actually create leads — can
  // populate an assignee picker. Read-only, and UsersService.findAll() already
  // excludes passwordHash, so this doesn't expose anything sensitive.
  @Get()
  @Roles(...ASSIGNEE_LOOKUP_ROLES)
  @ApiOperation({ summary: 'List all users' })
  findAll() {
    return this.usersService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get user by ID' })
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update user' })
  update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.usersService.update(id, dto);
  }

  @Get(':id/sessions')
  @ApiOperation({ summary: 'How many live sessions a user has' })
  async sessions(@Param('id') id: string) {
    return { active: await this.usersService.activeSessionCount(id) };
  }

  @Post(':id/revoke-sessions')
  @ApiOperation({ summary: 'Sign a user out of every device' })
  revokeSessions(@Param('id') id: string) {
    return this.usersService.revokeSessions(id);
  }

  @Post(':id/reset-password')
  @ApiOperation({ summary: 'Set a new password for a user and end their sessions' })
  resetPassword(@Param('id') id: string, @Body() dto: AdminResetPasswordDto) {
    return this.usersService.adminResetPassword(id, dto.newPassword);
  }

  @Patch(':id/activate')
  @ApiOperation({ summary: 'Reactivate a deactivated user' })
  activate(@Param('id') id: string) {
    return this.usersService.activate(id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Deactivate user (soft delete)' })
  deactivate(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.usersService.deactivate(id, user.sub);
  }
}
