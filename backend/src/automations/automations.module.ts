import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminAutomationsController, EventAutomationsController } from './automations.controller';
import { AutomationsService } from './automations.service';

/** C18: the list of automatic messages and the per-event switches. Prisma is global. */
@Module({
  imports: [AuthModule],
  controllers: [AdminAutomationsController, EventAutomationsController],
  providers: [AutomationsService],
})
export class AutomationsModule {}
