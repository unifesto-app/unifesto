import { Module } from '@nestjs/common';
import { StatusService } from './status.service';
import { StatusController } from './status.controller';
import { HealthController } from './health.controller';
import { UptimeRobotService } from './uptime-robot.service';
import { SentryIssuesService } from './sentry-issues.service';
import { AdminModule } from '../admin/admin.module';
import { AuthModule } from '../auth/auth.module';

/**
 * Status page: samples service health on a schedule (reusing AdminService's
 * health checks) into `health_checks`, aggregates 90-day uptime, and tracks
 * incidents. PrismaModule is global; ScheduleModule is registered in AppModule.
 */
@Module({
  imports: [AdminModule, AuthModule],
  controllers: [StatusController, HealthController],
  providers: [StatusService, UptimeRobotService, SentryIssuesService],
  exports: [StatusService],
})
export class StatusModule {}
