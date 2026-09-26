import { BadRequestException } from '@nestjs/common';
import { GroupSeatStatus } from '@prisma/client';
import { CheckinService } from './checkin.service';

/**
 * Group check-in reads its roster from GroupSeat rows: only CLAIMED seats are
 * checkable, and a member is addressed by the stable `seatIndex` (memberIndex =
 * seatIndex - 1). These pin that contract — the seat-model half of the
 * consolidation the roster edit and claim flows feed into.
 */
describe('CheckinService.checkinGroupMembers — seat-driven', () => {
  const REG = 'reg-1';
  const USER = 'organiser-1';
  const POINT = 'point-1';

  const registration = {
    id: REG,
    groupSize: 3,
    status: 'REGISTERED',
    isWaitlisted: false,
    paymentStatus: 'PAID',
    checkedInAt: null,
    event: { id: 'event-1', title: 'Hack Night', spaceId: 'space-1' },
    user: { id: 'lead', fullName: 'Lead', username: 'lead', avatarUrl: null },
    ticketType: { name: 'Team' },
  };

  const seats = [
    { id: 'seat-a', seatIndex: 1, status: GroupSeatStatus.CLAIMED, memberDetails: { name: 'Lead' }, claimedBy: null },
    { id: 'seat-b', seatIndex: 2, status: GroupSeatStatus.CLAIMED, memberDetails: { name: 'Bimal' }, claimedBy: null },
    { id: 'seat-c', seatIndex: 3, status: GroupSeatStatus.OPEN, memberDetails: null, claimedBy: null },
  ];

  const build = () => {
    const createMany = jest.fn().mockResolvedValue({ count: 2 });
    const regUpdate = jest.fn().mockResolvedValue({});
    const prisma: any = {
      eventRegistration: { findUnique: jest.fn().mockResolvedValue(registration), update: regUpdate },
      eventCheckinType: { findFirst: jest.fn().mockResolvedValue({ id: POINT, name: 'Entry' }) },
      eventCheckinAccess: { findFirst: jest.fn().mockResolvedValue(null) },
      userRole: { count: jest.fn().mockResolvedValue(1) }, // caller is a space organiser
      groupSeat: {
        findMany: jest.fn().mockResolvedValue(seats.map((s) => ({ ...s }))),
      },
      eventGroupMemberCheckin: {
        createMany,
        findMany: jest.fn().mockResolvedValue([]),
      },
      eventCheckinRecord: { upsert: jest.fn().mockResolvedValue({}) },
      eventTicket: { updateMany: jest.fn().mockResolvedValue({}) },
      $transaction: async (fn: any) => fn(prisma),
    };
    const svc = new CheckinService(prisma as any, {} as any, {} as any);
    return { svc, prisma, createMany, regUpdate };
  };

  it('rejects checking in an OPEN (unclaimed) seat', async () => {
    const { svc } = build();
    await expect(
      svc.checkinGroupMembers(USER, REG, POINT, [2]), // memberIndex 2 → seatIndex 3 (OPEN)
    ).rejects.toThrow(/not been claimed/i);
  });

  it('checks in CLAIMED seats, linking each record to its seat by seatIndex', async () => {
    const { svc, createMany, regUpdate } = build();
    await svc.checkinGroupMembers(USER, REG, POINT, [0, 1]);

    // memberIndex → groupSeatId: 0 → seat-a (seatIndex 1), 1 → seat-b (seatIndex 2).
    expect(createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({ memberIndex: 0, groupSeatId: 'seat-a', checkinTypeId: POINT }),
          expect.objectContaining({ memberIndex: 1, groupSeatId: 'seat-b', checkinTypeId: POINT }),
        ],
        skipDuplicates: true,
      }),
    );
    // First-ever check-in flips the registration to ATTENDED.
    expect(regUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'ATTENDED' }) }),
    );
  });

  it('rejects a member index outside the seat range', async () => {
    const { svc } = build();
    await expect(svc.checkinGroupMembers(USER, REG, POINT, [3])).rejects.toThrow(
      BadRequestException,
    );
  });
});
