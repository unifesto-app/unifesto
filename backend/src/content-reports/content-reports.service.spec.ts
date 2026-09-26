import { ContentReportTarget } from '@prisma/client';
import { ContentReportsService } from './content-reports.service';

const EVENT_ID = '11111111-1111-1111-1111-111111111111';
const REG_ID = '22222222-2222-2222-2222-222222222222';

function build() {
  const reports: any[] = [];
  const prisma: any = {
    event: { findUnique: async ({ where }: any) => (where.id === EVENT_ID ? { title: 'Hack Night' } : null) },
    space: { findUnique: async () => null },
    eventRegistration: {
      findUnique: async ({ where }: any) =>
        where.id === REG_ID ? { userId: 'owner', event: { title: 'Hack Night' } } : null,
    },
    groupSeat: { findFirst: async () => null },
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
  const svc = new ContentReportsService(prisma, { sendRawEmail: jest.fn() } as any);
  return { svc, reports };
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
