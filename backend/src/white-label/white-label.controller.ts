import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { RoleCode } from '@prisma/client';
import type { User } from '@prisma/client';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { Roles, CurrentUser } from '../auth/decorators';
import { WhiteLabelService } from './white-label.service';
import {
  AdminApplyBrandingDto,
  CreateWhiteLabelRequestDto,
  ReviewWhiteLabelRequestDto,
  UpdateBrandingDto,
} from './dto';

@Controller('white-label')
export class WhiteLabelController {
  constructor(private readonly whiteLabel: WhiteLabelService) {}

  /** Organiser raises a white-label request for a space or one of its events. */
  @Post('requests')
  @UseGuards(JwtAuthGuard)
  async createRequest(
    @CurrentUser() user: User,
    @Body() dto: CreateWhiteLabelRequestDto,
  ) {
    return this.whiteLabel.createRequest(user.id, dto);
  }

  /** The requests this organiser has raised (optionally one space). */
  @Get('requests/my')
  @UseGuards(JwtAuthGuard)
  async myRequests(
    @CurrentUser() user: User,
    @Query('spaceId') spaceId?: string,
  ) {
    return this.whiteLabel.getMyRequests(user.id, spaceId);
  }

  /**
   * Organiser's white-label page: live space/event branding state, plan gate
   * and the space's request history (any co-admin's).
   */
  @Get('spaces/:spaceId')
  @UseGuards(JwtAuthGuard)
  async spaceOverview(
    @Param('spaceId') spaceId: string,
    @CurrentUser() user: User,
  ) {
    return this.whiteLabel.getSpaceOverview(user.id, spaceId);
  }

  /**
   * Admin inbox of white-label requests.
   * NOTE: declared before ':id' routes so "requests" isn't captured as an id.
   */
  @Get('requests')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleCode.ADMIN)
  async allRequests(
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.whiteLabel.getAllRequests(
      status,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  /** Admin approves or rejects a request. */
  @Patch('requests/:id/review')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleCode.ADMIN)
  async review(
    @Param('id') id: string,
    @CurrentUser() user: User,
    @Body() dto: ReviewWhiteLabelRequestDto,
  ) {
    return this.whiteLabel.reviewRequest(id, user.id, dto);
  }

  /** Organiser edits an approved space's branding (no re-approval needed). */
  @Patch('spaces/:spaceId/branding')
  @UseGuards(JwtAuthGuard)
  async updateSpaceBranding(
    @Param('spaceId') spaceId: string,
    @CurrentUser() user: User,
    @Body() dto: UpdateBrandingDto,
  ) {
    return this.whiteLabel.updateBranding(user.id, { spaceId }, dto);
  }

  /** Organiser edits an approved event's branding (no re-approval needed). */
  @Patch('events/:eventId/branding')
  @UseGuards(JwtAuthGuard)
  async updateEventBranding(
    @Param('eventId') eventId: string,
    @CurrentUser() user: User,
    @Body() dto: UpdateBrandingDto,
  ) {
    return this.whiteLabel.updateBranding(user.id, { eventId }, dto);
  }

  /**
   * Admin directly applies (or removes) white-label on a space — no organiser
   * request needed. Returns `willRender`/`planHasBranding` so the UI can warn
   * when the owning plan doesn't yet include the perk.
   */
  @Patch('admin/spaces/:spaceId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleCode.ADMIN)
  async adminApplySpaceBranding(
    @Param('spaceId') spaceId: string,
    @Body() dto: AdminApplyBrandingDto,
  ) {
    return this.whiteLabel.adminApplyBranding({ spaceId }, dto);
  }

  /** Admin directly applies (or removes) white-label on an event. */
  @Patch('admin/events/:eventId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleCode.ADMIN)
  async adminApplyEventBranding(
    @Param('eventId') eventId: string,
    @Body() dto: AdminApplyBrandingDto,
  ) {
    return this.whiteLabel.adminApplyBranding({ eventId }, dto);
  }
}
