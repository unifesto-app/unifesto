import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ContentReportStatus, ContentReportTarget, GroupSeatStatus, SupportCaseKind, SupportTicketCategory } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { SupportService } from '../support/support.service';
import { CONTENT_REPORT_REASONS } from './content-report-reasons';
import { CreateContentReportDto, UpdateContentReportDto } from './dto';
import { APEX, button, details as detailsCard, esc, h1 } from '../email/layout';

const ACTIVE = [ContentReportStatus.OPEN, ContentReportStatus.REVIEWING];

/**
 * D21: the Assist category a ticket report opens its case under. Money stays
 * with Platform (PAYMENTS is a Platform category, decision D2); the rest goes
 * to the event's space desk.
 */
const REGISTRATION_CASE_CATEGORY: Record<string, SupportTicketCategory> = {
  payment_issue: SupportTicketCategory.PAYMENTS,
  refund_issue: SupportTicketCategory.PAYMENTS,
  ticket_not_working: SupportTicketCategory.TICKETING,
  wrong_details: SupportTicketCategory.TICKETING,
  event_changed_or_cancelled: SupportTicketCategory.EVENTS,
};

@Injectable()
export class ContentReportsService {
  private readonly logger = new Logger(ContentReportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly support: SupportService,
  ) {}

  /**
   * File (or update) a report. One active report per reporter + target:
   * reporting the same thing again refreshes the reason/details instead of
   * piling up duplicates for the reviewers.
   */
  async create(userId: string, dto: CreateContentReportDto) {
    const reason = dto.reason.trim();
    if (!CONTENT_REPORT_REASONS[dto.targetType].includes(reason)) {
      throw new BadRequestException('Pick a reason from the list');
    }
    const details = dto.details?.trim() || null;
    if (reason === 'other' && (!details || details.length < 5)) {
      throw new BadRequestException('Tell us a little about what went wrong');
    }

    const label = await this.targetLabel(userId, dto.targetType, dto.targetId);

    const existing = await this.prisma.contentReport.findFirst({
      where: { reporterId: userId, targetType: dto.targetType, targetId: dto.targetId, status: { in: ACTIVE } },
      select: { id: true },
    });
    const report = existing
      ? await this.prisma.contentReport.update({ where: { id: existing.id }, data: { reason, details } })
      : await this.prisma.contentReport.create({
          data: { reporterId: userId, targetType: dto.targetType, targetId: dto.targetId, reason, details },
        });

    this.logger.log(`Report ${report.id}: ${dto.targetType} ${dto.targetId} (${reason}) by ${userId}`);
    if (!existing)
      void this.notifyReviewers(report.id, dto.targetType, label, reason, details).catch((err) =>
        this.logger.error(`notifyReviewers(${report.id}) failed: ${err instanceof Error ? err.message : String(err)}`),
      );

    const caseId =
      dto.targetType === ContentReportTarget.REGISTRATION
        ? await this.openTicketCase(userId, report.id, dto.targetId, label, reason, details)
        : null;

    return { id: report.id, alreadyReported: !!existing, caseId };
  }

  /**
   * D21: a ticket report is a help request, so it also opens an Assist case
   * linked to the report (once per report). Routed like any case with the
   * registration as context. Best-effort: the report stands if this fails.
   */
  private async openTicketCase(
    userId: string,
    reportId: string,
    registrationId: string,
    label: string,
    reason: string,
    details: string | null,
  ): Promise<string | null> {
    try {
      const linked = await this.prisma.supportTicket.findFirst({
        where: { subjectType: 'ContentReport', subjectId: reportId },
        select: { id: true },
      });
      if (linked) return linked.id;
      const reasonText = reason.charAt(0).toUpperCase() + reason.slice(1).replace(/_/g, ' ');
      const ticket = await this.support.createTicket(
        {
          subject: `${reasonText}: ${label}`.slice(0, 300),
          message: details ?? `Reported from my ticket: ${reasonText.toLowerCase()}.`,
          kind: SupportCaseKind.HELP,
          category: REGISTRATION_CASE_CATEGORY[reason] ?? SupportTicketCategory.GENERAL,
          registrationId,
        },
        userId,
        { subjectType: 'ContentReport', subjectId: reportId, registrationVerified: true },
      );
      return ticket.id;
    } catch (err) {
      this.logger.error(`openTicketCase(${reportId}) failed: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  /** Validates the target exists (and, for a ticket, that it's the reporter's) and names it. */
  private async targetLabel(userId: string, type: ContentReportTarget, id: string): Promise<string> {
    if (type === ContentReportTarget.EVENT) {
      const ev = await this.prisma.event.findUnique({ where: { id }, select: { title: true } });
      if (!ev) throw new NotFoundException('Event not found');
      return ev.title;
    }
    if (type === ContentReportTarget.SPACE) {
      const sp = await this.prisma.space.findUnique({ where: { id }, select: { name: true } });
      if (!sp) throw new NotFoundException('Space not found');
      return sp.name;
    }
    // A ticket: only its holder (the booker, or a member who claimed a seat) can report it.
    const reg = await this.prisma.eventRegistration.findUnique({
      where: { id },
      select: { userId: true, event: { select: { title: true } } },
    });
    if (!reg) throw new NotFoundException('Ticket not found');
    if (reg.userId !== userId) {
      const seat = await this.prisma.groupSeat.findFirst({
        where: { registrationId: id, claimedByUserId: userId, status: GroupSeatStatus.CLAIMED },
        select: { id: true },
      });
      if (!seat) throw new ForbiddenException('You can only report your own tickets');
    }
    return `Ticket for ${reg.event.title}`;
  }

  /** Optional heads-up email for reviewers (CONTENT_REPORTS_EMAIL). Best-effort. */
  private async notifyReviewers(
    id: string,
    type: ContentReportTarget,
    label: string,
    reason: string,
    details: string | null,
  ) {
    const to = process.env.CONTENT_REPORTS_EMAIL;
    if (!to) return;
    try {
      await this.email.sendRawEmail(
        to,
        `New report: ${type.toLowerCase()} · ${reason}`,
        h1('New content report') +
          detailsCard(
            [['Type', type], ['Reason', esc(reason)], ['Report id', id], ['Details', details && esc(details)]],
            esc(label),
          ) +
          button('Review in Apex', `${APEX}/dashboard/content-reports`),
      );
    } catch (err) {
      this.logger.warn(`Couldn't email report ${id}: ${(err as Error).message}`);
    }
  }

  // ── Admin ────────────────────────────────────────────────────────────────

  /** Newest first, with the reporter and a readable name for each target. */
  async listForAdmin(status?: ContentReportStatus, type?: ContentReportTarget) {
    const reports = await this.prisma.contentReport.findMany({
      where: { ...(status ? { status } : {}), ...(type ? { targetType: type } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { reporter: { select: { id: true, fullName: true, username: true } } },
    });

    const ids = (t: ContentReportTarget) => reports.filter((r) => r.targetType === t).map((r) => r.targetId);
    const [events, spaces, regs] = await Promise.all([
      this.prisma.event.findMany({ where: { id: { in: ids(ContentReportTarget.EVENT) } }, select: { id: true, title: true, slug: true } }),
      this.prisma.space.findMany({ where: { id: { in: ids(ContentReportTarget.SPACE) } }, select: { id: true, name: true, slug: true } }),
      this.prisma.eventRegistration.findMany({
        where: { id: { in: ids(ContentReportTarget.REGISTRATION) } },
        select: { id: true, event: { select: { id: true, title: true } } },
      }),
    ]);
    const name = new Map<string, string>([
      ...events.map((e) => [e.id, e.title] as [string, string]),
      ...spaces.map((s) => [s.id, s.name] as [string, string]),
      ...regs.map((r) => [r.id, `Ticket for ${r.event.title}`] as [string, string]),
    ]);

    return reports.map((r) => ({ ...r, targetName: name.get(r.targetId) ?? '(deleted)' }));
  }

  async updateStatus(id: string, adminId: string, dto: UpdateContentReportDto) {
    const done = dto.status === ContentReportStatus.RESOLVED || dto.status === ContentReportStatus.DISMISSED;
    try {
      return await this.prisma.contentReport.update({
        where: { id },
        data: {
          status: dto.status,
          resolutionNote: dto.resolutionNote?.trim() || null,
          resolvedById: done ? adminId : null,
          resolvedAt: done ? new Date() : null,
        },
      });
    } catch {
      throw new NotFoundException('Report not found');
    }
  }
}
