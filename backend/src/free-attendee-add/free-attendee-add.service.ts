import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFreeAddRequestDto, ReviewFreeAddRequestDto } from './dto';

/**
 * "Add attendees for free" exception flow — mirrors WhiteLabelService.
 *
 * Comping a PAID ticket in the manual attendee-add flow (adding someone without
 * collecting payment) is blocked by default so the platform's processing fee is
 * never silently waived. An organiser raises a request for one event; a Platform
 * Admin approves — which flips that event's `allowFreeAttendeeAdd` on — or rejects.
 * Authorization to raise the request is enforced at the controller via
 * @Can(EVENT_MANAGE_ATTENDEES); the admin routes are @Roles(ADMIN).
 */
@Injectable()
export class FreeAttendeeAddService {
  constructor(private readonly prisma: PrismaService) {}

  private requestInclude(withContact = false) {
    return {
      space: { select: { id: true, name: true, slug: true } },
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

  async createRequest(userId: string, dto: CreateFreeAddRequestDto) {
    const event = await this.prisma.event.findUnique({
      where: { id: dto.eventId },
      select: { id: true, spaceId: true, allowFreeAttendeeAdd: true },
    });
    if (!event) throw new NotFoundException('Event not found');

    if (event.allowFreeAttendeeAdd) {
      throw new BadRequestException(
        'Free adds are already enabled for this event.',
      );
    }

    // One pending request per event.
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
   * Admin decision. Approving flips the event's `allowFreeAttendeeAdd` on and
   * records the decision in one transaction; rejecting only records it.
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

    const reviewedAt = new Date();

    if (dto.status === 'REJECTED') {
      return this.prisma.freeAttendeeAddRequest.update({
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

    const [, updated] = await this.prisma.$transaction([
      this.prisma.event.update({
        where: { id: req.eventId },
        data: { allowFreeAttendeeAdd: true },
      }),
      this.prisma.freeAttendeeAddRequest.update({
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

    return updated;
  }
}
