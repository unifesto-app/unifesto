import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { MessageChannel } from '@prisma/client';
import { COUNTS_AS_ATTENDING } from '../common/attendance';
import { nid } from '../notifications/nid';
import { PrismaService } from '../prisma/prisma.service';
import { AUTOMATIONS, Automation, AutomationChannel } from './automations';

/** message_deliveries rows by status, per channel that logs them. */
export type AutomationCounts = Partial<Record<AutomationChannel, Record<string, number>>>;

/** C19: confirmed tickets booked within 24 h of a tap on its push or in-app copy. */
export type AutomationTickets = Partial<Record<'push' | 'inapp', number>>;

const CHANNEL: Record<MessageChannel, AutomationChannel> = {
  [MessageChannel.PUSH]: 'push',
  [MessageChannel.EMAIL]: 'email',
  [MessageChannel.WHATSAPP]: 'whatsapp',
};

@Injectable()
export class AutomationsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Apex: every automatic message, with what it sent on each channel over the
   * last `days`, and the tickets booked from a tap on its push or in-app copy (C19).
   */
  async list(days: number): Promise<{
    days: number;
    automations: Array<Automation & { counts: AutomationCounts; tickets: AutomationTickets }>;
  }> {
    const span = Math.min(Math.max(days, 1), 90);
    const since = new Date(Date.now() - span * 86_400_000);
    const owner = new Map(AUTOMATIONS.flatMap((a) => a.kinds.map((k) => [k, a.key] as const)));
    const byNid = new Map<string, { key: string; channel: keyof AutomationTickets }>(
      [...owner].flatMap(([kind, key]) => [
        [nid('p', kind), { key, channel: 'push' }],
        [nid('i', kind), { key, channel: 'inapp' }],
      ]),
    );
    const [rows, booked] = await Promise.all([
      this.prisma.messageDelivery.groupBy({
        by: ['kind', 'channel', 'status'],
        where: { kind: { in: [...owner.keys()] }, createdAt: { gte: since } },
        _count: { _all: true },
      }),
      this.prisma.eventRegistration.groupBy({
        by: ['sourceNid'],
        where: { sourceNid: { in: [...byNid.keys()] }, registeredAt: { gte: since }, ...COUNTS_AS_ATTENDING },
        _count: { _all: true },
      }),
    ]);
    const tickets = new Map<string, AutomationTickets>();
    for (const b of booked) {
      const o = b.sourceNid ? byNid.get(b.sourceNid) : undefined;
      if (!o) continue;
      const t = tickets.get(o.key) ?? {};
      t[o.channel] = (t[o.channel] ?? 0) + b._count._all;
      tickets.set(o.key, t);
    }
    const counts = new Map<string, AutomationCounts>();
    for (const r of rows) {
      const key = r.kind ? owner.get(r.kind) : undefined;
      if (!key) continue;
      const c = counts.get(key) ?? {};
      const byStatus = (c[CHANNEL[r.channel]] ??= {});
      byStatus[r.status] = (byStatus[r.status] ?? 0) + r._count._all;
      counts.set(key, c);
    }
    return {
      days: span,
      automations: AUTOMATIONS.map((a) => ({ ...a, counts: counts.get(a.key) ?? {}, tickets: tickets.get(a.key) ?? {} })),
    };
  }

  /** The automatic messages an event's managers can switch off, and whether each is on. */
  async forEvent(eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { automationsOff: true, feedbackEnabled: true },
    });
    if (!event) throw new NotFoundException('Event not found');
    return AUTOMATIONS.filter((a) => a.switchable).map((a) => ({
      key: a.key,
      name: a.name,
      when: a.when,
      channels: a.channels,
      on: a.switchable === 'feedback' ? event.feedbackEnabled : !event.automationsOff.includes(a.key),
    }));
  }

  /** Switch one on or off for this event. Feedback is the event's own feedback switch. */
  async setForEvent(eventId: string, key: string, on: boolean) {
    const a = AUTOMATIONS.find((x) => x.key === key && x.switchable);
    if (!a) throw new BadRequestException("That automatic message can't be switched off.");
    if (a.switchable === 'feedback') {
      await this.prisma.event.update({ where: { id: eventId }, data: { feedbackEnabled: on } });
    } else {
      const event = await this.prisma.event.findUnique({ where: { id: eventId }, select: { automationsOff: true } });
      if (!event) throw new NotFoundException('Event not found');
      const off = new Set(event.automationsOff);
      if (on) off.delete(key);
      else off.add(key);
      await this.prisma.event.update({ where: { id: eventId }, data: { automationsOff: [...off] } });
    }
    return this.forEvent(eventId);
  }
}
