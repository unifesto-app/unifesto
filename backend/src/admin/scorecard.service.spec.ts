import { ScorecardService, mergeWeeks, splitWeeks } from './scorecard.service';

describe('scorecard aggregation', () => {
  it('merges two weeks of grouped counts, top by this week', () => {
    const rows = mergeWeeks(
      [
        { key: 'instagram', n: 5 },
        { key: null, n: 9 },
      ],
      [
        { key: 'instagram', n: 2 },
        { key: 'whatsapp', n: 7 },
      ],
      2,
    );
    expect(rows).toEqual([
      { key: null, current: 9, previous: 0 },
      { key: 'instagram', current: 5, previous: 2 },
    ]);
  });

  it('splits a 14-day series into the last 7 days vs the 7 before', () => {
    const days = Array.from({ length: 14 }, (_, i) => ({ collected: i < 7 ? 1.5 : 10 }));
    expect(splitWeeks(days, (d) => d.collected)).toEqual({ previous: 10.5, current: 70 });
  });

  it('assembles the weekly scorecard from traffic, events, money and support', async () => {
    const now = new Date('2026-10-26T06:00:00Z'); // Monday 11:30 IST
    const prisma: any = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ views_cur: 40, views_prev: 30, visits_cur: 20, visits_prev: 10 }])
        .mockResolvedValueOnce([{ key: 'google.com', current: 8, previous: 3 }])
        .mockResolvedValueOnce([{ key: 'launch', current: 4, previous: 0 }]),
      eventRegistration: {
        groupBy: jest
          .fn()
          .mockResolvedValueOnce([{ utmSource: 'ig', _count: { _all: 3 } }])
          .mockResolvedValueOnce([{ utmSource: null, _count: { _all: 2 } }]),
      },
      event: {
        count: jest.fn().mockResolvedValueOnce(12).mockResolvedValueOnce(9),
        findMany: jest
          .fn()
          .mockResolvedValueOnce([{ spaceId: 'a' }, { spaceId: 'b' }])
          .mockResolvedValueOnce([{ spaceId: 'a' }]),
      },
      supportTicket: { findFirst: jest.fn().mockResolvedValue({ createdAt: new Date('2026-10-21T06:00:00Z') }) },
    };
    const months = Array.from({ length: 14 }, (_, i) => ({ collected: i < 7 ? 100 : 200, processingFees: 1 }));
    const admin: any = { getFinancialTimeseries: jest.fn().mockResolvedValue({ months }) };
    const support: any = { getStats: jest.fn().mockResolvedValue({ open: 4, pending: 2 }) };

    const card = await new ScorecardService(prisma, admin, support).weekly('admin-1', now);

    expect(admin.getFinancialTimeseries).toHaveBeenCalledWith('14d');
    expect(support.getStats).toHaveBeenCalledWith('admin-1');
    // Week starts at IST midnight 6 days before today (Tue 20 Oct IST).
    expect(card.weeks.current.from).toBe('2026-10-19T18:30:00.000Z');
    expect(card.weeks.previous.from).toBe('2026-10-12T18:30:00.000Z');
    expect(card.web.visits).toEqual({ current: 20, previous: 10 });
    expect(card.web.referrers[0]).toEqual({ key: 'google.com', current: 8, previous: 3 });
    expect(card.upcomingEvents).toEqual({ current: 12, previous: 9 });
    expect(card.activeOrganisers).toEqual({ current: 2, previous: 1 });
    expect(card.registrations.total).toEqual({ current: 3, previous: 2 });
    expect(card.money.gmv).toEqual({ current: 1400, previous: 700 });
    expect(card.money.platformFees).toEqual({ current: 7, previous: 7 });
    expect(card.support).toEqual({ open: 4, pending: 2, oldestOpenDays: 5 });
  });
});
