import { Controller, Get, Post, Delete, Param, Body, Query } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtPayload } from '@dental-crm/shared';
import { ALL_STAFF } from '../common/access-policy';
import { FilesService } from './files.service';
import { CreateUploadUrlDto } from './dto/create-upload-url.dto';
import { ConfirmFileDto } from './dto/confirm-file.dto';

/**
 * Files, gated by what they are attached to rather than by one list for the whole module.
 *
 * Storage is polymorphic: the same endpoints serve radiographs on a patient and passport scans on
 * a deal. A single role list on the controller is therefore wrong in one direction or the other —
 * the previous one gave a sales consultant API access to X-rays while locking reception out of the
 * passport they had just scanned. The class-level guard now only establishes that the caller is
 * staff; the service decides per record, using the same policy the rest of the app reads.
 */
@Controller('files')
@Roles(...ALL_STAFF)
export class FilesController {
  constructor(private readonly service: FilesService) {}

  // Declared before ':id' routes so it is not captured as a file id.
  // Actually talks to storage rather than just checking that the variables are set — credentials
  // can be present and still wrong, and "configured" is not the same as "works".
  @Get('storage-status')
  storageStatus() {
    return this.service.storageCheck();
  }

  @Post('upload-url')
  createUploadUrl(@Body() dto: CreateUploadUrlDto, @CurrentUser() user: JwtPayload) {
    return this.service.createUploadUrl(dto, user);
  }

  @Post()
  confirm(@Body() dto: ConfirmFileDto, @CurrentUser() user: JwtPayload) {
    return this.service.confirm(dto, user.sub, user);
  }

  @Get()
  findByOwner(
    @Query('ownerType') ownerType: string,
    @Query('ownerId') ownerId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.findByOwner(ownerType, ownerId, user);
  }

  @Get(':id/download-url')
  getDownloadUrl(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.getDownloadUrl(id, user);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.remove(id, user);
  }
}
