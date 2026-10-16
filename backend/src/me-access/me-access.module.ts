import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { CheckinModule } from '../checkin/checkin.module';
import { LeaderboardModule } from '../leaderboard/leaderboard.module';
import { SponsorsModule } from '../sponsors/sponsors.module';
import { MeAccessController } from './me-access.controller';

@Module({
  imports: [AuthModule, UsersModule, CheckinModule, LeaderboardModule, SponsorsModule],
  controllers: [MeAccessController],
})
export class MeAccessModule {}
