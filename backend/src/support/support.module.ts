import { Module } from '@nestjs/common';
import { SupportController } from './support.controller';
import { SupportService } from './support.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { StorageModule } from '../storage/storage.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { EmailModule } from '../email/email.module';
import { SupportNotifier } from './support-notifier';

@Module({
  imports: [PrismaModule, AuthModule, StorageModule, NotificationsModule, EmailModule],
  controllers: [SupportController],
  providers: [SupportService, SupportNotifier],
  exports: [SupportService],
})
export class SupportModule {}
