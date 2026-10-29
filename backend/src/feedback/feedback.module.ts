import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { FeedbackSchedulerService } from './feedback-scheduler.service';
import { FeedbackController } from './feedback.controller';
import { FeedbackService } from './feedback.service';

/** F1/F2 per-event attendee feedback and its timed asks. Prisma and Redis are @Global. */
@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [FeedbackController],
  providers: [FeedbackService, FeedbackSchedulerService],
  exports: [FeedbackService],
})
export class FeedbackModule {}
