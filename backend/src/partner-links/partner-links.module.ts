import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PartnerLinksController } from './partner-links.controller';
import { PartnerLinksService } from './partner-links.service';

/**
 * Partner tracking links + the partner's in-app stats. PrismaModule is
 * @Global; AuthModule provides JwtAuthGuard / CanGuard.
 */
@Module({
  imports: [AuthModule],
  controllers: [PartnerLinksController],
  providers: [PartnerLinksService],
})
export class PartnerLinksModule {}
