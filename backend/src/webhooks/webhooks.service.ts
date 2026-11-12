import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OnEvent } from '../common/on-event';
import { openSecret, sealSecret } from '../common/secrets';
import { isSpaceLive } from '../spaces/space-access';
import { contactMobile } from '../registrations/group-invite.util';
import {
  assertWebhookUrl,
  newWebhookSecret,
  sendWebhook,
  webhookHeaders,
  WEBHOOK_TYPES,
  type WebhookType,
} from './webhook-delivery.util';
import { WEBHOOK_EVENT, type WebhookEventPayload } from './webhook-events';
import { WebhookDeliveryQueue } from './webhook-delivery.queue';

/** Webhooks a space may have. */
export const MAX_WEBHOOKS = 3;
/** Deliveries that failed for good (all retries) in a row that switch a webhook off. */
export const DISABLE_AFTER = 20;

const SECRET_ENV = 'WEBHOOK_SECRET_KEY';
const SECRET_PURPOSE = 'webhook-secret';
const seal = (s: string) => sealSecret(s, SECRET_ENV, SECRET_PURPOSE);
const open = (s: string) => openSecret(s, SECRET_ENV, SECRET_PURPOSE);

const HOOK_FIELDS = {
  id: true,
  url: true,
  events: true,
  isActive: true,
  failureCount: true,
  disabledAt: true,
  createdAt: true,
} satisfies Prisma.SpaceWebhookSelect;

/**
 * K23: signed POSTs to a space's own server when someone registers, cancels
 * or checks in. The state change emits WEBHOOK_EVENT after its write commits;
 * this writes one delivery per matching webhook and queues it.
 */
@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: WebhookDeliveryQueue,
  ) {
    this.queue.setHandler((id, finalAttempt) => this.deliver(id, finalAttempt));
  }

  // ---- Console (Space Admins, space:manage-integrations) ----

  private async assertEnabled(spaceId: string) {
    const space = await this.prisma.space.findUnique({ where: { id: spaceId }, select: { integrationsEnabled: true } });
    if (!space) throw new NotFoundException('Space not found');
    if (!space.integrationsEnabled) {
      throw new ForbiddenException('API access is off for this space. Write to Unifesto support to turn it on.');
    }
  }

  private async own(spaceId: string, id: string) {
    const hook = await this.prisma.spaceWebhook.findFirst({ where: { id, spaceId }, select: { id: true } });
    if (!hook) throw new NotFoundException('Webhook not found');
  }

  private events(raw: string[]): WebhookType[] {
    const events = [...new Set(raw)].filter((e): e is WebhookType => (WEBHOOK_TYPES as readonly string[]).includes(e));
    if (!events.length) throw new BadRequestException(`Pick at least one of: ${WEBHOOK_TYPES.join(', ')}`);
    return events;
  }

  async list(spaceId: string) {
    const [space, webhooks] = await Promise.all([
      this.prisma.space.findUnique({ where: { id: spaceId }, select: { integrationsEnabled: true } }),
      this.prisma.spaceWebhook.findMany({ where: { spaceId }, orderBy: { createdAt: 'asc' }, select: HOOK_FIELDS }),
    ]);
    if (!space) throw new NotFoundException('Space not found');
    return { enabled: space.integrationsEnabled, webhooks };
  }

  /** The signing secret is in this response only. */
  async create(spaceId: string, userId: string, dto: { url: string; events: string[] }) {
    await this.assertEnabled(spaceId);
    if ((await this.prisma.spaceWebhook.count({ where: { spaceId } })) >= MAX_WEBHOOKS) {
      throw new BadRequestException(`A space can have ${MAX_WEBHOOKS} webhooks. Delete one first.`);
    }
    const url = assertWebhookUrl(dto.url).toString();
    const secret = newWebhookSecret();
    const row = await this.prisma.spaceWebhook.create({
      data: { spaceId, url, events: this.events(dto.events), secretEnc: seal(secret), createdBy: userId },
      select: HOOK_FIELDS,
    });
    return { ...row, secret };
  }

  async update(spaceId: string, id: string, dto: { url?: string; events?: string[]; isActive?: boolean }) {
    await this.own(spaceId, id);
    if (dto.isActive) await this.assertEnabled(spaceId);
    return this.prisma.spaceWebhook.update({
      where: { id },
      data: {
        ...(dto.url != null && { url: assertWebhookUrl(dto.url).toString() }),
        ...(dto.events != null && { events: this.events(dto.events) }),
        // Turning it back on starts a fresh count.
        ...(dto.isActive != null && { isActive: dto.isActive, ...(dto.isActive && { disabledAt: null, failureCount: 0 }) }),
      },
      select: HOOK_FIELDS,
    });
  }

  async remove(spaceId: string, id: string) {
    await this.own(spaceId, id);
    await this.prisma.spaceWebhook.delete({ where: { id } });
    return { deleted: true };
  }

  async deliveries(spaceId: string, id: string) {
    await this.own(spaceId, id);
    return this.prisma.webhookDelivery.findMany({
      where: { webhookId: id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, type: true, registrationId: true, status: true, attempts: true, lastStatusCode: true, lastError: true, durationMs: true, createdAt: true, deliveredAt: true },
    });
  }

  /** A "webhook.test" delivery, sent once now; the answer says how it went. */
  async sendTest(spaceId: string, id: string) {
    await this.own(spaceId, id);
    await this.assertEnabled(spaceId);
    const delivery = await this.prisma.webhookDelivery.create({
      data: { webhookId: id, type: 'webhook.test', payload: { type: 'webhook.test', createdAt: new Date().toISOString(), data: { test: true } } },
      select: { id: true },
    });
    await this.deliver(delivery.id, true, { ignoreActive: true });
    return this.prisma.webhookDelivery.findUnique({
      where: { id: delivery.id },
      select: { id: true, status: true, lastStatusCode: true, lastError: true, durationMs: true },
    });
  }

  async resend(spaceId: string, id: string, deliveryId: string) {
    await this.own(spaceId, id);
    await this.assertEnabled(spaceId);
    // PENDING too once it's older than its retries could run (a stuck row).
    const { count } = await this.prisma.webhookDelivery.updateMany({
      where: {
        id: deliveryId,
        webhookId: id,
        OR: [{ status: { not: 'PENDING' } }, { createdAt: { lt: new Date(Date.now() - 3 * 3_600_000) } }],
      },
      data: { status: 'PENDING' },
    });
    if (!count) throw new NotFoundException('Delivery not found, or already queued');
    await this.queue.add(deliveryId, true);
    return { queued: true };
  }

  // ---- Events ----

  @OnEvent(WEBHOOK_EVENT, { async: true })
  async onRegistrationEvent({ type, registrationId }: WebhookEventPayload) {
    const reg = await this.prisma.eventRegistration.findUnique({
      where: { id: registrationId },
      select: {
        id: true,
        ticketTypeId: true,
        status: true,
        paymentStatus: true,
        totalAmount: true,
        attendeeMobile: true,
        utmSource: true,
        checkedInAt: true,
        event: { select: { id: true, slug: true, title: true, spaceId: true, space: { select: { integrationsEnabled: true } } } },
        user: {
          select: {
            fullName: true,
            mobileNumber: true,
            identities: { where: { email: { not: null } }, orderBy: { isPrimary: 'desc' }, take: 1, select: { email: true } },
          },
        },
      },
    });
    if (!reg || !reg.event.space.integrationsEnabled) return;
    // Switched off after failures: still recorded (as SKIPPED), so nothing is
    // lost and the admin can resend once the receiver is fixed.
    const hooks = await this.prisma.spaceWebhook.findMany({
      where: { spaceId: reg.event.spaceId, isActive: true, events: { has: type } },
      select: { id: true, disabledAt: true },
    });
    if (!hooks.length) return;

    // No form answers: the site reads those through the API (K22) if it needs them.
    const payload = {
      type,
      createdAt: new Date().toISOString(),
      data: {
        registrationId: reg.id,
        eventId: reg.event.id,
        eventSlug: reg.event.slug,
        eventTitle: reg.event.title,
        ticketTypeId: reg.ticketTypeId,
        status: reg.status,
        paymentStatus: reg.paymentStatus,
        amount: Number(reg.totalAmount),
        source: reg.utmSource,
        checkedInAt: reg.checkedInAt,
        attendee: {
          name: reg.user.fullName,
          email: reg.user.identities[0]?.email ?? null,
          phone: contactMobile(reg.user.mobileNumber, reg.attendeeMobile),
        },
      },
    };
    for (const hook of hooks) {
      const d = await this.prisma.webhookDelivery.create({
        data: { webhookId: hook.id, type, registrationId: reg.id, payload, ...(hook.disabledAt && { status: 'SKIPPED' }) },
        select: { id: true },
      });
      if (!hook.disabledAt) await this.queue.add(d.id);
    }
  }

  /**
   * One attempt. Throws on failure so BullMQ retries, until the last attempt,
   * which marks it FAILED. A space taken down or switched off, or a webhook
   * turned off since, marks it SKIPPED.
   */
  async deliver(deliveryId: string, finalAttempt: boolean, opts: { ignoreActive?: boolean } = {}): Promise<void> {
    const d = await this.prisma.webhookDelivery.findUnique({
      where: { id: deliveryId },
      include: { webhook: { include: { space: { select: { status: true, integrationsEnabled: true } } } } },
    });
    if (!d || d.status === 'DELIVERED') return;
    const hook = d.webhook;
    // Turned off by the admin. A webhook switched off after failures still
    // finishes the retries it had already queued.
    const off = !opts.ignoreActive && !hook.isActive;
    if (off || !hook.space.integrationsEnabled || !isSpaceLive(hook.space.status)) {
      await this.prisma.webhookDelivery.update({ where: { id: d.id }, data: { status: 'SKIPPED' } });
      return;
    }

    let url: URL | null = null;
    try {
      url = assertWebhookUrl(hook.url);
    } catch {
      // Saved before a rule tightened: never send, never retry.
    }
    let secret: string | null = null;
    try {
      secret = open(hook.secretEnc);
    } catch {
      // WEBHOOK_SECRET_KEY (or the JWT_SECRET it falls back on) changed: retries can't help.
    }
    const body = JSON.stringify({ id: d.id, ...(d.payload as object) });
    const result =
      url && secret
        ? await sendWebhook(url, webhookHeaders(secret, d.id, Math.floor(Date.now() / 1000), body), body)
        : { ok: false, status: null, error: url ? 'Secret unreadable' : 'URL refused', durationMs: 0 };

    const final = result.ok || finalAttempt || !url || !secret;
    await this.prisma.webhookDelivery.update({
      where: { id: d.id },
      data: {
        attempts: { increment: 1 },
        lastStatusCode: result.status,
        lastError: result.error,
        durationMs: result.durationMs,
        status: result.ok ? 'DELIVERED' : final ? 'FAILED' : 'PENDING',
        ...(result.ok && { deliveredAt: new Date() }),
      },
    });

    if (result.ok) {
      await this.prisma.spaceWebhook.updateMany({ where: { id: hook.id, failureCount: { gt: 0 } }, data: { failureCount: 0 } });
      return;
    }
    // Counts deliveries that failed for good, not attempts: a short outage
    // that retries ride out never switches a webhook off.
    if (!final) throw new Error(`Webhook delivery ${d.id} failed: ${result.error}`);
    const failed = await this.prisma.spaceWebhook.update({
      where: { id: hook.id },
      data: { failureCount: { increment: 1 } },
      select: { failureCount: true, disabledAt: true },
    });
    if (failed.failureCount >= DISABLE_AFTER && !failed.disabledAt) {
      await this.prisma.spaceWebhook.update({ where: { id: hook.id }, data: { disabledAt: new Date() } });
      this.logger.warn(`Webhook ${hook.id} switched off after ${DISABLE_AFTER} failed deliveries in a row`);
    }
  }
}
