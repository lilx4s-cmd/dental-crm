import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtPayload } from '@dental-crm/shared';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { PLAN_COORDINATION } from '../common/access-policy';
import { LabOrdersService } from './lab-orders.service';
import { CreateLabOrderDto, UpdateLabOrderDto } from './dto/lab-order.dto';

/**
 * Lab dispatches.
 *
 * Gated to the same group that writes treatment plans: a lab order describes clinical work and its
 * due date drives whether a patient can fly home on schedule, so it belongs with the people who
 * plan the treatment rather than with everyone who can read the diary.
 */
@ApiTags('lab-orders')
@ApiBearerAuth()
@Controller()
export class LabOrdersController {
  constructor(private readonly service: LabOrdersService) {}

  @Get('lab-orders')
  @Roles(...PLAN_COORDINATION)
  @ApiOperation({ summary: 'Cases still out at the lab, soonest due first' })
  findOpen() {
    return this.service.findOpen();
  }

  @Get('treatment-plans/:planId/lab-orders')
  @Roles(...PLAN_COORDINATION)
  @ApiOperation({ summary: 'Lab orders for one treatment plan' })
  findForPlan(@Param('planId') planId: string) {
    return this.service.findForPlan(planId);
  }

  @Post('treatment-plans/:planId/lab-orders')
  @Roles(...PLAN_COORDINATION)
  @ApiOperation({ summary: 'Send a case to the laboratory' })
  create(
    @Param('planId') planId: string,
    @Body() dto: CreateLabOrderDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.create(planId, dto, user.sub);
  }

  @Patch('lab-orders/:id')
  @Roles(...PLAN_COORDINATION)
  @ApiOperation({ summary: 'Update a lab order, including its status' })
  update(@Param('id') id: string, @Body() dto: UpdateLabOrderDto) {
    return this.service.update(id, dto);
  }

  @Delete('lab-orders/:id')
  @Roles(...PLAN_COORDINATION)
  @ApiOperation({ summary: 'Delete a lab order' })
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
