import { AuthModule } from '../auth/auth.module';
import { Module } from '@nestjs/common';
import { SubscriptionService } from './subscription.service';
import { SubscriptionController } from './subscription.controller';
import { SubscriptionSchedulerService } from './subscription-scheduler.service';
import { PrismaModule } from '../prisma/prisma.module';
import { CacheModule } from '../cache/cache.module';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [AuthModule, PrismaModule, CacheModule, EmailModule],
  controllers: [SubscriptionController],
  providers: [SubscriptionService, SubscriptionSchedulerService],
  exports: [SubscriptionService],
})
export class SubscriptionModule {}
