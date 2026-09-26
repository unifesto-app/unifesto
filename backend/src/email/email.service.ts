import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { buildEventIcs, IcsEventInput } from '../events/calendar/ics.util';

// =====================================================
// INTERFACES
// =====================================================

interface RegistrationConfirmationData {
  email: string;
  userName: string;
  eventTitle: string;
  eventDate: string;
  eventTime: string;
  venueName?: string;
  city?: string;
  isOnline: boolean;
  onlineUrl?: string;
  qrCode: string;
  ticketCode?: string;
  // Raw event fields for the calendar (.ics) attachment. Optional and
  // backward-compatible: when all of slug/start/end/timezone are present the
  // confirmation email carries an "Add to calendar" .ics; otherwise it doesn't.
  eventSlug?: string;
  eventStartDateTime?: Date;
  eventEndDateTime?: Date;
  eventTimezone?: string;
  eventType?: string; // 'IN_PERSON' | 'ONLINE' | 'HYBRID'
  venueAddress?: string;
  eventDescription?: string;
  organiserName?: string;
  // White-label sender identity (space-level, already gated by the caller).
  // When present, the confirmation is sent with this display name and Reply-To.
  brandFromName?: string | null;
  brandReplyTo?: string | null;
}

interface PaymentConfirmationData {
  email: string;
  userName: string;
  eventTitle: string;
  eventDate: string;
  eventTime: string;
  venueName?: string;
  city?: string;
  isOnline: boolean;
  onlineUrl?: string;
  amount: number;
  processingFee: number;
  razorpayPaymentId: string;
  ticketCode?: string;
  qrCode: string;
}

interface CancellationConfirmationData {
  email: string;
  userName: string;
  eventTitle: string;
  razorpayRefundInitiated?: boolean;
  razorpayRefundAmount?: number;
  /** Set when the organiser cancelled it; their free-text reason. */
  organiserReason?: string;
}

interface SpaceApprovedData {
  email: string;
  organizerName: string;
  spaceName: string;
  spaceSlug: string;
}

interface SpaceRejectedData {
  email: string;
  organizerName: string;
  spaceName: string;
  rejectionReason: string;
}

interface NewSpaceSubmittedData {
  adminEmail: string;
  spaceName: string;
  organizerName: string;
  organizerMobile: string;
  spaceDescription?: string;
  submittedAt: string;
}

interface CheckinConfirmationData {
  email: string;
  userName: string;
  eventTitle: string;
  checkedInAt: string;
}

interface EventReminderData {
  email: string;
  userName: string;
  eventTitle: string;
  eventDate: string;
  eventTime: string;
  venueName?: string;
  city?: string;
  isOnline: boolean;
  onlineUrl?: string;
  qrCode: string;
  ticketCode?: string;
}

interface CertificateIssuedData {
  email: string;
  recipientName: string;
  eventTitle: string;
  /** The space/organiser that issued the certificate. */
  issuerName: string;
  certificateNumber: string;
  /** Public verify page for this certificate (carries the QR code too). */
  verifyUrl: string;
  /** Direct link to the rendered PDF in storage. */
  pdfUrl: string;
}


// NEW INTERFACES FOR ADDITIONAL EMAIL METHODS

interface PasswordlessLoginLinkData {
  email: string;
  userName: string;
  loginLink: string;
  expiresInMinutes: number;
}

interface AccountDeactivatedData {
  email: string;
  userName: string;
  reason?: string;
}

interface EmailVerificationData {
  email: string;
  userName: string;
  verificationLink: string;
}

interface AccountSuspendedData {
  email: string;
  userName: string;
  reason: string;
  suspendedUntil?: string;
}

interface AccountReactivatedData {
  email: string;
  userName: string;
}

interface NewDeviceLoginData {
  email: string;
  userName: string;
  device: string;
  location: string;
  time: string;
  loginLink: string;
}

interface SuspiciousActivityData {
  email: string;
  userName: string;
  activityDescription: string;
  time: string;
}

interface EventCancelledData {
  email: string;
  userName: string;
  eventTitle: string;
  eventDate: string;
  cancellationReason?: string;
  refundInfo?: string;
}

interface EventUpdatedData {
  email: string;
  userName: string;
  eventTitle: string;
  changes: { field: string; oldValue: string; newValue: string }[];
  newDate?: string;
  newTime?: string;
  newVenue?: string;
}

interface EventPublishedData {
  email: string;
  userName: string;
  eventTitle: string;
  eventDate: string;
  eventTime: string;
  venueName?: string;
  city?: string;
  isOnline: boolean;
  spaceName: string;
  registrationUrl: string;
}

interface WaitlistConfirmationData {
  email: string;
  userName: string;
  eventTitle: string;
  eventDate: string;
  waitlistPosition: number;
}

interface WaitlistPromotedData {
  email: string;
  userName: string;
  eventTitle: string;
  eventDate: string;
  eventTime: string;
  venueName?: string;
  city?: string;
  isOnline: boolean;
  onlineUrl?: string;
  registrationUrl: string;
  /** Hours to pay before the seat is released, or null when the hold has no deadline. */
  expiresInHours: number | null;
  /**
   * What the attendee owes to claim the spot, in INR. 0 means the ticket is
   * free and the spot is already confirmed — the email must not then ask for
   * payment or imply the seat can still be lost.
   */
  amountDue?: number;
}

interface WaitlistRevokedData {
  email: string;
  userName: string;
  eventTitle: string;
  eventDate: string;
  /** Where they can re-join the queue if they still want in. */
  registrationUrl: string;
}

interface EventSummaryData {
  email: string;
  userName: string;
  eventTitle: string;
  attendeeCount: number;
  photosUrl?: string;
}

interface EventStartingSoonData {
  email: string;
  userName: string;
  eventTitle: string;
  startsInMinutes: number;
  venueName?: string;
  city?: string;
  isOnline: boolean;
  onlineUrl?: string;
  qrCode: string;
}

interface SpeakerInvitationData {
  email: string;
  speakerName: string;
  eventTitle: string;
  eventDate: string;
  eventTime: string;
  organizerName: string;
  acceptUrl: string;
  declineUrl: string;
}

interface SpaceMemberJoinedData {
  email: string;
  organizerName: string;
  spaceName: string;
  memberName: string;
  totalMembers: number;
}

interface CoOrganizerInvitedData {
  email: string;
  inviteeName: string;
  spaceName: string;
  inviterName: string;
  acceptUrl: string;
}

interface CoOrganizerRemovedData {
  email: string;
  userName: string;
  spaceName: string;
}

interface ParentSpaceRequestSubmittedData {
  email: string;
  organizerName: string;
  spaceName: string;
  parentSpaceName: string;
}

interface ParentSpaceRequestApprovedData {
  email: string;
  organizerName: string;
  spaceName: string;
  parentSpaceName: string;
}

interface ParentSpaceRequestRejectedData {
  email: string;
  organizerName: string;
  spaceName: string;
  parentSpaceName: string;
  reason?: string;
}

interface SpaceSuspendedData {
  email: string;
  organizerName: string;
  spaceName: string;
  reason: string;
}

interface SpaceArchivedData {
  email: string;
  organizerName: string;
  spaceName: string;
}

interface PaymentFailedData {
  email: string;
  userName: string;
  eventTitle: string;
  amount: number;
  reason?: string;
  retryUrl: string;
}

interface RefundProcessedData {
  email: string;
  userName: string;
  eventTitle: string;
  refundAmount: number;
  paymentId: string;
  processingDays: number;
}

interface SubscriptionActivatedData {
  email: string;
  userName: string;
  plan: string;
  billingCycle: string;
  amount: number;
  expiresAt?: string;
  features: string[];
}

interface SubscriptionCancelledData {
  email: string;
  userName: string;
  plan: string;
  expiresAt: string;
}

interface SubscriptionExpiringData {
  email: string;
  userName: string;
  plan: string;
  expiresAt: string;
  renewUrl: string;
}

interface SubscriptionExpiredData {
  email: string;
  userName: string;
  plan: string;
  downgradedTo: string;
}

interface SubscriptionUpgradedData {
  email: string;
  userName: string;
  fromPlan: string;
  toPlan: string;
  newFeatures: string[];
}

interface SubscriptionDowngradedData {
  email: string;
  userName: string;
  fromPlan: string;
  toPlan: string;
}

interface InvoiceData {
  email: string;
  userName: string;
  invoiceNumber: string;
  plan: string;
  amount: number;
  billingDate: string;
  billingCycle: string;
  paymentId: string;
}

interface DailyAdminDigestData {
  adminEmail: string;
  date: string;
  newUsers: number;
  newSpaces: number;
  newEvents: number;
  totalRegistrations: number;
  totalRevenue: number;
  activeUsers: number;
}

interface WeeklyReportData {
  adminEmail: string;
  weekStarting: string;
  metrics: { label: string; value: string; change: string }[];
}

interface MonthlyInvoiceSummaryData {
  adminEmail: string;
  month: string;
  totalRevenue: number;
  totalTransactions: number;
  topEvents: { title: string; revenue: number }[];
}

interface CustomCampaignData {
  to: string | string[];
  subject: string;
  html: string;
  campaignId: string;
}

interface BankAccountRejectedData {
  email: string;
  userName: string;
  bankName: string;
  accountNumber: string; // last 4 digits only
  rejectionReason: string;
}


// =====================================================
// EMAIL SERVICE
// =====================================================

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly resend: Resend;
  private readonly sesClient: SESClient;
  private readonly fromTransactional: string;
  private readonly fromBulk: string;
  // The bare transactional sending address (no display name). White-label lets a
  // space swap the display name in front of this same verified address.
  private readonly transactionalAddress: string;

  constructor(private readonly configService: ConfigService) {
    // Resend client for transactional emails
    const resendApiKey = this.configService.get<string>('RESEND_API_KEY');
    if (!resendApiKey) {
      this.logger.warn('RESEND_API_KEY not configured. Transactional emails will not work.');
    }
    this.resend = new Resend(resendApiKey);
    const transactionalAddress = this.configService.get<string>(
      'EMAIL_FROM_TRANSACTIONAL',
      'no-reply@notify.unifesto.app',
    );
    this.transactionalAddress = transactionalAddress;
    this.fromTransactional = `Unifesto <${transactionalAddress}>`;

    // SES client for bulk emails
    const sesRegion = this.configService.get<string>('AWS_SES_REGION', 'ap-south-1');
    this.sesClient = new SESClient({ region: sesRegion });
    const bulkAddress = this.configService.get<string>(
      'EMAIL_FROM_BULK',
      'no-reply@updates.unifesto.app',
    );
    this.fromBulk = `Unifesto <${bulkAddress}>`;
  }

  /**
   * Public wrapper to send a raw transactional email via Resend.
   */
  async sendRawEmail(to: string, subject: string, html: string): Promise<string | null> {
    return this.sendViaResend(to, subject, html);
  }

  async sendBankAccountRejected(data: BankAccountRejectedData): Promise<void> {
    try {
      await this.sendViaResend(
        data.email,
        'Bank account verification failed — Unifesto',
        `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
            <h2 style="color:#dc2626">Bank Account Verification Failed</h2>
            <p>Hi ${data.userName},</p>
            <p>Unfortunately, we were unable to verify your bank account ending in <strong>****${data.accountNumber}</strong> at <strong>${data.bankName}</strong>.</p>
            <p><strong>Reason:</strong> ${data.rejectionReason}</p>
            <p>Please update your bank account details in the Apex dashboard and resubmit for verification.</p>
            <a href="https://apex.unifesto.app/dashboard/payouts" style="display:inline-block;margin-top:16px;padding:12px 24px;background:#7c3aed;color:white;text-decoration:none;border-radius:8px">Update Bank Account</a>
            <p style="margin-top:24px;color:#6b7280;font-size:14px">If you have questions, contact us at support@unifesto.app</p>
          </div>
        `,
      );
    } catch (error) {
      this.logger.error('Error sending bank account rejected email', error);
    }
  }

  // =====================================================
  // PRIVATE SEND METHODS
  // =====================================================

  /**
   * Send email via Resend (for transactional emails)
   */
  protected async sendViaResend(
    to: string,
    subject: string,
    html: string,
    attachments?: Array<{ filename: string; content: Buffer }>,
    sender?: { fromName?: string | null; replyTo?: string | null },
  ): Promise<string | null> {
    try {
      // White-label: swap the display name in front of the same verified
      // sending address, and route replies to the organiser. Address/domain are
      // never changed here — that needs domain verification, a separate feature.
      const from = sender?.fromName
        ? `${sender.fromName} <${this.transactionalAddress}>`
        : this.fromTransactional;

      const { data, error } = await this.resend.emails.send({
        from,
        to,
        subject,
        html,
        ...(sender?.replyTo ? { replyTo: sender.replyTo } : {}),
        // Only include the key when there's something to attach — an empty array
        // is harmless but this keeps the payload identical for the common case.
        ...(attachments?.length ? { attachments } : {}),
      });

      if (error) {
        this.logger.error(`Resend error: ${error.message}`);
        return null;
      }

      return data?.id || null;
    } catch (error) {
      this.logger.error(`Resend exception: ${error.message}`);
      return null;
    }
  }

  /**
   * Send email via AWS SES (for bulk emails)
   */
  private async sendViaSES(
    to: string | string[],
    subject: string,
    html: string,
  ): Promise<string | null> {
    try {
      const toAddresses = Array.isArray(to) ? to : [to];

      const command = new SendEmailCommand({
        Source: this.fromBulk,
        Destination: { ToAddresses: toAddresses },
        Message: {
          Subject: { Data: subject, Charset: 'UTF-8' },
          Body: { Html: { Data: html, Charset: 'UTF-8' } },
        },
      });

      const result = await this.sesClient.send(command);
      return result.MessageId || null;
    } catch (error) {
      this.logger.error(`SES error: ${error.message}`);
      return null;
    }
  }

  // =====================================================
  // EXISTING 11 TRANSACTIONAL EMAIL METHODS (Updated to use sendViaResend)
  // =====================================================

  /**
   * Send OTP email
   */
  async sendOtpEmail(email: string, otp: string): Promise<void> {
    if (!email) return;

    try {
      const messageId = await this.sendViaSES(
        email,
        'Your Unifesto Login Code',
        this.getOtpEmailTemplate(otp),
      );

      if (messageId) {
        this.logger.log(`OTP email sent to ${email}, ID: ${messageId}`);
      } else {
        this.logger.error(`Failed to send OTP email to ${email}`);
      }
    } catch (error) {
      this.logger.error('Error sending OTP email', error);
    }
  }

  /**
   * Send welcome email
   */
  async sendWelcomeEmail(email: string, userName: string): Promise<void> {
    if (!email) return;

    try {
      const messageId = await this.sendViaSES(
        email,
        'Welcome to Unifesto',
        this.getWelcomeEmailTemplate(userName),
      );

      if (messageId) {
        this.logger.log(`Welcome email sent to ${email}, ID: ${messageId}`);
      } else {
        this.logger.error(`Failed to send welcome email to ${email}`);
      }
    } catch (error) {
      this.logger.error('Error sending welcome email', error);
    }
  }

  /**
   * Send registration confirmation email
   */
  /**
   * Build a single `event.ics` attachment from the raw event fields on the
   * confirmation payload, or `undefined` when they're absent (so the email
   * simply sends without an attachment). Failures are swallowed to a warning —
   * a broken ICS must never block the confirmation email itself.
   */
  private buildIcsAttachment(
    data: RegistrationConfirmationData,
  ): Array<{ filename: string; content: Buffer }> | undefined {
    if (
      !data.eventSlug ||
      !data.eventStartDateTime ||
      !data.eventEndDateTime ||
      !data.eventTimezone
    ) {
      return undefined;
    }
    try {
      const input: IcsEventInput = {
        id: data.eventSlug, // slug is stable + unique; fine as the UID anchor here
        slug: data.eventSlug,
        title: data.eventTitle,
        description: data.eventDescription ?? null,
        startDateTime: data.eventStartDateTime,
        endDateTime: data.eventEndDateTime,
        timezone: data.eventTimezone,
        type: data.eventType ?? (data.isOnline ? 'ONLINE' : 'IN_PERSON'),
        venueName: data.venueName ?? null,
        venueAddress: data.venueAddress ?? null,
        city: data.city ?? null,
        onlineUrl: data.onlineUrl ?? null,
        organiserName: data.organiserName ?? null,
      };
      return [
        { filename: 'event.ics', content: Buffer.from(buildEventIcs(input), 'utf8') },
      ];
    } catch (error) {
      this.logger.warn(`Failed to build .ics attachment: ${error.message}`);
      return undefined;
    }
  }

  async sendRegistrationConfirmation(data: RegistrationConfirmationData): Promise<void> {
    if (!data.email) return;

    try {
      const attachments = this.buildIcsAttachment(data);
      const messageId = await this.sendViaResend(
        data.email,
        `You're registered for ${data.eventTitle}`,
        this.getRegistrationConfirmationTemplate(data),
        attachments,
        { fromName: data.brandFromName, replyTo: data.brandReplyTo },
      );

      if (messageId) {
        this.logger.log(`Registration confirmation sent to ${data.email}, ID: ${messageId}`);
      }
    } catch (error) {
      this.logger.error('Error sending registration confirmation email', error);
    }
  }

  /**
   * Send payment confirmation email
   */
  async sendPaymentConfirmation(data: PaymentConfirmationData): Promise<void> {
    if (!data.email) return;

    try {
      const messageId = await this.sendViaResend(
        data.email,
        `Payment confirmed for ${data.eventTitle}`,
        this.getPaymentConfirmationTemplate(data),
      );

      if (messageId) {
        this.logger.log(`Payment confirmation sent to ${data.email}, ID: ${messageId}`);
      }
    } catch (error) {
      this.logger.error('Error sending payment confirmation email', error);
    }
  }

  /**
   * Send cancellation confirmation email
   */
  async sendCancellationConfirmation(data: CancellationConfirmationData): Promise<void> {
    if (!data.email) return;

    try {
      const messageId = await this.sendViaResend(
        data.email,
        `Registration cancelled for ${data.eventTitle}`,
        this.getCancellationConfirmationTemplate(data),
      );

      if (messageId) {
        this.logger.log(`Cancellation confirmation sent to ${data.email}, ID: ${messageId}`);
      }
    } catch (error) {
      this.logger.error('Error sending cancellation confirmation email', error);
    }
  }

  /**
   * Send space approved email
   */
  async sendSpaceApproved(data: SpaceApprovedData): Promise<void> {
    if (!data.email) return;

    try {
      const messageId = await this.sendViaResend(
        data.email,
        `Your space ${data.spaceName} is approved`,
        this.getSpaceApprovedTemplate(data),
      );

      if (messageId) {
        this.logger.log(`Space approved email sent to ${data.email}, ID: ${messageId}`);
      }
    } catch (error) {
      this.logger.error('Error sending space approved email', error);
    }
  }

  /**
   * Send space rejected email
   */
  async sendSpaceRejected(data: SpaceRejectedData): Promise<void> {
    if (!data.email) return;

    try {
      const messageId = await this.sendViaResend(
        data.email,
        `Space review update for ${data.spaceName}`,
        this.getSpaceRejectedTemplate(data),
      );

      if (messageId) {
        this.logger.log(`Space rejected email sent to ${data.email}, ID: ${messageId}`);
      }
    } catch (error) {
      this.logger.error('Error sending space rejected email', error);
    }
  }

  /**
   * Send new space submitted notification to admin
   */
  async sendNewSpaceSubmittedToAdmin(data: NewSpaceSubmittedData): Promise<void> {
    if (!data.adminEmail) return;

    try {
      const messageId = await this.sendViaResend(
        data.adminEmail,
        `New space submitted: ${data.spaceName}`,
        this.getNewSpaceSubmittedTemplate(data),
      );

      if (messageId) {
        this.logger.log(`New space submitted notification sent to ${data.adminEmail}, ID: ${messageId}`);
      }
    } catch (error) {
      this.logger.error('Error sending new space submitted email', error);
    }
  }

  /**
   * Send check-in confirmation email
   */
  async sendCheckinConfirmation(data: CheckinConfirmationData): Promise<void> {
    if (!data.email) return;

    try {
      const messageId = await this.sendViaResend(
        data.email,
        `You're checked in - ${data.eventTitle}`,
        this.getCheckinConfirmationTemplate(data),
      );

      if (messageId) {
        this.logger.log(`Checkin confirmation sent to ${data.email}, ID: ${messageId}`);
      }
    } catch (error) {
      this.logger.error('Error sending checkin confirmation email', error);
    }
  }

  /**
   * Send event reminder email
   */
  async sendEventReminder(data: EventReminderData): Promise<void> {
    if (!data.email) return;

    try {
      const messageId = await this.sendViaResend(
        data.email,
        `Tomorrow: ${data.eventTitle}`,
        this.getEventReminderTemplate(data),
      );

      if (messageId) {
        this.logger.log(`Event reminder sent to ${data.email}, ID: ${messageId}`);
      }
    } catch (error) {
      this.logger.error('Error sending event reminder email', error);
    }
  }

  /**
   * Email a recipient a link to their freshly-issued certificate. Delivery is
   * link-based: the email points at the public verify page and the PDF in
   * storage, so no attachment support is needed on the transport.
   *
   * Sent via AWS SES (the BULK channel), NOT Resend: certificates go out a whole
   * batch at a time, which blows Resend's low daily transactional quota — the
   * "reached your daily email sending quota" flood. SES has the throughput for
   * batch sends. Like the other mail helpers this swallows its own errors — a
   * certificate is already rendered, stored, and recorded before we get here, so
   * a mail failure must never fail the issuance.
   *
   * Returns whether the send was accepted, so the caller can stamp `emailedAt`
   * only on success (a failed or skipped send leaves it null → "needs resend").
   */
  async sendCertificateIssued(data: CertificateIssuedData): Promise<boolean> {
    if (!data.email) return false;

    try {
      const messageId = await this.sendViaSES(
        data.email,
        `Your certificate for ${data.eventTitle}`,
        this.getCertificateIssuedTemplate(data),
      );

      if (messageId) {
        this.logger.log(
          `Certificate email sent to ${data.email}, ID: ${messageId}`,
        );
        return true;
      }
      return false;
    } catch (error) {
      this.logger.error('Error sending certificate email', error);
      return false;
    }
  }

  private getCertificateIssuedTemplate(data: CertificateIssuedData): string {
    return `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
        <h2 style="color:#7c3aed">Your certificate is ready</h2>
        <p>Hi ${data.recipientName},</p>
        <p><strong>${data.issuerName}</strong> has issued your certificate for <strong>${data.eventTitle}</strong>.</p>
        <p style="color:#6b7280;font-size:14px">Certificate number: <strong>${data.certificateNumber}</strong></p>
        <a href="${data.pdfUrl}" style="display:inline-block;margin-top:16px;padding:12px 24px;background:#7c3aed;color:white;text-decoration:none;border-radius:8px">Download my certificate</a>
        <p style="margin-top:20px">Anyone can confirm it is genuine at your verification page:</p>
        <p><a href="${data.verifyUrl}" style="color:#7c3aed">${data.verifyUrl}</a></p>
        <p style="margin-top:24px;color:#6b7280;font-size:14px">Questions? Reach us at support@unifesto.app</p>
      </div>
    `;
  }


  // =====================================================
  // AUTH & ACCOUNTS (7 NEW METHODS)
  // =====================================================

  async sendPasswordlessLoginLink(data: PasswordlessLoginLinkData): Promise<void> {
    if (!data.email) return;
    try {
      const messageId = await this.sendViaSES(
        data.email,
        'Your Unifesto login link',
        this.getPasswordlessLoginLinkTemplate(data),
      );
      if (messageId) this.logger.log(`Passwordless login link sent to ${data.email}`);
    } catch (error) {
      this.logger.error('Error sending passwordless login link', error);
    }
  }

  async sendAccountDeactivated(data: AccountDeactivatedData): Promise<void> {
    if (!data.email) return;
    try {
      const messageId = await this.sendViaSES(
        data.email,
        'Your Unifesto account has been deactivated',
        this.getAccountDeactivatedTemplate(data),
      );
      if (messageId) this.logger.log(`Account deactivated email sent to ${data.email}`);
    } catch (error) {
      this.logger.error('Error sending account deactivated email', error);
    }
  }

  async sendEmailVerification(data: EmailVerificationData): Promise<void> {
    if (!data.email) return;
    try {
      const messageId = await this.sendViaSES(
        data.email,
        'Verify your email address',
        this.getEmailVerificationTemplate(data),
      );
      if (messageId) this.logger.log(`Email verification sent to ${data.email}`);
    } catch (error) {
      this.logger.error('Error sending email verification', error);
    }
  }

  async sendAccountSuspended(data: AccountSuspendedData): Promise<void> {
    if (!data.email) return;
    try {
      const messageId = await this.sendViaSES(
        data.email,
        'Your account has been temporarily suspended',
        this.getAccountSuspendedTemplate(data),
      );
      if (messageId) this.logger.log(`Account suspended email sent to ${data.email}`);
    } catch (error) {
      this.logger.error('Error sending account suspended email', error);
    }
  }

  async sendAccountReactivated(data: AccountReactivatedData): Promise<void> {
    if (!data.email) return;
    try {
      const messageId = await this.sendViaSES(
        data.email,
        'Your account has been reactivated',
        this.getAccountReactivatedTemplate(data),
      );
      if (messageId) this.logger.log(`Account reactivated email sent to ${data.email}`);
    } catch (error) {
      this.logger.error('Error sending account reactivated email', error);
    }
  }

  async sendNewDeviceLogin(data: NewDeviceLoginData): Promise<void> {
    if (!data.email) return;
    try {
      const messageId = await this.sendViaSES(
        data.email,
        'New login detected on your Unifesto account',
        this.getNewDeviceLoginTemplate(data),
      );
      if (messageId) this.logger.log(`New device login email sent to ${data.email}`);
    } catch (error) {
      this.logger.error('Error sending new device login email', error);
    }
  }

  async sendSuspiciousActivity(data: SuspiciousActivityData): Promise<void> {
    if (!data.email) return;
    try {
      const messageId = await this.sendViaSES(
        data.email,
        'Suspicious activity detected on your account',
        this.getSuspiciousActivityTemplate(data),
      );
      if (messageId) this.logger.log(`Suspicious activity email sent to ${data.email}`);
    } catch (error) {
      this.logger.error('Error sending suspicious activity email', error);
    }
  }

  // =====================================================
  // EVENTS (8 NEW METHODS)
  // =====================================================

  async sendEventCancelled(data: EventCancelledData): Promise<void> {
    if (!data.email) return;
    try {
      const messageId = await this.sendViaResend(
        data.email,
        `Event cancelled: ${data.eventTitle}`,
        this.getEventCancelledTemplate(data),
      );
      if (messageId) this.logger.log(`Event cancelled email sent to ${data.email}`);
    } catch (error) {
      this.logger.error('Error sending event cancelled email', error);
    }
  }

  async sendEventUpdated(data: EventUpdatedData): Promise<void> {
    if (!data.email) return;
    try {
      const messageId = await this.sendViaResend(
        data.email,
        `Event details updated: ${data.eventTitle}`,
        this.getEventUpdatedTemplate(data),
      );
      if (messageId) this.logger.log(`Event updated email sent to ${data.email}`);
    } catch (error) {
      this.logger.error('Error sending event updated email', error);
    }
  }

  async sendEventPublished(data: EventPublishedData): Promise<void> {
    if (!data.email) return;
    try {
      const messageId = await this.sendViaResend(
        data.email,
        `New event in ${data.spaceName}: ${data.eventTitle}`,
        this.getEventPublishedTemplate(data),
      );
      if (messageId) this.logger.log(`Event published email sent to ${data.email}`);
    } catch (error) {
      this.logger.error('Error sending event published email', error);
    }
  }

  async sendWaitlistConfirmation(data: WaitlistConfirmationData): Promise<void> {
    if (!data.email) return;
    try {
      const messageId = await this.sendViaResend(
        data.email,
        `You're on the waitlist for ${data.eventTitle}`,
        this.getWaitlistConfirmationTemplate(data),
      );
      if (messageId) this.logger.log(`Waitlist confirmation sent to ${data.email}`);
    } catch (error) {
      this.logger.error('Error sending waitlist confirmation', error);
    }
  }

  async sendWaitlistPromoted(data: WaitlistPromotedData): Promise<void> {
    if (!data.email) return;
    try {
      const messageId = await this.sendViaResend(
        data.email,
        `A spot opened up for ${data.eventTitle}`,
        this.getWaitlistPromotedTemplate(data),
      );
      if (messageId) this.logger.log(`Waitlist promoted email sent to ${data.email}`);
    } catch (error) {
      this.logger.error('Error sending waitlist promoted email', error);
    }
  }

  async sendWaitlistRevoked(data: WaitlistRevokedData): Promise<void> {
    if (!data.email) return;
    try {
      const messageId = await this.sendViaResend(
        data.email,
        `Your spot for ${data.eventTitle} was released`,
        this.getWaitlistRevokedTemplate(data),
      );
      if (messageId) this.logger.log(`Waitlist revoked email sent to ${data.email}`);
    } catch (error) {
      this.logger.error('Error sending waitlist revoked email', error);
    }
  }

  async sendEventSummary(data: EventSummaryData): Promise<void> {
    if (!data.email) return;
    try {
      const messageId = await this.sendViaResend(
        data.email,
        `Thanks for attending ${data.eventTitle}`,
        this.getEventSummaryTemplate(data),
      );
      if (messageId) this.logger.log(`Event summary sent to ${data.email}`);
    } catch (error) {
      this.logger.error('Error sending event summary', error);
    }
  }

  async sendEventStartingSoon(data: EventStartingSoonData): Promise<void> {
    if (!data.email) return;
    try {
      const messageId = await this.sendViaResend(
        data.email,
        `Starting in 1 hour: ${data.eventTitle}`,
        this.getEventStartingSoonTemplate(data),
      );
      if (messageId) this.logger.log(`Event starting soon sent to ${data.email}`);
    } catch (error) {
      this.logger.error('Error sending event starting soon', error);
    }
  }

  async sendSpeakerInvitation(data: SpeakerInvitationData): Promise<void> {
    if (!data.email) return;
    try {
      const messageId = await this.sendViaResend(
        data.email,
        `You're invited to speak at ${data.eventTitle}`,
        this.getSpeakerInvitationTemplate(data),
      );
      if (messageId) this.logger.log(`Speaker invitation sent to ${data.email}`);
    } catch (error) {
      this.logger.error('Error sending speaker invitation', error);
    }
  }

  // =====================================================
  // SPACES (8 NEW METHODS)
  // =====================================================

  async sendSpaceMemberJoined(data: SpaceMemberJoinedData): Promise<void> {
    if (!data.email) return;
    try {
      const messageId = await this.sendViaResend(
        data.email,
        `${data.memberName} joined your space`,
        this.getSpaceMemberJoinedTemplate(data),
      );
      if (messageId) this.logger.log(`Space member joined email sent to ${data.email}`);
    } catch (error) {
      this.logger.error('Error sending space member joined email', error);
    }
  }

  async sendCoOrganizerInvited(data: CoOrganizerInvitedData): Promise<void> {
    if (!data.email) return;
    try {
      const messageId = await this.sendViaResend(
        data.email,
        `You've been invited as co-organiser of ${data.spaceName}`,
        this.getCoOrganizerInvitedTemplate(data),
      );
      if (messageId) this.logger.log(`Co-organizer invited email sent to ${data.email}`);
    } catch (error) {
      this.logger.error('Error sending co-organizer invited email', error);
    }
  }

  async sendCoOrganizerRemoved(data: CoOrganizerRemovedData): Promise<void> {
    if (!data.email) return;
    try {
      const messageId = await this.sendViaResend(
        data.email,
        `You've been removed as co-organiser of ${data.spaceName}`,
        this.getCoOrganizerRemovedTemplate(data),
      );
      if (messageId) this.logger.log(`Co-organizer removed email sent to ${data.email}`);
    } catch (error) {
      this.logger.error('Error sending co-organizer removed email', error);
    }
  }

  async sendParentSpaceRequestSubmitted(data: ParentSpaceRequestSubmittedData): Promise<void> {
    if (!data.email) return;
    try {
      const messageId = await this.sendViaResend(
        data.email,
        `${data.spaceName} requested to join your space`,
        this.getParentSpaceRequestSubmittedTemplate(data),
      );
      if (messageId) this.logger.log(`Parent space request submitted email sent to ${data.email}`);
    } catch (error) {
      this.logger.error('Error sending parent space request submitted email', error);
    }
  }

  async sendParentSpaceRequestApproved(data: ParentSpaceRequestApprovedData): Promise<void> {
    if (!data.email) return;
    try {
      const messageId = await this.sendViaResend(
        data.email,
        `Your request to join ${data.parentSpaceName} was approved`,
        this.getParentSpaceRequestApprovedTemplate(data),
      );
      if (messageId) this.logger.log(`Parent space request approved email sent to ${data.email}`);
    } catch (error) {
      this.logger.error('Error sending parent space request approved email', error);
    }
  }

  async sendParentSpaceRequestRejected(data: ParentSpaceRequestRejectedData): Promise<void> {
    if (!data.email) return;
    try {
      const messageId = await this.sendViaResend(
        data.email,
        `Update on your request to join ${data.parentSpaceName}`,
        this.getParentSpaceRequestRejectedTemplate(data),
      );
      if (messageId) this.logger.log(`Parent space request rejected email sent to ${data.email}`);
    } catch (error) {
      this.logger.error('Error sending parent space request rejected email', error);
    }
  }

  async sendSpaceSuspended(data: SpaceSuspendedData): Promise<void> {
    if (!data.email) return;
    try {
      const messageId = await this.sendViaResend(
        data.email,
        `Your space ${data.spaceName} has been suspended`,
        this.getSpaceSuspendedTemplate(data),
      );
      if (messageId) this.logger.log(`Space suspended email sent to ${data.email}`);
    } catch (error) {
      this.logger.error('Error sending space suspended email', error);
    }
  }

  async sendSpaceArchived(data: SpaceArchivedData): Promise<void> {
    if (!data.email) return;
    try {
      const messageId = await this.sendViaResend(
        data.email,
        `Your space ${data.spaceName} has been archived`,
        this.getSpaceArchivedTemplate(data),
      );
      if (messageId) this.logger.log(`Space archived email sent to ${data.email}`);
    } catch (error) {
      this.logger.error('Error sending space archived email', error);
    }
  }

  // =====================================================
  // PAYMENTS
  // =====================================================

  async sendPaymentFailed(data: PaymentFailedData): Promise<void> {
    if (!data.email) return;
    try {
      const messageId = await this.sendViaResend(
        data.email,
        `Payment failed for ${data.eventTitle}`,
        this.getPaymentFailedTemplate(data),
      );
      if (messageId) this.logger.log(`Payment failed email sent to ${data.email}`);
    } catch (error) {
      this.logger.error('Error sending payment failed email', error);
    }
  }

  async sendRefundProcessed(data: RefundProcessedData): Promise<void> {
    if (!data.email) return;
    try {
      const messageId = await this.sendViaResend(
        data.email,
        `Refund processed for ${data.eventTitle}`,
        this.getRefundProcessedTemplate(data),
      );
      if (messageId) this.logger.log(`Refund processed email sent to ${data.email}`);
    } catch (error) {
      this.logger.error('Error sending refund processed email', error);
    }
  }

  // =====================================================
  // SUBSCRIPTIONS (7 NEW METHODS)
  // =====================================================

  async sendSubscriptionActivated(data: SubscriptionActivatedData): Promise<void> {
    if (!data.email) return;
    try {
      const messageId = await this.sendViaSES(
        data.email,
        `Welcome to Unifesto ${data.plan} plan`,
        this.getSubscriptionActivatedTemplate(data),
      );
      if (messageId) this.logger.log(`Subscription activated email sent to ${data.email}`);
    } catch (error) {
      this.logger.error('Error sending subscription activated email', error);
    }
  }

  async sendSubscriptionCancelled(data: SubscriptionCancelledData): Promise<void> {
    if (!data.email) return;
    try {
      const messageId = await this.sendViaSES(
        data.email,
        `Your ${data.plan} subscription has been cancelled`,
        this.getSubscriptionCancelledTemplate(data),
      );
      if (messageId) this.logger.log(`Subscription cancelled email sent to ${data.email}`);
    } catch (error) {
      this.logger.error('Error sending subscription cancelled email', error);
    }
  }

  async sendSubscriptionExpiring(data: SubscriptionExpiringData): Promise<void> {
    if (!data.email) return;
    try {
      const messageId = await this.sendViaSES(
        data.email,
        `Your ${data.plan} plan expires in 7 days`,
        this.getSubscriptionExpiringTemplate(data),
      );
      if (messageId) this.logger.log(`Subscription expiring email sent to ${data.email} via SES`);
    } catch (error) {
      this.logger.error('Error sending subscription expiring email', error);
    }
  }

  async sendSubscriptionExpired(data: SubscriptionExpiredData): Promise<void> {
    if (!data.email) return;
    try {
      const messageId = await this.sendViaSES(
        data.email,
        `Your ${data.plan} subscription has expired`,
        this.getSubscriptionExpiredTemplate(data),
      );
      if (messageId) this.logger.log(`Subscription expired email sent to ${data.email}`);
    } catch (error) {
      this.logger.error('Error sending subscription expired email', error);
    }
  }

  async sendSubscriptionUpgraded(data: SubscriptionUpgradedData): Promise<void> {
    if (!data.email) return;
    try {
      const messageId = await this.sendViaSES(
        data.email,
        `You've upgraded to ${data.toPlan}`,
        this.getSubscriptionUpgradedTemplate(data),
      );
      if (messageId) this.logger.log(`Subscription upgraded email sent to ${data.email}`);
    } catch (error) {
      this.logger.error('Error sending subscription upgraded email', error);
    }
  }

  async sendSubscriptionDowngraded(data: SubscriptionDowngradedData): Promise<void> {
    if (!data.email) return;
    try {
      const messageId = await this.sendViaSES(
        data.email,
        `Your plan has been changed to ${data.toPlan}`,
        this.getSubscriptionDowngradedTemplate(data),
      );
      if (messageId) this.logger.log(`Subscription downgraded email sent to ${data.email}`);
    } catch (error) {
      this.logger.error('Error sending subscription downgraded email', error);
    }
  }

  async sendInvoice(data: InvoiceData): Promise<void> {
    if (!data.email) return;
    try {
      const messageId = await this.sendViaSES(
        data.email,
        `Invoice #${data.invoiceNumber} from Unifesto`,
        this.getInvoiceTemplate(data),
      );
      if (messageId) this.logger.log(`Invoice sent to ${data.email}`);
    } catch (error) {
      this.logger.error('Error sending invoice', error);
    }
  }

  // =====================================================
  // ADMIN DIGESTS (3 NEW METHODS - Use SES)
  // =====================================================

  async sendDailyAdminDigest(data: DailyAdminDigestData): Promise<void> {
    if (!data.adminEmail) return;
    try {
      const messageId = await this.sendViaSES(
        data.adminEmail,
        `Unifesto Daily Digest - ${data.date}`,
        this.getDailyAdminDigestTemplate(data),
      );
      if (messageId) this.logger.log(`Daily admin digest sent via SES, ID: ${messageId}`);
    } catch (error) {
      this.logger.error('Error sending daily admin digest', error);
    }
  }

  async sendWeeklyReport(data: WeeklyReportData): Promise<void> {
    if (!data.adminEmail) return;
    try {
      const messageId = await this.sendViaSES(
        data.adminEmail,
        `Weekly Report - Week of ${data.weekStarting}`,
        this.getWeeklyReportTemplate(data),
      );
      if (messageId) this.logger.log(`Weekly report sent via SES, ID: ${messageId}`);
    } catch (error) {
      this.logger.error('Error sending weekly report', error);
    }
  }

  async sendMonthlyInvoiceSummary(data: MonthlyInvoiceSummaryData): Promise<void> {
    if (!data.adminEmail) return;
    try {
      const messageId = await this.sendViaSES(
        data.adminEmail,
        `Monthly Revenue Summary - ${data.month}`,
        this.getMonthlyInvoiceSummaryTemplate(data),
      );
      if (messageId) this.logger.log(`Monthly invoice summary sent via SES, ID: ${messageId}`);
    } catch (error) {
      this.logger.error('Error sending monthly invoice summary', error);
    }
  }

  // =====================================================
  // ADMIN CUSTOM CAMPAIGNS (Use SES)
  // =====================================================

  /**
   * Send custom campaign email via SES
   * Used by AdminEmailService for bulk campaigns
   * Returns messageId for logging, never throws
   */
  async sendCustomCampaignEmail(data: CustomCampaignData): Promise<{ messageId: string | null; error?: string }> {
    try {
      const messageId = await this.sendViaSES(data.to, data.subject, data.html);
      return { messageId };
    } catch (error) {
      this.logger.error(`Error sending custom campaign ${data.campaignId}: ${error.message}`);
      return { messageId: null, error: error.message };
    }
  }

  /**
   * Wrap a campaign body in the standard branded shell (header gradient + logo,
   * footer with links). Exposed for the campaign engine so operator-authored
   * bodies can opt into consistent Unifesto branding without every composer
   * re-pasting the boilerplate. `content` is the inner HTML; the wrapper adds
   * the `<html>`/`<head>` and footer.
   */
  wrapCampaignHtml(content: string): string {
    return this.emailWrapper(`${this.logoHeader()}<div class="content">${content}</div>`);
  }

  // =====================================================
  // TEMPLATE HELPER METHODS
  // =====================================================

  private emailWrapper(content: string): string {
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Agrandir:wght@400;600;700&display=swap');
          body { margin: 0; padding: 0; font-family: 'Agrandir', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background-color: #f5f5f5; }
          .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; }
          .gradient-bg { background: linear-gradient(135deg, #3491ff 0%, #0062ff 100%); padding: 40px 20px; text-align: center; }
          .logo { max-width: 180px; height: auto; }
          .content { padding: 40px 30px; color: #1a1a1a; line-height: 1.6; }
          .heading { font-size: 24px; font-weight: 700; color: #1a1a1a; margin: 0 0 20px 0; }
          .text { font-size: 16px; color: #4a4a4a; margin: 0 0 16px 0; }
          .cta-button { display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #3491ff 0%, #0062ff 100%); color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; margin: 24px 0; }
          .accent-box { background: #f0f7ff; border-left: 4px solid #3491ff; padding: 16px; margin: 20px 0; border-radius: 4px; }
          .footer { padding: 30px 20px; text-align: center; color: #888; font-size: 14px; background-color: #f9f9f9; }
          .footer a { color: #3491ff; text-decoration: none; }
        </style>
      </head>
      <body>
        <div class="container">
          ${content}
          ${this.footer()}
        </div>
      </body>
      </html>
    `;
  }

  private logoHeader(): string {
    const bucketUrl = this.configService.get<string>(
      'S3_BUCKET_URL',
      'https://unifesto-storage-bucket.s3.ap-south-1.amazonaws.com',
    );
    const logoUrl = `${bucketUrl}/brand/logo-black.png`;
    return `
      <div class="gradient-bg">
        <img src="${logoUrl}" alt="Unifesto" class="logo" />
      </div>
    `;
  }

  private footer(): string {
    return `
      <div class="footer">
        <p>Unifesto</p>
        <p>
          <a href="https://unifesto.app">Visit Website</a> |
          <a href="https://unifesto.app/privacy">Privacy Policy</a> |
          <a href="https://unifesto.app/terms">Terms of Service</a>
        </p>
        <p>Questions? Reply to this email or contact us at support@unifesto.app</p>
      </div>
    `;
  }

  private ctaButton(text: string, url: string): string {
    return `<a href="${url}" class="cta-button">${text}</a>`;
  }

  private accentBox(content: string): string {
    return `<div class="accent-box">${content}</div>`;
  }

  private eventDetailsCard(data: { eventTitle: string; eventDate: string; eventTime: string; venueName?: string; city?: string; isOnline: boolean; onlineUrl?: string }): string {
    const location = data.isOnline
      ? `<p class="text"><strong>Online Event:</strong> <a href="${data.onlineUrl}">${data.onlineUrl}</a></p>`
      : `<p class="text"><strong>Venue:</strong> ${data.venueName}${data.city ? `, ${data.city}` : ''}</p>`;
    
    return this.accentBox(`
      <p class="text" style="margin: 0 0 8px 0;"><strong>${data.eventTitle}</strong></p>
      <p class="text"><strong>Date:</strong> ${data.eventDate}</p>
      <p class="text"><strong>Time:</strong> ${data.eventTime}</p>
      ${location}
    `);
  }


  // =====================================================
  // EXISTING 11 TEMPLATE METHODS
  // =====================================================

  private getOtpEmailTemplate(otp: string): string {
    return this.emailWrapper(`
      ${this.logoHeader()}
      <div class="content">
        <h1 class="heading">Your Login Code</h1>
        <p class="text">Hi there,</p>
        <p class="text">Use this code to log in to your Unifesto account:</p>
        ${this.accentBox(`<p style="font-size: 32px; font-weight: 700; color: #3491ff; text-align: center; margin: 0;">${otp}</p>`)}
        <p class="text">This code expires in 10 minutes. Don't share it with anyone.</p>
        <p class="text">If you didn't request this code, please ignore this email.</p>
      </div>
    `);
  }

  private getWelcomeEmailTemplate(userName: string): string {
    return this.emailWrapper(`
      ${this.logoHeader()}
      <div class="content">
        <h1 class="heading">Welcome to Unifesto, ${userName}</h1>
        <p class="text">We're excited to have you here. Unifesto connects you with communities, events, and experiences that matter.</p>
        <p class="text">Here's what you can do:</p>
        <ul class="text">
          <li>Discover local events and communities</li>
          <li>RSVP to events and meet like-minded people</li>
          <li>Create your own space and host events</li>
        </ul>
        ${this.ctaButton('Explore Events', 'https://unifesto.app/events')}
        <p class="text">Have questions? We're here to help.</p>
      </div>
    `);
  }

  private getRegistrationConfirmationTemplate(data: RegistrationConfirmationData): string {
    return this.emailWrapper(`
      ${this.logoHeader()}
      <div class="content">
        <h1 class="heading">You're registered, ${data.userName}</h1>
        <p class="text">Your spot is confirmed for:</p>
        ${this.eventDetailsCard(data)}
        ${data.ticketCode ? this.accentBox(`<p class="text"><strong>Ticket Code:</strong> ${data.ticketCode}</p>`) : ''}
        <p class="text">Show this QR code at check-in:</p>
        <div style="text-align: center; margin: 20px 0;">
          <img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(data.qrCode)}" alt="QR Code" width="200" height="200" style="max-width: 200px;" />
        </div>
        <p class="text">See you there!</p>
      </div>
    `);
  }

  private getPaymentConfirmationTemplate(data: PaymentConfirmationData): string {
    return this.emailWrapper(`
      ${this.logoHeader()}
      <div class="content">
        <h1 class="heading">Payment Confirmed</h1>
        <p class="text">Hi ${data.userName},</p>
        <p class="text">Your payment has been processed successfully.</p>
        ${this.eventDetailsCard(data)}
        ${this.accentBox(`
          <p class="text"><strong>Payment Breakdown:</strong></p>
          <p class="text">Amount Paid: ₹${data.amount}</p>
          <p class="text">Processing Fee: ₹${data.processingFee}</p>
          <p class="text"><strong>Payment ID:</strong> ${data.razorpayPaymentId}</p>
        `)}
        <div style="text-align: center; margin: 20px 0;">
          <img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(data.qrCode)}" alt="QR Code" width="200" height="200" style="max-width: 200px;" />
        </div>
        ${data.ticketCode ? `<p class="text">Ticket Code: ${data.ticketCode}</p>` : ''}
        <p class="text">See you at the event!</p>
      </div>
    `);
  }

  /** Organiser-typed text goes into HTML, so neutralise markup. */
  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private getCancellationConfirmationTemplate(data: CancellationConfirmationData): string {
    const refundText = data.razorpayRefundInitiated && data.razorpayRefundAmount
      ? `<p class="text">A refund of ₹${data.razorpayRefundAmount} has been initiated. It will reflect in your account within 5-7 business days.</p>`
      : '';
    const reasonText = data.organiserReason
      ? `<p class="text"><strong>Reason from the organiser:</strong> ${this.escapeHtml(data.organiserReason)}</p>`
      : '';

    return this.emailWrapper(`
      ${this.logoHeader()}
      <div class="content">
        <h1 class="heading">Registration Cancelled</h1>
        <p class="text">Hi ${data.userName},</p>
        <p class="text">Your registration for <strong>${data.eventTitle}</strong> has been cancelled${data.organiserReason ? ' by the organiser' : ''}.</p>
        ${reasonText ? this.accentBox(reasonText) : ''}
        ${refundText ? this.accentBox(refundText) : ''}
        <p class="text">You can explore other events and register anytime.</p>
        ${this.ctaButton('Browse Events', 'https://unifesto.app/event')}
      </div>
    `);
  }

  private getSpaceApprovedTemplate(data: SpaceApprovedData): string {
    const spaceUrl = `https://unifesto.app/space/${data.spaceSlug}`;
    return this.emailWrapper(`
      ${this.logoHeader()}
      <div class="content">
        <h1 class="heading">Your Space is Live</h1>
        <p class="text">Hi ${data.organizerName},</p>
        <p class="text">Great news! Your space <strong>${data.spaceName}</strong> has been approved and is now live on Unifesto.</p>
        <p class="text">You can now:</p>
        <ul class="text">
          <li>Create and publish events</li>
          <li>Invite members to join your community</li>
          <li>Grow your audience and host amazing experiences</li>
        </ul>
        ${this.ctaButton('Go to Your Space', spaceUrl)}
        <p class="text">Let's build something great together.</p>
      </div>
    `);
  }

  private getSpaceRejectedTemplate(data: SpaceRejectedData): string {
    return this.emailWrapper(`
      ${this.logoHeader()}
      <div class="content">
        <h1 class="heading">Space Review Update</h1>
        <p class="text">Hi ${data.organizerName},</p>
        <p class="text">Thank you for submitting <strong>${data.spaceName}</strong>. After review, we're unable to approve it at this time.</p>
        ${this.accentBox(`<p class="text"><strong>Reason:</strong> ${data.rejectionReason}</p>`)}
        <p class="text">You can make changes and resubmit your space. If you have questions, reach out to us at support@unifesto.app.</p>
      </div>
    `);
  }

  private getNewSpaceSubmittedTemplate(data: NewSpaceSubmittedData): string {
    return this.emailWrapper(`
      ${this.logoHeader()}
      <div class="content">
        <h1 class="heading">New Space Submission</h1>
        <p class="text">A new space has been submitted for review.</p>
        ${this.accentBox(`
          <p class="text"><strong>Space Name:</strong> ${data.spaceName}</p>
          <p class="text"><strong>Organiser:</strong> ${data.organizerName}</p>
          <p class="text"><strong>Mobile:</strong> ${data.organizerMobile}</p>
          <p class="text"><strong>Description:</strong> ${data.spaceDescription || 'N/A'}</p>
          <p class="text"><strong>Submitted At:</strong> ${data.submittedAt}</p>
        `)}
        ${this.ctaButton('Review Space', 'https://admin.unifesto.app/space/pending')}
      </div>
    `);
  }

  private getCheckinConfirmationTemplate(data: CheckinConfirmationData): string {
    return this.emailWrapper(`
      ${this.logoHeader()}
      <div class="content">
        <h1 class="heading">You're Checked In</h1>
        <p class="text">Hi ${data.userName},</p>
        <p class="text">You've successfully checked in to <strong>${data.eventTitle}</strong> at ${data.checkedInAt}.</p>
        <p class="text">Thanks for attending! We hope you have a great experience.</p>
      </div>
    `);
  }

  private getEventReminderTemplate(data: EventReminderData): string {
    return this.emailWrapper(`
      ${this.logoHeader()}
      <div class="content">
        <h1 class="heading">Event Tomorrow</h1>
        <p class="text">Hi ${data.userName},</p>
        <p class="text">Just a friendly reminder about your upcoming event:</p>
        ${this.eventDetailsCard(data)}
        <div style="text-align: center; margin: 20px 0;">
          <img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(data.qrCode)}" alt="QR Code" width="200" height="200" style="max-width: 200px;" />
        </div>
        ${data.ticketCode ? `<p class="text">Ticket Code: ${data.ticketCode}</p>` : ''}
        <p class="text">See you soon!</p>
      </div>
    `);
  }

  // =====================================================
  // AUTH & ACCOUNT TEMPLATES (7 NEW)
  // =====================================================

  private getPasswordlessLoginLinkTemplate(data: PasswordlessLoginLinkData): string {
    return this.emailWrapper(`
      ${this.logoHeader()}
      <div class="content">
        <h1 class="heading">Your Login Link</h1>
        <p class="text">Hi ${data.userName},</p>
        <p class="text">Click the button below to log in to your Unifesto account:</p>
        ${this.ctaButton('Log In to Unifesto', data.loginLink)}
        <p class="text">This link expires in ${data.expiresInMinutes} minutes and can only be used once.</p>
        <p class="text">If you didn't request this link, please ignore this email.</p>
      </div>
    `);
  }

  private getAccountDeactivatedTemplate(data: AccountDeactivatedData): string {
    return this.emailWrapper(`
      ${this.logoHeader()}
      <div class="content">
        <h1 class="heading">Account Deactivated</h1>
        <p class="text">Hi ${data.userName},</p>
        <p class="text">Your Unifesto account has been deactivated as requested.</p>
        ${data.reason ? this.accentBox(`<p class="text"><strong>Reason:</strong> ${data.reason}</p>`) : ''}
        <p class="text">You can reactivate your account anytime by logging in again. Your data will be preserved.</p>
        <p class="text">We're sorry to see you go. If you have feedback, we'd love to hear it at support@unifesto.app.</p>
      </div>
    `);
  }

  private getEmailVerificationTemplate(data: EmailVerificationData): string {
    return this.emailWrapper(`
      ${this.logoHeader()}
      <div class="content">
        <h1 class="heading">Verify Your Email</h1>
        <p class="text">Hi ${data.userName},</p>
        <p class="text">Please verify your email address to complete your Unifesto account setup.</p>
        ${this.ctaButton('Verify Email', data.verificationLink)}
        <p class="text">If you didn't create a Unifesto account, please ignore this email.</p>
      </div>
    `);
  }

  private getAccountSuspendedTemplate(data: AccountSuspendedData): string {
    return this.emailWrapper(`
      ${this.logoHeader()}
      <div class="content">
        <h1 class="heading">Account Temporarily Suspended</h1>
        <p class="text">Hi ${data.userName},</p>
        <p class="text">Your Unifesto account has been temporarily suspended.</p>
        ${this.accentBox(`
          <p class="text"><strong>Reason:</strong> ${data.reason}</p>
          ${data.suspendedUntil ? `<p class="text"><strong>Suspended Until:</strong> ${data.suspendedUntil}</p>` : ''}
        `)}
        <p class="text">If you believe this is a mistake or have questions, please contact us at support@unifesto.app.</p>
      </div>
    `);
  }

  private getAccountReactivatedTemplate(data: AccountReactivatedData): string {
    return this.emailWrapper(`
      ${this.logoHeader()}
      <div class="content">
        <h1 class="heading">Welcome Back</h1>
        <p class="text">Hi ${data.userName},</p>
        <p class="text">Good news! Your Unifesto account has been reactivated.</p>
        <p class="text">You can now log in and access all your events and communities.</p>
        ${this.ctaButton('Go to Unifesto', 'https://unifesto.app')}
      </div>
    `);
  }

  private getNewDeviceLoginTemplate(data: NewDeviceLoginData): string {
    return this.emailWrapper(`
      ${this.logoHeader()}
      <div class="content">
        <h1 class="heading">New Login Detected</h1>
        <p class="text">Hi ${data.userName},</p>
        <p class="text">We detected a new login to your Unifesto account:</p>
        ${this.accentBox(`
          <p class="text"><strong>Device:</strong> ${data.device}</p>
          <p class="text"><strong>Location:</strong> ${data.location}</p>
          <p class="text"><strong>Time:</strong> ${data.time}</p>
        `)}
        <p class="text">If this was you, no action needed.</p>
        <p class="text">If you didn't log in from this device, please secure your account immediately:</p>
        ${this.ctaButton('Secure My Account', data.loginLink)}
      </div>
    `);
  }

  private getSuspiciousActivityTemplate(data: SuspiciousActivityData): string {
    return this.emailWrapper(`
      ${this.logoHeader()}
      <div class="content">
        <h1 class="heading">Security Alert</h1>
        <p class="text">Hi ${data.userName},</p>
        <p class="text">We detected unusual activity on your Unifesto account:</p>
        ${this.accentBox(`
          <p class="text"><strong>Activity:</strong> ${data.activityDescription}</p>
          <p class="text"><strong>Time:</strong> ${data.time}</p>
        `)}
        <p class="text">If this was you, you can ignore this email. Otherwise, please review your account and change your password.</p>
        ${this.ctaButton('Review Account', 'https://unifesto.app/account/security')}
        <p class="text">If you have concerns, contact us at support@unifesto.app.</p>
      </div>
    `);
  }


  // =====================================================
  // EVENT TEMPLATES (8 NEW)
  // =====================================================

  private getEventCancelledTemplate(data: EventCancelledData): string {
    return this.emailWrapper(`
      ${this.logoHeader()}
      <div class="content">
        <h1 class="heading">Event Cancelled</h1>
        <p class="text">Hi ${data.userName},</p>
        <p class="text">Unfortunately, <strong>${data.eventTitle}</strong> scheduled for ${data.eventDate} has been cancelled.</p>
        ${data.cancellationReason ? this.accentBox(`<p class="text"><strong>Reason:</strong> ${data.cancellationReason}</p>`) : ''}
        ${data.refundInfo ? this.accentBox(`<p class="text">${data.refundInfo}</p>`) : ''}
        <p class="text">We apologize for the inconvenience. Explore other events happening near you.</p>
        ${this.ctaButton('Browse Events', 'https://unifesto.app/event')}
      </div>
    `);
  }

  private getEventUpdatedTemplate(data: EventUpdatedData): string {
    const changesHtml = data.changes.map(c => 
      `<p class="text"><strong>${c.field}:</strong> ${c.oldValue} → ${c.newValue}</p>`
    ).join('');

    return this.emailWrapper(`
      ${this.logoHeader()}
      <div class="content">
        <h1 class="heading">Event Details Updated</h1>
        <p class="text">Hi ${data.userName},</p>
        <p class="text">The details for <strong>${data.eventTitle}</strong> have been updated:</p>
        ${this.accentBox(changesHtml)}
        ${data.newDate ? `<p class="text"><strong>New Date:</strong> ${data.newDate}</p>` : ''}
        ${data.newTime ? `<p class="text"><strong>New Time:</strong> ${data.newTime}</p>` : ''}
        ${data.newVenue ? `<p class="text"><strong>New Venue:</strong> ${data.newVenue}</p>` : ''}
        <p class="text">Your registration is still valid. See you there!</p>
      </div>
    `);
  }

  private getEventPublishedTemplate(data: EventPublishedData): string {
    const location = data.isOnline
      ? `Online Event`
      : `${data.venueName}${data.city ? `, ${data.city}` : ''}`;

    return this.emailWrapper(`
      ${this.logoHeader()}
      <div class="content">
        <h1 class="heading">New Event in ${data.spaceName}</h1>
        <p class="text">Hi ${data.userName},</p>
        <p class="text">A new event has been published in a space you follow:</p>
        ${this.accentBox(`
          <p class="text"><strong>${data.eventTitle}</strong></p>
          <p class="text">Date: ${data.eventDate} at ${data.eventTime}</p>
          <p class="text">Location: ${location}</p>
        `)}
        ${this.ctaButton('View Event & Register', data.registrationUrl)}
      </div>
    `);
  }

  private getWaitlistConfirmationTemplate(data: WaitlistConfirmationData): string {
    return this.emailWrapper(`
      ${this.logoHeader()}
      <div class="content">
        <h1 class="heading">You're on the Waitlist</h1>
        <p class="text">Hi ${data.userName},</p>
        <p class="text">You've been added to the waitlist for <strong>${data.eventTitle}</strong> on ${data.eventDate}.</p>
        ${this.accentBox(`<p class="text">Your waitlist position: <strong>#${data.waitlistPosition}</strong></p>`)}
        <p class="text">We'll notify you by email if a spot opens up. Keep an eye on your inbox!</p>
      </div>
    `);
  }

  private getWaitlistPromotedTemplate(data: WaitlistPromotedData): string {
    const location = data.isOnline
      ? `<p class="text"><strong>Online Event:</strong> <a href="${data.onlineUrl}">${data.onlineUrl}</a></p>`
      : `<p class="text"><strong>Venue:</strong> ${data.venueName}${data.city ? `, ${data.city}` : ''}</p>`;

    // A free ticket is confirmed the moment it is offered, so that version of
    // the email must not ask for payment or set a deadline the attendee could
    // wrongly believe they can miss.
    const owesPayment = (data.amountDue ?? 0) > 0;

    const hasDeadline = owesPayment && (data.expiresInHours ?? 0) > 0;

    const action = owesPayment
      ? `
        ${this.accentBox(`
          <p class="text">Amount due: <strong>₹${data.amountDue}</strong></p>
          ${hasDeadline ? `<p class="text">Pay within: <strong>${data.expiresInHours} hours</strong></p>` : ''}
        `)}
        <p class="text">${
          hasDeadline
            ? 'Your seat is held until then. If payment does not come through in time, the seat goes back to the waiting list.'
            : 'Your seat is held for you — pay to confirm it. Please complete payment soon, as the organiser can release the seat if it stays unpaid.'
        }</p>
        ${this.ctaButton('Pay and confirm my spot', data.registrationUrl)}`
      : `
        <p class="text">This ticket is free, so there is nothing to pay. Your spot is confirmed.</p>
        ${this.ctaButton('View my ticket', data.registrationUrl)}`;

    return this.emailWrapper(`
      ${this.logoHeader()}
      <div class="content">
        <h1 class="heading">${owesPayment ? "You're in. Payment needed" : "You're in"}</h1>
        <p class="text">Hi ${data.userName},</p>
        <p class="text">A spot has opened up for you at <strong>${data.eventTitle}</strong>.</p>
        ${this.accentBox(`
          <p class="text">Date: ${data.eventDate} at ${data.eventTime}</p>
          ${location}
        `)}
        ${action}
      </div>
    `);
  }

  private getWaitlistRevokedTemplate(data: WaitlistRevokedData): string {
    return this.emailWrapper(`
      ${this.logoHeader()}
      <div class="content">
        <h1 class="heading">Your spot was released</h1>
        <p class="text">Hi ${data.userName},</p>
        <p class="text">A spot for <strong>${data.eventTitle}</strong> on ${data.eventDate} was offered to you, but as it went unpaid the organiser has released it so it can go to someone else.</p>
        <p class="text">Nothing was charged. If you still want to attend, you're welcome to join the waiting list again — a spot may open up.</p>
        ${this.ctaButton('View the event', data.registrationUrl)}
      </div>
    `);
  }

  private getEventSummaryTemplate(data: EventSummaryData): string {
    return this.emailWrapper(`
      ${this.logoHeader()}
      <div class="content">
        <h1 class="heading">Thanks for Attending</h1>
        <p class="text">Hi ${data.userName},</p>
        <p class="text">Thank you for attending <strong>${data.eventTitle}</strong>. We hope you had a great experience!</p>
        ${this.accentBox(`
          <p class="text">Total Attendees: <strong>${data.attendeeCount}</strong></p>
        `)}
        ${data.photosUrl ? `<p class="text">Event photos are now available. <a href="${data.photosUrl}">View photos</a></p>` : ''}
        <p class="text">We'd love to see you at our next event!</p>
        ${this.ctaButton('Explore More Events', 'https://unifesto.app/events')}
      </div>
    `);
  }

  private getEventStartingSoonTemplate(data: EventStartingSoonData): string {
    const location = data.isOnline
      ? `<p class="text"><strong>Join Online:</strong> <a href="${data.onlineUrl}">${data.onlineUrl}</a></p>`
      : `<p class="text"><strong>Venue:</strong> ${data.venueName}${data.city ? `, ${data.city}` : ''}</p>`;

    return this.emailWrapper(`
      ${this.logoHeader()}
      <div class="content">
        <h1 class="heading">Starting in 1 Hour</h1>
        <p class="text">Hi ${data.userName},</p>
        <p class="text"><strong>${data.eventTitle}</strong> is starting in ${data.startsInMinutes} minutes!</p>
        ${this.accentBox(location)}
        <p class="text">Make sure you have your QR code ready for check-in:</p>
        <div style="text-align: center; margin: 20px 0;">
          <img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(data.qrCode)}" alt="QR Code" width="200" height="200" style="max-width: 200px;" />
        </div>
        <p class="text">See you soon!</p>
      </div>
    `);
  }

  private getSpeakerInvitationTemplate(data: SpeakerInvitationData): string {
    return this.emailWrapper(`
      ${this.logoHeader()}
      <div class="content">
        <h1 class="heading">You're Invited to Speak</h1>
        <p class="text">Hi ${data.speakerName},</p>
        <p class="text"><strong>${data.organizerName}</strong> would like to invite you as a speaker at:</p>
        ${this.accentBox(`
          <p class="text"><strong>${data.eventTitle}</strong></p>
          <p class="text">Date: ${data.eventDate} at ${data.eventTime}</p>
        `)}
        <p class="text">We'd be honored to have you share your insights with our community.</p>
        <div style="text-align: center; margin: 20px 0;">
          ${this.ctaButton('Accept Invitation', data.acceptUrl)}
          <br /><br />
          <a href="${data.declineUrl}" style="color: #888; text-decoration: none;">Decline</a>
        </div>
      </div>
    `);
  }


  // =====================================================
  // SPACE TEMPLATES (8 NEW)
  // =====================================================

  private getSpaceMemberJoinedTemplate(data: SpaceMemberJoinedData): string {
    return this.emailWrapper(`
      ${this.logoHeader()}
      <div class="content">
        <h1 class="heading">New Member Joined</h1>
        <p class="text">Hi ${data.organizerName},</p>
        <p class="text"><strong>${data.memberName}</strong> just joined your space <strong>${data.spaceName}</strong>!</p>
        ${this.accentBox(`<p class="text">Total Members: <strong>${data.totalMembers}</strong></p>`)}
        <p class="text">Your community is growing. Keep creating amazing events!</p>
        ${this.ctaButton('View Your Space', 'https://unifesto.app/space/' + data.spaceName.toLowerCase().replace(/ /g, '-'))}
      </div>
    `);
  }

  private getCoOrganizerInvitedTemplate(data: CoOrganizerInvitedData): string {
    return this.emailWrapper(`
      ${this.logoHeader()}
      <div class="content">
        <h1 class="heading">Co-Organiser Invitation</h1>
        <p class="text">Hi ${data.inviteeName},</p>
        <p class="text"><strong>${data.inviterName}</strong> has invited you to be a co-organiser of <strong>${data.spaceName}</strong>.</p>
        <p class="text">As a co-organiser, you'll be able to create events, manage members, and help grow the community.</p>
        ${this.ctaButton('Accept Invitation', data.acceptUrl)}
        <p class="text">Excited to have you on board!</p>
      </div>
    `);
  }

  private getCoOrganizerRemovedTemplate(data: CoOrganizerRemovedData): string {
    return this.emailWrapper(`
      ${this.logoHeader()}
      <div class="content">
        <h1 class="heading">Co-Organiser Role Removed</h1>
        <p class="text">Hi ${data.userName},</p>
        <p class="text">You've been removed as a co-organiser of <strong>${data.spaceName}</strong>.</p>
        <p class="text">You're still a member of the space and can continue attending events.</p>
        <p class="text">If you have questions, please reach out to the space organiser.</p>
      </div>
    `);
  }

  private getParentSpaceRequestSubmittedTemplate(data: ParentSpaceRequestSubmittedData): string {
    return this.emailWrapper(`
      ${this.logoHeader()}
      <div class="content">
        <h1 class="heading">Join Request Received</h1>
        <p class="text">Hi ${data.organizerName},</p>
        <p class="text"><strong>${data.spaceName}</strong> has requested to join your space <strong>${data.parentSpaceName}</strong> as a subspace.</p>
        <p class="text">Review the request and decide whether to approve or decline.</p>
        ${this.ctaButton('Review Request', 'https://unifesto.app/space/requests')}
      </div>
    `);
  }

  private getParentSpaceRequestApprovedTemplate(data: ParentSpaceRequestApprovedData): string {
    return this.emailWrapper(`
      ${this.logoHeader()}
      <div class="content">
        <h1 class="heading">Request Approved</h1>
        <p class="text">Hi ${data.organizerName},</p>
        <p class="text">Your request to join <strong>${data.parentSpaceName}</strong> has been approved!</p>
        <p class="text"><strong>${data.spaceName}</strong> is now a subspace and will appear under the parent space.</p>
        ${this.ctaButton('View Your Space', 'https://unifesto.app/space/' + data.spaceName.toLowerCase().replace(/ /g, '-'))}
      </div>
    `);
  }

  private getParentSpaceRequestRejectedTemplate(data: ParentSpaceRequestRejectedData): string {
    return this.emailWrapper(`
      ${this.logoHeader()}
      <div class="content">
        <h1 class="heading">Request Update</h1>
        <p class="text">Hi ${data.organizerName},</p>
        <p class="text">Your request for <strong>${data.spaceName}</strong> to join <strong>${data.parentSpaceName}</strong> was not approved.</p>
        ${data.reason ? this.accentBox(`<p class="text"><strong>Reason:</strong> ${data.reason}</p>`) : ''}
        <p class="text">You can continue managing your space independently or reach out to the parent space organiser for more information.</p>
      </div>
    `);
  }

  private getSpaceSuspendedTemplate(data: SpaceSuspendedData): string {
    return this.emailWrapper(`
      ${this.logoHeader()}
      <div class="content">
        <h1 class="heading">Space Suspended</h1>
        <p class="text">Hi ${data.organizerName},</p>
        <p class="text">Your space <strong>${data.spaceName}</strong> has been suspended by Unifesto administrators.</p>
        ${this.accentBox(`<p class="text"><strong>Reason:</strong> ${data.reason}</p>`)}
        <p class="text">During the suspension period, your space and events will not be visible to members.</p>
        <p class="text">If you believe this is a mistake or would like to appeal, contact us at support@unifesto.app.</p>
      </div>
    `);
  }

  private getSpaceArchivedTemplate(data: SpaceArchivedData): string {
    return this.emailWrapper(`
      ${this.logoHeader()}
      <div class="content">
        <h1 class="heading">Space Archived</h1>
        <p class="text">Hi ${data.organizerName},</p>
        <p class="text">Your space <strong>${data.spaceName}</strong> has been archived as requested.</p>
        <p class="text">The space is no longer visible, but your data is preserved. You can unarchive it anytime from your dashboard.</p>
        ${this.ctaButton('Go to Dashboard', 'https://unifesto.app/dashboard')}
      </div>
    `);
  }


  // =====================================================
  // PAYMENTS TEMPLATES
  // =====================================================

  private getPaymentFailedTemplate(data: PaymentFailedData): string {
    return this.emailWrapper(`
      ${this.logoHeader()}
      <div class="content">
        <h1 class="heading">Payment Failed</h1>
        <p class="text">Hi ${data.userName},</p>
        <p class="text">We couldn't process your payment for <strong>${data.eventTitle}</strong>.</p>
        ${this.accentBox(`
          <p class="text"><strong>Amount:</strong> ₹${data.amount}</p>
          ${data.reason ? `<p class="text"><strong>Reason:</strong> ${data.reason}</p>` : ''}
        `)}
        <p class="text">You can try again or use a different payment method.</p>
        ${this.ctaButton('Retry Payment', data.retryUrl)}
        <p class="text">If you continue to face issues, contact us at support@unifesto.app.</p>
      </div>
    `);
  }

  private getRefundProcessedTemplate(data: RefundProcessedData): string {
    return this.emailWrapper(`
      ${this.logoHeader()}
      <div class="content">
        <h1 class="heading">Refund Processed</h1>
        <p class="text">Hi ${data.userName},</p>
        <p class="text">Your refund for <strong>${data.eventTitle}</strong> has been processed.</p>
        ${this.accentBox(`
          <p class="text"><strong>Refund Amount:</strong> ₹${data.refundAmount}</p>
          <p class="text"><strong>Payment ID:</strong> ${data.paymentId}</p>
          <p class="text">The amount will be credited to your original payment method within ${data.processingDays} business days.</p>
        `)}
        <p class="text">If you have questions, contact us at support@unifesto.app.</p>
      </div>
    `);
  }


  // =====================================================
  // SUBSCRIPTION TEMPLATES (7 NEW)
  // =====================================================

  private getSubscriptionActivatedTemplate(data: SubscriptionActivatedData): string {
    const featuresHtml = data.features.map(f => `<li>${f}</li>`).join('');
    
    return this.emailWrapper(`
      ${this.logoHeader()}
      <div class="content">
        <h1 class="heading">Welcome to ${data.plan}</h1>
        <p class="text">Hi ${data.userName},</p>
        <p class="text">Your <strong>${data.plan}</strong> subscription is now active!</p>
        ${this.accentBox(`
          <p class="text"><strong>Plan:</strong> ${data.plan}</p>
          <p class="text"><strong>Billing Cycle:</strong> ${data.billingCycle}</p>
          <p class="text"><strong>Amount:</strong> ₹${data.amount}</p>
          ${data.expiresAt ? `<p class="text"><strong>Expires:</strong> ${data.expiresAt}</p>` : ''}
        `)}
        <p class="text"><strong>Your benefits:</strong></p>
        <ul>${featuresHtml}</ul>
        ${this.ctaButton('Explore Your Benefits', 'https://unifesto.app/subscription')}
      </div>
    `);
  }

  private getSubscriptionCancelledTemplate(data: SubscriptionCancelledData): string {
    return this.emailWrapper(`
      ${this.logoHeader()}
      <div class="content">
        <h1 class="heading">Subscription Cancelled</h1>
        <p class="text">Hi ${data.userName},</p>
        <p class="text">Your <strong>${data.plan}</strong> subscription has been cancelled as requested.</p>
        ${this.accentBox(`
          <p class="text">Your benefits will remain active until <strong>${data.expiresAt}</strong>.</p>
        `)}
        <p class="text">After that, your account will revert to the free plan.</p>
        <p class="text">We're sorry to see you go. If you'd like to reactivate, you can do so anytime.</p>
        ${this.ctaButton('Reactivate Subscription', 'https://unifesto.app/subscription')}
      </div>
    `);
  }

  private getSubscriptionExpiringTemplate(data: SubscriptionExpiringData): string {
    return this.emailWrapper(`
      ${this.logoHeader()}
      <div class="content">
        <h1 class="heading">Your Plan Expires Soon</h1>
        <p class="text">Hi ${data.userName},</p>
        <p class="text">Your <strong>${data.plan}</strong> subscription expires in 7 days on <strong>${data.expiresAt}</strong>.</p>
        <p class="text">Renew now to continue enjoying premium benefits without interruption.</p>
        ${this.ctaButton('Renew Subscription', data.renewUrl)}
        <p class="text">If you don't renew, your account will switch to the free plan after expiry.</p>
      </div>
    `);
  }

  private getSubscriptionExpiredTemplate(data: SubscriptionExpiredData): string {
    return this.emailWrapper(`
      ${this.logoHeader()}
      <div class="content">
        <h1 class="heading">Subscription Expired</h1>
        <p class="text">Hi ${data.userName},</p>
        <p class="text">Your <strong>${data.plan}</strong> subscription has expired.</p>
        <p class="text">Your account has been downgraded to <strong>${data.downgradedTo}</strong>.</p>
        <p class="text">You can reactivate your subscription anytime to regain premium benefits.</p>
        ${this.ctaButton('Reactivate Subscription', 'https://unifesto.app/subscription')}
      </div>
    `);
  }

  private getSubscriptionUpgradedTemplate(data: SubscriptionUpgradedData): string {
    const newFeaturesHtml = data.newFeatures.map(f => `<li>${f}</li>`).join('');
    
    return this.emailWrapper(`
      ${this.logoHeader()}
      <div class="content">
        <h1 class="heading">You've Upgraded to ${data.toPlan}</h1>
        <p class="text">Hi ${data.userName},</p>
        <p class="text">Congratulations! You've upgraded from <strong>${data.fromPlan}</strong> to <strong>${data.toPlan}</strong>.</p>
        <p class="text"><strong>New features unlocked:</strong></p>
        <ul>${newFeaturesHtml}</ul>
        ${this.ctaButton('Explore New Features', 'https://unifesto.app/subscription')}
      </div>
    `);
  }

  private getSubscriptionDowngradedTemplate(data: SubscriptionDowngradedData): string {
    return this.emailWrapper(`
      ${this.logoHeader()}
      <div class="content">
        <h1 class="heading">Plan Changed</h1>
        <p class="text">Hi ${data.userName},</p>
        <p class="text">Your subscription has been changed from <strong>${data.fromPlan}</strong> to <strong>${data.toPlan}</strong>.</p>
        <p class="text">Some features may no longer be available. You can upgrade again anytime.</p>
        ${this.ctaButton('View Plans', 'https://unifesto.app/pricing')}
      </div>
    `);
  }

  private getInvoiceTemplate(data: InvoiceData): string {
    return this.emailWrapper(`
      ${this.logoHeader()}
      <div class="content">
        <h1 class="heading">Your Invoice</h1>
        <p class="text">Hi ${data.userName},</p>
        <p class="text">Here's your invoice for your Unifesto subscription.</p>
        ${this.accentBox(`
          <p class="text"><strong>Invoice Number:</strong> ${data.invoiceNumber}</p>
          <p class="text"><strong>Plan:</strong> ${data.plan}</p>
          <p class="text"><strong>Billing Cycle:</strong> ${data.billingCycle}</p>
          <p class="text"><strong>Amount:</strong> ₹${data.amount}</p>
          <p class="text"><strong>Billing Date:</strong> ${data.billingDate}</p>
          <p class="text"><strong>Payment ID:</strong> ${data.paymentId}</p>
        `)}
        ${this.ctaButton('Download Invoice', 'https://unifesto.app/invoices/' + data.invoiceNumber)}
      </div>
    `);
  }


  // =====================================================
  // ADMIN DIGEST TEMPLATES
  // =====================================================

  private getDailyAdminDigestTemplate(data: DailyAdminDigestData): string {
    return this.emailWrapper(`
      ${this.logoHeader()}
      <div class="content">
        <h1 class="heading">Daily Digest - ${data.date}</h1>
        <p class="text">Here's your daily summary of Unifesto platform activity.</p>
        ${this.accentBox(`
          <p class="text"><strong>New Users:</strong> ${data.newUsers}</p>
          <p class="text"><strong>New Spaces:</strong> ${data.newSpaces}</p>
          <p class="text"><strong>New Events:</strong> ${data.newEvents}</p>
          <p class="text"><strong>Total Registrations:</strong> ${data.totalRegistrations}</p>
          <p class="text"><strong>Total Revenue:</strong> ₹${data.totalRevenue}</p>
          <p class="text"><strong>Active Users:</strong> ${data.activeUsers}</p>
        `)}
        ${this.ctaButton('View Dashboard', 'https://admin.unifesto.app/dashboard')}
      </div>
    `);
  }

  private getWeeklyReportTemplate(data: WeeklyReportData): string {
    const metricsHtml = data.metrics.map(m => 
      `<p class="text"><strong>${m.label}:</strong> ${m.value} (${m.change})</p>`
    ).join('');

    return this.emailWrapper(`
      ${this.logoHeader()}
      <div class="content">
        <h1 class="heading">Weekly Report - Week of ${data.weekStarting}</h1>
        <p class="text">Here's your weekly platform performance summary.</p>
        ${this.accentBox(metricsHtml)}
        ${this.ctaButton('View Full Report', 'https://admin.unifesto.app/reports')}
      </div>
    `);
  }

  private getMonthlyInvoiceSummaryTemplate(data: MonthlyInvoiceSummaryData): string {
    const topEventsHtml = data.topEvents.map(e => 
      `<p class="text">${e.title}: ₹${e.revenue}</p>`
    ).join('');

    return this.emailWrapper(`
      ${this.logoHeader()}
      <div class="content">
        <h1 class="heading">Monthly Revenue Summary - ${data.month}</h1>
        <p class="text">Here's your monthly revenue breakdown.</p>
        ${this.accentBox(`
          <p class="text"><strong>Total Revenue:</strong> ₹${data.totalRevenue}</p>
          <p class="text"><strong>Total Transactions:</strong> ${data.totalTransactions}</p>
        `)}
        <p class="text"><strong>Top Events by Revenue:</strong></p>
        ${this.accentBox(topEventsHtml)}
        ${this.ctaButton('View Detailed Report', 'https://admin.unifesto.app/revenue')}
      </div>
    `);
  }
}
