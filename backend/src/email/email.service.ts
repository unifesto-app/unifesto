import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { buildEventIcs, IcsEventInput } from '../events/calendar/ics.util';
import { layout } from './layout';
import * as T from './templates';

interface CustomCampaignData {
  to: string | string[];
  subject: string;
  html: string;
  campaignId: string;
}

type Attachment = { filename: string; content: Buffer };
type Sender = { fromName?: string | null; replyTo?: string | null };

/**
 * Sends Unifesto's email. What each mail says lives in ./templates (built on
 * the ./layout shell); this class only picks the channel and delivers.
 *
 * Two channels: Resend for one-to-one transactional mail, AWS SES for anything
 * that goes out in batches (codes, certificates, plans, digests, campaigns),
 * since Resend's daily quota is small. Every send fails soft: a mail problem
 * is logged, never thrown into the business flow that triggered it.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  // Null when RESEND_API_KEY is unset: Resend 6 throws on a missing key, which
  // would crash the whole app at boot instead of just disabling email.
  private readonly resend: Resend | null;
  private readonly sesClient: SESClient;
  private readonly fromTransactional: string;
  private readonly fromBulk: string;
  // The bare transactional sending address (no display name). White-label lets a
  // space swap the display name in front of this same verified address.
  private readonly transactionalAddress: string;

  constructor(private readonly configService: ConfigService) {
    const resendApiKey = this.configService.get<string>('RESEND_API_KEY');
    if (!resendApiKey) {
      this.logger.warn('RESEND_API_KEY not configured. Transactional emails will not work.');
    }
    this.resend = resendApiKey ? new Resend(resendApiKey) : null;
    this.transactionalAddress = this.configService.get<string>(
      'EMAIL_FROM_TRANSACTIONAL',
      'no-reply@notify.unifesto.app',
    );
    this.fromTransactional = `Unifesto <${this.transactionalAddress}>`;

    const sesRegion = this.configService.get<string>('AWS_SES_REGION', 'ap-south-1');
    this.sesClient = new SESClient({ region: sesRegion });
    const bulkAddress = this.configService.get<string>(
      'EMAIL_FROM_BULK',
      'no-reply@updates.unifesto.app',
    );
    this.fromBulk = `Unifesto <${bulkAddress}>`;
  }

  // =====================================================
  // TRANSPORT
  // =====================================================

  /**
   * Send a call-site-built email via Resend. A body fragment is wrapped in the
   * branded layout; a full document (starts with <!DOCTYPE or <html) goes as is.
   */
  async sendRawEmail(to: string, subject: string, html: string): Promise<string | null> {
    const isDocument = /^\s*<(!doctype|html)/i.test(html);
    return this.sendViaResend(to, subject, isDocument ? html : layout(html));
  }

  /** Send via Resend (transactional). */
  protected async sendViaResend(
    to: string,
    subject: string,
    html: string,
    attachments?: Attachment[],
    sender?: Sender,
  ): Promise<string | null> {
    if (!this.resend) {
      this.logger.warn(`Email to ${to} not sent: RESEND_API_KEY not configured`);
      return null;
    }

    try {
      // White-label: swap the display name in front of the same verified
      // sending address, and route replies to the organiser. Address/domain are
      // never changed here; that needs domain verification, a separate feature.
      const from = sender?.fromName
        ? `${sender.fromName} <${this.transactionalAddress}>`
        : this.fromTransactional;

      const { data, error } = await this.resend.emails.send({
        from,
        to,
        subject,
        html,
        ...(sender?.replyTo ? { replyTo: sender.replyTo } : {}),
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

  /** Send via AWS SES (bulk). */
  private async sendViaSES(
    to: string | string[],
    subject: string,
    html: string,
  ): Promise<string | null> {
    try {
      const command = new SendEmailCommand({
        Source: this.fromBulk,
        Destination: { ToAddresses: Array.isArray(to) ? to : [to] },
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

  /** Send a template on a channel, log the outcome, never throw. */
  private async deliver(
    via: 'resend' | 'ses',
    to: string | null | undefined,
    { subject, html }: T.Email,
    opts?: { attachments?: Attachment[]; sender?: Sender },
  ): Promise<boolean> {
    if (!to) return false;
    try {
      const id =
        via === 'ses'
          ? await this.sendViaSES(to, subject, html)
          : await this.sendViaResend(to, subject, html, opts?.attachments, opts?.sender);
      if (id) this.logger.log(`Sent "${subject}" to ${to} (${id})`);
      else this.logger.error(`Failed to send "${subject}" to ${to}`);
      return !!id;
    } catch (error) {
      this.logger.error(`Error sending "${subject}" to ${to}`, error);
      return false;
    }
  }

  /**
   * A single `event.ics` attachment from the raw event fields on the
   * confirmation payload, or `undefined` when they're absent (so the email
   * simply sends without one). A broken ICS must never block the confirmation.
   */
  private buildIcsAttachment(data: T.RegistrationConfirmationData): Attachment[] | undefined {
    if (!data.eventSlug || !data.eventStartDateTime || !data.eventEndDateTime || !data.eventTimezone) {
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
      return [{ filename: 'event.ics', content: Buffer.from(buildEventIcs(input), 'utf8') }];
    } catch (error) {
      this.logger.warn(`Failed to build .ics attachment: ${error.message}`);
      return undefined;
    }
  }

  // =====================================================
  // ACCOUNT
  // =====================================================

  async sendOtpEmail(email: string, otp: string): Promise<void> {
    await this.deliver('ses', email, T.otpEmail(otp));
  }

  async sendWelcomeEmail(email: string, userName: string): Promise<void> {
    await this.deliver('ses', email, T.welcomeEmail(userName));
  }

  // =====================================================
  // REGISTRATIONS & EVENTS
  // =====================================================

  async sendRegistrationConfirmation(data: T.RegistrationConfirmationData): Promise<void> {
    await this.deliver('resend', data.email, T.registrationConfirmationEmail(data), {
      attachments: this.buildIcsAttachment(data),
      sender: { fromName: data.brandFromName, replyTo: data.brandReplyTo },
    });
  }

  async sendPaymentConfirmation(data: T.PaymentConfirmationData): Promise<void> {
    await this.deliver('resend', data.email, T.paymentConfirmationEmail(data));
  }

  async sendCancellationConfirmation(data: T.CancellationConfirmationData): Promise<void> {
    await this.deliver('resend', data.email, T.cancellationConfirmationEmail(data));
  }

  async sendEventReminder(data: T.EventReminderData): Promise<void> {
    await this.deliver('resend', data.email, T.eventReminderEmail(data));
  }

  async sendEventStartingSoon(data: T.EventStartingSoonData): Promise<void> {
    await this.deliver('resend', data.email, T.eventStartingSoonEmail(data));
  }

  async sendEventCancelled(data: T.EventCancelledData): Promise<void> {
    await this.deliver('resend', data.email, T.eventCancelledEmail(data));
  }

  async sendEventUpdated(data: T.EventUpdatedData): Promise<void> {
    await this.deliver('resend', data.email, T.eventUpdatedEmail(data));
  }

  async sendEventPublished(data: T.EventPublishedData): Promise<void> {
    await this.deliver('resend', data.email, T.eventPublishedEmail(data));
  }

  async sendEventSummary(data: T.EventSummaryData): Promise<void> {
    await this.deliver('resend', data.email, T.eventSummaryEmail(data));
  }

  async sendWaitlistConfirmation(data: T.WaitlistConfirmationData): Promise<void> {
    await this.deliver('resend', data.email, T.waitlistConfirmationEmail(data));
  }

  async sendWaitlistPromoted(data: T.WaitlistPromotedData): Promise<void> {
    await this.deliver('resend', data.email, T.waitlistPromotedEmail(data));
  }

  async sendWaitlistRevoked(data: T.WaitlistRevokedData): Promise<void> {
    await this.deliver('resend', data.email, T.waitlistRevokedEmail(data));
  }

  /**
   * Email a recipient a link to their freshly issued certificate (verify page +
   * PDF in storage, no attachment). Sent via SES, not Resend: certificates go
   * out a whole batch at a time, which blew Resend's daily quota. Returns
   * whether the send was accepted, so the caller stamps `emailedAt` only on
   * success (a failed send leaves it null, meaning "needs resend").
   */
  async sendCertificateIssued(data: T.CertificateIssuedData): Promise<boolean> {
    return this.deliver('ses', data.email, T.certificateIssuedEmail(data));
  }

  // =====================================================
  // PAYMENTS
  // =====================================================

  async sendPaymentFailed(data: T.PaymentFailedData): Promise<void> {
    await this.deliver('resend', data.email, T.paymentFailedEmail(data));
  }

  async sendBankAccountRejected(data: T.BankAccountRejectedData): Promise<void> {
    await this.deliver('resend', data.email, T.bankAccountRejectedEmail(data));
  }

  // =====================================================
  // SPACES
  // =====================================================

  async sendSpaceApproved(data: T.SpaceApprovedData): Promise<void> {
    await this.deliver('resend', data.email, T.spaceApprovedEmail(data));
  }

  async sendSpaceRejected(data: T.SpaceRejectedData): Promise<void> {
    await this.deliver('resend', data.email, T.spaceRejectedEmail(data));
  }

  async sendNewSpaceSubmittedToAdmin(data: T.NewSpaceSubmittedData): Promise<void> {
    await this.deliver('resend', data.adminEmail, T.newSpaceSubmittedEmail(data));
  }

  // =====================================================
  // SUBSCRIPTIONS
  // =====================================================

  async sendSubscriptionActivated(data: T.SubscriptionActivatedData): Promise<void> {
    await this.deliver('ses', data.email, T.subscriptionActivatedEmail(data));
  }

  async sendSubscriptionCancelled(data: T.SubscriptionCancelledData): Promise<void> {
    await this.deliver('ses', data.email, T.subscriptionCancelledEmail(data));
  }

  async sendSubscriptionExpiring(data: T.SubscriptionExpiringData): Promise<void> {
    await this.deliver('ses', data.email, T.subscriptionExpiringEmail(data));
  }

  async sendSubscriptionExpired(data: T.SubscriptionExpiredData): Promise<void> {
    await this.deliver('ses', data.email, T.subscriptionExpiredEmail(data));
  }

  async sendSubscriptionUpgraded(data: T.SubscriptionUpgradedData): Promise<void> {
    await this.deliver('ses', data.email, T.subscriptionUpgradedEmail(data));
  }

  async sendSubscriptionDowngraded(data: T.SubscriptionDowngradedData): Promise<void> {
    await this.deliver('ses', data.email, T.subscriptionDowngradedEmail(data));
  }

  // =====================================================
  // PLATFORM ADMIN DIGESTS
  // =====================================================

  async sendDailyAdminDigest(data: T.DailyAdminDigestData): Promise<void> {
    await this.deliver('ses', data.adminEmail, T.dailyAdminDigestEmail(data));
  }

  async sendWeeklyReport(data: T.WeeklyReportData): Promise<void> {
    await this.deliver('ses', data.adminEmail, T.weeklyReportEmail(data));
  }

  async sendMonthlyInvoiceSummary(data: T.MonthlyInvoiceSummaryData): Promise<void> {
    await this.deliver('ses', data.adminEmail, T.monthlyInvoiceSummaryEmail(data));
  }

  // =====================================================
  // CAMPAIGNS
  // =====================================================

  /** Bulk campaign send via SES. Returns the messageId for logging, never throws. */
  async sendCustomCampaignEmail(data: CustomCampaignData): Promise<{ messageId: string | null; error?: string }> {
    try {
      const messageId = await this.sendViaSES(data.to, data.subject, data.html);
      return { messageId };
    } catch (error) {
      this.logger.error(`Error sending custom campaign ${data.campaignId}: ${error.message}`);
      return { messageId: null, error: error.message };
    }
  }

  /** Wrap an operator-authored campaign body in the branded shell. */
  wrapCampaignHtml(content: string): string {
    return layout(content);
  }
}
