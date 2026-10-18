import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { RefundsService } from './refunds.service';
import {
  CreateRefundRequestDto,
  CuratorReviewDto,
  AdminDecisionDto,
  AdminRefundDto,
} from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RoleCode, RefundStatus } from '@prisma/client';

@ApiTags('Refunds')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('refunds')
export class RefundsController {
  constructor(private readonly refundsService: RefundsService) {}

  // --- Requester (attendee or organiser) ------------------------------------

  @Post()
  async create(@Request() req, @Body() dto: CreateRefundRequestDto) {
    return this.refundsService.createRequest(req.user.id, dto);
  }

  @Get('my')
  async myRequests(
    @Request() req,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
  ) {
    return this.refundsService.getMyRequests(req.user.id, Number(page), Number(limit));
  }

  @Get(':id')
  async getOne(@Request() req, @Param('id') id: string) {
    return this.refundsService.getRequestById(req.user.id, id);
  }

  // --- Organiser verification -----------------------------------------------

  @Get('curator/queue')
  async curatorQueue(
    @Request() req,
    @Query('status') status?: RefundStatus,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('spaceId') spaceId?: string,
  ) {
    return this.refundsService.getOrganiserRequests(
      req.user.id,
      status,
      Number(page),
      Number(limit),
      spaceId,
    );
  }

  @Patch(':id/curator-review')
  async curatorReview(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: CuratorReviewDto,
  ) {
    return this.refundsService.curatorReview(req.user.id, id, dto);
  }

  // --- Admin decision -------------------------------------------------------

  @Get('admin/all')
  @UseGuards(RolesGuard)
  @Roles(RoleCode.ADMIN)
  async adminList(
    @Query('status') status?: RefundStatus,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
  ) {
    return this.refundsService.getAllRequests(status, Number(page), Number(limit));
  }

  @Patch(':id/admin-decision')
  @UseGuards(RolesGuard)
  @Roles(RoleCode.ADMIN)
  async adminDecision(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: AdminDecisionDto,
  ) {
    return this.refundsService.adminDecide(req.user.id, id, dto);
  }

  /**
   * Admin raises and settles a refund directly for a paid registration,
   * bypassing the attendee→organiser stages. POST /refunds/admin
   */
  @Post('admin')
  @UseGuards(RolesGuard)
  @Roles(RoleCode.ADMIN)
  async adminRefund(@Request() req, @Body() dto: AdminRefundDto) {
    return this.refundsService.adminRefund(req.user.id, dto);
  }

  /**
   * A24: send every refund a cancelled event owes (tickets, extra seats, stays
   * paid online). POST /refunds/admin/event/:eventId/refund-all
   */
  @Post('admin/event/:eventId/refund-all')
  @UseGuards(RolesGuard)
  @Roles(RoleCode.ADMIN)
  async refundCancelledEvent(@Request() req, @Param('eventId') eventId: string) {
    return this.refundsService.refundCancelledEvent(req.user.id, eventId);
  }
}
