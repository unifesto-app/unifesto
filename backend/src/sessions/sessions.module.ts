import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PaymentsModule } from '../payments/payments.module';
import { EmailModule } from '../email/email.module';
import { StorageModule } from '../storage/storage.module';
import { SessionsService } from './sessions.service';
import { SessionsController } from './sessions.controller';
import { SessionSchedulerService } from './session-scheduler.service';
import { LivekitService } from './livekit.service';

@Module({
  imports: [AuthModule, PrismaModule, PaymentsModule, EmailModule, StorageModule],
  controllers: [SessionsController],
  providers: [SessionsService, SessionSchedulerService, LivekitService],
  exports: [SessionsService],
})
export class SessionsModule {}
