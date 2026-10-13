import { ForbiddenException } from '@nestjs/common';
import { GroupSeatStatus } from '@prisma/client';
import { CheckinService } from './checkin.service';

/**
 * Offline scanning: a device downloads the roster, records check-ins with no
 * network, then replays them through /checkin/event/:id/sync. These pin that
 * the replay re-applies every live rule, keeps the device's scan time (within
 * bounds), and reports a verdict per item instead of failing the batch.
 */
describe('CheckinService offline check-in', () => {
  const EVENT = 'event-1';
  const USER = 'organiser-1';
  const POINT = 'point-1';

  const baseReg = {
    id: 'reg-1',
    groupSize: null,
    status: 'REGISTERED',
    isWaitlisted: false,
    paymentStatus: 'PAID',
    checkedInAt: null,
    event: { id: EVENT, title: 'Hack Night', spaceId: 'space-1', status: 'PUBLISHED' },
    user: { id: 'u1', fullName: 'Asha', username: 'asha', avatarUrl: null },
    ticketType: { name: 'General' },
  };

  const build = (overrides: { reg?: any; existing?: any; organiser?: boolean } = {}) => {
    const recordCreate = jest.fn().mockResolvedValue({});
    const prisma: any = {
      event: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: EVENT, title: 'Hack Night', spaceId: 'space-1', status: 'PUBLISHED' }),
      },
      eventRegistration: {
        findUnique: jest.fn().mockResolvedValue(overrides.reg === undefined ? baseReg : overrides.reg),
        // The sync preloads every named registration in one findMany.
        findMany: jest.fn().mockImplementation(async () => {
          const reg = overrides.reg === undefined ? baseReg : overrides.reg;
          return reg ? [{ ...reg }] : []; // a copy: check-in mutates the row
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      eventCheckinType: { findFirst: jest.fn().mockResolvedValue({ id: POINT, name: 'Entry' }) },
      eventCheckinAccess: { findFirst: jest.fn().mockResolvedValue(null) },
      userRole: { count: jest.fn().mockResolvedValue(overrides.organiser === false ? 0 : 1) },
      eventCheckinRecord: {
        findUnique: jest.fn().mockResolvedValue(overrides.existing ?? null),
        create: recordCreate,
      },
      eventTicket: { updateMany: jest.fn().mockResolvedValue({}) },
      $transaction: async (fn: any) => fn(prisma),
    };
    const svc = new CheckinService(prisma as any, {} as any, { invalidateCheckinCache: jest.fn() } as any);
    return { svc, prisma, recordCreate };
  };

  const item = (over: Partial<{ scannedAt: string; registrationId: string }> = {}) => ({
    id: 'c1',
    registrationId: 'reg-1',
    checkinTypeId: POINT,
    scannedAt: new Date(Date.now() - 60_000).toISOString(),
    ...over,
  });

  it('records the check-in at the time it was scanned on the device', async () => {
    const { svc, recordCreate } = build();
    const scannedAt = new Date(Date.now() - 5 * 60_000).toISOString();

    const { results } = await svc.syncOfflineCheckins(USER, EVENT, [item({ scannedAt })]);

    expect(results).toEqual([{ id: 'c1', status: 'ok', name: 'Asha' }]);
    expect(recordCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ checkedInAt: new Date(scannedAt) }),
    });
  });

  it('uses the sync time when the device clock is in the future', async () => {
    const { svc, recordCreate } = build();
    const before = Date.now();
    await svc.syncOfflineCheckins(USER, EVENT, [
      item({ scannedAt: new Date(Date.now() + 3_600_000).toISOString() }),
    ]);
    const at: Date = recordCreate.mock.calls[0][0].data.checkedInAt;
    expect(at.getTime()).toBeGreaterThanOrEqual(before);
    expect(at.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('reports "already" when another scanner got them in first', async () => {
    const { svc, recordCreate } = build({ existing: { checkedInAt: new Date() } });
    const { results } = await svc.syncOfflineCheckins(USER, EVENT, [item()]);
    expect(results[0].status).toBe('already');
    expect(recordCreate).not.toHaveBeenCalled();
  });

  it('rejects one item without failing the rest of the batch', async () => {
    const { svc, prisma } = build();
    prisma.eventRegistration.findMany.mockResolvedValue([
      { ...baseReg, status: 'CANCELLED' },
      { ...baseReg, id: 'reg-2' },
    ]);

    const { results } = await svc.syncOfflineCheckins(USER, EVENT, [
      item(),
      { ...item(), id: 'c2', registrationId: 'reg-2' },
    ]);

    expect(results[0]).toEqual(
      expect.objectContaining({ id: 'c1', status: 'rejected', message: 'Registration has been cancelled' }),
    );
    expect(results[1]).toEqual(expect.objectContaining({ id: 'c2', status: 'ok' }));
  });

  it('S34: a batch reads registrations, the point and permissions once, not per item', async () => {
    const { svc, prisma } = build({ organiser: false });
    prisma.eventCheckinAccess.findFirst.mockResolvedValue({ id: 'grant' });
    const regs = ['reg-1', 'reg-2', 'reg-3'].map((id) => ({ ...baseReg, id }));
    prisma.eventRegistration.findMany.mockResolvedValue(regs);
    const invalidate = (svc as any).cache.invalidateCheckinCache as jest.Mock;

    const { results } = await svc.syncOfflineCheckins(
      USER,
      EVENT,
      regs.map((r, i) => ({ ...item(), id: `c${i}`, registrationId: r.id })),
    );

    expect(results.map((r) => r.status)).toEqual(['ok', 'ok', 'ok']);
    expect(prisma.eventRegistration.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.eventRegistration.findUnique).not.toHaveBeenCalled();
    expect(prisma.eventCheckinType.findFirst).toHaveBeenCalledTimes(1);
    expect(prisma.userRole.count).toHaveBeenCalledTimes(1);
    expect(prisma.eventCheckinAccess.findFirst).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it('S34: two items for one registration only flip it to ATTENDED once', async () => {
    const { svc, prisma } = build();
    prisma.eventCheckinType.findFirst.mockImplementation(async ({ where }: any) => ({ id: where.id, name: where.id }));
    const { results } = await svc.syncOfflineCheckins(USER, EVENT, [
      item(),
      { ...item(), id: 'c2', checkinTypeId: 'point-2' },
    ]);
    expect(results.map((r) => r.status)).toEqual(['ok', 'ok']);
    expect(prisma.eventRegistration.update).toHaveBeenCalledTimes(1);
  });

  describe('duplicate flagging', () => {
    it('flags a ticket another device checked in first', async () => {
      const earlier = new Date(Date.now() - 10 * 60_000);
      const { svc } = build({
        existing: { checkedInAt: earlier, checkedInBy: 'crew-2', checkedInByUser: { fullName: 'Priya' } },
      });
      const { results } = await svc.syncOfflineCheckins(USER, EVENT, [item()]);
      expect(results[0]).toEqual(
        expect.objectContaining({
          status: 'already',
          duplicateOf: { checkedInAt: earlier.toISOString(), checkedInByName: 'Priya', byYou: false },
        }),
      );
    });

    it('does not flag a replay of the same item (dropped response, resent)', async () => {
      const scannedAt = new Date(Date.now() - 60_000).toISOString();
      const { svc } = build({
        existing: { checkedInAt: new Date(scannedAt), checkedInBy: USER, checkedInByUser: { fullName: 'Me' } },
      });
      const { results } = await svc.syncOfflineCheckins(USER, EVENT, [item({ scannedAt })]);
      expect(results[0].status).toBe('already');
      expect(results[0].duplicateOf).toBeUndefined();
    });

    it('flags only the group members that were already in', async () => {
      const { svc, prisma } = build({
        reg: { ...baseReg, groupSize: 3, groupMembers: null },
      });
      const earlier = new Date(Date.now() - 30 * 60_000);
      prisma.groupSeat = {
        findMany: jest.fn().mockResolvedValue([
          { id: 's1', seatIndex: 1, status: 'CLAIMED', memberDetails: { name: 'A' }, claimedBy: null },
          { id: 's2', seatIndex: 2, status: 'CLAIMED', memberDetails: { name: 'B' }, claimedBy: null },
        ]),
      };
      prisma.eventGroupMemberCheckin = {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest
          .fn()
          // alreadyIn lookup, then the refreshed roster view
          .mockResolvedValueOnce([
            { memberIndex: 1, checkedInAt: earlier, checkedInBy: USER, checkedInByUser: { fullName: 'Me' } },
          ])
          .mockResolvedValue([]),
      };
      prisma.eventCheckinRecord.upsert = jest.fn().mockResolvedValue({});

      const { results } = await svc.syncOfflineCheckins(USER, EVENT, [
        { ...item(), memberIndexes: [0, 1] },
      ]);
      expect(results[0]).toEqual(
        expect.objectContaining({
          status: 'ok',
          duplicateOf: expect.objectContaining({ byYou: true, memberIndexes: [1] }),
        }),
      );
    });
  });

  describe('getRosterChanges', () => {
    const since = new Date(Date.now() - 60_000).toISOString();
    const withChanges = (ids: { regs?: string[]; records?: string[] }) => {
      const b = build();
      b.prisma.eventRegistration.findMany = jest
        .fn()
        .mockResolvedValueOnce((ids.regs ?? []).map((id) => ({ id })))
        .mockResolvedValue([
          {
            ...baseReg,
            id: 'reg-1',
            qrCode: 'QR-1',
            groupMembers: null,
            tickets: [],
            checkinRecords: [],
            groupMemberCheckins: [],
            groupSeats: [],
          },
        ]);
      b.prisma.eventCheckinRecord.findMany = jest
        .fn()
        .mockResolvedValue((ids.records ?? []).map((registrationId) => ({ registrationId })));
      b.prisma.eventGroupMemberCheckin = { findMany: jest.fn().mockResolvedValue([]) };
      b.prisma.groupSeat = { findMany: jest.fn().mockResolvedValue([]) };
      return b;
    };

    it('returns changed entries and ids that left the list', async () => {
      // reg-1 changed and is still on the list; reg-9 changed but no longer qualifies.
      const { svc } = withChanges({ regs: ['reg-9'], records: ['reg-1'] });
      const res = await svc.getRosterChanges(USER, EVENT, since);
      expect(res.full).toBe(false);
      expect(res.entries.map((e) => e.registrationId)).toEqual(['reg-1']);
      expect(res.removed).toEqual(['reg-9']);
      expect(Date.parse(res.cursor)).toBeLessThan(Date.now());
    });

    it('filters check-ins by when the server stored them, not the scan time', async () => {
      const { svc, prisma } = withChanges({});
      await svc.getRosterChanges(USER, EVENT, since);
      expect(prisma.eventCheckinRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { recordedAt: { gt: new Date(since) }, registration: { eventId: EVENT } },
        }),
      );
    });

    it('asks for a full download when too much changed', async () => {
      const { svc } = withChanges({ regs: Array.from({ length: 1001 }, (_, i) => `r${i}`) });
      const res = await svc.getRosterChanges(USER, EVENT, since);
      expect(res).toEqual(expect.objectContaining({ full: true, entries: [], removed: [] }));
    });

    it('rejects a malformed cursor', async () => {
      const { svc } = withChanges({});
      await expect(svc.getRosterChanges(USER, EVENT, 'yesterday')).rejects.toThrow(/cursor/);
    });
  });

  it("rejects a registration from a different event", async () => {
    const { svc } = build({ reg: { ...baseReg, event: { ...baseReg.event, id: 'other' } } });
    const { results } = await svc.syncOfflineCheckins(USER, EVENT, [item()]);
    expect(results[0].status).toBe('rejected');
  });

  describe('getOfflineRoster', () => {
    it('refuses users without check-in access', async () => {
      const { svc } = build({ organiser: false });
      await expect(svc.getOfflineRoster(USER, EVENT)).rejects.toThrow(ForbiddenException);
    });

    it('lists codes, block reasons and per-point check-ins, including group seats', async () => {
      const { svc, prisma } = build();
      const at = new Date('2026-09-25T10:00:00Z');
      prisma.eventRegistration.findMany.mockResolvedValue([
        {
          ...baseReg,
          qrCode: 'QR-1',
          groupMembers: null,
          tickets: [{ qrCode: 'T-1' }],
          checkinRecords: [{ checkinTypeId: POINT, checkedInAt: at }],
          groupMemberCheckins: [],
          groupSeats: [],
        },
        {
          ...baseReg,
          id: 'reg-2',
          qrCode: 'QR-2',
          status: 'CANCELLED',
          groupMembers: null,
          tickets: [],
          checkinRecords: [],
          groupMemberCheckins: [],
          groupSeats: [],
        },
        {
          ...baseReg,
          id: 'reg-3',
          qrCode: 'QR-3',
          groupSize: 2,
          groupMembers: null,
          tickets: [],
          checkinRecords: [],
          groupMemberCheckins: [{ memberIndex: 0, checkinTypeId: POINT, checkedInAt: at }],
          groupSeats: [
            { seatIndex: 1, status: GroupSeatStatus.CLAIMED, memberDetails: { name: 'Lead' }, claimedBy: null },
            { seatIndex: 2, status: GroupSeatStatus.OPEN, memberDetails: null, claimedBy: null },
          ],
        },
      ]);

      const roster = await svc.getOfflineRoster(USER, EVENT);
      const [solo, cancelled, group] = roster.entries;

      expect(solo).toEqual(
        expect.objectContaining({
          codes: ['QR-1', 'T-1'],
          blockedReason: null,
          checkins: { [POINT]: at.toISOString() },
          group: null,
        }),
      );
      expect(cancelled.blockedReason).toBe('Registration has been cancelled');
      expect(group.group?.members).toEqual([
        { index: 0, name: 'Lead', claimable: true, checkins: { [POINT]: at.toISOString() } },
        { index: 1, name: null, claimable: false, checkins: {} },
      ]);
    });
  });
});
