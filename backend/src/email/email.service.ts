import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { SESClient, SendEmailCommand, SendRawEmailCommand } from '@aws-sdk/client-ses';
import { randomUUID } from 'crypto';
import { MessageChannel } from '@prisma/client';
import { buildEventIcs, IcsEventInput } from '../events/calendar/ics.util';
import {
  AttemptResult,
  DeliveryOpts,
  isTransientStatus,
  TrackedResult,
  trackedSend,
} from '../notifications/message-delivery';
import { PrismaService } from '../prisma/prisma.service';
import { PlanConfigService } from '../subscription/plan-config.service';
import {
  BRANDING_SPACE_SELECT,
  resolveEmailSender,
  resolveEventBranding,
} from '../white-label/branding.util';
import { layout, SUPPORT, WEB, type EmailBrand } from './layout';
import * as T from './templates';
import {
  AWS_HTTP_TIMEOUTS,
  OUTBOUND_TIMEOUT_MS,
} from '../common/http/outbound-timeouts';

interface CustomCampaignData {
  to: string | string[];
  subject: string;
  html: string;
  campaignId: string;
  /** Marketing mail: sent with List-Unsubscribe + one-click headers. */
  unsubscribeUrl?: string;
}

type Attachment = { filename: string; content: Buffer };
// fromAddress: a space's verified sending address (Resend only; SES ignores it).
type Sender = { fromName?: string | null; replyTo?: string | null; fromAddress?: string | null };

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
  private readonly bulkAddress: string;

  constructor(
    private readonly configService: ConfigService,
    // Optional so the unit spec can build the service with config alone;
    // without them every mail goes out unbranded.
    @Optional() private readonly prisma?: PrismaService,
    @Optional() private readonly planConfig?: PlanConfigService,
  ) {
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
    this.sesClient = new SESClient({ region: sesRegion, ...AWS_HTTP_TIMEOUTS });
    this.bulkAddress = this.configService.get<string>(
      'EMAIL_FROM_BULK',
      'no-reply@updates.unifesto.app',
    );
    this.fromBulk = `Unifesto <${this.bulkAddress}>`;
  }

  // =====================================================
  // TRANSPORT
  // =====================================================

  /**
   * Send a call-site-built email via Resend. A body fragment is wrapped in the
   * branded layout; a full document (starts with <!DOCTYPE or <html) goes as is.
   */
  async sendRawEmail(
    to: string,
    subject: string,
    html: string,
    attachments?: Attachment[],
    delivery?: DeliveryOpts,
  ): Promise<string | null> {
    return (await this.sendRawEmailTracked(to, subject, html, attachments, delivery)).id;
  }

  /** `sendRawEmail` with the full outcome: `ok` is also true for a dedup skip (id null). */
  sendRawEmailTracked(
    to: string,
    subject: string,
    html: string,
    attachments?: Attachment[],
    delivery?: DeliveryOpts,
  ): Promise<TrackedResult> {
    const isDocument = /^\s*<(!doctype|html)/i.test(html);
    return this.track(
      'resend',
      to,
      subject,
      (key) => this.sendViaResend(to, subject, isDocument ? html : layout(html), attachments, undefined, key),
      delivery,
    );
  }

  /**
   * Send via Resend (transactional). Resend's SDK doesn't retry; `track`
   * does, reusing `idempotencyKey` so a retried timeout can't send twice.
   */
  protected async sendViaResend(
    to: string,
    subject: string,
    html: string,
    attachments?: Attachment[],
    sender?: Sender,
    idempotencyKey?: string,
  ): Promise<AttemptResult> {
    if (!this.resend) {
      this.logger.warn(`Email to ${to} not sent: RESEND_API_KEY not configured`);
      return { id: null, error: 'not_configured' };
    }

    try {
      // White-label: the space's display name, its own verified address when
      // it has one (else ours), and replies routed to the organiser.
      const from = sender?.fromName
        ? `${sender.fromName} <${sender.fromAddress || this.transactionalAddress}>`
        : this.fromTransactional;

      // The signal aborts the underlying fetch, not just the wait (S54).
      const { data, error } = await this.resend.emails.send(
        {
          from,
          to,
          subject,
          html,
          ...(sender?.replyTo ? { replyTo: sender.replyTo } : {}),
          ...(attachments?.length ? { attachments } : {}),
        },
        { signal: AbortSignal.timeout(OUTBOUND_TIMEOUT_MS), ...(idempotencyKey ? { idempotencyKey } : {}) },
      );

      if (error) {
        this.logger.error(`Resend error: ${error.message}`);
        // statusCode null = the fetch itself failed; the SDK hides whether it
        // was a timeout, so it isn't retried. 429/5xx are (idempotency key).
        return { id: null, error: error.message, retryable: isTransientStatus(error.statusCode) };
      }
      return { id: data?.id || null, error: data?.id ? undefined : 'no_message_id' };
    } catch (error) {
      this.logger.error(`Resend exception: ${error.message}`);
      return { id: null, error: error.message };
    }
  }

  /**
   * Send via AWS SES (bulk). Never marked retryable: the AWS SDK already
   * retries throttling and 5xx itself (standard mode, 3 attempts).
   */
  private async sendViaSES(
    to: string | string[],
    subject: string,
    html: string,
    sender?: Sender,
  ): Promise<AttemptResult> {
    try {
      const command = new SendEmailCommand({
        Source: sender?.fromName ? `${sender.fromName} <${this.bulkAddress}>` : this.fromBulk,
        ...(sender?.replyTo ? { ReplyToAddresses: [sender.replyTo] } : {}),
        Destination: { ToAddresses: Array.isArray(to) ? to : [to] },
        Message: {
          Subject: { Data: subject, Charset: 'UTF-8' },
          Body: { Html: { Data: html, Charset: 'UTF-8' } },
        },
      });
      const result = await this.sesClient.send(command);
      return { id: result.MessageId || null, error: result.MessageId ? undefined : 'no_message_id' };
    } catch (error) {
      this.logger.error(`SES error: ${error.message}`);
      return { id: null, error: error.message };
    }
  }

  /** One logged, retried, optionally deduped send (C3). Never throws. */
  private track(
    via: 'resend' | 'ses',
    to: string | string[],
    label: string,
    send: (idempotencyKey: string) => Promise<AttemptResult>,
    delivery?: DeliveryOpts,
  ) {
    const key = randomUUID();
    return trackedSend(
      this.prisma,
      {
        channel: MessageChannel.EMAIL,
        provider: via,
        label,
        recipient: Array.isArray(to) ? to.join(',') : to,
        ...delivery,
      },
      () => send(key),
    );
  }

  /**
   * Send a template on a channel, log the outcome, never throw. `label`
   * replaces the subject in the delivery log when the subject holds a secret.
   */
  private async deliver(
    via: 'resend' | 'ses',
    to: string | null | undefined,
    { subject, html }: T.Email,
    opts?: { attachments?: Attachment[]; sender?: Sender; delivery?: DeliveryOpts; label?: string },
  ): Promise<boolean> {
    if (!to) return false;
    try {
      const res = await this.track(
        via,
        to,
        opts?.label ?? subject,
        (key) =>
          via === 'ses'
            ? this.sendViaSES(to, subject, html, opts?.sender)
            : this.sendViaResend(to, subject, html, opts?.attachments, opts?.sender, key),
        opts?.delivery,
      );
      if (res.deduped) this.logger.log(`Skipped "${opts?.label ?? subject}" to ${to}: already sent`);
      else if (res.ok) this.logger.log(`Sent "${opts?.label ?? subject}" to ${to} (${res.id})`);
      else this.logger.error(`Failed to send "${opts?.label ?? subject}" to ${to}`);
      return res.ok;
    } catch (error) {
      this.logger.error(`Error sending "${opts?.label ?? subject}" to ${to}`, error);
      return false;
    }
  }

  /**
   * The event's space theme for attendee mail, plus the white-label sender.
   * Same gate as the public pages (on + plan perk + not suspended). Never
   * throws: a lookup problem just sends the mail unbranded.
   */
  private async brandFor(eventId?: string): Promise<{ brand: EmailBrand | null; sender?: Sender }> {
    if (!eventId || !this.prisma || !this.planConfig) return { brand: null };
    try {
      const event = await this.prisma.event.findUnique({
        where: { id: eventId },
        select: {
          whiteLabelEnabled: true,
          brandColor: true,
          space: {
            select: {
              slug: true,
              subscription: true,
              ...BRANDING_SPACE_SELECT,
              domains: {
                where: { status: 'verified' },
                select: { kind: true, hostname: true, emailLocalPart: true },
              },
            },
          },
        },
      });
      const space = event?.space;
      if (!event || !space?.subscription) return { brand: null };
      const has = this.planConfig.getEffectiveLimits(space.subscription).hasRemoveBranding;
      const theme = resolveEventBranding(event, space, has);
      const sender = resolveEmailSender(space, has);
      const mail = space.domains.find((d) => d.kind === 'EMAIL');
      const web = space.domains.find((d) => d.kind === 'WEB');
      return {
        // An event-only colour override (no space theme) keeps Unifesto mail.
        brand: theme?.name
          ? {
              name: theme.name,
              logoUrl: theme.logoUrl,
              logoSquare: theme.logoSquare,
              color: theme.color,
              hidePoweredBy: theme.hidePoweredBy,
              url: web ? `https://${web.hostname}` : `${WEB}/space/${space.slug}`,
              webBase: web ? `https://${web.hostname}` : WEB,
            }
          : null,
        sender: sender
          ? {
              fromName: sender.emailFromName || space.name,
              replyTo: sender.emailReplyTo,
              fromAddress: mail ? `${mail.emailLocalPart || 'tickets'}@${mail.hostname}` : null,
            }
          : undefined,
      };
    } catch (error) {
      this.logger.warn(`Brand lookup failed for event ${eventId}: ${error.message}`);
      return { brand: null };
    }
  }

  /** `deliver` for attendee mail: resolves the brand from `data.eventId` first. */
  private async deliverBranded<D extends { eventId?: string; brand?: EmailBrand | null }>(
    via: 'resend' | 'ses',
    to: string | null | undefined,
    data: D,
    build: (d: D) => T.Email,
    delivery?: DeliveryOpts,
  ): Promise<boolean> {
    const { brand, sender } = await this.brandFor(data.eventId);
    return this.deliver(via, to, build({ ...data, brand }), { sender, delivery });
  }

  /**
   * A single `event.ics` attachment from the raw event fields on the
   * confirmation payload, or `undefined` when they're absent (so the email
   * simply sends without one). A broken ICS must never block the confirmation.
   */
  private buildIcsAttachment(
    data: T.RegistrationConfirmationData,
    brand?: EmailBrand | null,
  ): Attachment[] | undefined {
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
        // Same origin as the email's own event links: the space's web domain when branded.
        customDomain: brand && brand.webBase !== WEB ? new URL(brand.webBase).host : null,
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
    // The subject carries the code: log a fixed label instead.
    await this.deliver('ses', email, T.otpEmail(otp), { label: 'Sign-in code', delivery: { kind: 'otp' } });
  }

  async sendWelcomeEmail(email: string, userName: string): Promise<void> {
    await this.deliver('ses', email, T.welcomeEmail(userName));
  }

  // =====================================================
  // REGISTRATIONS & EVENTS
  // =====================================================

  async sendRegistrationConfirmation(
    data: T.RegistrationConfirmationData,
    delivery?: DeliveryOpts,
  ): Promise<boolean> {
    // Not deliverBranded: the .ics needs the resolved brand for its links.
    const { brand, sender } = await this.brandFor(data.eventId);
    return this.deliver('resend', data.email, T.registrationConfirmationEmail({ ...data, brand }), {
      attachments: this.buildIcsAttachment(data, brand),
      sender,
      delivery,
    });
  }

  async sendPaymentConfirmation(data: T.PaymentConfirmationData, delivery?: DeliveryOpts): Promise<boolean> {
    return this.deliverBranded('resend', data.email, data, T.paymentConfirmationEmail, delivery);
  }

  async sendCancellationConfirmation(data: T.CancellationConfirmationData): Promise<void> {
    await this.deliverBranded('resend', data.email, data, T.cancellationConfirmationEmail);
  }

  async sendEventReminder(data: T.EventReminderData, delivery?: DeliveryOpts): Promise<boolean> {
    return this.deliverBranded('resend', data.email, data, T.eventReminderEmail, delivery);
  }

  async sendEventStartingSoon(data: T.EventStartingSoonData, delivery?: DeliveryOpts): Promise<boolean> {
    return this.deliverBranded('resend', data.email, data, T.eventStartingSoonEmail, delivery);
  }

  async sendEventCancelled(data: T.EventCancelledData, delivery?: DeliveryOpts): Promise<boolean> {
    return this.deliverBranded('resend', data.email, data, T.eventCancelledEmail, delivery);
  }

  async sendEventUpdated(data: T.EventUpdatedData, delivery?: DeliveryOpts): Promise<boolean> {
    return this.deliverBranded('resend', data.email, data, T.eventUpdatedEmail, delivery);
  }

  async sendEventPublished(data: T.EventPublishedData): Promise<void> {
    await this.deliver('resend', data.email, T.eventPublishedEmail(data));
  }

  async sendEventSummary(data: T.EventSummaryData): Promise<void> {
    await this.deliver('resend', data.email, T.eventSummaryEmail(data));
  }

  async sendWaitlistConfirmation(data: T.WaitlistConfirmationData): Promise<void> {
    await this.deliverBranded('resend', data.email, data, T.waitlistConfirmationEmail);
  }

  async sendWaitlistPromoted(data: T.WaitlistPromotedData, delivery?: DeliveryOpts): Promise<boolean> {
    return this.deliverBranded('resend', data.email, data, T.waitlistPromotedEmail, delivery);
  }

  async sendWaitlistRevoked(data: T.WaitlistRevokedData): Promise<void> {
    await this.deliverBranded('resend', data.email, data, T.waitlistRevokedEmail);
  }

  async sendStayUpdate(data: T.StayUpdateData, delivery?: DeliveryOpts): Promise<boolean> {
    return this.deliverBranded('resend', data.email, data, T.stayUpdateEmail, delivery);
  }

  /**
   * Email a recipient a link to their freshly issued certificate (verify page +
   * PDF in storage, no attachment). Sent via SES, not Resend: certificates go
   * out a whole batch at a time, which blew Resend's daily quota. Returns
   * whether the send was accepted, so the caller stamps `emailedAt` only on
   * success (a failed send leaves it null, meaning "needs resend").
   */
  async sendCertificateIssued(data: T.CertificateIssuedData): Promise<boolean> {
    return this.deliverBranded('ses', data.email, data, T.certificateIssuedEmail);
  }

  // =====================================================
  // PAYMENTS
  // =====================================================

  async sendPaymentFailed(data: T.PaymentFailedData): Promise<void> {
    await this.deliverBranded('resend', data.email, data, T.paymentFailedEmail);
  }

  async sendBankAccountRejected(data: T.BankAccountRejectedData): Promise<void> {
    await this.deliver('resend', data.email, T.bankAccountRejectedEmail(data));
  }

  // =====================================================
  // SUPPORT
  // =====================================================

  async sendSupportCaseUpdate(data: T.SupportCaseUpdateData): Promise<void> {
    await this.deliver('resend', data.email, T.supportCaseUpdateEmail(data));
  }

  // =====================================================
  // SPACES
  // =====================================================

  async sendSpaceApproved(data: T.SpaceApprovedData, delivery?: DeliveryOpts): Promise<boolean> {
    return this.deliver('resend', data.email, T.spaceApprovedEmail(data), { delivery });
  }

  async sendSpaceRejected(data: T.SpaceRejectedData, delivery?: DeliveryOpts): Promise<boolean> {
    return this.deliver('resend', data.email, T.spaceRejectedEmail(data), { delivery });
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
      const res = await this.track(
        'ses',
        data.to,
        data.subject,
        () =>
          data.unsubscribeUrl && typeof data.to === 'string'
            ? this.sendBulkWithHeaders(data.to, data.subject, data.html, {
                'List-Unsubscribe': `<${data.unsubscribeUrl}>, <mailto:${SUPPORT}?subject=Unsubscribe>`,
                'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
              })
            : this.sendViaSES(data.to, data.subject, data.html),
        { kind: 'campaign' },
      );
      return { messageId: res.id, ...(res.error ? { error: res.error } : {}) };
    } catch (error) {
      this.logger.error(`Error sending custom campaign ${data.campaignId}: ${error.message}`);
      return { messageId: null, error: error.message };
    }
  }

  /**
   * SES bulk send with extra headers (List-Unsubscribe needs them, and
   * SendEmail can't carry any), as a raw MIME message. Never throws; callers
   * log it through `track` like any other SES send.
   */
  async sendBulkWithHeaders(
    to: string,
    subject: string,
    html: string,
    headers: Record<string, string>,
  ): Promise<AttemptResult> {
    const line = (v: string) => v.replace(/[\r\n]+/g, ' ');
    const b64 = (v: string) => Buffer.from(v, 'utf8').toString('base64');
    const mime = [
      `From: ${encodeWords(this.fromBulk.replace(/\s*<[^>]*>$/, ''))} <${this.bulkAddress}>`,
      `To: ${line(to)}`,
      `Subject: ${encodeWords(line(subject))}`,
      'MIME-Version: 1.0',
      ...Object.entries(headers).map(([k, v]) => `${k}: ${line(v)}`),
      'Content-Type: text/html; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      b64(html).replace(/.{76}/g, '$&\r\n'),
    ].join('\r\n');
    try {
      const result = await this.sesClient.send(
        new SendRawEmailCommand({
          Source: this.fromBulk,
          Destinations: [to],
          RawMessage: { Data: Buffer.from(mime) },
        }),
      );
      return { id: result.MessageId || null, error: result.MessageId ? undefined : 'no_message_id' };
    } catch (error) {
      this.logger.error(`SES raw error: ${error.message}`);
      return { id: null, error: error.message };
    }
  }

  /** Wrap an operator-authored campaign body in the branded shell. */
  wrapCampaignHtml(content: string, unsubscribeUrl?: string): string {
    return layout(content, '', null, unsubscribeUrl);
  }
}

/**
 * A header value as RFC 2047 encoded-words: plain printable ASCII goes as is;
 * anything else becomes =?UTF-8?B?...?= words of at most 45 input bytes each
 * (60 base64 chars, under the 75-char word limit), folded onto new lines.
 * Chunks split on code points, so a character is never cut in half.
 */
export function encodeWords(text: string): string {
  if (/^[\x20-\x7e]*$/.test(text)) return text;
  const words: string[] = [];
  let chunk = '';
  for (const ch of text) {
    if (Buffer.byteLength(chunk + ch) > 45) {
      words.push(chunk);
      chunk = '';
    }
    chunk += ch;
  }
  if (chunk) words.push(chunk);
  return words.map((w) => `=?UTF-8?B?${Buffer.from(w).toString('base64')}?=`).join('\r\n ');
}
