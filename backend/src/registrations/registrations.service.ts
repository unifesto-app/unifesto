import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { CacheService } from '../cache/cache.service';
import { RedisService } from '../redis/redis.service';
import { PlanConfigService } from '../subscription/plan-config.service';
import { PlatformConfigService } from '../subscription/platform-config.service';
import { PaymentsService } from '../payments/payments.service';
import { StayBookingsService } from '../stays/stay-bookings.service';
import { TeamChangesService } from './team-changes.service';
import { CouponsService } from '../coupons/coupons.service';
import { AuthorizationService } from '../auth/authorization';
import { WaitlistService } from './waitlist.service';
import { GroupSeatsService } from './group-seats.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { RegistrationConfirmationsService } from './registration-confirmations.service';
import { RegistrationAttendeesService } from './registration-attendees.service';
import { RegistrationTransfersService } from './registration-transfers.service';
import { RegistrationExportService } from './registration-export.service';
import { RegistrationImportService } from './registration-import.service';
import { RegistrationCancellationService } from './registration-cancellation.service';
import { RegistrationPaymentsService } from './registration-payments.service';
import { RegistrationCheckoutService } from './registration-checkout.service';
import { MyRegistrationsService } from './my-registrations.service';

@Injectable()
export class RegistrationsService {
  private readonly logger = new Logger(RegistrationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly whatsappService: WhatsAppService,
    private readonly cache: CacheService,
    private readonly planConfig: PlanConfigService,
    private readonly platformConfig: PlatformConfigService,
    private readonly payments: PaymentsService,
    private readonly waitlist: WaitlistService,
    private readonly events: EventEmitter2,
    private readonly groupSeats: GroupSeatsService,
    private readonly redis: RedisService,
    private readonly coupons: CouponsService,
    private readonly stayBookings: StayBookingsService,
    private readonly teamChanges: TeamChangesService,
    private readonly authz: AuthorizationService,
    readonly confirmations: RegistrationConfirmationsService,
    readonly attendees: RegistrationAttendeesService,
    readonly transfers: RegistrationTransfersService,
    readonly exporter: RegistrationExportService,
    readonly importer: RegistrationImportService,
    readonly cancellation: RegistrationCancellationService,
    readonly settlement: RegistrationPaymentsService,
    readonly checkout: RegistrationCheckoutService,
    readonly mine: MyRegistrationsService,
  ) {}

  // RegistrationAttendeesService
  sendGroupInviteBlast(...args: Parameters<RegistrationAttendeesService['sendGroupInviteBlast']>) {
    return this.attendees.sendGroupInviteBlast(...args);
  }

  getRegistrationSources(...args: Parameters<RegistrationAttendeesService['getRegistrationSources']>) {
    return this.attendees.getRegistrationSources(...args);
  }

  getSpaceRegistrationSources(...args: Parameters<RegistrationAttendeesService['getSpaceRegistrationSources']>) {
    return this.attendees.getSpaceRegistrationSources(...args);
  }

  getSourceAttendees(...args: Parameters<RegistrationAttendeesService['getSourceAttendees']>) {
    return this.attendees.getSourceAttendees(...args);
  }

  getAttendeeStats(...args: Parameters<RegistrationAttendeesService['getAttendeeStats']>) {
    return this.attendees.getAttendeeStats(...args);
  }

  getEventRegistrations(...args: Parameters<RegistrationAttendeesService['getEventRegistrations']>) {
    return this.attendees.getEventRegistrations(...args);
  }

  getRegistrationDetail(...args: Parameters<RegistrationAttendeesService['getRegistrationDetail']>) {
    return this.attendees.getRegistrationDetail(...args);
  }

  releaseGroupSeat(...args: Parameters<RegistrationAttendeesService['releaseGroupSeat']>) {
    return this.attendees.releaseGroupSeat(...args);
  }

  reopenGroupSeat(...args: Parameters<RegistrationAttendeesService['reopenGroupSeat']>) {
    return this.attendees.reopenGroupSeat(...args);
  }

  // RegistrationTransfersService
  adminTransferRegistration(...args: Parameters<RegistrationTransfersService['adminTransferRegistration']>) {
    return this.transfers.adminTransferRegistration(...args);
  }

  requestRegistrationTransfer(...args: Parameters<RegistrationTransfersService['requestRegistrationTransfer']>) {
    return this.transfers.requestRegistrationTransfer(...args);
  }

  getMyTransferRequests(...args: Parameters<RegistrationTransfersService['getMyTransferRequests']>) {
    return this.transfers.getMyTransferRequests(...args);
  }

  getAllTransferRequests(...args: Parameters<RegistrationTransfersService['getAllTransferRequests']>) {
    return this.transfers.getAllTransferRequests(...args);
  }

  reviewTransferRequest(...args: Parameters<RegistrationTransfersService['reviewTransferRequest']>) {
    return this.transfers.reviewTransferRequest(...args);
  }

  // RegistrationExportService
  exportRegistrations(...args: Parameters<RegistrationExportService['exportRegistrations']>) {
    return this.exporter.exportRegistrations(...args);
  }

  // RegistrationImportService
  buildImportTemplate(...args: Parameters<RegistrationImportService['buildImportTemplate']>) {
    return this.importer.buildImportTemplate(...args);
  }

  importAttendees(...args: Parameters<RegistrationImportService['importAttendees']>) {
    return this.importer.importAttendees(...args);
  }

  previewImport(...args: Parameters<RegistrationImportService['previewImport']>) {
    return this.importer.previewImport(...args);
  }

  manualAddAttendee(...args: Parameters<RegistrationImportService['manualAddAttendee']>) {
    return this.importer.manualAddAttendee(...args);
  }

  // RegistrationCancellationService
  cancelRegistration(...args: Parameters<RegistrationCancellationService['cancelRegistration']>) {
    return this.cancellation.cancelRegistration(...args);
  }

  cancelMyRegistration(...args: Parameters<RegistrationCancellationService['cancelMyRegistration']>) {
    return this.cancellation.cancelMyRegistration(...args);
  }

  organiserCancelRegistration(...args: Parameters<RegistrationCancellationService['organiserCancelRegistration']>) {
    return this.cancellation.organiserCancelRegistration(...args);
  }

  restoreRegistration(...args: Parameters<RegistrationCancellationService['restoreRegistration']>) {
    return this.cancellation.restoreRegistration(...args);
  }

  // RegistrationPaymentsService
  refundDue(...args: Parameters<RegistrationPaymentsService['refundDue']>) {
    return this.settlement.refundDue(...args);
  }

  verifyPayment(...args: Parameters<RegistrationPaymentsService['verifyPayment']>) {
    return this.settlement.verifyPayment(...args);
  }

  handleRazorpayWebhook(...args: Parameters<RegistrationPaymentsService['handleRazorpayWebhook']>) {
    return this.settlement.handleRazorpayWebhook(...args);
  }

  reconcilePendingPayment(...args: Parameters<RegistrationPaymentsService['reconcilePendingPayment']>) {
    return this.settlement.reconcilePendingPayment(...args);
  }

  adminResolvePending(...args: Parameters<RegistrationPaymentsService['adminResolvePending']>) {
    return this.settlement.adminResolvePending(...args);
  }

  // RegistrationCheckoutService
  registerForEvent(...args: Parameters<RegistrationCheckoutService['registerForEvent']>) {
    return this.checkout.registerForEvent(...args);
  }

  completeRSVP(...args: Parameters<RegistrationCheckoutService['completeRSVP']>) {
    return this.checkout.completeRSVP(...args);
  }

  addToWaitlist(...args: Parameters<RegistrationCheckoutService['addToWaitlist']>) {
    return this.checkout.addToWaitlist(...args);
  }

  createRazorpayOrder(...args: Parameters<RegistrationCheckoutService['createRazorpayOrder']>) {
    return this.checkout.createRazorpayOrder(...args);
  }

  createPaymentOrder(...args: Parameters<RegistrationCheckoutService['createPaymentOrder']>) {
    return this.checkout.createPaymentOrder(...args);
  }

  createWaitlistOfferOrder(...args: Parameters<RegistrationCheckoutService['createWaitlistOfferOrder']>) {
    return this.checkout.createWaitlistOfferOrder(...args);
  }

  // MyRegistrationsService
  getMyRegistration(...args: Parameters<MyRegistrationsService['getMyRegistration']>) {
    return this.mine.getMyRegistration(...args);
  }

  getRegistrationWhatsappGroup(...args: Parameters<MyRegistrationsService['getRegistrationWhatsappGroup']>) {
    return this.mine.getRegistrationWhatsappGroup(...args);
  }

  setWhatsappGroupJoined(...args: Parameters<MyRegistrationsService['setWhatsappGroupJoined']>) {
    return this.mine.setWhatsappGroupJoined(...args);
  }

  getMyRegistrationsForEvent(...args: Parameters<MyRegistrationsService['getMyRegistrationsForEvent']>) {
    return this.mine.getMyRegistrationsForEvent(...args);
  }

  getMyRegistrationCheckins(...args: Parameters<MyRegistrationsService['getMyRegistrationCheckins']>) {
    return this.mine.getMyRegistrationCheckins(...args);
  }

  getMyGroupMembers(...args: Parameters<MyRegistrationsService['getMyGroupMembers']>) {
    return this.mine.getMyGroupMembers(...args);
  }

  updateMyGroupMembers(...args: Parameters<MyRegistrationsService['updateMyGroupMembers']>) {
    return this.mine.updateMyGroupMembers(...args);
  }

  getMyRegistrations(...args: Parameters<MyRegistrationsService['getMyRegistrations']>) {
    return this.mine.getMyRegistrations(...args);
  }

  getMyMemberTickets(...args: Parameters<MyRegistrationsService['getMyMemberTickets']>) {
    return this.mine.getMyMemberTickets(...args);
  }

  hideMyTicket(...args: Parameters<MyRegistrationsService['hideMyTicket']>) {
    return this.mine.hideMyTicket(...args);
  }
}

