import { Module } from '@nestjs/common';
import { PayoutsController } from './payouts.controller';
import { PayoutsService } from './payouts.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { EmailModule } from '../email/email.module';

// NOTE: there is deliberately no scheduler here. Payouts are never created
// automatically — an organiser requests one (or an admin creates it) and an
// admin settles it manually. The old daily auto-create cron was removed along
// with every other Razorpay money-movement automation.
@Module({
  imports: [PrismaModule, EmailModule, AuthModule],
  controllers: [PayoutsController],
  providers: [PayoutsService],
  exports: [PayoutsService],
})
export class PayoutsModule {}
