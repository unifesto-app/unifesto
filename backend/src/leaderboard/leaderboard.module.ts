import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { LeaderboardController } from './leaderboard.controller';
import { LeaderboardService } from './leaderboard.service';
import { LeaderboardGateway } from './leaderboard.gateway';
import { HackathonController } from './hackathon.controller';
import { HackathonSetupService } from './hackathon-setup.service';
import { HackathonTeamsService } from './hackathon-teams.service';
import { HackathonStatementsService } from './hackathon-statements.service';

/**
 * Competitive dashboard (leaderboards) and hackathon mode on top of it:
 * curator, judge/mentor and team screens are in mobile.
 *
 * PrismaModule and PlanConfigModule are @Global, so only AuthModule needs
 * importing (for JwtAuthGuard + AuthService, the latter used to auth sockets
 * and to resolve the optional viewer on the public HTTP endpoint).
 */
@Module({
  imports: [AuthModule],
  controllers: [LeaderboardController, HackathonController],
  providers: [
    LeaderboardService,
    LeaderboardGateway,
    HackathonTeamsService,
    HackathonSetupService,
    HackathonStatementsService,
  ],
  exports: [LeaderboardService],
})
export class LeaderboardModule {}
