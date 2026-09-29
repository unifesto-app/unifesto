import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StorageModule } from '../storage/storage.module';
import { PaymentsModule } from '../payments/payments.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { StaysController } from './stays.controller';
import { StaysService } from './stays.service';
import { StayBookingsService } from './stay-bookings.service';

/**
 * Unifesto Stay — accommodation attached to an event. Exports the bookings
 * service so the Razorpay webhook (RegistrationsModule) can settle stay
 * payments. PrismaModule is @Global.
 */
@Module({
  imports: [AuthModule, StorageModule, PaymentsModule, NotificationsModule],
  controllers: [StaysController],
  providers: [StaysService, StayBookingsService],
  exports: [StayBookingsService],
})
export class StaysModule {}
