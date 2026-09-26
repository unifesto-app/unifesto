import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FreeAttendeeAddController } from './free-attendee-add.controller';
import { FreeAttendeeAddService } from './free-attendee-add.service';

/**
 * "Add attendees for free" exception request flow (organiser → platform admin).
 * PrismaModule is @Global; AuthModule provides the guards (JwtAuthGuard,
 * RolesGuard, CanGuard) used on the routes.
 */
@Module({
  imports: [AuthModule],
  controllers: [FreeAttendeeAddController],
  providers: [FreeAttendeeAddService],
  exports: [FreeAttendeeAddService],
})
export class FreeAttendeeAddModule {}
