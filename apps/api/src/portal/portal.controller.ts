import { Controller, Get, Post, Param, Body, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { PortalService } from './portal.service';
import { RejectPlanDto } from './dto/reject-plan.dto';
import { AddPortalCommentDto } from './dto/add-portal-comment.dto';

@Controller('portal')
@Public()
export class PortalController {
  constructor(private readonly service: PortalService) {}

  @Get(':token')
  getPlan(@Param('token') token: string) {
    return this.service.getPlan(token);
  }

  @Post(':token/approve')
  approve(@Param('token') token: string) {
    return this.service.approve(token);
  }

  @Post(':token/reject')
  reject(@Param('token') token: string, @Body() dto: RejectPlanDto) {
    return this.service.reject(token, dto);
  }

  @Post(':token/comments')
  addComment(@Param('token') token: string, @Body() dto: AddPortalCommentDto) {
    return this.service.addComment(token, dto);
  }

  @Get(':token/pdf')
  async getPdf(@Param('token') token: string, @Res() res: Response) {
    const buffer = await this.service.getPdf(token);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="treatment-plan.pdf"',
    });
    res.send(buffer);
  }
}
