import { Injectable, Logger } from '@nestjs/common';
import { EmailService } from '../email/email.service';
import { emailOptedOutUserIds } from '../email/email-preferences';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { NotificationsService } from './notifications.service';
import { KindDef, NOTIFY_KINDS, NotifyKind, NotifyKindData } from './notify.kinds';
import { ChannelPlan, channelsFor } from './notify.policy';

export type ChannelOutcome = 'sent' | 'failed' | 'skipped';

export interface NotifyResult {
  kind: NotifyKind;
  userId: string;
  push: ChannelOutcome;
  email: ChannelOutcome;
  whatsapp: ChannelOutcome;
  plan?: ChannelPlan;
}

export interface NotifyOptions {
  /**
   * Base dedup key, replacing the kind's default `${kind}:${entity}:${userId}`.
   * The channel is appended. Use it for kinds with no default (event.updated).
   */
  dedupKey?: string;
}

/**
 * One call to tell a user something (C2): picks the channels from the kind's
 * criticality and the user's prefs (notify.policy.ts), renders each through
 * the existing push / EmailService / WhatsAppService code, and dedups every
 * channel so a retry or a race (webhook + verify) never double-sends.
 *
 * Never throws; returns what happened per channel.
 */
@Injectable()
export class NotifyService {
  private readonly logger = new Logger(NotifyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly email: EmailService,
    private readonly whatsapp: WhatsAppService,
  ) {}

  async notify<K extends NotifyKind>(
    userId: string,
    kind: K,
    data: NotifyKindData[K],
    opts: NotifyOptions = {},
  ): Promise<NotifyResult> {
    const result: NotifyResult = { kind, userId, push: 'skipped', email: 'skipped', whatsapp: 'skipped' };
    try {
      const def = NOTIFY_KINDS[kind] as KindDef<NotifyKindData[K]>;
      const entity = def.entity(data);
      const base = opts.dedupKey ?? (entity ? `${kind}:${entity}:${userId}` : null);
      const key = (channel: string) => (base ? `${base}:${channel}` : undefined);

      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { mobileNumber: true, identities: { select: { email: true, isPrimary: true } } },
      });
      if (!user) return result;
      // Primary email, else any on file (as campaigns and certificates do).
      const to =
        user.identities.find((i) => i.isPrimary && i.email)?.email ??
        user.identities.find((i) => i.email)?.email ??
        null;

      const [allowedCount, devices, optedOut] = await Promise.all([
        this.notifications.countAllowed([userId], def.category),
        this.prisma.userPushDevice.count({ where: { userId, optedIn: true, linkedAt: { not: null } } }),
        emailOptedOutUserIds(this.prisma, [userId], def.category),
      ]);
      const plan = channelsFor(def, {
        pushAllowed: allowedCount > 0,
        hasPushDevice: devices > 0,
        emailOptedOut: optedOut.has(userId),
        hasEmail: !!to,
        hasPhone: !!user.mobileNumber,
      });
      result.plan = plan;

      // Push always runs: send() applies the push prefs and writes the inbox copy.
      const push = await this.notifications.send([userId], {
        category: def.category,
        ...def.push(data),
        kind,
        dedupKey: key('push'),
        urgent: def.criticality === 'critical',
      });
      result.push = push.sent ? 'sent' : push.failed ? 'failed' : 'skipped';

      const delivery = (channel: string) => ({ kind, userId, dedupKey: key(channel) });

      if (to && def.email && (plan.email === 'always' || (plan.email === 'if-push-fails' && result.push !== 'sent'))) {
        result.email = (await this.channel(() => def.email!(this.email, to, data, delivery('email')))) ? 'sent' : 'failed';
      }
      if (plan.whatsapp && def.whatsapp && user.mobileNumber) {
        const phone = user.mobileNumber;
        result.whatsapp = (await this.channel(() => def.whatsapp!(this.whatsapp, phone, data, delivery('whatsapp'))))
          ? 'sent'
          : 'failed';
      }
    } catch (err) {
      this.logger.error(`notify(${kind}, ${userId}) failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    return result;
  }

  /** One channel send; a throw is a failure, never an escape. */
  private async channel(send: () => Promise<boolean>): Promise<boolean> {
    try {
      return await send();
    } catch (err) {
      this.logger.warn(`notify channel send threw: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }
}
