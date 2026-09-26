import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TrafficController } from './traffic.controller';
import { TrafficService } from './traffic.service';

/**
 * Page views, short tracking links and page analytics for event + space
 * pages (4.0.5). PrismaModule is @Global; AuthModule provides the guards.
 */
@Module({
  imports: [AuthModule],
  controllers: [TrafficController],
  providers: [TrafficService],
})
export class TrafficModule {}
