import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CacheModule } from '../cache/cache.module';
import { EmailModule } from '../email/email.module';
import { StorageModule } from '../storage/storage.module';
import { SponsorsController } from './sponsors.controller';
import { SponsorLeadsController } from './sponsor-leads.controller';
import { SponsorsService } from './sponsors.service';
import { LeadsController } from './leads.controller';
import { PublicLeadsController } from './public-leads.controller';
import { LeadsService } from './leads.service';
import { SponsorPortalController } from './sponsor-portal.controller';
import { SponsorPortalService } from './sponsor-portal.service';

/**
 * Sponsors & lead generation. P1 ships the space-scoped management surface (the
 * sponsor roster, tier ladder and event attachments); P2 adds attendee opt-in
 * lead capture and public display (the latter rides along in the cached event
 * detail, so SponsorsService busts that cache via CacheModule on any change).
 * PrismaModule and PlanConfigModule are @Global, so only AuthModule (guards) and
 * CacheModule are imported. Later phases add the organiser lead funnel and the
 * sponsor portal.
 */
@Module({
  imports: [AuthModule, CacheModule, StorageModule, EmailModule],
  controllers: [
    SponsorsController,
    SponsorLeadsController,
    LeadsController,
    PublicLeadsController,
    SponsorPortalController,
  ],
  providers: [SponsorsService, LeadsService, SponsorPortalService],
  exports: [SponsorsService, LeadsService, SponsorPortalService],
})
export class SponsorsModule {}
