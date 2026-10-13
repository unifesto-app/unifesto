import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminEmailController } from './admin-email.controller';
import { WhatsAppAdminController } from './whatsapp-admin.controller';
import { OtaAdminController, OtaStatusIngestController } from './ota-admin.controller';
import { OtaAdminService } from './ota-admin.service';
import { AdminSchedulerService } from './admin-scheduler.service';
import { StatsMilestoneService } from './stats-milestone.service';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { StorageModule } from '../storage/storage.module';
import { AuthModule } from '../auth/auth.module';
import { EmailModule } from '../email/email.module';
import { EmailCampaignsModule } from '../email-campaigns/email-campaigns.module';
import { UsersModule } from '../users/users.module';
import { RegistrationsModule } from '../registrations/registrations.module';
import { EventsModule } from '../events/events.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';

@Module({
  imports: [PrismaModule, RedisModule, StorageModule, AuthModule, EmailModule, EmailCampaignsModule, UsersModule, RegistrationsModule, EventsModule, WhatsAppModule],
  controllers: [AdminController, AdminEmailController, WhatsAppAdminController, OtaAdminController, OtaStatusIngestController],
  providers: [AdminService, OtaAdminService, AdminSchedulerService, StatsMilestoneService],
  exports: [AdminService],
})
export class AdminModule {}
