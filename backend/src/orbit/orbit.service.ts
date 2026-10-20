import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventStatus, PaymentStatus, RoleCode, SpaceStatus, SpaceType, SpaceVisibility } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PayoutsService } from '../payouts/payouts.service';
import { SpacesService } from '../spaces/spaces.service';
import { EmailService } from '../email/email.service';
import { APEX, button, esc, h1, p, strong } from '../email/layout';
import { SPACE_ADMIN_ROLE_CODES } from '../auth/authorization';
import { ORBIT_GOALS, ORBIT_PROBATION_DAYS, ORBIT_TIERS, orbitClock, orbitTier } from './orbit-tier';

const LIVE_EVENT = [EventStatus.PUBLISHED, EventStatus.ONGOING, EventStatus.COMPLETED];
/** Registrations that ever brought real money in (same set as Financials). */
const EVER_PAID = [PaymentStatus.PAID, PaymentStatus.PARTIALLY_REFUNDED, PaymentStatus.REFUNDED];
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Unifesto Orbit: one student per campus (a top-level SUPER space) gets clubs
 * onto Unifesto. Orbit Leads are explicit `OrbitLead` rows; appointing one
 * also makes them Space Admin of the campus, and ending one removes that.
 */
@Injectable()
export class OrbitService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly payouts: PayoutsService,
    private readonly spaces: SpacesService,
    private readonly email: EmailService,
  ) {}

  /**
   * Every campus with its whole sub-space tree rolled up, ranked by tier then
   * active clubs. Money comes from the Financials breakdown so it never drifts.
   */
  // ponytail: recomputes platform-wide financials per call; fine at ~100 spaces,
  // scope the breakdown to the campus tree if this gets slow.
  async campuses() {
    const now = new Date();
    const [{ spaces: money }, spaces, leads, publishedBySpace, paidByEvent] = await Promise.all([
      this.payouts.getPlatformFinancialsBreakdown(),
      this.prisma.space.findMany({
        select: { id: true, name: true, slug: true, type: true, parentSpaceId: true, verifiedAt: true, createdAt: true },
      }),
      this.prisma.orbitLead.findMany({
        where: { endedAt: null },
        orderBy: { joinedAt: 'asc' },
        select: {
          id: true,
          spaceId: true,
          joinedAt: true,
          examPauseUntil: true,
          user: {
            select: {
              id: true,
              fullName: true,
              username: true,
              identities: { where: { email: { not: null } }, select: { email: true }, take: 1 },
            },
          },
        },
      }),
      this.prisma.event.groupBy({
        by: ['spaceId'],
        where: { deletedAt: null, status: { in: LIVE_EVENT } },
        _count: { _all: true },
        _max: { publishedAt: true },
      }),
      this.prisma.eventRegistration.groupBy({
        by: ['eventId'],
        where: { paymentStatus: { in: EVER_PAID }, totalAmount: { gt: 0 } },
        _count: { _all: true },
      }),
    ]);

    // Each space's top-level ancestor. Hierarchy writes block cycles; the
    // hop cap is a belt-and-braces guard.
    const parentOf = new Map(spaces.map((s) => [s.id, s.parentSpaceId]));
    const rootOf = (id: string) => {
      for (let hops = 0; hops < 10 && parentOf.get(id); hops++) id = parentOf.get(id)!;
      return id;
    };

    const published = new Map(publishedBySpace.map((g) => [g.spaceId, g]));
    const paid = new Map(paidByEvent.map((g) => [g.eventId, g._count._all]));
    const moneyBySpace = new Map(money.map((m) => [m.spaceId, m]));

    return spaces
      .filter((s) => s.type === SpaceType.SUPER && !s.parentSpaceId)
      .map((c) => {
        const tree = spaces.filter((s) => rootOf(s.id) === c.id);
        const clubs = tree.filter((s) => s.id !== c.id);
        let gmv = 0;
        let platformEarnings = 0;
        let paidRegistrations = 0;
        let paidEvents = 0;
        for (const s of tree) {
          const m = moneyBySpace.get(s.id);
          if (!m) continue;
          gmv += m.ticketRevenue;
          platformEarnings += m.platformEarnings;
          for (const e of m.events) {
            const n = paid.get(e.eventId) ?? 0;
            paidRegistrations += n;
            if (n > 0) paidEvents++;
          }
        }
        // The newest club joining or event published on this campus.
        const last = Math.max(
          0,
          ...clubs.map((s) => s.createdAt.getTime()),
          ...tree.map((s) => published.get(s.id)?._max.publishedAt?.getTime() ?? 0),
        );
        const lastActivityAt = last ? new Date(last) : null;
        const stats = {
          clubs: clubs.length,
          activeClubs: clubs.filter((s) => published.has(s.id)).length,
          publishedEvents: tree.reduce((n, s) => n + (published.get(s.id)?._count._all ?? 0), 0),
          paidEvents,
          paidRegistrations,
          gmv: round2(gmv),
          platformEarnings: round2(platformEarnings),
        };
        const tier = orbitTier(stats);
        const campusLeads = leads
          .filter((l) => l.spaceId === c.id)
          .map((l) => ({
            id: l.id,
            user: {
              id: l.user.id,
              fullName: l.user.fullName,
              username: l.user.username,
              email: l.user.identities[0]?.email ?? null,
            },
            joinedAt: l.joinedAt,
            examPauseUntil: l.examPauseUntil,
            probationEndsAt: new Date(l.joinedAt.getTime() + ORBIT_PROBATION_DAYS * 86_400_000),
          }));
        // The clock follows the longest-serving Lead on the campus.
        const clock = campusLeads[0]
          ? orbitClock({ joinedAt: campusLeads[0].joinedAt, lastActivityAt, examPauseUntil: campusLeads[0].examPauseUntil }, now)
          : null;
        return {
          spaceId: c.id,
          name: c.name,
          slug: c.slug,
          verified: !!c.verifiedAt,
          leads: campusLeads,
          ...stats,
          tier,
          tierName: ORBIT_TIERS[tier],
          lastActivityAt,
          clock,
          clubList: clubs
            .map((s) => ({
              id: s.id,
              name: s.name,
              slug: s.slug,
              publishedEvents: published.get(s.id)?._count._all ?? 0,
              joinedAt: s.createdAt,
            }))
            .sort((a, b) => b.publishedEvents - a.publishedEvents || a.name.localeCompare(b.name)),
        };
      })
      .sort((a, b) => b.tier - a.tier || b.activeClubs - a.activeClubs || b.gmv - a.gmv);
  }

  /**
   * The Orbit Lead's own view of their campus. No money: Leads never see
   * clubs' revenue (Programme Terms), only counts.
   */
  async forCampus(spaceId: string) {
    const all = await this.campuses();
    const i = all.findIndex((c) => c.spaceId === spaceId);
    if (i < 0) throw new NotFoundException('Not an Orbit campus');
    const { gmv, platformEarnings, paidRegistrations, ...campus } = all[i];
    // What the next tier needs; null once Gold.
    const nextGoal = ORBIT_GOALS[campus.tier] ?? null;
    return { ...campus, rank: i + 1, campusCount: all.length, nextGoal };
  }

  /** Appoint an Orbit Lead by email and make them Space Admin of the campus. */
  async appoint(spaceId: string, email: string, actorId: string) {
    const user = await this.prisma.user.findFirst({
      where: { identities: { some: { email: { equals: email.trim(), mode: 'insensitive' } } } },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('No Unifesto account with that email. Ask them to sign up first.');
    return this.appointUser(spaceId, user.id, actorId);
  }

  private async appointUser(spaceId: string, userId: string, actorId: string) {
    const space = await this.prisma.space.findUnique({
      where: { id: spaceId },
      select: { type: true, parentSpaceId: true },
    });
    if (!space) throw new NotFoundException('Space not found');
    if (space.type !== SpaceType.SUPER || space.parentSpaceId) {
      throw new BadRequestException('Orbit Leads go on a campus: a top-level Super space');
    }
    const user = { id: userId };
    if (await this.prisma.orbitLead.findFirst({ where: { spaceId, userId: user.id, endedAt: null } })) {
      throw new ConflictException('Already the Orbit Lead of this campus');
    }

    const existing = await this.prisma.userRole.findFirst({
      where: { userId: user.id, spaceId, eventId: null },
      select: { role: { select: { code: true } } },
    });
    if (!existing) {
      await this.spaces.addSpaceMember(spaceId, actorId, user.id, RoleCode.SPACE_ADMIN);
    } else if (!SPACE_ADMIN_ROLE_CODES.includes(existing.role.code)) {
      throw new BadRequestException(
        'They are already a member of this campus. Make them Space Admin on the Members tab first.',
      );
    }
    return this.prisma.orbitLead.create({ data: { spaceId, userId: user.id } });
  }

  /** End an Orbit Lead: remove their campus admin access, keep the row as history. */
  async end(leadId: string, reason: string | undefined, actorId: string) {
    const lead = await this.prisma.orbitLead.findUnique({ where: { id: leadId } });
    if (!lead || lead.endedAt) throw new NotFoundException('No live Orbit Lead with that id');
    const roles = await this.prisma.userRole.findMany({
      where: { userId: lead.userId, spaceId: lead.spaceId, eventId: null },
      select: { id: true },
    });
    for (const r of roles) await this.spaces.removeSpaceMember(lead.spaceId, r.id, actorId);
    return this.prisma.orbitLead.update({
      where: { id: leadId },
      data: { endedAt: new Date(), endReason: reason?.slice(0, 200) || null },
    });
  }

  /** Declare (or clear, with null) an exam window that pauses the clock. */
  async setExamPause(leadId: string, until: Date | null) {
    const lead = await this.prisma.orbitLead.findUnique({ where: { id: leadId } });
    if (!lead || lead.endedAt) throw new NotFoundException('No live Orbit Lead with that id');
    return this.prisma.orbitLead.update({ where: { id: leadId }, data: { examPauseUntil: until } });
  }

  // ── Applications (unifesto.app/orbit/apply) ───────────────────────────────

  /** Public campus picker for the apply form. `open` = no live Orbit Lead yet. */
  async campusOptions() {
    const rows = await this.prisma.space.findMany({
      where: { type: SpaceType.SUPER, parentSpaceId: null, visibility: SpaceVisibility.PUBLIC, status: SpaceStatus.ACTIVE },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, city: true, _count: { select: { orbitLeads: { where: { endedAt: null } } } } },
    });
    return rows.map((r) => ({ id: r.id, name: r.name, city: r.city, open: r._count.orbitLeads === 0 }));
  }

  /** A signed-in student applies. One open application per person. */
  async apply(userId: string, dto: OrbitApplyInput) {
    if (dto.spaceId) {
      const campus = await this.prisma.space.findFirst({
        where: { id: dto.spaceId, type: SpaceType.SUPER, parentSpaceId: null },
        select: { id: true },
      });
      if (!campus) throw new BadRequestException('Pick your campus from the list, or choose "Not listed".');
    }
    if (await this.prisma.orbitLead.findFirst({ where: { userId, endedAt: null } })) {
      throw new ConflictException('You are already an Orbit Lead.');
    }
    if (await this.prisma.orbitApplication.findFirst({ where: { userId, status: 'PENDING' } })) {
      throw new ConflictException('You already have an application in review. We will get back to you.');
    }
    const app = await this.prisma.orbitApplication.create({
      data: {
        userId,
        spaceId: dto.spaceId ?? null,
        collegeName: dto.collegeName.trim(),
        yearOfStudy: dto.yearOfStudy.trim(),
        myClubs: dto.myClubs.trim(),
        campusClubs: dto.campusClubs.trim(),
        why: dto.why.trim(),
        confirmedAt: new Date(),
      },
      include: { user: { select: { fullName: true, mobileNumber: true, identities: { where: { email: { not: null } }, select: { email: true }, take: 1 } } } },
    });

    // Tell the Program Lead. A failed email must not lose the application.
    const who = app.user.fullName || 'Someone';
    void this.email
      .sendRawEmail(
        ORBIT_INBOX,
        `New Orbit Lead application: ${who}, ${app.collegeName}`,
        h1('New Orbit Lead application') +
          p(`${strong(esc(who))} applied for ${strong(esc(app.collegeName))} (${esc(app.yearOfStudy)}).`) +
          p(`Email: ${esc(app.user.identities[0]?.email ?? 'not set')} · Phone: ${esc(app.user.mobileNumber)}`) +
          p(`<b>Clubs they're part of</b><br>${esc(app.myClubs).replace(/\n/g, '<br>')}`) +
          p(`<b>Clubs on their campus</b><br>${esc(app.campusClubs).replace(/\n/g, '<br>')}`) +
          p(`<b>Why</b><br>${esc(app.why).replace(/\n/g, '<br>')}`) +
          button('Review in Apex', `${APEX}/dashboard/orbit`),
      )
      .catch(() => undefined);
    return { id: app.id, status: app.status };
  }

  /** Apex queue: open applications first, then the latest decisions. */
  async applications() {
    return this.prisma.orbitApplication.findMany({
      orderBy: [{ status: 'desc' }, { createdAt: 'desc' }], // PENDING sorts above APPOINTED/DECLINED
      take: 200,
      include: {
        space: { select: { id: true, name: true } },
        user: {
          select: {
            id: true,
            fullName: true,
            mobileNumber: true,
            identities: { where: { email: { not: null } }, select: { email: true }, take: 1 },
          },
        },
      },
    });
  }

  /** Appoint from an application: makes them Lead of the chosen campus. */
  async appointApplication(id: string, spaceId: string, actorId: string) {
    const app = await this.pendingApplication(id);
    await this.appointUser(spaceId, app.userId, actorId);
    return this.prisma.orbitApplication.update({
      where: { id },
      data: { status: 'APPOINTED', spaceId, reviewedBy: actorId, reviewedAt: new Date() },
    });
  }

  async declineApplication(id: string, note: string | undefined, actorId: string) {
    await this.pendingApplication(id);
    return this.prisma.orbitApplication.update({
      where: { id },
      data: { status: 'DECLINED', reviewNote: note?.slice(0, 500) || null, reviewedBy: actorId, reviewedAt: new Date() },
    });
  }

  private async pendingApplication(id: string) {
    const app = await this.prisma.orbitApplication.findUnique({ where: { id } });
    if (!app || app.status !== 'PENDING') throw new NotFoundException('No open application with that id');
    return app;
  }
}

export interface OrbitApplyInput {
  spaceId?: string;
  collegeName: string;
  yearOfStudy: string;
  myClubs: string;
  campusClubs: string;
  why: string;
}

/** The Orbit Program Lead's inbox (Google Group). */
const ORBIT_INBOX = 'orbit@unifesto.app';
