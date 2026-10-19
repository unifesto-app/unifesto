import { Module } from '@nestjs/common';
import { SupportController } from './support.controller';
import { SupportService } from './support.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { StorageModule } from '../storage/storage.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { EmailModule } from '../email/email.module';
import { SupportNotifier } from './support-notifier';
import { SupportTriage } from './support-triage';
import { AiModule } from '../ai/ai.module';
import { SubjectCases } from './subject-cases';

@Module({
  imports: [PrismaModule, AuthModule, StorageModule, NotificationsModule, EmailModule, AiModule],
  controllers: [SupportController],
  providers: [SupportService, SupportNotifier, SupportTriage, SubjectCases],
  exports: [SupportService],
})
export class SupportModule {}
