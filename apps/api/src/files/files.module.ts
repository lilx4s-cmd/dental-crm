import { Module } from '@nestjs/common';
import { FilesService } from './files.service';
import { FilesController } from './files.controller';
import { MalwareScanService } from './malware-scan';

@Module({
  controllers: [FilesController],
  providers: [FilesService, MalwareScanService],
  exports: [FilesService],
})
export class FilesModule {}
