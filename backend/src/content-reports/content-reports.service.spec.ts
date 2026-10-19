import { ContentReportTarget, SupportDesk, SupportTicketCategory } from '@prisma/client';
import { AuthorizationService, CapabilityConfigService } from '../auth/authorization';
import { SupportService } from '../support/support.service';
import { ContentReportsService } from './content-reports.service';

const EVENT_ID = '11111111-1111-1111-1111-111111111111';
const REG_ID = '22222222-2222-2222-2222-222222222222';

function build() {
  const reports: any[] = [];
  const tickets: any[] = [];
  const prisma: any = {
    userRole: { findMany: async () => [] },
    event: {
      findUnique: async ({ where }: any) => (where.id === EVENT_ID ? { title: 'Hack Night', spaceId: 'sp-1' } : null),
    },
    space: { findUnique: async () => null },
    eventRegistration: {
      findUnique: async ({ where }: any) =>
        where.id === REG_ID ? { userId: 'owner', eventId: EVENT_ID, event: { title: 'Hack Night' } } : null,
    },
    groupSeat: {
      findFirst: async ({ where }: any) => (where.claimedByUserId === 'seat-holder' ? { id: 'seat-1' } : null),
    },
    supportTicket: {
      findFirst: async ({ where }: any) =>
        tickets.find((t) => t.subjectType === where.subjectType && t.subjectId === where.subjectId) ?? null,
      create: async ({ data }: any) => {
        const t = { id: `t${tickets.length + 1}`, ...data };
        tickets.push(t);
        return t;
      },
    },
    contentReport: {
      findFirst: async ({ where }: any) =>
        reports.find(
          (r) =>
            r.reporterId === where.reporterId &&
            r.targetType === where.targetType &&
            r.targetId === where.targetId &&
            where.status.in.includes(r.status),
        ) ?? null,
      create: async ({ data }: any) => {
        const r = { id: `r${reports.length + 1}`, status: 'OPEN', ...data };
        reports.push(r);
        return r;
      },
      update: async ({ where, data }: any) => Object.assign(reports.find((r) => r.id === where.id), data),
    },
  };
  // Real SupportService over the fake Prisma, so D2 routing is exercised as is.
  const support = new SupportService(
    prisma,
    new AuthorizationService(prisma, new CapabilityConfigService(prisma)),
    {} as any,
    { emit: jest.fn() } as any,
  );
  const svc = new ContentReportsService(prisma, { sendRawEmail: jest.fn() } as any, support);
  return { svc, reports, tickets };
}

describe('ContentReportsService.create', () => {
  it('rejects a reason that does not belong to the target type', async () => {
    const { svc } = build();
    await expect(
      svc.create('u1', { targetType: ContentReportTarget.EVENT, targetId: EVENT_ID, reason: 'refund_issue' }),
    ).rejects.toThrow(/reason/i);
  });

  it('requires details for "other"', async () => {
    const { svc } = build();
    await expect(
      svc.create('u1', { targetType: ContentReportTarget.EVENT, targetId: EVENT_ID, reason: 'other' }),
    ).rejects.toThrow(/tell us/i);
  });

  it('updates the open report instead of stacking a duplicate', async () => {
    const { svc, reports } = build();
    const first = await svc.create('u1', { targetType: ContentReportTarget.EVENT, targetId: EVENT_ID, reason: 'spam' });
    const again = await svc.create('u1', {
      targetType: ContentReportTarget.EVENT,
      targetId: EVENT_ID,
      reason: 'scam_or_fraud',
      details: 'Asked for payment on WhatsApp',
    });
    expect(first.alreadyReported).toBe(false);
    expect(again).toMatchObject({ id: first.id, alreadyReported: true });
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({ reason: 'scam_or_fraud', details: 'Asked for payment on WhatsApp' });
  });

  it("only lets the ticket's holder report it", async () => {
    const { svc } = build();
    await expect(
      svc.create('someone-else', { targetType: ContentReportTarget.REGISTRATION, targetId: REG_ID, reason: 'payment_issue' }),
    ).rejects.toThrow(/your own tickets/);
    await expect(
      svc.create('owner', { targetType: ContentReportTarget.REGISTRATION, targetId: REG_ID, reason: 'payment_issue' }),
    ).resolves.toMatchObject({ alreadyReported: false });
  });
});

describe('ContentReportsService ticket report opens an Assist case (D21)', () => {
  const report = (svc: ContentReportsService, reason: string, userId = 'owner') =>
    svc.create(userId, { targetType: ContentReportTarget.REGISTRATION, targetId: REG_ID, reason });

  it("sends an event question to the event's space desk, linked to the report", async () => {
    const { svc, tickets } = build();
    const res = await report(svc, 'ticket_not_working');
    expect(tickets).toHaveLength(1);
    expect(res.caseId).toBe(tickets[0].id);
    expect(tickets[0]).toMatchObject({
      kind: 'HELP',
      desk: SupportDesk.SPACE,
      spaceId: 'sp-1',
      eventId: EVENT_ID,
      registrationId: REG_ID,
      category: SupportTicketCategory.TICKETING,
      subjectType: 'ContentReport',
      subjectId: res.id,
    });
  });

  it('keeps payment and refund reasons with Platform', async () => {
    for (const reason of ['payment_issue', 'refund_issue']) {
      const { svc, tickets } = build();
      await report(svc, reason);
      expect(tickets[0]).toMatchObject({ desk: SupportDesk.PLATFORM, category: SupportTicketCategory.PAYMENTS });
    }
  });

  it('opens one case per report and works for a claimed seat holder', async () => {
    const { svc, tickets } = build();
    const first = await report(svc, 'wrong_details', 'seat-holder');
    const again = await report(svc, 'refund_issue', 'seat-holder');
    expect(again.caseId).toBe(first.caseId);
    expect(tickets).toHaveLength(1);
  });

  it('leaves event and space reports moderation-only', async () => {
    const { svc, tickets } = build();
    const res = await svc.create('u1', { targetType: ContentReportTarget.EVENT, targetId: EVENT_ID, reason: 'spam' });
    expect(res.caseId).toBeNull();
    expect(tickets).toHaveLength(0);
  });
});
