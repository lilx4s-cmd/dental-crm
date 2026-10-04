import { Module } from '@nestjs/common';
import { SupervisionController } from './supervision.controller';
import { SupervisionService } from './supervision.service';
@Module({ controllers: [SupervisionController], providers: [SupervisionService] })
export class SupervisionModule {}
