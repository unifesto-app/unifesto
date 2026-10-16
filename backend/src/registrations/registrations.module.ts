import { AuthModule } from '../auth/auth.module';
import { Module } from '@nestjs/common';
import { RegistrationsService } from './registrations.service';
import { RegistrationImportService } from './registration-import.service';
import { RegistrationExportService } from './registration-export.service';
import { RegistrationTransfersService } from './registration-transfers.service';
import { RegistrationAttendeesService } from './registration-attendees.service';
import { RegistrationConfirmationsService } from './registration-confirmations.service';
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
import { AttendeeDetailsService } from './attendee-details.service';
import { AttendeeDetailsController } from './attendee-details.controller';
import { StaysModule } from '../stays/stays.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TeamChangesService } from './team-changes.service';

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
    // The Razorpay webhook also settles Unifesto Stay payments.
    StaysModule,
    NotificationsModule,
  ],
  controllers: [RegistrationsController, GroupSeatsController, FormUploadsController, AttendeeDetailsController],
  providers: [RegistrationsService, RegistrationImportService, RegistrationExportService, RegistrationTransfersService, RegistrationAttendeesService, RegistrationConfirmationsService, WaitlistService, GroupSeatsService, FormUploadsService, AttendeeDetailsService, TeamChangesService],
  exports: [RegistrationsService, WaitlistService, GroupSeatsService, TeamChangesService],
})
export class RegistrationsModule {}
