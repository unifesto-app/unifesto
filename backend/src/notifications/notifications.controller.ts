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
import { RegisterPushDeviceDto } from './dto/push-device.dto';
import {
  CreateOrganiserAnnouncementDto,
  CreatePushBroadcastDto,
  ListPushCampaignsQueryDto,
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
  register(@CurrentUser() user: User, @Body() dto: RegisterPushDeviceDto) {
    return this.devices.register(user.id, dto);
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
