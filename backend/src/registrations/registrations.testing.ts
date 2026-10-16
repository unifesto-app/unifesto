// Test-only wiring: builds RegistrationsService and its split-out services
// from the same 15 mocked dependencies the specs always passed.
import { RegistrationsService } from './registrations.service';
import { RegistrationConfirmationsService } from './registration-confirmations.service';
import { RegistrationAttendeesService } from './registration-attendees.service';
import { RegistrationTransfersService } from './registration-transfers.service';
import { RegistrationExportService } from './registration-export.service';
import { RegistrationImportService } from './registration-import.service';
import { RegistrationCancellationService } from './registration-cancellation.service';

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
): RegistrationsService {
  const confirmations = new RegistrationConfirmationsService(prisma, emailService, whatsappService, events, groupSeats, redis);
  const attendees = new RegistrationAttendeesService(prisma, whatsappService, groupSeats, authz, confirmations);
  const transfers = new RegistrationTransfersService(prisma, authz);
  const exporter = new RegistrationExportService(prisma, planConfig, authz);
  const importer = new RegistrationImportService(prisma, cache, platformConfig, payments, groupSeats, confirmations);
  const cancellation = new RegistrationCancellationService(prisma, emailService, cache, events, groupSeats, coupons, attendees);
  return new RegistrationsService(
    prisma, emailService, whatsappService, cache, planConfig, platformConfig, payments, waitlist, events, groupSeats, redis, coupons, stayBookings, teamChanges, authz,
    confirmations, attendees, transfers, exporter, importer, cancellation,
  );
}
