import { Global, Module } from '@nestjs/common';
import { CacheModule } from '../cache/cache.module';
import { PlanConfigService } from './plan-config.service';
import { PlatformConfigService } from './platform-config.service';
import { TermsService } from './terms.service';

/**
 * Global so any service (events, registrations, subscription) can inject
 * PlanConfigService / PlatformConfigService without importing
 * SubscriptionModule. PrismaModule is already global, so no imports are
 * needed here.
 */
@Global()
@Module({
  // TermsService clears event caches when Unifesto changes who pays.
  imports: [CacheModule],
  providers: [PlanConfigService, PlatformConfigService, TermsService],
  exports: [PlanConfigService, PlatformConfigService, TermsService],
})
export class PlanConfigModule {}
