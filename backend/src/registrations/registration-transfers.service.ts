import { Injectable, BadRequestException, ConflictException, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GroupSeatStatus, Prisma, SupportCaseKind, SupportDesk } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { decideSubjectCase, openSubjectCase } from '../support/subject-cases';
import { EmailService } from '../email/email.service';
import { h1, p, strong } from '../email/layout';
import { GroupSeatsService } from './group-seats.service';
import { generateQRCode, generateTicketCode } from './registration.util';
import { assertEventCan } from '../events/event-access';
import { Action, AuthorizationService } from '../auth/authorization';

/** Moving a registration to another account: admin-direct, or a curator request an admin reviews. */
@Injectable()
export class RegistrationTransfersService {
  private readonly logger = new Logger(RegistrationTransfersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly authz: AuthorizationService,
    private readonly email: EmailService,
    private readonly seats: GroupSeatsService,
    private readonly events?: EventEmitter2,
  ) {}

  /** Assert the user may manage the event's attendees. */
  private async assertEventOrganiser(userId: string, eventId: string) {
    await assertEventCan(this.prisma, this.authz, userId, eventId, Action.EVENT_MANAGE_ATTENDEES, 'Unauthorized');
  }

  /**
   * Core transfer — reassigns a registration's holder. NO authorisation here;
   * callers gate it (admin-direct, or an approved organiser request). The same
   * ticket, payment record and group roster move across; only who the
   * registration belongs to changes, with a group's seat 1 (the lead's pass)
   * and any pending lead handover withdrawn. The booking's QR and its own
   * tickets' codes are rotated, so a copy the old holder saved or was emailed
   * stops scanning; members' seat tickets are theirs and stay.
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
    // A group's seat 1 moves with the booking below, so its new holder can't
    // also keep a member seat in the same team.
    const inGroup = await db.groupSeat.count({
      where: { registrationId: registration.id, claimedByUserId: identity.userId, status: GroupSeatStatus.CLAIMED },
    });
    if (inGroup > 0) {
      throw new ConflictException('That account already has a seat in this group. Make them the team lead instead.');
    }

    // Conditional on the holder we checked: a concurrent transfer that moved
    // it first makes this one fail instead of silently overwriting it.
    const moved = await db.eventRegistration.updateMany({
      where: { id: registration.id, userId: registration.userId },
      data: { userId: identity.userId, qrCode: generateQRCode() },
    });
    if (moved.count !== 1) {
      throw new ConflictException('This registration just changed hands. Refresh and try again.');
    }
    // The booking's own tickets are unstamped. So are seat tickets from claims
    // made before tickets were stamped: those were minted at the claim (see
    // seatTicketOf), so skip any made within a minute of a member's claim.
    const [own, claims] = await Promise.all([
      db.eventTicket.findMany({ where: { registrationId: registration.id, attendeeEmail: null }, select: { id: true, createdAt: true } }),
      db.groupSeat.findMany({
        where: { registrationId: registration.id, seatIndex: { gt: 1 }, claimedByUserId: { not: null }, claimedAt: { not: null } },
        select: { claimedAt: true },
      }),
    ]);
    for (const t of own) {
      if (claims.some((c) => Math.abs(+t.createdAt - +c.claimedAt!) < 60_000)) continue;
      await db.eventTicket.update({ where: { id: t.id }, data: { qrCode: generateQRCode(), ticketCode: generateTicketCode() } });
    }
    // Seat 1 is the lead's pass: left on the old holder it kept their ticket
    // and QR (A28). The old holder's details go with them.
    await db.groupSeat.updateMany({
      where: { registrationId: registration.id, seatIndex: 1 },
      data: { claimedByUserId: identity.userId, claimedAt: new Date(), memberDetails: Prisma.DbNull },
    });
    await GroupSeatsService.cancelPendingLeadTransfer(db, registration.id);
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
    const moved = await this.prisma.$transaction((tx) => this.performTransfer(registration, email, tx));
    void this.notifyTransfer(registration.userId, moved);
    return moved;
  }

  /**
   * Tell the old and the new holder the ticket moved, and send the new holder
   * their pass (the rotated QR). Best-effort.
   */
  private async notifyTransfer(fromUserId: string, moved: { id: string; eventId: string; user: { id: string; email: string | null } }) {
    const { eventId } = moved;
    const toEmail = moved.user.email;
    try {
      const [from, event] = await Promise.all([
        this.prisma.userIdentity.findFirst({
          where: { userId: fromUserId, email: { not: null } },
          orderBy: { isPrimary: 'desc' },
          select: { email: true },
        }),
        this.prisma.event.findUnique({ where: { id: eventId }, select: { title: true } }),
      ]);
      const title = event?.title ?? 'your event';
      const send = (to: string, subject: string, html: string) =>
        this.email.sendRawEmail(to, subject, html).catch((err) => this.logger.error(`Transfer notice failed to ${to}`, err));
      if (from?.email) {
        await send(
          from.email,
          `Your ticket for ${title} was transferred`,
          h1('Your ticket was transferred') +
            p(`The organiser moved your ticket for ${strong(title)} to another account, so it's no longer valid for you. If you think this is a mistake, contact the organiser.`),
        );
      }
      if (toEmail) {
        await send(
          toEmail,
          `You have a ticket for ${title}`,
          h1('A ticket is yours') +
            p(`The organiser moved a ticket for ${strong(title)} to your account. Open it in the Unifesto app under Tickets.`),
        );
      }
      await this.seats.resendConfirmation(moved.id, moved.user.id);
    } catch (err) {
      this.logger.error(`Transfer notices failed for event ${eventId}`, err as Error);
    }
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
      const row = await this.prisma.registrationTransferRequest.create({
        data: {
          registrationId,
          requestedBy: userId,
          targetEmail: email.trim(),
          reason: reason ?? null,
          status: 'PENDING',
        },
        include: this.transferRequestInclude(),
      });
      const holder = row.registration.user;
      openSubjectCase(this.events, {
        subjectType: 'RegistrationTransferRequest',
        subjectId: row.id,
        requesterId: userId,
        kind: SupportCaseKind.REQUEST,
        requestType: 'REGISTRATION_TRANSFER',
        desk: SupportDesk.PLATFORM,
        spaceId: row.registration.event.spaceId,
        eventId,
        subject: `Move a ticket for ${row.registration.event.title}`,
        message: `Please move ${holder?.fullName || holder?.username || 'this attendee'}'s ticket to ${row.targetEmail}.${reason ? ` ${reason}` : ''}`,
      });
      return row;
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
    const movedTo = await this.prisma.$transaction(async (tx) => {
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
        const moved = await this.performTransfer(
          req.registration,
          overrideEmail?.trim() || req.targetEmail,
          tx,
        );
        return moved;
      }
      return undefined;
    });

    if (movedTo !== undefined) {
      void this.notifyTransfer(req.registration.userId, movedTo);
    }
    decideSubjectCase(this.events, {
      subjectType: 'RegistrationTransferRequest',
      subjectId: requestId,
      actorId: adminId,
      approved: status === 'APPROVED',
      what: 'the ticket transfer',
      note: reviewNote,
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
