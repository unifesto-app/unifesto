import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EmailModule } from '../email/email.module';
import { ContentReportsController } from './content-reports.controller';
import { ContentReportsService } from './content-reports.service';

/**
 * User reports about events, spaces and tickets ("Report" in the app) and the
 * platform-admin review queue. PrismaModule is @Global.
 */
@Module({
  imports: [AuthModule, EmailModule],
  controllers: [ContentReportsController],
  providers: [ContentReportsService],
})
export class ContentReportsModule {}
