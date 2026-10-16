import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { sessionMoneyRecords } from '../common/money-records';
import { PaymentsService } from '../payments/payments.service';
import { EmailService } from '../email/email.service';
import { LivekitService } from './livekit.service';
import { PlanConfigService } from '../subscription/plan-config.service';
import type { WebhookEvent } from 'livekit-server-sdk';
import { Cron } from '@nestjs/schedule';
import { SoldOutError, takeSessionSeat } from '../registrations/capacity.util';
import {
  Prisma,
  PaymentStatus,
  RegistrationStatus,
  SessionPlatform,
  SessionStatus,
  SessionVisibility,
} from '@prisma/client';
import slugify from 'slugify';
import { Action, AuthorizationService, SPACE_ADMIN_ROLE_CODES } from '../auth/authorization';
import { canCancel, joinWindow } from './session-policy';
import {
  NOT_DELETED,
  deletedWhere,
  type DeletedFilter,
} from '../common/soft-delete';
import {
  CreateSessionDto,
  UpdateSessionDto,
  VerifySessionPaymentDto,
} from './dto';
import { h1, p, strong } from '../email/layout';

@Injectable()
export class SessionsService {
  private readonly logger = new Logger(SessionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PaymentsService,
    private readonly email: EmailService,
    private readonly livekit: LivekitService,
    private readonly planConfig: PlanConfigService,
    private readonly authz: AuthorizationService,
  ) {}

  // ---------------------------------------------------------------------------
  // Authorization & helpers
  // ---------------------------------------------------------------------------

  /**
   * Space Admins of the owning space may manage its sessions, and
   * only if the space's plan includes Sessions.
   *
   * The plan checked is the *space creator's*, not the acting user's: a
   * Space Admin works under the owner's subscription, exactly like the ticket
   * type and attendee limits do.
   *
   * Deliberately not applied to attendee-facing paths (joining, registering,
   * viewing a session). If a plan loses the feature, sessions already sold stay
   * reachable for the people who paid for them — the gate closes the organiser's
   * ability to run new ones, it does not strip access from attendees.
   */
  private async assertCanManageSpace(userId: string, spaceId: string) {
    if (!(await this.authz.can({ id: userId }, Action.SPACE_CREATE_EVENT, { spaceId }))) {
      throw new ForbiddenException('You cannot manage sessions for this space');
    }

    await this.assertPlanAllowsSessions(spaceId);
  }

  /** Rejects when the space owner's plan does not include Sessions. */
  private async assertPlanAllowsSessions(spaceId: string) {
    const space = await this.prisma.space.findUnique({
      where: { id: spaceId },
      select: { subscription: true },
    });

    const subscription = space?.subscription;
    // No subscription row at all: leave the existing behaviour alone rather
    // than locking out a space whose billing has not been set up yet.
    if (!subscription) return;

    if (!this.planConfig.getEffectiveLimits(subscription).hasSessions) {
      throw new ForbiddenException(
        'Sessions are not included in this plan. Ask an admin to enable Sessions for your plan.',
      );
    }
  }

  /**
   * A "host" for a session is either a space manager (Space Admin)
   * or a per-session co-host the organiser invited. Hosts get a host token on
   * join and cannot register as attendees.
   */
  private async isSessionHost(
    userId: string,
    sessionId: string,
    spaceId: string,
  ): Promise<boolean> {
    const [managerCount, coHost] = await Promise.all([
      this.prisma.userRole.count({
        where: {
          userId,
          spaceId,
          role: { code: { in: [...SPACE_ADMIN_ROLE_CODES] } },
        },
      }),
      this.prisma.sessionCoHost.findUnique({
        where: { sessionId_userId: { sessionId, userId } },
      }),
    ]);
    return managerCount > 0 || coHost !== null;
  }

  private generateSlug(title: string): string {
    const base = slugify(title, { lower: true, strict: true });
    const suffix = Math.random().toString(36).substring(2, 8);
    return `${base}-${suffix}`;
  }

  /** The user's email (lives on UserIdentity, not User). Prefers the primary
   * identity but falls back to any identity with an email. May be null. */
  private async getPrimaryEmail(userId: string): Promise<string | null> {
    const identity = await this.prisma.userIdentity.findFirst({
      where: { userId, email: { not: null } },
      orderBy: { isPrimary: 'desc' },
      select: { email: true },
    });
    return identity?.email ?? null;
  }

  /** The public shape of a session — never includes the meeting link. */
  private readonly publicSelect = {
    id: true,
    slug: true,
    title: true,
    description: true,
    coverImageUrl: true,
    platform: true,
    platformOther: true,
    startDateTime: true,
    durationMinutes: true,
    timezone: true,
    capacity: true,
    registeredCount: true,
    price: true,
    currency: true,
    status: true,
    visibility: true,
    recordingUrl: true,
    cancelledAt: true,
    cancellationReason: true,
    createdAt: true,
    space: {
      select: { id: true, name: true, slug: true, logoUrl: true },
    },
  } satisfies Prisma.SessionSelect;

  // ---------------------------------------------------------------------------
  // Organiser: create / update / lifecycle
  // ---------------------------------------------------------------------------

  async createSession(userId: string, spaceId: string, dto: CreateSessionDto) {
    await this.assertCanManageSpace(userId, spaceId);

    if (dto.platform === 'OTHER' && !dto.platformOther) {
      throw new BadRequestException(
        'platformOther is required when platform is OTHER',
      );
    }

    const isLive = dto.platform === SessionPlatform.UNIFESTO_LIVE;
    if (!isLive && !dto.meetingUrl) {
      throw new BadRequestException(
        'meetingUrl is required for external platforms',
      );
    }

    // Live sessions have no external link — the LiveKit room auto-creates on
    // first join, so there is nothing to provision or store here.
    return this.prisma.session.create({
      data: {
        spaceId,
        createdBy: userId,
        slug: this.generateSlug(dto.title),
        title: dto.title,
        description: dto.description,
        coverImageUrl: dto.coverImageUrl,
        platform: dto.platform,
        meetingUrl: isLive ? null : dto.meetingUrl,
        interactive: dto.interactive ?? true,
        platformOther: dto.platformOther,
        startDateTime: new Date(dto.startDateTime),
        durationMinutes: dto.durationMinutes ?? 60,
        timezone: dto.timezone ?? 'Asia/Kolkata',
        capacity: dto.capacity ?? null,
        price: new Prisma.Decimal(dto.price ?? 0),
        visibility: dto.visibility ?? SessionVisibility.PUBLIC,
      },
    });
  }

  /**
   * Load a session the caller is allowed to manage.
   *
   * A hidden session is treated as missing by default, so no ordinary
   * management action (edit, publish, cancel, co-hosts) can reach one. The two
   * operations that legitimately act *on* hidden rows — restore and permanent
   * delete — opt in with `allowDeleted`.
   */
  private async loadManagedSession(
    userId: string,
    sessionId: string,
    allowDeleted = false,
  ) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });
    if (!session) throw new NotFoundException('Session not found');
    if (session.deletedAt && !allowDeleted) {
      throw new NotFoundException('Session not found');
    }
    await this.assertCanManageSpace(userId, session.spaceId);
    return session;
  }

  async updateSession(
    userId: string,
    sessionId: string,
    dto: UpdateSessionDto,
  ) {
    const session = await this.loadManagedSession(userId, sessionId);
    if (
      session.status === SessionStatus.CANCELLED ||
      session.status === SessionStatus.COMPLETED
    ) {
      throw new BadRequestException('Cannot edit a finished session');
    }

    // Re-check the create-time rules against the values after this edit.
    const platform = dto.platform ?? session.platform;
    const isLive = platform === SessionPlatform.UNIFESTO_LIVE;
    if (!isLive && !(dto.meetingUrl ?? session.meetingUrl)) {
      throw new BadRequestException('meetingUrl is required for external platforms');
    }
    if (platform === 'OTHER' && !(dto.platformOther ?? session.platformOther)) {
      throw new BadRequestException('platformOther is required when platform is OTHER');
    }
    if (dto.capacity != null && dto.capacity < session.registeredCount) {
      throw new BadRequestException(
        `Capacity can't go below the ${session.registeredCount} already registered`,
      );
    }

    return this.prisma.session.update({
      where: { id: sessionId },
      data: {
        title: dto.title,
        description: dto.description,
        coverImageUrl: dto.coverImageUrl,
        platform: dto.platform,
        meetingUrl: isLive ? null : dto.meetingUrl,
        interactive: dto.interactive,
        platformOther: dto.platformOther,
        startDateTime: dto.startDateTime
          ? new Date(dto.startDateTime)
          : undefined,
        durationMinutes: dto.durationMinutes,
        timezone: dto.timezone,
        capacity: dto.capacity,
        price:
          dto.price !== undefined ? new Prisma.Decimal(dto.price) : undefined,
        visibility: dto.visibility,
      },
    });
  }

  async publishSession(userId: string, sessionId: string) {
    const session = await this.loadManagedSession(userId, sessionId);
    if (session.status !== SessionStatus.DRAFT) {
      throw new BadRequestException('Only a draft session can be published');
    }
    if (session.startDateTime.getTime() <= Date.now()) {
      throw new BadRequestException('Cannot publish a session in the past');
    }
    return this.prisma.session.update({
      where: { id: sessionId },
      data: { status: SessionStatus.PUBLISHED },
    });
  }

  /**
   * End a live session now (organiser-initiated). Only a PUBLISHED session can
   * be ended. Stops any in-flight recording, closes the LiveKit room so nobody
   * lingers, and marks the session COMPLETED. This is the manual counterpart to
   * the scheduler that auto-completes sessions past their scheduled end.
   */
  async completeSession(userId: string, sessionId: string) {
    const session = await this.loadManagedSession(userId, sessionId);
    if (session.status !== SessionStatus.PUBLISHED) {
      throw new BadRequestException('Only a live session can be ended');
    }
    if (session.recordingEgressId) {
      await this.livekit.stopRecording(session.recordingEgressId);
    }
    if (session.platform === SessionPlatform.UNIFESTO_LIVE) {
      await this.livekit.endRoom(this.livekit.roomName(session.id));
    }
    return this.prisma.session.update({
      where: { id: sessionId },
      data: { status: SessionStatus.COMPLETED, recordingEgressId: null },
    });
  }

  /**
   * Permanently delete a session. Only DRAFT sessions can be deleted — they were
   * never published, so there are no registrations, payments or refunds to
   * preserve. Published/completed/cancelled sessions keep their financial
   * history and must be cancelled or ended instead.
   */
  /**
   * Hide a finished session without destroying it. Mirrors `softDeleteEvent`:
   * only COMPLETED and CANCELLED qualify, because both are over and hiding one
   * takes nothing from anyone.
   *
   * Sessions have no ONGOING status, but a live one is always PUBLISHED, so the
   * same status check keeps a session that is under way from being hidden out
   * from under the people currently in it.
   */
  async softDeleteSession(userId: string, sessionId: string) {
    const session = await this.loadManagedSession(userId, sessionId);
    if (session.deletedAt) {
      throw new BadRequestException('This session is already hidden');
    }
    if (
      session.status !== SessionStatus.COMPLETED &&
      session.status !== SessionStatus.CANCELLED
    ) {
      throw new BadRequestException(
        'Only completed or cancelled sessions can be hidden. Cancel or end it first.',
      );
    }

    await this.prisma.session.update({
      where: { id: sessionId },
      data: { deletedAt: new Date(), deletedBy: userId },
    });
    return { hidden: true };
  }

  /** Bring a hidden session back, registrations and recording intact. */
  async restoreSession(userId: string, sessionId: string) {
    const session = await this.loadManagedSession(userId, sessionId, true);
    if (!session.deletedAt) {
      throw new BadRequestException('This session is not hidden');
    }

    await this.prisma.session.update({
      where: { id: sessionId },
      data: { deletedAt: null, deletedBy: null },
    });
    return { restored: true };
  }

  /**
   * Destroy a session and everything cascading from it. Irreversible.
   *
   * Never allowed once COMPLETED — it happened, people attended and paid, and
   * that record is not the organiser's to erase. Hide it instead. DRAFT and
   * CANCELLED are the only truly deletable states.
   */
  async permanentDeleteSession(userId: string, sessionId: string) {
    const session = await this.loadManagedSession(userId, sessionId, true);

    if (session.status === SessionStatus.COMPLETED) {
      throw new BadRequestException(
        'A completed session cannot be permanently deleted — its attendance and payment records must be kept. Hide it instead.',
      );
    }
    if (
      session.status !== SessionStatus.DRAFT &&
      session.status !== SessionStatus.CANCELLED
    ) {
      throw new BadRequestException(
        'Only draft or cancelled sessions can be deleted. Cancel it first.',
      );
    }
    // Paid registrations (refunded or not) are financial records the cascade would erase.
    if ((await sessionMoneyRecords(this.prisma, { id: sessionId })) > 0) {
      throw new BadRequestException(
        'This session has payment records and cannot be deleted. Hide it instead.',
      );
    }

    await this.prisma.session.delete({ where: { id: sessionId } });
    return { deleted: true };
  }

  /**
   * Cancel a session and auto-refund every paid attendee (base amount, matching
   * the platform refund policy). Whether cancellation is allowed at all is
   * decided by `canCancel` in session-policy.
   */
  async cancelSession(userId: string, sessionId: string, reason?: string) {
    const session = await this.loadManagedSession(userId, sessionId);

    const decision = canCancel(session);
    if (!decision.allowed) {
      throw new BadRequestException(decision.reason);
    }

    // Claim the cancel: two overlapping requests must not both refund.
    const claimed = await this.prisma.session.updateMany({
      where: { id: sessionId, status: session.status },
      data: {
        status: SessionStatus.CANCELLED,
        cancelledAt: new Date(),
        cancellationReason: reason,
      },
    });
    if (claimed.count !== 1) {
      throw new BadRequestException('This session just changed. Refresh and try again.');
    }

    // Read after the claim: a verify that committed before it is seen here; one
    // after it finds the session closed and refunds itself (takeSessionSeat).
    const paidRegistrations = await this.prisma.sessionRegistration.findMany({
      where: {
        sessionId,
        paymentStatus: PaymentStatus.PAID,
        status: RegistrationStatus.REGISTERED,
      },
    });
    const now = new Date();
    await this.prisma.sessionRegistration.updateMany({
      where: { id: { in: paidRegistrations.map((r) => r.id) }, status: RegistrationStatus.REGISTERED },
      data: { status: RegistrationStatus.CANCELLED, cancelledAt: now, refundDueAt: now },
    });

    let refunded = 0;
    for (const reg of paidRegistrations) {
      const amount = await this.refundDue(reg.id);
      if (amount == null) continue; // failed: the retry job finishes it
      refunded += 1;
      const email = await this.getPrimaryEmail(reg.userId);
      await this.notifyCancellation(email, session.title, amount).catch((err) =>
        this.logger.error(`Cancellation notice failed for session registration ${reg.id}`, err),
      );
    }

    this.logger.log(
      `Cancelled session ${sessionId}; refunded ${refunded}/${paidRegistrations.length} paid attendees`,
    );
    return { cancelled: true, refunded, totalPaid: paidRegistrations.length };
  }

  /**
   * Send a due session refund: base only (the processing fee is kept, same as
   * every other refund; a sold-out row had its fee zeroed so it all goes back).
   * Claimed by pushing `refundDueAt` an hour out, so replicas, retries and a
   * concurrent cancel never refund twice. Returns the amount, or null when the
   * row wasn't due or Razorpay failed (left due for {@link retryDueRefunds}).
   */
  async refundDue(registrationId: string): Promise<number | null> {
    const now = new Date();
    const claimed = await this.prisma.sessionRegistration.updateMany({
      where: { id: registrationId, refundDueAt: { lte: now }, paymentStatus: PaymentStatus.PAID },
      data: { refundDueAt: new Date(now.getTime() + 60 * 60_000) },
    });
    if (claimed.count !== 1) return null;
    const reg = await this.prisma.sessionRegistration.findUniqueOrThrow({ where: { id: registrationId } });
    const amount = Math.max(
      0,
      Math.round((Number(reg.razorpayAmount) - Number(reg.processingFee)) * 100) / 100,
    );
    try {
      if (amount > 0 && reg.paymentId) await this.payments.refund(reg.paymentId, amount);
    } catch (err) {
      this.logger.error(
        `CRITICAL: refund of session registration ${registrationId} failed, retrying later: ${(err as Error).message}`,
      );
      return null;
    }
    await this.prisma.sessionRegistration.update({
      where: { id: registrationId },
      data: {
        refundDueAt: null,
        ...(amount > 0 && { paymentStatus: PaymentStatus.REFUNDED, refundedAmount: new Prisma.Decimal(amount) }),
      },
    });
    return amount;
  }

  /** Retry session refunds that didn't go through the first time. */
  @Cron('*/15 * * * *')
  async retryDueRefunds(): Promise<void> {
    const due = await this.prisma.sessionRegistration.findMany({
      where: { refundDueAt: { lte: new Date() }, paymentStatus: PaymentStatus.PAID },
      select: { id: true },
      take: 100,
    });
    for (const r of due) await this.refundDue(r.id);
  }

  private async notifyCancellation(
    email: string | null,
    title: string,
    amount: number,
  ) {
    if (!email) return;
    const money =
      amount > 0
        ? ` A refund of ₹${amount.toFixed(2)} has been initiated to your original payment method.`
        : '';
    await this.email.sendRawEmail(
      email,
      `Cancelled: ${title}`,
      h1('Session cancelled') + p(`${strong(title)} was cancelled by the organiser.${money}`),
    );
  }

  /** Duplicate a session as a fresh DRAFT (the v1 stand-in for recurrence). */
  async duplicateSession(userId: string, sessionId: string) {
    const source = await this.loadManagedSession(userId, sessionId);
    return this.prisma.session.create({
      data: {
        spaceId: source.spaceId,
        createdBy: userId,
        slug: this.generateSlug(source.title),
        title: source.title,
        description: source.description,
        coverImageUrl: source.coverImageUrl,
        platform: source.platform,
        meetingUrl: source.meetingUrl,
        platformOther: source.platformOther,
        startDateTime: source.startDateTime,
        durationMinutes: source.durationMinutes,
        timezone: source.timezone,
        capacity: source.capacity,
        price: source.price,
        currency: source.currency,
        visibility: source.visibility,
        status: SessionStatus.DRAFT,
      },
    });
  }

  async addRecording(userId: string, sessionId: string, recordingUrl: string) {
    await this.loadManagedSession(userId, sessionId);
    return this.prisma.session.update({
      where: { id: sessionId },
      data: { recordingUrl },
    });
  }

  /** Organiser view — includes the meeting link and attendee count. */
  /**
   * A space's sessions for the organiser. `deleted` picks which side of the
   * soft-delete line to return — 'deleted' backs the trash view where hidden
   * sessions are restored or purged.
   */
  async listSpaceSessions(
    userId: string,
    spaceId: string,
    deleted: DeletedFilter = 'active',
  ) {
    await this.assertCanManageSpace(userId, spaceId);
    return this.prisma.session.findMany({
      where: { ...deletedWhere(deleted), spaceId },
      orderBy: { startDateTime: 'desc' },
    });
  }

  async listAttendees(userId: string, sessionId: string) {
    await this.loadManagedSession(userId, sessionId);
    const registrations = await this.prisma.sessionRegistration.findMany({
      where: { sessionId, status: RegistrationStatus.REGISTERED },
      orderBy: { registeredAt: 'desc' },
      select: {
        id: true,
        paymentStatus: true,
        totalAmount: true,
        joinedAt: true,
        registeredAt: true,
        user: {
          select: {
            id: true,
            fullName: true,
            username: true,
            identities: {
              where: { email: { not: null } },
              orderBy: { isPrimary: 'desc' },
              select: { email: true },
              take: 1,
            },
          },
        },
      },
    });

    // Flatten the primary-identity email onto each attendee for a clean payload.
    return registrations.map(({ user, ...reg }) => ({
      ...reg,
      user: {
        id: user.id,
        fullName: user.fullName,
        username: user.username,
        email: user.identities[0]?.email ?? null,
      },
    }));
  }

  // ---------------------------------------------------------------------------
  // Co-hosts (per-session guest hosts)
  // ---------------------------------------------------------------------------

  async listCoHosts(userId: string, sessionId: string) {
    await this.loadManagedSession(userId, sessionId);
    const coHosts = await this.prisma.sessionCoHost.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        userId: true,
        createdAt: true,
        user: {
          select: {
            fullName: true,
            username: true,
            identities: {
              where: { email: { not: null } },
              orderBy: { isPrimary: 'desc' },
              select: { email: true },
              take: 1,
            },
          },
        },
      },
    });
    return coHosts.map(({ user, ...c }) => ({
      id: c.id,
      userId: c.userId,
      createdAt: c.createdAt,
      fullName: user.fullName,
      username: user.username,
      email: user.identities[0]?.email ?? null,
    }));
  }

  /** Add a co-host by email. The target must be an existing Unifesto user. */
  async addCoHost(userId: string, sessionId: string, email: string) {
    const session = await this.loadManagedSession(userId, sessionId);
    const identity = await this.prisma.userIdentity.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { userId: true },
    });
    if (!identity) {
      throw new NotFoundException('No Unifesto user with that email');
    }
    if (identity.userId === session.createdBy) {
      throw new BadRequestException('The creator already hosts this session');
    }
    await this.prisma.sessionCoHost.upsert({
      where: { sessionId_userId: { sessionId, userId: identity.userId } },
      create: { sessionId, userId: identity.userId },
      update: {},
    });
    return this.listCoHosts(userId, sessionId);
  }

  async removeCoHost(userId: string, sessionId: string, coHostUserId: string) {
    await this.loadManagedSession(userId, sessionId);
    await this.prisma.sessionCoHost.deleteMany({
      where: { sessionId, userId: coHostUserId },
    });
    return this.listCoHosts(userId, sessionId);
  }

  // ---------------------------------------------------------------------------
  // Attendee: discovery / detail
  // ---------------------------------------------------------------------------

  /** Public discovery — published, public, upcoming sessions. No links. */
  async listPublicSessions() {
    return this.prisma.session.findMany({
      where: {
        ...NOT_DELETED,
        status: SessionStatus.PUBLISHED,
        visibility: SessionVisibility.PUBLIC,
        startDateTime: { gte: new Date() },
      },
      orderBy: { startDateTime: 'asc' },
      select: this.publicSelect,
    });
  }

  /** Public detail by slug — the meeting link is never included here. */
  async getPublicSession(slug: string) {
    const session = await this.prisma.session.findUnique({
      where: { slug },
      // `deletedAt` is not in publicSelect (it never goes over the wire), so
      // select it separately just to test it here.
      select: { ...this.publicSelect, deletedAt: true },
    });
    // A hidden session 404s exactly like a missing one: hiding is private
    // housekeeping and must not be detectable from outside.
    if (!session || session.deletedAt || session.status === SessionStatus.DRAFT) {
      throw new NotFoundException('Session not found');
    }
    const { deletedAt: _hidden, ...publicSession } = session;
    return publicSession;
  }

  // ---------------------------------------------------------------------------
  // Attendee: register / pay / join
  // ---------------------------------------------------------------------------

  /**
   * Register the caller. Free sessions complete immediately; paid sessions
   * create a PENDING registration and a Razorpay order for the client to pay,
   * then confirm via `verifyPayment`.
   */
  async register(userId: string, sessionId: string) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });
    // The `deletedAt` test is belt-and-braces today — only COMPLETED and
    // CANCELLED sessions can be hidden, and neither is PUBLISHED — but it keeps
    // this path correct if the hideable states are ever widened.
    if (
      !session ||
      session.deletedAt ||
      session.status !== SessionStatus.PUBLISHED
    ) {
      throw new NotFoundException('Session not open for registration');
    }
    if (session.startDateTime.getTime() <= Date.now()) {
      throw new BadRequestException('Registration has closed');
    }

    // The creator and any host/co-host run the session — they join with a host
    // token and must not take an attendee seat.
    if (
      session.createdBy === userId ||
      (await this.isSessionHost(userId, sessionId, session.spaceId))
    ) {
      throw new BadRequestException(
        'You host this session — you don’t need to register.',
      );
    }

    const existing = await this.prisma.sessionRegistration.findUnique({
      where: { sessionId_userId: { sessionId, userId } },
    });
    if (existing && existing.status === RegistrationStatus.REGISTERED) {
      throw new BadRequestException('Already registered for this session');
    }
    // A row that ever took a payment is that payment's record (refunded or
    // due back); reusing it would overwrite the money trail.
    if (existing?.paymentId) {
      throw new BadRequestException(
        'Your earlier registration for this session was refunded. Contact the host to register again.',
      );
    }

    if (
      session.capacity != null &&
      session.registeredCount >= session.capacity
    ) {
      throw new BadRequestException('Session is full');
    }

    const basePrice = Number(session.price);

    // Free session — complete immediately, count the seat, no Razorpay round-trip.
    if (basePrice <= 0) {
      const registration = await this.prisma.$transaction(async (tx) => {
        const free = { status: RegistrationStatus.REGISTERED, paymentStatus: PaymentStatus.PAID, paidAt: new Date() };
        let reg;
        if (existing) {
          // Conditional on the row we read, so a double tap can't count twice.
          const revived = await tx.sessionRegistration.updateMany({
            where: { id: existing.id, status: RegistrationStatus.CANCELLED, paymentId: null },
            data: { ...free, cancelledAt: null },
          });
          if (revived.count !== 1) throw new BadRequestException('Already registered for this session');
          reg = existing;
        } else {
          reg = await tx.sessionRegistration.create({ data: { sessionId, userId, ...free } });
        }
        await takeSessionSeat(tx, sessionId);
        return reg;
      });
      return { registrationId: registration.id, needsPayment: false };
    }

    // Paid session — fee identical to events, Razorpay-only.
    const processingFee = this.payments.computeProcessingFee(basePrice);
    const totalAmount = basePrice + processingFee;

    const registration = await this.prisma.sessionRegistration.upsert({
      where: { sessionId_userId: { sessionId, userId } },
      create: {
        sessionId,
        userId,
        totalAmount: new Prisma.Decimal(totalAmount),
        razorpayAmount: new Prisma.Decimal(totalAmount),
        processingFee: new Prisma.Decimal(processingFee),
        paymentStatus: PaymentStatus.PENDING,
      },
      update: {
        status: RegistrationStatus.REGISTERED,
        totalAmount: new Prisma.Decimal(totalAmount),
        razorpayAmount: new Prisma.Decimal(totalAmount),
        processingFee: new Prisma.Decimal(processingFee),
        paymentStatus: PaymentStatus.PENDING,
        cancelledAt: null,
      },
    });

    const order = await this.payments.createOrder({
      amount: totalAmount,
      // Razorpay caps `receipt` at 40 chars; a UUID is 36, so keep the prefix
      // to 2 chars ("s_" + uuid = 38). "sess_" + uuid = 41 overflows and 500s.
      receipt: `s_${registration.id}`,
      notes: { registrationId: registration.id, sessionId, userId },
    });

    await this.prisma.sessionRegistration.update({
      where: { id: registration.id },
      data: { orderId: order.orderId },
    });

    return {
      registrationId: registration.id,
      needsPayment: true,
      razorpayOrderId: order.orderId,
      razorpayKeyId: process.env.RAZORPAY_KEY_ID,
      amount: Math.round(totalAmount * 100),
      currency: order.currency,
      basePrice,
      processingFee,
      totalAmount,
    };
  }

  async verifyPayment(userId: string, dto: VerifySessionPaymentDto) {
    if (
      !this.payments.verifyPaymentSignature(
        dto.razorpayOrderId,
        dto.razorpayPaymentId,
        dto.razorpaySignature,
      )
    ) {
      throw new BadRequestException('Invalid payment signature');
    }

    const registration = await this.prisma.sessionRegistration.findUnique({
      where: { id: dto.registrationId },
    });
    if (!registration) throw new NotFoundException('Registration not found');
    if (registration.userId !== userId) {
      throw new ForbiddenException('Unauthorized');
    }
    // The signature proves a genuine payment, not that it paid for THIS row:
    // PAID unlocks the LiveKit join token, so a cheap receipt must not replay.
    // Strict match (no notes fallback): the row is reused per (session, user),
    // so an earlier order's notes name it too, including a refunded one.
    if (dto.razorpayOrderId !== registration.orderId) {
      throw new BadRequestException('That payment is for a different order.');
    }
    // The Razorpay webhook and this client-side verify race to confirm the same
    // payment. When the webhook wins, the row is already PAID by the time the
    // browser's verify arrives — that is success, not an error. The signature
    // check above already proved the payment is genuine, so return success
    // idempotently instead of a scary "Payment already completed" 400.
    if (registration.paymentStatus === PaymentStatus.PAID) {
      this.logger.log(
        `verifyPayment: session registration ${registration.id} already PAID ` +
          `(likely completed by the webhook first) — returning success idempotently`,
      );
      return { registrationId: registration.id, paid: true };
    }
    // Never revive a refunded / cancelled row with its original receipt.
    if (
      registration.status === RegistrationStatus.CANCELLED ||
      (registration.paymentStatus !== PaymentStatus.PENDING &&
        registration.paymentStatus !== PaymentStatus.FAILED)
    ) {
      throw new BadRequestException('This registration can no longer be paid.');
    }

    let soldOut = false;
    await this.prisma.$transaction(async (tx) => {
      // Atomic claim: two overlapping verifies both saw PENDING above; only the
      // one that flips the row counts the seat.
      const claimed = await tx.sessionRegistration.updateMany({
        where: {
          id: registration.id,
          status: { not: RegistrationStatus.CANCELLED },
          paymentStatus: { in: [PaymentStatus.PENDING, PaymentStatus.FAILED] },
        },
        data: {
          paymentStatus: PaymentStatus.PAID,
          paymentId: dto.razorpayPaymentId,
          orderId: dto.razorpayOrderId,
          paidAt: new Date(),
        },
      });
      if (claimed.count === 0) return;
      try {
        await takeSessionSeat(tx, registration.sessionId);
      } catch (err) {
        if (!(err instanceof SoldOutError)) throw err;
        // Full or cancelled while they paid: nothing was delivered, so the fee
        // goes back too (zeroed, as events do) and the whole payment is due.
        soldOut = true;
        const now = new Date();
        await tx.sessionRegistration.update({
          where: { id: registration.id },
          data: {
            status: RegistrationStatus.CANCELLED,
            cancelledAt: now,
            refundDueAt: now,
            processingFee: new Prisma.Decimal(0),
          },
        });
      }
    });

    if (soldOut) {
      await this.refundDue(registration.id);
      throw new BadRequestException(
        `This session filled up or closed while you were paying. Your payment of ₹${Number(registration.razorpayAmount)} is being refunded in full.`,
      );
    }

    return { registrationId: registration.id, paid: true };
  }

  /** The caller's own session registrations, upcoming first. No links. */
  async listMyRegistrations(userId: string) {
    return this.prisma.sessionRegistration.findMany({
      // Hiding a session takes it off the attendee's list too — the row and
      // its payment survive, so restoring brings the ticket straight back.
      where: {
        userId,
        status: RegistrationStatus.REGISTERED,
        session: NOT_DELETED,
      },
      orderBy: { session: { startDateTime: 'asc' } },
      select: {
        id: true,
        paymentStatus: true,
        joinedAt: true,
        registeredAt: true,
        session: { select: this.publicSelect },
      },
    });
  }

  /**
   * Resolve join access for a session. Two paths:
   *
   *   - Space managers (Space Admins) *host* the session. They get a
   *     host credential without registering or paying, and may open the room
   *     early to set up (no join-window gate).
   *   - Everyone else must be a paid registrant, and only inside the join window
   *     (see session-policy) — so access can't leak to non-registrants or hours
   *     ahead. Their first join stamps `joinedAt`, our attendance signal.
   *
   * For UNIFESTO_LIVE sessions the credential is a per-user LiveKit token (never
   * a URL); for external platforms it is the gated meeting URL, as before.
   */
  async join(userId: string, sessionId: string) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });
    if (!session || session.deletedAt) {
      throw new NotFoundException('Session not found');
    }
    if (session.status === SessionStatus.CANCELLED) {
      throw new BadRequestException('This session was cancelled');
    }
    // A room only exists between publish and end — you can't go live (host) or
    // join (attendee) a draft or a finished session.
    if (session.status === SessionStatus.DRAFT) {
      throw new BadRequestException('Publish the session before going live');
    }
    if (session.status === SessionStatus.COMPLETED) {
      throw new BadRequestException('This session has ended');
    }

    const isHost = await this.isSessionHost(userId, session.id, session.spaceId);

    const window = joinWindow(session);

    if (!isHost) {
      const registration = await this.prisma.sessionRegistration.findUnique({
        where: { sessionId_userId: { sessionId, userId } },
      });
      if (
        !registration ||
        registration.status !== RegistrationStatus.REGISTERED ||
        registration.paymentStatus !== PaymentStatus.PAID
      ) {
        throw new ForbiddenException(
          'Register for this session to get the link',
        );
      }
      if (!window.isOpen) {
        throw new BadRequestException(
          `The join link opens at ${window.opensAt.toISOString()}`,
        );
      }
      if (!registration.joinedAt) {
        await this.prisma.sessionRegistration.update({
          where: { id: registration.id },
          data: { joinedAt: new Date() },
        });
      }
    }

    const role: 'host' | 'viewer' = isHost ? 'host' : 'viewer';

    // In-app live session: hand back a per-user LiveKit token, never a URL. The
    // token expires when the join window closes, so it is useless afterwards
    // and useless to anyone it is forwarded to (it names this user).
    if (session.platform === SessionPlatform.UNIFESTO_LIVE) {
      const room = this.livekit.roomName(session.id);
      const name = await this.getDisplayName(userId);
      const ttlSeconds = Math.max(
        300,
        Math.ceil((window.closesAt.getTime() - Date.now()) / 1000),
      );
      const token = await this.livekit.mintToken({
        room,
        identity: userId,
        name,
        role,
        interactive: session.interactive,
        ttlSeconds,
      });
      return {
        mode: 'livekit' as const,
        platform: session.platform,
        serverUrl: this.livekit.serverUrl,
        token,
        room,
        role,
        // Broadcast sessions let only the host publish; interactive lets all.
        canPublish: role === 'host' || session.interactive,
      };
    }

    return {
      mode: 'external' as const,
      meetingUrl: session.meetingUrl,
      platform: session.platform,
      role,
    };
  }

  // ---------------------------------------------------------------------------
  // Live recording (LiveKit Egress → S3)
  // ---------------------------------------------------------------------------

  /** Organiser: start recording a live session. Stores the egress id. */
  async startRecording(userId: string, sessionId: string) {
    const session = await this.loadManagedSession(userId, sessionId);
    if (session.platform !== SessionPlatform.UNIFESTO_LIVE) {
      throw new BadRequestException('Only live sessions can be recorded');
    }
    if (session.recordingEgressId) {
      throw new BadRequestException('This session is already recording');
    }
    const room = this.livekit.roomName(session.id);
    const { egressId } = await this.livekit.startRecording(room, session.id);
    await this.prisma.session.update({
      where: { id: session.id },
      data: { recordingEgressId: egressId },
    });
    return { recording: true };
  }

  /** Organiser: stop an in-flight recording. The file URL arrives via webhook. */
  async stopRecording(userId: string, sessionId: string) {
    const session = await this.loadManagedSession(userId, sessionId);
    if (!session.recordingEgressId) {
      throw new BadRequestException('This session is not recording');
    }
    await this.livekit.stopRecording(session.recordingEgressId);
    return { stopped: true };
  }

  /**
   * Validate a LiveKit webhook (signature over the raw body) and act on it.
   * Returns the event name. Throws if the signature is invalid.
   */
  async verifyAndHandleWebhook(body: string, authHeader?: string) {
    const event = await this.livekit.receiveWebhook(body, authHeader);
    await this.handleWebhook(event);
    return event.event;
  }

  /**
   * Handle a validated LiveKit webhook. Two things we care about:
   *  - participant_joined → server-side attendance stamp (more reliable than the
   *    client stamp) and the natural place to enforce anti-abuse later.
   *  - egress_ended → the recording file is now in S3; save its URL.
   * Unknown events are ignored.
   */
  private async handleWebhook(event: WebhookEvent) {
    if (event.event === 'participant_joined') {
      const sessionId = this.sessionIdFromRoom(event.room?.name);
      const userId = event.participant?.identity;
      if (sessionId && userId) {
        await this.prisma.sessionRegistration
          .updateMany({
            where: { sessionId, userId, joinedAt: null },
            data: { joinedAt: new Date() },
          })
          .catch(() => undefined);
      }
      return;
    }

    if (event.event === 'egress_ended') {
      const egressId = event.egressInfo?.egressId;
      const key = event.egressInfo?.fileResults?.[0]?.filename;
      if (!egressId) return;
      const session = await this.prisma.session.findFirst({
        where: { recordingEgressId: egressId },
        select: { id: true },
      });
      if (!session) return;
      await this.prisma.session.update({
        where: { id: session.id },
        data: {
          recordingUrl: key ? this.livekit.s3Url(key) : undefined,
          recordingEgressId: null,
        },
      });
    }
  }

  /** `sess_<uuid>` → `<uuid>`; null for anything that isn't ours. */
  private sessionIdFromRoom(room?: string | null): string | null {
    if (!room?.startsWith('sess_')) return null;
    return room.slice('sess_'.length);
  }

  /** A friendly display name for the live room (falls back to a generic). */
  private async getDisplayName(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { fullName: true, username: true },
    });
    return user?.fullName || user?.username || 'Guest';
  }
}
