import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { UpdateProfileDto, UpdateNotificationSettingsDto } from './dto';
import { User, Prisma, EventStatus, GroupSeatStatus, RefundStatus } from '@prisma/client';
import { COUNTS_AS_ATTENDING } from '../common/attendance';
import {
  ACCOUNT_DELETION_GRACE_DAYS,
  DAY_MS,
  deletionDueAt,
  REDACTED_REFUND_REASON,
} from '../common/account-deletion';
import { UserProfileDto } from '../auth/dto';
import { StorageService } from '../storage/storage.service';
import { normalizeMobile } from '../leaderboard/hackathon.shared';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly storageService: StorageService,
  ) {}

  /**
   * Record the app version/platform the current user's client is running.
   * Called by the mobile app when a session becomes active. Best-effort and
   * idempotent — repeated reports of the same version just refresh the
   * last-reported timestamp so staff can see recency.
   */
  async updateMyAppVersion(
    userId: string,
    dto: { version: string; platform: string },
  ) {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        appVersion: dto.version,
        appPlatform: dto.platform,
        appVersionLastReportedAt: new Date(),
      },
    });
    return { success: true };
  }

  /**
   * Get all users with pagination (ADMIN only)
   */
  async getAllUsers(params: {
    page: number;
    limit: number;
    search?: string;
  }) {
    const { page, limit, search } = params;
    const skip = (page - 1) * limit;

    // Build where clause for search
    const where = search
      ? {
          OR: [
            { fullName: { contains: search, mode: 'insensitive' as const } },
            { username: { contains: search, mode: 'insensitive' as const } },
            { mobileNumber: { contains: search } },
            {
              identities: {
                some: {
                  email: { contains: search, mode: 'insensitive' as const },
                },
              },
            },
          ],
        }
      : {};

    // Fetch users with pagination
    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        include: {
          identities: {
            select: {
              id: true,
              provider: true,
              email: true,
              emailVerified: true,
              isPrimary: true,
            },
          },
          roles: {
            include: {
              role: true,
            },
          },
          pushDevices: { select: { linkedAt: true, optedIn: true } },
        },
        orderBy: {
          createdAt: 'desc',
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    // Transform users to include computed fields
    const transformedUsers = users.map((user) => ({
      id: user.id,
      mobileNumber: user.mobileNumber,
      mobileVerified: user.mobileVerified,
      username: user.username,
      fullName: user.fullName,
      avatarUrl: user.avatarUrl,
      bio: user.bio,
      linkedinUrl: user.linkedinUrl,
      instagramUrl: user.instagramUrl,
      githubUrl: user.githubUrl,
      websiteUrl: user.websiteUrl,
      appVersion: user.appVersion,
      appPlatform: user.appPlatform,
      appVersionLastReportedAt: user.appVersionLastReportedAt,
      lastSeenAt: user.lastSeenAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      email: user.identities.find((i) => i.email)?.email || null,
      emailVerified:
        user.identities.find((i) => i.email)?.emailVerified || false,
      roles: user.roles.map((ur) => ur.role.code),
      identitiesCount: user.identities.length,
      // Reachable = linked to external_id AND push permission on.
      pushDevices: {
        total: user.pushDevices.length,
        reachable: user.pushDevices.filter((d) => d.linkedAt && d.optedIn).length,
      },
    }));

    return {
      users: transformedUsers,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get user by ID (ADMIN only)
   */
  async getUserByIdAdmin(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        identities: {
          select: {
            id: true,
            provider: true,
            email: true,
            emailVerified: true,
            isPrimary: true,
            createdAt: true,
          },
        },
        roles: {
          include: {
            role: true,
            space: {
              select: {
                id: true,
                name: true,
                slug: true,
              },
            },
            assignedByUser: {
              select: {
                id: true,
                fullName: true,
                username: true,
              },
            },
          },
        },
        pushDevices: {
          orderBy: { lastSeenAt: 'desc' },
          select: {
            id: true,
            subscriptionId: true,
            platform: true,
            deviceModel: true,
            appVersion: true,
            optedIn: true,
            linkedAt: true,
            linkError: true,
            lastSeenAt: true,
            createdAt: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Transform user data
    return {
      user: {
        id: user.id,
        mobileNumber: user.mobileNumber,
        mobileVerified: user.mobileVerified,
        username: user.username,
        fullName: user.fullName,
        avatarUrl: user.avatarUrl,
        bio: user.bio,
        linkedinUrl: user.linkedinUrl,
        instagramUrl: user.instagramUrl,
        githubUrl: user.githubUrl,
        websiteUrl: user.websiteUrl,
        appVersion: user.appVersion,
        appPlatform: user.appPlatform,
        appVersionLastReportedAt: user.appVersionLastReportedAt,
        lastSeenAt: user.lastSeenAt,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        email: user.identities.find((i) => i.email)?.email || null,
        emailVerified:
          user.identities.find((i) => i.email)?.emailVerified || false,
        roles: user.roles.map((ur) => ({
          id: ur.id,
          code: ur.role.code,
          name: ur.role.name,
          scope: ur.role.scope,
          spaceId: ur.spaceId,
          spaceName: ur.space?.name ?? null,
          spaceSlug: ur.space?.slug ?? null,
          assignedBy: ur.assignedByUser,
          assignedAt: ur.createdAt,
        })),
        identities: user.identities,
        pushDevices: user.pushDevices,
      },
    };
  }

  /**
   * Update user by ID (ADMIN only)
   */
  async updateUserByIdAdmin(userId: string, dto: UpdateProfileDto) {
    // Check if username is being updated and is available
    if (dto.username) {
      const isAvailable = await this.isUsernameAvailable(dto.username, userId);
      if (!isAvailable) {
        throw new ConflictException('Username is already taken');
      }
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        username: dto.username,
        fullName: dto.fullName,
        bio: dto.bio,
        linkedinUrl: dto.linkedinUrl,
        instagramUrl: dto.instagramUrl,
        githubUrl: dto.githubUrl,
        websiteUrl: dto.websiteUrl,
      },
      include: {
        identities: {
          select: {
            id: true,
            provider: true,
            email: true,
            emailVerified: true,
            isPrimary: true,
          },
        },
        roles: {
          include: {
            role: true,
          },
        },
      },
    });

    return {
      user: {
        id: user.id,
        mobileNumber: user.mobileNumber,
        mobileVerified: user.mobileVerified,
        username: user.username,
        fullName: user.fullName,
        avatarUrl: user.avatarUrl,
        bio: user.bio,
        linkedinUrl: user.linkedinUrl,
        instagramUrl: user.instagramUrl,
        githubUrl: user.githubUrl,
        websiteUrl: user.websiteUrl,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        email: user.identities.find((i) => i.email)?.email || null,
        emailVerified:
          user.identities.find((i) => i.email)?.emailVerified || false,
        roles: user.roles.map((ur) => ur.role.code),
      },
      message: 'User updated successfully',
    };
  }

  /**
   * Get current user profile
   */
  async getMe(userId: string): Promise<UserProfileDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        roles: {
          include: {
            role: { select: { code: true, name: true } },
          },
        },
        referredBy: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return UserProfileDto.fromUser(user, (user as any).roles);
  }

  /**
   * Update current user profile
   */
  async updateMe(
    userId: string,
    dto: UpdateProfileDto,
  ): Promise<UserProfileDto> {
    // Check if username is being updated and is available
    if (dto.username) {
      const isAvailable = await this.isUsernameAvailable(dto.username, userId);
      if (!isAvailable) {
        throw new ConflictException('Username is already taken');
      }
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        username: dto.username,
        fullName: dto.fullName,
        bio: dto.bio,
        gender: dto.gender,
        linkedinUrl: dto.linkedinUrl,
        instagramUrl: dto.instagramUrl,
        githubUrl: dto.githubUrl,
        websiteUrl: dto.websiteUrl,
      },
    });

    return UserProfileDto.fromUser(user, (user as any).roles);
  }

  /**
   * Get user by username
   */
  async getUserByUsername(username: string): Promise<UserProfileDto> {
    const user = await this.prisma.user.findUnique({
      where: { username },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return UserProfileDto.fromUser(user, (user as any).roles);
  }

  /**
   * Check if username is available
   */
  async checkUsernameAvailability(
    username: string,
  ): Promise<{ available: boolean }> {
    const available = await this.isUsernameAvailable(username);
    return { available };
  }

  /**
   * Helper: Check if username is available
   */
  private async isUsernameAvailable(
    username: string,
    excludeUserId?: string,
  ): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { username },
    });

    if (!user) {
      return true;
    }

    // If excluding a user ID, check if it's the same user
    if (excludeUserId && user.id === excludeUserId) {
      return true;
    }

    return false;
  }

  /**
   * Upload avatar
   */
  async uploadAvatar(
    userId: string,
    file: Express.Multer.File,
  ): Promise<{ avatarUrl: string }> {
    this.logger.log(`Uploading avatar for user ${userId}`);

    // Upload to S3 using StorageService
    const avatarUrl = await this.storageService.uploadFile(
      file,
      'avatars/',
      userId,
    );

    this.logger.log(`Avatar uploaded successfully: ${avatarUrl}`);

    // Update user avatar URL
    await this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl },
    });

    return { avatarUrl };
  }

  /**
   * Admin: set (add or replace) a user's avatar from an uploaded file.
   *
   * Verifies the target exists first so we never upload an orphan object for a
   * user that isn't there, then best-effort deletes the object we replaced so
   * the bucket doesn't accumulate dead avatars.
   */
  async setUserAvatarAdmin(
    userId: string,
    file: Express.Multer.File,
  ): Promise<{ avatarUrl: string }> {
    const existing = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { avatarUrl: true },
    });
    if (!existing) {
      throw new NotFoundException('User not found');
    }

    const avatarUrl = await this.storageService.uploadFile(
      file,
      'avatars/',
      userId,
    );

    await this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl },
    });

    // Clean up the object we just replaced (no-op for external avatars).
    await this.deleteHostedAvatar(existing.avatarUrl);

    this.logger.log(`Admin set avatar for user ${userId}: ${avatarUrl}`);
    return { avatarUrl };
  }

  /**
   * Admin: remove a user's avatar. Clears the stored URL and best-effort
   * deletes the underlying object from our bucket.
   */
  async removeUserAvatarAdmin(userId: string): Promise<{ avatarUrl: null }> {
    const existing = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { avatarUrl: true },
    });
    if (!existing) {
      throw new NotFoundException('User not found');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: null },
    });

    await this.deleteHostedAvatar(existing.avatarUrl);

    this.logger.log(`Admin removed avatar for user ${userId}`);
    return { avatarUrl: null };
  }

  /**
   * Best-effort delete of an avatar object we host in S3. External avatars
   * (e.g. OAuth provider URLs) are left untouched — {@link extractS3Key}
   * returns null for anything that isn't one of our own bucket objects.
   */
  private async deleteHostedAvatar(url: string | null): Promise<void> {
    if (!url) return;
    const key = this.extractS3Key(url);
    if (key) {
      await this.storageService.deleteObject(key);
    }
  }

  /**
   * Extract the S3 object key from a hosted avatar URL so the old object can be
   * deleted when an avatar is replaced or removed — or return `null` when the
   * URL is NOT one of our own bucket objects, so we never delete something we
   * don't own (e.g. a Google OAuth avatar at lh3.googleusercontent.com).
   *
   * Strict host match: the URL's hostname must equal our own virtual-hosted S3
   * endpoint `<bucket>.s3.<region>.amazonaws.com`, built from the same config
   * StorageService uploads with. Anything else — external hosts, a bare-bucket
   * or path-style URL, a CDN domain, or an unparseable string — returns null.
   */
  private extractS3Key(url: string): string | null {
    const bucket = this.configService.get<string>('S3_BUCKET_NAME');
    const region = this.configService.get<string>('AWS_REGION');
    if (!bucket || !region) return null;

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return null;
    }

    const expectedHost = `${bucket}.s3.${region}.amazonaws.com`;
    if (parsed.protocol !== 'https:' || parsed.hostname !== expectedHost) {
      return null;
    }

    // Drop the leading slash and decode any percent-encoding to recover the
    // literal object key. Guard against an empty path (the bucket root).
    const key = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
    return key.length > 0 ? key : null;
  }

  /**
   * Get user's linked accounts (identities)
   */
  async getUserIdentities(userId: string) {
    const identities = await this.prisma.userIdentity.findMany({
      where: { userId },
      select: {
        id: true,
        provider: true,
        email: true,
        emailVerified: true,
        isPrimary: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });
    return identities;
  }

  async setPrimaryIdentity(userId: string, identityId: string) {
    const identity = await this.prisma.userIdentity.findUnique({
      where: { id: identityId },
    });
    if (!identity || identity.userId !== userId) {
      throw new NotFoundException('Identity not found');
    }
    if (!identity.email) {
      throw new BadRequestException('Only email identities can be set as primary');
    }
    await this.prisma.$transaction([
      this.prisma.userIdentity.updateMany({
        where: { userId, isPrimary: true },
        data: { isPrimary: false },
      }),
      this.prisma.userIdentity.update({
        where: { id: identityId },
        data: { isPrimary: true },
      }),
    ]);
    return { message: 'Primary email updated' };
  }

  async removeIdentity(userId: string, identityId: string) {
    const identity = await this.prisma.userIdentity.findUnique({
      where: { id: identityId },
    });
    if (!identity || identity.userId !== userId) {
      throw new NotFoundException('Identity not found');
    }
    const count = await this.prisma.userIdentity.count({ where: { userId } });
    if (count <= 1) {
      throw new BadRequestException('Cannot remove your only linked account');
    }
    if (identity.isPrimary) {
      const next = await this.prisma.userIdentity.findFirst({
        where: { userId, id: { not: identityId }, email: { not: null } },
        orderBy: { createdAt: 'asc' },
      });
      if (next) {
        await this.prisma.userIdentity.update({
          where: { id: next.id },
          data: { isPrimary: true },
        });
      }
    }
    await this.prisma.userIdentity.delete({ where: { id: identityId } });
    return { message: 'Account unlinked successfully' };
  }

  /**
   * Get user's spaces (where user is a member)
   */
  async getUserSpaces(
    userId: string,
    opts: { includeEventRoles?: boolean } = {},
  ) {
    const spaceInclude = {
      creator: { select: { id: true, fullName: true, username: true } },
      _count: {
        select: { userRoles: true, childSpaces: true, events: true },
      },
    } satisfies Prisma.SpaceInclude;

    type ShapedSpace = Prisma.SpaceGetPayload<{ include: typeof spaceInclude }>;
    const shape = (space: ShapedSpace) => ({
      id: space.id,
      name: space.name,
      slug: space.slug,
      description: space.description,
      logo_url: space.logoUrl,
      banner_url: space.bannerUrl,
      city: space.city,
      state: space.state,
      country: space.country,
      visibility: space.visibility,
      status: space.status,
      // Structural hierarchy fields — required by the organiser dashboard to
      // filter parent/child candidates (SUPER vs REGULAR, existing parent,
      // and current child count).
      type: space.type,
      parentSpaceId: space.parentSpaceId,
      sub_org_count: space._count.childSpaces,
      member_count: space._count.userRoles,
      _count: { events: space._count.events, members: space._count.userRoles },
      creator: space.creator,
      createdAt: space.createdAt,
      updatedAt: space.updatedAt,
    });

    // Default behaviour (apex/mobile) — one row per space-scoped role, unchanged.
    if (!opts.includeEventRoles) {
      const spaceRoles = await this.prisma.userRole.findMany({
        where: { userId, space: { status: 'ACTIVE' } },
        include: {
          space: { include: spaceInclude },
          role: { select: { id: true, code: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
      });
      return spaceRoles
        .filter((ur) => ur.space !== null)
        .map((ur) => ({
          ...shape(ur.space!),
          userRole: { id: ur.role.id, code: ur.role.code, name: ur.role.name },
        }));
    }

    // Space-app path: also match event-scoped roles whose event's space is
    // ACTIVE. These have no spaceId, so the plain `space` filter would drop them
    // (why event-only curators/crew couldn't sign in).
    const userRoles = await this.prisma.userRole.findMany({
      where: {
        userId,
        OR: [
          { space: { status: 'ACTIVE' } },
          { event: { space: { status: 'ACTIVE' } } },
        ],
      },
      include: {
        space: { include: spaceInclude },
        event: {
          select: {
            id: true,
            title: true,
            status: true,
            space: { include: spaceInclude },
          },
        },
        role: { select: { id: true, code: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Fold every role (space- and event-scoped) into one entry
    // per space. `userRole` is the highest SPACE-level role (null when the user
    // only has event roles here); `eventAccess` lists the events they operate.
    const ROLE_PRIORITY = [
      'SPACE_ADMIN',
      'CURATOR',
      'CO_CURATOR',
      'CREW',
      'MEMBER',
    ];
    const rank = (code: string) => {
      const i = ROLE_PRIORITY.indexOf(code);
      return i < 0 ? ROLE_PRIORITY.length : i;
    };

    type SpaceShape = ReturnType<typeof shape>;
    type EventAccess = {
      eventId: string;
      title: string;
      status: string;
      roleCode: string;
    };
    const bySpace = new Map<
      string,
      {
        space: SpaceShape;
        spaceRole: { id: string; code: string; name: string } | null;
        events: Map<string, EventAccess>;
      }
    >();

    for (const ur of userRoles) {
      const space = ur.space ?? ur.event?.space;
      if (!space) continue;
      let acc = bySpace.get(space.id);
      if (!acc) {
        acc = { space: shape(space), spaceRole: null, events: new Map() };
        bySpace.set(space.id, acc);
      }
      if (ur.spaceId && !ur.eventId) {
        // Space-scoped role — keep the highest-privilege one.
        if (!acc.spaceRole || rank(ur.role.code) < rank(acc.spaceRole.code)) {
          acc.spaceRole = {
            id: ur.role.id,
            code: ur.role.code,
            name: ur.role.name,
          };
        }
      } else if (ur.eventId && ur.event) {
        acc.events.set(ur.eventId, {
          eventId: ur.eventId,
          title: ur.event.title,
          status: ur.event.status,
          roleCode: ur.role.code,
        });
      }
    }

    return [...bySpace.values()].map(({ space, spaceRole, events }) => ({
      ...space,
      userRole: spaceRole,
      eventAccess: [...events.values()],
    }));
  }

  /**
   * Ask for the account to be deleted. Nothing is removed yet: the request
   * starts a {@link ACCOUNT_DELETION_GRACE_DAYS}-day grace period during which
   * the user can still sign in and cancel. After that the daily purge job
   * closes the account for good (see {@link purgeDueDeletions}).
   *
   * Blockers are checked now so the user learns about them up front, and
   * again at purge time because things can change during the grace period.
   */
  async requestAccountDeletion(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.deletedAt) {
      throw new NotFoundException('User not found');
    }
    if (user.deletionRequestedAt) {
      return { deletionScheduledFor: deletionDueAt(user.deletionRequestedAt).toISOString() };
    }

    await this.assertAccountCanClose(userId);

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { deletionRequestedAt: new Date() },
    });
    this.logger.log(`User ${userId} requested account deletion`);
    return { deletionScheduledFor: deletionDueAt(updated.deletionRequestedAt!).toISOString() };
  }

  /** Withdraw a pending deletion request during the grace period. */
  async cancelAccountDeletion(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.deletedAt) {
      throw new NotFoundException('User not found');
    }
    if (user.deletionRequestedAt) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { deletionRequestedAt: null },
      });
      this.logger.log(`User ${userId} cancelled their account deletion`);
    }
    return { deletionScheduledFor: null };
  }

  /**
   * Close every account whose grace period has run out. Called daily by
   * {@link AccountDeletionSchedulerService}. An account that's blocked at this
   * point (e.g. bought a ticket during the grace period) stays pending and is
   * retried on the next run, so it closes once the blocker clears.
   */
  async purgeDueDeletions(): Promise<{ closed: number; blocked: number }> {
    const cutoff = new Date(Date.now() - ACCOUNT_DELETION_GRACE_DAYS * DAY_MS);
    const due = await this.prisma.user.findMany({
      where: { deletionRequestedAt: { lte: cutoff }, deletedAt: null },
      select: { id: true },
    });

    let closed = 0;
    let blocked = 0;
    for (const { id } of due) {
      try {
        await this.assertAccountCanClose(id);
        await this.closeAccount(id);
        closed++;
      } catch (err) {
        if (err instanceof ConflictException) {
          blocked++;
          this.logger.warn(`Deletion of user ${id} is due but blocked: ${err.message}`);
        } else {
          this.logger.error(`Deletion of user ${id} failed`, err as Error);
        }
      }
    }
    return { closed, blocked };
  }

  /** Everything that must be resolved before an account can close. */
  private async assertAccountCanClose(userId: string): Promise<void> {
    // A space's creator is its payer and money pointer, so it must be handed
    // over (ownership transfer) or archived before the account can close.
    const ownedSpaces = await this.prisma.space.findMany({
      where: { createdBy: userId, status: { notIn: ['ARCHIVED', 'REJECTED'] } },
      select: { name: true },
    });
    if (ownedSpaces.length > 0) {
      throw new ConflictException(
        `You own ${ownedSpaces.map((s) => s.name).join(', ')}. Transfer ownership before deleting your account.`,
      );
    }

    await this.assertRegistrationsAllowDeletion(userId);
  }

  /**
   * Close the account for good.
   *
   * This is an anonymise-and-close, not a row delete: a hard `user.delete`
   * would either fail on Restrict relations (refund requests, events created,
   * check-ins performed) or cascade away paid registrations, breaking the
   * cash-accurate financials. Instead we scrub every piece of PII on the row,
   * remove all sign-ins (so the same email/phone can sign up fresh), drop
   * personal side tables, and stamp `deletedAt` so auth rejects old tokens.
   * Registrations, payments, refunds and payouts stay, attached to a
   * nameless user.
   */
  private async closeAccount(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.deletedAt) return;

    // Personal data on related records (DPDP erasure). Money fields — amounts,
    // payment ids, status, refundedAmount — are never touched, so financials
    // and tax records still reconcile.
    //
    // Group rosters: only THIS user's entries go. As a lead, their own seat 1
    // and roster entry 0 are scrubbed but the members they brought keep their
    // details (they're still attending). As a member of someone else's group,
    // their claimed seat and matching roster entry on the lead's registration
    // are scrubbed and nothing else on that registration changes.
    const [regs, seats, bookings, identities] = await Promise.all([
      this.prisma.eventRegistration.findMany({
        where: { userId },
        select: { id: true, formResponses: true, groupMembers: true },
      }),
      this.prisma.groupSeat.findMany({
        where: { claimedByUserId: userId },
        select: {
          seatIndex: true,
          memberDetails: true,
          registration: { select: { id: true, groupMembers: true } },
        },
      }),
      this.prisma.stayBooking.findMany({
        where: { userId },
        select: { answers: true, guests: { select: { idProof: true } } },
      }),
      // Read before the identities are deleted below: the organiser lead
      // funnel has no user link, only the email someone typed.
      this.prisma.userIdentity.findMany({
        where: { userId, emailVerified: true, email: { not: null } },
        select: { email: true },
      }),
    ]);
    // Organiser lead funnel ("Notify me", space inquiries, manual/imported
    // leads) has no user link, only the email someone typed. Match on the
    // account's VERIFIED emails only, so we never erase someone else who typed
    // an address we can't vouch for. The DB match is case-insensitive (ILIKE,
    // where `_` is a wildcard), so confirm each hit is an exact lowercase match.
    const verifiedEmails = new Set(identities.map((i) => (i.email as string).toLowerCase()));
    const emailLeadIds = verifiedEmails.size
      ? (
          await this.prisma.lead.findMany({
            where: {
              OR: [...verifiedEmails].map((email) => ({
                email: { equals: email, mode: 'insensitive' as const },
              })),
            },
            select: { id: true, email: true },
          })
        )
          .filter((l) => verifiedEmails.has((l.email ?? '').toLowerCase()))
          .map((l) => l.id)
      : [];
    // Phone-only leads (no email, so organiser-entered) by the VERIFIED mobile.
    // A lead with some other email but this phone is left alone: shared
    // numbers. Lead phones are free text, so SQL narrows on the last 10 digits
    // and normalizeMobile (accounts' E.164 form) confirms the exact number —
    // retried without a leading trunk 0 ("09876543210"), which it doesn't read.
    const mobile = user.mobileVerified ? normalizeMobile(user.mobileNumber) : null;
    const phoneLeadIds = mobile
      ? (
          await this.prisma.$queryRaw<{ id: string; phone: string }[]>`
            SELECT id, phone FROM leads
            WHERE email IS NULL AND phone IS NOT NULL
              AND right(regexp_replace(phone, '[^0-9]', '', 'g'), 10) = ${mobile.slice(-10)}`
        )
          .filter((l) => {
            const typed = l.phone.trim();
            const read =
              normalizeMobile(typed) ??
              (typed.startsWith('0') ? normalizeMobile(typed.slice(1)) : null);
            return read === mobile;
          })
          .map((l) => l.id)
      : [];
    const funnelLeadIds = [...emailLeadIds, ...phoneLeadIds];

    // Legacy `groupMembers` JSON: index i is seat i+1. Entries are blanked to
    // {} rather than removed so everyone else keeps their index.
    const rosters = new Map<string, { members: unknown[]; drop: Set<number> }>();
    const markRoster = (id: string, members: Prisma.JsonValue, index: number) => {
      if (!Array.isArray(members) || index >= members.length) return;
      const r = rosters.get(id) ?? { members, drop: new Set<number>() };
      r.drop.add(index);
      rosters.set(id, r);
    };
    for (const r of regs) markRoster(r.id, r.groupMembers, 0);
    for (const s of seats) {
      markRoster(s.registration.id, s.registration.groupMembers, s.seatIndex - 1);
    }

    const privateKeys = privateFileKeys([
      ...regs.map((r) => r.formResponses),
      ...seats.map((s) => s.memberDetails),
      ...[...rosters.values()].flatMap((r) => [...r.drop].map((i) => r.members[i])),
      ...bookings.flatMap((b) => [b.answers, ...b.guests.map((g) => g.idProof)]),
    ]);

    await this.prisma.$transaction([
      this.prisma.eventRegistration.updateMany({
        where: { userId },
        // Closing the account withdraws sponsor-sharing consent too.
        data: { formResponses: Prisma.DbNull, shareContactWithSponsors: false },
      }),
      // Sponsor leads from the user's registrations: the contact snapshot and
      // the crew's note go; the row stays so sponsors' lead counts hold. Leads
      // already exported by a sponsor are outside our reach.
      // The row keeps its source/status so the organiser's funnel counts hold.
      this.prisma.lead.updateMany({
        where: { id: { in: funnelLeadIds } },
        data: { name: null, email: null, phone: null, message: null },
      }),
      this.prisma.sponsorLead.updateMany({
        where: { registration: { userId } },
        data: { name: null, email: null, phone: null, note: null },
      }),
      // Decided refunds on the user's registrations: the free-text reason
      // (NOT NULL) is replaced. Amounts, status, Razorpay ids and staff
      // decision notes stay as the money record. One still in review keeps
      // its reason for the reviewers; RefundsService redacts it when decided.
      this.prisma.refundRequest.updateMany({
        where: {
          registration: { userId },
          status: { in: [RefundStatus.APPROVED, RefundStatus.REJECTED] },
        },
        data: { reason: REDACTED_REFUND_REASON },
      }),
      ...[...rosters].map(([id, r]) =>
        this.prisma.eventRegistration.update({
          where: { id },
          data: {
            groupMembers: r.members.map((m, i) =>
              r.drop.has(i) ? {} : m,
            ) as Prisma.InputJsonValue,
          },
        }),
      ),
      this.prisma.groupSeat.updateMany({
        where: { claimedByUserId: userId },
        data: { memberDetails: Prisma.DbNull, inviteEmail: null },
      }),
      this.prisma.stayBooking.updateMany({
        where: { userId },
        data: {
          emergencyName: null,
          emergencyPhone: null,
          note: null,
          answers: Prisma.DbNull,
        },
      }),
      // Everyone on the user's own bookings: they typed these guests in.
      // name/gender are NOT NULL; gender alone isn't identifying once the
      // name, contacts and ID are gone, and keeps bed-allocation counts true.
      this.prisma.stayGuest.updateMany({
        where: { booking: { userId } },
        data: {
          name: 'Deleted guest',
          phone: null,
          email: null,
          idProof: Prisma.DbNull,
        },
      }),
      this.prisma.userIdentity.deleteMany({ where: { userId } }),
      this.prisma.userPushDevice.deleteMany({ where: { userId } }),
      this.prisma.adminDevice.deleteMany({ where: { userId } }),
      this.prisma.notificationSettings.deleteMany({ where: { userId } }),
      this.prisma.favoriteEvent.deleteMany({ where: { userId } }),
      this.prisma.userRole.deleteMany({ where: { userId } }),
      this.prisma.sponsorUser.deleteMany({ where: { userId } }),
      this.prisma.payoutBankAccount.deleteMany({ where: { userId } }),
      this.prisma.eventCheckinAccess.deleteMany({ where: { userId } }),
      this.prisma.sessionCoHost.deleteMany({ where: { userId } }),
      this.prisma.user.update({
        where: { id: userId },
        data: {
          // mobile_number is NOT NULL + unique + varchar(20): a unique
          // placeholder frees the real number for a new signup.
          mobileNumber: `deleted-${userId.replace(/-/g, '').slice(0, 12)}`,
          mobileVerified: false,
          username: null,
          fullName: null,
          avatarUrl: null,
          bio: null,
          gender: null,
          linkedinUrl: null,
          instagramUrl: null,
          githubUrl: null,
          websiteUrl: null,
          referralCode: null,
          appVersion: null,
          appPlatform: null,
          appVersionLastReportedAt: null,
          lastSeenAt: null,
          deletedAt: new Date(),
        },
      }),
    ]);

    await this.deleteHostedAvatar(user.avatarUrl).catch((err) =>
      this.logger.warn(`Avatar cleanup failed for deleted user ${userId}: ${err}`),
    );
    // Best-effort: deleteObject logs and swallows its own failures. Uploads
    // from abandoned checkouts aren't referenced anywhere, so they're left to
    // the 180-day post-event purge (FormUploadsService.purgeExpired).
    // ponytail: one DELETE per key; batch DeleteObjects if a user ever has hundreds.
    for (const key of privateKeys) await this.storageService.deleteObject(key);

    this.logger.log(`User ${userId} account closed`);
  }

  /**
   * Policy gate: may a user with live tickets close their account?
   * Throw a ConflictException to block deletion; return to allow it.
   */
  private async assertRegistrationsAllowDeletion(userId: string): Promise<void> {
    // "Upcoming" = not yet ended (so an event in progress still blocks), and
    // not cancelled or deleted. Free tickets are stored PAID, so the shared
    // attending bar covers free and paid alike.
    const liveEvent = {
      endDateTime: { gt: new Date() },
      status: { not: EventStatus.CANCELLED },
      deletedAt: null,
    } satisfies Prisma.EventWhereInput;

    // A ticket with a refund request still in review no longer blocks: the
    // user has already asked for their money back, and an approved refund is
    // charged back to the original payment method, so it doesn't depend on
    // anything this deletion removes.
    const noOpenRefund = {
      refundRequests: {
        none: { status: { in: [RefundStatus.PENDING_CURATOR, RefundStatus.PENDING_ADMIN] } },
      },
    } satisfies Prisma.EventRegistrationWhereInput;

    const [ownTicket, claimedSeat] = await Promise.all([
      this.prisma.eventRegistration.findFirst({
        where: { userId, ...COUNTS_AS_ATTENDING, ...noOpenRefund, event: liveEvent },
        select: { event: { select: { title: true } } },
        orderBy: { event: { startDateTime: 'asc' } },
      }),
      // Group members hold a claimed seat on the lead's registration, not a
      // registration of their own.
      this.prisma.groupSeat.findFirst({
        where: {
          claimedByUserId: userId,
          status: GroupSeatStatus.CLAIMED,
          registration: { ...COUNTS_AS_ATTENDING, ...noOpenRefund, event: liveEvent },
        },
        select: { registration: { select: { event: { select: { title: true } } } } },
      }),
    ]);

    const title = ownTicket?.event.title ?? claimedSeat?.registration.event.title;
    if (title) {
      throw new ConflictException(
        `You have an upcoming ticket for ${title}. Cancel it or request a refund, or wait until the event ends, before deleting your account.`,
      );
    }
  }

  /**
   * Get current user's notification settings.
   * Creates the row with defaults on first access.
   */
  async getNotificationSettings(userId: string) {
    const settings = await this.prisma.notificationSettings.upsert({
      where: { userId },
      update: {},
      create: { userId },
    });

    return this.toNotificationSettingsDto(settings);
  }

  /**
   * Update current user's notification settings (partial).
   */
  async updateNotificationSettings(
    userId: string,
    dto: UpdateNotificationSettingsDto,
  ) {
    const settings = await this.prisma.notificationSettings.upsert({
      where: { userId },
      update: { ...dto },
      create: { userId, ...dto },
    });

    return this.toNotificationSettingsDto(settings);
  }

  private toNotificationSettingsDto(settings: {
    pushEnabled: boolean;
    emailEnabled: boolean;
    eventReminders: boolean;
    newEvents: boolean;
    referralUpdates: boolean;
    promotions: boolean;
    productUpdates: boolean;
    registrationUpdates: boolean;
    spaceUpdates: boolean;
    organiserAnnouncements: boolean;
  }) {
    return {
      pushEnabled: settings.pushEnabled,
      emailEnabled: settings.emailEnabled,
      eventReminders: settings.eventReminders,
      newEvents: settings.newEvents,
      referralUpdates: settings.referralUpdates,
      promotions: settings.promotions,
      productUpdates: settings.productUpdates,
      registrationUpdates: settings.registrationUpdates,
      spaceUpdates: settings.spaceUpdates,
      organiserAnnouncements: settings.organiserAnnouncements,
    };
  }
}

/**
 * Every private upload key (FileAnswer `{ key, … }` under private/form-uploads/)
 * found anywhere in these JSON values — registration answers, group member
 * details and stay answers/ID proofs all store files that way.
 */
export function privateFileKeys(values: unknown[]): string[] {
  const keys = new Set<string>();
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (!v || typeof v !== 'object') return;
    const { key } = v as { key?: unknown };
    if (
      typeof key === 'string' &&
      key.startsWith('private/form-uploads/') &&
      !key.includes('..')
    ) {
      keys.add(key);
    }
    Object.values(v).forEach(walk);
  };
  values.forEach(walk);
  return [...keys];
}
