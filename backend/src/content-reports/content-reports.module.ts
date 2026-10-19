import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EmailModule } from '../email/email.module';
import { SupportModule } from '../support/support.module';
import { ContentReportsController } from './content-reports.controller';
import { ContentReportsService } from './content-reports.service';

/**
 * User reports about events, spaces and tickets ("Report" in the app) and the
 * platform-admin review queue. A ticket report also opens an Assist case
 * (D21). PrismaModule is @Global.
 */
@Module({
  imports: [AuthModule, EmailModule, SupportModule],
  controllers: [ContentReportsController],
  providers: [ContentReportsService],
})
export class ContentReportsModule {}
