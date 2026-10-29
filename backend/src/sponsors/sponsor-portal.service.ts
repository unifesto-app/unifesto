import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SponsorLeadSource, SponsorUserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BoothScanDto } from './dto/sponsor.dto';

/**
 * The sponsor portal (P5): what a signed-in sponsor person sees and does. Access
 * is scoped to the Sponsor entities they belong to (SponsorUser), NOT the
 * space/event role matrix — so enforcement lives here as membership checks, the
 * same way JUDGE is scoped to its events rather than the matrix.
 */
@Injectable()
export class SponsorPortalService {
  constructor(private readonly prisma: PrismaService) {}

  /** Throws unless the user is an active member of the sponsor. */
  private async assertMember(userId: string, sponsorId: string): Promise<void> {
    const membership = await this.prisma.sponsorUser.findUnique({
      where: { sponsorId_userId: { sponsorId, userId } },
      select: { status: true },
    });
    if (!membership || membership.status === SponsorUserStatus.REVOKED) {
      throw new ForbiddenException('You do not have access to this sponsor.');
    }
  }

  /**
   * The sponsors this user can act for, with the events each is attached to.
   * First access also flips their INVITED memberships to ACTIVE (accepting the
   * invite implicitly on sign-in), so the curator's list reflects who has
   * actually logged in.
   */
  async getMySponsors(userId: string) {
    await this.prisma.sponsorUser.updateMany({
      where: { userId, status: SponsorUserStatus.INVITED },
      data: { status: SponsorUserStatus.ACTIVE, acceptedAt: new Date() },
    });

    const memberships = await this.prisma.sponsorUser.findMany({
      where: { userId, status: SponsorUserStatus.ACTIVE },
      select: {
        sponsor: {
          select: {
            id: true,
            name: true,
            logoUrl: true,
            space: { select: { id: true, name: true } },
            eventSponsors: {
              select: {
                id: true,
                leadCaptureEnabled: true,
                event: {
                  select: {
                    id: true,
                    title: true,
                    slug: true,
                    startDateTime: true,
                  },
                },
                _count: { select: { leads: true } },
              },
              orderBy: { event: { startDateTime: 'desc' } },
            },
          },
        },
      },
    });

    return memberships.map((m) => ({
      sponsorId: m.sponsor.id,
      name: m.sponsor.name,
      logoUrl: m.sponsor.logoUrl,
      spaceName: m.sponsor.space.name,
      leadCount: m.sponsor.eventSponsors.reduce(
        (sum, es) => sum + es._count.leads,
        0,
      ),
      events: m.sponsor.eventSponsors.map((es) => ({
        eventSponsorId: es.id,
        eventId: es.event.id,
        title: es.event.title,
        slug: es.event.slug,
        startDateTime: es.event.startDateTime,
        leadCaptureEnabled: es.leadCaptureEnabled,
        leadCount: es._count.leads,
      })),
    }));
  }

  /** All leads captured for one of the user's sponsors, newest first. */
  async getSponsorLeads(userId: string, sponsorId: string) {
    await this.assertMember(userId, sponsorId);
    const rows = await this.prisma.sponsorLead.findMany({
      where: { eventSponsor: { sponsorId } },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        source: true,
        note: true,
        createdAt: true,
        eventSponsor: {
          select: { id: true, event: { select: { id: true, title: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      phone: r.phone,
      source: r.source,
      note: r.note,
      createdAt: r.createdAt,
      eventSponsorId: r.eventSponsor.id,
      eventId: r.eventSponsor.event.id,
      eventTitle: r.eventSponsor.event.title,
    }));
  }

  /**
   * Booth scan: a sponsor person scans an attendee's ticket QR at their booth.
   * The scanner shows the attendee a prompt first, and the DTO refuses a scan
   * without their yes (`attendeeConsent`), so a BOOTH_SCAN lead is a consented
   * share. Idempotent: scanning the same attendee twice is a no-op.
   */
  async boothScan(userId: string, sponsorId: string, dto: BoothScanDto) {
    await this.assertMember(userId, sponsorId);

    const es = await this.prisma.eventSponsor.findFirst({
      where: { id: dto.eventSponsorId, sponsorId },
      select: { id: true, eventId: true, leadCaptureEnabled: true },
    });
    if (!es) {
      throw new NotFoundException('That booth is not linked to your sponsor.');
    }
    if (!es.leadCaptureEnabled) {
      throw new ForbiddenException(
        'Lead capture is turned off for your sponsor at this event.',
      );
    }

    const reg = await this.prisma.eventRegistration.findUnique({
      where: { qrCode: dto.qrCode.trim() },
      select: { id: true, eventId: true, userId: true },
    });
    if (!reg || reg.eventId !== es.eventId) {
      throw new NotFoundException('That ticket is not valid for this event.');
    }

    const attendee = await this.prisma.user.findUnique({
      where: { id: reg.userId },
      select: {
        fullName: true,
        mobileNumber: true,
        identities: {
          where: { email: { not: null } },
          orderBy: { isPrimary: 'desc' },
          select: { email: true },
          take: 1,
        },
      },
    });

    const lead = await this.prisma.sponsorLead.upsert({
      where: {
        eventSponsorId_registrationId: {
          eventSponsorId: es.id,
          registrationId: reg.id,
        },
      },
      update: {},
      create: {
        eventSponsorId: es.id,
        registrationId: reg.id,
        name: attendee?.fullName ?? null,
        email: attendee?.identities[0]?.email ?? null,
        phone: attendee?.mobileNumber ?? null,
        source: SponsorLeadSource.BOOTH_SCAN,
        capturedBy: userId,
      },
      select: { id: true, name: true, email: true },
    });

    return {
      captured: true,
      lead: { id: lead.id, name: lead.name, email: lead.email },
    };
  }
}
