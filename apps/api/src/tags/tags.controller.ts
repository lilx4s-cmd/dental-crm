import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role, type JwtPayload } from '@dental-crm/shared';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ALL_STAFF } from '../common/access-policy';
import { TagsService } from './tags.service';
import { CreateTagDto } from './dto/create-tag.dto';
import { UpdateTagDto } from './dto/update-tag.dto';

@ApiTags('tags')
@ApiBearerAuth()
@Controller('tags')
export class TagsController {
  constructor(private readonly tagsService: TagsService) {}

  // Everyone reads the vocabulary — a dentist filtering patients needs the same list a consultant
  // filtering deals does. Only managers change it, because a tag renamed or deleted changes what
  // every card and every saved filter shows.
  @Get()
  @Roles(...ALL_STAFF)
  @ApiOperation({ summary: 'List every tag, grouped by category, with how many records use it' })
  findAll() {
    return this.tagsService.findAll();
  }

  @Post()
  @Roles(Role.SUPER_ADMIN, Role.CLINIC_MANAGER, Role.RECEPTION)
  @ApiOperation({ summary: 'Create a tag' })
  create(@Body() dto: CreateTagDto, @CurrentUser() user: JwtPayload) {
    return this.tagsService.create(dto, user);
  }

  @Patch(':id')
  @Roles(Role.SUPER_ADMIN, Role.CLINIC_MANAGER)
  @ApiOperation({ summary: 'Rename, recolour or recategorise a tag' })
  update(@Param('id') id: string, @Body() dto: UpdateTagDto) {
    return this.tagsService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(Role.SUPER_ADMIN, Role.CLINIC_MANAGER)
  @ApiOperation({ summary: 'Delete a tag and remove it from everything it was on' })
  remove(@Param('id') id: string) {
    return this.tagsService.remove(id);
  }
}
