import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  EventType,
  Prisma,
  ReportSection,
  ReportStatus,
  ReportType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Action, AuthorizationService } from '../auth/authorization';
import { PlanConfigService } from '../subscription/plan-config.service';
import { StorageService } from '../storage/storage.service';
import { ReportDataService, ReportWindow } from './report-data.service';
import { ReportRenderService } from './report-render.service';
import { CreateReportDto } from './dto';

/** Every section, in canonical order — the content of a DEFAULT report. */
export const ALL_SECTIONS: ReportSection[] = [
  ReportSection.OVERVIEW,
  ReportSection.CHECKINS,
  ReportSection.TICKETS,
  ReportSection.REVENUE,
  ReportSection.ATTENDEES,
];

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly planConfig: PlanConfigService,
    private readonly data: ReportDataService,
    private readonly render: ReportRenderService,
    private readonly storage: StorageService,
    private readonly authz: AuthorizationService,
  ) {}

  // =====================================================
  // GUARD  (org membership + plan gate) — mirrors certificates
  // =====================================================

  private async assertCanManage(eventId: string, userId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        spaceId: true,
        title: true,
        slug: true,
        status: true,
        type: true,
        startDateTime: true,
        endDateTime: true,
        venueName: true,
        city: true,
        capacity: true,
        space: { select: { name: true } },
      },
    });
    if (!event) throw new NotFoundException('Event not found');

    // Reports carry revenue, so the money capability: the event's Curator, a
    // Space Admin of its space, or a platform admin.
    const user = { id: userId };
    const allowed =
      (await this.authz.can(user, Action.EVENT_MANAGE_MONEY, { eventId })) ||
      (await this.authz.can(user, Action.SPACE_MANAGE_MONEY, { spaceId: event.spaceId }));
    if (!allowed) {
      throw new ForbiddenException(
        'Only an organiser of this event can generate reports',
      );
    }

    if (!(await this.spaceHasAnalyticsPlan(event.spaceId))) {
      throw new ForbiddenException(
        'Reports are not included in this space’s plan. Upgrade to enable them.',
      );
    }

    return event;
  }

  private async spaceHasAnalyticsPlan(spaceId: string): Promise<boolean> {
    const space = await this.prisma.space.findUnique({
      where: { id: spaceId },
      select: { subscription: true },
    });
    const subscription = space?.subscription;
    if (!subscription) return false;
    return this.planConfig.getEffectiveLimits(subscription).hasAnalytics;
  }

  // =====================================================
  // SECTION RESOLUTION  —  YOUR CONTRIBUTION
  // =====================================================

  /**
   * Decide exactly which sections a report will contain, from its `type` and
   * the organiser's `requested` list. This single function IS the Default-vs-
   * Custom distinction — everything downstream (data gathering, rendering, the
   * stored `sections` column) trusts whatever it returns.
   *
   * Contract:
   *   - Return sections in {@link ALL_SECTIONS} canonical order (deduped), so a
   *     report always reads top-to-bottom the same way regardless of click order.
   *   - DEFAULT → the full report: every section (worked example below).
   *   - CUSTOM  → the organiser's chosen subset.
   *
   * Policy decisions that are genuinely yours to make in the CUSTOM branch —
   * there's no single right answer, and it shapes how the feature feels:
   *   1. Is OVERVIEW mandatory? Forcing it in guarantees every report has a
   *      headline summary; leaving it optional gives a truly bare custom report.
   *   2. What does an EMPTY selection mean? Reject it with a BadRequestException,
   *      or fall back to the full report? (An empty PDF is the one thing to avoid.)
   *   3. Anything else — e.g. REVENUE implies OVERVIEW's money is shown twice;
   *      you might dedupe, or leave both as the organiser asked.
   *
   * Reference implementation of the policy decisions from the docblock — adjust
   * to taste:
   *   1. OVERVIEW is NOT forced in. "Custom" means the organiser is in full
   *      control; if they want a bare tickets-only report, they get one. (To
   *      make it mandatory instead: `new Set([ReportSection.OVERVIEW, ...chosen])`.)
   *   2. An EMPTY selection is rejected, not silently expanded to the full
   *      report — a Custom request for nothing is a mistake worth surfacing, and
   *      an empty PDF is the one outcome to avoid. (To fall back instead:
   *      `return [...ALL_SECTIONS]` here rather than throwing.)
   */
  private resolveSections(
    type: ReportType,
    requested?: ReportSection[],
  ): ReportSection[] {
    if (type === ReportType.DEFAULT) {
      // The full report — ignore `requested` entirely.
      return [...ALL_SECTIONS];
    }

    // CUSTOM — the organiser's chosen subset. Filtering ALL_SECTIONS by the
    // requested set canonicalises (fixed top-to-bottom order) AND dedupes in one
    // step, so click order and accidental repeats never leak into the report.
    const chosen = new Set(requested ?? []);
    const sections = ALL_SECTIONS.filter((s) => chosen.has(s));
    if (sections.length === 0) {
      throw new BadRequestException(
        'A custom report needs at least one section.',
      );
    }
    return sections;
  }

  // =====================================================
  // CREATE / GENERATE
  // =====================================================

  /**
   * Create a report row and generate its PDF. The row is written PENDING first
   * so a failed render still leaves an auditable record (flipped to FAILED with
   * the reason) rather than vanishing. Generation is synchronous for v1; the
   * obvious next step for large events is to return the PENDING row immediately
   * and render on a queue.
   */
  async create(userId: string, eventId: string, dto: CreateReportDto) {
    const event = await this.assertCanManage(eventId, userId);

    const sections = this.resolveSections(dto.type, dto.sections);

    const window: ReportWindow = {
      from: dto.dateFrom ? new Date(dto.dateFrom) : null,
      to: dto.dateTo ? new Date(dto.dateTo) : null,
    };
    if (window.from && window.to && window.from > window.to) {
      throw new BadRequestException('dateFrom must be on or before dateTo');
    }

    const title = (dto.title?.trim() || this.defaultTitle(event.title)).slice(
      0,
      200,
    );

    const report = await this.prisma.eventReport.create({
      data: {
        eventId,
        type: dto.type,
        status: ReportStatus.PENDING,
        title,
        sections,
        dateFrom: window.from,
        dateTo: window.to,
        generatedBy: userId,
      },
    });

    try {
      const data = await this.data.gather(eventId, sections, window);
      const generatedAt = new Date();
      const pdf = await this.render.renderPdf({
        event: {
          title: event.title,
          status: event.status,
          startDateTime: event.startDateTime,
          endDateTime: event.endDateTime,
          venue: this.venueLabel(event),
          spaceName: event.space.name,
        },
        reportTitle: title,
        sections,
        window,
        data,
        generatedAt,
      });

      const fileName = `${slugify(title)}.pdf`;
      const fileUrl = await this.storage.uploadBuffer(
        pdf,
        `reports/${report.id}.pdf`,
        'application/pdf',
      );

      return this.prisma.eventReport.update({
        where: { id: report.id },
        data: {
          status: ReportStatus.READY,
          fileUrl,
          fileName,
          stats: (data.overview ??
            data.revenue ??
            null) as unknown as Prisma.InputJsonValue,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Report ${report.id} generation failed: ${message}`);
      await this.prisma.eventReport.update({
        where: { id: report.id },
        data: { status: ReportStatus.FAILED, error: message.slice(0, 500) },
      });
      throw new BadRequestException(`Failed to generate report: ${message}`);
    }
  }

  private defaultTitle(eventTitle: string): string {
    const date = new Date().toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
    return `${eventTitle} — Report (${date})`;
  }

  private venueLabel(event: {
    type: EventType;
    venueName: string | null;
    city: string | null;
  }): string | null {
    if (event.type === EventType.ONLINE) return 'Online';
    return event.venueName || event.city || null;
  }

  // =====================================================
  // LIST / GET / DELETE
  // =====================================================

  async list(userId: string, eventId: string, type?: ReportType) {
    await this.assertCanManage(eventId, userId);
    return this.prisma.eventReport.findMany({
      where: { eventId, ...(type ? { type } : {}) },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        type: true,
        status: true,
        title: true,
        sections: true,
        dateFrom: true,
        dateTo: true,
        stats: true,
        fileUrl: true,
        fileName: true,
        error: true,
        createdAt: true,
      },
    });
  }

  async remove(userId: string, reportId: string) {
    const report = await this.prisma.eventReport.findUnique({
      where: { id: reportId },
      select: { eventId: true },
    });
    if (!report) throw new NotFoundException('Report not found');
    await this.assertCanManage(report.eventId, userId);

    await this.prisma.eventReport.delete({ where: { id: reportId } });
    return { deleted: true };
  }
}

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'event-report'
  );
}
