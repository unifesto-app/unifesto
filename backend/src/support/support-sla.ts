import { Prisma, SupportCaseKind, SupportTicketPriority, SupportTicketStatus } from '@prisma/client';

/** Hours to the desk's first reply and to resolution (D19), counted from when the case opened. */
type Sla = { respond: number; resolve: number };

export const SLA_HOURS: Record<SupportTicketPriority, Sla> = {
  URGENT: { respond: 2, resolve: 24 },
  HIGH: { respond: 8, resolve: 72 },
  NORMAL: { respond: 24, resolve: 5 * 24 },
  LOW: { respond: 72, resolve: 10 * 24 },
};

/** IT Rules 2021, rule 3(2): acknowledge in 24 hours, resolve in 15 days, whatever the priority (D25). */
export const GRIEVANCE_SLA: Sla = { respond: 24, resolve: 15 * 24 };

/** The clock runs while the case is with a human desk: not in a bot chat, not once resolved. */
const RUNNING: SupportTicketStatus[] = [SupportTicketStatus.OPEN, SupportTicketStatus.PENDING];

const HOUR = 60 * 60 * 1000;

function slaOf(kind: SupportCaseKind, priority: SupportTicketPriority): Sla {
  return kind === SupportCaseKind.GRIEVANCE ? GRIEVANCE_SLA : SLA_HOURS[priority];
}

export interface CaseSla {
  /** RESPOND until the desk's first reply, then RESOLVE. */
  stage: 'RESPOND' | 'RESOLVE';
  dueAt: Date;
  overdue: boolean;
}

/** The deadline a case is working to now, or null when its clock isn't running. */
export function slaFor(
  t: {
    kind: SupportCaseKind;
    priority: SupportTicketPriority;
    status: SupportTicketStatus;
    createdAt: Date;
    firstResponseAt: Date | null;
  },
  now = new Date(),
): CaseSla | null {
  if (!RUNNING.includes(t.status)) return null;
  const sla = slaOf(t.kind, t.priority);
  const stage = t.firstResponseAt ? 'RESOLVE' : 'RESPOND';
  const dueAt = new Date(t.createdAt.getTime() + (stage === 'RESPOND' ? sla.respond : sla.resolve) * HOUR);
  return { stage, dueAt, overdue: dueAt < now };
}

/** The same rule as `slaFor(...).overdue`, as a query filter. */
export function overdueWhere(now = new Date()): Prisma.SupportTicketWhereInput {
  const opened = (hours: number) => ({ lt: new Date(now.getTime() - hours * HOUR) });
  const late = (sla: Sla): Prisma.SupportTicketWhereInput[] => [
    { firstResponseAt: null, createdAt: opened(sla.respond) },
    { firstResponseAt: { not: null }, createdAt: opened(sla.resolve) },
  ];
  return {
    status: { in: RUNNING },
    OR: [
      { kind: SupportCaseKind.GRIEVANCE, OR: late(GRIEVANCE_SLA) },
      ...Object.values(SupportTicketPriority).map((priority) => ({
        kind: { not: SupportCaseKind.GRIEVANCE },
        priority,
        OR: late(SLA_HOURS[priority]),
      })),
    ],
  };
}

/** Median minutes, or null with nothing to measure. */
export function medianMinutes(ms: number[]): number | null {
  if (!ms.length) return null;
  const s = [...ms].sort((a, b) => a - b);
  const mid = s.length >> 1;
  const m = s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  return Math.round(m / 60000);
}

/** How long a desk took over these cases: median minutes to its first reply and to resolution. */
export function deskTimes(
  rows: { createdAt: Date; firstResponseAt: Date | null; resolvedAt: Date | null }[],
): { firstResponseMins: number | null; resolutionMins: number | null; cases: number } {
  const since = (d: Date | null, from: Date) => (d ? [d.getTime() - from.getTime()] : []);
  return {
    firstResponseMins: medianMinutes(rows.flatMap((r) => since(r.firstResponseAt, r.createdAt))),
    resolutionMins: medianMinutes(rows.flatMap((r) => since(r.resolvedAt, r.createdAt))),
    cases: rows.length,
  };
}

/** The window desk times are measured over. */
export const DESK_TIMES_DAYS = 30;
