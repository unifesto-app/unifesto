import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TrafficController } from './traffic.controller';
import { TrafficService } from './traffic.service';

/**
 * Page views of event, space and website pages. PrismaModule is @Global;
 * AuthModule provides JwtAuthGuard / CanGuard.
 */
@Module({
  imports: [AuthModule],
  controllers: [TrafficController],
  providers: [TrafficService],
})
export class TrafficModule {}
