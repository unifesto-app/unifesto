import {
  Body,
  Controller,
  DefaultValuePipe,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { RoleCode } from '@prisma/client';
import type { User } from '@prisma/client';
import { Action } from '../auth/authorization/actions';
import { Can } from '../auth/authorization/can.decorator';
import { CanGuard } from '../auth/authorization/can.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { EventsService } from '../events/events.service';
import { PrismaService } from '../prisma/prisma.service';
import { CampaignOwner, CampaignsService } from './campaigns.service';
import { CampaignCountDto, CreateCampaignDto, DraftCampaignDto, TestCampaignDto } from './dto/campaign.dto';

const PLATFORM: CampaignOwner = { scope: 'PLATFORM' };

/** Apex: one campaign over push, in-app, email and WhatsApp (C17). */
@Controller('admin/campaigns')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleCode.ADMIN)
export class AdminCampaignsController {
  constructor(private readonly campaigns: CampaignsService) {}

  @Post()
  create(@CurrentUser() user: User, @Body() dto: CreateCampaignDto) {
    return this.campaigns.create(PLATFORM, user.id, dto);
  }

  /** Who each chosen channel would reach now, after its opt-outs. */
  @Post('audience')
  count(@Body() dto: CampaignCountDto) {
    return this.campaigns.count(PLATFORM, dto);
  }

  /** Write with AI: words for the composer from one line. Sends nothing. */
  @Post('draft')
  @Throttle({ default: { limit: 5, ttl: 60_000 } }) // AI9 burst limit
  draft(@CurrentUser() user: User, @Body() dto: DraftCampaignDto) {
    return this.campaigns.draft(PLATFORM, user.id, dto);
  }

  /** Each chosen channel to the signed-in admin only. */
  @Post('test')
  test(@CurrentUser() user: User, @Body() dto: TestCampaignDto) {
    return this.campaigns.sendTest(PLATFORM, user.id, dto);
  }

  @Get()
  list(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.campaigns.list(PLATFORM, page, limit);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.campaigns.get(PLATFORM, id);
  }

  @Post(':id/cancel')
  cancel(@Param('id', ParseUUIDPipe) id: string) {
    return this.campaigns.cancel(PLATFORM, id);
  }
}

/**
 * A space's campaigns (console): to its members, its events' attendees and
 * waitlists, or people in it. Gated by `space:manage-email`, like space email.
 */
@UseGuards(JwtAuthGuard, CanGuard)
@Controller('spaces/:spaceId/campaigns')
export class SpaceCampaignsController {
  constructor(private readonly campaigns: CampaignsService) {}

  @Post()
  @Can(Action.SPACE_MANAGE_EMAIL)
  create(@Param('spaceId', ParseUUIDPipe) spaceId: string, @CurrentUser() user: User, @Body() dto: CreateCampaignDto) {
    return this.campaigns.create({ scope: 'SPACE', spaceId }, user.id, dto);
  }

  @Post('audience')
  @Can(Action.SPACE_MANAGE_EMAIL)
  count(@Param('spaceId', ParseUUIDPipe) spaceId: string, @Body() dto: CampaignCountDto) {
    return this.campaigns.count({ scope: 'SPACE', spaceId }, dto);
  }

  @Post('test')
  @Can(Action.SPACE_MANAGE_EMAIL)
  test(@Param('spaceId', ParseUUIDPipe) spaceId: string, @CurrentUser() user: User, @Body() dto: TestCampaignDto) {
    return this.campaigns.sendTest({ scope: 'SPACE', spaceId }, user.id, dto);
  }

  /** Write with AI: words for the composer from one line. Sends nothing. */
  @Post('draft')
  @Can(Action.SPACE_MANAGE_EMAIL)
  @Throttle({ default: { limit: 5, ttl: 60_000 } }) // AI9 burst limit
  draft(@Param('spaceId', ParseUUIDPipe) spaceId: string, @CurrentUser() user: User, @Body() dto: DraftCampaignDto) {
    return this.campaigns.draft({ scope: 'SPACE', spaceId }, user.id, dto);
  }

  @Get()
  @Can(Action.SPACE_MANAGE_EMAIL)
  list(
    @Param('spaceId', ParseUUIDPipe) spaceId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.campaigns.list({ scope: 'SPACE', spaceId }, page, limit);
  }

  @Post(':id/cancel')
  @Can(Action.SPACE_MANAGE_EMAIL)
  cancel(@Param('spaceId', ParseUUIDPipe) spaceId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.campaigns.cancel({ scope: 'SPACE', spaceId }, id);
  }
}

/**
 * An event's campaigns, from the console's Announce dialog: to its attendees
 * or waitlist. Whoever may manage the event may send (as announcements were).
 */
@UseGuards(JwtAuthGuard)
@Controller('events/:eventId/campaigns')
export class EventCampaignsController {
  constructor(
    private readonly campaigns: CampaignsService,
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
  ) {}

  private async owner(userId: string, eventId: string): Promise<CampaignOwner> {
    const event = await this.prisma.event.findUnique({ where: { id: eventId }, select: { spaceId: true } });
    if (!event) throw new NotFoundException('Event not found');
    if (!(await this.events.canManageEvent(userId, event.spaceId, eventId))) {
      throw new ForbiddenException('You cannot send to this event');
    }
    return { scope: 'EVENT', spaceId: event.spaceId, eventId };
  }

  @Post()
  async create(@Param('eventId', ParseUUIDPipe) eventId: string, @CurrentUser() user: User, @Body() dto: CreateCampaignDto) {
    return this.campaigns.create(await this.owner(user.id, eventId), user.id, dto);
  }

  @Post('audience')
  async count(@Param('eventId', ParseUUIDPipe) eventId: string, @CurrentUser() user: User, @Body() dto: CampaignCountDto) {
    return this.campaigns.count(await this.owner(user.id, eventId), dto);
  }

  @Post('test')
  async test(@Param('eventId', ParseUUIDPipe) eventId: string, @CurrentUser() user: User, @Body() dto: TestCampaignDto) {
    return this.campaigns.sendTest(await this.owner(user.id, eventId), user.id, dto);
  }
}
