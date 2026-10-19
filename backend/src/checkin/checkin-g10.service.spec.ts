import { GroupSeatStatus } from '@prisma/client';
import { CheckinService } from './checkin.service';

/**
 * G10: groups are checked in per member on every path, a mistaken check-in
 * can be undone (audited), offline scans made before the event ended still
 * sync after it completes, and stats count people at this event only.
 */
describe('CheckinService G10', () => {
  const EVENT = 'event-1';
  const USER = 'crew-1';
  const POINT = 'point-1';
  const END = new Date(Date.now() - 60 * 60_000); // ended an hour ago

  const individual = {
    id: 'reg-1',
    eventId: EVENT,
    groupSize: null,
    status: 'ATTENDED',
    isWaitlisted: false,
    paymentStatus: 'PAID',
    checkedInAt: new Date(),
    event: { id: EVENT, title: 'Fest', spaceId: 'space-1', status: 'PUBLISHED', endDateTime: END },
    user: { id: 'u1', fullName: 'Asha', username: 'asha', avatarUrl: null },
    ticketType: { name: 'General' },
  };
  const group = { ...individual, id: 'reg-g', groupSize: 3, status: 'REGISTERED', checkedInAt: null };
  const seats = [
    { id: 'seat-1', seatIndex: 1, status: GroupSeatStatus.CLAIMED },
    { id: 'seat-2', seatIndex: 2, status: GroupSeatStatus.CLAIMED },
    { id: 'seat-3', seatIndex: 3, status: GroupSeatStatus.OPEN },
  ];

  const build = (reg: any = individual) => {
    const prisma: any = {
      event: { findUnique: jest.fn().mockResolvedValue({ id: EVENT, spaceId: 'space-1' }) },
      eventRegistration: {
        findUnique: jest.fn().mockResolvedValue({ ...reg }),
        findMany: jest.fn().mockImplementation(async () => [{ ...reg }]),
        update: jest.fn().mockResolvedValue({}),
        count: jest.fn().mockResolvedValue(0),
      },
      eventCheckinType: {
        findFirst: jest.fn().mockResolvedValue({ id: POINT, name: 'Entry' }),
        count: jest.fn().mockResolvedValue(1),
      },
      eventCheckinAccess: { findFirst: jest.fn().mockResolvedValue(null) },
      eventCheckinRecord: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
        upsert: jest.fn().mockResolvedValue({}),
        delete: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        count: jest.fn().mockResolvedValue(0),
      },
      eventGroupMemberCheckin: {
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        createMany: jest.fn().mockResolvedValue({ count: 2 }),
        delete: jest.fn().mockResolvedValue({}),
        count: jest.fn().mockResolvedValue(0),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      eventCheckinUndo: { create: jest.fn().mockResolvedValue({}) },
      groupSeat: {
        findMany: jest.fn().mockResolvedValue(seats.map((s) => ({ ...s, memberDetails: null, claimedBy: null }))),
        count: jest.fn().mockResolvedValue(0),
      },
      eventTicket: { updateMany: jest.fn().mockResolvedValue({}) },
      $transaction: async (fn: any) => fn(prisma),
    };
    const authz = { can: jest.fn().mockResolvedValue(true) };
    return { svc: new CheckinService(prisma, {} as any, authz as any), prisma };
  };

  describe('groups are checked in per member', () => {
    it('bulk check-in of a group writes a member record for every claimed seat', async () => {
      const { svc, prisma } = build(group);
      const res = await svc.bulkCheckin(USER, EVENT, [group.id]);

      expect(res.success).toEqual([{ id: group.id, name: 'Asha' }]);
      expect(prisma.eventGroupMemberCheckin.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: [
            expect.objectContaining({ memberIndex: 0, groupSeatId: 'seat-1' }),
            expect.objectContaining({ memberIndex: 1, groupSeatId: 'seat-2' }),
          ],
        }),
      );
      // Never a registration-level record on its own.
      expect(prisma.eventCheckinRecord.create).not.toHaveBeenCalled();
    });

    it('a scan without member picks (Space web, older apps) checks claimed members in, not the registration', async () => {
      const { svc, prisma } = build(group);
      const res: any = await svc.scanQRCode(USER, 'qr', POINT, false);

      expect(res).toEqual(expect.objectContaining({ success: true, checkedInCount: 2 }));
      expect(prisma.eventGroupMemberCheckin.createMany).toHaveBeenCalledTimes(1);
      expect(prisma.eventCheckinRecord.create).not.toHaveBeenCalled();
    });

    it('reports a group whose claimed members are all in as already checked in', async () => {
      const { svc, prisma } = build(group);
      const at = new Date(Date.now() - 10_000);
      prisma.eventGroupMemberCheckin.findMany.mockResolvedValue(
        [0, 1].map((memberIndex) => ({ memberIndex, checkedInAt: at, checkedInBy: 'other', checkedInByUser: null })),
      );
      const res = await svc.bulkCheckin(USER, EVENT, [group.id]);
      expect(res.alreadyCheckedIn).toEqual([{ id: group.id, name: 'Asha' }]);
    });
  });

  describe('undo', () => {
    it('removes an individual check-in, audits it, and reverts the registration', async () => {
      const { svc, prisma } = build(individual);
      const original = { id: 'rec-1', checkedInAt: new Date(Date.now() - 5_000), checkedInBy: 'crew-2' };
      prisma.eventCheckinRecord.findUnique.mockResolvedValue(original);

      await svc.undoCheckin(USER, individual.id, POINT, undefined, 'wrong person');

      expect(prisma.eventCheckinRecord.delete).toHaveBeenCalledWith({ where: { id: 'rec-1' } });
      expect(prisma.eventCheckinUndo.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          registrationId: individual.id,
          checkinTypeId: POINT,
          memberIndex: null,
          checkedInAt: original.checkedInAt,
          checkedInBy: 'crew-2',
          undoneBy: USER,
          reason: 'wrong person',
        }),
      });
      expect(prisma.eventRegistration.update).toHaveBeenCalledWith({
        where: { id: individual.id },
        data: { checkedInAt: null, checkedInBy: null, status: 'REGISTERED' },
      });
      expect(prisma.eventTicket.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'ACTIVE', checkedInAt: null } }),
      );
    });

    it('keeps the registration attended when another point still has a check-in', async () => {
      const { svc, prisma } = build(individual);
      prisma.eventCheckinRecord.findUnique.mockResolvedValue({ id: 'rec-1', checkedInAt: new Date(), checkedInBy: 'x' });
      const earlier = { checkedInAt: new Date(Date.now() - 60_000), checkedInBy: 'crew-3' };
      prisma.eventCheckinRecord.findFirst.mockResolvedValue(earlier);

      await svc.undoCheckin(USER, individual.id, POINT);

      expect(prisma.eventRegistration.update).toHaveBeenCalledWith({ where: { id: individual.id }, data: earlier });
      expect(prisma.eventTicket.updateMany).not.toHaveBeenCalled();
    });

    it("undoes one group member and drops the group's point record once no member is left there", async () => {
      const { svc, prisma } = build(group);
      prisma.eventGroupMemberCheckin.findUnique.mockResolvedValue({ id: 'm-2', checkedInAt: new Date(), checkedInBy: 'x' });

      await svc.undoCheckin(USER, group.id, POINT, 1);

      expect(prisma.eventGroupMemberCheckin.delete).toHaveBeenCalledWith({ where: { id: 'm-2' } });
      expect(prisma.eventCheckinRecord.deleteMany).toHaveBeenCalledWith({
        where: { registrationId: group.id, checkinTypeId: POINT },
      });
      expect(prisma.eventCheckinUndo.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ memberIndex: 1 }),
      });
    });

    it('asks which member when a group has member check-ins at the point', async () => {
      const { svc, prisma } = build(group);
      prisma.eventGroupMemberCheckin.count.mockResolvedValue(2);
      await expect(svc.undoCheckin(USER, group.id, POINT)).rejects.toThrow(/which group member/i);
      expect(prisma.eventCheckinUndo.create).not.toHaveBeenCalled();
    });

    it('needs the same authority as checking in at that point', async () => {
      const { svc, prisma } = build(individual);
      (svc as any).authz.can.mockResolvedValue(false);
      await expect(svc.undoCheckin(USER, individual.id, POINT)).rejects.toThrow(/not authorized/i);
      expect(prisma.eventCheckinRecord.delete).not.toHaveBeenCalled();
    });
  });

  describe('offline sync after the event completed', () => {
    const completed = {
      ...individual,
      status: 'REGISTERED',
      checkedInAt: null,
      event: { ...individual.event, status: 'COMPLETED' },
    };
    const item = (scannedAt: Date) => ({ id: 'c1', registrationId: completed.id, checkinTypeId: POINT, scannedAt: scannedAt.toISOString() });

    it('accepts a scan made before the event ended', async () => {
      const { svc } = build(completed);
      const { results } = await svc.syncOfflineCheckins(USER, EVENT, [item(new Date(END.getTime() - 60_000))]);
      expect(results[0]).toEqual(expect.objectContaining({ status: 'ok' }));
    });

    it('rejects a scan made after the event ended', async () => {
      const { svc } = build(completed);
      const { results } = await svc.syncOfflineCheckins(USER, EVENT, [item(new Date(END.getTime() + 60_000))]);
      expect(results[0]).toEqual(expect.objectContaining({ status: 'rejected', message: expect.stringMatching(/has ended/) }));
    });

    it('still refuses a live scan once the event is completed', async () => {
      const { svc } = build(completed);
      await expect(svc.scanQRCode(USER, 'qr', POINT)).rejects.toThrow(/has ended/);
    });

    it('lets a queued scan land on a point deleted since; live scans need a live point', async () => {
      const { svc, prisma } = build({ ...individual, status: 'REGISTERED', checkedInAt: null });
      await svc.syncOfflineCheckins(USER, EVENT, [item(new Date(Date.now() - 60_000))]);
      expect(prisma.eventCheckinType.findFirst.mock.calls[0][0].where).not.toHaveProperty('deletedAt');

      await svc.scanQRCode(USER, 'qr', POINT);
      expect(prisma.eventCheckinType.findFirst.mock.calls[1][0].where).toEqual(
        expect.objectContaining({ deletedAt: null }),
      );
    });
  });

  describe('stats', () => {
    it('counts people (individuals + seats) and member check-ins, only confirmed and only this event', async () => {
      const { svc, prisma } = build();
      prisma.eventRegistration.count
        .mockResolvedValueOnce(10) // individuals
        .mockResolvedValueOnce(2); // cancelled bookings
      prisma.groupSeat.count.mockResolvedValue(6); // 2 groups of 3
      prisma.eventCheckinRecord.count.mockResolvedValue(4);
      prisma.eventGroupMemberCheckin.count.mockResolvedValue(5);

      const stats = await svc.getCheckinStats(USER, EVENT, POINT);

      expect(stats).toEqual(expect.objectContaining({ total: 16, checkedIn: 9, remaining: 7, cancelled: 2 }));
      for (const call of [
        prisma.eventCheckinRecord.count.mock.calls[0][0],
        prisma.eventGroupMemberCheckin.count.mock.calls[0][0],
      ]) {
        expect(call.where.checkinTypeId).toBe(POINT);
        // Scoped to this event and to confirmed (not refunded/unpaid) rows.
        expect(call.where.registration).toEqual(
          expect.objectContaining({
            eventId: EVENT,
            paymentStatus: { in: ['PAID', 'PARTIALLY_REFUNDED'] },
          }),
        );
      }
      expect(prisma.groupSeat.count.mock.calls[0][0].where.status).toEqual({ not: 'RELEASED' });
    });

    it('without a point counts each person checked in at least once', async () => {
      const { svc, prisma } = build();
      prisma.eventRegistration.count.mockResolvedValueOnce(3).mockResolvedValueOnce(0).mockResolvedValueOnce(2);
      prisma.groupSeat.count.mockResolvedValue(4);
      prisma.eventGroupMemberCheckin.groupBy.mockResolvedValue([{}, {}, {}]);

      const stats = await svc.getCheckinStats(USER, EVENT);

      expect(stats).toEqual(expect.objectContaining({ total: 7, checkedIn: 5 }));
      expect(prisma.eventGroupMemberCheckin.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({ by: ['registrationId', 'memberIndex'] }),
      );
    });
  });

  describe("a member's own seat ticket (N1 badges)", () => {
    const at = new Date('2026-10-01T10:00:00Z');
    const tickets = [
      { id: 't-group', attendeeEmail: null, createdAt: at },
      { id: 't-2', attendeeEmail: 'ravi@x.in', createdAt: at },
    ];
    const scanTicket = (ticketId: string) => {
      const ctx = build(group);
      ctx.prisma.eventRegistration.findUnique.mockResolvedValue(null);
      ctx.prisma.eventTicket.findUnique = jest.fn().mockResolvedValue({ id: ticketId, registration: { ...group } });
      ctx.prisma.eventTicket.findMany = jest.fn().mockResolvedValue(tickets);
      ctx.prisma.groupSeat.findMany.mockResolvedValue(
        seats.map((s) => ({
          ...s,
          claimedAt: at,
          memberDetails: s.seatIndex === 2 ? { name: 'Ravi', email: 'ravi@x.in' } : null,
          claimedBy: null,
        })),
      );
      return ctx;
    };

    it('checks in only that member', async () => {
      const { svc, prisma } = scanTicket('t-2');
      const res: any = await svc.scanQRCode(USER, 'QR-SEAT-2', POINT, true);
      expect(res.isGroup).toBeUndefined();
      expect(res).toMatchObject({ success: true, attendee: { fullName: 'Ravi' }, ticketType: 'General' });
      const data = prisma.eventGroupMemberCheckin.createMany.mock.calls[0][0].data;
      expect(data.map((d: any) => d.memberIndex)).toEqual([1]);
    });

    it("leaves the group's own ticket on the member picker", async () => {
      const { svc, prisma } = scanTicket('t-group');
      const res: any = await svc.scanQRCode(USER, 'QR-GROUP', POINT, true);
      expect(res.isGroup).toBe(true);
      expect(prisma.eventGroupMemberCheckin.createMany).not.toHaveBeenCalled();
    });
  });
});
