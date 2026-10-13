import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { CacheModule } from '../cache/cache.module';
import { StorageModule } from '../storage/storage.module';
import { WhiteLabelController } from './white-label.controller';
import { WhiteLabelService } from './white-label.service';

/**
 * White-label (organiser branding) for spaces & events.
 *
 * PrismaModule and PlanConfigModule are @Global, so only AuthModule needs
 * importing (for JwtAuthGuard + RolesGuard on the admin/organiser routes), plus
 * CacheModule to bust cached event pages when branding changes.
 */
@Module({
  imports: [AuthModule, CacheModule, StorageModule, ConfigModule],
  controllers: [WhiteLabelController],
  providers: [WhiteLabelService],
  exports: [WhiteLabelService],
})
export class WhiteLabelModule {}
