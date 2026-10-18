// Test-only wiring: builds RegistrationsService and its split-out services
// from the same 15 mocked dependencies the specs always passed.
import { RegistrationsService } from './registrations.service';
import { RegistrationConfirmationsService } from './registration-confirmations.service';
import { RegistrationAttendeesService } from './registration-attendees.service';
import { RegistrationTransfersService } from './registration-transfers.service';
import { RegistrationExportService } from './registration-export.service';
import { RegistrationImportService } from './registration-import.service';
import { RegistrationCancellationService } from './registration-cancellation.service';
import { RegistrationPaymentsService } from './registration-payments.service';
import { RegistrationCheckoutService } from './registration-checkout.service';
import { MyRegistrationsService } from './my-registrations.service';

export function buildRegistrationsService(
  prisma: any,
  emailService: any,
  whatsappService: any,
  cache: any,
  planConfig: any,
  platformConfig: any,
  payments: any,
  waitlist: any,
  events: any,
  groupSeats: any,
  redis: any,
  coupons: any,
  stayBookings: any,
  teamChanges: any,
  authz: any,
  sessions: any = { completeFromWebhook: async () => false },
): RegistrationsService {
  const confirmations = new RegistrationConfirmationsService(
    prisma,
    emailService,
    whatsappService,
    events,
    groupSeats,
    redis,
  );
  const attendees = new RegistrationAttendeesService(
    prisma,
    whatsappService,
    groupSeats,
    authz,
    confirmations,
  );
  const transfers = new RegistrationTransfersService(prisma, authz);
  const exporter = new RegistrationExportService(prisma, planConfig, authz);
  const importer = new RegistrationImportService(
    prisma,
    cache,
    platformConfig,
    payments,
    groupSeats,
    confirmations,
  );
  const cancellation = new RegistrationCancellationService(
    prisma,
    emailService,
    cache,
    events,
    groupSeats,
    coupons,
    attendees,
    payments,
  );
  const settlement = new RegistrationPaymentsService(
    prisma,
    emailService,
    whatsappService,
    cache,
    payments,
    waitlist,
    groupSeats,
    coupons,
    stayBookings,
    teamChanges,
    confirmations,
    sessions,
  );
  const checkout = new RegistrationCheckoutService(
    prisma,
    emailService,
    whatsappService,
    cache,
    payments,
    waitlist,
    groupSeats,
    coupons,
    confirmations,
  );
  const mine = new MyRegistrationsService(prisma, groupSeats, confirmations);
  return new RegistrationsService(
    confirmations,
    attendees,
    transfers,
    exporter,
    importer,
    cancellation,
    settlement,
    checkout,
    mine,
  );
}
