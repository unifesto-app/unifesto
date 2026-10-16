import { Injectable, BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { assertEventCan } from '../events/event-access';
import { Action, AuthorizationService } from '../auth/authorization';

/** Moving a registration to another account: admin-direct, or a curator request an admin reviews. */
@Injectable()
export class RegistrationTransfersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authz: AuthorizationService,
  ) {}

  /** Assert the user may manage the event's attendees. */
  private async assertEventOrganiser(userId: string, eventId: string) {
    await assertEventCan(this.prisma, this.authz, userId, eventId, Action.EVENT_MANAGE_ATTENDEES, 'Unauthorized');
  }

  /**
   * Core transfer — reassigns a registration's holder. NO authorisation here;
   * callers gate it (admin-direct, or an approved organiser request). The same
   * ticket, QR code, payment record and group roster move across untouched;
   * only who the registration belongs to changes.
   *
   * The target must already have a Unifesto account (an email identity): a
   * ticket can only be handed to someone who can sign in and see it. And they
   * must not already hold a registration for this event's same ticket type,
   * which the `@@unique([eventId, userId, ticketTypeId])` constraint forbids —
   * we check first so the caller gets a clear message, not a raw DB error.
   */
  private async performTransfer(
    registration: { id: string; eventId: string; userId: string; ticketTypeId: string | null },
    email: string,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    const normalizedEmail = email.trim();
    if (!normalizedEmail) {
      throw new BadRequestException('An email is required');
    }

    // Resolve the target account from its email identity. Case-insensitive, and
    // preferring the account's primary identity when an email appears more than
    // once (e.g. linked via both email and Google).
    const identity = await db.userIdentity.findFirst({
      where: { email: { equals: normalizedEmail, mode: 'insensitive' } },
      orderBy: { isPrimary: 'desc' },
      select: { userId: true },
    });
    if (!identity) {
      throw new NotFoundException(
        'No Unifesto account uses that email. Ask them to sign in to the app once, then transfer the ticket.',
      );
    }

    if (identity.userId === registration.userId) {
      throw new BadRequestException(
        'This registration already belongs to that account.',
      );
    }

    const clash = await db.eventRegistration.findFirst({
      where: {
        eventId: registration.eventId,
        userId: identity.userId,
        ticketTypeId: registration.ticketTypeId,
      },
    });
    if (clash) {
      throw new ConflictException(
        'That account already has a registration for this event.',
      );
    }

    // Conditional on the holder we checked: a concurrent transfer that moved
    // it first makes this one fail instead of silently overwriting it.
    const moved = await db.eventRegistration.updateMany({
      where: { id: registration.id, userId: registration.userId },
      data: { userId: identity.userId },
    });
    if (moved.count !== 1) {
      throw new ConflictException('This registration just changed hands. Refresh and try again.');
    }
    const updated = await db.eventRegistration.findUniqueOrThrow({
      where: { id: registration.id },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            username: true,
            mobileNumber: true,
            identities: { select: { email: true }, take: 1 },
          },
        },
        ticketType: { select: { id: true, name: true } },
      },
    });

    const { identities, ...newUser } = updated.user as any;
    return {
      ...updated,
      user: { ...newUser, email: identities?.[0]?.email || null },
    };
  }

  /** Admin transfers a registration directly, no request needed. */
  async adminTransferRegistration(
    eventId: string,
    registrationId: string,
    email: string,
  ) {
    const registration = await this.prisma.eventRegistration.findFirst({
      where: { id: registrationId, eventId },
      select: { id: true, eventId: true, userId: true, ticketTypeId: true },
    });
    if (!registration) throw new NotFoundException('Registration not found');
    return this.performTransfer(registration, email);
  }

  /**
   * Organiser raises a transfer request for an admin to review. Organisers
   * cannot move tickets themselves — this only records the ask.
   */
  async requestRegistrationTransfer(
    userId: string,
    eventId: string,
    registrationId: string,
    email: string,
    reason?: string,
  ) {
    await this.assertEventOrganiser(userId, eventId);

    const registration = await this.prisma.eventRegistration.findFirst({
      where: { id: registrationId, eventId },
      select: { id: true },
    });
    if (!registration) throw new NotFoundException('Registration not found');

    if (!email.trim()) throw new BadRequestException('An email is required');

    const existing = await this.prisma.registrationTransferRequest.findFirst({
      where: { registrationId, status: 'PENDING' },
    });
    if (existing) {
      throw new ConflictException(
        'A transfer request for this registration is already awaiting review',
      );
    }

    // The partial unique index (one PENDING per registration) settles the race
    // the findFirst above can't: the second concurrent request gets a 409.
    try {
      return await this.prisma.registrationTransferRequest.create({
        data: {
          registrationId,
          requestedBy: userId,
          targetEmail: email.trim(),
          reason: reason ?? null,
          status: 'PENDING',
        },
        include: this.transferRequestInclude(),
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException(
          'A transfer request for this registration is already awaiting review',
        );
      }
      throw err;
    }
  }

  /** Transfer requests raised by this organiser. */
  async getMyTransferRequests(userId: string) {
    return this.prisma.registrationTransferRequest.findMany({
      where: { requestedBy: userId },
      include: this.transferRequestInclude(),
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Admin inbox of transfer requests. */
  async getAllTransferRequests(status?: string, page = 1, limit = 20) {
    const where = status ? { status } : {};
    const [requests, total] = await Promise.all([
      this.prisma.registrationTransferRequest.findMany({
        where,
        include: this.transferRequestInclude(),
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.registrationTransferRequest.count({ where }),
    ]);
    return {
      requests,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Admin decision. Approving performs the transfer to `overrideEmail` if the
   * admin adjusted it, otherwise to the requested email — so the admin stays in
   * full control of the outcome.
   */
  async reviewTransferRequest(
    requestId: string,
    adminId: string,
    status: 'APPROVED' | 'REJECTED',
    reviewNote?: string,
    overrideEmail?: string,
  ) {
    const req = await this.prisma.registrationTransferRequest.findUnique({
      where: { id: requestId },
      include: {
        registration: {
          select: { id: true, eventId: true, userId: true, ticketTypeId: true },
        },
      },
    });
    if (!req) throw new NotFoundException('Request not found');
    if (req.status !== 'PENDING') {
      throw new BadRequestException('This request has already been reviewed');
    }

    // Claim the request and move the ticket in one transaction: two admins
    // reviewing at once can't both act, and if the transfer fails (unknown
    // email, clash) the claim rolls back so the request stays PENDING.
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.registrationTransferRequest.updateMany({
        where: { id: requestId, status: 'PENDING' },
        data: {
          status,
          reviewNote: reviewNote ?? null,
          reviewedBy: adminId,
          reviewedAt: new Date(),
          ...(overrideEmail?.trim() ? { targetEmail: overrideEmail.trim() } : {}),
        },
      });
      if (claimed.count !== 1) {
        throw new BadRequestException('This request has already been reviewed');
      }
      if (status === 'APPROVED') {
        await this.performTransfer(
          req.registration,
          overrideEmail?.trim() || req.targetEmail,
          tx,
        );
      }
    });

    return this.prisma.registrationTransferRequest.findUniqueOrThrow({
      where: { id: requestId },
      include: this.transferRequestInclude(),
    });
  }

  private transferRequestInclude() {
    return {
      registration: {
        select: {
          id: true,
          groupSize: true,
          event: { select: { id: true, title: true, slug: true, spaceId: true } },
          ticketType: { select: { id: true, name: true } },
          user: {
            select: {
              id: true,
              fullName: true,
              username: true,
              identities: { select: { email: true }, take: 1 },
            },
          },
        },
      },
      requester: { select: { id: true, fullName: true, username: true } },
    };
  }
}
