import {
  Controller,
  Get,
  Post,
  Patch,
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
  Request,
  ParseUUIDPipe,
  ForbiddenException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { uploadLimit } from '../common/upload-limits';
import { SpacesService } from './spaces.service';
import { BannerPaletteService } from '../banner-palette/banner-palette.service';
import { JwtAuthGuard, OptionalJwtAuthGuard, RolesGuard } from '../auth/guards';
import { Action, AuthorizationService, Can, CanGuard } from '../auth/authorization';
import { Roles, CurrentUser } from '../auth/decorators';
import {
  CreateSpaceDto,
  UpdateSpaceDto,
  UpdateSpaceStatusDto,
  CreateSpaceStatusRequestDto,
  ReviewSpaceStatusRequestDto,
  CreateSpaceOwnershipRequestDto,
  ReviewSpaceOwnershipRequestDto,
  AddSpaceMemberDto,
  UpdateSpaceMemberRoleDto,
  CreateEventRequestDto,
} from './dto';
import { CreateSpaceRequestDto } from './dto/create-space-request.dto';
import { SetSpaceVerificationDto } from './dto/set-space-verification.dto';
import {
  CreateSubSpaceRequestDto,
  ReviewSubSpaceRequestDto,
} from './dto/sub-space-request.dto';
import { RoleCode, SpaceStatus, SpaceVisibility } from '@prisma/client';
import type { User } from '@prisma/client';

@Controller('spaces')
export class SpacesController {
  constructor(
    private readonly spacesService: SpacesService,
    private readonly bannerPalette: BannerPaletteService,
    private readonly authz: AuthorizationService,
  ) {}

  /**
   * Create a new space (ADMIN only)
   * POST /spaces
   */
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleCode.ADMIN)
  async createSpace(
    @Body() dto: CreateSpaceDto,
    @CurrentUser() user: User,
  ) {
    return this.spacesService.createSpace(dto, user.id);
  }

  /**
   * Get all spaces with filters (PUBLIC - no auth required)
   * GET /spaces?page=1&limit=10&status=ACTIVE&visibility=PUBLIC&search=tech
   */
  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  async getAllSpaces(
    @Request() req,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: SpaceStatus,
    @Query('visibility') visibility?: SpaceVisibility,
    @Query('search') search?: string,
    @Query('parentId') parentId?: string,
  ) {
    return this.spacesService.getAllSpaces({
      parentId,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 10,
      status,
      visibility,
      search,
      viewerId: req.user?.id,
    });
  }

  /**
   * Get space by slug (PUBLIC - for mobile view)
   * GET /spaces/slug/:slug
   */
  @Get('slug/:slug')
  @UseGuards(OptionalJwtAuthGuard)
  async getSpaceBySlug(@Request() req, @Param('slug') slug: string) {
    return this.spacesService.getSpaceBySlug(slug, req.user?.id);
  }

  /**
   * Get all space requests (ADMIN only)
   * GET /spaces/requests?status=PENDING
   * NOTE: Must be declared before the ':id' route so "requests" is not
   * captured as a space id.
   */
  @Get('requests')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleCode.ADMIN)
  async getAllSpaceRequests(@Query('status') status?: string) {
    return this.spacesService.getAllSpaceRequests(status);
  }

  /**
   * Get my space requests
   * GET /spaces/my-requests
   */
  @Get('my-requests')
  @UseGuards(JwtAuthGuard)
  async getMySpaceRequests(@CurrentUser() user: User) {
    return this.spacesService.getMySpaceRequests(user.id);
  }

  /**
   * Approve a space request (ADMIN only)
   * PATCH /spaces/requests/:id/approve
   */
  @Patch('requests/:id/approve')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleCode.ADMIN)
  async approveSpaceRequest(
    @Param('id') id: string,
    @CurrentUser() user: User,
  ) {
    return this.spacesService.approveSpaceRequest(id, user.id);
  }

  /**
   * Reject a space request (ADMIN only)
   * PATCH /spaces/requests/:id/reject
   */
  @Patch('requests/:id/reject')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleCode.ADMIN)
  async rejectSpaceRequest(
    @Param('id') id: string,
    @Body() body: { reviewNote?: string },
    @CurrentUser() user: User,
  ) {
    return this.spacesService.rejectSpaceRequest(id, user.id, body?.reviewNote);
  }

  /**
   * Ask to host one event without a space (Assist D7)
   * POST /spaces/event-requests
   */
  @Post('event-requests')
  @UseGuards(JwtAuthGuard)
  async createEventRequest(@Body() dto: CreateEventRequestDto, @CurrentUser() user: User) {
    return this.spacesService.createEventRequest(user.id, dto);
  }

  /**
   * Approve an event request (ADMIN only): personal space + draft event
   * PATCH /spaces/event-requests/:id/approve
   */
  @Patch('event-requests/:id/approve')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleCode.ADMIN)
  async approveEventRequest(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.spacesService.approveEventRequest(id, user.id);
  }

  /**
   * Reject an event request (ADMIN only)
   * PATCH /spaces/event-requests/:id/reject
   */
  @Patch('event-requests/:id/reject')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleCode.ADMIN)
  async rejectEventRequest(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { reviewNote?: string },
    @CurrentUser() user: User,
  ) {
    return this.spacesService.rejectEventRequest(id, user.id, body?.reviewNote);
  }

  /**
   * Create a space status-change request (organiser only)
   * POST /spaces/status-requests
   * NOTE: Declared before ':id' so "status-requests" isn't captured as an id.
   */
  @Post('status-requests')
  @UseGuards(JwtAuthGuard)
  async createSpaceStatusRequest(
    @CurrentUser() user: User,
    @Body() dto: CreateSpaceStatusRequestDto,
  ) {
    return this.spacesService.createSpaceStatusRequest(user.id, dto);
  }

  /**
   * Get my space status requests (organiser)
   * GET /spaces/status-requests/my
   */
  @Get('status-requests/my')
  @UseGuards(JwtAuthGuard)
  async getMySpaceStatusRequests(
    @CurrentUser() user: User,
    @Query('spaceId') spaceId?: string,
  ) {
    return this.spacesService.getMySpaceStatusRequests(user.id, spaceId);
  }

  /**
   * Get all space status requests (ADMIN only)
   * GET /spaces/status-requests?status=PENDING
   */
  @Get('status-requests')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleCode.ADMIN)
  async getAllSpaceStatusRequests(
    @Query('status') status?: string,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
  ) {
    return this.spacesService.getAllSpaceStatusRequests(status, +page, +limit);
  }

  /**
   * Review (approve/reject) a space status request (ADMIN only)
   * PATCH /spaces/status-requests/:id/review
   */
  @Patch('status-requests/:id/review')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleCode.ADMIN)
  async reviewSpaceStatusRequest(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: ReviewSpaceStatusRequestDto,
  ) {
    return this.spacesService.reviewSpaceStatusRequest(id, user.id, dto);
  }

  /**
   * Request to hand this space to another member (space creator only)
   * POST /spaces/ownership-requests
   * NOTE: Declared before ':id' so "ownership-requests" isn't captured as an id.
   */
  @Post('ownership-requests')
  @UseGuards(JwtAuthGuard)
  async createSpaceOwnershipRequest(
    @CurrentUser() user: User,
    @Body() dto: CreateSpaceOwnershipRequestDto,
  ) {
    return this.spacesService.createSpaceOwnershipRequest(user.id, dto);
  }

  /**
   * Ownership transfers I raised or am receiving
   * GET /spaces/ownership-requests/my
   */
  @Get('ownership-requests/my')
  @UseGuards(JwtAuthGuard)
  async getMySpaceOwnershipRequests(
    @CurrentUser() user: User,
    @Query('spaceId') spaceId?: string,
  ) {
    return this.spacesService.getMySpaceOwnershipRequests(user.id, spaceId);
  }

  /**
   * Get all ownership transfer requests (ADMIN only)
   * GET /spaces/ownership-requests?status=PENDING
   */
  @Get('ownership-requests')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleCode.ADMIN)
  async getAllSpaceOwnershipRequests(
    @Query('status') status?: string,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
  ) {
    return this.spacesService.getAllSpaceOwnershipRequests(
      status,
      +page,
      +limit,
    );
  }

  /**
   * Review (approve/reject) an ownership transfer (ADMIN only)
   * PATCH /spaces/ownership-requests/:id/review
   */
  @Patch('ownership-requests/:id/review')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleCode.ADMIN)
  async reviewSpaceOwnershipRequest(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: ReviewSpaceOwnershipRequestDto,
  ) {
    return this.spacesService.reviewSpaceOwnershipRequest(id, user.id, dto);
  }

  /**
   * Submit a sub-space request (authenticated users)
   * POST /spaces/sub-space-requests
   */
  @Post('sub-space-requests')
  @UseGuards(JwtAuthGuard)
  async createSubSpaceRequest(
    @CurrentUser() user: User,
    @Body() dto: CreateSubSpaceRequestDto,
  ) {
    return this.spacesService.createSubSpaceRequest(user.id, dto);
  }

  /**
   * Get the current user's sub-space requests
   * GET /spaces/sub-space-requests/mine
   */
  @Get('sub-space-requests/mine')
  @UseGuards(JwtAuthGuard)
  async getMySubSpaceRequests(@CurrentUser() user: User) {
    return this.spacesService.getMySubSpaceRequests(user.id);
  }

  /**
   * Get all sub-space requests (ADMIN only)
   * GET /spaces/sub-space-requests?status=PENDING
   */
  @Get('sub-space-requests')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleCode.ADMIN)
  async getAllSubSpaceRequests(
    @Query('status') status?: string,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
  ) {
    return this.spacesService.getAllSubSpaceRequests(status, +page, +limit);
  }

  /**
   * Review (approve/reject) a sub-space request (ADMIN only)
   * PATCH /spaces/sub-space-requests/:id/review
   */
  @Patch('sub-space-requests/:id/review')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleCode.ADMIN)
  async reviewSubSpaceRequest(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: ReviewSubSpaceRequestDto,
  ) {
    return this.spacesService.reviewSubSpaceRequest(id, user.id, dto);
  }

  /**
   * Get space by ID (PUBLIC - for mobile view)
   * GET /spaces/:id
   */
  @Get(':id')
  // Verified optional auth — the old inline jwt.decode() trusted unsigned
  // tokens, so anyone could claim any userId here.
  @UseGuards(OptionalJwtAuthGuard)
  async getSpaceById(@Request() req, @Param('id') id: string) {
    return this.spacesService.getSpaceById(id, req.user?.id);
  }

  /**
   * Top 8 banner colours by pixel share (mobile space page background), most
   * frequent first. Same visibility gate as GET /spaces/:id.
   * GET /spaces/:id/palette
   */
  @Get(':id/palette')
  @UseGuards(OptionalJwtAuthGuard)
  async getSpacePalette(@Request() req, @Param('id') id: string) {
    const bannerUrl = await this.spacesService.getSpaceBannerUrl(id, req.user?.id);
    return { colors: await this.bannerPalette.forUrl(bannerUrl) };
  }

  /**
   * What the caller may do here (T3): their space/event role, effective
   * capabilities (per-space overrides and inheritance applied) and the space's
   * plan. Pass `eventId` for that event's capabilities too. Any member of the
   * space or the event; 403 for everyone else.
   * GET /spaces/:id/access?eventId=
   */
  @Get(':id/access')
  @UseGuards(JwtAuthGuard)
  async getAccess(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Query('eventId') eventId?: string,
  ) {
    const access = await this.authz.accessIn(user, id, eventId || undefined);
    if (!access.spaceRole && !access.eventRole && access.capabilities.length === 0) {
      throw new ForbiddenException('You are not a member of this space');
    }
    return { ...access, plan: await this.spacesService.getPlanAccess(id) };
  }

  /**
   * Aggregated analytics for a space and its whole sub-space subtree.
   * Space Admins of the space (or platform admins) only.
   * GET /spaces/:id/analytics
   */
  @Get(':id/analytics')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.SPACE_VIEW)
  async getSubspaceAnalytics(@Param('id') id: string) {
    return this.spacesService.getSubspaceAnalytics(id);
  }

  /**
   * Join a space (Authenticated users)
   * POST /spaces/:id/join
   */
  @Post(':id/join')
  @UseGuards(JwtAuthGuard)
  async joinSpace(
    @Param('id') id: string,
    @CurrentUser() user: User,
  ) {
    return this.spacesService.joinSpace(id, user.id);
  }

  /**
   * Leave a space (Authenticated users)
   * POST /spaces/:id/leave
   */
  @Post(':id/leave')
  @UseGuards(JwtAuthGuard)
  async leaveSpace(
    @Param('id') id: string,
    @CurrentUser() user: User,
  ) {
    return this.spacesService.leaveSpace(id, user.id);
  }

  /**
   * Update space (ADMIN only)
   * PATCH /spaces/:id
   */
  @Patch(':id')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.SPACE_MANAGE_SETTINGS)
  async updateSpace(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: UpdateSpaceDto,
  ) {
    return this.spacesService.updateSpace(id, dto, user.id);
  }

  /**
   * Update space status (ADMIN only)
   * PATCH /spaces/:id/status
   */
  @Patch(':id/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleCode.ADMIN)
  async updateSpaceStatus(
    @Param('id') id: string,
    @Body() dto: UpdateSpaceStatusDto,
    @CurrentUser() user: User,
  ) {
    return this.spacesService.updateSpaceStatus(id, dto, user.id);
  }

  /**
   * Verify / un-verify a space (ADMIN only)
   * PATCH /spaces/:id/verification { verified: boolean }
   */
  @Patch(':id/verification')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleCode.ADMIN)
  async setSpaceVerification(
    @Param('id') id: string,
    @Body() dto: SetSpaceVerificationDto,
    @CurrentUser() user: User,
  ) {
    return this.spacesService.setSpaceVerification(id, dto.verified, user.id);
  }

  /**
   * Delete space (ADMIN only)
   * DELETE /spaces/:id
   */
  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleCode.ADMIN)
  async deleteSpace(@Param('id') id: string) {
    return this.spacesService.deleteSpace(id);
  }

  /**
   * Upload space logo. Allowed for platform admins and the space's own
   * Space Admin (same access as PATCH /spaces/:id).
   * POST /spaces/:id/logo
   */
  @Post(':id/logo')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.SPACE_MANAGE_SETTINGS)
  @UseInterceptors(FileInterceptor('logo', uploadLimit(2)))
  async uploadLogo(
    @Param('id') id: string,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 2 * 1024 * 1024 }), // 2MB
          new FileTypeValidator({ fileType: /(jpg|jpeg|png|webp)$/ }),
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    return this.spacesService.uploadLogo(id, file);
  }

  /**
   * Upload space banner. Allowed for platform admins and the space's own
   * Space Admin (same access as PATCH /spaces/:id).
   * POST /spaces/:id/banner
   */
  @Post(':id/banner')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.SPACE_MANAGE_SETTINGS)
  @UseInterceptors(FileInterceptor('banner', uploadLimit(5)))
  async uploadBanner(
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
    return this.spacesService.uploadBanner(id, file);
  }

  /**
   * Get space members with pagination and search.
   * Accessible by platform admins and the space's Space Admins.
   * GET /spaces/:id/members?page=1&limit=20&search=&role=MEMBER
   */
  @Get(':id/members')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.SPACE_MANAGE_MEMBERS)
  async getSpaceMembers(
    @Param('id') id: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('role') role?: RoleCode,
  ) {
    return this.spacesService.getSpaceMembers(id, {
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
      search,
      roleCode: role,
    });
  }

  /**
   * Search users who can be added to a space (excludes current members).
   * GET /spaces/:id/member-search?q=jane
   */
  @Get(':id/member-search')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.SPACE_MANAGE_MEMBERS)
  async searchAddableUsers(
    @Param('id') id: string,
    @Query('q') q?: string,
  ) {
    return this.spacesService.searchAddableUsers(id, q);
  }

  /**
   * Add a member to a space with a given role.
   * Platform admins and Space Admins may assign any manageable space role.
   * POST /spaces/:id/members
   */
  @Post(':id/members')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.SPACE_MANAGE_MEMBERS)
  async addSpaceMember(
    @Param('id') id: string,
    @Body() dto: AddSpaceMemberDto,
    @CurrentUser() user: User,
  ) {
    return this.spacesService.addSpaceMember(id, user.id, dto.userId, dto.role);
  }

  /**
   * Update a member's role within a space.
   * PATCH /spaces/:id/members/:userRoleId
   */
  @Patch(':id/members/:userRoleId')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.SPACE_MANAGE_MEMBERS)
  async updateSpaceMemberRole(
    @Param('id') id: string,
    @Param('userRoleId') userRoleId: string,
    @Body() dto: UpdateSpaceMemberRoleDto,
    @CurrentUser() user: User,
  ) {
    return this.spacesService.updateSpaceMemberRole(
      id,
      userRoleId,
      user.id,
      dto.role,
    );
  }

  /**
   * Remove a member from a space.
   * DELETE /spaces/:id/members/:userRoleId
   */
  @Delete(':id/members/:userRoleId')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.SPACE_MANAGE_MEMBERS)
  async removeSpaceMember(
    @Param('id') id: string,
    @Param('userRoleId') userRoleId: string,
    @CurrentUser() user: User,
  ) {
    return this.spacesService.removeSpaceMember(id, userRoleId, user.id);
  }
  /**
   * Submit a space request (authenticated users)
   * POST /spaces/request
   */
  @Post('request')
  @UseGuards(JwtAuthGuard)
  async createSpaceRequest(
    @Body() dto: CreateSpaceRequestDto,
    @CurrentUser() user: User,
  ) {
    return this.spacesService.createSpaceRequest(user.id, dto);
  }
}

