import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { MessageChannel } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AUTOMATIONS, Automation, AutomationChannel } from './automations';

/** message_deliveries rows by status, per channel that logs them. */
export type AutomationCounts = Partial<Record<AutomationChannel, Record<string, number>>>;

const CHANNEL: Record<MessageChannel, AutomationChannel> = {
  [MessageChannel.PUSH]: 'push',
  [MessageChannel.EMAIL]: 'email',
  [MessageChannel.WHATSAPP]: 'whatsapp',
};

@Injectable()
export class AutomationsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Apex: every automatic message, with what it sent on each channel over the last `days`. */
  async list(days: number): Promise<{ days: number; automations: Array<Automation & { counts: AutomationCounts }> }> {
    const span = Math.min(Math.max(days, 1), 90);
    const owner = new Map(AUTOMATIONS.flatMap((a) => a.kinds.map((k) => [k, a.key] as const)));
    const rows = await this.prisma.messageDelivery.groupBy({
      by: ['kind', 'channel', 'status'],
      where: { kind: { in: [...owner.keys()] }, createdAt: { gte: new Date(Date.now() - span * 86_400_000) } },
      _count: { _all: true },
    });
    const counts = new Map<string, AutomationCounts>();
    for (const r of rows) {
      const key = r.kind ? owner.get(r.kind) : undefined;
      if (!key) continue;
      const c = counts.get(key) ?? {};
      const byStatus = (c[CHANNEL[r.channel]] ??= {});
      byStatus[r.status] = (byStatus[r.status] ?? 0) + r._count._all;
      counts.set(key, c);
    }
    return { days: span, automations: AUTOMATIONS.map((a) => ({ ...a, counts: counts.get(a.key) ?? {} })) };
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
