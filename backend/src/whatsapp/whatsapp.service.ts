import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma, WhatsappMessageDirection } from '@prisma/client';
import { randomUUID } from 'crypto';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { PlatformConfigService } from '../subscription/platform-config.service';
import { NotificationEvents } from '../notifications/notifications.constants';
import type { WhatsappInboundEvent } from '../notifications/notifications.events';

interface WhatsAppTemplateComponent {
  type: string;
  sub_type?: string;
  index?: string;
  parameters: Array<{
    type: string;
    text?: string;
    image?: { link: string };
  }>;
}

interface WhatsAppTemplateMessage {
  messaging_product: 'whatsapp';
  to: string;
  type: 'template';
  template: {
    name: string;
    language: {
      code: string;
    };
    components: WhatsAppTemplateComponent[];
  };
}

// Approved template IDs from Meta
const TEMPLATES = {
  OTP: 'otp', // id: 2217845882320700
  EVENT_REGISTRATION: 'event_registration_confirmation', // id: 1543620650451828
  EVENT_REMINDER: 'event_reminder_24h', // id: 1597512415277975
  REGISTRATION_CANCELLED: 'registration_cancelled', // id: 1972305506770198
  SPACE_APPROVED: 'space_approved', // id: 1603977184033350
  SPACE_REJECTED: 'space_rejected', // id: 973091392100936
  CHECKIN_CONFIRMED: 'checkin_confirmed', // id: 1687119155773855
  PAYMENT_CONFIRMED: 'payment_confirmed', // id: 4462855363943057
  NEW_SPACE_SUBMITTED: 'new_space_submitted', // id: 1011838481193096 (PENDING)
  // PENDING APPROVAL in Meta Business Manager. Body params:
  //   {{1}}=userName, {{2}}=eventTitle, {{3}}=joinLabel ("group"/"community"),
  //   {{4}}=inviteUrl (full https://chat.whatsapp.com/<code>, tappable in-chat).
  // Until this template is approved, sends fail-soft (logged, never fatal).
  EVENT_WHATSAPP_GROUP: 'event_whatsapp_group',
  // "Unifesto Stats" broadcast. The Cloud API cannot post to a WhatsApp group,
  // so this template is sent 1:1 to every number in the admin-managed stats
  // recipient list (platform_config.stats_recipients). Approved 2026-09-26
  // (UTILITY, static footer). Body params (7):
  //   {{1}}=label ("Daily Snapshot" / "Weekly Digest"), {{2}}=periodText,
  //   {{3}}=newUsers, {{4}}=newSpaces, {{5}}=newEvents, {{6}}=registrations,
  //   {{7}}=revenue (e.g. "₹12,340").
  UNIFESTO_STATS: 'unifesto_stats_update',
} as const;

// Header images from S3 bucket
const HEADER_IMAGES = {
  EVENT_REGISTRATION: 'https://unifesto-storage-bucket.s3.ap-south-1.amazonaws.com/whatsapp-headers/registration_confirmed.png',
  SPACE_APPROVED: 'https://unifesto-storage-bucket.s3.ap-south-1.amazonaws.com/whatsapp-headers/space_approved.png',
  CHECKIN_CONFIRMED: 'https://unifesto-storage-bucket.s3.ap-south-1.amazonaws.com/whatsapp-headers/checkin.png',
} as const;

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);
  /** Meta Graph API base — used for both messages and media lookups. */
  private readonly graphBase = 'https://graph.facebook.com/v18.0';
  /**
   * Inbound types whose bytes we copy to S3 so the inbox can render/play them.
   * Covers every WhatsApp media kind — the copy is generic; the inbox picks the
   * right element (img / video / audio / document link) from the message `type`.
   */
  private readonly downloadableMediaTypes = new Set([
    'image',
    'sticker',
    'video',
    'audio',
    'document',
  ]);
  private readonly phoneNumberId: string;
  private readonly accessToken: string;
  private readonly apiUrl: string;
  /** WhatsApp Business Account id — needed to list message templates. */
  private readonly wabaId: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly events: EventEmitter2,
    private readonly platformConfig: PlatformConfigService,
  ) {
    this.phoneNumberId = this.configService.get<string>('WHATSAPP_PHONE_NUMBER_ID')!;
    this.accessToken = this.configService.get<string>('WHATSAPP_ACCESS_TOKEN')!;
    this.apiUrl = `${this.graphBase}/${this.phoneNumberId}/messages`;
    this.wabaId = this.configService.get<string>('WHATSAPP_BUSINESS_ACCOUNT_ID') ?? '';

    if (!this.phoneNumberId || !this.accessToken) {
      this.logger.warn('WhatsApp credentials not configured. WhatsApp notifications will not work.');
    }

    // Fail-loud guard: Meta signs inbound webhooks with the App Secret (a 32-char
    // hex string). If WHATSAPP_APP_SECRET is missing or not 32-hex, EVERY inbound
    // webhook is silently rejected with "invalid signature" and the inbox stays
    // empty. Surface that at boot rather than as a stream of 400s. (This is a
    // shape check only — it can't tell a wrong-but-valid-shaped secret.)
    const appSecret = this.configService.get<string>('WHATSAPP_APP_SECRET')?.trim();
    if (!appSecret) {
      this.logger.warn(
        'WHATSAPP_APP_SECRET is not set — inbound WhatsApp webhooks will be rejected. Set it to your Meta App Secret (App settings → Basic → App Secret).',
      );
    } else if (!/^[0-9a-fA-F]{32}$/.test(appSecret)) {
      this.logger.warn(
        `WHATSAPP_APP_SECRET does not look like a Meta App Secret (expected 32 hex chars, got ${appSecret.length}). Inbound webhooks will likely fail signature verification. Did you swap it with WHATSAPP_WEBHOOK_VERIFY_TOKEN?`,
      );
    }
  }

  // =====================================================
  // UTILITY FUNCTIONS
  // =====================================================

  /**
   * Format phone number for WhatsApp API
   * Ensures country code and removes invalid characters
   */
  private formatPhoneNumber(phoneNumber: string): string {
    if (!phoneNumber) return '';

    const hadPlus = phoneNumber.trim().startsWith('+');
    let digits = phoneNumber.replace(/\D/g, '');
    if (!digits) return '';

    // Already E.164 (author typed a +): trust it, just re-attach the +.
    if (hadPlus) return '+' + digits;

    // No +. Only add a country code when one is clearly absent — otherwise we
    // double-prefix (e.g. Meta's wa_id "919848945690" must NOT become
    // "+91919848945690", which Meta reports as "Message undeliverable").
    if (digits.startsWith('0')) {
      // National format like 0XXXXXXXXXX → strip the trunk 0, assume India.
      digits = '91' + digits.replace(/^0+/, '');
    } else if (digits.length === 10) {
      // Bare 10-digit local mobile → assume India.
      digits = '91' + digits;
    }
    // else: 11+ digits with no leading 0 already carry a country code
    // (e.g. "91XXXXXXXXXX") — leave untouched.

    return '+' + digits;
  }

  /**
   * Format event date
   * Output: "1 July 2026"
   */
  private formatEventDate(dateTime: Date, timezone = 'Asia/Kolkata'): string {
    return new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: timezone,
    }).format(dateTime);
  }

  /**
   * Format event time range
   * Output: "10:00 AM - 01:00 PM IST"
   */
  private formatEventTime(startTime: Date, endTime: Date, timezone = 'Asia/Kolkata'): string {
    const formatTime = (date: Date) => 
      new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: timezone,
      }).format(date);

    return `${formatTime(startTime)} - ${formatTime(endTime)} IST`;
  }

  /**
   * Format venue string based on event type
   */
  private formatVenue(event: {
    type: string;
    venueName?: string;
    city?: string;
    onlineUrl?: string;
  }): string {
    if (event.type === 'ONLINE') {
      return `Online - ${event.onlineUrl || 'Link will be shared'}`;
    } else if (event.type === 'HYBRID') {
      const physical = event.venueName && event.city 
        ? `${event.venueName}, ${event.city}` 
        : 'Venue TBA';
      return `${physical} + Online`;
    } else {
      // IN_PERSON
      return event.venueName && event.city 
        ? `${event.venueName}, ${event.city}` 
        : 'Venue TBA';
    }
  }

  // =====================================================
  // CORE MESSAGING FUNCTIONS
  // =====================================================

  /**
   * Send template message via WhatsApp API
   */
  private async sendTemplateMessage(
    to: string,
    templateName: string,
    bodyParameters: string[],
    hasImageHeader = false,
    imageUrl?: string,
    languageCode = 'en',
  ): Promise<boolean> {
    // Skip if phone number is empty
    if (!to) {
      this.logger.warn('Skipping WhatsApp send - empty phone number');
      return false;
    }

    const formattedPhone = this.formatPhoneNumber(to);
    if (!formattedPhone) {
      this.logger.warn(`Invalid phone number format: ${to}`);
      return false;
    }

    try {
      const components: WhatsAppTemplateComponent[] = [];

      // Add header component if image is required
      if (hasImageHeader && imageUrl) {
        components.push({
          type: 'header',
          parameters: [
            {
              type: 'image',
              image: { link: imageUrl },
            },
          ],
        });
      }

      // Add body component with text parameters
      components.push({
        type: 'body',
        parameters: bodyParameters.map((text) => ({
          type: 'text',
          text,
        })),
      });

      const message: WhatsAppTemplateMessage = {
        messaging_product: 'whatsapp',
        to: formattedPhone,
        type: 'template',
        template: {
          name: templateName,
          language: {
            code: languageCode,
          },
          components,
        },
      };

      const response = await axios.post(this.apiUrl, message, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      const messageId = response.data.messages?.[0]?.id;
      this.logger.log(`WhatsApp template sent: ${templateName} to ${formattedPhone}, ID: ${messageId}`);
      return true;
    } catch (error: any) {
      if (error.response) {
        this.logger.error(`WhatsApp API error for template ${templateName}`, {
          status: error.response.status,
          error: error.response.data?.error,
          phone: formattedPhone,
        });
      } else {
        this.logger.error(`WhatsApp send error for template ${templateName}`, error);
      }
      // DO NOT throw - notification failures must never break main flow
      return false;
    }
  }

  // =====================================================
  // EXISTING METHODS (Keep unchanged signatures)
  // =====================================================

  /**
   * Send OTP via WhatsApp using approved template
   * Template: otp (id: 2217845882320700)
   * Has "Copy code" button
   */
  async sendOtp(phoneNumber: string, otp: string): Promise<void> {
    try {
      const formattedPhone = this.formatPhoneNumber(phoneNumber);
      if (!formattedPhone) {
        this.logger.warn(`Invalid phone number format: ${phoneNumber}`);
        return;
      }
      const message = {
        messaging_product: 'whatsapp',
        to: formattedPhone,
        type: 'template',
        template: {
          name: TEMPLATES.OTP,
          language: { code: 'en' },
          components: [
            {
              type: 'body',
              parameters: [{ type: 'text', text: otp }],
            },
            {
              type: 'button',
              sub_type: 'url',
              index: '0',
              parameters: [{ type: 'text', text: otp }],
            },
          ],
        },
      };
      const axios = require('axios');
      await axios.post(this.apiUrl, message, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
      });
      this.logger.log(`WhatsApp OTP sent to ${phoneNumber}`);
    } catch (error) {
      this.logger.error('Failed to send WhatsApp OTP', error);
    }
  }

  /**
   * Send welcome message via WhatsApp
   * Note: Currently not configured - requires template approval
   */
  async sendWelcomeMessage(phoneNumber: string, username: string): Promise<void> {
    try {
      this.logger.log(`Welcome message skipped for ${phoneNumber} - template not configured`);
      // Welcome message requires separate template approval
      // Create template named "welcome" in Meta Business Manager if needed
    } catch (error) {
      this.logger.error('Failed to send welcome message', error);
      // Don't throw - welcome message is not critical
    }
  }

  /**
   * Refund status update to an attendee. Requires a WhatsApp template approved in
   * Meta Business Manager (e.g. "refund_update" with params userName, eventTitle,
   * status). Until that template exists this no-ops with a log — the call sites
   * are wired so it starts sending as soon as the template is registered and its
   * name is added to TEMPLATES. Email remains the primary channel meanwhile.
   */
  async sendRefundUpdate(
    mobileNumber: string,
    data: { userName: string; eventTitle: string; status: string; detail?: string },
  ): Promise<void> {
    try {
      if (!mobileNumber) return;
      this.logger.log(
        `Refund update skipped for ${mobileNumber} (${data.eventTitle}: ${data.status}) - template not configured`,
      );
      // Create template "refund_update" in Meta Business Manager, add it to
      // TEMPLATES, then call sendTemplateMessage here with the params above.
    } catch (error) {
      this.logger.error('Failed to send refund update', error);
      // Don't throw - notification is not critical to the refund itself.
    }
  }

  /**
   * Verify WhatsApp webhook signature
   */
  verifyWebhookSignature(signature: string, payload: string): boolean {
    const crypto = require('crypto');
    // Meta signs the raw body with the *Meta App Secret* (NOT the webhook verify
    // token) — a 32-char hex string from App Settings → Basic → App Secret.
    // Trim in case it picked up a stray newline/space from the .env file, a
    // common cause of *every* Meta webhook failing signature checks.
    const appSecret = this.configService
      .get<string>('WHATSAPP_APP_SECRET')
      ?.trim();

    if (!appSecret) {
      this.logger.warn('WHATSAPP_APP_SECRET not configured');
      return false;
    }

    // Meta signs the raw body with the app secret (HMAC-SHA256) and sends it as
    // `sha256=<hex>` in the X-Hub-Signature-256 header.
    const expectedSignature = `sha256=${crypto
      .createHmac('sha256', appSecret)
      .update(payload)
      .digest('hex')}`;

    const provided = (signature ?? '').trim();

    // Constant-time comparison; bail early if the lengths differ (timingSafeEqual
    // throws on mismatched buffer lengths).
    const a = Buffer.from(provided);
    const b = Buffer.from(expectedSignature);
    if (a.length !== b.length) {
      return false;
    }
    return crypto.timingSafeEqual(a, b);
  }

  /**
   * Check if WhatsApp service is configured
   */
  isConfigured(): boolean {
    return !!(this.phoneNumberId && this.accessToken);
  }

  /**
   * Verify Meta's webhook subscription handshake.
   * Meta sends GET ?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...
   * We must echo back the challenge iff the token matches ours.
   * Returns the challenge string on success, or null on failure.
   */
  verifyWebhookChallenge(
    mode: string | undefined,
    token: string | undefined,
    challenge: string | undefined,
  ): string | null {
    const verifyToken = this.configService.get<string>(
      'WHATSAPP_WEBHOOK_VERIFY_TOKEN',
    );

    if (!verifyToken) {
      this.logger.warn('WHATSAPP_WEBHOOK_VERIFY_TOKEN not configured');
      return null;
    }

    if (mode === 'subscribe' && token === verifyToken && challenge) {
      this.logger.log('WhatsApp webhook verification succeeded');
      return challenge;
    }

    this.logger.warn('WhatsApp webhook verification failed (mode/token mismatch)');
    return null;
  }

  /**
   * Process an inbound WhatsApp webhook payload (messages and statuses).
   *
   * Meta expects a fast 200, so the controller does NOT await this — it is
   * fire-and-forget. Every branch is wrapped so a persistence hiccup can never
   * bubble out and cause Meta to retry the delivery.
   *
   * Inbound messages are persisted into the WhatsApp inbox (upserting the
   * conversation and bumping its unread counter); status callbacks update the
   * delivery state of the outbound reply they reference.
   */
  async handleWebhookPayload(body: any): Promise<void> {
    try {
      const entries = Array.isArray(body?.entry) ? body.entry : [];

      for (const entry of entries) {
        const changes = Array.isArray(entry?.changes) ? entry.changes : [];

        for (const change of changes) {
          const value = change?.value ?? {};

          // contacts[] carries the sender's profile name, keyed by wa_id.
          const contacts = Array.isArray(value.contacts) ? value.contacts : [];
          const profileByWaId = new Map<string, string>();
          for (const contact of contacts) {
            if (contact?.wa_id && contact?.profile?.name) {
              profileByWaId.set(String(contact.wa_id), String(contact.profile.name));
            }
          }

          // Inbound messages from users → persist to the inbox.
          const messages = Array.isArray(value.messages) ? value.messages : [];
          for (const message of messages) {
            await this.persistInboundMessage(message, profileByWaId).catch((error) =>
              this.logger.error(
                `Failed to persist inbound WhatsApp message ${message?.id}: ${
                  error instanceof Error ? error.message : String(error)
                }`,
              ),
            );
          }

          // Delivery / read status updates for messages we sent.
          const statuses = Array.isArray(value.statuses) ? value.statuses : [];
          for (const status of statuses) {
            await this.applyStatusUpdate(status).catch((error) =>
              this.logger.error(
                `Failed to apply WhatsApp status ${status?.id}: ${
                  error instanceof Error ? error.message : String(error)
                }`,
              ),
            );
          }
        }
      }
    } catch (error) {
      this.logger.error(
        `Failed to process WhatsApp webhook payload: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * Turn one inbound webhook message into a persisted inbox row, upserting its
   * conversation. Deduped on Meta's `wamid` so webhook retries are idempotent.
   */
  private async persistInboundMessage(
    message: any,
    profileByWaId: Map<string, string>,
  ): Promise<void> {
    const waId = String(message?.from ?? '').trim();
    const waMessageId = message?.id ? String(message.id) : null;
    if (!waId || !waMessageId) return;

    // Already stored? (retry) — skip without touching the unread counter.
    const existing = await this.prisma.whatsappMessage.findUnique({
      where: { waMessageId },
      select: { id: true },
    });
    if (existing) return;

    const type = String(message?.type ?? 'text');
    const { body, mediaNote, mediaId } = this.extractInboundContent(message, type);
    const profileName = profileByWaId.get(waId) ?? null;

    // Copy image/sticker bytes to S3 so the inbox can render a preview. Other
    // media types keep their text note only. Fail-soft — null on any error.
    const mediaUrl =
      mediaId && this.downloadableMediaTypes.has(type)
        ? await this.fetchAndStoreMedia(mediaId, waId, type)
        : null;
    // Meta sends a unix-seconds timestamp; fall back to now if absent/bad.
    const sentAt = message?.timestamp
      ? new Date(Number(message.timestamp) * 1000)
      : new Date();
    const inboundAt = Number.isFinite(sentAt.getTime()) ? sentAt : new Date();

    const conversation = await this.prisma.whatsappConversation.upsert({
      where: { waId },
      create: {
        waId,
        profileName,
        lastInboundAt: inboundAt,
        lastMessageAt: inboundAt,
        unreadCount: 1,
      },
      update: {
        // Keep the freshest profile name Meta gives us.
        ...(profileName ? { profileName } : {}),
        lastInboundAt: inboundAt,
        lastMessageAt: inboundAt,
        unreadCount: { increment: 1 },
      },
    });

    await this.prisma.whatsappMessage.create({
      data: {
        conversationId: conversation.id,
        direction: WhatsappMessageDirection.INBOUND,
        waMessageId,
        type,
        body,
        mediaNote,
        mediaUrl,
        createdAt: inboundAt,
      },
    });

    this.logger.log(`Stored inbound WhatsApp message from ${waId} (type=${type})`);

    // Push the platform admins (handled in NotificationsModule; emit-only, so
    // WhatsAppModule never imports it).
    const alert: WhatsappInboundEvent = {
      conversationId: conversation.id,
      senderName: conversation.profileName || `+${waId}`,
      preview: body || mediaNote || `[${type}]`,
    };
    this.events.emit(NotificationEvents.WhatsappInbound, alert);
  }

  /**
   * Pull a human-readable body + attachment note out of an inbound message of
   * any type. Text/interactive replies become `body`; media becomes a short
   * `mediaNote` (we don't download the binary — admins reply in text).
   */
  private extractInboundContent(
    message: any,
    type: string,
  ): { body: string | null; mediaNote: string | null; mediaId: string | null } {
    switch (type) {
      case 'text':
        return { body: message?.text?.body ?? null, mediaNote: null, mediaId: null };
      case 'button':
        return { body: message?.button?.text ?? null, mediaNote: null, mediaId: null };
      case 'interactive': {
        const i = message?.interactive ?? {};
        const label =
          i?.button_reply?.title ?? i?.list_reply?.title ?? null;
        return { body: label, mediaNote: null, mediaId: null };
      }
      case 'image':
      case 'video':
      case 'document':
      case 'audio':
      case 'sticker': {
        const media = message?.[type] ?? {};
        // Prefer the sender's caption; for documents fall back to the filename so
        // the inbox has a label to render on the download link.
        const caption = media?.caption ?? (type === 'document' ? media?.filename ?? null : null);
        const note = `[${type}]${media?.mime_type ? ` ${media.mime_type}` : ''}`;
        return { body: caption, mediaNote: note, mediaId: media?.id ?? null };
      }
      case 'contacts': {
        // A shared contact card (an array of contacts). Surface the first name so
        // the thread shows who was shared rather than a bare "[contacts]".
        const contacts = Array.isArray(message?.contacts) ? message.contacts : [];
        const name = contacts[0]?.name?.formatted_name ?? null;
        const extra = contacts.length > 1 ? ` +${contacts.length - 1} more` : '';
        return {
          body: name ? `Shared a contact: ${name}${extra}` : null,
          mediaNote: name ? null : '[contact card]',
          mediaId: null,
        };
      }
      case 'location': {
        const loc = message?.location ?? {};
        return {
          body: loc?.name ?? null,
          mediaNote: `[location] ${loc?.latitude ?? '?'},${loc?.longitude ?? '?'}`,
          mediaId: null,
        };
      }
      case 'reaction': {
        // A reaction to one of our messages. Meta gives `emoji` (the reaction)
        // and `message_id` (the target); an empty emoji means it was removed.
        const emoji = message?.reaction?.emoji ?? null;
        return {
          body: emoji ? `Reacted ${emoji}` : 'Removed their reaction',
          mediaNote: null,
          mediaId: null,
        };
      }
      case 'unsupported': {
        // Meta couldn't parse the message (e.g. a poll or a newer type). There
        // is no content to render — surface the reason it gives, if any.
        const title = message?.errors?.[0]?.title ?? null;
        return {
          body: null,
          mediaNote: title ? `[unsupported: ${title}]` : '[unsupported message]',
          mediaId: null,
        };
      }
      default:
        return { body: null, mediaNote: `[${type}]`, mediaId: null };
    }
  }

  /**
   * Copy an inbound media object to our own S3 so the inbox can embed it.
   *
   * Meta media is a two-hop, token-gated fetch: `GET /{media-id}` returns a
   * short-lived signed URL (~5 min, and it 401s without the bearer token, so it
   * can't be used in an <img> directly); we then download those bytes and
   * re-upload them to S3. Fail-soft: any error returns null and the caller keeps
   * the text `mediaNote` fallback.
   */
  private async fetchAndStoreMedia(
    mediaId: string,
    waId: string,
    type: string,
  ): Promise<string | null> {
    if (!this.isConfigured()) return null;
    // Cap per kind so we never buffer a runaway object in memory: documents can
    // legitimately be large (Meta allows up to 100MB), the rest stay small.
    // Anything over the cap fails-soft to the text `mediaNote`.
    const maxBytes = (type === 'document' ? 64 : 16) * 1024 * 1024;
    try {
      // 1. Resolve the media id to a temporary, authenticated download URL.
      const meta = await axios.get(`${this.graphBase}/${mediaId}`, {
        headers: { Authorization: `Bearer ${this.accessToken}` },
      });
      const downloadUrl: string | undefined = meta.data?.url;
      const mimeType: string = meta.data?.mime_type || 'application/octet-stream';
      if (!downloadUrl) return null;

      // 2. Download the bytes (the token is required here too).
      const binary = await axios.get<ArrayBuffer>(downloadUrl, {
        headers: { Authorization: `Bearer ${this.accessToken}` },
        responseType: 'arraybuffer',
        // Guard against a surprise large object slipping through the type filter.
        maxContentLength: maxBytes,
        maxBodyLength: maxBytes,
      });

      // 3. Persist to S3 under a stable, per-conversation key.
      const ext = mimeType.split('/')[1]?.split(';')[0] || 'bin';
      const key = `whatsapp-inbox/${waId}/${mediaId}.${ext}`;
      return await this.storage.uploadBuffer(
        Buffer.from(binary.data),
        key,
        mimeType,
      );
    } catch (error: any) {
      this.logger.error(
        `Failed to copy WhatsApp media ${mediaId}: ${
          error?.response?.status ?? ''
        } ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  /**
   * Apply a delivery/read/failed status callback to the outbound reply it
   * references (matched on Meta's message id). No-op if we didn't send it.
   */
  private async applyStatusUpdate(status: any): Promise<void> {
    const waMessageId = status?.id ? String(status.id) : null;
    const state = status?.status ? String(status.status) : null;
    if (!waMessageId || !state) return;

    const errorText = Array.isArray(status?.errors) && status.errors.length
      ? String(status.errors[0]?.title ?? status.errors[0]?.message ?? 'delivery error')
      : null;

    await this.prisma.whatsappMessage.updateMany({
      where: { waMessageId, direction: WhatsappMessageDirection.OUTBOUND },
      data: { status: state, ...(errorText ? { errorText } : {}) },
    });
  }

  // =====================================================
  // ADMIN INBOX — read + reply
  // =====================================================

  /**
   * Decide whether a free-form (non-template) reply is allowed right now.
   *
   * WhatsApp only permits free-form "session" messages within a 24-hour
   * customer-service window that reopens each time the customer messages us.
   * Outside it, ONLY pre-approved template messages send (Meta rejects the rest
   * with error 131047). This guard is the single place that policy lives.
   *
   * NOTE (design decision — you may want to own this): returning `false` here
   * blocks the send before it ever hits Meta and shows the admin a clear reason,
   * rather than letting Meta reject it after the fact. If you'd instead prefer
   * to always attempt the send and surface Meta's own error, relax this to
   * always return `{ allowed: true }`.
   */
  private replyWindowState(lastInboundAt: Date | null): {
    allowed: boolean;
    reason?: string;
  } {
    if (!lastInboundAt) {
      return {
        allowed: false,
        reason:
          'This contact has never messaged us, so a free-form reply is not allowed. Only pre-approved templates can start a conversation.',
      };
    }
    const ageMs = Date.now() - lastInboundAt.getTime();
    const WINDOW_MS = 24 * 60 * 60 * 1000;
    if (ageMs > WINDOW_MS) {
      return {
        allowed: false,
        reason:
          'The 24-hour reply window has closed (the contact last messaged more than 24h ago). Only a pre-approved template can reach them now.',
      };
    }
    return { allowed: true };
  }

  /** Public helper so the API can show the window state without sending. */
  isReplyWindowOpen(lastInboundAt: Date | null): boolean {
    return this.replyWindowState(lastInboundAt).allowed;
  }

  /**
   * Resolve a conversation to a sendable recipient, enforcing the two gates every
   * outbound reply shares: the conversation must exist, its 24h reply window must
   * be open, and WhatsApp must be configured. Returns the digits-only `to`.
   *
   * `waId` is Meta's wa_id — already a full international number in digits-only
   * form (e.g. "919848945690"). Send it back verbatim. Do NOT run it through
   * formatPhoneNumber(): that helper assumes a local, country-code-less number
   * and would prepend +91, producing the invalid "+91919848945690" and a Meta
   * "Message undeliverable" status callback.
   */
  private async assertReplyableTarget(
    conversationId: string,
  ): Promise<{ to: string }> {
    const conversation = await this.prisma.whatsappConversation.findUnique({
      where: { id: conversationId },
    });
    if (!conversation) {
      throw new BadRequestException('Conversation not found');
    }

    const window = this.replyWindowState(conversation.lastInboundAt);
    if (!window.allowed) {
      throw new BadRequestException(window.reason);
    }

    if (!this.isConfigured()) {
      throw new BadRequestException('WhatsApp is not configured on the server.');
    }

    return { to: conversation.waId.replace(/\D/g, '') };
  }

  /**
   * Send a free-form text reply from an admin and persist it. Enforces the 24h
   * window first, then posts a `type: text` message to the Cloud API. On any
   * Meta failure the row is still stored (status='failed') so the thread shows
   * the attempt and its error.
   */
  async sendReply(
    conversationId: string,
    adminUserId: string,
    text: string,
  ): Promise<{ id: string; status: string }> {
    const { to } = await this.assertReplyableTarget(conversationId);
    let waMessageId: string | null = null;
    let status = 'sent';
    let errorText: string | null = null;

    try {
      const response = await axios.post(
        this.apiUrl,
        {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to,
          type: 'text',
          text: { preview_url: false, body: text },
        },
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
        },
      );
      waMessageId = response.data?.messages?.[0]?.id ?? null;
    } catch (error: any) {
      status = 'failed';
      errorText =
        error?.response?.data?.error?.message ??
        (error instanceof Error ? error.message : 'Failed to send reply');
      this.logger.error(`WhatsApp reply send failed to ${to}: ${errorText}`);
    }

    const message = await this.prisma.whatsappMessage.create({
      data: {
        conversationId,
        direction: WhatsappMessageDirection.OUTBOUND,
        waMessageId,
        type: 'text',
        body: text,
        sentById: adminUserId,
        status,
        errorText,
      },
    });

    if (status !== 'failed') {
      await this.prisma.whatsappConversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: new Date() },
      });
    }

    if (status === 'failed') {
      throw new BadRequestException(errorText ?? 'Failed to send reply');
    }

    return { id: message.id, status };
  }

  /**
   * Map an upload's MIME type to the WhatsApp media kind we send it as. Anything
   * we don't inline as image/video/audio rides as a `document`, which the Cloud
   * API accepts for any MIME type — so the mapping never rejects a file. Note we
   * do NOT map image/webp to a sticker: outbound stickers must meet strict size
   * constraints (512×512, <100KB) that a general upload won't, so webp goes as a
   * document, which always delivers.
   */
  private whatsappMediaKind(
    mimetype: string,
  ): 'image' | 'video' | 'audio' | 'document' {
    const mime = (mimetype || '').toLowerCase();
    if (mime === 'image/jpeg' || mime === 'image/png') return 'image';
    if (mime.startsWith('video/')) return 'video';
    if (mime.startsWith('audio/')) return 'audio';
    return 'document';
  }

  /**
   * Send a media reply (image / video / audio / document) from an admin and
   * persist it. Same 24h-window rule as {@link sendReply}.
   *
   * We host the bytes on our own S3 and send by `link` (a public URL) rather than
   * pre-uploading to Meta's media endpoint — one fewer hop, and it doubles as the
   * copy the inbox thread renders the sent attachment from. On any Meta failure
   * the row is still stored (status='failed') so the thread shows the attempt.
   */
  async sendMediaReply(
    conversationId: string,
    adminUserId: string,
    file: Express.Multer.File,
    caption?: string,
  ): Promise<{ id: string; status: string }> {
    if (!file) {
      throw new BadRequestException('No file was uploaded.');
    }

    const { to } = await this.assertReplyableTarget(conversationId);

    const kind = this.whatsappMediaKind(file.mimetype);
    const trimmedCaption = caption?.trim() || null;
    // Only image/video/document carry a caption on WhatsApp; audio/sticker don't.
    const captionable = kind === 'image' || kind === 'video' || kind === 'document';

    // 1. Host the bytes on S3 so Meta can fetch them by link and the thread can
    //    render the sent attachment (Content-Type is set from the upload's MIME).
    const mediaUrl = await this.storage.uploadFile(
      file,
      `whatsapp-outbound/${to}/`,
      randomUUID(),
    );

    // 2. Build the Cloud API media object. Documents also carry a filename so the
    //    recipient sees the original name rather than the opaque S3 key.
    const mediaObject: Record<string, string> = { link: mediaUrl };
    if (captionable && trimmedCaption) mediaObject.caption = trimmedCaption;
    if (kind === 'document') mediaObject.filename = file.originalname;

    let waMessageId: string | null = null;
    let status = 'sent';
    let errorText: string | null = null;

    try {
      const response = await axios.post(
        this.apiUrl,
        {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to,
          type: kind,
          [kind]: mediaObject,
        },
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
        },
      );
      waMessageId = response.data?.messages?.[0]?.id ?? null;
    } catch (error: any) {
      status = 'failed';
      errorText =
        error?.response?.data?.error?.message ??
        (error instanceof Error ? error.message : 'Failed to send media');
      this.logger.error(`WhatsApp media reply failed to ${to}: ${errorText}`);
    }

    const message = await this.prisma.whatsappMessage.create({
      data: {
        conversationId,
        direction: WhatsappMessageDirection.OUTBOUND,
        waMessageId,
        type: kind,
        body: trimmedCaption,
        mediaNote: `[${kind}]${file.mimetype ? ` ${file.mimetype}` : ''}`,
        mediaUrl,
        sentById: adminUserId,
        status,
        errorText,
      },
    });

    if (status !== 'failed') {
      await this.prisma.whatsappConversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: new Date() },
      });
    }

    if (status === 'failed') {
      throw new BadRequestException(errorText ?? 'Failed to send media');
    }

    return { id: message.id, status };
  }

  /**
   * Start a brand-new conversation from Apex by sending an approved template.
   *
   * A free-form text can only go out inside the 24h window a contact opens by
   * messaging us, so *initiating* contact must use a pre-approved template
   * (Meta policy). We send the template, then upsert the conversation + an
   * OUTBOUND row so it shows in the inbox. This does NOT open the reply window —
   * only the contact replying does — so `replyWindowOpen` stays false until they
   * respond.
   */
  async initiateConversation(params: {
    adminUserId: string;
    to: string;
    templateName: string;
    bodyParams?: string[];
    languageCode?: string;
  }): Promise<{ id: string; conversationId: string; status: string }> {
    const { adminUserId, to, templateName } = params;

    if (!this.isConfigured()) {
      throw new BadRequestException('WhatsApp is not configured on the server.');
    }
    if (!to?.trim() || !templateName?.trim()) {
      throw new BadRequestException('A recipient number and a template name are required.');
    }

    const formatted = this.formatPhoneNumber(to);
    const waId = formatted.replace(/\D/g, ''); // inbox keys conversations by digits-only wa_id
    if (!waId) {
      throw new BadRequestException(`Invalid phone number: ${to}`);
    }

    const bodyParams = (params.bodyParams ?? []).map((p) => String(p));
    const languageCode = params.languageCode?.trim() || 'en';

    let waMessageId: string | null = null;
    let status = 'sent';
    let errorText: string | null = null;

    try {
      const message: WhatsAppTemplateMessage = {
        messaging_product: 'whatsapp',
        to: formatted,
        type: 'template',
        template: {
          name: templateName.trim(),
          language: { code: languageCode },
          components: bodyParams.length
            ? [
                {
                  type: 'body',
                  parameters: bodyParams.map((text) => ({ type: 'text', text })),
                },
              ]
            : [],
        },
      };

      const response = await axios.post(this.apiUrl, message, {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
      });
      waMessageId = response.data?.messages?.[0]?.id ?? null;
    } catch (error: any) {
      status = 'failed';
      errorText =
        error?.response?.data?.error?.message ??
        (error instanceof Error ? error.message : 'Failed to send template');
      this.logger.error(
        `WhatsApp initiate failed to ${formatted} (template=${templateName}): ${errorText}`,
      );
    }

    // Upsert the conversation regardless — a failed attempt should still surface
    // in the inbox with its error, and never clobber a real lastInboundAt.
    const conversation = await this.prisma.whatsappConversation.upsert({
      where: { waId },
      create: { waId, lastMessageAt: new Date() },
      update: { lastMessageAt: new Date() },
    });

    // A readable body for the thread: template name + any params.
    const summary = bodyParams.length
      ? `[template: ${templateName}] ${bodyParams.join(' | ')}`
      : `[template: ${templateName}]`;

    const message = await this.prisma.whatsappMessage.create({
      data: {
        conversationId: conversation.id,
        direction: WhatsappMessageDirection.OUTBOUND,
        waMessageId,
        type: 'template',
        body: summary,
        sentById: adminUserId,
        status,
        errorText,
      },
    });

    if (status === 'failed') {
      throw new BadRequestException(errorText ?? 'Failed to send template');
    }

    return { id: message.id, conversationId: conversation.id, status };
  }

  // =====================================================
  // PLATFORM BROADCAST (admin → many users)
  // Send an approved template to all users, one Space's members, or a chosen
  // set of users. Sending happens in the background (fail-soft, sequential) so a
  // large audience never blocks the request or trips Meta's rate limit.
  // =====================================================

  /** A resolved broadcast target: enough to send and to personalize. */
  private mapRecipient(u: {
    id: string;
    fullName: string | null;
    username: string | null;
    mobileNumber: string;
  }): { userId: string; name: string; mobileNumber: string } {
    return {
      userId: u.id,
      name: (u.fullName || u.username || '').trim(),
      mobileNumber: u.mobileNumber,
    };
  }

  /**
   * Resolve the concrete list of people a broadcast should reach, de-duplicated
   * by their (formatted) phone number so nobody is messaged twice.
   */
  async resolveBroadcastRecipients(params: {
    audience: 'ALL' | 'SPACE' | 'USER';
    spaceId?: string;
    userIds?: string[];
  }): Promise<Array<{ userId: string; name: string; mobileNumber: string }>> {
    const select = {
      id: true,
      fullName: true,
      username: true,
      mobileNumber: true,
    } as const;

    let users: Array<{
      id: string;
      fullName: string | null;
      username: string | null;
      mobileNumber: string;
    }> = [];

    if (params.audience === 'ALL') {
      users = await this.prisma.user.findMany({
        where: { mobileNumber: { not: '' } },
        select,
      });
    } else if (params.audience === 'SPACE') {
      if (!params.spaceId) {
        throw new BadRequestException('A spaceId is required to message a space.');
      }
      // Space members = users with a role scoped to this space (not an
      // event-scoped role). Distinct users, since one person may hold several
      // roles in the same space.
      const roles = await this.prisma.userRole.findMany({
        where: { spaceId: params.spaceId, eventId: null },
        select: { user: { select } },
        distinct: ['userId'],
      });
      users = roles.map((r) => r.user);
    } else {
      if (!params.userIds?.length) {
        throw new BadRequestException('At least one userId is required.');
      }
      users = await this.prisma.user.findMany({
        where: { id: { in: params.userIds } },
        select,
      });
    }

    // De-dupe by the number we'll actually dial.
    const seen = new Set<string>();
    const recipients: Array<{ userId: string; name: string; mobileNumber: string }> = [];
    for (const u of users) {
      const dial = this.formatPhoneNumber(u.mobileNumber);
      if (!dial || seen.has(dial)) continue;
      seen.add(dial);
      recipients.push(this.mapRecipient(u));
    }
    return recipients;
  }

  /**
   * Fill a template's body parameters for one recipient. Any parameter equal to
   * the `{name}` token is replaced with the recipient's name; everything else is
   * sent verbatim to every recipient.
   *
   * Personalization policy (name fallback, which tokens exist) lives here — see
   * the linked note in the PR/handoff; keep it in sync with what the UI hints.
   */
  private personalizeParams(
    bodyParams: string[],
    recipient: { name: string },
  ): string[] {
    const name = recipient.name || 'there';
    return bodyParams.map((p) =>
      p.trim().toLowerCase() === '{name}' ? name : p,
    );
  }

  /**
   * Run the actual fan-out. Sequential + fail-soft (mirrors
   * broadcastStatsUpdate): one unreachable number never stops the rest, and the
   * pacing keeps us under Meta's per-second cap. Logs a final tally.
   */
  private async runBroadcast(
    recipients: Array<{ userId: string; name: string; mobileNumber: string }>,
    templateName: string,
    bodyParams: string[],
    languageCode: string,
  ): Promise<{ sent: number; failed: number }> {
    let sent = 0;
    let failed = 0;
    for (const r of recipients) {
      const params = this.personalizeParams(bodyParams, r);
      const ok = await this.sendTemplateMessage(
        r.mobileNumber,
        templateName,
        params,
        false,
        undefined,
        languageCode,
      );
      if (ok) sent += 1;
      else failed += 1;
    }
    this.logger.log(
      `WhatsApp broadcast "${templateName}" finished: ${sent} sent, ${failed} failed of ${recipients.length}.`,
    );
    return { sent, failed };
  }

  /**
   * Public entry point for a platform broadcast. Validates config + audience,
   * resolves the recipient list, then dispatches the send in the background and
   * returns immediately with the resolved recipient count. Delivery status shows
   * up in the server logs (and, for individual sends, Meta's dashboards).
   */
  async sendBroadcastTemplate(params: {
    adminUserId: string;
    audience: 'ALL' | 'SPACE' | 'USER';
    spaceId?: string;
    userIds?: string[];
    templateName: string;
    bodyParams?: string[];
    languageCode?: string;
  }): Promise<{ audience: string; recipientCount: number; status: 'started' }> {
    if (!this.isConfigured()) {
      throw new BadRequestException('WhatsApp is not configured on the server.');
    }
    if (!params.templateName?.trim()) {
      throw new BadRequestException('A template name is required.');
    }

    const recipients = await this.resolveBroadcastRecipients({
      audience: params.audience,
      spaceId: params.spaceId,
      userIds: params.userIds,
    });
    if (recipients.length === 0) {
      throw new BadRequestException(
        'No reachable recipients for that audience (nobody with a valid mobile number).',
      );
    }

    const templateName = params.templateName.trim();
    const bodyParams = (params.bodyParams ?? []).map((p) => String(p));
    const languageCode = params.languageCode?.trim() || 'en';

    this.logger.log(
      `Admin ${params.adminUserId} starting WhatsApp broadcast "${templateName}" ` +
        `(audience=${params.audience}) to ${recipients.length} recipient(s).`,
    );

    // Fire-and-forget: a platform-wide audience can be thousands of sequential,
    // rate-limited sends — far longer than an HTTP request should wait. The loop
    // is fully fail-soft, so a detached run is safe.
    void this.runBroadcast(recipients, templateName, bodyParams, languageCode).catch(
      (err) =>
        this.logger.error(
          `WhatsApp broadcast "${templateName}" crashed: ${
            err instanceof Error ? err.message : err
          }`,
        ),
    );

    return {
      audience: params.audience,
      recipientCount: recipients.length,
      status: 'started',
    };
  }

  /**
   * Spaces for the broadcast audience picker: id, name, slug and how many
   * members would be reached. Ordered by name.
   */
  async listBroadcastSpaces(): Promise<
    Array<{ id: string; name: string; slug: string; memberCount: number }>
  > {
    const spaces = await this.prisma.space.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        _count: { select: { userRoles: { where: { eventId: null } } } },
      },
      orderBy: { name: 'asc' },
    });
    return spaces.map((s) => ({
      id: s.id,
      name: s.name,
      slug: s.slug,
      memberCount: s._count.userRoles,
    }));
  }

  /**
   * Typeahead for the "specific users" audience: match name, username or mobile.
   * Returns a small page with a masked number for display.
   */
  async searchBroadcastUsers(
    search: string,
    limit = 20,
  ): Promise<
    Array<{ id: string; name: string; username: string | null; mobileMasked: string }>
  > {
    const q = search?.trim();
    if (!q || q.length < 2) return [];
    const users = await this.prisma.user.findMany({
      where: {
        OR: [
          { fullName: { contains: q, mode: 'insensitive' } },
          { username: { contains: q, mode: 'insensitive' } },
          { mobileNumber: { contains: q.replace(/\D/g, '') || q } },
        ],
      },
      select: { id: true, fullName: true, username: true, mobileNumber: true },
      take: Math.min(Math.max(limit, 1), 50),
      orderBy: { fullName: 'asc' },
    });
    return users.map((u) => ({
      id: u.id,
      name: (u.fullName || u.username || 'Unnamed user').trim(),
      username: u.username,
      // Show only the last 4 digits so the picker doesn't leak full numbers.
      mobileMasked: u.mobileNumber.replace(/.(?=.{4})/g, '•'),
    }));
  }

  /**
   * List the WhatsApp message templates on the Business Account, so Apex can
   * offer a picker instead of a free-text template name. Returns only APPROVED
   * templates, each annotated with the number of body ({{n}}) parameters it
   * expects and whether it needs a media header our simple sender can't fill.
   */
  async listMessageTemplates(): Promise<
    Array<{
      name: string;
      language: string;
      status: string;
      category: string;
      bodyText: string | null;
      bodyParamCount: number;
      needsMediaHeader: boolean;
    }>
  > {
    if (!this.wabaId) {
      throw new BadRequestException(
        'WHATSAPP_BUSINESS_ACCOUNT_ID is not configured — cannot list templates.',
      );
    }

    try {
      const url = `${this.graphBase}/${this.wabaId}/message_templates`;
      const response = await axios.get(url, {
        params: { limit: 200, access_token: this.accessToken },
      });

      const data: any[] = Array.isArray(response.data?.data)
        ? response.data.data
        : [];

      return data
        .filter((t) => String(t?.status).toUpperCase() === 'APPROVED')
        .map((t) => {
          const components: any[] = Array.isArray(t?.components)
            ? t.components
            : [];
          const body = components.find(
            (c) => String(c?.type).toUpperCase() === 'BODY',
          );
          const header = components.find(
            (c) => String(c?.type).toUpperCase() === 'HEADER',
          );
          const bodyText: string | null = body?.text ?? null;
          // Count distinct {{1}}, {{2}}… placeholders in the body text.
          const placeholders = new Set(
            (bodyText?.match(/\{\{\s*\d+\s*\}\}/g) ?? []).map((p) =>
              p.replace(/\D/g, ''),
            ),
          );
          const headerFormat = String(header?.format ?? 'TEXT').toUpperCase();
          return {
            name: String(t?.name ?? ''),
            language: String(t?.language ?? 'en'),
            status: String(t?.status ?? ''),
            category: String(t?.category ?? ''),
            bodyText,
            bodyParamCount: placeholders.size,
            needsMediaHeader: ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(
              headerFormat,
            ),
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name));
    } catch (error: any) {
      const msg =
        error?.response?.data?.error?.message ??
        (error instanceof Error ? error.message : 'Failed to list templates');
      this.logger.error(`WhatsApp list templates failed: ${msg}`);
      throw new BadRequestException(`Could not load templates: ${msg}`);
    }
  }

  /**
   * Paginated conversation list for the inbox, newest activity first. `search`
   * matches the number or the stored profile name.
   */
  async listConversations(params: {
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<{
    conversations: Array<
      Prisma.WhatsappConversationGetPayload<{
        include: { messages: { take: 1; orderBy: { createdAt: 'desc' } } };
      }> & { replyWindowOpen: boolean }
    >;
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 30));
    const search = params.search?.trim();

    const where: Prisma.WhatsappConversationWhereInput = search
      ? {
          OR: [
            { waId: { contains: search } },
            { profileName: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {};

    const [rows, total] = await Promise.all([
      this.prisma.whatsappConversation.findMany({
        where,
        orderBy: { lastMessageAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { messages: { take: 1, orderBy: { createdAt: 'desc' } } },
      }),
      this.prisma.whatsappConversation.count({ where }),
    ]);

    return {
      conversations: rows.map((c) => ({
        ...c,
        replyWindowOpen: this.isReplyWindowOpen(c.lastInboundAt),
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    };
  }

  /**
   * Full message thread for one conversation. Opening it marks the conversation
   * read (unreadCount → 0).
   */
  async getConversation(id: string) {
    const conversation = await this.prisma.whatsappConversation.findUnique({
      where: { id },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!conversation) {
      throw new BadRequestException('Conversation not found');
    }

    if (conversation.unreadCount > 0) {
      await this.prisma.whatsappConversation.update({
        where: { id },
        data: { unreadCount: 0 },
      });
    }

    return {
      ...conversation,
      unreadCount: 0,
      replyWindowOpen: this.isReplyWindowOpen(conversation.lastInboundAt),
    };
  }

  /** Inbox headline counters. */
  async getInboxStats(): Promise<{
    conversations: number;
    unread: number;
    openWindows: number;
  }> {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [conversations, unreadAgg, openWindows] = await Promise.all([
      this.prisma.whatsappConversation.count(),
      this.prisma.whatsappConversation.aggregate({ _sum: { unreadCount: true } }),
      this.prisma.whatsappConversation.count({
        where: { lastInboundAt: { gte: since } },
      }),
    ]);
    return {
      conversations,
      unread: unreadAgg._sum.unreadCount ?? 0,
      openWindows,
    };
  }

  // =====================================================
  // TEMPLATE-BASED NOTIFICATIONS
  // =====================================================

  /**
   * 1. Event Registration Confirmation
   * Template: event_registration_confirmation (id: 1543620650451828)
   * Header: IMAGE
   * Body: {{1}}=userName, {{2}}=eventTitle, {{3}}=eventDate, {{4}}=eventTime, {{5}}=venue
   */
  async sendRegistrationConfirmation(
    mobileNumber: string,
    data: {
      userName: string;
      eventTitle: string;
      eventDate: string;
      eventTime: string;
      venueName?: string;
      city?: string;
      isOnline: boolean;
      onlineUrl?: string;
    },
  ): Promise<void> {
    try {
      if (!mobileNumber) return;

      const venue = this.formatVenue({
        type: data.isOnline ? 'ONLINE' : 'IN_PERSON',
        venueName: data.venueName,
        city: data.city,
        onlineUrl: data.onlineUrl,
      });

      await this.sendTemplateMessage(
        mobileNumber,
        TEMPLATES.EVENT_REGISTRATION,
        [
          data.userName,
          data.eventTitle,
          data.eventDate,
          data.eventTime,
          venue,
        ],
        true, // has image header
        HEADER_IMAGES.EVENT_REGISTRATION,
      );
    } catch (error) {
      this.logger.error('Failed to send registration confirmation', error);
    }
  }

  /**
   * WhatsApp group / community invite.
   * Template: event_whatsapp_group (PENDING approval)
   * Header: none
   * Body: {{1}}=userName, {{2}}=eventTitle, {{3}}=joinLabel, {{4}}=inviteUrl
   *
   * Sent right after a successful registration when the event (or its parent)
   * has an organiser-supplied invite link. Fail-soft: a missing template or a
   * bad number logs and returns — it must never disturb the registration flow.
   */
  async sendEventWhatsAppGroupInvite(
    mobileNumber: string,
    data: {
      userName: string;
      eventTitle: string;
      inviteUrl: string;
      isCommunity: boolean;
    },
  ): Promise<void> {
    try {
      if (!mobileNumber || !data.inviteUrl) return;

      await this.sendTemplateMessage(
        mobileNumber,
        TEMPLATES.EVENT_WHATSAPP_GROUP,
        [
          data.userName,
          data.eventTitle,
          data.isCommunity ? 'community' : 'group',
          data.inviteUrl,
        ],
        false, // no image header
      );
    } catch (error) {
      this.logger.error('Failed to send WhatsApp group invite', error);
    }
  }

  // =====================================================
  // UNIFESTO STATS BROADCAST
  // =====================================================

  /**
   * Send one "Unifesto Stats" update to a single recipient.
   * Template: unifesto_stats_update (approved, fail-soft).
   */
  async sendStatsUpdate(
    to: string,
    data: {
      label: string; // "Daily Snapshot" | "Weekly Digest" | milestone label
      periodText: string; // e.g. "24 Aug 2026" or "18–24 Aug 2026"
      newUsers: number;
      newSpaces: number;
      newEvents: number;
      registrations: number;
      revenue: number; // rupees
    },
  ): Promise<void> {
    await this.sendTemplateMessage(
      to,
      TEMPLATES.UNIFESTO_STATS,
      [
        data.label,
        data.periodText,
        data.newUsers.toLocaleString('en-IN'),
        data.newSpaces.toLocaleString('en-IN'),
        data.newEvents.toLocaleString('en-IN'),
        data.registrations.toLocaleString('en-IN'),
        `₹${Math.round(data.revenue).toLocaleString('en-IN')}`,
      ],
      false, // no image header
    );
  }

  /**
   * Fan the same stats update out to every number in the stats recipient list
   * (managed from Apex → Stats recipients; read fresh on every broadcast).
   * This is the "post to the Unifesto Stats group" entry point — modelled as a
   * 1:1 broadcast because the Cloud API cannot address a WhatsApp group.
   * Returns the number of recipients attempted (0 if the list is unconfigured).
   */
  async broadcastStatsUpdate(
    data: Parameters<WhatsAppService['sendStatsUpdate']>[1],
  ): Promise<number> {
    const recipients = await this.platformConfig.getStatsRecipients();
    if (recipients.length === 0) {
      this.logger.warn('Unifesto Stats broadcast skipped — no stats recipients configured');
      return 0;
    }

    // Sequential so a burst of sends never trips Meta's per-second rate limit;
    // each send is already fail-soft, so one bad number won't stop the rest.
    for (const recipient of recipients) {
      await this.sendStatsUpdate(recipient, data);
    }

    this.logger.log(`Unifesto Stats "${data.label}" broadcast to ${recipients.length} recipient(s)`);
    return recipients.length;
  }

  /**
   * 2. Event Reminder (24 hours before)
   * Template: event_reminder_24h (id: 1597512415277975)
   * Header: none
   * Body: {{1}}=userName, {{2}}=eventTitle, {{3}}=eventDate, {{4}}=eventTime, {{5}}=venue
   */
  async sendEventReminder(
    mobileNumber: string,
    data: {
      userName: string;
      eventTitle: string;
      eventDate: string;
      eventTime: string;
      venueName?: string;
      city?: string;
      isOnline: boolean;
      onlineUrl?: string;
    },
  ): Promise<void> {
    try {
      if (!mobileNumber) return;

      const venue = this.formatVenue({
        type: data.isOnline ? 'ONLINE' : 'IN_PERSON',
        venueName: data.venueName,
        city: data.city,
        onlineUrl: data.onlineUrl,
      });

      await this.sendTemplateMessage(
        mobileNumber,
        TEMPLATES.EVENT_REMINDER,
        [
          data.userName,
          data.eventTitle,
          data.eventDate,
          data.eventTime,
          venue,
        ],
        false, // no image header
      );
    } catch (error) {
      this.logger.error('Failed to send event reminder', error);
    }
  }

  /**
   * 3. Registration Cancelled
   * Template: registration_cancelled (id: 1972305506770198)
   * Header: TEXT
   * Body: {{1}}=userName, {{2}}=eventTitle, {{3}}=refundInfo
   */
  async sendRegistrationCancelled(
    mobileNumber: string,
    data: {
      userName: string;
      eventTitle: string;
      coinsRefunded?: number;
      razorpayRefundInitiated?: boolean;
    },
  ): Promise<void> {
    try {
      if (!mobileNumber) return;

      let refundInfo = 'No refunds applicable.';
      const refundParts: string[] = [];

      if (data.coinsRefunded && data.coinsRefunded > 0) {
        refundParts.push(`${data.coinsRefunded} coins refunded to wallet`);
      }
      if (data.razorpayRefundInitiated) {
        refundParts.push('Payment refund initiated (5-7 business days)');
      }

      if (refundParts.length > 0) {
        refundInfo = refundParts.join('. ');
      }

      await this.sendTemplateMessage(
        mobileNumber,
        TEMPLATES.REGISTRATION_CANCELLED,
        [
          data.userName,
          data.eventTitle,
          refundInfo,
        ],
        false, // TEXT header (handled by template)
      );
    } catch (error) {
      this.logger.error('Failed to send cancellation notification', error);
    }
  }

  /**
   * 4. Space Approved
   * Template: space_approved (id: 1603977184033350)
   * Header: IMAGE
   * Body: {{1}}=organizerName, {{2}}=spaceName
   */
  async sendSpaceApproved(
    mobileNumber: string,
    data: {
      organizerName: string;
      spaceName: string;
    },
  ): Promise<void> {
    try {
      if (!mobileNumber) return;

      await this.sendTemplateMessage(
        mobileNumber,
        TEMPLATES.SPACE_APPROVED,
        [
          data.organizerName,
          data.spaceName,
        ],
        true, // has image header
        HEADER_IMAGES.SPACE_APPROVED,
      );
    } catch (error) {
      this.logger.error('Failed to send space approved notification', error);
    }
  }

  /**
   * 5. Space Rejected
   * Template: space_rejected (id: 973091392100936)
   * Header: TEXT
   * Body: {{1}}=organizerName, {{2}}=spaceName, {{3}}=rejectionReason
   */
  async sendSpaceRejected(
    mobileNumber: string,
    data: {
      organizerName: string;
      spaceName: string;
      rejectionReason: string;
    },
  ): Promise<void> {
    try {
      if (!mobileNumber) return;

      await this.sendTemplateMessage(
        mobileNumber,
        TEMPLATES.SPACE_REJECTED,
        [
          data.organizerName,
          data.spaceName,
          data.rejectionReason || 'Not specified',
        ],
        false, // TEXT header (handled by template)
      );
    } catch (error) {
      this.logger.error('Failed to send space rejected notification', error);
    }
  }

  /**
   * 6. Check-in Confirmed
   * Template: checkin_confirmed (id: 1687119155773855)
   * Header: IMAGE
   * Body: {{1}}=userName, {{2}}=eventTitle, {{3}}=coinsAwarded
   */
  async sendCheckinConfirmed(
    mobileNumber: string,
    data: {
      userName: string;
      eventTitle: string;
      coinsAwarded: number;
    },
  ): Promise<void> {
    try {
      if (!mobileNumber) return;

      await this.sendTemplateMessage(
        mobileNumber,
        TEMPLATES.CHECKIN_CONFIRMED,
        [
          data.userName,
          data.eventTitle,
          data.coinsAwarded.toString(),
        ],
        true, // has image header
        HEADER_IMAGES.CHECKIN_CONFIRMED,
      );
    } catch (error) {
      this.logger.error('Failed to send check-in confirmation', error);
    }
  }

  /**
   * 7. Payment Confirmed
   * Template: payment_confirmed (id: 4462855363943057)
   * Header: TEXT
   * Body: {{1}}=userName, {{2}}=eventTitle, {{3}}=amount, {{4}}=coinsInfo
   */
  async sendPaymentConfirmed(
    mobileNumber: string,
    data: {
      userName: string;
      eventTitle: string;
      amount: number;
      coinsUsed?: number;
    },
  ): Promise<void> {
    try {
      if (!mobileNumber) return;

      const coinsInfo = data.coinsUsed && data.coinsUsed > 0
        ? `${data.coinsUsed} coins used`
        : 'No coins used';

      await this.sendTemplateMessage(
        mobileNumber,
        TEMPLATES.PAYMENT_CONFIRMED,
        [
          data.userName,
          data.eventTitle,
          `₹${data.amount.toFixed(2)}`,
          coinsInfo,
        ],
        false, // TEXT header (handled by template)
      );
    } catch (error) {
      this.logger.error('Failed to send payment confirmation', error);
    }
  }

  /**
   * 8. New Space Submitted (to admin)
   * Template: new_space_submitted (id: 1011838481193096) - PENDING APPROVAL
   * Header: TEXT
   * Body: {{1}}=spaceName, {{2}}=organizerName
   */
  async sendNewSpaceSubmitted(
    adminMobileNumber: string,
    data: {
      spaceName: string;
      organizerName: string;
    },
  ): Promise<void> {
    try {
      if (!adminMobileNumber) return;

      await this.sendTemplateMessage(
        adminMobileNumber,
        TEMPLATES.NEW_SPACE_SUBMITTED,
        [
          data.spaceName,
          data.organizerName,
        ],
        false, // TEXT header (handled by template)
      );
    } catch (error) {
      this.logger.error('Failed to send new space notification', error);
    }
  }

  // =====================================================
  // LEGACY METHOD ALIASES (for backward compatibility)
  // =====================================================

  /**
   * Alias for sendRegistrationCancelled
   * @deprecated Use sendRegistrationCancelled instead
   */
  async sendCancellationNotification(
    mobileNumber: string,
    data: {
      userName: string;
      eventTitle: string;
      coinsRefunded?: number;
      razorpayRefundInitiated?: boolean;
    },
  ): Promise<void> {
    return this.sendRegistrationCancelled(mobileNumber, data);
  }

  /**
   * Alias for sendSpaceApproved
   * @deprecated Use sendSpaceApproved instead
   */
  async sendSpaceApprovedNotification(
    mobileNumber: string,
    data: {
      userName: string;
      spaceName: string;
      spaceSlug: string;
    },
  ): Promise<void> {
    return this.sendSpaceApproved(mobileNumber, {
      organizerName: data.userName,
      spaceName: data.spaceName,
    });
  }

  /**
   * Alias for sendSpaceRejected
   * @deprecated Use sendSpaceRejected instead
   */
  async sendSpaceRejectedNotification(
    mobileNumber: string,
    data: {
      userName: string;
      spaceName: string;
      rejectionReason?: string;
    },
  ): Promise<void> {
    return this.sendSpaceRejected(mobileNumber, {
      organizerName: data.userName,
      spaceName: data.spaceName,
      rejectionReason: data.rejectionReason || 'Not specified',
    });
  }

  /**
   * Alias for sendCheckinConfirmed
   * @deprecated Use sendCheckinConfirmed instead
   */
  async sendCheckinConfirmation(
    mobileNumber: string,
    data: {
      userName: string;
      eventTitle: string;
      coinsAwarded: number;
    },
  ): Promise<void> {
    return this.sendCheckinConfirmed(mobileNumber, data);
  }

  /**
   * Alias for sendPaymentConfirmed
   * @deprecated Use sendPaymentConfirmed instead
   */
  async sendPaymentConfirmation(
    mobileNumber: string,
    data: {
      userName: string;
      eventTitle: string;
      amount: number;
      coinsUsed?: number;
      ticketCode: string;
    },
  ): Promise<void> {
    return this.sendPaymentConfirmed(mobileNumber, {
      userName: data.userName,
      eventTitle: data.eventTitle,
      amount: data.amount,
      coinsUsed: data.coinsUsed,
    });
  }

  /**
   * Alias for sendNewSpaceSubmitted
   * @deprecated Use sendNewSpaceSubmitted instead
   */
  async sendNewSpaceSubmittedNotification(
    adminMobileNumber: string,
    data: {
      spaceName: string;
      organiserName: string;
      spaceSlug: string;
    },
  ): Promise<void> {
    return this.sendNewSpaceSubmitted(adminMobileNumber, {
      spaceName: data.spaceName,
      organizerName: data.organiserName,
    });
  }

  /**
   * Coins received notification
   * Note: No approved template yet - logs only
   */
  async sendCoinsReceivedNotification(
    mobileNumber: string,
    data: {
      userName: string;
      coinsReceived: number;
      newBalance: number;
      reason: string;
    },
  ): Promise<void> {
    try {
      this.logger.log(`Coins notification for ${mobileNumber}: +${data.coinsReceived} coins (${data.reason})`);
      // Template not yet approved - implement when available
    } catch (error) {
      this.logger.error('Failed to send coins notification', error);
    }
  }
}

