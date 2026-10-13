import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EmailModule } from '../email/email.module';
import { AuthModule } from '../auth/auth.module';
import { EmailCampaignsService } from './email-campaigns.service';
import { EmailCampaignQueue } from './email-campaigns.queue';
import { EmailTemplatesService } from './email-templates.service';
import { EmailTrackingController } from './email-tracking.controller';
import { SpaceEmailController } from './space-email.controller';

/**
 * Shared email campaign engine. Owns the campaign/template services, the public
 * tracking endpoints, and the space-scoped controller. The platform controller
 * (AdminEmailController, in AdminModule) also consumes EmailCampaignsService, so
 * both surfaces share one code path — the module exports the services for that.
 *
 * PrismaModule is @Global, so it isn't imported here. AuthModule brings the
 * JwtAuthGuard + CanGuard + CapabilityConfigService the space controller uses.
 */
@Module({
  imports: [ConfigModule, EmailModule, AuthModule],
  controllers: [EmailTrackingController, SpaceEmailController],
  providers: [EmailCampaignsService, EmailTemplatesService, EmailCampaignQueue],
  exports: [EmailCampaignsService, EmailTemplatesService],
})
export class EmailCampaignsModule {}
