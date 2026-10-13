import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  FileTypeValidator,
  Get,
  MaxFileSizeValidator,
  Param,
  ParseFilePipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { SkipThrottle } from '@nestjs/throttler';
import { uploadLimit } from '../common/upload-limits';
import { RoleCode } from '@prisma/client';
import type { User } from '@prisma/client';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { Roles, CurrentUser } from '../auth/decorators';
import { Action, Can, CanGuard } from '../auth/authorization';
import { WhiteLabelService } from './white-label.service';
import {
  AddEmailDomainDto,
  AddWebDomainDto,
  AdminApplyBrandingDto,
  SuspendBrandingDto,
  CreateWhiteLabelRequestDto,
  ReviewWhiteLabelRequestDto,
  UpdateBrandingDto,
} from './dto';

@Controller('white-label')
export class WhiteLabelController {
  constructor(private readonly whiteLabel: WhiteLabelService) {}

  /** Legacy (shipped mobile builds): now turns branding on immediately. */
  @Post('requests')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.SPACE_MANAGE_SETTINGS, { source: 'body', spaceKey: 'spaceId' })
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

  /** Branding studio: the space theme, whether it is live, event overrides. */
  @Get('spaces/:spaceId')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.SPACE_MANAGE_SETTINGS)
  async spaceOverview(@Param('spaceId') spaceId: string) {
    return this.whiteLabel.getSpaceOverview(spaceId);
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

  /** Curator edits the space theme (plan-gated, no approval). */
  @Patch('spaces/:spaceId/branding')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.SPACE_MANAGE_SETTINGS)
  async updateSpaceBranding(
    @Param('spaceId') spaceId: string,
    @Body() dto: UpdateBrandingDto,
  ) {
    return this.whiteLabel.updateBranding({ spaceId }, dto);
  }

  /** Brand wordmark (`kind=logo`) or favicon upload, multipart field `file`. */
  @Post('spaces/:spaceId/assets/:kind')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.SPACE_MANAGE_SETTINGS)
  @UseInterceptors(FileInterceptor('file', uploadLimit(1)))
  async uploadAsset(
    @Param('spaceId') spaceId: string,
    @Param('kind') kind: string,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 1024 * 1024 }),
          new FileTypeValidator({ fileType: /(png|jpeg|jpg|webp|x-icon|vnd\.microsoft\.icon)$/ }),
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    if (kind !== 'logo' && kind !== 'favicon') {
      throw new BadRequestException('kind must be logo or favicon');
    }
    return this.whiteLabel.uploadAsset(spaceId, kind, file);
  }

  /** The space's custom domains (email sending, later web). */
  @Get('spaces/:spaceId/domains')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.SPACE_MANAGE_SETTINGS)
  async domains(@Param('spaceId') spaceId: string) {
    return this.whiteLabel.getDomains(spaceId);
  }

  /** Start verifying a sending domain; returns the DNS records to add. */
  @Post('spaces/:spaceId/domains/email')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.SPACE_MANAGE_SETTINGS)
  async addEmailDomain(@Param('spaceId') spaceId: string, @Body() dto: AddEmailDomainDto) {
    return this.whiteLabel.addEmailDomain(spaceId, dto.hostname, dto.localPart);
  }

  @Post('spaces/:spaceId/domains/email/verify')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.SPACE_MANAGE_SETTINGS)
  async verifyEmailDomain(@Param('spaceId') spaceId: string) {
    return this.whiteLabel.verifyEmailDomain(spaceId);
  }

  @Delete('spaces/:spaceId/domains/email')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.SPACE_MANAGE_SETTINGS)
  async removeEmailDomain(@Param('spaceId') spaceId: string) {
    return this.whiteLabel.removeEmailDomain(spaceId);
  }

  @Post('spaces/:spaceId/domains/web')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.SPACE_MANAGE_SETTINGS)
  async addWebDomain(@Param('spaceId') spaceId: string, @Body() dto: AddWebDomainDto) {
    return this.whiteLabel.addWebDomain(spaceId, dto.hostname);
  }

  @Post('spaces/:spaceId/domains/web/verify')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.SPACE_MANAGE_SETTINGS)
  async verifyWebDomain(@Param('spaceId') spaceId: string) {
    return this.whiteLabel.verifyWebDomain(spaceId);
  }

  @Delete('spaces/:spaceId/domains/web')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.SPACE_MANAGE_SETTINGS)
  async removeWebDomain(@Param('spaceId') spaceId: string) {
    return this.whiteLabel.removeWebDomain(spaceId);
  }

  /**
   * Public, for the web middleware: which space a custom hostname serves.
   * Unthrottled: every custom-host page load asks (web caches it for a minute)
   * and the calls all come from the web container's IP.
   */
  @Get('domains/resolve')
  @SkipThrottle()
  async resolveHost(@Query('host') host = '') {
    return this.whiteLabel.resolveHost(host);
  }

  /** Curator sets or clears an event's accent override. */
  @Patch('events/:eventId/branding')
  @UseGuards(JwtAuthGuard, CanGuard)
  @Can(Action.EVENT_EDIT)
  async updateEventBranding(
    @Param('eventId') eventId: string,
    @Body() dto: UpdateBrandingDto,
  ) {
    return this.whiteLabel.updateBranding({ eventId }, dto);
  }

  /** Platform kill switch for a space's branding. */
  @Patch('admin/spaces/:spaceId/suspend')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleCode.ADMIN)
  async suspend(
    @Param('spaceId') spaceId: string,
    @Body() dto: SuspendBrandingDto,
  ) {
    return this.whiteLabel.setSuspended(spaceId, dto.suspended);
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
