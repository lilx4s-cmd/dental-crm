import { Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@dental-crm/shared';

import { Roles } from '../common/decorators/roles.decorator';
import { RemindersService } from './reminders.service';

@ApiTags('reminders')
@ApiBearerAuth()
@Controller('reminders')
export class RemindersController {
  constructor(private readonly reminders: RemindersService) {}

  /**
   * Runs a sweep now.
   *
   * Super Admin only, and it exists for one reason: the cron runs inside the API process, so on a
   * host that sleeps it does not run at all while nobody is using the app. This is how a clinic
   * confirms reminders work, and how somebody catches up after an outage without waiting for the
   * next ten-minute tick.
   *
   * Safe to press twice: the sweep claims each appointment with an atomic update, so a second run
   * finds nothing left to send rather than sending again.
   */
  @Post('run')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Send any reminders that are due right now' })
  run() {
    return this.reminders.run(new Date());
  }
}
