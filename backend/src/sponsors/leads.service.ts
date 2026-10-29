import { Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EventStatus, LeadSource, LeadStatus, Prisma } from '@prisma/client';
import { SPACE_ADMIN_ROLE_CODES } from '../auth/authorization';
import { NotificationEvents } from '../notifications/notifications.constants';
import type { NotifyBatchEvent } from '../notifications/notifications.events';
import { PrismaService } from '../prisma/prisma.service';
import { PUBLIC_LIVE_SPACE_WHERE } from '../spaces/space-access';
import { PlanConfigService } from '../subscription/plan-config.service';
import {
  CaptureLeadDto,
  CreateLeadDto,
  UpdateLeadDto,
} from './dto/lead.dto';

/**
 * The organiser's own lead funnel (P4) — people who signalled interest but have
 * not (necessarily) registered: "Notify me" on an event, an inquiry on a space
 * page, or a manual/imported add. Distinct from SponsorLead (attendee→sponsor);
 * this stream belongs to the space and feeds the organiser's outreach.
 *
 * Public capture is unauthenticated (it happens on the marketing site / app),
 * so it only takes leads for what the public can see, never rewrites an
 * existing lead, and is throttled per caller in PublicLeadsController.
 * Management is space-scoped and gated at the controller by
 * `space:manage-sponsors`.
 */
@Injectable()
export class LeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly planConfig: PlanConfigService,
    private readonly events: EventEmitter2,
  ) {}

  // ---- Public capture -----------------------------------------------------

  /**
   * "Notify me" on an event, before registering. Live events of a public, live
   * space only. The person then gets the event's date or venue changes and the
   * day-before reminder (interest-fanout.ts).
   */
  async captureEventInterest(eventId: string, dto: CaptureLeadDto) {
    const event = await this.prisma.event.findFirst({
      where: {
        id: eventId,
        deletedAt: null,
        status: { in: [EventStatus.PUBLISHED, EventStatus.ONGOING] },
        space: PUBLIC_LIVE_SPACE_WHERE,
      },
      select: { id: true, spaceId: true },
    });
    if (!event) throw new NotFoundException('Event not found');

    const email = dto.email.trim().toLowerCase();
    // One per (event, email). A repeat is a no-op: an unauthenticated caller
    // must not be able to rewrite someone else's name, phone or message.
    const existing = await this.prisma.lead.findFirst({
      where: {
        spaceId: event.spaceId,
        eventId: event.id,
        source: LeadSource.EVENT_INTEREST,
        email: { equals: email, mode: 'insensitive' },
      },
      select: { id: true },
    });
    if (!existing) {
      await this.prisma.lead.create({
        data: {
          spaceId: event.spaceId,
          eventId: event.id,
          source: LeadSource.EVENT_INTEREST,
          name: dto.name ?? null,
          email,
          phone: dto.phone ?? null,
          message: dto.message ?? null,
        },
      });
    }
    return { captured: true };
  }

  /**
   * An inquiry from a public space page. Each inquiry is its own lead (a new
   * message never overwrites an earlier one), and every Space Admin is told.
   */
  async captureSpaceInquiry(spaceId: string, dto: CaptureLeadDto) {
    const space = await this.prisma.space.findFirst({
      where: { id: spaceId, ...PUBLIC_LIVE_SPACE_WHERE },
      select: { id: true, name: true },
    });
    if (!space) throw new NotFoundException('Space not found');

    const lead = await this.prisma.lead.create({
      data: {
        spaceId: space.id,
        eventId: null,
        source: LeadSource.SPACE_INQUIRY,
        name: dto.name ?? null,
        email: dto.email.trim().toLowerCase(),
        phone: dto.phone ?? null,
        message: dto.message ?? null,
      },
      select: { id: true, name: true, email: true, phone: true, message: true },
    });
    await this.alertSpaceAdmins(space, lead);
    return { captured: true };
  }

  /** Push (email when push can't land) to each Space Admin, in the background. */
  private async alertSpaceAdmins(
    space: { id: string; name: string },
    lead: { id: string; name: string | null; email: string | null; phone: string | null; message: string | null },
  ) {
    const admins = await this.prisma.userRole.findMany({
      where: { spaceId: space.id, eventId: null, role: { code: { in: [...SPACE_ADMIN_ROLE_CODES] } } },
      select: { userId: true },
    });
    const data = {
      spaceId: space.id,
      leadId: lead.id,
      spaceName: space.name,
      fromName: lead.name ?? undefined,
      fromEmail: lead.email ?? '',
      fromPhone: lead.phone ?? undefined,
      message: lead.message ?? undefined,
    };
    this.events.emit(NotificationEvents.NotifyBatch, {
      kind: 'space.inquiry',
      items: [...new Set(admins.map((a) => a.userId))].map((userId) => ({ userId, data })),
    } satisfies NotifyBatchEvent<'space.inquiry'>);
  }

  // ---- Curator management -------------------------------------------------

  async listLeads(
    spaceId: string,
    filters: { status?: LeadStatus; source?: LeadSource; eventId?: string },
  ) {
    await this.planConfig.assertFeature(spaceId, 'hasSponsors');
    const where: Prisma.LeadWhereInput = { spaceId };
    if (filters.status) where.status = filters.status;
    if (filters.source) where.source = filters.source;
    if (filters.eventId) where.eventId = filters.eventId;

    return this.prisma.lead.findMany({
      where,
      include: { event: { select: { id: true, title: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createLead(spaceId: string, dto: CreateLeadDto) {
    await this.planConfig.assertFeature(spaceId, 'hasSponsors');
    if (dto.eventId) await this.assertEventInSpace(spaceId, dto.eventId);
    return this.prisma.lead.create({
      data: {
        spaceId,
        eventId: dto.eventId ?? null,
        source: LeadSource.MANUAL,
        name: dto.name ?? null,
        email: dto.email ?? null,
        phone: dto.phone ?? null,
        message: dto.message ?? null,
      },
      include: { event: { select: { id: true, title: true } } },
    });
  }

  async updateLead(spaceId: string, id: string, dto: UpdateLeadDto) {
    await this.getOwnedLead(spaceId, id);
    return this.prisma.lead.update({
      where: { id },
      data: {
        status: dto.status,
        name: dto.name,
        email: dto.email,
        phone: dto.phone,
        message: dto.message,
      },
      include: { event: { select: { id: true, title: true } } },
    });
  }

  async deleteLead(spaceId: string, id: string) {
    await this.getOwnedLead(spaceId, id);
    await this.prisma.lead.delete({ where: { id } });
    return { deleted: true };
  }

  /** Update and delete come through here: the plan gate, then ownership. */
  private async getOwnedLead(spaceId: string, id: string) {
    await this.planConfig.assertFeature(spaceId, 'hasSponsors');
    const lead = await this.prisma.lead.findFirst({ where: { id, spaceId } });
    if (!lead) throw new NotFoundException('Lead not found');
    return lead;
  }

  private async assertEventInSpace(spaceId: string, eventId: string) {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, spaceId, deletedAt: null },
      select: { id: true },
    });
    if (!event) throw new NotFoundException('Event not found in this space');
  }
}
