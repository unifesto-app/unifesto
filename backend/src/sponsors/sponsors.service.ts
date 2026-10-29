import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, SponsorLeadSource, SponsorUserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../cache/cache.service';
import { StorageService } from '../storage/storage.service';
import { COUNTS_AS_ATTENDING } from '../common/attendance';
import { PlanConfigService } from '../subscription/plan-config.service';
import {
  AttachSponsorDto,
  CreateSponsorDto,
  CreateSponsorTierDto,
  UpdateEventSponsorDto,
  UpdateSponsorDto,
  UpdateSponsorTierDto,
} from './dto/sponsor.dto';
import { normalizeEmail } from '../auth/identifiers';
import { findOrCreateUserByEmail } from '../auth/collaborator-invite';
import { EmailService } from '../email/email.service';
import { SPACE_APP } from '../email/layout';

/**
 * Sponsors & lead generation — P1: the space-level sponsor roster, the per-space
 * tier ladder, and attaching sponsors to events with per-event overrides.
 *
 * Authorization is handled at the controller (@Can space:manage-sponsors); this
 * service owns the plan gate and the invariant that every sponsor/tier/event it
 * touches actually belongs to the `spaceId` in the path — so a valid role in one
 * space can never reach into another's roster.
 */
@Injectable()
export class SponsorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly planConfig: PlanConfigService,
    private readonly cache: CacheService,
    private readonly storage: StorageService,
    private readonly email: EmailService,
  ) {}

  /**
   * Bust the public event-detail cache for an event (its slug is where the
   * cached page lives). Called after any change that alters public sponsor
   * display so a viewer never sees a stale roster. Best-effort: a cache miss
   * simply rebuilds from the DB.
   */
  private async invalidateEventPublicCache(eventId: string): Promise<void> {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { slug: true },
    });
    if (event) await this.cache.invalidateEventCache(event.slug);
  }

  /** Bust every event a roster sponsor is attached to (name/logo edits ripple). */
  private async invalidateSponsorEventCaches(sponsorId: string): Promise<void> {
    const links = await this.prisma.eventSponsor.findMany({
      where: { sponsorId },
      select: { event: { select: { slug: true } } },
    });
    await Promise.all(
      links.map((l) => this.cache.invalidateEventCache(l.event.slug)),
    );
  }

  /** Bust every event that ranks a sponsor in this tier (rank/color/name edits). */
  private async invalidateTierEventCaches(tierId: string): Promise<void> {
    const links = await this.prisma.eventSponsor.findMany({
      where: { tierId },
      select: { event: { select: { slug: true } } },
    });
    await Promise.all(
      links.map((l) => this.cache.invalidateEventCache(l.event.slug)),
    );
  }

  /**
   * Rejects unless the space's plan includes sponsors (Growth and up). Same
   * gate as the leads funnel: a space with no subscription row is on General,
   * so it no longer gets sponsors for free.
   */
  private assertPlanAllowsSponsors(spaceId: string): Promise<void> {
    return this.planConfig.assertFeature(spaceId, 'hasSponsors');
  }

  /** Confirms an event belongs to the space, else 404. Returns the event id. */
  private async assertEventInSpace(
    spaceId: string,
    eventId: string,
  ): Promise<void> {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, spaceId, deletedAt: null },
      select: { id: true },
    });
    if (!event) throw new NotFoundException('Event not found in this space');
  }

  // ---- Tiers --------------------------------------------------------------

  listTiers(spaceId: string) {
    return this.prisma.sponsorTier.findMany({
      where: { spaceId },
      orderBy: [{ rank: 'asc' }, { name: 'asc' }],
    });
  }

  async createTier(spaceId: string, dto: CreateSponsorTierDto) {
    await this.assertPlanAllowsSponsors(spaceId);
    return this.prisma.sponsorTier.create({
      data: {
        spaceId,
        name: dto.name,
        rank: dto.rank ?? 0,
        color: dto.color ?? null,
      },
    });
  }

  async updateTier(spaceId: string, id: string, dto: UpdateSponsorTierDto) {
    await this.assertPlanAllowsSponsors(spaceId);
    await this.getOwnedTier(spaceId, id);
    const tier = await this.prisma.sponsorTier.update({
      where: { id },
      data: {
        name: dto.name,
        rank: dto.rank,
        color: dto.color,
      },
    });
    await this.invalidateTierEventCaches(id);
    return tier;
  }

  async deleteTier(spaceId: string, id: string) {
    await this.assertPlanAllowsSponsors(spaceId);
    await this.getOwnedTier(spaceId, id);
    // Bust affected event caches before the row (and its links) change.
    await this.invalidateTierEventCaches(id);
    // EventSponsor.tierId is SetNull, so deleting a tier untiers its sponsors
    // at every event rather than detaching them.
    await this.prisma.sponsorTier.delete({ where: { id } });
    return { deleted: true };
  }

  private async getOwnedTier(spaceId: string, id: string) {
    const tier = await this.prisma.sponsorTier.findFirst({
      where: { id, spaceId },
    });
    if (!tier) throw new NotFoundException('Sponsor tier not found');
    return tier;
  }

  // ---- Roster sponsors ----------------------------------------------------

  listSponsors(spaceId: string) {
    return this.prisma.sponsor.findMany({
      where: { spaceId },
      orderBy: { name: 'asc' },
      include: { _count: { select: { eventSponsors: true, sponsorUsers: true } } },
    });
  }

  async getSponsor(spaceId: string, id: string) {
    const sponsor = await this.prisma.sponsor.findFirst({
      where: { id, spaceId },
      include: {
        eventSponsors: {
          include: { event: { select: { id: true, title: true, slug: true } } },
        },
      },
    });
    if (!sponsor) throw new NotFoundException('Sponsor not found');
    return sponsor;
  }

  /**
   * Store a sponsor logo and hand back its URL; the client then saves it with
   * create/update like any other field (a sponsor may not exist yet when the
   * logo is picked). Goes through StorageService, so it is resized and cached
   * like every other upload.
   */
  async uploadLogo(spaceId: string, file: Express.Multer.File) {
    await this.assertPlanAllowsSponsors(spaceId);
    const logoUrl = await this.storage.uploadFile(file, 'sponsor-logos/', spaceId);
    return { logoUrl };
  }

  async createSponsor(spaceId: string, dto: CreateSponsorDto) {
    await this.assertPlanAllowsSponsors(spaceId);
    return this.prisma.sponsor.create({
      data: {
        spaceId,
        name: dto.name,
        logoUrl: dto.logoUrl ?? null,
        websiteUrl: dto.websiteUrl ?? null,
        description: dto.description ?? null,
        contactName: dto.contactName ?? null,
        contactEmail: dto.contactEmail ?? null,
        contactPhone: dto.contactPhone ?? null,
      },
    });
  }

  async updateSponsor(spaceId: string, id: string, dto: UpdateSponsorDto) {
    await this.assertPlanAllowsSponsors(spaceId);
    await this.getOwnedSponsor(spaceId, id);
    const sponsor = await this.prisma.sponsor.update({
      where: { id },
      data: {
        name: dto.name,
        logoUrl: dto.logoUrl,
        websiteUrl: dto.websiteUrl,
        description: dto.description,
        contactName: dto.contactName,
        contactEmail: dto.contactEmail,
        contactPhone: dto.contactPhone,
      },
    });
    // Name/logo/description feed the effective public shape at every event.
    await this.invalidateSponsorEventCaches(id);
    return sponsor;
  }

  async deleteSponsor(spaceId: string, id: string) {
    await this.assertPlanAllowsSponsors(spaceId);
    await this.getOwnedSponsor(spaceId, id);
    // Bust affected event caches before the attachments cascade away.
    await this.invalidateSponsorEventCaches(id);
    // Cascades away its event attachments, portal memberships and leads.
    await this.prisma.sponsor.delete({ where: { id } });
    return { deleted: true };
  }

  private async getOwnedSponsor(spaceId: string, id: string) {
    const sponsor = await this.prisma.sponsor.findFirst({
      where: { id, spaceId },
    });
    if (!sponsor) throw new NotFoundException('Sponsor not found');
    return sponsor;
  }

  // ---- Event attachments --------------------------------------------------

  async listEventSponsors(spaceId: string, eventId: string) {
    await this.assertEventInSpace(spaceId, eventId);
    return this.prisma.eventSponsor.findMany({
      where: { eventId },
      include: {
        sponsor: true,
        tier: true,
        // Lead count per attachment so the management list shows "N leads".
        _count: { select: { leads: true } },
      },
      orderBy: [{ tier: { rank: 'asc' } }, { order: 'asc' }],
    });
  }

  async attachSponsor(spaceId: string, eventId: string, dto: AttachSponsorDto) {
    await this.assertPlanAllowsSponsors(spaceId);
    await this.assertEventInSpace(spaceId, eventId);
    // Sponsor must belong to the same space.
    await this.getOwnedSponsor(spaceId, dto.sponsorId);
    if (dto.tierId) await this.getOwnedTier(spaceId, dto.tierId);

    try {
      const created = await this.prisma.eventSponsor.create({
        data: {
          eventId,
          sponsorId: dto.sponsorId,
          tierId: dto.tierId ?? null,
          order: dto.order ?? 0,
          leadCaptureEnabled: dto.leadCaptureEnabled ?? false,
          overrideLogoUrl: dto.overrideLogoUrl ?? null,
          overrideDescription: dto.overrideDescription ?? null,
        },
        include: { sponsor: true, tier: true },
      });
      await this.invalidateEventPublicCache(eventId);
      return created;
    } catch (e) {
      // @@unique([eventId, sponsorId]) — sponsor already attached to this event.
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ForbiddenException(
          'This sponsor is already attached to the event.',
        );
      }
      throw e;
    }
  }

  async updateEventSponsor(
    spaceId: string,
    eventId: string,
    eventSponsorId: string,
    dto: UpdateEventSponsorDto,
  ) {
    await this.assertPlanAllowsSponsors(spaceId);
    await this.assertEventInSpace(spaceId, eventId);
    const existing = await this.prisma.eventSponsor.findFirst({
      where: { id: eventSponsorId, eventId },
    });
    if (!existing) throw new NotFoundException('Event sponsor not found');
    if (dto.tierId) await this.getOwnedTier(spaceId, dto.tierId);

    const updated = await this.prisma.eventSponsor.update({
      where: { id: eventSponsorId },
      data: {
        tierId: dto.tierId,
        order: dto.order,
        leadCaptureEnabled: dto.leadCaptureEnabled,
        overrideLogoUrl: dto.overrideLogoUrl,
        overrideDescription: dto.overrideDescription,
      },
      include: { sponsor: true, tier: true },
    });
    await this.invalidateEventPublicCache(eventId);
    return updated;
  }

  async detachSponsor(
    spaceId: string,
    eventId: string,
    eventSponsorId: string,
  ) {
    await this.assertPlanAllowsSponsors(spaceId);
    await this.assertEventInSpace(spaceId, eventId);
    const existing = await this.prisma.eventSponsor.findFirst({
      where: { id: eventSponsorId, eventId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Event sponsor not found');
    // Cascades away this attachment's captured leads.
    await this.prisma.eventSponsor.delete({ where: { id: eventSponsorId } });
    await this.invalidateEventPublicCache(eventId);
    return { detached: true };
  }

  // ---- P2: attendee opt-in lead capture -----------------------------------

  /**
   * The caller's confirmed registration for an event, if any. Opt-in requires
   * being an actual attendee: it gives the lead a real identity, a registrationId
   * for the one-lead-per-attendee unique key, and keeps sponsor lead lists
   * meaningful (people who are actually coming).
   */
  private getAttendingRegistration(userId: string, eventId: string) {
    return this.prisma.eventRegistration.findFirst({
      where: { eventId, userId, ...COUNTS_AS_ATTENDING },
      orderBy: { registeredAt: 'asc' },
      select: { id: true },
    });
  }

  /** Attendee opts in to share their details with one sponsor at one event. */
  async optIn(userId: string, eventId: string, eventSponsorId: string) {
    const es = await this.prisma.eventSponsor.findFirst({
      where: { id: eventSponsorId, eventId },
      select: { id: true, leadCaptureEnabled: true, event: { select: { spaceId: true } } },
    });
    if (!es) throw new NotFoundException('Sponsor not found for this event');
    if (!es.leadCaptureEnabled) {
      throw new ForbiddenException('This sponsor is not collecting leads.');
    }
    // A space that dropped below Growth keeps its leads but takes no new ones.
    await this.assertPlanAllowsSponsors(es.event.spaceId);

    const reg = await this.getAttendingRegistration(userId, eventId);
    if (!reg) {
      throw new ForbiddenException(
        'Register for this event to share your details with its sponsors.',
      );
    }

    // Snapshot contact from the account: name + mobile always, email from the
    // best identity that has one (primary first). Snapshotting means the lead
    // survives later profile edits and matches how booth/manual leads are stored.
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        fullName: true,
        mobileNumber: true,
        identities: {
          where: { email: { not: null } },
          orderBy: { isPrimary: 'desc' },
          select: { email: true },
          take: 1,
        },
      },
    });

    const lead = await this.prisma.sponsorLead.upsert({
      where: {
        eventSponsorId_registrationId: {
          eventSponsorId,
          registrationId: reg.id,
        },
      },
      // Already opted in (or previously scanned): a no-op keeps this idempotent.
      update: {},
      create: {
        eventSponsorId,
        registrationId: reg.id,
        name: user?.fullName ?? null,
        email: user?.identities[0]?.email ?? null,
        phone: user?.mobileNumber ?? null,
        source: SponsorLeadSource.OPT_IN,
      },
      select: { id: true },
    });
    return { optedIn: true, leadId: lead.id };
  }

  /** Attendee withdraws a previous opt-in (consent withdrawal). */
  async withdrawOptIn(userId: string, eventId: string, eventSponsorId: string) {
    const reg = await this.getAttendingRegistration(userId, eventId);
    if (!reg) return { optedIn: false };
    // Only remove a lead the attendee created by opting in — never a booth scan
    // or a manually captured lead, which represent a real in-person interaction.
    await this.prisma.sponsorLead.deleteMany({
      where: {
        eventSponsorId,
        registrationId: reg.id,
        source: SponsorLeadSource.OPT_IN,
      },
    });
    return { optedIn: false };
  }

  /**
   * The eventSponsor ids the caller has opted into, for UI state. Only OPT_IN
   * leads: a booth scan is not something the attendee can withdraw here, so
   * showing it as "Details shared" would offer a withdraw that does nothing.
   */
  async listMyOptIns(userId: string, eventId: string): Promise<string[]> {
    const reg = await this.getAttendingRegistration(userId, eventId);
    if (!reg) return [];
    const leads = await this.prisma.sponsorLead.findMany({
      where: { registrationId: reg.id, eventSponsor: { eventId }, source: SponsorLeadSource.OPT_IN },
      select: { eventSponsorId: true },
    });
    return leads.map((l) => l.eventSponsorId);
  }

  // ---- P3: curator lead inbox ---------------------------------------------

  /**
   * Every sponsor lead captured at an event, newest first, flattened for the
   * curator's inbox: the sponsor it belongs to, the attendee snapshot, and how
   * it was captured. Optionally narrowed to one sponsor's attachment.
   */
  async listEventLeads(
    spaceId: string,
    eventId: string,
    eventSponsorId?: string,
  ) {
    await this.assertEventInSpace(spaceId, eventId);
    const rows = await this.prisma.sponsorLead.findMany({
      where: {
        eventSponsor: { eventId, ...(eventSponsorId ? { id: eventSponsorId } : {}) },
      },
      include: {
        eventSponsor: {
          select: { id: true, sponsor: { select: { id: true, name: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => ({
      id: r.id,
      eventSponsorId: r.eventSponsorId,
      sponsorId: r.eventSponsor.sponsor.id,
      sponsorName: r.eventSponsor.sponsor.name,
      name: r.name,
      email: r.email,
      phone: r.phone,
      source: r.source,
      note: r.note,
      createdAt: r.createdAt,
    }));
  }

  /**
   * All leads for one roster sponsor across every event it is attached to —
   * the roster-centric view. Enforces the sponsor belongs to the space.
   */
  async listSponsorLeads(spaceId: string, sponsorId: string) {
    await this.getOwnedSponsor(spaceId, sponsorId);
    const rows = await this.prisma.sponsorLead.findMany({
      where: { eventSponsor: { sponsorId } },
      include: {
        eventSponsor: {
          select: {
            id: true,
            event: { select: { id: true, title: true, slug: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => ({
      id: r.id,
      eventSponsorId: r.eventSponsorId,
      eventId: r.eventSponsor.event.id,
      eventTitle: r.eventSponsor.event.title,
      name: r.name,
      email: r.email,
      phone: r.phone,
      source: r.source,
      note: r.note,
      createdAt: r.createdAt,
    }));
  }

  // ---- P5: sponsor portal access (curator side) ---------------------------

  private static readonly SPONSOR_USER_SELECT = {
    id: true,
    status: true,
    invitedEmail: true,
    createdAt: true,
    acceptedAt: true,
    user: {
      select: {
        id: true,
        fullName: true,
        username: true,
        avatarUrl: true,
      },
    },
  } satisfies Prisma.SponsorUserSelect;

  listSponsorUsers(spaceId: string, sponsorId: string) {
    return this.getOwnedSponsor(spaceId, sponsorId).then(() =>
      this.prisma.sponsorUser.findMany({
        where: { sponsorId },
        select: SponsorsService.SPONSOR_USER_SELECT,
        orderBy: { createdAt: 'asc' },
      }),
    );
  }

  /**
   * Invite a person to a sponsor's portal by email (E1). Finds their account
   * or makes a claimable one, so the curator never learns who is on Unifesto
   * and nobody has to sign up first. The membership starts INVITED, becomes
   * ACTIVE on their first portal visit (getMySponsors), and an email tells
   * them where to sign in.
   */
  async inviteSponsorUser(
    spaceId: string,
    sponsorId: string,
    email: string,
    invitedBy: string,
  ) {
    await this.assertPlanAllowsSponsors(spaceId);
    const sponsor = await this.getOwnedSponsor(spaceId, sponsorId);
    const userId = await findOrCreateUserByEmail(this.prisma, email);

    let member;
    try {
      member = await this.prisma.sponsorUser.create({
        data: {
          sponsorId,
          userId,
          status: SponsorUserStatus.INVITED,
          invitedEmail: normalizeEmail(email),
          invitedBy,
        },
        select: SponsorsService.SPONSOR_USER_SELECT,
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new BadRequestException(
          'That person already has access to this sponsor.',
        );
      }
      throw e;
    }

    const [space, inviter] = await Promise.all([
      this.prisma.space.findUnique({ where: { id: spaceId }, select: { name: true } }),
      this.prisma.user.findUnique({ where: { id: invitedBy }, select: { fullName: true } }),
    ]);
    await this.email
      .sendCollaboratorInvite(
        {
          email: normalizeEmail(email),
          inviterName: inviter?.fullName,
          role: 'sponsor portal access',
          target: space ? `${sponsor.name} at ${space.name}` : sponsor.name,
          url: `${SPACE_APP}/sponsor`,
          cta: 'Open the sponsor portal',
        },
        { dedupKey: `invite.sponsor:${member.id}`, kind: 'collaborator.invite', userId },
      )
      .catch(() => undefined);
    return member;
  }

  async revokeSponsorUser(
    spaceId: string,
    sponsorId: string,
    sponsorUserId: string,
  ) {
    await this.getOwnedSponsor(spaceId, sponsorId);
    const existing = await this.prisma.sponsorUser.findFirst({
      where: { id: sponsorUserId, sponsorId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Sponsor user not found');
    await this.prisma.sponsorUser.delete({ where: { id: sponsorUserId } });
    return { revoked: true };
  }
}
