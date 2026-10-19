import { AuthModule } from '../auth/auth.module';
import { Module } from '@nestjs/common';
import { EventsService } from './events.service';
import { EventsController } from './events.controller';
import { EventSchedulerService } from './event-scheduler.service';
import { RecurrenceService } from './recurrence/recurrence.service';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { SubscriptionModule } from '../subscription/subscription.module';
import { CacheModule } from '../cache/cache.module';
import { EmailModule } from '../email/email.module';
import { BannerPaletteModule } from '../banner-palette/banner-palette.module';
import { AiModule } from '../ai/ai.module';
import { EventDraftService } from './event-draft';

@Module({
  imports: [
    AuthModule,
    PrismaModule,
    StorageModule,
    SubscriptionModule,
    CacheModule,
    EmailModule,
    BannerPaletteModule,
    AiModule,
  ],
  controllers: [EventsController],
  providers: [EventsService, EventSchedulerService, RecurrenceService, EventDraftService],
  exports: [EventsService, RecurrenceService],
})
export class EventsModule {}
