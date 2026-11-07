import { AiModule } from '../ai/ai.module';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EventsModule } from '../events/events.module';
import { EmailModule } from '../email/email.module';
import { NotifyService } from './notify.service';
import { OneSignalService } from './onesignal.service';
import { NotificationsService } from './notifications.service';
import { PushCampaignService } from './push-campaign.service';
import { PushSchedulerService } from './push-scheduler.service';
import { PushDeviceService } from './push-device.service';
import { PushSender } from './push-sender';
import { NotificationsGateway } from './notifications.gateway';
import { TransactionalNotificationHandler } from './handlers/transactional-notification.handler';
import { NotificationFanoutQueue } from './notification-fanout.queue';
import { UserNotificationsService } from './user-notifications.service';
import {
  AdminPushController,
  OrganiserAnnouncementController,
  PushDeviceController,
  UserNotificationsController,
} from './notifications.controller';

/**
 * Server-side push platform. Owns the APNs/FCM sender and the OneSignal REST
 * client (old builds), the pref-aware send path, campaign management +
 * scheduler, and the transactional event-bus handlers.
 *
 * Imports EventsModule (organiser scoped-auth via canManageEvent). It is
 * one-directional — that module emits via EventEmitter2 and never imports this
 * one, so there's no cycle. Prisma/Redis come from their global modules.
 * EmailModule (for NotifyService) imports neither this module nor anything
 * that does, so it's cycle-free too.
 */
@Module({
  imports: [AuthModule, EventsModule, EmailModule, AiModule],
  controllers: [
    AdminPushController,
    OrganiserAnnouncementController,
    PushDeviceController,
    UserNotificationsController,
  ],
  providers: [
    OneSignalService,
    PushSender,
    NotificationsGateway,
    NotificationsService,
    PushCampaignService,
    PushSchedulerService,
    PushDeviceService,
    TransactionalNotificationHandler,
    NotificationFanoutQueue,
    UserNotificationsService,
    NotifyService,
  ],
  exports: [NotificationsService, OneSignalService, UserNotificationsService, NotifyService],
})
export class NotificationsModule {}
