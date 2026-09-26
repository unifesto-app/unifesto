import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';

/**
 * Shared Razorpay boundary. Deliberately NOT @Global(): a module must import
 * PaymentsModule to move money, so the ability to take payments stays visible
 * in each feature's import list. PlatformConfigService (the fee source) is
 * already global, so no imports are needed here.
 */
@Module({
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
