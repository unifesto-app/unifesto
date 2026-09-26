import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StorageModule } from '../storage/storage.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { ReportDataService } from './report-data.service';
import { ReportRenderService } from './report-render.service';

/**
 * Event report generation: organiser-designed DEFAULT / CUSTOM reports rendered
 * to a formatted PDF and persisted for re-download.
 *
 * PrismaModule and PlanConfigModule are @Global; StorageModule is imported for
 * S3 uploads and AuthModule for the JwtAuthGuard on every (organiser-only) route.
 */
@Module({
  imports: [AuthModule, StorageModule],
  controllers: [ReportsController],
  providers: [ReportsService, ReportDataService, ReportRenderService],
  exports: [ReportsService],
})
export class ReportsModule {}
