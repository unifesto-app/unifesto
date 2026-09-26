import { Module } from '@nestjs/common';
import { ReconciliationController } from './reconciliation.controller';
import { ReconciliationService } from './reconciliation.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { PaymentsModule } from '../payments/payments.module';

/**
 * Admin reconciliation dashboard backend — compares the platform ledger with
 * Razorpay's payments, refunds, and settlements. Imports PaymentsModule for the
 * Razorpay boundary; read-only, so no scheduler and no persistence of its own.
 */
@Module({
  imports: [PrismaModule, AuthModule, PaymentsModule],
  controllers: [ReconciliationController],
  providers: [ReconciliationService],
})
export class ReconciliationModule {}
