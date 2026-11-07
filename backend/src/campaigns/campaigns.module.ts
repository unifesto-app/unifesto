import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EmailCampaignsModule } from '../email-campaigns/email-campaigns.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { AdminCampaignsController } from './campaigns.controller';
import { CampaignsService } from './campaigns.service';

/**
 * C17 campaigns: a layer over the channel senders. Imports their modules and
 * nothing imports this one, so there's no cycle.
 */
@Module({
  imports: [AuthModule, NotificationsModule, EmailCampaignsModule, WhatsAppModule],
  controllers: [AdminCampaignsController],
  providers: [CampaignsService],
})
export class CampaignsModule {}
