import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import slugify from 'slugify';
import { PrismaService } from '../prisma/prisma.service';
import { deleteWithoutMoney } from '../common/money-records';
import { NOT_DELETED } from '../common/soft-delete';
import { StorageService } from '../storage/storage.service';
import { EmailService } from '../email/email.service';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { decideSubjectCase, openSubjectCase } from '../support/subject-cases';
import { PlanConfigService, subscriptionStatus } from '../subscription/plan-config.service';
import { BRANDING_SPACE_SELECT, resolveSpaceBranding } from '../white-label/branding.util';
import { SPACE_DOMAINS_ORPHANED } from '../white-label/white-label.service';
import {
  CreateSpaceDto,
  UpdateSpaceDto,
  UpdateSpaceStatusDto,
  CreateSpaceStatusRequestDto,
  ReviewSpaceStatusRequestDto,
  CreateSpaceOwnershipRequestDto,
  ReviewSpaceOwnershipRequestDto,
  CreateEventRequestDto,
} from './dto';
import {
  CreateSubSpaceRequestDto,
  ReviewSubSpaceRequestDto,
  SubSpaceRequestType,
  SUB_SPACE_LABELS,
} from './dto/sub-space-request.dto';
import {
  BillingCycle,
  OrgPlan,
  PaymentStatus,
  EventStatus,
  Prisma,
  RoleCode,
  SpaceStatus,
  SupportCaseKind,
  SupportDesk,
  SpaceVisibility,
  SlugKind,
} from '@prisma/client';
import { assertEventSchedule } from '../events/event-dates';
import { idForOldSlug, rememberOldSlug } from '../common/slug-history';
import { assertCanViewSpace, isSpaceLive, visibleSpacesWhere } from './space-access';
import { isPlatformAdmin } from '../events/event-access';
import { SPACE_ADMIN_ROLE_CODES } from '../auth/authorization';
import { emailFilter, sameEmail } from '../auth/identifiers';
import { button, esc, greet, h1, note, p, SPACE_APP, strong } from '../email/layout';

/** Deepest sub-space level the analytics walk follows (J10 cycle bound). */
const MAX_SPACE_DEPTH = 20;

@Injectable()
export class SpacesService {
  private readonly logger = new Logger(SpacesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly emailService: EmailService,
    private readonly configService: ConfigService,
    private readonly planConfig: PlanConfigService,
    private readonly events?: EventEmitter2,
  ) {}

  /**
   * Create a new space
   */
  async createSpace(dto: CreateSpaceDto, createdBy: string) {
    // Check if slug is already taken
    const existing = await this.prisma.space.findUnique({
      where: { slug: dto.slug },
    });

    if (existing) {
      throw new ConflictException('Space slug is already taken');
    }

    const space = await this.prisma.space.create({
      data: {
        name: dto.name,
        slug: dto.slug,
        description: dto.description,
        websiteUrl: dto.websiteUrl,
        city: dto.city,
        state: dto.state,
        country: dto.country,
        tags: dto.tags || [],
        visibility: dto.visibility || SpaceVisibility.PUBLIC,
        coCuratorLimit: dto.coCuratorLimit || 5,
        createdBy,
        status: SpaceStatus.PENDING,
        submittedAt: new Date(),
      },
      include: {
        creator: {
          select: {
            id: true,
            fullName: true,
            username: true,
            mobileNumber: true,
          },
        },
      },
    });

    // P0.2: every space owns its billing. A directly-created space is a PENDING
    // draft (not billable yet), so mint its STARTER row best-effort — the admin
    // edit / lazy paths self-heal if this ever fails.
    await this.prisma.orgSubscription
      .create({
        data: {
          spaceId: space.id,
          plan: OrgPlan.STARTER,
          billingCycle: BillingCycle.MONTHLY,
          isActive: true,
          usageResetAt: SpacesService.nextMonthStart(),
        },
      })
      .catch((err) =>
        this.logger.error(
          `Failed to mint STARTER subscription for space ${space.id}`,
          err,
        ),
      );

    // Send notification to admin (non-blocking)
    const adminEmail = this.configService.get<string>('ADMIN_EMAIL');
    if (adminEmail) {
      this.emailService.sendNewSpaceSubmittedToAdmin({
        adminEmail,
        spaceName: space.name,
        organizerName: space.creator.fullName || space.creator.username || 'Unknown',
        organizerMobile: space.creator.mobileNumber,
        spaceDescription: space.description || undefined,
        submittedAt: (space.submittedAt ?? new Date()).toLocaleString('en-US', {
          timeZone: 'Asia/Kolkata',
          month: 'long',
          day: 'numeric',
          year: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        }),
      }).catch(err => this.logger.error('Failed to send new space notification email', err));
    }

    return space;
  }

  /**
   * Get all spaces with filters
   */
  async getAllSpaces(params: {
    page?: number;
    limit?: number;
    status?: SpaceStatus;
    visibility?: SpaceVisibility;
    search?: string;
    parentId?: string;
    viewerId?: string;
  }) {
    const { page = 1, limit = 10, status, visibility, search, parentId, viewerId } = params;
    const skip = (page - 1) * limit;

    // Private spaces only list for their members (platform admins see all).
    const where: any = (await isPlatformAdmin(this.prisma, viewerId))
      ? {}
      : { AND: [visibleSpacesWhere(viewerId)] };

    if (status) {
      where.status = status;
    }

    if (visibility) {
      where.visibility = visibility;
    }

    
    if (parentId) { where.parentSpaceId = parentId; }
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { slug: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [spaces, total] = await Promise.all([
      this.prisma.space.findMany({
        where,
        skip,
        take: limit,
        include: {
          creator: {
            select: {
              id: true,
              fullName: true,
              username: true,
            },
          },
          _count: {
            select: {
              userRoles: true,
              events: { where: NOT_DELETED },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.space.count({ where }),
    ]);

    const publicSpaces = spaces.map((space: any) => {
      const {
        approvedBy,
        rejectionReason,
        requestedParentId,
        parentRequestPending,
        plan,
        planActivatedAt,
        planExpiresAt,
        coCuratorLimit,
        verifiedBy,
        brandingSuspendedAt, // internal branding state, never public
        emailFromName,
        emailReplyTo,
        ...publicSpace
      } = space;
      return publicSpace;
    });

    return {
      spaces: publicSpaces,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get space by ID
   */
  /**
   * Just the banner URL, behind the same visibility rule as getSpaceById
   * (private spaces: members only). For the palette route, which doesn't need
   * the full space payload.
   */
  async getSpaceBannerUrl(id: string, userId?: string): Promise<string | null> {
    const space = await this.prisma.space.findUnique({
      where: { id },
      select: { id: true, visibility: true, status: true, bannerUrl: true },
    });
    if (!space) {
      throw new NotFoundException('Space not found');
    }
    await assertCanViewSpace(this.prisma, space, userId);
    return space.bannerUrl;
  }

  async getSpaceById(id: string, userId?: string) {
    const space = await this.prisma.space.findUnique({
      where: { id },
      include: {
        // Space's own plan (per-space billing), for the white-label gate.
        // Stripped from the response below.
        subscription: true,
        domains: BRANDING_SPACE_SELECT.domains,
        creator: {
          select: {
            id: true,
            fullName: true,
            username: true,
            avatarUrl: true,
          },
        },
        parentSpace: {
          select: {
            id: true,
            name: true,
            slug: true,
            type: true,
          },
        },
        // Only what the response uses: the admin team and my own role. Loading
        // every membership with its user made a big space's page O(members).
        userRoles: {
          where: {
            OR: [
              { role: { code: { in: [...SPACE_ADMIN_ROLE_CODES] } } },
              ...(userId ? [{ userId }] : []),
            ],
          },
          include: {
            user: {
              select: {
                id: true,
                fullName: true,
                username: true,
                avatarUrl: true,
              },
            },
            role: true,
          },
        },
        _count: {
          select: {
            userRoles: true,
            events: { where: NOT_DELETED },
            childSpaces: true,
          },
        },
      },
    });

    if (!space) {
      throw new NotFoundException('Space not found');
    }
    await assertCanViewSpace(this.prisma, space, userId);

    const requesterRole = userId
      ? (space.userRoles.find((ur: any) => ur.userId === userId) || null)
      : null;
    // Flatten to { id, code, name } so clients get the same shape as
    // GET /users/me/spaces (the role code lives on the joined `role`).
    const userRole = requesterRole?.role
      ? {
          id: requesterRole.role.id,
          code: requesterRole.role.code,
          name: requesterRole.role.name,
        }
      : null;

    // Expose the space-admin team (Space Admins + legacy organisers) publicly so
    // clients can display them. Only admin-tier roles are surfaced; regular
    // members are not. Keyed off the shared tier so a renamed code can never
    // silently drop the space's actual admin from the team list.
    const organisers = space.userRoles
      .filter((ur: any) => SPACE_ADMIN_ROLE_CODES.includes(ur.role?.code))
      .map((ur: any) => ({
        id: ur.id,
        user: ur.user,
        role: ur.role,
        createdAt: ur.createdAt,
      }));

    // Attendee-facing team: the Curators and Co-Curators of the space's
    // public events, one row per person (Curator wins). Same rule as an
    // event's "Curated by": Space Admins and Crew are never surfaced.
    const curatorRoles = await this.prisma.userRole.findMany({
      where: {
        role: { code: { in: [RoleCode.CURATOR, RoleCode.CO_CURATOR] } },
        event: {
          spaceId: id,
          ...NOT_DELETED,
          status: { in: [EventStatus.PUBLISHED, EventStatus.ONGOING, EventStatus.COMPLETED] },
        },
      },
      orderBy: { createdAt: 'asc' },
      take: 200,
      select: {
        user: { select: { id: true, fullName: true, username: true, avatarUrl: true } },
        role: { select: { code: true } },
      },
    });
    const teamById = new Map<string, { id: string; fullName: string | null; username: string | null; avatarUrl: string | null; roleCode: RoleCode }>();
    for (const r of curatorRoles) {
      const seen = teamById.get(r.user.id);
      if (!seen || (seen.roleCode !== RoleCode.CURATOR && r.role.code === RoleCode.CURATOR))
        teamById.set(r.user.id, { ...r.user, roleCode: r.role.code });
    }
    const team = [...teamById.values()];

    // Attendee-facing theme: switched on, plan has the perk, not suspended
    // (see resolveSpaceBranding). getSpaceBySlug returns this same payload.
    const subscription = (space as any).subscription ?? null;
    const hasRemoveBranding = subscription
      ? this.planConfig.getEffectiveLimits(subscription).hasRemoveBranding
      : false;
    const branding = resolveSpaceBranding(space as any, hasRemoveBranding);

    // Strip internal/sensitive fields and the raw member-role list before returning publicly.
    // Only the requester's own role (userRole), the organiser and curator teams, and aggregate counts are exposed.
    const {
      userRoles,
      approvedBy,
      rejectionReason,
      requestedParentId,
      parentRequestPending,
      plan,
      planActivatedAt,
      planExpiresAt,
      coCuratorLimit,
      verifiedBy,
      subscription: _sub, // pulled only for the plan gate; never exposed publicly
      brandingSuspendedAt, // internal; `branding` already reflects it
      emailFromName,
      emailReplyTo,
      domains, // surfaced as branding.customDomain
      ...publicSpace
    } = space as any;

    return { ...publicSpace, userRole, organisers, team, branding };
  }

  /**
   * Get space by slug
   */
  async getSpaceBySlug(slug: string, viewerId?: string) {
    // A renamed space: its old slug resolves to the space (B16); the client sees
    // the new slug in the payload and can redirect to it.
    const live = await this.prisma.space.findUnique({ where: { slug }, select: { id: true } });
    const id = live?.id ?? (await idForOldSlug(this.prisma, SlugKind.SPACE, slug));
    if (!id) throw new NotFoundException('Space not found');
    // Same payload as by id, so a space opened by slug still carries my role
    // (Join/Leave) and the team (G12).
    return this.getSpaceById(id, viewerId);
  }

  /**
   * Update space
   */
  async updateSpace(id: string, dto: UpdateSpaceDto, actorId: string) {
    const space = await this.prisma.space.findUnique({ where: { id } });

    if (!space) {
      throw new NotFoundException('Space not found');
    }

    // Structure and limits are Unifesto's call (J10): a Space Admin goes
    // through the reviewed sub-space request flow instead.
    if (
      (dto.type !== undefined || dto.parentSpaceId !== undefined || dto.coCuratorLimit !== undefined) &&
      !(await isPlatformAdmin(this.prisma, actorId))
    ) {
      throw new ForbiddenException('Only Unifesto can change a space type, parent or co-curator limit');
    }
    this.logger.log(`parentSpace: ${JSON.stringify((space as any).parentSpace)}`);

    // Space hierarchy rules:
    //  - Only SUPER spaces can be a parent (have children).
    //  - Both SUPER and REGULAR spaces may be a sub-space, but only of a SUPER.
    //  - Every space has at most one parent.
    // A space keeps its parent when converting to SUPER — a SUPER space is
    // allowed to be a sub-space of another SUPER space.
    if (dto.parentSpaceId) {
      const parentSpace = await this.prisma.space.findUnique({ where: { id: dto.parentSpaceId } });
      if (!parentSpace) throw new NotFoundException('Parent space not found');
      if (parentSpace.id === space.id) {
        throw new BadRequestException('A space cannot be its own parent.');
      }
      if (parentSpace.type !== 'SUPER') {
        throw new BadRequestException('A parent space must be a SUPER space. A REGULAR space cannot be a parent.');
      }
      await this.assertNoHierarchyCycle(space.id, parentSpace.parentSpaceId);
    }

    // A space that has children (is a parent) must remain SUPER — it cannot be
    // converted back to REGULAR while it still has sub-spaces.
    if (dto.type === 'REGULAR') {
      const childCount = await this.prisma.space.count({ where: { parentSpaceId: space.id } });
      if (childCount > 0) {
        throw new BadRequestException('Remove all child spaces before converting this space to REGULAR.');
      }
    }

    // Check slug uniqueness if being changed
    if (dto.slug && dto.slug !== space.slug) {
      const existing = await this.prisma.space.findUnique({
        where: { slug: dto.slug },
      });

      if (existing) {
        throw new ConflictException('Space slug is already taken');
      }
    }

    // Verification vouches for the name it was granted under; a rename needs a
    // fresh admin check.
    const renamed = dto.name !== undefined && dto.name.trim() !== space.name;

    // Keep the old slug resolving, so shared links and QR codes survive (B16).
    if (dto.slug && dto.slug !== space.slug) {
      await rememberOldSlug(this.prisma, SlugKind.SPACE, space.slug, id);
    }

    const updatedSpace = await this.prisma.space.update({
      where: { id },
      data: {
        name: dto.name,
        slug: dto.slug,
        ...(renamed ? { verifiedAt: null, verifiedBy: null } : {}),
        description: dto.description,
        websiteUrl: dto.websiteUrl,
        city: dto.city,
        state: dto.state,
        country: dto.country,
        tags: dto.tags,
        visibility: dto.visibility,
        coCuratorLimit: dto.coCuratorLimit,
        type: dto.type,
        ...(dto.parentSpaceId !== undefined ? { parentSpaceId: dto.parentSpaceId } : {}),
      },
      include: {
        creator: {
          select: {
            id: true,
            fullName: true,
            username: true,
          },
        },
      },
    });

    return updatedSpace;
  }

  /**
   * Update space status (approve/reject). No first-party client calls this
   * (Apex uses AdminService.approveSpace / rejectSpace, which tell the creator
   * through notify()), so it sends nothing.
   */
  async updateSpaceStatus(
    id: string,
    dto: UpdateSpaceStatusDto,
    approvedBy: string,
  ) {
    const space = await this.prisma.space.findUnique({ where: { id } });

    if (!space) {
      throw new NotFoundException('Space not found');
    }
    this.logger.log(`parentSpace: ${JSON.stringify((space as any).parentSpace)}`);

    const updateData: any = {
      status: dto.status,
    };

    if (dto.status === SpaceStatus.APPROVED) {
      updateData.approvedAt = new Date();
      updateData.approvedBy = approvedBy;
      updateData.rejectedAt = null;
      updateData.rejectionReason = null;
    } else if (dto.status === SpaceStatus.REJECTED) {
      updateData.rejectedAt = new Date();
      updateData.rejectionReason = dto.rejectionReason;
      updateData.approvedAt = null;
      updateData.approvedBy = null;
    }

    const updatedSpace = await this.prisma.space.update({
      where: { id },
      data: updateData,
    });

    return updatedSpace;
  }

  /**
   * Permanently delete a space (ADMIN only). Every event and session under it
   * goes, with their free registrations and tickets; it is refused while any
   * money was taken (money rows' keys RESTRICT, see deleteWithoutMoney). It cannot be undone, so the Apex UI gates it behind a
   * typed confirmation.
   *
   * A SUPER space with sub-spaces is refused: the self-relation has no cascade,
   * so a raw delete would fail with an opaque FK error — we surface a clear one
   * instead and make the admin detach the children first.
   */
  async deleteSpace(id: string) {
    const space = await this.prisma.space.findUnique({
      where: { id },
      include: { _count: { select: { childSpaces: true } } },
    });

    if (!space) {
      throw new NotFoundException('Space not found');
    }

    if (space._count.childSpaces > 0) {
      throw new BadRequestException(
        'This space has sub-spaces. Detach or delete them before deleting this space.',
      );
    }

    // Read before the cascade removes them: their Resend/Cloudflare objects
    // must go too, or a dangling CNAME is left claimable (H25).
    const domains = await this.prisma.spaceDomain.findMany({
      where: { spaceId: id },
      select: { kind: true, hostname: true, providerId: true },
    });

    // Payments, refunds and payouts under the space are kept: refused while any exist.
    await deleteWithoutMoney(
      this.prisma,
      { event: { spaceId: id }, session: { spaceId: id } },
      'This space has payment, refund or payout records and cannot be deleted.',
      (tx) => tx.space.delete({ where: { id } }),
    );
    if (domains.length) this.events?.emit(SPACE_DOMAINS_ORPHANED, domains);

    return { message: 'Space deleted successfully' };
  }

  /**
   * Upload space logo
   */
  async uploadLogo(id: string, file: Express.Multer.File) {
    const space = await this.prisma.space.findUnique({ where: { id } });

    if (!space) {
      throw new NotFoundException('Space not found');
    }
    this.logger.log(`parentSpace: ${JSON.stringify((space as any).parentSpace)}`);

    // Upload to S3 using StorageService
    const logoUrl = await this.storageService.uploadFile(
      file,
      'space-logos/',
      id,
    );

    await this.prisma.space.update({
      where: { id },
      data: { logoUrl },
    });

    return { logoUrl };
  }

  /**
   * Upload space banner
   */
  async uploadBanner(id: string, file: Express.Multer.File) {
    const space = await this.prisma.space.findUnique({ where: { id } });

    if (!space) {
      throw new NotFoundException('Space not found');
    }
    this.logger.log(`parentSpace: ${JSON.stringify((space as any).parentSpace)}`);

    // Upload to S3 using StorageService
    const bannerUrl = await this.storageService.uploadFile(
      file,
      'space-banners/',
      id,
    );

    await this.prisma.space.update({
      where: { id },
      data: { bannerUrl },
    });

    return { bannerUrl };
  }

  /**
   * Get space members with roles
   */
  async getSpaceMembers(
    spaceId: string,
    options: {
      page?: number;
      limit?: number;
      search?: string;
      roleCode?: RoleCode;
    } = {},
  ) {
    const space = await this.prisma.space.findUnique({
      where: { id: spaceId },
    });

    if (!space) {
      throw new NotFoundException('Space not found');
    }

    const page = Math.max(1, options.page ?? 1);
    const limit = Math.min(100, Math.max(1, options.limit ?? 20));
    const search = options.search?.trim();

    // `eventId: null` keeps the roster to space-level memberships only. Without
    // it, event-scoped grants (Curator / Co-Curator / Crew on an event in this
    // space) would leak into the space members list.
    const where: any = {
      spaceId,
      eventId: null,
      // One row per person: a MEMBER grant is implied by any higher space
      // role, so hide it when the user also holds one (else the owner lists
      // twice, as Member and Space Admin).
      NOT: {
        role: { code: RoleCode.MEMBER },
        user: {
          roles: {
            some: { spaceId, eventId: null, role: { code: { not: RoleCode.MEMBER } } },
          },
        },
      },
    };
    if (options.roleCode) {
      where.role = { code: options.roleCode };
    }
    if (search) {
      // Email is not a scalar on User — it lives on the related UserIdentity
      // rows — so it must be matched through the relation, not `user.email`
      // (which does not exist and makes Prisma throw).
      where.user = {
        OR: [
          { fullName: { contains: search, mode: 'insensitive' } },
          { username: { contains: search, mode: 'insensitive' } },
          {
            identities: {
              some: { email: { contains: search, mode: 'insensitive' } },
            },
          },
        ],
      };
    }

    const [members, total] = await Promise.all([
      this.prisma.userRole.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              fullName: true,
              username: true,
              avatarUrl: true,
              identities: {
                where: { isPrimary: true },
                select: { email: true },
                take: 1,
              },
            },
          },
          role: true,
        },
        orderBy: [{ role: { code: 'asc' } }, { createdAt: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.userRole.count({ where }),
    ]);

    return {
      members,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Search users who can be added to a space (excludes existing members).
   * Available to platform admins and Space Admins of the space.
   */
  async searchAddableUsers(spaceId: string, search?: string) {
    const space = await this.prisma.space.findUnique({
      where: { id: spaceId },
      select: { id: true },
    });
    if (!space) {
      throw new NotFoundException('Space not found');
    }

    const term = search?.trim();
    if (!term || term.length < 2) {
      return { users: [] };
    }

    const existing = await this.prisma.userRole.findMany({
      where: { spaceId },
      select: { userId: true },
    });
    const excludeIds = existing.map((e) => e.userId);
    // Email only by exact match: substring search let any space admin harvest
    // platform users' addresses (S24). ILIKE treats `_`/`%` as wildcards, so
    // `%%` would still match every address: resolve exact hits first.
    const emailUserIds = term.includes('@')
      ? (
          await this.prisma.userIdentity.findMany({
            where: { email: emailFilter(term) },
            select: { userId: true, email: true },
            take: 50,
          })
        )
          .filter((i) => sameEmail(i.email, term))
          .map((i) => i.userId)
      : [];

    const users = await this.prisma.user.findMany({
      where: {
        id: { notIn: excludeIds.length ? excludeIds : undefined },
        OR: [
          { fullName: { contains: term, mode: 'insensitive' } },
          { username: { contains: term, mode: 'insensitive' } },
          ...(emailUserIds.length ? [{ id: { in: emailUserIds } }] : []),
        ],
      },
      select: {
        id: true,
        fullName: true,
        username: true,
        avatarUrl: true,
        identities: {
          where: { isPrimary: true },
          select: { email: true },
          take: 1,
        },
      },
      take: 10,
      orderBy: { fullName: 'asc' },
    });

    return { users: users.map((u) => maskSearchEmail(u, term)) };
  }

  /**
   * Space roles whose holder runs the space (can manage members). The canonical
   * (and only) admin code is SPACE_ADMIN.
   */
  private static readonly SPACE_ADMIN_TIER: RoleCode[] = [RoleCode.SPACE_ADMIN];

  /** Space roles a Space Admin may assign/change/remove. Flat admin model: an
   * admin can manage other admins and members (the creator stays protected in
   * the update/remove guards). */
  private static readonly MANAGEABLE_SPACE_ROLES: RoleCode[] = [
    RoleCode.SPACE_ADMIN,
    RoleCode.MEMBER,
  ];

  private manageableRolesFor(
    isAdmin: boolean,
    actorRoleCode: RoleCode | null,
  ): RoleCode[] {
    const isSpaceAdmin =
      !!actorRoleCode &&
      SpacesService.SPACE_ADMIN_TIER.includes(actorRoleCode);
    if (isAdmin || isSpaceAdmin) {
      return [...SpacesService.MANAGEABLE_SPACE_ROLES];
    }
    return [];
  }

  /** Resolve the acting user's tier within a space (admin flag + space role). */
  private async resolveActor(spaceId: string, actingUserId: string) {
    const roles = await this.prisma.userRole.findMany({
      where: { userId: actingUserId },
      include: { role: true },
    });
    const isAdmin = roles.some((r) => r.role.code === RoleCode.ADMIN);
    const spaceRole =
      roles.find((r) => r.spaceId === spaceId)?.role.code ?? null;
    return { isAdmin, spaceRole };
  }

  /**
   * Add a member to a space with a specific role. The acting user must be a
   * platform admin or a Space Admin, and may only assign manageable roles.
   */
  async addSpaceMember(
    spaceId: string,
    actingUserId: string,
    userId: string,
    roleCode: RoleCode,
  ) {
    const space = await this.prisma.space.findUnique({
      where: { id: spaceId },
    });
    if (!space) {
      throw new NotFoundException('Space not found');
    }

    const { isAdmin, spaceRole } = await this.resolveActor(
      spaceId,
      actingUserId,
    );
    const allowed = this.manageableRolesFor(isAdmin, spaceRole);
    if (!allowed.includes(roleCode)) {
      throw new ForbiddenException(
        'You are not allowed to assign this role in this space',
      );
    }

    const role = await this.prisma.role.findFirst({
      where: { code: roleCode, scope: 'SPACE' },
    });
    if (!role) {
      throw new NotFoundException(`Role ${roleCode} not found`);
    }

    const targetUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!targetUser) {
      throw new NotFoundException('User not found');
    }

    const existing = await this.prisma.userRole.findFirst({
      where: { userId, spaceId },
    });
    if (existing) {
      throw new ConflictException('User is already a member of this space');
    }

    const userRole = await this.prisma.userRole.create({
      data: { userId, roleId: role.id, spaceId, assignedBy: actingUserId },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            username: true,
            avatarUrl: true,
            identities: {
              where: { isPrimary: true },
              select: { email: true },
              take: 1,
            },
          },
        },
        role: true,
      },
    });

    return { message: 'Member added', member: userRole };
  }

  /**
   * Update a member's role within a space. Enforces the acting user's tier for
   * both the member's current role and the requested role.
   */
  async updateSpaceMemberRole(
    spaceId: string,
    userRoleId: string,
    actingUserId: string,
    roleCode: RoleCode,
  ) {
    const space = await this.prisma.space.findUnique({
      where: { id: spaceId },
    });
    if (!space) {
      throw new NotFoundException('Space not found');
    }

    const membership = await this.prisma.userRole.findUnique({
      where: { id: userRoleId },
      include: { role: true },
    });
    if (!membership || membership.spaceId !== spaceId) {
      throw new NotFoundException('Member not found in this space');
    }

    const { isAdmin, spaceRole } = await this.resolveActor(
      spaceId,
      actingUserId,
    );
    const allowed = this.manageableRolesFor(isAdmin, spaceRole);
    // Must be allowed to manage both the current role and the target role.
    if (
      !allowed.includes(membership.role.code) ||
      !allowed.includes(roleCode)
    ) {
      throw new ForbiddenException(
        'You are not allowed to change this member’s role',
      );
    }

    if (membership.role.code === roleCode) {
      return { message: 'No change', member: membership };
    }

    // Prevent demoting the space creator (accountable payer) below admin.
    if (
      space.createdBy === membership.userId &&
      !SpacesService.SPACE_ADMIN_TIER.includes(roleCode)
    ) {
      throw new BadRequestException(
        'The space creator must remain a Space Admin',
      );
    }

    const role = await this.prisma.role.findFirst({
      where: { code: roleCode, scope: 'SPACE' },
    });
    if (!role) {
      throw new NotFoundException(`Role ${roleCode} not found`);
    }

    const updated = await this.prisma.userRole.update({
      where: { id: userRoleId },
      data: { roleId: role.id, assignedBy: actingUserId },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            username: true,
            avatarUrl: true,
            identities: {
              where: { isPrimary: true },
              select: { email: true },
              take: 1,
            },
          },
        },
        role: true,
      },
    });

    return { message: 'Member role updated', member: updated };
  }

  /**
   * Remove a member from a space. The acting user must be permitted to manage
   * the member's current role tier.
   */
  async removeSpaceMember(
    spaceId: string,
    userRoleId: string,
    actingUserId: string,
  ) {
    const space = await this.prisma.space.findUnique({
      where: { id: spaceId },
    });
    if (!space) {
      throw new NotFoundException('Space not found');
    }

    const membership = await this.prisma.userRole.findUnique({
      where: { id: userRoleId },
      include: { role: true },
    });
    if (!membership || membership.spaceId !== spaceId) {
      throw new NotFoundException('Member not found in this space');
    }

    if (space.createdBy === membership.userId) {
      throw new BadRequestException(
        'The space creator cannot be removed from the space',
      );
    }

    const { isAdmin, spaceRole } = await this.resolveActor(
      spaceId,
      actingUserId,
    );
    const allowed = this.manageableRolesFor(isAdmin, spaceRole);
    if (!allowed.includes(membership.role.code)) {
      throw new ForbiddenException(
        'You are not allowed to remove this member',
      );
    }

    await this.prisma.userRole.delete({ where: { id: userRoleId } });

    return { message: 'Member removed' };
  }

  /**
   * Join a space (become a member)
   */
  async joinSpace(spaceId: string, userId: string) {
    // Check if space exists and is active
    const space = await this.prisma.space.findUnique({
      where: { id: spaceId },
    });

    if (!space) {
      throw new NotFoundException('Space not found');
    }
    this.logger.log(`parentSpace: ${JSON.stringify((space as any).parentSpace)}`);

    if (!isSpaceLive(space.status)) {
      throw new BadRequestException('Space is not active');
    }

    // Private spaces are invite-only: a Space Admin adds members via
    // POST /spaces/:id/members. Same 404 an outsider gets when viewing it.
    if (space.visibility === SpaceVisibility.PRIVATE) {
      throw new NotFoundException('Space not found');
    }

    // Check if user is already a member
    const existingMember = await this.prisma.userRole.findFirst({
      where: {
        userId,
        spaceId,
      },
    });

    if (existingMember) {
      throw new ConflictException('You are already a member of this space');
    }

    // Get the MEMBER role for this space
    const memberRole = await this.prisma.role.findFirst({
      where: {
        code: 'MEMBER',
        scope: 'SPACE',
      },
    });

    if (!memberRole) {
      throw new NotFoundException('Member role not found');
    }

    // Add user as a member
    const userRole = await this.prisma.userRole.create({
      data: {
        userId,
        roleId: memberRole.id,
        spaceId,
      },
      include: {
        role: true,
        space: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });

    return {
      message: 'Successfully joined the space',
      userRole,
    };
  }

  /**
   * Leave a space (remove membership)
   */
  async leaveSpace(spaceId: string, userId: string) {
    // Check if space exists
    const space = await this.prisma.space.findUnique({
      where: { id: spaceId },
    });

    if (!space) {
      throw new NotFoundException('Space not found');
    }
    this.logger.log(`parentSpace: ${JSON.stringify((space as any).parentSpace)}`);

    // Check if user is a member
    const membership = await this.prisma.userRole.findFirst({
      where: {
        userId,
        spaceId,
      },
      include: {
        role: true,
      },
    });

    if (!membership) {
      throw new NotFoundException('You are not a member of this space');
    }

    // Don't allow space creator to leave
    if (space.createdBy === userId) {
      throw new BadRequestException('Space creator cannot leave the space');
    }

    // Remove membership
    await this.prisma.userRole.delete({
      where: { id: membership.id },
    });

    return {
      message: 'Successfully left the space',
    };
  }
  /**
   * Mark a space as verified (run by, or with the permission of, the
   * organisation it is named after) or clear it. Platform admins only.
   */
  async setSpaceVerification(id: string, verified: boolean, adminId: string) {
    const space = await this.prisma.space.findUnique({ where: { id }, select: { id: true } });
    if (!space) {
      throw new NotFoundException('Space not found');
    }
    return this.prisma.space.update({
      where: { id },
      data: verified
        ? { verifiedAt: new Date(), verifiedBy: adminId }
        : { verifiedAt: null, verifiedBy: null },
      select: { id: true, verifiedAt: true },
    });
  }

  async createSpaceRequest(userId: string, dto: any) {
    // Check if user already has a pending request
    const existing = await this.prisma.spaceRequest.findFirst({
      where: { userId, status: 'PENDING' },
    });

    if (existing) {
      throw new BadRequestException('You already have a pending space request');
    }

    const request = await this.prisma.spaceRequest.create({
      data: {
        userId,
        name: dto.name,
        description: dto.description,
        type: dto.type || 'REGULAR',
        visibility: dto.visibility || 'PUBLIC',
        city: dto.city,
        state: dto.state,
        country: 'India',
        tags: dto.tags || [],
        websiteUrl: dto.websiteUrl,
        requesterRole: dto.requesterRole?.trim() || null,
        authorityConfirmedAt: dto.authorityConfirmed ? new Date() : null,
        status: 'PENDING',
      },
    });

    openSubjectCase(this.events, {
      subjectType: 'SpaceRequest',
      subjectId: request.id,
      requesterId: userId,
      kind: SupportCaseKind.REQUEST,
      requestType: 'SPACE',
      desk: SupportDesk.PLATFORM,
      subject: `Space request: ${request.name}`,
      message: request.description?.trim() || `I'd like to create ${request.name} on Unifesto.`,
    });
    return request;
  }

  async getMySpaceRequests(userId: string) {
    return this.prisma.spaceRequest.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get all space requests (ADMIN) - optionally filtered by status
   */
  async getAllSpaceRequests(status?: string) {
    return this.prisma.spaceRequest.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            username: true,
            mobileNumber: true,
            avatarUrl: true,
            // Verified email, so the reviewer can match it against the
            // organisation's domain before approving.
            identities: {
              where: { email: { not: null }, emailVerified: true },
              select: { email: true },
              orderBy: { isPrimary: 'desc' },
            },
          },
        },
      },
    });
  }

  /**
   * Approve a space request (ADMIN)
   * Creates the Space (ACTIVE) and grants the requester the SPACE_ADMIN role
   * scoped to the new space, all within a single transaction.
   */
  async approveSpaceRequest(requestId: string, adminId: string) {
    const req = await this.prisma.spaceRequest.findUnique({
      where: { id: requestId },
    });
    if (!req) {
      throw new NotFoundException('Space request not found');
    }
    if (req.status !== 'PENDING') {
      throw new BadRequestException('Request has already been reviewed');
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const space = await this.createApprovedSpace(
        tx,
        {
          name: req.name,
          description: req.description,
          type: req.type,
          visibility: req.visibility,
          city: req.city,
          state: req.state,
          country: req.country,
          tags: req.tags ?? [],
          websiteUrl: req.websiteUrl,
          submittedAt: req.createdAt,
        },
        req.userId,
        adminId,
      );
      await tx.spaceRequest.update({
        where: { id: requestId },
        data: { status: 'APPROVED', reviewedBy: adminId },
      });
      return space;
    });
    decideSubjectCase(this.events, {
      subjectType: 'SpaceRequest',
      subjectId: requestId,
      actorId: adminId,
      approved: true,
      what: `the space request. ${created.name} is live`,
    });
    return created;
  }

  /**
   * An ACTIVE space run by `ownerId`, inside the caller's transaction: the
   * space, the owner's SPACE_ADMIN role on it and a STARTER plan. Space and
   * event requests both approve through this.
   */
  private async createApprovedSpace(
    tx: Prisma.TransactionClient,
    data: Omit<Prisma.SpaceUncheckedCreateInput, 'slug' | 'status' | 'approvedAt' | 'approvedBy' | 'createdBy'>,
    ownerId: string,
    adminId: string,
  ) {
    // Build a unique slug from the name
    const baseSlug = data.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    const slug = `${baseSlug || 'space'}-${Date.now().toString(36)}`;

    const space = await tx.space.create({
      data: {
        ...data,
        slug,
        status: SpaceStatus.ACTIVE,
        approvedAt: new Date(),
        approvedBy: adminId,
        createdBy: ownerId,
      },
    });

    // Grant SPACE_ADMIN role (space-scoped) to the owner: they now run it.
    const spaceAdminRole = await tx.role.findUnique({
      where: { code: RoleCode.SPACE_ADMIN },
    });
    if (spaceAdminRole) {
      await tx.userRole.create({
        data: {
          userId: ownerId,
          roleId: spaceAdminRole.id,
          spaceId: space.id,
          assignedBy: adminId,
        },
      });
    }

    // P0.2: every space owns its billing. Mint a STARTER subscription in the
    // same transaction so an approved (ACTIVE) space always has a plan row.
    await tx.orgSubscription.create({
      data: {
        spaceId: space.id,
        plan: OrgPlan.STARTER,
        billingCycle: BillingCycle.MONTHLY,
        isActive: true,
        usageResetAt: SpacesService.nextMonthStart(),
      },
    });

    return space;
  }

  /** First day of next month, midnight — the monthly usage reset boundary. */
  private static nextMonthStart(): Date {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  /**
   * Reject a space request (ADMIN)
   */
  async rejectSpaceRequest(
    requestId: string,
    adminId: string,
    reviewNote?: string,
  ) {
    const req = await this.prisma.spaceRequest.findUnique({
      where: { id: requestId },
    });
    if (!req) {
      throw new NotFoundException('Space request not found');
    }
    if (req.status !== 'PENDING') {
      throw new BadRequestException('Request has already been reviewed');
    }

    const rejected = await this.prisma.spaceRequest.update({
      where: { id: requestId },
      data: { status: 'REJECTED', reviewedBy: adminId, reviewNote },
    });
    decideSubjectCase(this.events, {
      subjectType: 'SpaceRequest',
      subjectId: requestId,
      actorId: adminId,
      approved: false,
      what: 'the space request',
      note: reviewNote,
    });
    return rejected;
  }

  // =====================================================
  // EVENT REQUESTS (Assist D7)
  // Someone without a space asks to host one event. Each
  // request is a REQUEST case on the Platform desk; approval
  // makes them a personal space and the event as a DRAFT.
  // =====================================================

  async createEventRequest(userId: string, dto: CreateEventRequestDto) {
    const [runsSpace, pending] = await Promise.all([
      this.prisma.userRole.findFirst({
        where: { userId, eventId: null, spaceId: { not: null }, role: { code: { in: [...SPACE_ADMIN_ROLE_CODES] } } },
        select: { id: true },
      }),
      this.prisma.eventRequest.findFirst({ where: { userId, status: 'PENDING' }, select: { id: true } }),
    ]);
    if (runsSpace) {
      throw new BadRequestException('You already run a space. Create the event from it.');
    }
    if (pending) {
      throw new BadRequestException('You already have an event request under review');
    }

    const start = new Date(dto.startDateTime);
    const end = new Date(dto.endDateTime);
    assertEventSchedule(start, end, 'Asia/Kolkata');
    if (start.getTime() < Date.now()) {
      throw new BadRequestException('The event has to start in the future.');
    }

    const req = await this.prisma.eventRequest.create({
      data: {
        userId,
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        type: dto.type,
        startDateTime: start,
        endDateTime: end,
        city: dto.city?.trim() || null,
      },
    });

    const when = (d: Date) =>
      d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
    openSubjectCase(this.events, {
      subjectType: 'EventRequest',
      subjectId: req.id,
      requesterId: userId,
      kind: SupportCaseKind.REQUEST,
      requestType: 'EVENT',
      desk: SupportDesk.PLATFORM,
      subject: `Event request: ${req.title}`,
      message: [
        `I'd like to host "${req.title}" on Unifesto.`,
        `When: ${when(start)} to ${when(end)}`,
        req.city ? `Where: ${req.city}` : null,
        req.description,
      ]
        .filter(Boolean)
        .join('\n'),
      notify: true,
    });
    return req;
  }

  /**
   * Approve an event request (ADMIN): a personal space run by the requester
   * (same as an approved space request) and the event in it as a DRAFT, in
   * one transaction.
   */
  async approveEventRequest(requestId: string, adminId: string) {
    const req = await this.prisma.eventRequest.findUnique({
      where: { id: requestId },
      include: { user: { select: { fullName: true, username: true } } },
    });
    if (!req) {
      throw new NotFoundException('Event request not found');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      // Claim it first so two reviewers can't make two spaces.
      const claimed = await tx.eventRequest.updateMany({
        where: { id: requestId, status: 'PENDING' },
        data: { status: 'APPROVED', reviewedBy: adminId },
      });
      if (!claimed.count) {
        throw new BadRequestException('Request has already been reviewed');
      }
      const space = await this.createApprovedSpace(
        tx,
        {
          name: req.user.fullName?.trim() || req.user.username || 'My space',
          city: req.city,
          submittedAt: req.createdAt,
        },
        req.userId,
        adminId,
      );
      const event = await tx.event.create({
        data: {
          title: req.title,
          slug: `${slugify(req.title, { lower: true, strict: true })}-${Math.random().toString(36).substring(2, 8)}`,
          description: req.description,
          type: req.type,
          startDateTime: req.startDateTime,
          endDateTime: req.endDateTime,
          city: req.city,
          spaceId: space.id,
          createdBy: req.userId,
        },
      });
      return tx.eventRequest.update({
        where: { id: requestId },
        data: { spaceId: space.id, eventId: event.id },
      });
    });

    decideSubjectCase(this.events, {
      subjectType: 'EventRequest',
      subjectId: requestId,
      actorId: adminId,
      approved: true,
      what: `the event request. Your space and a draft of "${req.title}" are ready to set up in the Space app`,
      notify: true,
    });
    return result;
  }

  /** Reject an event request (ADMIN), with the reason the requester sees. */
  async rejectEventRequest(requestId: string, adminId: string, reviewNote?: string) {
    const note = reviewNote?.trim() || null;
    const { count } = await this.prisma.eventRequest.updateMany({
      where: { id: requestId, status: 'PENDING' },
      data: { status: 'REJECTED', reviewedBy: adminId, reviewNote: note },
    });
    if (!count) {
      const exists = await this.prisma.eventRequest.findUnique({ where: { id: requestId }, select: { id: true } });
      throw exists
        ? new BadRequestException('Request has already been reviewed')
        : new NotFoundException('Event request not found');
    }
    decideSubjectCase(this.events, {
      subjectType: 'EventRequest',
      subjectId: requestId,
      actorId: adminId,
      approved: false,
      what: 'the event request',
      note,
      notify: true,
    });
    return this.prisma.eventRequest.findUnique({ where: { id: requestId } });
  }

  // =====================================================
  // SPACE STATUS REQUESTS
  // Organisers request a status change for their space;
  // admins approve or reject from Apex.
  // =====================================================

  async createSpaceStatusRequest(userId: string, dto: CreateSpaceStatusRequestDto) {
    // Verify user owns or manages this space
    const space = await this.prisma.space.findUnique({
      where: { id: dto.spaceId },
    });
    if (!space) throw new NotFoundException('Space not found');
    if (space.createdBy !== userId) throw new ForbiddenException('Not your space');

    // Check no pending request exists
    const existing = await this.prisma.spaceStatusRequest.findFirst({
      where: { spaceId: dto.spaceId, status: 'PENDING' },
    });
    if (existing)
      throw new ConflictException(
        'A pending status request already exists for this space',
      );

    // Validate the requested transition
    const allowedTransitions: Record<string, string[]> = {
      ACTIVE: ['INACTIVE'],
      INACTIVE: ['ACTIVE'],
      SUSPENDED: ['ACTIVE'],
      ARCHIVED: ['ACTIVE'], // restoration appeal
    };
    const allowed = allowedTransitions[space.status] || [];
    if (!allowed.includes(dto.requestedStatus)) {
      throw new BadRequestException(
        `Cannot request ${dto.requestedStatus} from current status ${space.status}`,
      );
    }

    const statusReq = await this.prisma.spaceStatusRequest.create({
      data: {
        spaceId: dto.spaceId,
        requestedBy: userId,
        currentStatus: space.status,
        requestedStatus: dto.requestedStatus,
        reason: dto.reason,
        status: 'PENDING',
      },
      include: {
        space: { select: { id: true, name: true, slug: true } },
        user: { select: { id: true, fullName: true, username: true } },
      },
    });
    openSubjectCase(this.events, {
      subjectType: 'SpaceStatusRequest',
      subjectId: statusReq.id,
      requesterId: userId,
      kind: SupportCaseKind.REQUEST,
      requestType: 'SPACE_STATUS',
      desk: SupportDesk.PLATFORM,
      spaceId: dto.spaceId,
      subject: `Make ${space.name} ${dto.requestedStatus.toLowerCase()}`,
      message: dto.reason?.trim() || `Please change ${space.name} from ${space.status} to ${dto.requestedStatus}.`,
    });
    return statusReq;
  }

  async getMySpaceStatusRequests(userId: string, spaceId?: string) {
    return this.prisma.spaceStatusRequest.findMany({
      where: {
        requestedBy: userId,
        ...(spaceId ? { spaceId } : {}),
      },
      include: {
        space: { select: { id: true, name: true, slug: true, status: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getAllSpaceStatusRequests(status?: string, page = 1, limit = 20) {
    const where = status ? { status } : {};
    const [requests, total] = await Promise.all([
      this.prisma.spaceStatusRequest.findMany({
        where,
        include: {
          space: {
            select: {
              id: true,
              name: true,
              slug: true,
              status: true,
              logoUrl: true,
            },
          },
          user: {
            select: {
              id: true,
              fullName: true,
              username: true,
              mobileNumber: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.spaceStatusRequest.count({ where }),
    ]);
    return {
      requests,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async reviewSpaceStatusRequest(
    requestId: string,
    adminId: string,
    dto: ReviewSpaceStatusRequestDto,
  ) {
    const req = await this.prisma.spaceStatusRequest.findUnique({
      where: { id: requestId },
      include: {
        space: true,
        user: {
          include: {
            identities: { where: { email: { not: null } }, take: 1 },
          },
        },
      },
    });
    if (!req) throw new NotFoundException('Request not found');
    if (req.status !== 'PENDING')
      throw new BadRequestException('Request already reviewed');

    // Update request
    const updated = await this.prisma.spaceStatusRequest.update({
      where: { id: requestId },
      data: {
        status: dto.status,
        reviewNote: dto.reviewNote || null,
        reviewedBy: adminId,
        reviewedAt: new Date(),
      },
    });

    // If approved, apply the status change
    if (dto.status === 'APPROVED') {
      await this.prisma.space.update({
        where: { id: req.spaceId },
        data: { status: req.requestedStatus as any },
      });
    }

    // Send email notification
    const email = req.user.identities[0]?.email;
    if (email) {
      const approved = dto.status === 'APPROVED';
      this.emailService
        .sendRawEmail(
          email,
          approved
            ? `${req.space.name} is now ${req.requestedStatus}`
            : `Status change for ${req.space.name} not approved`,
          h1(approved ? 'Status change approved' : 'Status change not approved') +
            greet(req.user.fullName || req.user.username) +
            p(`Your request to change ${strong(req.space.name)} to ${strong(req.requestedStatus)} was ${approved ? 'approved' : 'not approved'}.`) +
            (dto.reviewNote ? note(`${approved ? 'Note from Unifesto' : 'Reason'}: ${esc(dto.reviewNote)}`, approved ? 'neutral' : 'danger') : '') +
            button('Open my space', `${SPACE_APP}/dashboard`),
        )
        .catch(() => {});
    }

    decideSubjectCase(this.events, {
      subjectType: 'SpaceStatusRequest',
      subjectId: requestId,
      actorId: adminId,
      approved: dto.status === 'APPROVED',
      what: `the change to ${req.requestedStatus.toLowerCase()}`,
      note: dto.reviewNote,
    });
    return updated;
  }

  // =====================================================
  // OWNERSHIP TRANSFER REQUESTS
  // =====================================================

  /**
   * The creator asks to hand the space to another member.
   *
   * Ownership is not a role, so it cannot go through the member-role editor —
   * that path explicitly refuses to move the creator (see
   * `updateSpaceMemberRole`). It also decides who the space bills to and who
   * has final say over it, which is why it lands with an admin instead of
   * taking effect immediately.
   */
  async createSpaceOwnershipRequest(
    userId: string,
    dto: CreateSpaceOwnershipRequestDto,
  ) {
    const space = await this.prisma.space.findUnique({
      where: { id: dto.spaceId },
    });
    if (!space) throw new NotFoundException('Space not found');

    // Only the current owner may give the space away. An organiser who is not
    // the creator must not be able to transfer it out from under them.
    if (space.createdBy !== userId) {
      throw new ForbiddenException(
        'Only the space creator can transfer ownership',
      );
    }
    if (dto.newOwnerId === userId) {
      throw new BadRequestException('You already own this space');
    }

    const existing = await this.prisma.spaceOwnershipRequest.findFirst({
      where: { spaceId: dto.spaceId, status: 'PENDING' },
    });
    if (existing) {
      throw new ConflictException(
        'An ownership transfer for this space is already awaiting review',
      );
    }

    await this.assertTransferTargetEligible(dto.spaceId, dto.newOwnerId);

    const handover = await this.prisma.spaceOwnershipRequest.create({
      data: {
        spaceId: dto.spaceId,
        requestedBy: userId,
        newOwnerId: dto.newOwnerId,
        reason: dto.reason,
        status: 'PENDING',
      },
      include: {
        space: { select: { id: true, name: true, slug: true } },
        requester: { select: { id: true, fullName: true, username: true } },
        newOwner: { select: { id: true, fullName: true, username: true } },
      },
    });
    openSubjectCase(this.events, {
      subjectType: 'SpaceOwnershipRequest',
      subjectId: handover.id,
      requesterId: userId,
      kind: SupportCaseKind.REQUEST,
      requestType: 'SPACE_OWNERSHIP',
      desk: SupportDesk.PLATFORM,
      spaceId: dto.spaceId,
      subject: `Hand ${space.name} to ${handover.newOwner.fullName || handover.newOwner.username || 'a member'}`,
      message: dto.reason?.trim() || `Please make ${handover.newOwner.fullName || handover.newOwner.username} the owner of ${space.name}.`,
    });
    return handover;
  }

  /**
   * The incoming owner must be a member of the space.
   *
   * Checked both when the request is made and again at approval: membership can
   * lapse in between, and handing a space to someone who has since left would
   * leave it owned by an outsider.
   */
  private async assertTransferTargetEligible(
    spaceId: string,
    newOwnerId: string,
  ) {
    const target = await this.prisma.user.findUnique({
      where: { id: newOwnerId },
      select: { id: true },
    });
    if (!target) throw new NotFoundException('That user does not exist');

    const membership = await this.prisma.userRole.findFirst({
      // `eventId: null` restricts this to space-level membership. A UserRole
      // row with an eventId is an event-scoped assignment (e.g. VOLUNTEER on
      // one event) — that does not make someone a member of the space, and
      // must not qualify them to own it.
      where: { userId: newOwnerId, spaceId, eventId: null },
    });
    if (!membership) {
      throw new BadRequestException(
        'You can only transfer ownership to someone who is already a member of this space',
      );
    }
  }

  /** Ownership requests raised by this user, or for one of their spaces. */
  async getMySpaceOwnershipRequests(userId: string, spaceId?: string) {
    return this.prisma.spaceOwnershipRequest.findMany({
      where: {
        // Both sides of the handover should be able to see it.
        OR: [{ requestedBy: userId }, { newOwnerId: userId }],
        ...(spaceId ? { spaceId } : {}),
      },
      include: {
        space: { select: { id: true, name: true, slug: true, logoUrl: true } },
        requester: { select: { id: true, fullName: true, username: true } },
        newOwner: { select: { id: true, fullName: true, username: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getAllSpaceOwnershipRequests(status?: string, page = 1, limit = 20) {
    const where = status ? { status } : {};
    const [requests, total] = await Promise.all([
      this.prisma.spaceOwnershipRequest.findMany({
        where,
        include: {
          space: {
            select: { id: true, name: true, slug: true, logoUrl: true },
          },
          requester: {
            select: {
              id: true,
              fullName: true,
              username: true,
              mobileNumber: true,
            },
          },
          newOwner: {
            select: {
              id: true,
              fullName: true,
              username: true,
              mobileNumber: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.spaceOwnershipRequest.count({ where }),
    ]);
    return {
      requests,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Admin decision on a transfer. Approving moves `createdBy`, makes sure the new
   * owner holds Space Admin and keeps the outgoing creator on as Space Admin, all
   * in one transaction — a space must never be left with no owner or two.
   */
  async reviewSpaceOwnershipRequest(
    requestId: string,
    adminId: string,
    dto: ReviewSpaceOwnershipRequestDto,
  ) {
    const req = await this.prisma.spaceOwnershipRequest.findUnique({
      where: { id: requestId },
      include: {
        space: true,
        requester: {
          include: {
            identities: { where: { email: { not: null } }, take: 1 },
          },
        },
        newOwner: {
          include: {
            identities: { where: { email: { not: null } }, take: 1 },
          },
        },
      },
    });
    if (!req) throw new NotFoundException('Request not found');
    if (req.status !== 'PENDING') {
      throw new BadRequestException('Request already reviewed');
    }

    if (dto.status === 'APPROVED') {
      // Ownership may have moved by other means since the request was raised.
      if (req.space.createdBy !== req.requestedBy) {
        throw new BadRequestException(
          'This space is no longer owned by the person who requested the transfer',
        );
      }
      await this.assertTransferTargetEligible(req.spaceId, req.newOwnerId);
      await this.applyOwnershipTransfer(
        req.spaceId,
        req.requestedBy,
        req.newOwnerId,
        adminId,
      );
    }

    const updated = await this.prisma.spaceOwnershipRequest.update({
      where: { id: requestId },
      data: {
        status: dto.status,
        reviewNote: dto.reviewNote || null,
        reviewedBy: adminId,
        reviewedAt: new Date(),
      },
    });

    this.notifyOwnershipDecision(req, dto).catch(() => {});
    decideSubjectCase(this.events, {
      subjectType: 'SpaceOwnershipRequest',
      subjectId: requestId,
      actorId: adminId,
      approved: dto.status === 'APPROVED',
      what: 'the handover',
      note: dto.reviewNote,
    });

    return updated;
  }

  /**
   * Moves ownership atomically: the space's `createdBy`, the new owner's role,
   * and the outgoing owner's demotion all land together or not at all.
   *
   * Both parties end as Space Admins in the flat admin model — the transfer
   * only moves `createdBy` (ownership + the creator's protected status). The
   * outgoing owner keeps working access; handing over a society rarely means
   * the outgoing head stops helping.
   */
  private async applyOwnershipTransfer(
    spaceId: string,
    oldOwnerId: string,
    newOwnerId: string,
    adminId: string,
  ) {
    const spaceAdminRole = await this.prisma.role.findFirst({
      where: { code: RoleCode.SPACE_ADMIN, scope: 'SPACE' },
    });
    if (!spaceAdminRole) {
      throw new NotFoundException(
        'Space roles are not configured; cannot transfer ownership',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.space.update({
        where: { id: spaceId },
        data: { createdBy: newOwnerId },
      });

      // Both updates are scoped with `eventId: null` to hit only the
      // space-level membership row. Without it they would also rewrite any
      // event-scoped assignments these users hold in this space, silently
      // turning per-event helpers into space admins — and colliding with the
      // [userId, roleId, spaceId, eventId] unique index if two such rows
      // collapsed onto the same role.

      // The incoming owner is guaranteed to have a space-level row (checked
      // above); ensure it is a Space Admin.
      await tx.userRole.updateMany({
        where: { userId: newOwnerId, spaceId, eventId: null },
        data: { roleId: spaceAdminRole.id, assignedBy: adminId },
      });

      // The outgoing owner loses ownership + creator's protected status but
      // stays a Space Admin so they can keep helping run the space.
      await tx.userRole.updateMany({
        where: { userId: oldOwnerId, spaceId, eventId: null },
        data: { roleId: spaceAdminRole.id, assignedBy: adminId },
      });
    });

    this.logger.log(
      `Space ${spaceId} ownership transferred ${oldOwnerId} -> ${newOwnerId} by admin ${adminId}`,
    );
  }

  /** Emails both sides of the handover with the outcome. */
  private async notifyOwnershipDecision(
    req: {
      space: { id: string; name: string };
      requester: { fullName: string | null; username: string | null; identities: { email: string | null }[] };
      newOwner: { fullName: string | null; username: string | null; identities: { email: string | null }[] };
    },
    dto: ReviewSpaceOwnershipRequestDto,
  ) {
    const approved = dto.status === 'APPROVED';
    const reason = dto.reviewNote
      ? note(`${approved ? 'Note from Unifesto' : 'Reason'}: ${esc(dto.reviewNote)}`)
      : '';

    const send = (email: string | null | undefined, subject: string, body: string) => {
      if (!email) return;
      this.emailService
        .sendRawEmail(email, subject, body + reason + button('Open my space', `${SPACE_APP}/dashboard`))
        .catch(() => {});
    };

    const requesterName = req.requester.fullName || req.requester.username || 'there';
    const newOwnerName = req.newOwner.fullName || req.newOwner.username || 'there';

    if (approved) {
      send(
        req.requester.identities[0]?.email,
        `${req.space.name} has a new owner`,
        h1('Handover approved') +
          greet(requesterName) +
          p(`${strong(req.space.name)} now belongs to ${esc(newOwnerName)}. You stay on as a Space Admin.`),
      );
      send(
        req.newOwner.identities[0]?.email,
        `You now own ${req.space.name}`,
        h1("You're the owner now") +
          greet(newOwnerName) +
          p(`${esc(requesterName)} handed ${strong(req.space.name)} to you and Unifesto approved it. The space bills to your account and you have full control of it.`),
      );
    } else {
      send(
        req.requester.identities[0]?.email,
        `Handover of ${req.space.name} not approved`,
        h1('Handover not approved') +
          greet(requesterName) +
          p(`Your request to hand ${strong(req.space.name)} to ${esc(newOwnerName)} wasn't approved. Nothing has changed.`),
      );
    }
  }

  // =====================================================
  // SUB-SPACE REQUESTS
  // =====================================================

  /**
   * Cycle guard: walking up from `ancestorId` (the future parent's own parent)
   * must never reach `spaceId`, or re-parenting `spaceId` would form a loop.
   */
  private async assertNoHierarchyCycle(spaceId: string, ancestorId: string | null) {
    const visited = new Set<string>();
    while (ancestorId) {
      if (ancestorId === spaceId) {
        throw new BadRequestException(
          'This assignment would create a cycle in the space hierarchy',
        );
      }
      if (visited.has(ancestorId)) break;
      visited.add(ancestorId);
      const ancestor = await this.prisma.space.findUnique({
        where: { id: ancestorId },
        select: { parentSpaceId: true },
      });
      ancestorId = ancestor?.parentSpaceId ?? null;
    }
  }

  /**
   * Create a sub-space request (authenticated users)
   */
  async createSubSpaceRequest(userId: string, dto: CreateSubSpaceRequestDto) {
    const { requestType, subSpaceId, targetSpaceId, reason } = dto;

    // Only someone who runs one of the spaces involved may ask (Unifesto still reviews it).
    const runsOne =
      (await isPlatformAdmin(this.prisma, userId)) ||
      (await this.prisma.userRole.count({
        where: {
          userId,
          eventId: null,
          spaceId: { in: [targetSpaceId, subSpaceId].filter((id): id is string => !!id) },
          role: { code: { in: [...SPACE_ADMIN_ROLE_CODES] } },
        },
      })) > 0;
    if (!runsOne) {
      throw new ForbiddenException('Only a Space Admin of one of these spaces can ask for this');
    }

    // Validate target space exists
    const targetSpace = await this.prisma.space.findUnique({
      where: { id: targetSpaceId },
    });
    if (!targetSpace) {
      throw new NotFoundException('Target space not found');
    }

    // Request types that operate on a sub-space (assignment or removal).
    const typesNeedingSubSpace = [
      SubSpaceRequestType.JOIN_SUPER,
      SubSpaceRequestType.CONVERT_AND_JOIN,
      SubSpaceRequestType.REMOVE_CHILD,
      SubSpaceRequestType.REMOVE_PARENT,
    ];
    // Request types that only operate on the target space itself.
    const isSelfConversion =
      requestType === SubSpaceRequestType.CONVERT_TO_SUPER ||
      requestType === SubSpaceRequestType.CONVERT_TO_REGULAR;

    if (typesNeedingSubSpace.includes(requestType)) {
      if (!subSpaceId) {
        throw new BadRequestException(
          'subSpaceId is required for this request type',
        );
      }
      const subSpace = await this.prisma.space.findUnique({
        where: { id: subSpaceId },
      });
      if (!subSpace) {
        throw new NotFoundException('Sub-space not found');
      }
      if (subSpaceId === targetSpaceId) {
        throw new BadRequestException(
          'A space cannot be a sub-space of itself',
        );
      }

      // Assignment requests: the sub-space must be free (no existing parent).
      if (
        requestType === SubSpaceRequestType.JOIN_SUPER ||
        requestType === SubSpaceRequestType.CONVERT_AND_JOIN
      ) {
        if (subSpace.parentSpaceId) {
          throw new ConflictException(
            'This space already belongs to a super space',
          );
        }

        await this.assertNoHierarchyCycle(subSpaceId, targetSpace.parentSpaceId);
      }

      // Removal requests: the sub-space must currently be a child of target.
      if (
        requestType === SubSpaceRequestType.REMOVE_CHILD ||
        requestType === SubSpaceRequestType.REMOVE_PARENT
      ) {
        if (subSpace.parentSpaceId !== targetSpaceId) {
          throw new BadRequestException(
            'This space is not a child of the target super space',
          );
        }
      }
    }

    // Validate requestType against the target space's current type
    if (requestType === SubSpaceRequestType.JOIN_SUPER) {
      if (targetSpace.type !== 'SUPER') {
        throw new BadRequestException(
          'Target space is not a SUPER space; use CONVERT_AND_JOIN instead',
        );
      }
    } else if (requestType === SubSpaceRequestType.CONVERT_AND_JOIN) {
      if (targetSpace.type === 'SUPER') {
        throw new BadRequestException(
          'Target space is already a SUPER space; use JOIN_SUPER instead',
        );
      }
    } else if (requestType === SubSpaceRequestType.CONVERT_TO_SUPER) {
      if (targetSpace.type === 'SUPER') {
        throw new BadRequestException('Target space is already a SUPER space');
      }
    } else if (requestType === SubSpaceRequestType.CONVERT_TO_REGULAR) {
      if (targetSpace.type !== 'SUPER') {
        throw new BadRequestException('Target space is already a REGULAR space');
      }
      // A super space can only be converted back once all children are removed.
      const childCount = await this.prisma.space.count({
        where: { parentSpaceId: targetSpaceId },
      });
      if (childCount > 0) {
        throw new ConflictException(
          'Remove all child spaces before converting this space back to REGULAR',
        );
      }
    }

    // (isSelfConversion is documented above for readers; no extra branch needed.)
    void isSelfConversion;

    // Prevent duplicate pending requests
    const existing = await this.prisma.subSpaceRequest.findFirst({
      where: {
        targetSpaceId,
        subSpaceId: subSpaceId ?? null,
        requestType,
        status: 'PENDING',
      },
    });
    if (existing) {
      throw new ConflictException(
        'A pending request already exists for this combination',
      );
    }

    const subReq = await this.prisma.subSpaceRequest.create({
      data: {
        requestType,
        subSpaceId: subSpaceId ?? null,
        targetSpaceId,
        requestedBy: userId,
        reason,
      },
      include: {
        subSpace: { select: { id: true, name: true, slug: true } },
        targetSpace: { select: { id: true, name: true, slug: true } },
      },
    });
    openSubjectCase(this.events, {
      subjectType: 'SubSpaceRequest',
      subjectId: subReq.id,
      requesterId: userId,
      kind: SupportCaseKind.REQUEST,
      requestType: 'SUB_SPACE',
      desk: SupportDesk.PLATFORM,
      spaceId: targetSpaceId,
      subject: `${SUB_SPACE_LABELS[requestType]}: ${subReq.targetSpace.name}`,
      message: reason?.trim() || `${SUB_SPACE_LABELS[requestType]} for ${subReq.targetSpace.name}${subReq.subSpace ? ` and ${subReq.subSpace.name}` : ''}.`,
    });
    return subReq;
  }

  /**
   * Get the current user's sub-space requests
   */
  async getMySubSpaceRequests(userId: string) {
    return this.prisma.subSpaceRequest.findMany({
      where: { requestedBy: userId },
      orderBy: { createdAt: 'desc' },
      include: {
        subSpace: { select: { id: true, name: true, slug: true } },
        targetSpace: { select: { id: true, name: true, slug: true } },
      },
    });
  }

  /**
   * Get all sub-space requests (ADMIN only)
   */
  async getAllSubSpaceRequests(status?: string, page = 1, limit = 20) {
    const where = status ? { status } : {};
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.prisma.subSpaceRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          subSpace: { select: { id: true, name: true, slug: true, type: true, logoUrl: true } },
          targetSpace: { select: { id: true, name: true, slug: true, type: true, logoUrl: true } },
          user: {
            select: {
              id: true,
              fullName: true,
              username: true,
              mobileNumber: true,
              identities: { select: { email: true } },
            },
          },
        },
      }),
      this.prisma.subSpaceRequest.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Review (approve/reject) a sub-space request (ADMIN only).
   * On approval, applies the requested space-type / parent-space changes.
   */
  async reviewSubSpaceRequest(
    id: string,
    reviewerId: string,
    dto: ReviewSubSpaceRequestDto,
  ) {
    const request = await this.prisma.subSpaceRequest.findUnique({
      where: { id },
      include: {
        subSpace: true,
        targetSpace: true,
        user: {
          select: {
            id: true,
            fullName: true,
            username: true,
            identities: { select: { email: true } },
          },
        },
      },
    });
    if (!request) {
      throw new NotFoundException('Sub-space request not found');
    }
    if (request.status !== 'PENDING') {
      throw new BadRequestException('This request has already been reviewed');
    }

    const approved = dto.status === 'APPROVED';

    const updated = await this.prisma.$transaction(async (tx) => {
      const reviewed = await tx.subSpaceRequest.update({
        where: { id },
        data: {
          status: dto.status,
          reviewNote: dto.reviewNote ?? null,
          reviewedBy: reviewerId,
          reviewedAt: new Date(),
        },
      });

      if (approved) {
        switch (request.requestType) {
          case SubSpaceRequestType.CONVERT_TO_SUPER: {
            // Convert the target space to SUPER (no assignment).
            await tx.space.update({
              where: { id: request.targetSpaceId },
              data: { type: 'SUPER' },
            });
            break;
          }
          case SubSpaceRequestType.CONVERT_AND_JOIN: {
            // Convert the target to SUPER, then attach the sub-space.
            await tx.space.update({
              where: { id: request.targetSpaceId },
              data: { type: 'SUPER' },
            });
            if (request.subSpaceId) {
              await tx.space.update({
                where: { id: request.subSpaceId },
                data: { parentSpaceId: request.targetSpaceId },
              });
            }
            break;
          }
          case SubSpaceRequestType.JOIN_SUPER: {
            // Attach the sub-space to the already-SUPER target.
            if (request.subSpaceId) {
              await tx.space.update({
                where: { id: request.subSpaceId },
                data: { parentSpaceId: request.targetSpaceId },
              });
            }
            break;
          }
          case SubSpaceRequestType.REMOVE_CHILD:
          case SubSpaceRequestType.REMOVE_PARENT: {
            // Detach the child from its parent.
            if (request.subSpaceId) {
              await tx.space.update({
                where: { id: request.subSpaceId },
                data: { parentSpaceId: null },
              });
            }
            break;
          }
          case SubSpaceRequestType.CONVERT_TO_REGULAR: {
            // Guard again inside the transaction: only convert when childless.
            const childCount = await tx.space.count({
              where: { parentSpaceId: request.targetSpaceId },
            });
            if (childCount > 0) {
              throw new ConflictException(
                'This space still has child spaces and cannot be converted to REGULAR',
              );
            }
            await tx.space.update({
              where: { id: request.targetSpaceId },
              data: { type: 'REGULAR' },
            });
            break;
          }
        }
      }

      return reviewed;
    });

    // Notify requester (fire-and-forget)
    const email = request.user.identities[0]?.email;
    if (email) {
      const name =
        request.user.fullName || request.user.username || 'there';
      this.emailService
        .sendRawEmail(
          email,
          `Your sub-space request was ${approved ? 'approved' : 'not approved'}`,
          h1(approved ? 'Sub-space request approved' : 'Sub-space request not approved') +
            greet(name) +
            p(`Your request about ${strong(request.targetSpace.name)} was ${approved ? 'approved' : 'not approved'}.`) +
            (dto.reviewNote ? note(`${approved ? 'Note' : 'Reason'}: ${esc(dto.reviewNote)}`) : ''),
        )
        .catch(() => {});
    }
    decideSubjectCase(this.events, {
      subjectType: 'SubSpaceRequest',
      subjectId: id,
      actorId: reviewerId,
      approved,
      what: 'the request',
      note: dto.reviewNote,
    });

    return updated;
  }

  /**
   * Aggregated analytics for a space and its entire sub-space subtree
   * (children + grandchildren + …). Intended for organisers of a parent
   * (SUPER) space to see the rolled-up activity of everything beneath it.
   *
   * Access is enforced by @Can(space:view) at the controller (Space Admin of
   * `:id` — incl. legacy organisers — or platform ADMIN via inheritance).
   */
  /**
   * The space's plan as the backend enforces it (T3): status and limits from
   * getEffectiveLimits, so an EXPIRED plan reports Starter's features. Null when
   * the space has no subscription yet; plan gates don't apply then.
   */
  async getPlanAccess(spaceId: string) {
    const sub = await this.prisma.orgSubscription.findUnique({ where: { spaceId } });
    if (!sub) return null;
    const {
      platformFeePercent: _fee,
      monthlyPrice: _monthly,
      annualPrice: _annual,
      spaces, eventsPerMonth, attendeesPerEvent, ticketTypes, coCurators,
      ...features
    } = this.planConfig.getEffectiveLimits(sub);
    return {
      plan: sub.plan,
      billingModel: sub.billingModel,
      status: subscriptionStatus(sub),
      features,
      limits: { spaces, eventsPerMonth, attendeesPerEvent, ticketTypes, coCurators },
    };
  }

  async getSubspaceAnalytics(id: string) {
    const root = await this.prisma.space.findUnique({
      where: { id },
      select: { id: true, name: true, slug: true, type: true },
    });
    if (!root) {
      throw new NotFoundException('Space not found');
    }

    // Walk the whole subtree with a recursive CTE. `depth` is the number of
    // hops from the root (direct sub-spaces = 1, sub-sub-spaces = 2, …). The
    // root itself is excluded from the descendant set.
    // A bad row could still form a loop, so the walk carries its path and
    // never revisits a space, stops at MAX_SPACE_DEPTH, and runs under a
    // statement timeout (J10).
    const descendants = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL statement_timeout = '5s'`;
      return tx.$queryRaw<
        Array<{
          id: string;
          name: string;
          slug: string;
          type: string;
          status: string;
          parent_space_id: string | null;
          depth: number;
        }>
      >(Prisma.sql`
        WITH RECURSIVE subtree AS (
          SELECT id, name, slug, type, status, parent_space_id, 1 AS depth, ARRAY[${id}::uuid, id] AS path
          FROM spaces
          WHERE parent_space_id = ${id}::uuid AND id <> ${id}::uuid
          UNION ALL
          SELECT s.id, s.name, s.slug, s.type, s.status, s.parent_space_id, st.depth + 1, st.path || s.id
          FROM spaces s
          JOIN subtree st ON s.parent_space_id = st.id
          WHERE st.depth < ${MAX_SPACE_DEPTH} AND s.id <> ALL(st.path)
        )
        SELECT id, name, slug, type, status, parent_space_id, depth
        FROM subtree
      `);
    });

    const descendantIds = descendants.map((d) => d.id);

    // Empty subtree — return a well-formed, zeroed payload so the client can
    // render an "no sub-spaces yet" state without special-casing.
    if (descendantIds.length === 0) {
      return {
        space: root,
        totals: {
          subSpaces: 0,
          maxDepth: 0,
          members: 0,
          events: 0,
          upcomingEvents: 0,
          registrations: 0,
        },
        eventsByStatus: {},
        subSpaces: [],
      };
    }

    const now = new Date();

    // Aggregate across the whole subtree in parallel. All counts are scoped to
    // the descendant space ids so nothing from unrelated spaces leaks in.
    const [
      memberGroups,
      eventGroups,
      upcomingEventGroups,
      registrationGroups,
      eventStatusGroups,
    ] = await Promise.all([
      this.prisma.userRole.groupBy({
        by: ['spaceId'],
        where: { spaceId: { in: descendantIds } },
        _count: { _all: true },
      }),
      this.prisma.event.groupBy({
        by: ['spaceId'],
        where: { spaceId: { in: descendantIds } },
        _count: { _all: true },
        _sum: { registeredCount: true },
      }),
      this.prisma.event.groupBy({
        by: ['spaceId'],
        where: {
          spaceId: { in: descendantIds },
          startDateTime: { gte: now },
          status: { notIn: ['CANCELLED', 'DRAFT'] },
        },
        _count: { _all: true },
      }),
      this.prisma.event.aggregate({
        where: { spaceId: { in: descendantIds } },
        _sum: { registeredCount: true },
      }),
      this.prisma.event.groupBy({
        by: ['status'],
        where: { spaceId: { in: descendantIds } },
        _count: { _all: true },
      }),
    ]);

    // Index the per-space aggregates for a quick join back onto the subtree.
    const memberBySpace = new Map(
      memberGroups.map((g) => [g.spaceId, g._count._all]),
    );
    const eventBySpace = new Map(
      eventGroups.map((g) => [g.spaceId, g._count._all]),
    );
    const registrationsBySpace = new Map(
      eventGroups.map((g) => [g.spaceId, g._sum.registeredCount ?? 0]),
    );
    const upcomingBySpace = new Map(
      upcomingEventGroups.map((g) => [g.spaceId, g._count._all]),
    );

    // Net revenue per space = PAID ticket revenue minus the app processing fee.
    // Refunds are excluded automatically (refunded registrations are no longer
    // PAID), matching the Finance page's net basis. Registrations are keyed by
    // event, so we map each event back to its space and accumulate.
    const revenueEvents = await this.prisma.event.findMany({
      where: { spaceId: { in: descendantIds } },
      select: { id: true, spaceId: true },
    });
    const eventToSpace = new Map(revenueEvents.map((e) => [e.id, e.spaceId]));
    const revenueGroups = revenueEvents.length
      ? await this.prisma.eventRegistration.groupBy({
          by: ['eventId'],
          where: {
            eventId: { in: revenueEvents.map((e) => e.id) },
            paymentStatus: PaymentStatus.PAID,
          },
          _sum: { totalAmount: true, processingFee: true },
        })
      : [];
    const revenueBySpace = new Map<string, number>();
    for (const g of revenueGroups) {
      const sid = eventToSpace.get(g.eventId);
      if (!sid) continue;
      const net =
        Number(g._sum.totalAmount ?? 0) - Number(g._sum.processingFee ?? 0);
      revenueBySpace.set(sid, (revenueBySpace.get(sid) ?? 0) + net);
    }

    const subSpaces = descendants
      .map((d) => ({
        id: d.id,
        name: d.name,
        slug: d.slug,
        type: d.type,
        status: d.status,
        parentSpaceId: d.parent_space_id,
        depth: Number(d.depth),
        members: memberBySpace.get(d.id) ?? 0,
        events: eventBySpace.get(d.id) ?? 0,
        upcomingEvents: upcomingBySpace.get(d.id) ?? 0,
        registrations: registrationsBySpace.get(d.id) ?? 0,
        revenue: Math.round((revenueBySpace.get(d.id) ?? 0) * 100) / 100,
      }))
      .sort((a, b) => a.depth - b.depth || a.name.localeCompare(b.name));

    const eventsByStatus = eventStatusGroups.reduce<Record<string, number>>(
      (acc, g) => {
        acc[g.status] = g._count._all;
        return acc;
      },
      {},
    );

    const totals = {
      subSpaces: subSpaces.length,
      maxDepth: subSpaces.reduce((m, s) => Math.max(m, s.depth), 0),
      members: subSpaces.reduce((sum, s) => sum + s.members, 0),
      events: subSpaces.reduce((sum, s) => sum + s.events, 0),
      upcomingEvents: subSpaces.reduce((sum, s) => sum + s.upcomingEvents, 0),
      registrations: registrationGroups._sum.registeredCount ?? 0,
      revenue:
        Math.round(subSpaces.reduce((sum, s) => sum + s.revenue, 0) * 100) / 100,
    };

    return {
      space: root,
      totals,
      eventsByStatus,
      subSpaces,
    };
  }
}


/**
 * Member search reveals a user's email only to someone who already typed it
 * exactly; name/username hits come back with an empty `identities` list.
 */
export function maskSearchEmail<
  T extends { identities: { email: string | null }[] },
>(user: T, term: string): T {
  const needle = term.trim().toLowerCase();
  return {
    ...user,
    identities: user.identities.filter(
      (i) => !!i.email && i.email.toLowerCase() === needle,
    ),
  };
}
