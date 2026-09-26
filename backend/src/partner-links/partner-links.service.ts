import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { COUNTS_AS_ATTENDING } from '../common/attendance';
import { CreatePartnerLinkDto } from './dto';

/** utm_medium every partner tracking link carries. */
export const PARTNER_MEDIUM = 'partner';

/** "Oqens Club" → "oqens-club": the partner's utm_source. */
export function partnerSource(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

const WEB_URL = () => (process.env.WEB_URL || 'https://www.unifesto.app').replace(/\/$/, '');

export function partnerTrackingUrl(eventSlug: string, source: string): string {
  const q = new URLSearchParams({
    utm_source: source,
    utm_medium: PARTNER_MEDIUM,
    utm_campaign: eventSlug,
  });
  return `${WEB_URL()}/event/${eventSlug}?${q.toString()}`;
}

/** Day key in IST (the platform's reporting timezone), e.g. "2026-09-25". */
const istDay = (d: Date) =>
  new Date(d.getTime() + 330 * 60_000).toISOString().slice(0, 10);

/**
 * Partner tracking links. A curator names a partner and the partner contact's
 * Unifesto account; the partner gets a tracking link (utm_medium=partner) and
 * sees, in the app, how many confirmed registrations it brought in. Partners
 * only ever get counts — no attendee identities, no revenue.
 */
@Injectable()
export class PartnerLinksService {
  constructor(private readonly prisma: PrismaService) {}

  /** Confirmed registrations per partner source for one event. */
  private async countsBySource(eventId: string): Promise<Map<string, number>> {
    const groups = await this.prisma.eventRegistration.groupBy({
      by: ['utmSource'],
      where: { eventId, utmMedium: PARTNER_MEDIUM, ...COUNTS_AS_ATTENDING },
      _count: { _all: true },
    });
    return new Map(groups.map((g) => [g.utmSource ?? '', g._count._all]));
  }

  // ---- Curator ----

  async create(eventId: string, createdById: string, dto: CreatePartnerLinkDto) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true },
    });
    if (!event) throw new NotFoundException('Event not found');

    const name = dto.name.trim();
    const source = partnerSource(name);
    if (!source) throw new BadRequestException('Give the partner a name with letters or numbers');

    const identity = await this.prisma.userIdentity.findFirst({
      where: { email: { equals: dto.email.trim(), mode: 'insensitive' } },
      select: { userId: true },
      orderBy: { isPrimary: 'desc' },
    });
    if (!identity) {
      throw new BadRequestException(
        'No Unifesto account uses that email. Ask them to sign up in the app first.',
      );
    }

    const existing = await this.prisma.eventPartnerLink.findUnique({
      where: { eventId_source: { eventId, source } },
    });
    if (existing && !existing.revokedAt) {
      throw new ConflictException(`${existing.name} is already a partner on this event`);
    }
    // Re-adding a revoked partner reuses its row (same source, so the
    // registrations it already brought in stay credited to it).
    const link = existing
      ? await this.prisma.eventPartnerLink.update({
          where: { id: existing.id },
          data: { name, partnerUserId: identity.userId, revokedAt: null, createdById },
        })
      : await this.prisma.eventPartnerLink.create({
          data: { eventId, name, source, partnerUserId: identity.userId, createdById },
        });
    return (await this.listForEvent(eventId)).find((l) => l.id === link.id);
  }

  async listForEvent(eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { slug: true },
    });
    if (!event) throw new NotFoundException('Event not found');
    const [links, counts] = await Promise.all([
      this.prisma.eventPartnerLink.findMany({
        where: { eventId, revokedAt: null },
        orderBy: { createdAt: 'asc' },
        include: {
          partnerUser: { select: { id: true, fullName: true, username: true, avatarUrl: true } },
        },
      }),
      this.countsBySource(eventId),
    ]);
    return links.map((l) => ({
      id: l.id,
      name: l.name,
      source: l.source,
      contact: l.partnerUser,
      registrations: counts.get(l.source) ?? 0,
      trackingUrl: partnerTrackingUrl(event.slug, l.source),
      createdAt: l.createdAt,
    }));
  }

  async revoke(eventId: string, linkId: string) {
    const res = await this.prisma.eventPartnerLink.updateMany({
      where: { id: linkId, eventId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (res.count === 0) throw new NotFoundException('Partner not found');
    return { success: true };
  }

  // ---- Partner ----

  /** Every event this user is an active partner on, newest event first. */
  async listMine(userId: string) {
    const links = await this.prisma.eventPartnerLink.findMany({
      where: { partnerUserId: userId, revokedAt: null, event: { deletedAt: null } },
      include: {
        event: {
          select: {
            id: true,
            slug: true,
            title: true,
            coverImageUrl: true,
            startDateTime: true,
            space: { select: { name: true } },
          },
        },
      },
      orderBy: { event: { startDateTime: 'desc' } },
    });
    const counts = await Promise.all(
      links.map((l) =>
        this.prisma.eventRegistration.count({
          where: {
            eventId: l.eventId,
            utmSource: l.source,
            utmMedium: PARTNER_MEDIUM,
            ...COUNTS_AS_ATTENDING,
          },
        }),
      ),
    );
    return links.map((l, i) => ({
      id: l.id,
      name: l.name,
      event: l.event,
      registrations: counts[i],
      trackingUrl: partnerTrackingUrl(l.event.slug, l.source),
    }));
  }

  /** One partner link's stats, visible only to its partner contact. */
  async statsForPartner(userId: string, linkId: string) {
    const link = await this.prisma.eventPartnerLink.findFirst({
      where: { id: linkId, partnerUserId: userId, revokedAt: null },
      include: {
        event: {
          select: {
            id: true,
            slug: true,
            title: true,
            coverImageUrl: true,
            startDateTime: true,
            space: { select: { name: true } },
          },
        },
      },
    });
    if (!link) throw new NotFoundException('Partner link not found');

    const regs = await this.prisma.eventRegistration.findMany({
      where: {
        eventId: link.eventId,
        utmSource: link.source,
        utmMedium: PARTNER_MEDIUM,
        ...COUNTS_AS_ATTENDING,
      },
      select: { registeredAt: true },
    });
    const byDay = new Map<string, number>();
    for (const r of regs) {
      const k = istDay(r.registeredAt);
      byDay.set(k, (byDay.get(k) ?? 0) + 1);
    }
    const today = istDay(new Date());
    return {
      id: link.id,
      name: link.name,
      event: link.event,
      trackingUrl: partnerTrackingUrl(link.event.slug, link.source),
      registrations: regs.length,
      today: byDay.get(today) ?? 0,
      daily: [...byDay.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, count]) => ({ date, count })),
    };
  }
}
