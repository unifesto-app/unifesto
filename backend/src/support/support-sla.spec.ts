import { SupportCaseKind, SupportTicketPriority, SupportTicketStatus } from '@prisma/client';
import { slaFor, overdueWhere, deskTimes } from './support-sla';

const H = 3600_000;
const now = new Date('2026-10-20T12:00:00Z');
const ago = (hours: number) => new Date(now.getTime() - hours * H);
const base = {
  kind: SupportCaseKind.HELP,
  priority: SupportTicketPriority.NORMAL,
  status: SupportTicketStatus.OPEN,
  createdAt: ago(1),
  firstResponseAt: null as Date | null,
};

describe('slaFor', () => {
  it('waits for the first reply by priority, then for resolution', () => {
    expect(slaFor(base, now)).toEqual({ stage: 'RESPOND', dueAt: ago(1 - 24), overdue: false });
    expect(slaFor({ ...base, priority: SupportTicketPriority.URGENT, createdAt: ago(3) }, now)?.overdue).toBe(true);
    expect(slaFor({ ...base, firstResponseAt: ago(0.5) }, now)).toEqual({ stage: 'RESOLVE', dueAt: ago(1 - 120), overdue: false });
  });

  it('holds grievances to 24 hours and 15 days whatever the priority', () => {
    const g = { ...base, kind: SupportCaseKind.GRIEVANCE, priority: SupportTicketPriority.LOW, createdAt: ago(25) };
    expect(slaFor(g, now)?.overdue).toBe(true);
    expect(slaFor({ ...g, firstResponseAt: ago(20) }, now)?.overdue).toBe(false);
    expect(slaFor({ ...g, firstResponseAt: ago(20), createdAt: ago(15 * 24 + 1) }, now)?.overdue).toBe(true);
  });

  it('stops the clock outside OPEN and PENDING', () => {
    for (const status of [SupportTicketStatus.BOT, SupportTicketStatus.RESOLVED, SupportTicketStatus.CLOSED]) {
      expect(slaFor({ ...base, status, createdAt: ago(1000) }, now)).toBeNull();
    }
  });
});

describe('overdueWhere', () => {
  it('cuts each priority at its own respond and resolve hours', () => {
    const w = overdueWhere(now) as any;
    expect(w.status).toEqual({ in: [SupportTicketStatus.OPEN, SupportTicketStatus.PENDING] });
    const urgent = w.OR.find((o: any) => o.priority === SupportTicketPriority.URGENT);
    expect(urgent.kind).toEqual({ not: SupportCaseKind.GRIEVANCE });
    expect(urgent.OR).toEqual([
      { firstResponseAt: null, createdAt: { lt: ago(2) } },
      { firstResponseAt: { not: null }, createdAt: { lt: ago(24) } },
    ]);
    const grievance = w.OR.find((o: any) => o.kind === SupportCaseKind.GRIEVANCE);
    expect(grievance.OR[1].createdAt).toEqual({ lt: ago(15 * 24) });
  });
});

describe('deskTimes', () => {
  it('takes medians over the cases that got there', () => {
    const rows = [
      { createdAt: ago(10), firstResponseAt: ago(9), resolvedAt: ago(5) },
      { createdAt: ago(10), firstResponseAt: ago(7), resolvedAt: null },
      { createdAt: ago(10), firstResponseAt: null, resolvedAt: null },
    ];
    expect(deskTimes(rows)).toEqual({ firstResponseMins: 120, resolutionMins: 300, cases: 3 });
    expect(deskTimes([])).toEqual({ firstResponseMins: null, resolutionMins: null, cases: 0 });
  });
});
