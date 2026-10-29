import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CertificatesModule } from '../certificates/certificates.module';
import { EmailModule } from '../email/email.module';
import { LeaderboardController } from './leaderboard.controller';
import { LeaderboardService } from './leaderboard.service';
import { LeaderboardGateway } from './leaderboard.gateway';
import { HackathonController } from './hackathon.controller';
import { HackathonSetupService } from './hackathon-setup.service';
import { HackathonTeamsService } from './hackathon-teams.service';
import { HackathonStatementsService } from './hackathon-statements.service';
import { HackathonJudgesService } from './hackathon-judges.service';
import { HackathonRoundsService } from './hackathon-rounds.service';
import { HackathonQueueService } from './hackathon-queue.service';
import { HackathonResultsService } from './hackathon-results.service';
import { HackathonSubmissionsService } from './hackathon-submissions.service';
import { HackathonAnnouncementsService } from './hackathon-announcements.service';
import { HackathonCertificatesService } from './hackathon-certificates.service';
import { HackathonHelpService } from './hackathon-help.service';

/**
 * Competitive dashboard (leaderboards) and hackathon mode on top of it:
 * curator, judge/mentor and team screens are in mobile.
 *
 * PrismaModule and PlanConfigModule are @Global, so only AuthModule needs
 * importing (for JwtAuthGuard + AuthService, the latter used to auth sockets).
 */
@Module({
  imports: [AuthModule, CertificatesModule, EmailModule],
  controllers: [LeaderboardController, HackathonController],
  providers: [
    LeaderboardService,
    LeaderboardGateway,
    HackathonTeamsService,
    HackathonSetupService,
    HackathonStatementsService,
    HackathonJudgesService,
    HackathonRoundsService,
    HackathonQueueService,
    HackathonResultsService,
    HackathonSubmissionsService,
    HackathonAnnouncementsService,
    HackathonHelpService,
    HackathonCertificatesService,
  ],
  exports: [LeaderboardService, LeaderboardGateway],
})
export class LeaderboardModule {}
