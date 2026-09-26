import { AuthModule } from '../auth/auth.module';
import { Module } from '@nestjs/common';
import { RegistrationsService } from './registrations.service';
import { WaitlistService } from './waitlist.service';
import { GroupSeatsService } from './group-seats.service';
import { RegistrationsController } from './registrations.controller';
import { GroupSeatsController } from './group-seats.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { EmailModule } from '../email/email.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { CacheModule } from '../cache/cache.module';
import { PaymentsModule } from '../payments/payments.module';
import { CouponsModule } from '../coupons/coupons.module';
import { StorageModule } from '../storage/storage.module';
import { FormUploadsService } from './form-uploads.service';
import { FormUploadsController } from './form-uploads.controller';

@Module({
  imports: [
    AuthModule,
    PrismaModule,
    EmailModule,
    WhatsAppModule,
    CacheModule,
    PaymentsModule,
    CouponsModule,
    StorageModule,
  ],
  controllers: [RegistrationsController, GroupSeatsController, FormUploadsController],
  providers: [RegistrationsService, WaitlistService, GroupSeatsService, FormUploadsService],
  exports: [RegistrationsService, WaitlistService, GroupSeatsService],
})
export class RegistrationsModule {}
