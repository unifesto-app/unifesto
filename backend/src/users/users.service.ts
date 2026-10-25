import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
  Optional,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { OPERATOR_SPACE_STATUSES } from '../spaces/space-access';
import { ConfigService } from '@nestjs/config';
import { UpdateProfileDto, UpdateNotificationSettingsDto } from './dto';
import {
  User,
  Prisma,
  EventStatus,
  GroupSeatStatus,
  RefundStatus,
  SupportCaseKind,
  SupportDesk,
  SupportTicketCategory,
  SupportTicketStatus,
  MarketingChannel,
  NotificationSettings,
  Provider,
  SupportMessageSide,
} from '@prisma/client';
import {
  AdminDeleteUserCommand,
  CognitoIdentityProviderClient,
  ListUsersCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { AWS_HTTP_TIMEOUTS } from '../common/http/outbound-timeouts';
import { resubscribeUserToSpace, setUserMarketing, userMarketingPrefs } from '../common/marketing-opt-out';
import { validQuietHours } from '../notifications/quiet-hours';
import { SUBJECT_CASE_OPEN, SUBJECT_CASE_UPDATE, type SubjectCaseOpen, type SubjectCaseUpdate } from '../support/subject-cases';
import { COUNTS_AS_ATTENDING } from '../common/attendance';
import {
  ACCOUNT_DELETION_GRACE_DAYS,
  DAY_MS,
  deletionDueAt,
  REDACTED_REFUND_REASON,
  REDACTED_SUPPORT_MESSAGE,
  ERASED_NAME,
} from '../common/account-deletion';
import { UserProfileDto } from '../auth/dto';
import { AppleSignInService } from '../auth/apple-sign-in.service';
import { StorageService } from '../storage/storage.service';
import { normalizeMobile } from '../leaderboard/hackathon.shared';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);
  private cognito?: CognitoIdentityProviderClient;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly storageService: StorageService,
    @Optional() private readonly events?: EventEmitter2,
    @Optional() private readonly appleSignIn?: AppleSignInService,
  ) {}

  /**
   * D24: an account's deletion is one PRIVACY case (subject = the user), with
   * each step as a SYSTEM line, so the person follows it in My help. Opened
   * first (awaited, so the line lands on it) and reopened by a new request.
   */
  private async deletionCaseLine(userId: string, text: string, status: SupportTicketStatus) {
    if (!this.events) return;
    const open: SubjectCaseOpen = {
      subjectType: 'User',
      subjectId: userId,
      requesterId: userId,
      kind: SupportCaseKind.PRIVACY,
      desk: SupportDesk.PLATFORM,
      category: SupportTicketCategory.ACCOUNT,
      subject: 'Delete my account',
      message: 'Please delete my account and my personal data.',
    };
    const update: SubjectCaseUpdate = { subjectType: 'User', subjectId: userId, text, status };
    try {
      await this.events.emitAsync(SUBJECT_CASE_OPEN, open);
      await this.events.emitAsync(SUBJECT_CASE_UPDATE, update);
    } catch (err) {
      // The case is a record of the deletion, never a reason to fail it.
      this.logger.warn(`Deletion case for user ${userId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Record the app version/platform the current user's client is running.
   * Called by the mobile app when a session becomes active. Best-effort and
   * idempotent — repeated reports of the same version just refresh the
   * last-reported timestamp so staff can see recency.
   */
  async updateMyAppVersion(
    userId: string,
    dto: { version: string; platform: string; runtimeVersion?: string; updateId?: string | null },
  ) {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        appVersion: dto.version,
        appPlatform: dto.platform,
        appVersionLastReportedAt: new Date(),
        // Clients that report a runtime also report their update (or none =
        // store build code). Older clients send neither: leave both untouched.
        ...(dto.runtimeVersion !== undefined && {
          appRuntimeVersion: dto.runtimeVersion,
          appUpdateId: dto.updateId ?? null,
        }),
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
        where: { userId, space: { status: { in: OPERATOR_SPACE_STATUSES } } },
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
    // live or paused. These have no spaceId, so the plain `space` filter would drop them
    // (why event-only curators/crew couldn't sign in).
    const userRoles = await this.prisma.userRole.findMany({
      where: {
        userId,
        OR: [
          { space: { status: { in: OPERATOR_SPACE_STATUSES } } },
          { event: { space: { status: { in: OPERATOR_SPACE_STATUSES } } } },
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
    const due = deletionDueAt(updated.deletionRequestedAt!);
    const day = due.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'long', year: 'numeric' });
    // PENDING: nothing for the desk to do, the person can still cancel.
    await this.deletionCaseLine(
      userId,
      `Deletion requested. The account and its personal data are erased on ${day} unless you cancel before then.`,
      SupportTicketStatus.PENDING,
    );
    return { deletionScheduledFor: due.toISOString() };
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
      await this.deletionCaseLine(userId, 'Deletion cancelled. The account stays.', SupportTicketStatus.CLOSED);
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
        const { leftovers } = await this.closeAccount(id);
        await this.deletionCaseLine(id, 'Account erased. Personal data is removed; payment records stay without a name, for tax and refunds.', SupportTicketStatus.CLOSED);
        if (leftovers.length) {
          // Reopens the case for the desk to finish by hand.
          await this.deletionCaseLine(id, `Some data could not be removed yet: ${leftovers.join(', ')}. The team will finish this.`, SupportTicketStatus.OPEN);
        }
        closed++;
      } catch (err) {
        if (err instanceof ConflictException) {
          blocked++;
          this.logger.warn(`Deletion of user ${id} is due but blocked: ${err.message}`);
          await this.deletionProblemLine(id, `Deletion is on hold: ${err.message}`, SupportTicketStatus.PENDING);
        } else {
          this.logger.error(`Deletion of user ${id} failed`, err as Error);
          await this.deletionProblemLine(id, 'Deletion could not finish. It is retried daily and the team has been told.', SupportTicketStatus.OPEN);
        }
      }
    }
    return { closed, blocked };
  }

  /**
   * A purge problem on the deletion case, once: the job retries daily, so the
   * same line isn't posted again while it's still the latest one.
   */
  private async deletionProblemLine(userId: string, text: string, status: SupportTicketStatus) {
    const last = await this.prisma.supportMessage
      .findFirst({
        where: { ticket: { subjectType: 'User', subjectId: userId, kind: SupportCaseKind.PRIVACY } },
        orderBy: { createdAt: 'desc' },
        select: { body: true },
      })
      .catch(() => null);
    if (last?.body !== text) await this.deletionCaseLine(userId, text, status);
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
    if (!user || user.deletedAt) return { leftovers: [] };

    // Personal data on related records (DPDP erasure). Money fields — amounts,
    // payment ids, status, refundedAmount — are never touched, so financials
    // and tax records still reconcile.
    //
    // Group rosters: only THIS user's seats go. As a lead, their own seat 1 is
    // scrubbed but the members they brought keep their details (they're still
    // attending). As a member of someone else's group, their claimed seat is
    // scrubbed and nothing else on that registration changes.
    const [regs, seats, bookings, identities] = await Promise.all([
      this.prisma.eventRegistration.findMany({
        where: { userId },
        select: { id: true, formResponses: true },
      }),
      this.prisma.groupSeat.findMany({
        where: { claimedByUserId: userId },
        select: { memberDetails: true },
      }),
      this.prisma.stayBooking.findMany({
        where: { userId },
        select: { answers: true, guests: { select: { idProof: true } } },
      }),
      // Read before the identities are deleted below: the organiser lead
      // funnel, tickets and certificates match on the email someone typed,
      // and Google/Apple sign-ins name the Cognito user to remove and the
      // Apple token to revoke.
      this.prisma.userIdentity.findMany({
        where: { userId },
        select: { provider: true, providerUserId: true, email: true, emailVerified: true, appleRefreshToken: true },
      }),
    ]);
    const cognitoSubs = identities
      .filter((i) => i.provider === Provider.GOOGLE || i.provider === Provider.APPLE)
      .map((i) => i.providerUserId);
    // Organiser lead funnel ("Notify me", space inquiries, manual/imported
    // leads) has no user link, only the email someone typed. Match on the
    // account's VERIFIED emails only, so we never erase someone else who typed
    // an address we can't vouch for. The DB match is case-insensitive (ILIKE,
    // where `_` is a wildcard), so confirm each hit is an exact lowercase match.
    const verifiedEmails = new Set(
      identities.filter((i) => i.emailVerified && i.email).map((i) => (i.email as string).toLowerCase()),
    );
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
    // and normalizeMobile (accounts' E.164 form) confirms the exact number.
    const mobile = user.mobileVerified ? normalizeMobile(user.mobileNumber) : null;
    const phoneLeadIds = mobile
      ? (
          await this.prisma.$queryRaw<{ id: string; phone: string }[]>`
            SELECT id, phone FROM leads
            WHERE email IS NULL AND phone IS NOT NULL
              AND right(regexp_replace(phone, '[^0-9]', '', 'g'), 10) = ${mobile.slice(-10)}`
        )
          .filter((l) => normalizeMobile(l.phone) === mobile)
          .map((l) => l.id)
      : [];
    const funnelLeadIds = [...emailLeadIds, ...phoneLeadIds];

    // Tickets and certificates name their holder by the email typed at
    // booking/issue (a member's seat lives on the lead's registration), so the
    // same exact-match rule as leads applies. The user's own lead ticket may
    // carry no email at all.
    const byVerifiedEmail = (field: 'attendeeEmail' | 'recipientEmail') =>
      [...verifiedEmails].map((email) => ({ [field]: { equals: email, mode: 'insensitive' as const } }));
    const isMine = (email: string | null) => email === null || verifiedEmails.has(email.toLowerCase());
    const waId = mobile?.slice(1); // WhatsApp ids are E.164 without the +
    const [tickets, certificates, waConversations, supportFiles] = await Promise.all([
      this.prisma.eventTicket.findMany({
        where: {
          OR: [{ registration: { userId }, attendeeEmail: null }, ...byVerifiedEmail('attendeeEmail')],
        },
        select: { id: true, attendeeEmail: true },
      }),
      this.prisma.certificate.findMany({
        where: { OR: [{ userId }, ...byVerifiedEmail('recipientEmail')] },
        select: { id: true, userId: true, recipientEmail: true, verificationCode: true },
      }),
      this.prisma.whatsappConversation.findMany({
        where: { OR: [{ userId }, ...(waId ? [{ waId }] : [])] },
        select: { id: true, waId: true },
      }),
      this.prisma.supportAttachment.findMany({
        where: { message: { authorId: userId, side: SupportMessageSide.REQUESTER } },
        select: { key: true },
      }),
    ]);
    const ticketIds = tickets.filter((t) => isMine(t.attendeeEmail)).map((t) => t.id);
    const mineCerts = certificates.filter((c) => c.userId === userId || isMine(c.recipientEmail));

    const privateKeys = privateFileKeys([
      ...regs.map((r) => r.formResponses),
      ...seats.map((s) => s.memberDetails),
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
          name: ERASED_NAME,
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
      // Payouts keep their bank account (FK RESTRICT): an account that was
      // paid out to is scrubbed down to what the payout record needs (bank,
      // IFSC, last 4 digits); one never paid out to goes. Events stop routing
      // future payouts to any of them.
      this.prisma.event.updateMany({
        where: { payoutBankAccount: { userId } },
        data: { payoutBankAccountId: null },
      }),
      this.prisma.payoutBankAccount.deleteMany({ where: { userId, payouts: { none: {} } } }),
      this.prisma.$executeRaw`
        UPDATE organiser_bank_accounts SET
          account_holder_name = ${ERASED_NAME},
          mobile_number = NULL,
          account_number = CASE WHEN account_number IS NULL THEN NULL ELSE 'XXXX' || right(account_number, 4) END,
          upi_id = CASE WHEN upi_id IS NULL THEN NULL ELSE 'XXXX@' || split_part(upi_id, '@', 2) END,
          rejection_reason = NULL,
          is_primary = false,
          updated_at = now()
        WHERE user_id = ${userId}::uuid`,
      this.prisma.eventTicket.updateMany({
        where: { id: { in: ticketIds } },
        data: { attendeeName: ERASED_NAME, attendeeEmail: null },
      }),
      // The public verify page reads the name from here; the rendered PDF/PNG
      // (which print it) are deleted after the transaction.
      this.prisma.certificate.updateMany({
        where: { id: { in: mineCerts.map((c) => c.id) } },
        data: { recipientName: ERASED_NAME, recipientEmail: null, pdfUrl: null, imageUrl: null },
      }),
      // Support threads stay for the desk's record, minus what the person
      // wrote or sent. Desk replies and system lines stay.
      this.prisma.supportTicket.updateMany({
        where: { requesterId: userId },
        data: {
          contactEmail: null,
          clientInfo: Prisma.DbNull,
          ratingComment: null,
          aiTriage: Prisma.DbNull,
          aiSummary: null,
        },
      }),
      this.prisma.supportAttachment.deleteMany({
        where: { message: { authorId: userId, side: SupportMessageSide.REQUESTER } },
      }),
      this.prisma.supportMessage.updateMany({
        where: { authorId: userId, side: SupportMessageSide.REQUESTER },
        data: { body: REDACTED_SUPPORT_MESSAGE },
      }),
      this.prisma.userNotification.deleteMany({ where: { userId } }),
      this.prisma.messageDelivery.deleteMany({ where: { userId } }),
      // Admin inbox threads with the user's number (messages cascade).
      this.prisma.whatsappConversation.deleteMany({
        where: { id: { in: waConversations.map((c) => c.id) } },
      }),
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
          appVersion: null,
          appPlatform: null,
          appVersionLastReportedAt: null,
          appRuntimeVersion: null,
          appUpdateId: null,
          lastSeenAt: null,
          deletedAt: new Date(),
        },
      }),
    ]);

    // Files, the Cognito sign-in and the Apple token go after the commit. Anything that can't
    // be removed is returned so the PRIVACY case says so and the desk follows up.
    const leftovers: string[] = [];
    const attempt = async (what: string, fn: () => Promise<unknown>) => {
      try {
        await fn();
      } catch (err) {
        leftovers.push(what);
        this.logger.error(`Erasure of user ${userId}: ${what} failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    };

    await attempt('profile photo', async () => {
      await this.deleteHostedAvatar(user.avatarUrl);
      // Every photo ever uploaded, not just the current one (keys are avatars/<userId>-<ts>.<ext>).
      await this.storageService.deletePrefix(`avatars/${userId}-`);
    });
    await attempt('WhatsApp media', async () => {
      for (const { waId: id } of waConversations) {
        await this.storageService.deletePrefix(`whatsapp-inbox/${id}/`);
        await this.storageService.deletePrefix(`whatsapp-outbound/${id}/`);
      }
    });
    // Best-effort: deleteObject logs and swallows its own failures. Uploads
    // from abandoned checkouts aren't referenced anywhere, so they're left to
    // the 180-day post-event purge (FormUploadsService.purgeExpired).
    // ponytail: one DELETE per key; batch DeleteObjects if a user ever has hundreds.
    for (const key of [
      ...privateKeys,
      ...supportFiles.map((f) => f.key),
      ...mineCerts.flatMap((c) => [`certificates/${c.verificationCode}.pdf`, `certificates/${c.verificationCode}.png`]),
    ]) {
      await this.storageService.deleteObject(key);
    }
    for (const sub of cognitoSubs) await attempt('Google/Apple sign-in', () => this.deleteCognitoUser(sub));
    // App Store 5.1.1(v) (O17). Apple sign-ins from before the token was
    // stored have none, so there is nothing to revoke for them here.
    for (const { appleRefreshToken: token } of identities) {
      if (!token) continue;
      await attempt('Apple sign-in', async () => {
        if (!this.appleSignIn) throw new Error('AppleSignInService not provided');
        await this.appleSignIn.revoke(token);
      });
    }

    this.logger.log(`User ${userId} account closed`);
    return { leftovers: [...new Set(leftovers)] };
  }

  /**
   * Remove the user's Google/Apple sign-in from the Cognito pool. Federated
   * usernames look like `google_<id>`, not the sub we store, so look it up.
   * Needs cognito-idp:ListUsers and cognito-idp:AdminDeleteUser on the role.
   */
  private async deleteCognitoUser(sub: string): Promise<void> {
    const UserPoolId = this.configService.get<string>('COGNITO_USER_POOL_ID');
    const region = this.configService.get<string>('AWS_REGION');
    if (!UserPoolId || !region) return; // no pool configured (local dev)
    if (!/^[\w-]+$/.test(sub)) throw new Error('unexpected Cognito sub');
    this.cognito ??= new CognitoIdentityProviderClient({ region, ...AWS_HTTP_TIMEOUTS });
    const { Users } = await this.cognito.send(
      new ListUsersCommand({ UserPoolId, Filter: `sub = "${sub}"`, Limit: 1 }),
    );
    const Username = Users?.[0]?.Username;
    if (Username) await this.cognito.send(new AdminDeleteUserCommand({ UserPoolId, Username }));
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
        none: { status: { in: [RefundStatus.PENDING_CURATOR, RefundStatus.PENDING_ADMIN, RefundStatus.PROCESSING] } },
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
   * Update current user's notification settings (partial). The marketing
   * switches write MarketingOptOut rows, not columns (C4).
   */
  async updateNotificationSettings(
    userId: string,
    dto: UpdateNotificationSettingsDto,
  ) {
    // referralUpdates is accepted (old clients) but has no column any more.
    const { referralUpdates: _ignored, marketingEmail, marketingWhatsapp, ...data } = dto;
    if (data.quietHoursStart !== undefined || data.quietHoursEnd !== undefined) {
      // A PATCH may carry one end; check the window it leaves behind.
      const current = await this.prisma.notificationSettings.findUnique({
        where: { userId },
        select: { quietHoursStart: true, quietHoursEnd: true },
      });
      const start = data.quietHoursStart !== undefined ? data.quietHoursStart : (current?.quietHoursStart ?? null);
      const end = data.quietHoursEnd !== undefined ? data.quietHoursEnd : (current?.quietHoursEnd ?? null);
      if (!validQuietHours(start, end)) {
        throw new BadRequestException('Quiet hours need a start and an end that are different.');
      }
    }
    if (marketingEmail !== undefined) {
      await setUserMarketing(this.prisma, userId, MarketingChannel.EMAIL, marketingEmail);
    }
    if (marketingWhatsapp !== undefined) {
      await setUserMarketing(this.prisma, userId, MarketingChannel.WHATSAPP, marketingWhatsapp);
    }
    const settings = await this.prisma.notificationSettings.upsert({
      where: { userId },
      update: data,
      create: { userId, ...data },
    });

    return this.toNotificationSettingsDto(settings);
  }

  /** Re-subscribe to one space's marketing email (settings › Promotions). */
  async resubscribeToSpace(userId: string, spaceId: string) {
    await resubscribeUserToSpace(this.prisma, userId, spaceId);
    return this.getNotificationSettings(userId);
  }

  private async toNotificationSettingsDto(settings: NotificationSettings) {
    const marketing = await userMarketingPrefs(this.prisma, settings.userId);
    const spaces = marketing.spaceIds.length
      ? await this.prisma.space.findMany({
          where: { id: { in: marketing.spaceIds } },
          select: { id: true, name: true },
        })
      : [];
    return {
      pushEnabled: settings.pushEnabled,
      emailEnabled: settings.emailEnabled,
      eventReminders: settings.eventReminders,
      newEvents: settings.newEvents,
      promotions: settings.promotions,
      productUpdates: settings.productUpdates,
      registrationUpdates: settings.registrationUpdates,
      spaceUpdates: settings.spaceUpdates,
      organiserAnnouncements: settings.organiserAnnouncements,
      emailEventReminders: settings.emailEventReminders,
      emailNewEvents: settings.emailNewEvents,
      quietHoursStart: settings.quietHoursStart,
      quietHoursEnd: settings.quietHoursEnd,
      marketingEmail: marketing.email,
      marketingWhatsapp: marketing.whatsapp,
      /** Spaces whose marketing email I unsubscribed from. */
      spaceOptOuts: spaces.map((sp) => ({ spaceId: sp.id, spaceName: sp.name })),
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
