import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { CaseAccessGuard } from '../common/guards/case-access.guard';

@Global()
@Module({
  providers: [PrismaService, CaseAccessGuard],
  exports: [PrismaService, CaseAccessGuard],
})
export class PrismaModule {}
