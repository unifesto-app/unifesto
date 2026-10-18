import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { FreeAttendeeAddService } from './free-attendee-add.service';
import { freeAddSeatsLeft, takeFreeAddSeats } from './free-add-quota';
import { TeamChangesService } from '../registrations/team-changes.service';
import { RegistrationImportService } from '../registrations/registration-import.service';

/** A27: a free-add approval is a revocable seat quota that every comp draws down. */
describe('free-add seat quota (A27)', () => {
  describe('takeFreeAddSeats / freeAddSeatsLeft', () => {
    it('throws when no approval has room', async () => {
      const db: any = { $executeRaw: jest.fn(async () => 0) };
      await expect(takeFreeAddSeats(db, 'ev', 'tt', 2)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('passes when one approval took the seats', async () => {
      const db: any = { $executeRaw: jest.fn(async () => 1) };
      await expect(takeFreeAddSeats(db, 'ev', 'tt', 2)).resolves.toBeUndefined();
    });

    it('sums what is left; a legacy unlimited approval means no limit', async () => {
      const db = (rows: any[]): any => ({ freeAttendeeAddRequest: { findMany: jest.fn(async () => rows) } });
      expect(await freeAddSeatsLeft(db([]), 'ev', 'tt')).toBe(0);
      expect(await freeAddSeatsLeft(db([{ approvedSeats: 5, usedSeats: 2 }, { approvedSeats: 1, usedSeats: 1 }]), 'ev', 'tt')).toBe(3);
      expect(await freeAddSeatsLeft(db([{ approvedSeats: null, usedSeats: 40 }]), 'ev', 'tt')).toBeNull();
    });
  });

  describe('review and revoke', () => {
    const build = (req: any, claimed = 1, live = 0) => {
      const tx: any = {
        freeAttendeeAddRequest: {
          updateMany: jest.fn(async () => ({ count: claimed })),
          count: jest.fn(async () => live),
        },
        event: { update: jest.fn(async () => ({})) },
      };
      const prisma: any = {
        freeAttendeeAddRequest: {
          findUnique: jest.fn(async () => req),
          findUniqueOrThrow: jest.fn(async () => ({ id: 'r1' })),
        },
        $transaction: jest.fn(async (fn: any) => fn(tx)),
      };
      return { svc: new FreeAttendeeAddService(prisma), tx };
    };
    const pending = { id: 'r1', eventId: 'ev', status: 'PENDING', requestedSeats: null };

    it('approving needs a seat count when none was requested', async () => {
      const { svc } = build(pending);
      await expect(svc.reviewRequest('r1', 'admin', { status: 'APPROVED' })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('approves the requested seats by default and turns the event flag on', async () => {
      const { svc, tx } = build({ ...pending, requestedSeats: 20 });
      await svc.reviewRequest('r1', 'admin', { status: 'APPROVED' });
      expect(tx.freeAttendeeAddRequest.updateMany.mock.calls[0][0]).toMatchObject({
        where: { id: 'r1', status: 'PENDING' },
        data: { status: 'APPROVED', approvedSeats: 20 },
      });
      expect(tx.event.update).toHaveBeenCalledWith({ where: { id: 'ev' }, data: { allowFreeAttendeeAdd: true } });
    });

    it('a second admin deciding at the same time gets a conflict', async () => {
      const { svc } = build({ ...pending, requestedSeats: 5 }, 0);
      await expect(svc.reviewRequest('r1', 'admin', { status: 'APPROVED' })).rejects.toBeInstanceOf(ConflictException);
    });

    it('revoking the last live approval turns the event flag off', async () => {
      const { svc, tx } = build({ eventId: 'ev' }, 1, 0);
      await svc.revokeRequest('r1', 'admin', {});
      expect(tx.freeAttendeeAddRequest.updateMany.mock.calls[0][0].where).toEqual({ id: 'r1', status: 'APPROVED' });
      expect(tx.event.update).toHaveBeenCalledWith({ where: { id: 'ev' }, data: { allowFreeAttendeeAdd: false } });
    });

    it('only an approved request can be revoked', async () => {
      const { svc } = build({ eventId: 'ev' }, 0);
      await expect(svc.revokeRequest('r1', 'admin', {})).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('curator add-seats on a paid per-person ticket', () => {
    const build = (quotaRows: number) => {
      const tx: any = { $executeRaw: jest.fn(async () => quotaRows) };
      const prisma: any = { $transaction: jest.fn(async (fn: any) => fn(tx)) };
      const payments: any = { computeProcessingFee: (b: number) => Math.round(b * 5) / 100 };
      const svc = new TeamChangesService(prisma, {} as any, payments, {} as any, {} as any);
      const reg = { id: 'reg', eventId: 'ev', ticketTypeId: 'tt', ticketType: { price: 500, groupPricingMode: 'PER_PERSON' } };
      jest.spyOn(svc as any, 'load').mockResolvedValue(reg);
      jest.spyOn(svc as any, 'assertCanGrow').mockReturnValue(undefined);
      const grow = jest.spyOn(svc as any, 'growInTx').mockResolvedValue(5);
      return { svc, tx, grow };
    };

    it('draws the seats from the free-seat quota', async () => {
      const { svc, tx, grow } = build(1);
      await expect(svc.addSeats('reg', 2, { by: 'curator', eventId: 'ev' })).resolves.toEqual({ groupSize: 5 });
      expect(tx.$executeRaw).toHaveBeenCalled();
      expect(grow).toHaveBeenCalled();
    });

    it('is refused with no quota left, and adds nothing', async () => {
      const { svc, grow } = build(0);
      await expect(svc.addSeats('reg', 2, { by: 'curator', eventId: 'ev' })).rejects.toBeInstanceOf(ForbiddenException);
      expect(grow).not.toHaveBeenCalled();
    });

    it('a lead still has to pay', async () => {
      const { svc } = build(1);
      await expect(svc.addSeats('reg', 2, { by: 'lead', userId: 'u' })).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('CSV import of a paid ticket', () => {
    const svc = new RegistrationImportService({} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
    jest.spyOn(svc as any, 'resolveUserIdByEmail').mockResolvedValue(null);
    const row = (line: number, groupSize: number | null = null) => ({ line, name: 'A', email: `a${line}@x.in`, groupSize, error: null });
    const classify = (r: any, state: any) => (svc as any).classifyImportRow('ev', 'tt', r, state);

    it('creates rows while free seats last, then refuses the rest', async () => {
      const state = { remaining: null, seen: new Set(), freeLeft: 3, ticketsFor: (r: any) => r.groupSize ?? 1 };
      const verdicts: any[] = [];
      for (const r of [row(1), row(2, 2), row(3)]) verdicts.push(await classify(r, state));
      expect(verdicts.map((v) => v.decision)).toEqual(['create', 'create', 'error']);
      expect(verdicts[2].reason).toMatch(/no free seats left/);
    });

    it('with no approval at all, a paid row is refused', async () => {
      const state = { remaining: null, seen: new Set(), freeLeft: 0, ticketsFor: () => 1 };
      expect((await classify(row(1), state)).decision).toBe('error');
    });

    it('a free ticket (no quota state) imports as before', async () => {
      expect((await classify(row(1), { remaining: null, seen: new Set() })).decision).toBe('create');
    });
  });
});
