import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { LeadSource, LeadStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
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
 * Public capture is unauthenticated (it happens on the marketing site / app);
 * management is space-scoped and gated at the controller by
 * `space:manage-sponsors`.
 */
@Injectable()
export class LeadsService {
  constructor(private readonly prisma: PrismaService) {}

  // ---- Public capture -----------------------------------------------------

  /** "Notify me" / "I'm interested" on an event, before registering. */
  async captureEventInterest(eventId: string, dto: CaptureLeadDto) {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, deletedAt: null },
      select: { id: true, spaceId: true },
    });
    if (!event) throw new NotFoundException('Event not found');

    await this.upsertPublicLead({
      spaceId: event.spaceId,
      eventId: event.id,
      source: LeadSource.EVENT_INTEREST,
      dto,
    });
    return { captured: true };
  }

  /** An inquiry submitted from a public space page. */
  async captureSpaceInquiry(spaceId: string, dto: CaptureLeadDto) {
    const space = await this.prisma.space.findUnique({
      where: { id: spaceId },
      select: { id: true },
    });
    if (!space) throw new NotFoundException('Space not found');

    await this.upsertPublicLead({
      spaceId: space.id,
      eventId: null,
      source: LeadSource.SPACE_INQUIRY,
      dto,
    });
    return { captured: true };
  }

  /**
   * De-dupe public captures by (space, source, event, email): a second "notify
   * me" from the same person refreshes their message rather than piling up rows.
   * A NEW lead is never silently downgraded from a later status by this path —
   * we only touch NEW rows on repeat.
   */
  private async upsertPublicLead(args: {
    spaceId: string;
    eventId: string | null;
    source: LeadSource;
    dto: CaptureLeadDto;
  }): Promise<void> {
    const { spaceId, eventId, source, dto } = args;
    const existing = await this.prisma.lead.findFirst({
      where: { spaceId, eventId, source, email: dto.email },
      select: { id: true },
    });
    if (existing) {
      await this.prisma.lead.update({
        where: { id: existing.id },
        data: { name: dto.name, phone: dto.phone, message: dto.message },
      });
      return;
    }
    await this.prisma.lead.create({
      data: {
        spaceId,
        eventId,
        source,
        name: dto.name ?? null,
        email: dto.email,
        phone: dto.phone ?? null,
        message: dto.message ?? null,
      },
    });
  }

  // ---- Curator management -------------------------------------------------

  async listLeads(
    spaceId: string,
    filters: { status?: LeadStatus; source?: LeadSource; eventId?: string },
  ) {
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

  private async getOwnedLead(spaceId: string, id: string) {
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
