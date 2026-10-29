import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
  Logger,
  Request,
  ParseUUIDPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { uploadLimit } from '../common/upload-limits';
import { AdminService } from './admin.service';
import { ScorecardService } from './scorecard.service';
import { UsersService } from '../users/users.service';
import { RegistrationsService } from '../registrations/registrations.service';
import { EventsService } from '../events/events.service';
import { PlatformConfigService } from '../subscription/platform-config.service';
import { AiService } from '../ai/ai.service';
import { UpdateProfileDto } from '../users/dto';
import { AdminResolvePendingDto } from '../registrations/dto';
import { CancelEventDto } from '../events/dto';
import { UpdatePlatformConfigDto } from './dto/platform-config.dto';
import { UpdateAppVersionDto } from './dto/app-version.dto';
import { UpdateStatsRecipientsDto } from './dto/stats-recipients.dto';
import { SetEmployeeDto } from './dto/employee.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { User } from '@prisma/client';
import { RoleCode, SpaceStatus } from '@prisma/client';
import { toPage, toLimit } from '../common/pagination';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminController {
  private readonly logger = new Logger(AdminController.name);
  constructor(
    private readonly adminService: AdminService,
    private readonly usersService: UsersService,
    private readonly registrationsService: RegistrationsService,
    private readonly eventsService: EventsService,
    private readonly platformConfig: PlatformConfigService,
    private readonly scorecard: ScorecardService,
    private readonly ai: AiService,
  ) {}

  @Get('health')
  @Roles(RoleCode.ADMIN)
  async getHealth() {
    this.logger.log('Health check endpoint called');
    return this.adminService.getHealthStatus();
  }

  /**
   * Read platform-wide settings (currently the app processing fee).
   * GET /admin/platform-config
   */
  /**
   * Every Apex queue's waiting count in one call (J3). Mobile Apex home used to
   * download up to 100 rows per queue just to count them.
   * GET /admin/queue-counts
   */
  @Get('queue-counts')
  @Roles(RoleCode.ADMIN)
  getQueueCounts() {
    return this.adminService.getQueueCounts();
  }

  @Get('platform-config')
  @Roles(RoleCode.ADMIN)
  async getPlatformConfig() {
    return this.platformConfig.getConfig();
  }

  /**
   * Each AI feature's last 30 days: runs, outcomes, cost, cache share.
   * GET /admin/ai-usage
   */
  @Get('ai-usage')
  @Roles(RoleCode.ADMIN)
  getAiUsage() {
    return this.ai.usage(30);
  }

  /**
   * Update platform-wide settings: the post-event action window (days after an
   * event ends that certificate issuance and attendee import/add stay open).
   * Each field is applied only when present. The app processing fee is fixed
   * platform-wide (see PROCESSING_FEE_PERCENT) and is not editable here.
   * PATCH /admin/platform-config
   */
  @Patch('platform-config')
  @Roles(RoleCode.ADMIN)
  async updatePlatformConfig(@Body() dto: UpdatePlatformConfigDto) {
    if (dto.postEventActionWindowDays !== undefined) {
      await this.platformConfig.setPostEventActionWindowDays(
        dto.postEventActionWindowDays,
      );
    }
    if (dto.appReviewLoginEnabled !== undefined) {
      await this.platformConfig.setAppReviewLoginEnabled(
        dto.appReviewLoginEnabled,
      );
    }
    if (dto.requireAgeConfirmation !== undefined) {
      await this.platformConfig.setRequireAgeConfirmation(
        dto.requireAgeConfirmation,
      );
    }
    if (dto.customSendingDomainsEnabled !== undefined) {
      await this.platformConfig.setCustomSendingDomainsEnabled(
        dto.customSendingDomainsEnabled,
      );
    }
    if (dto.aiEnabledFeatures !== undefined) {
      await this.platformConfig.setAiEnabledFeatures(dto.aiEnabledFeatures);
    }
    return this.platformConfig.getConfig();
  }

  /**
   * Read the mobile app version policy (drives the in-app update prompt).
   * GET /admin/app-version
   */
  @Get('app-version')
  @Roles(RoleCode.ADMIN)
  async getAppVersion() {
    return this.platformConfig.getAppVersion();
  }

  /**
   * Update the mobile app version policy per platform.
   * PATCH /admin/app-version
   */
  @Patch('app-version')
  @Roles(RoleCode.ADMIN)
  async updateAppVersion(@Body() dto: UpdateAppVersionDto) {
    return this.platformConfig.setAppVersion(dto);
  }

  /**
   * WhatsApp numbers that receive the Unifesto Stats broadcast.
   * GET /admin/stats-recipients
   */
  @Get('stats-recipients')
  @Roles(RoleCode.ADMIN)
  async getStatsRecipients() {
    return { numbers: await this.platformConfig.getStatsRecipients() };
  }

  /**
   * Replace the Unifesto Stats recipient list (normalised to E.164, de-duped).
   * PUT /admin/stats-recipients
   */
  @Put('stats-recipients')
  @Roles(RoleCode.ADMIN)
  async updateStatsRecipients(@Body() dto: UpdateStatsRecipientsDto) {
    return { numbers: await this.platformConfig.setStatsRecipients(dto.numbers) };
  }

  /**
   * List all users (ADMIN only)
   * GET /admin/users?page=1&limit=20&search=query
   */
  @Get('users')
  @Roles(RoleCode.ADMIN)
  async getAllUsers(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ) {
    return this.usersService.getAllUsers({
      page: toPage(page),
      limit: toLimit(limit, 20),
      search,
    });
  }

  /**
   * Get a single user by ID (ADMIN only)
   * GET /admin/users/:id
   */
  @Get('users/:id')
  @Roles(RoleCode.ADMIN)
  async getUserById(@Param('id') id: string) {
    return this.usersService.getUserByIdAdmin(id);
  }

  /** F6: the user's registrations and payments. GET /admin/users/:id/activity */
  @Get('users/:id/activity')
  @Roles(RoleCode.ADMIN)
  async getUserActivity(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.getUserActivityAdmin(id);
  }

  /**
   * Update a user's profile by ID (ADMIN only)
   * PATCH /admin/users/:id
   */
  @Patch('users/:id')
  @Roles(RoleCode.ADMIN)
  async updateUserById(
    @Param('id') id: string,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.usersService.updateUserByIdAdmin(id, dto);
  }

  /**
   * Make a user an Employee or remove it (ADMIN only)
   * PUT /admin/users/:id/employee  { enabled }
   */
  @Put('users/:id/employee')
  @Roles(RoleCode.ADMIN)
  async setEmployee(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetEmployeeDto,
    @CurrentUser() admin: User,
  ) {
    return this.adminService.setEmployee(id, dto.enabled, admin.id);
  }

  /**
   * Add or replace a user's profile avatar (ADMIN only)
   * POST /admin/users/:id/avatar  (multipart, field: `avatar`)
   */
  @Post('users/:id/avatar')
  @Roles(RoleCode.ADMIN)
  @UseInterceptors(FileInterceptor('avatar', uploadLimit(5)))
  async setUserAvatar(
    @Param('id') id: string,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 }), // 5MB
          new FileTypeValidator({ fileType: /(jpg|jpeg|png|webp)$/ }),
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    return this.usersService.setUserAvatarAdmin(id, file);
  }

  /**
   * Remove a user's profile avatar (ADMIN only)
   * DELETE /admin/users/:id/avatar
   */
  @Delete('users/:id/avatar')
  @Roles(RoleCode.ADMIN)
  async removeUserAvatar(@Param('id') id: string) {
    return this.usersService.removeUserAvatarAdmin(id);
  }

  /**
   * List ALL spaces across the platform (ADMIN only)
   * GET /admin/spaces?page=1&limit=20&search=query
   */
  @Get('spaces')
  @Roles(RoleCode.ADMIN)
  async getAllSpaces(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ) {
    return this.adminService.getAllSpacesAdmin({
      page: toPage(page),
      limit: toLimit(limit, 20),
      search,
    });
  }

  /**
   * Approve a pending space (ADMIN only)
   * PATCH /admin/spaces/:id/approve
   */
  @Patch('spaces/:id/approve')
  @Roles(RoleCode.ADMIN)
  async approveSpace(@Param('id') id: string, @CurrentUser() user: User) {
    return this.adminService.approveSpace(id, user.id);
  }

  /**
   * Reject a pending space (ADMIN only)
   * PATCH /admin/spaces/:id/reject
   */
  @Patch('spaces/:id/reject')
  @Roles(RoleCode.ADMIN)
  async rejectSpace(
    @Param('id') id: string,
    @CurrentUser() user: User,
    @Body() body: { reason?: string },
  ) {
    return this.adminService.rejectSpace(id, user.id, body?.reason);
  }

  /**
   * Manage a space's lifecycle state (ADMIN only)
   * PATCH /admin/spaces/:id/status  { status: SpaceStatus }
   */
  @Patch('spaces/:id/status')
  @Roles(RoleCode.ADMIN)
  async updateSpaceStatus(
    @Param('id') id: string,
    @CurrentUser() user: User,
    @Body() body: { status: SpaceStatus },
  ) {
    return this.adminService.updateSpaceStatus(id, body.status, user.id);
  }

  /**
   * Platform-wide analytics overview (ADMIN only)
   * GET /admin/analytics/overview
   */
  @Get('analytics/overview')
  @Roles(RoleCode.ADMIN)
  async getAnalyticsOverview() {
    return this.adminService.getAnalyticsOverview();
  }

  /**
   * Financial time-series for the analytics graphs (ADMIN only).
   * `range` ∈ today | 7d | 14d | 1m | 6m | 12m | 24m (default 12m).
   * GET /admin/analytics/financial-timeseries?range=12m
   */
  @Get('analytics/financial-timeseries')
  @Roles(RoleCode.ADMIN)
  async getFinancialTimeseries(@Query('range') range?: string) {
    return this.adminService.getFinancialTimeseries(range || '12m');
  }

  /**
   * Z7 weekly scorecard: last 7 IST days vs the 7 before (ADMIN only).
   * GET /admin/analytics/weekly-scorecard
   */
  @Get('analytics/weekly-scorecard')
  @Roles(RoleCode.ADMIN)
  async getWeeklyScorecard(@CurrentUser() user: User) {
    return this.scorecard.weekly(user.id);
  }

  /**
   * User / space / event growth time-series + status breakdowns for the
   * analytics graphs (ADMIN only).
   * `range` ∈ today | 7d | 1m | 6m | 12m | 24m (default 12m).
   * GET /admin/analytics/growth-timeseries?range=12m
   */
  @Get('analytics/growth-timeseries')
  @Roles(RoleCode.ADMIN)
  async getGrowthTimeseries(@Query('range') range?: string) {
    return this.adminService.getGrowthTimeseries(range || '12m');
  }

  /**
   * List all events incl. drafts for moderation (ADMIN only)
   * GET /admin/events?page=1&limit=20&status=PUBLISHED&search=tech
   */
  @Get('events')
  @Roles(RoleCode.ADMIN)
  async getAllEvents(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('deleted') deleted?: string,
    @Query('spaceId', new ParseUUIDPipe({ optional: true })) spaceId?: string,
  ) {
    return this.adminService.getAllEvents({
      page: toPage(page),
      limit: toLimit(limit, 20),
      status,
      search,
      spaceId,
      // Anything but the two explicit opt-ins means the normal list, so a
      // malformed value can never accidentally surface hidden rows.
      deleted:
        deleted === 'deleted' || deleted === 'all' ? deleted : 'active',
    });
  }

  /**
   * One event in full for the admin detail page (ADMIN only)
   * GET /admin/events/:id
   */
  @Get('events/:id')
  @Roles(RoleCode.ADMIN)
  async getEventById(@Param('id') id: string) {
    return this.adminService.getEventById(id);
  }

  /**
   * Moderation actions on one event (ADMIN only). Each delegates to the same
   * EventsService method an organiser uses — a Platform ADMIN is a superuser in
   * the authorization layer, so `canManageEvent` clears them, and all the cache
   * invalidation, attendee cancellation emails and usage counters come along
   * for free rather than being re-implemented here.
   */

  /** Publish a draft event. POST /admin/events/:id/publish */
  @Post('events/:id/publish')
  @Roles(RoleCode.ADMIN)
  async publishEventAdmin(@Param('id') id: string, @CurrentUser() user: User) {
    return this.eventsService.publishEvent(user.id, id);
  }

  /** Cancel an event (notifies attendees). POST /admin/events/:id/cancel */
  @Post('events/:id/cancel')
  @Roles(RoleCode.ADMIN)
  async cancelEventAdmin(
    @Param('id') id: string,
    @Body() dto: CancelEventDto,
    @CurrentUser() user: User,
  ) {
    return this.eventsService.cancelEvent(user.id, id, dto);
  }

  /** Hide a completed/cancelled event. POST /admin/events/:id/hide */
  @Post('events/:id/hide')
  @Roles(RoleCode.ADMIN)
  async hideEventAdmin(@Param('id') id: string, @CurrentUser() user: User) {
    return this.eventsService.softDeleteEvent(user.id, id);
  }

  /** Restore a hidden event. POST /admin/events/:id/restore */
  @Post('events/:id/restore')
  @Roles(RoleCode.ADMIN)
  async restoreEventAdmin(@Param('id') id: string, @CurrentUser() user: User) {
    return this.eventsService.restoreEvent(user.id, id);
  }

  /**
   * List all sessions incl. drafts for moderation (ADMIN only)
   * GET /admin/sessions?page=1&limit=20&status=PUBLISHED&search=pm
   */
  @Get('sessions')
  @Roles(RoleCode.ADMIN)
  async getAllSessions(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('deleted') deleted?: string,
  ) {
    return this.adminService.getAllSessions({
      page: toPage(page),
      limit: toLimit(limit, 20),
      status,
      search,
      // Anything but the two explicit opt-ins means the normal list, so a
      // malformed value can never accidentally surface hidden rows.
      deleted:
        deleted === 'deleted' || deleted === 'all' ? deleted : 'active',
    });
  }

  /** One session in full incl. attendees (ADMIN only) */
  @Get('sessions/:id')
  @Roles(RoleCode.ADMIN)
  async getSessionDetail(@Param('id') id: string) {
    return this.adminService.getSessionDetail(id);
  }

  @Get('transactions')
  @Roles(RoleCode.ADMIN)
  async getTransactions(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.adminService.getTransactions({
      page: toPage(page),
      limit: toLimit(limit, 20),
      status,
      search,
    });
  }

  @Get('transactions/:id')
  @Roles(RoleCode.ADMIN)
  async getTransaction(@Param('id') id: string) {
    return this.adminService.getTransaction(id);
  }

  /**
   * Reconcile a stuck PENDING registration against Razorpay's own record and
   * apply the true outcome (PAID / FAILED / REFUNDED / still pending). Use when
   * a payment succeeded, failed, or was refunded at Razorpay but the webhook
   * never settled it. Pass `paymentId` (the pay_… id from the Razorpay
   * dashboard) when a payment retry orphaned the order so the current order has
   * no payment. Idempotent. POST /admin/transactions/:id/reconcile
   */
  @Post('transactions/:id/reconcile')
  @Roles(RoleCode.ADMIN)
  async reconcileTransaction(
    @Param('id') id: string,
    @Body()
    body: {
      paymentId?: string;
      reassignOrphan?: boolean;
      allowAmountMismatch?: boolean;
    } = {},
  ) {
    return this.registrationsService.reconcilePendingPayment(id, {
      paymentId: body.paymentId,
      reassignOrphan: body.reassignOrphan,
      allowAmountMismatch: body.allowAmountMismatch,
    });
  }

  /**
   * Manually resolve a stuck PENDING registration that reconcile can't settle
   * (an abandoned duplicate, or one whose real payment lives on another
   * registration). Non-money outcomes only — FAILED or FAILED+CANCELLED; a paid
   * registration must be refunded, not overridden. POST /admin/transactions/:id/resolve
   */
  @Post('transactions/:id/resolve')
  @Roles(RoleCode.ADMIN)
  async resolveTransaction(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: AdminResolvePendingDto,
  ) {
    return this.registrationsService.adminResolvePending(id, dto, req.user.id);
  }

  /**
   * One-off maintenance: recompute event/ticket-type seat counters so groups
   * count as `groupSize` seats. Safe to re-run (idempotent). POST /admin/reconcile-seat-counts
   */
  @Post('reconcile-seat-counts')
  @Roles(RoleCode.ADMIN)
  async reconcileSeatCounts() {
    return this.adminService.reconcileSeatCounts();
  }
}
