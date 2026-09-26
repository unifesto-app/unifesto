import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ContentReportStatus, ContentReportTarget, RoleCode } from '@prisma/client';
import type { User } from '@prisma/client';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { CurrentUser, Roles } from '../auth/decorators';
import { ContentReportsService } from './content-reports.service';
import { CreateContentReportDto, UpdateContentReportDto } from './dto';

@Controller('content-reports')
@UseGuards(JwtAuthGuard)
export class ContentReportsController {
  constructor(private readonly reports: ContentReportsService) {}

  /** Signed-in users: report an event, a space, or one of their tickets. */
  @Post()
  @Throttle({ default: { limit: 10, ttl: 600000 } })
  create(@CurrentUser() user: User, @Body() dto: CreateContentReportDto) {
    return this.reports.create(user.id, dto);
  }

  /** Platform admins: the review queue. */
  @Get('admin')
  @UseGuards(RolesGuard)
  @Roles(RoleCode.ADMIN)
  list(@Query('status') status?: ContentReportStatus, @Query('type') type?: ContentReportTarget) {
    const s = status && Object.values(ContentReportStatus).includes(status) ? status : undefined;
    const t = type && Object.values(ContentReportTarget).includes(type) ? type : undefined;
    return this.reports.listForAdmin(s, t);
  }

  /** Platform admins: move a report through review. */
  @Patch('admin/:id')
  @UseGuards(RolesGuard)
  @Roles(RoleCode.ADMIN)
  update(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateContentReportDto) {
    return this.reports.updateStatus(id, user.id, dto);
  }
}
