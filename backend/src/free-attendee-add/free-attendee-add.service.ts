import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFreeAddRequestDto, ReviewFreeAddRequestDto, RevokeFreeAddRequestDto } from './dto';

/**
 * "Add attendees for free" exception flow — mirrors WhiteLabelService.
 *
 * Comping a PAID ticket (single add, CSV import, curator add-seats) is blocked
 * by default so the platform fee is never silently waived. An organiser asks
 * for N free seats on one event (optionally one ticket type); a Platform Admin
 * approves a seat count or rejects, and can revoke later (A27). Comps draw the
 * quota down through `takeFreeAddSeats`. `event.allowFreeAttendeeAdd` mirrors
 * "has a live approval" for older clients. Raising a request is gated at the
 * controller by @Can(EVENT_MANAGE_ATTENDEES); the admin routes are @Roles(ADMIN).
 */
@Injectable()
export class FreeAttendeeAddService {
  constructor(private readonly prisma: PrismaService) {}

  private requestInclude(withContact = false) {
    return {
      space: { select: { id: true, name: true, slug: true } },
      event: { select: { id: true, title: true, slug: true } },
      ticketType: { select: { id: true, name: true, price: true } },
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

  async createRequest(userId: string, dto: CreateFreeAddRequestDto) {
    const event = await this.prisma.event.findUnique({
      where: { id: dto.eventId },
      select: { id: true, spaceId: true },
    });
    if (!event) throw new NotFoundException('Event not found');
    if (dto.ticketTypeId) {
      const tt = await this.prisma.eventTicketType.findFirst({
        where: { id: dto.ticketTypeId, eventId: dto.eventId },
        select: { id: true },
      });
      if (!tt) throw new BadRequestException('That ticket type is not on this event.');
    }

    // One pending request per event. An approval no longer blocks a new
    // request: an organiser who used up their seats asks for more.
    const existing = await this.prisma.freeAttendeeAddRequest.findFirst({
      where: { eventId: dto.eventId, status: 'PENDING' },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException(
        'A free-add request for this event is already awaiting review.',
      );
    }

    return this.prisma.freeAttendeeAddRequest.create({
      data: {
        eventId: dto.eventId,
        spaceId: event.spaceId,
        requestedBy: userId,
        reason: dto.reason,
        ticketTypeId: dto.ticketTypeId ?? null,
        requestedSeats: dto.seats ?? null,
        status: 'PENDING',
      },
      include: this.requestInclude(),
    });
  }

  /** Requests raised by this user (optionally scoped to one event). */
  async getMyRequests(userId: string, eventId?: string) {
    return this.prisma.freeAttendeeAddRequest.findMany({
      where: { requestedBy: userId, ...(eventId ? { eventId } : {}) },
      include: this.requestInclude(),
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Every request on one event, for its curators (who raised it doesn't matter). */
  async getEventRequests(eventId: string) {
    return this.prisma.freeAttendeeAddRequest.findMany({
      where: { eventId },
      include: this.requestInclude(),
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Platform-admin inbox. */
  async getAllRequests(status?: string, page = 1, limit = 20) {
    const where = status ? { status } : {};
    const [requests, total] = await Promise.all([
      this.prisma.freeAttendeeAddRequest.findMany({
        where,
        include: this.requestInclude(true),
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.freeAttendeeAddRequest.count({ where }),
    ]);
    return {
      requests,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Admin decision, claimed atomically (PENDING only) so two admins can't both
   * decide. Approving grants `approvedSeats` (default: what was asked for) and
   * turns the event's legacy flag on; rejecting only records it.
   */
  async reviewRequest(
    requestId: string,
    adminId: string,
    dto: ReviewFreeAddRequestDto,
  ) {
    const req = await this.prisma.freeAttendeeAddRequest.findUnique({
      where: { id: requestId },
    });
    if (!req) throw new NotFoundException('Request not found');
    if (req.status !== 'PENDING') {
      throw new BadRequestException('This request has already been reviewed.');
    }
    const approvedSeats = dto.approvedSeats ?? req.requestedSeats ?? null;
    if (dto.status === 'APPROVED' && approvedSeats == null) {
      throw new BadRequestException('Set how many free seats to approve.');
    }

    const decided = {
      reviewNote: dto.reviewNote ?? null,
      reviewedBy: adminId,
      reviewedAt: new Date(),
    };
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.freeAttendeeAddRequest.updateMany({
        where: { id: requestId, status: 'PENDING' },
        data:
          dto.status === 'APPROVED'
            ? { status: 'APPROVED', approvedSeats, ...decided }
            : { status: 'REJECTED', ...decided },
      });
      if (claimed.count !== 1) {
        throw new ConflictException('This request was just reviewed by someone else.');
      }
      if (dto.status === 'APPROVED') {
        await tx.event.update({ where: { id: req.eventId }, data: { allowFreeAttendeeAdd: true } });
      }
    });
    return this.prisma.freeAttendeeAddRequest.findUniqueOrThrow({
      where: { id: requestId },
      include: this.requestInclude(true),
    });
  }

  /**
   * Admin withdraws an approval: seats already comped stay, no new ones. The
   * event's legacy flag goes off once it has no live approval left.
   */
  async revokeRequest(requestId: string, adminId: string, dto: RevokeFreeAddRequestDto) {
    const req = await this.prisma.freeAttendeeAddRequest.findUnique({
      where: { id: requestId },
      select: { eventId: true },
    });
    if (!req) throw new NotFoundException('Request not found');
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.freeAttendeeAddRequest.updateMany({
        where: { id: requestId, status: 'APPROVED' },
        data: {
          status: 'REVOKED',
          reviewNote: dto.reviewNote ?? null,
          reviewedBy: adminId,
          reviewedAt: new Date(),
        },
      });
      if (claimed.count !== 1) throw new BadRequestException('Only an approved request can be revoked.');
      const live = await tx.freeAttendeeAddRequest.count({
        where: { eventId: req.eventId, status: 'APPROVED' },
      });
      if (live === 0) {
        await tx.event.update({ where: { id: req.eventId }, data: { allowFreeAttendeeAdd: false } });
      }
    });
    return this.prisma.freeAttendeeAddRequest.findUniqueOrThrow({
      where: { id: requestId },
      include: this.requestInclude(true),
    });
  }
}
