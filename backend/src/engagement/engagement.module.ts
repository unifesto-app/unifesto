import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { LeaderboardModule } from '../leaderboard/leaderboard.module';
import { PollsController } from './polls.controller';
import { PollsService } from './polls.service';
import { QuestionsController } from './questions.controller';
import { QuestionsService } from './questions.service';

/**
 * Track L live engagement. L1 is polls; Q&A (L2), quizzes (L3) and the
 * projector view (L4) plug into the same room: `engagementRoom` pings on the
 * existing /leaderboard socket (LeaderboardGateway) and `canJoinEngagement`.
 */
@Module({
  imports: [AuthModule, LeaderboardModule],
  controllers: [PollsController, QuestionsController],
  providers: [PollsService, QuestionsService],
})
export class EngagementModule {}
