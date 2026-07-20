import { Controller, Get, Post, Delete, Param, Body, Query } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtPayload } from '@dental-crm/shared';
import { PLAN_COORDINATION_ROLES } from '../treatment-plans/treatment-plans.controller';
import { FilesService } from './files.service';
import { CreateUploadUrlDto } from './dto/create-upload-url.dto';
import { ConfirmFileDto } from './dto/confirm-file.dto';

@Controller('files')
@Roles(...PLAN_COORDINATION_ROLES)
export class FilesController {
  constructor(private readonly service: FilesService) {}

  @Post('upload-url')
  createUploadUrl(@Body() dto: CreateUploadUrlDto) {
    return this.service.createUploadUrl(dto);
  }

  @Post()
  confirm(@Body() dto: ConfirmFileDto, @CurrentUser() user: JwtPayload) {
    return this.service.confirm(dto, user.sub);
  }

  @Get()
  findByOwner(@Query('ownerType') ownerType: string, @Query('ownerId') ownerId: string) {
    return this.service.findByOwner(ownerType, ownerId);
  }

  @Get(':id/download-url')
  getDownloadUrl(@Param('id') id: string) {
    return this.service.getDownloadUrl(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
