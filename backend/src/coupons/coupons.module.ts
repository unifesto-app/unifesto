import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CouponsController } from './coupons.controller';
import { CouponsService } from './coupons.service';
import { CouponSchedulerService } from './coupon-scheduler.service';

/**
 * Event-scoped discount codes. PrismaModule is @Global; AuthModule provides the
 * guards (JwtAuthGuard, CanGuard) the management routes use. CouponsService is
 * exported so RegistrationsModule can apply codes at checkout and confirm /
 * release reservations along the payment lifecycle.
 */
@Module({
  imports: [AuthModule],
  controllers: [CouponsController],
  providers: [CouponsService, CouponSchedulerService],
  exports: [CouponsService],
})
export class CouponsModule {}
