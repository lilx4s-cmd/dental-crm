import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role, type JwtPayload } from '@dental-crm/shared';

import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PATIENT_FACING } from '../common/access-policy';
import { MessageTemplatesService } from './message-templates.service';
import {
  CreateMessageTemplateDto,
  UpdateMessageTemplateDto,
} from './dto/message-template.dto';
import { RenderTemplateDto } from './dto/render-template.dto';

@ApiTags('message-templates')
@ApiBearerAuth()
@Controller('message-templates')
export class MessageTemplatesController {
  constructor(private readonly templates: MessageTemplatesService) {}

  // Anyone who can send a message can read the templates — a canned reply is no use to the person
  // who cannot use it. Editing the list is management's, because a wrong price in a template goes
  // out over and over before anyone notices.
  @Get()
  @Roles(...PATIENT_FACING)
  @ApiOperation({ summary: 'Templates for the composer, most-used first' })
  findAll(@Query('includeInactive') includeInactive?: string) {
    return this.templates.findAll(includeInactive === 'true');
  }

  @Post()
  @Roles(Role.SUPER_ADMIN, Role.CLINIC_MANAGER)
  @ApiOperation({ summary: 'Create a template' })
  create(@Body() dto: CreateMessageTemplateDto, @CurrentUser() user: JwtPayload) {
    return this.templates.create(dto, user);
  }

  @Patch(':id')
  @Roles(Role.SUPER_ADMIN, Role.CLINIC_MANAGER)
  @ApiOperation({ summary: 'Edit a template, or hide it from the composer' })
  update(@Param('id') id: string, @Body() dto: UpdateMessageTemplateDto) {
    return this.templates.update(id, dto);
  }

  /**
   * Fills a template in for one recipient.
   *
   * POST rather than GET: it increments the use count, which is what sorts the picker. A GET that
   * changes state is one a proxy or a link-preview fetcher will trigger by itself.
   */
  @Post(':id/render')
  @Roles(...PATIENT_FACING)
  @ApiOperation({ summary: 'Fill a template in for a patient, ready to send' })
  render(@Param('id') id: string, @Body() dto: RenderTemplateDto, @CurrentUser() user: JwtPayload) {
    return this.templates.render(id, dto, user);
  }

  // Deactivates rather than deletes — see the service. DELETE because that is what the button
  // means to the person pressing it; what happens underneath is the safer version of it.
  @Delete(':id')
  @Roles(Role.SUPER_ADMIN, Role.CLINIC_MANAGER)
  @ApiOperation({ summary: 'Retire a template' })
  remove(@Param('id') id: string) {
    return this.templates.deactivate(id);
  }
}
