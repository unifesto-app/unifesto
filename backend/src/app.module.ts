import { Module, Logger } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerModule } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { APP_GUARD } from '@nestjs/core';
import { UserAwareThrottlerGuard } from './common/guards/user-aware-throttler.guard';
import { CategoriesModule } from './categories/categories.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from './config/config.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { IamModule } from './iam/iam.module';
import { UsersModule } from './users/users.module';
import { RolesModule } from './roles/roles.module';
import { SpacesModule } from './spaces/spaces.module';
import { DiscussionsModule } from './discussions/discussions.module';
import { StorageModule } from './storage/storage.module';
import { RedisModule } from './redis/redis.module';
import { RedisService } from './redis/redis.service';
import { AdminModule } from './admin/admin.module';
import { AwsModule } from './aws/aws.module';
import { SubscriptionModule } from './subscription/subscription.module';
import { EventsModule } from './events/events.module';
import { RegistrationsModule } from './registrations/registrations.module';
import { SessionsModule } from './sessions/sessions.module';
import { FavoritesModule } from './favorites/favorites.module';
import { CheckinModule } from './checkin/checkin.module';
import { PayoutsModule } from './payouts/payouts.module';
import { ReconciliationModule } from './reconciliation/reconciliation.module';
import { RefundsModule } from './refunds/refunds.module';
import { WhatsAppModule } from './whatsapp/whatsapp.module';
import { SupportModule } from './support/support.module';
import { PlanConfigModule } from './subscription/plan-config.module';
import { StatusModule } from './status/status.module';
import { LogsModule } from './logs/logs.module';
import { LeaderboardModule } from './leaderboard/leaderboard.module';
import { WhiteLabelModule } from './white-label/white-label.module';
import { FreeAttendeeAddModule } from './free-attendee-add/free-attendee-add.module';
import { CertificatesModule } from './certificates/certificates.module';
import { ReportsModule } from './reports/reports.module';
import { CareersModule } from './careers/careers.module';
import { ContentReportsModule } from './content-reports/content-reports.module';
import { BlogModule } from './blog/blog.module';
import { NotificationsModule } from './notifications/notifications.module';
import { EmailCampaignsModule } from './email-campaigns/email-campaigns.module';
import { SponsorsModule } from './sponsors/sponsors.module';
import { CouponsModule } from './coupons/coupons.module';
import { PartnerLinksModule } from './partner-links/partner-links.module';
import { TrafficModule } from './traffic/traffic.module';

@Module({
  imports: [
    CategoriesModule,
    // Load environment variables from .env file
    NestConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    // Enable scheduled jobs and cron tasks
    ScheduleModule.forRoot(),
    // In-process event bus: domain services emit, the notifications module
    // listens. Decouples push fan-out from domain requests (best-effort, async).
    EventEmitterModule.forRoot(),
    // Global throttler configuration with Redis-backed storage
    ThrottlerModule.forRootAsync({
      imports: [
    CategoriesModule,RedisModule],
      useFactory: (redisService: RedisService) => {
        const logger = new Logger('ThrottlerModule');
        // Dedicated connection (not the shared cache client): this factory runs
        // before RedisService.onModuleInit connects, so getClient() would be
        // null here and the throttler would wrongly latch onto per-replica
        // in-memory storage. createClient() returns a connecting client that
        // buffers until ready, so the store is Redis-backed and shared across
        // replicas.
        const redisClient = redisService.createClient();

        if (redisClient) {
          logger.log('Throttler using Redis storage backend');
          return {
            throttlers: [
              {
                ttl: 60000, // 60 seconds
                // Per-user (bearer token) or per-real-IP once trust proxy is on
                // and UserAwareThrottlerGuard is active. A single dashboard load
                // fans out into many calls, so keep this comfortably high.
                limit: 300, // 300 requests per 60 seconds
              },
            ],
            storage: new ThrottlerStorageRedisService(redisClient),
          };
        } else {
          logger.warn(
            'Throttler falling back to in-memory storage - Redis unavailable',
          );
          return {
            throttlers: [
              {
                ttl: 60000, // 60 seconds
                // Per-user (bearer token) or per-real-IP once trust proxy is on
                // and UserAwareThrottlerGuard is active. A single dashboard load
                // fans out into many calls, so keep this comfortably high.
                limit: 300, // 300 requests per 60 seconds
              },
            ],
            // storage: undefined defaults to in-memory storage
          };
        }
      },
      inject: [RedisService],
    }),
    // Config Validation (validates AWS environment variables)
    ConfigModule,
    // Redis Module (global scope for throttler and caching)
    RedisModule,
    // Core Modules
    PrismaModule,
    StorageModule,
    AuthModule,
    UsersModule,
    RolesModule,
    SpacesModule,
    DiscussionsModule,
    AdminModule,
    AwsModule,
    // Event Tech Platform Modules
    SubscriptionModule,
    EventsModule,
    RegistrationsModule,
    SessionsModule,
    FavoritesModule,
    CheckinModule,
    PayoutsModule,
    ReconciliationModule,
    RefundsModule,
    WhatsAppModule,
    SupportModule,
    PlanConfigModule,
    LogsModule,
    StatusModule,
    LeaderboardModule,
    WhiteLabelModule,
    FreeAttendeeAddModule,
    CertificatesModule,
    ReportsModule,
    CareersModule,
    ContentReportsModule,
    BlogModule,
    NotificationsModule,
    EmailCampaignsModule,
    SponsorsModule,
    CouponsModule,
    PartnerLinksModule,
    TrafficModule,
    IamModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      // Buckets by authenticated user (bearer token) when present, else by real
      // client IP. See UserAwareThrottlerGuard for the full rationale.
      useClass: UserAwareThrottlerGuard,
    },
  ],
})
export class AppModule {}
