// Test-only wiring: builds RegistrationsService and its split-out services
// from the same 15 mocked dependencies the specs always passed.
import { RegistrationsService } from './registrations.service';
import { RegistrationConfirmationsService } from './registration-confirmations.service';

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
  return new RegistrationsService(
    prisma, emailService, whatsappService, cache, planConfig, platformConfig, payments, waitlist, events, groupSeats, redis, coupons, stayBookings, teamChanges, authz,
    confirmations,
  );
}
