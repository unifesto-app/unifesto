import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { User } from '@prisma/client';
import { ReportType } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards';
import { CurrentUser } from '../auth/decorators';
import { ReportsService } from './reports.service';
import { CreateReportDto, ListReportsQueryDto } from './dto';

/**
 * Event-scoped report generation — all organiser-only. Organiser membership and
 * the `hasAnalytics` plan gate are enforced in the service on every route.
 *
 * A generated report's PDF lives in S3; the row carries its public `fileUrl`,
 * so clients download straight from that URL (same pattern as certificates).
 */
@Controller('events/:eventId/reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  /** Generate a DEFAULT (full) or CUSTOM (chosen-sections) report. */
  @Post()
  @UseGuards(JwtAuthGuard)
  create(
    @CurrentUser() user: User,
    @Param('eventId') eventId: string,
    @Body() dto: CreateReportDto,
  ) {
    return this.reports.create(user.id, eventId, dto);
  }

  /** This event's report history, newest first. */
  @Get()
  @UseGuards(JwtAuthGuard)
  list(
    @CurrentUser() user: User,
    @Param('eventId') eventId: string,
    @Query() query: ListReportsQueryDto,
  ) {
    return this.reports.list(
      user.id,
      eventId,
      query.type as ReportType | undefined,
    );
  }

  /** Re-render a report in place with a fresh AI summary (M3; ended events only). */
  @Post(':reportId/regenerate')
  @UseGuards(JwtAuthGuard)
  regenerate(
    @CurrentUser() user: User,
    @Param('eventId') eventId: string,
    @Param('reportId') reportId: string,
  ) {
    return this.reports.regenerate(user.id, eventId, reportId);
  }

  /** Delete a report from the history (removes the row; the S3 file is left). */
  @Delete(':reportId')
  @UseGuards(JwtAuthGuard)
  remove(@CurrentUser() user: User, @Param('reportId') reportId: string) {
    return this.reports.remove(user.id, reportId);
  }
}
