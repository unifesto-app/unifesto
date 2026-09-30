import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EventsModule } from '../events/events.module';
import { OneSignalService } from './onesignal.service';
import { NotificationsService } from './notifications.service';
import { PushCampaignService } from './push-campaign.service';
import { PushSchedulerService } from './push-scheduler.service';
import { PushDeviceService } from './push-device.service';
import { TransactionalNotificationHandler } from './handlers/transactional-notification.handler';
import { UserNotificationsService } from './user-notifications.service';
import {
  AdminPushController,
  OrganiserAnnouncementController,
  PushDeviceController,
  UserNotificationsController,
} from './notifications.controller';

/**
 * Server-side push platform. Owns the OneSignal REST client, the pref-aware send
 * path, campaign management + scheduler, and the transactional event-bus
 * handlers.
 *
 * Imports EventsModule (organiser scoped-auth via canManageEvent). It is
 * one-directional — that module emits via EventEmitter2 and never imports this
 * one, so there's no cycle. Prisma/Redis come from their global modules.
 */
@Module({
  imports: [AuthModule, EventsModule],
  controllers: [
    AdminPushController,
    OrganiserAnnouncementController,
    PushDeviceController,
    UserNotificationsController,
  ],
  providers: [
    OneSignalService,
    NotificationsService,
    PushCampaignService,
    PushSchedulerService,
    PushDeviceService,
    TransactionalNotificationHandler,
    UserNotificationsService,
  ],
  exports: [NotificationsService, OneSignalService, UserNotificationsService],
})
export class NotificationsModule {}
