import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@dental-crm/shared';
import { Roles } from '../common/decorators/roles.decorator';
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

  @Delete(':id')
  @ApiOperation({ summary: 'Deactivate user (soft delete)' })
  deactivate(@Param('id') id: string) {
    return this.usersService.deactivate(id);
  }
}
