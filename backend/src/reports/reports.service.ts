import {
  BadRequestException,
  ForbiddenException,
  forwardRef,
  Inject,
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
import slugify from 'slugify';
import { PrismaService } from '../prisma/prisma.service';
import { Action, AuthorizationService } from '../auth/authorization';
import { PlanConfigService } from '../subscription/plan-config.service';
import { StorageService } from '../storage/storage.service';
import { ReportDataService, ReportWindow } from './report-data.service';
import { ReportRenderService } from './report-render.service';
import { CreateReportDto } from './dto';
import { CertificateIssuanceQueue } from '../certificates/certificates.queue';
import { AiService } from '../ai/ai.service';
import { eventHasEnded, reportSummaryFacts, reportSummaryRequest } from './report-summary';

/** Every section, in canonical order — the content of a DEFAULT report. */
/** A PENDING report older than this was cut off mid-render. */
export const REPORT_STALE_MS = 15 * 60 * 1000;

const REPORT_EVENT_SELECT = {
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
} satisfies Prisma.EventSelect;

/**
 * A report bound from the API. A bare date ("2026-10-15", what the date picker
 * sends) is a whole day in IST: `from` its first instant, `to` its last. Before
 * B19 a bare `to` parsed as UTC midnight and dropped the day it named.
 */
export function reportBound(value: string | undefined, end: boolean): Date | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T${end ? '23:59:59.999' : '00:00:00.000'}+05:30`);
  }
  return new Date(value);
}

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
    @Inject(forwardRef(() => CertificateIssuanceQueue))
    private readonly queue: CertificateIssuanceQueue,
    private readonly ai: AiService,
  ) {}

  // =====================================================
  // GUARD  (org membership + plan gate) — mirrors certificates
  // =====================================================

  private async assertCanManage(eventId: string, userId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: REPORT_EVENT_SELECT,
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
   * Create a report row and generate its PDF in the background. The PENDING
   * row is returned straight away (the space app polls the list until it is
   * READY or FAILED); a failed render flips it to FAILED with the reason. A
   * render cut off by a restart is failed lazily by `list` after
   * REPORT_STALE_MS, so it never spins forever.
   */
  async create(userId: string, eventId: string, dto: CreateReportDto) {
    const event = await this.assertCanManage(eventId, userId);

    const sections = this.resolveSections(dto.type, dto.sections);

    const window: ReportWindow = {
      from: reportBound(dto.dateFrom, false),
      to: reportBound(dto.dateTo, true),
    };
    if (window.from && window.to && window.from > window.to) {
      throw new BadRequestException('dateFrom must be on or before dateTo');
    }

    const title = (dto.title?.trim() || this.defaultTitle(event.title)).slice(
      0,
      200,
    );

    // One render per event at a time (B19): asking again while one is still
    // generating returns that one instead of rendering a second PDF.
    const inFlight = await this.prisma.eventReport.findFirst({
      where: {
        eventId,
        status: ReportStatus.PENDING,
        updatedAt: { gte: new Date(Date.now() - REPORT_STALE_MS) },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (inFlight) return inFlight;

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

    // Rendered in cert-worker (B19), not on this API replica; inline only
    // when no queue is configured (local dev).
    if (!(await this.queue.addReport(report.id))) {
      void this.generate(report.id, event, eventId, sections, window, title, userId);
    }
    return report;
  }

  /**
   * Regenerate a report in place (M3): the same request re-rendered, with a
   * fresh AI summary on top. Only for ended events, where the summary applies.
   */
  async regenerate(userId: string, eventId: string, reportId: string) {
    const event = await this.assertCanManage(eventId, userId);
    const report = await this.prisma.eventReport.findFirst({ where: { id: reportId, eventId } });
    if (!report) throw new NotFoundException('Report not found');
    if (report.status === ReportStatus.PENDING) return report;
    if (!eventHasEnded(event)) {
      throw new BadRequestException('A summary is written once the event has ended.');
    }
    // generatedBy moves to whoever asked, so the AI daily cap counts their call.
    const pending = await this.prisma.eventReport.update({
      where: { id: reportId },
      data: { status: ReportStatus.PENDING, error: null, aiSummary: null, aiSummaryAt: null, generatedBy: userId },
    });
    if (!(await this.queue.addReport(reportId))) {
      void this.generate(
        reportId,
        event,
        eventId,
        report.sections as ReportSection[],
        { from: report.dateFrom, to: report.dateTo },
        report.title,
        userId,
      );
    }
    return pending;
  }

  /** Worker entry point: render a queued report from its stored request. */
  async generateById(reportId: string): Promise<void> {
    const report = await this.prisma.eventReport.findUnique({ where: { id: reportId } });
    if (!report || report.status !== ReportStatus.PENDING) return;
    const event = await this.prisma.event.findUnique({ where: { id: report.eventId }, select: REPORT_EVENT_SELECT });
    if (!event) return;
    await this.generate(
      report.id,
      event,
      report.eventId,
      report.sections as ReportSection[],
      { from: report.dateFrom, to: report.dateTo },
      report.title,
      report.generatedBy,
    );
  }

  private async generate(
    reportId: string,
    event: Awaited<ReturnType<ReportsService['assertCanManage']>>,
    eventId: string,
    sections: ReportSection[],
    window: ReportWindow,
    title: string,
    userId: string,
  ): Promise<void> {
    const report = { id: reportId };
    try {
      // An ended event also gets the M3 summary, written from this same gather
      // (overview + tickets come from the one registration read; only drawn if asked for).
      const ended = eventHasEnded(event);
      const data = await this.data.gather(
        eventId,
        ended ? [...new Set([...sections, ReportSection.OVERVIEW, ReportSection.TICKETS])] : sections,
        window,
      );
      const aiSummary = ended ? await this.summarise(reportId, userId, event, window, data) : null;
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
        aiSummary,
      });

      const fileName = `${slugify(title, { lower: true, strict: true }).slice(0, 60) || 'event-report'}.pdf`;
      const fileUrl = await this.storage.uploadBuffer(
        pdf,
        `reports/${report.id}.pdf`,
        'application/pdf',
      );

      await this.prisma.eventReport.update({
        where: { id: report.id },
        data: {
          status: ReportStatus.READY,
          fileUrl,
          fileName,
          aiSummary,
          aiSummaryAt: aiSummary ? generatedAt : null,
          stats: (data.overview ??
            data.revenue ??
            null) as unknown as Prisma.InputJsonValue,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Report ${report.id} generation failed: ${message}`);
      await this.prisma.eventReport
        .update({
          where: { id: report.id },
          data: { status: ReportStatus.FAILED, error: message.slice(0, 500) },
        })
        .catch(() => undefined);
    }
  }

  /** Prose around code-computed figures (D7, D15); refusal, error or switched off → none. */
  private async summarise(
    reportId: string,
    userId: string,
    event: Awaited<ReturnType<ReportsService['assertCanManage']>>,
    window: ReportWindow,
    data: Awaited<ReturnType<ReportDataService['gather']>>,
  ): Promise<string | null> {
    if (!data.overview) return null;
    const facts = reportSummaryFacts({
      event: { ...event, venue: this.venueLabel(event) },
      window,
      overview: data.overview,
      tickets: data.tickets ?? [],
    });
    const res = await this.ai.run('report_summary', {
      ...reportSummaryRequest(facts),
      userId,
      subject: `report:${reportId}`,
    });
    return res.ok ? res.text : null;
  }

  private defaultTitle(eventTitle: string): string {
    const date = new Date().toLocaleDateString('en-IN', {
      timeZone: 'Asia/Kolkata',
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
    // A render the process never finished (deploy, crash) stays PENDING.
    await this.prisma.eventReport.updateMany({
      where: {
        eventId,
        status: ReportStatus.PENDING,
        updatedAt: { lt: new Date(Date.now() - REPORT_STALE_MS) },
      },
      data: { status: ReportStatus.FAILED, error: 'Generation was interrupted. Please try again.' },
    });
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
        aiSummary: true,
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
