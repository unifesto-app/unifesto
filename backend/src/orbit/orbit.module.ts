import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { PayoutsModule } from '../payouts/payouts.module';
import { SpacesModule } from '../spaces/spaces.module';
import { EmailModule } from '../email/email.module';
import { RolesGuard } from '../auth/guards/roles.guard';
import { OrbitController } from './orbit.controller';
import { OrbitService } from './orbit.service';

/** Unifesto Orbit: the campus programme (Orbit Leads + leaderboard). */
@Module({
  imports: [PrismaModule, AuthModule, PayoutsModule, SpacesModule, EmailModule],
  controllers: [OrbitController],
  providers: [OrbitService, RolesGuard],
})
export class OrbitModule {}
