import {
  Body,
  Controller,
  Delete,
  FileTypeValidator,
  Get,
  MaxFileSizeValidator,
  Param,
  ParseUUIDPipe,
  ParseFilePipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { uploadLimit } from '../common/upload-limits';
import { Action } from '../auth/authorization/actions';
import { Can } from '../auth/authorization/can.decorator';
import { CanGuard } from '../auth/authorization/can.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { User } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SponsorsService } from './sponsors.service';
import {
  AttachSponsorDto,
  CreateSponsorDto,
  CreateSponsorTierDto,
  InviteSponsorUserDto,
  UpdateEventSponsorDto,
  UpdateSponsorDto,
  UpdateSponsorTierDto,
} from './dto/sponsor.dto';

/**
 * Space-scoped sponsor management (P1): the roster, the tier ladder and event
 * attachments. Every route is gated by `space:manage-sponsors` on the `:spaceId`
 * in the path (Space Admin + Curator hold it; a Platform Admin passes via the
 * inheritance superuser rule). The service enforces that every sponsor / tier /
 * event actually belongs to that space.
 *
 * Route order matters: the literal `tiers` and `events` segments are declared
 * before the `:sponsorId` param routes so they are not swallowed by it.
 */
@UseGuards(JwtAuthGuard, CanGuard)
@Controller('spaces/:spaceId/sponsors')
export class SponsorsController {
  constructor(private readonly sponsors: SponsorsService) {}

  // ---- Logo upload --------------------------------------------------------

  /**
   * POST /spaces/:spaceId/sponsors/logo — multipart `logo`, returns
   * `{ logoUrl }` to put on a sponsor. Same 2 MB image rule as space logos.
   */
  @Post('logo')
  @Can(Action.SPACE_MANAGE_SPONSORS)
  @UseInterceptors(FileInterceptor('logo', uploadLimit(2)))
  uploadLogo(
    @Param('spaceId', ParseUUIDPipe) spaceId: string,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 2 * 1024 * 1024 }),
          new FileTypeValidator({ fileType: /(jpg|jpeg|png|webp)$/ }),
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    return this.sponsors.uploadLogo(spaceId, file);
  }

  // ---- Tiers --------------------------------------------------------------

  @Get('tiers')
  @Can(Action.SPACE_MANAGE_SPONSORS)
  listTiers(@Param('spaceId', ParseUUIDPipe) spaceId: string) {
    return this.sponsors.listTiers(spaceId);
  }

  @Post('tiers')
  @Can(Action.SPACE_MANAGE_SPONSORS)
  createTier(
    @Param('spaceId', ParseUUIDPipe) spaceId: string,
    @Body() dto: CreateSponsorTierDto,
  ) {
    return this.sponsors.createTier(spaceId, dto);
  }

  @Patch('tiers/:id')
  @Can(Action.SPACE_MANAGE_SPONSORS)
  updateTier(
    @Param('spaceId', ParseUUIDPipe) spaceId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSponsorTierDto,
  ) {
    return this.sponsors.updateTier(spaceId, id, dto);
  }

  @Delete('tiers/:id')
  @Can(Action.SPACE_MANAGE_SPONSORS)
  deleteTier(@Param('spaceId', ParseUUIDPipe) spaceId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.sponsors.deleteTier(spaceId, id);
  }

  // ---- Event attachments --------------------------------------------------

  @Get('events/:eventId')
  @Can(Action.SPACE_MANAGE_SPONSORS)
  listEventSponsors(
    @Param('spaceId', ParseUUIDPipe) spaceId: string,
    @Param('eventId', ParseUUIDPipe) eventId: string,
  ) {
    return this.sponsors.listEventSponsors(spaceId, eventId);
  }

  @Get('events/:eventId/leads')
  @Can(Action.SPACE_MANAGE_SPONSORS)
  listEventLeads(
    @Param('spaceId', ParseUUIDPipe) spaceId: string,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Query('eventSponsorId') eventSponsorId?: string,
  ) {
    return this.sponsors.listEventLeads(spaceId, eventId, eventSponsorId);
  }

  @Post('events/:eventId')
  @Can(Action.SPACE_MANAGE_SPONSORS)
  attachSponsor(
    @Param('spaceId', ParseUUIDPipe) spaceId: string,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: AttachSponsorDto,
  ) {
    return this.sponsors.attachSponsor(spaceId, eventId, dto);
  }

  @Patch('events/:eventId/:eventSponsorId')
  @Can(Action.SPACE_MANAGE_SPONSORS)
  updateEventSponsor(
    @Param('spaceId', ParseUUIDPipe) spaceId: string,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('eventSponsorId', ParseUUIDPipe) eventSponsorId: string,
    @Body() dto: UpdateEventSponsorDto,
  ) {
    return this.sponsors.updateEventSponsor(
      spaceId,
      eventId,
      eventSponsorId,
      dto,
    );
  }

  @Delete('events/:eventId/:eventSponsorId')
  @Can(Action.SPACE_MANAGE_SPONSORS)
  detachSponsor(
    @Param('spaceId', ParseUUIDPipe) spaceId: string,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('eventSponsorId', ParseUUIDPipe) eventSponsorId: string,
  ) {
    return this.sponsors.detachSponsor(spaceId, eventId, eventSponsorId);
  }

  // ---- Roster sponsors ----------------------------------------------------

  @Get()
  @Can(Action.SPACE_MANAGE_SPONSORS)
  listSponsors(@Param('spaceId', ParseUUIDPipe) spaceId: string) {
    return this.sponsors.listSponsors(spaceId);
  }

  @Post()
  @Can(Action.SPACE_MANAGE_SPONSORS)
  createSponsor(
    @Param('spaceId', ParseUUIDPipe) spaceId: string,
    @Body() dto: CreateSponsorDto,
  ) {
    return this.sponsors.createSponsor(spaceId, dto);
  }

  @Get(':sponsorId')
  @Can(Action.SPACE_MANAGE_SPONSORS)
  getSponsor(
    @Param('spaceId', ParseUUIDPipe) spaceId: string,
    @Param('sponsorId', ParseUUIDPipe) sponsorId: string,
  ) {
    return this.sponsors.getSponsor(spaceId, sponsorId);
  }

  @Get(':sponsorId/leads')
  @Can(Action.SPACE_MANAGE_SPONSORS)
  listSponsorLeads(
    @Param('spaceId', ParseUUIDPipe) spaceId: string,
    @Param('sponsorId', ParseUUIDPipe) sponsorId: string,
  ) {
    return this.sponsors.listSponsorLeads(spaceId, sponsorId);
  }

  // ---- Sponsor portal access (invite the sponsor's people) ----------------

  @Get(':sponsorId/users')
  @Can(Action.SPACE_MANAGE_SPONSORS)
  listSponsorUsers(
    @Param('spaceId', ParseUUIDPipe) spaceId: string,
    @Param('sponsorId', ParseUUIDPipe) sponsorId: string,
  ) {
    return this.sponsors.listSponsorUsers(spaceId, sponsorId);
  }

  @Post(':sponsorId/users')
  @Can(Action.SPACE_MANAGE_SPONSORS)
  inviteSponsorUser(
    @Param('spaceId', ParseUUIDPipe) spaceId: string,
    @Param('sponsorId', ParseUUIDPipe) sponsorId: string,
    @CurrentUser() user: User,
    @Body() dto: InviteSponsorUserDto,
  ) {
    return this.sponsors.inviteSponsorUser(spaceId, sponsorId, dto.email, user.id);
  }

  @Delete(':sponsorId/users/:sponsorUserId')
  @Can(Action.SPACE_MANAGE_SPONSORS)
  revokeSponsorUser(
    @Param('spaceId', ParseUUIDPipe) spaceId: string,
    @Param('sponsorId', ParseUUIDPipe) sponsorId: string,
    @Param('sponsorUserId', ParseUUIDPipe) sponsorUserId: string,
  ) {
    return this.sponsors.revokeSponsorUser(spaceId, sponsorId, sponsorUserId);
  }

  @Patch(':sponsorId')
  @Can(Action.SPACE_MANAGE_SPONSORS)
  updateSponsor(
    @Param('spaceId', ParseUUIDPipe) spaceId: string,
    @Param('sponsorId', ParseUUIDPipe) sponsorId: string,
    @Body() dto: UpdateSponsorDto,
  ) {
    return this.sponsors.updateSponsor(spaceId, sponsorId, dto);
  }

  @Delete(':sponsorId')
  @Can(Action.SPACE_MANAGE_SPONSORS)
  deleteSponsor(
    @Param('spaceId', ParseUUIDPipe) spaceId: string,
    @Param('sponsorId', ParseUUIDPipe) sponsorId: string,
  ) {
    return this.sponsors.deleteSponsor(spaceId, sponsorId);
  }
}
