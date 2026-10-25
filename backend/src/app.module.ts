import { Module, Logger } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerModule } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { FailOpenThrottlerStorage } from './common/throttler/fail-open-throttler.storage';
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
import { SpacesModule } from './spaces/spaces.module';
import { StorageModule } from './storage/storage.module';
import { RedisModule } from './redis/redis.module';
import { RedisService } from './redis/redis.service';
import { AdminModule } from './admin/admin.module';
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
import { LegalModule } from './legal/legal.module';
import { OrbitModule } from './orbit/orbit.module';
import { PmModule } from './pm/pm.module';
import { ContentReportsModule } from './content-reports/content-reports.module';
import { BlogModule } from './blog/blog.module';
import { HelpModule } from './help/help.module';
import { NotificationsModule } from './notifications/notifications.module';
import { EmailCampaignsModule } from './email-campaigns/email-campaigns.module';
import { SponsorsModule } from './sponsors/sponsors.module';
import { MeAccessModule } from './me-access/me-access.module';
import { CouponsModule } from './coupons/coupons.module';
import { EngagementModule } from './engagement/engagement.module';
import { PartnerLinksModule } from './partner-links/partner-links.module';
import { TrafficModule } from './traffic/traffic.module';
import { DefaultImagesModule } from './default-images/default-images.module';
import { StaysModule } from './stays/stays.module';
import { LoggerModule } from 'nestjs-pino';
import { jsonLogsEnabled, requestIdFor } from './common/observability';

@Module({
  imports: [
    // Structured JSON logs, only with LOG_FORMAT=json (Nest's text logger otherwise).
    ...(jsonLogsEnabled()
      ? [
          LoggerModule.forRoot({
            pinoHttp: {
              level: process.env.LOG_LEVEL || 'info',
              genReqId: (req, res) => {
                const id = requestIdFor(req);
                res.setHeader('x-request-id', id);
                return id;
              },
              redact: [
                'req.headers.authorization',
                'req.headers.cookie',
                'req.headers["x-internal-key"]',
                'req.headers["x-ota-status-secret"]',
                'req.headers["x-display-token"]',
                'req.headers["x-razorpay-signature"]',
              ],
              // The external uptime probe would otherwise be most of the log.
              autoLogging: { ignore: (req) => req.url === '/health' },
            },
          }),
        ]
      : []),
    CategoriesModule,
    // Load environment variables: .env.local (laptop dev values) wins over .env.
    // src/env.ts already loaded both into process.env; this keeps ConfigService in step.
    NestConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    // Enable scheduled jobs and cron tasks. The cert-worker container
    // (CERT_WORKER=true) runs the same image only to drain the render queue, so
    // it skips every @Cron/@Interval/@Timeout and leaves them to the API replicas.
    ScheduleModule.forRoot(
      process.env.CERT_WORKER === 'true'
        ? { cronJobs: false, intervals: false, timeouts: false }
        : {},
    ),
    // In-process event bus: domain services emit, the notifications module
    // listens. Decouples push fan-out from domain requests (best-effort, async).
    EventEmitterModule.forRoot(),
    // Global throttler configuration with Redis-backed storage
    ThrottlerModule.forRootAsync({
      imports: [RedisModule],
      useFactory: (redisService: RedisService) => {
        const logger = new Logger('ThrottlerModule');
        // Dedicated connection (not the shared cache client): this factory runs
        // before RedisService.onModuleInit connects, so getClient() would be
        // null here and the throttler would wrongly latch onto per-replica
        // in-memory storage. createClient() returns a connecting client that
        // buffers until ready, so the store is Redis-backed and shared across
        // replicas.
        //
        // Fail fast, never queue: with the shared defaults
        // (maxRetriesPerRequest: null + offline queue) a Redis outage made every
        // throttled request wait forever, the health probe included, so Caddy
        // ejected all replicas at once. Here a dead Redis errors immediately and
        // FailOpenThrottlerStorage lets the request through.
        const redisClient = redisService.createClient({
          maxRetriesPerRequest: 0,
          enableOfflineQueue: false,
          commandTimeout: 500,
        });

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
            storage: new FailOpenThrottlerStorage(
              new ThrottlerStorageRedisService(redisClient),
            ),
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
    SpacesModule,
    AdminModule,
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
    LegalModule,
    OrbitModule,
    PmModule,
    ContentReportsModule,
    BlogModule,
    HelpModule,
    NotificationsModule,
    EmailCampaignsModule,
    SponsorsModule,
    MeAccessModule,
    CouponsModule,
    EngagementModule,
    PartnerLinksModule,
    TrafficModule,
    DefaultImagesModule,
    StaysModule,
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
