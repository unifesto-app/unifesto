import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SPACE_ADMIN_ROLE_CODES } from '../auth/authorization';
import { CacheService } from '../cache/cache.service';
import { PrismaService } from '../prisma/prisma.service';
import { PlanConfigService } from '../subscription/plan-config.service';
import {
  AdminApplyBrandingDto,
  CreateWhiteLabelRequestDto,
  ReviewWhiteLabelRequestDto,
  UpdateBrandingDto,
} from './dto';

/**
 * White-label (organiser branding) request flow — mirrors the space ownership
 * and status request flows in `SpacesService`. An organiser proposes branding
 * for a space (or one of its events); an admin approves or rejects; on approval
 * the branding is copied onto the target and its `whiteLabelEnabled` flag is
 * flipped on. Creating a request additionally requires the space's plan to
 * include `hasRemoveBranding` — the same perk sold as the "White-label option".
 */
@Injectable()
export class WhiteLabelService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly planConfig: PlanConfigService,
    private readonly cache: CacheService,
  ) {}

  /**
   * Public event pages are cached by slug and carry `branding`. An event target
   * busts only itself; a space target busts every event under it, since events
   * inherit the space's branding and favicon.
   */
  private async invalidateBrandingCaches(target: {
    spaceId?: string;
    eventId?: string;
  }) {
    const events = await this.prisma.event.findMany({
      where: target.eventId ? { id: target.eventId } : { spaceId: target.spaceId },
      select: { slug: true },
    });
    await Promise.all(
      events.map((e) => this.cache.invalidateEventCache(e.slug)),
    );
  }

  /** True when the space's owner's plan includes the white-label perk. */
  private async spaceHasBrandingPlan(spaceId: string): Promise<boolean> {
    const space = await this.prisma.space.findUnique({
      where: { id: spaceId },
      select: { subscription: true },
    });
    const subscription = space?.subscription;
    // No subscription → not paying for the perk → not allowed. (Stricter than
    // Sessions/Leaderboard, which only gate *management*; branding is a public,
    // paid perk so an unbilled space should never render it.)
    if (!subscription) return false;
    return this.planConfig.getEffectiveLimits(subscription).hasRemoveBranding;
  }

  /** Assert the user is an organiser (or co-organiser) of the space. */
  private async assertOrganiser(spaceId: string, userId: string) {
    const membership = await this.prisma.userRole.count({
      where: {
        userId,
        spaceId,
        eventId: null,
        role: { code: { in: [...SPACE_ADMIN_ROLE_CODES] } },
      },
    });
    if (membership === 0) {
      throw new ForbiddenException(
        'Only an organiser of this space can request white-label',
      );
    }
  }

  async createRequest(userId: string, dto: CreateWhiteLabelRequestDto) {
    const space = await this.prisma.space.findUnique({
      where: { id: dto.spaceId },
      select: { id: true, whiteLabelEnabled: true },
    });
    if (!space) throw new NotFoundException('Space not found');

    await this.assertOrganiser(dto.spaceId, userId);

    let alreadyEnabled = space.whiteLabelEnabled;
    if (dto.eventId) {
      const event = await this.prisma.event.findUnique({
        where: { id: dto.eventId },
        select: { spaceId: true, whiteLabelEnabled: true },
      });
      if (!event) throw new NotFoundException('Event not found');
      if (event.spaceId !== dto.spaceId) {
        throw new BadRequestException(
          'That event does not belong to this space',
        );
      }
      alreadyEnabled = event.whiteLabelEnabled;
    }
    if (alreadyEnabled) {
      throw new ConflictException(
        'White-label is already on for this target. Edit the branding directly.',
      );
    }

    if (!(await this.spaceHasBrandingPlan(dto.spaceId))) {
      throw new ForbiddenException(
        'White-label is not included in this space’s plan. Upgrade to request it.',
      );
    }

    // One pending request per target (space-level vs a specific event).
    const existing = await this.prisma.whiteLabelRequest.findFirst({
      where: {
        spaceId: dto.spaceId,
        eventId: dto.eventId ?? null,
        status: 'PENDING',
      },
    });
    if (existing) {
      throw new ConflictException(
        'A white-label request for this target is already awaiting review',
      );
    }

    return this.prisma.whiteLabelRequest.create({
      data: {
        spaceId: dto.spaceId,
        eventId: dto.eventId ?? null,
        requestedBy: userId,
        brandColor: dto.brandColor,
        reason: dto.reason,
        status: 'PENDING',
      },
      include: this.requestInclude(),
    });
  }

  /** Requests raised by this user (optionally scoped to one space). */
  async getMyRequests(userId: string, spaceId?: string) {
    return this.prisma.whiteLabelRequest.findMany({
      where: { requestedBy: userId, ...(spaceId ? { spaceId } : {}) },
      include: this.requestInclude(),
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Everything the space's white-label page needs, from the source of truth
   * (the Space/Event rows) rather than the request history: an admin may have
   * applied or removed white-label directly, and a co-admin may have raised the
   * request. Requests are space-wide, newest first.
   */
  async getSpaceOverview(userId: string, spaceId: string) {
    const space = await this.prisma.space.findUnique({
      where: { id: spaceId },
      select: this.spaceBrandingSelect(),
    });
    if (!space) throw new NotFoundException('Space not found');
    await this.assertOrganiser(spaceId, userId);

    const [planHasBranding, events, requests] = await Promise.all([
      this.spaceHasBrandingPlan(spaceId),
      this.prisma.event.findMany({
        where: { spaceId, deletedAt: null },
        select: {
          ...this.brandingSelect(),
          title: true,
          slug: true,
          status: true,
          startDateTime: true,
        },
        orderBy: { startDateTime: 'desc' },
      }),
      this.prisma.whiteLabelRequest.findMany({
        where: { spaceId },
        include: this.requestInclude(),
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return { planHasBranding, space, events, requests };
  }

  /** Admin inbox. */
  async getAllRequests(status?: string, page = 1, limit = 20) {
    const where = status ? { status } : {};
    const [rows, total] = await Promise.all([
      this.prisma.whiteLabelRequest.findMany({
        where,
        include: this.requestInclude(true),
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.whiteLabelRequest.count({ where }),
    ]);

    // Approving never blocks on the plan, but branding only renders when the
    // plan has the perk — surface it so the reviewer isn't surprised.
    const planBySpace = new Map<string, boolean>();
    for (const spaceId of new Set(rows.map((r) => r.spaceId))) {
      planBySpace.set(spaceId, await this.spaceHasBrandingPlan(spaceId));
    }
    const requests = rows.map((r) => ({
      ...r,
      planHasBranding: planBySpace.get(r.spaceId) ?? false,
    }));

    return {
      requests,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Admin decision. Approving copies the proposed branding onto the target
   * Space/Event and flips its `whiteLabelEnabled` on, in one transaction.
   */
  async reviewRequest(
    requestId: string,
    adminId: string,
    dto: ReviewWhiteLabelRequestDto,
  ) {
    const req = await this.prisma.whiteLabelRequest.findUnique({
      where: { id: requestId },
    });
    if (!req) throw new NotFoundException('Request not found');
    if (req.status !== 'PENDING') {
      throw new BadRequestException('This request has already been reviewed');
    }

    const reviewedAt = new Date();

    if (dto.status === 'REJECTED') {
      return this.prisma.whiteLabelRequest.update({
        where: { id: requestId },
        data: {
          status: 'REJECTED',
          reviewNote: dto.reviewNote ?? null,
          reviewedBy: adminId,
          reviewedAt,
        },
        include: this.requestInclude(true),
      });
    }

    // APPROVED — apply branding to the target and record the decision atomically.
    const branding = {
      whiteLabelEnabled: true,
      brandColor: req.brandColor,
    };

    const [, updated] = await this.prisma.$transaction([
      req.eventId
        ? this.prisma.event.update({
            where: { id: req.eventId },
            data: branding,
          })
        : this.prisma.space.update({
            where: { id: req.spaceId },
            data: branding,
          }),
      this.prisma.whiteLabelRequest.update({
        where: { id: requestId },
        data: {
          status: 'APPROVED',
          reviewNote: dto.reviewNote ?? null,
          reviewedBy: adminId,
          reviewedAt,
        },
        include: this.requestInclude(true),
      }),
    ]);

    await this.invalidateBrandingCaches(
      req.eventId ? { eventId: req.eventId } : { spaceId: req.spaceId },
    );
    return updated;
  }

  /**
   * Organiser edits the branding on an already-approved target. No admin
   * re-approval (white-label was already granted for the entity), but the plan
   * gate and organiser membership are re-checked, and the target must already
   * be white-labelled.
   */
  async updateBranding(
    userId: string,
    target: { spaceId?: string; eventId?: string },
    dto: UpdateBrandingDto,
  ) {
    if (target.eventId) {
      const event = await this.prisma.event.findUnique({
        where: { id: target.eventId },
        select: { spaceId: true, whiteLabelEnabled: true },
      });
      if (!event) throw new NotFoundException('Event not found');
      await this.assertOrganiser(event.spaceId, userId);
      if (!event.whiteLabelEnabled) {
        throw new ForbiddenException('White-label is not enabled for this event');
      }
      if (!(await this.spaceHasBrandingPlan(event.spaceId))) {
        throw new ForbiddenException('White-label is not included in this plan');
      }
      const updated = await this.prisma.event.update({
        where: { id: target.eventId },
        data: this.brandingPatch(dto),
        select: this.brandingSelect(),
      });
      await this.invalidateBrandingCaches(target);
      return updated;
    }

    if (!target.spaceId) throw new BadRequestException('No target specified');
    const space = await this.prisma.space.findUnique({
      where: { id: target.spaceId },
      select: { whiteLabelEnabled: true },
    });
    if (!space) throw new NotFoundException('Space not found');
    await this.assertOrganiser(target.spaceId, userId);
    if (!space.whiteLabelEnabled) {
      throw new ForbiddenException('White-label is not enabled for this space');
    }
    if (!(await this.spaceHasBrandingPlan(target.spaceId))) {
      throw new ForbiddenException('White-label is not included in this plan');
    }
    const updated = await this.prisma.space.update({
      where: { id: target.spaceId },
      data: { ...this.brandingPatch(dto), ...this.spaceSurfacesPatch(dto) },
      select: this.spaceBrandingSelect(),
    });
    await this.invalidateBrandingCaches(target);
    return updated;
  }

  /**
   * Admin override: directly apply (or remove) white-label on a space or event,
   * bypassing the organiser request/approval flow and the organiser-membership
   * check. Sets `whiteLabelEnabled` to `dto.enabled` and patches the colour
   * when supplied. Deliberately does NOT block on the plan — an admin may grant
   * ahead of a plan — but returns `willRender`, computed from the same plan gate
   * that `resolveBranding` applies, so the caller can warn when the branding is
   * stored but won't yet show publicly.
   */
  async adminApplyBranding(
    target: { spaceId?: string; eventId?: string },
    dto: AdminApplyBrandingDto,
  ) {
    const data = {
      whiteLabelEnabled: dto.enabled,
      ...this.brandingPatch(dto),
    };

    let updated: {
      id: string;
      whiteLabelEnabled: boolean;
      brandColor: string | null;
    };
    // The space whose plan governs whether this will render — the target space,
    // or the event's owning space.
    let owningSpaceId: string;

    if (target.eventId) {
      const event = await this.prisma.event.findUnique({
        where: { id: target.eventId },
        select: { spaceId: true },
      });
      if (!event) throw new NotFoundException('Event not found');
      owningSpaceId = event.spaceId;
      updated = await this.prisma.event.update({
        where: { id: target.eventId },
        data,
        select: this.brandingSelect(),
      });
    } else {
      if (!target.spaceId) throw new BadRequestException('No target specified');
      const space = await this.prisma.space.findUnique({
        where: { id: target.spaceId },
        select: { id: true },
      });
      if (!space) throw new NotFoundException('Space not found');
      owningSpaceId = target.spaceId;
      updated = await this.prisma.space.update({
        where: { id: target.spaceId },
        data,
        select: this.brandingSelect(),
      });
    }

    await this.invalidateBrandingCaches(target);
    const planHasBranding = await this.spaceHasBrandingPlan(owningSpaceId);
    return {
      ...updated,
      // True only when it will actually surface on public pages right now.
      willRender: dto.enabled && planHasBranding,
      planHasBranding,
    };
  }

  // `null` is meaningful here (explicitly clears the column); only `undefined`
  // means "leave untouched", so the guard is `!== undefined`, not truthiness.
  private brandingPatch(dto: { brandColor?: string | null }) {
    const patch: { brandColor?: string | null } = {};
    if (dto.brandColor !== undefined) patch.brandColor = dto.brandColor;
    return patch;
  }

  private brandingSelect() {
    return {
      id: true,
      whiteLabelEnabled: true,
      brandColor: true,
    };
  }

  /**
   * Space-only white-label surfaces. Kept out of `brandingPatch` because an
   * event row has no such columns — only the space branch applies these.
   */
  private spaceSurfacesPatch(dto: {
    faviconUrl?: string | null;
    emailFromName?: string | null;
    emailReplyTo?: string | null;
  }) {
    const patch: {
      faviconUrl?: string | null;
      emailFromName?: string | null;
      emailReplyTo?: string | null;
    } = {};
    if (dto.faviconUrl !== undefined) patch.faviconUrl = dto.faviconUrl;
    if (dto.emailFromName !== undefined) patch.emailFromName = dto.emailFromName;
    if (dto.emailReplyTo !== undefined) patch.emailReplyTo = dto.emailReplyTo;
    return patch;
  }

  private spaceBrandingSelect() {
    return {
      ...this.brandingSelect(),
      faviconUrl: true,
      emailFromName: true,
      emailReplyTo: true,
    };
  }

  private requestInclude(withContact = false) {
    return {
      space: { select: { id: true, name: true, slug: true, logoUrl: true } },
      event: { select: { id: true, title: true, slug: true } },
      requester: {
        select: {
          id: true,
          fullName: true,
          username: true,
          ...(withContact ? { mobileNumber: true } : {}),
        },
      },
    };
  }
}
