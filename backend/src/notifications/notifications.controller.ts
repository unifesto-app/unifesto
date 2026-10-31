import {
  Body,
  Controller,
  Delete,
  Get,
  Put,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { RoleCode } from '@prisma/client';
import type { User } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PushCampaignService } from './push-campaign.service';
import { PushDeviceService } from './push-device.service';
import { UserNotificationsService } from './user-notifications.service';
import { RegisterPushDeviceDto } from './dto/push-device.dto';
import {
  ListUserNotificationsQueryDto,
  MarkNotificationsReadDto,
  NotificationScopeQueryDto,
} from './dto/user-notifications.dto';
import {
  CreateOrganiserAnnouncementDto,
  CreatePushBroadcastDto,
  ListPushCampaignsQueryDto,
  PushAudienceDto,
  PushTestDto,
} from './dto/push-campaign.dto';

/** Admin push-campaign console (broadcasts). */
@Controller('admin/push/campaigns')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleCode.ADMIN)
export class AdminPushController {
  constructor(private readonly campaigns: PushCampaignService) {}

  @Post()
  create(@CurrentUser() user: User, @Body() dto: CreatePushBroadcastDto) {
    return this.campaigns.createBroadcast(user.id, dto);
  }

  /** How many people this target would reach now (for the confirm step). */
  @Post('audience')
  audience(@Body() dto: PushAudienceDto) {
    return this.campaigns.countAudience(dto.target, dto.category);
  }

  /** Send the draft to the signed-in admin's own devices. */
  @Post('test')
  test(@CurrentUser() user: User, @Body() dto: PushTestDto) {
    return this.campaigns.sendTest(user.id, dto);
  }

  @Get()
  list(@Query() query: ListPushCampaignsQueryDto) {
    return this.campaigns.list(query.page ?? 1, query.limit ?? 20, query.status);
  }

  @Get(':id')
  getById(@Param('id', ParseUUIDPipe) id: string) {
    return this.campaigns.getById(id);
  }

  @Post(':id/send')
  sendNow(@Param('id', ParseUUIDPipe) id: string) {
    return this.campaigns.sendNow(id);
  }

  @Post(':id/cancel')
  cancel(@Param('id', ParseUUIDPipe) id: string) {
    return this.campaigns.cancel(id);
  }

  /** Remove a broadcast (and its delivery logs) from the history. */
  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.campaigns.remove(id);
  }
}

/** Organiser-to-attendee announcements (scoped to events they manage). */
@Controller('events/:eventId/announcements')
@UseGuards(JwtAuthGuard)
export class OrganiserAnnouncementController {
  constructor(private readonly campaigns: PushCampaignService) {}

  @Post()
  announce(
    @CurrentUser() user: User,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: CreateOrganiserAnnouncementDto,
  ) {
    return this.campaigns.createOrganiserAnnouncement(user.id, eventId, dto);
  }
}

/**
 * The signed-in user's push devices (OneSignal subscriptions). The app calls PUT
 * after sign-in / session restore / subscription change and DELETE on sign-out.
 */
@Controller('users/me/push-devices')
@UseGuards(JwtAuthGuard)
export class PushDeviceController {
  constructor(private readonly devices: PushDeviceService) {}

  @Put()
  register(
    @CurrentUser() user: User,
    @Body() dto: RegisterPushDeviceDto,
    @Req() req: { sessionId?: string },
  ) {
    return this.devices.register(user.id, dto, req.sessionId);
  }

  @Get()
  list(@CurrentUser() user: User) {
    return this.devices.listMine(user.id);
  }

  @Delete(':subscriptionId')
  unregister(@CurrentUser() user: User, @Param('subscriptionId') subscriptionId: string) {
    return this.devices.unregister(user.id, subscriptionId);
  }
}

/**
 * The signed-in user's in-app notification feed: the copy of each push that
 * was sent with `inbox`, kept even when push is off.
 */
@Controller('users/me/notifications')
@UseGuards(JwtAuthGuard)
export class UserNotificationsController {
  constructor(private readonly feed: UserNotificationsService) {}

  @Get()
  list(@CurrentUser() user: User, @Query() query: ListUserNotificationsQueryDto) {
    return this.feed.list(user.id, query);
  }

  @Get('unread-count')
  unreadCount(@CurrentUser() user: User, @Query() query: NotificationScopeQueryDto) {
    return this.feed.unreadCount(user.id, query);
  }

  @Post('read')
  markRead(@CurrentUser() user: User, @Body() dto: MarkNotificationsReadDto) {
    return this.feed.markRead(user.id, dto);
  }
}
