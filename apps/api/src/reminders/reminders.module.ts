import { Module } from '@nestjs/common';
import { RemindersService } from './reminders.service';
import { RemindersController } from './reminders.controller';

/**
 * MailModule is global, so it is not imported here. ScheduleModule.forRoot() is registered once in
 * AppModule — registering it per feature module starts a second scheduler.
 */
@Module({
  controllers: [RemindersController],
  providers: [RemindersService],
  exports: [RemindersService],
})
export class RemindersModule {}
