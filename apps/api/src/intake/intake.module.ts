import { Module } from '@nestjs/common';
import { IntakeService } from './intake.service';
import { IntakeController } from './intake.controller';
import { FilesModule } from '../files/files.module';

@Module({
  imports: [FilesModule],
  controllers: [IntakeController],
  providers: [IntakeService],
  exports: [IntakeService],
})
export class IntakeModule {}
