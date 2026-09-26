import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { LeaderboardController } from './leaderboard.controller';
import { LeaderboardService } from './leaderboard.service';
import { LeaderboardGateway } from './leaderboard.gateway';

/**
 * Competitive dashboard (leaderboards): curator surfaces in the space app,
 * judge/mentor/participant views in mobile.
 *
 * PrismaModule and PlanConfigModule are @Global, so only AuthModule needs
 * importing (for JwtAuthGuard + AuthService, the latter used to auth sockets
 * and to resolve the optional viewer on the public HTTP endpoint).
 */
@Module({
  imports: [AuthModule],
  controllers: [LeaderboardController],
  providers: [LeaderboardService, LeaderboardGateway],
  exports: [LeaderboardService],
})
export class LeaderboardModule {}
