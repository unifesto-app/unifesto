import { EventStatus, GroupPricingMode } from '@prisma/client';
import { teamChangeWindow } from './attendee-details.service';
import { addSeatsQuote } from './team-changes.service';
import { allocateRefund } from '../refunds/refunds.service';

const now = new Date('2026-10-10T10:00:00Z');
const later = new Date('2026-10-12T10:00:00Z');
const open = { status: EventStatus.PUBLISHED, endDateTime: later, allowTeamChanges: true, teamChangesUntil: null };

describe('teamChangeWindow', () => {
  it('is open while switched on, before the deadline and the event end', () => {
    expect(teamChangeWindow(open, now).open).toBe(true);
    expect(teamChangeWindow({ ...open, teamChangesUntil: later }, now).open).toBe(true);
  });
  it('closes when switched off, past the deadline, or once the event is over', () => {
    expect(teamChangeWindow({ ...open, allowTeamChanges: false }, now).open).toBe(false);
    expect(teamChangeWindow({ ...open, teamChangesUntil: now }, now).reason).toMatch(/deadline/);
    expect(teamChangeWindow({ ...open, endDateTime: new Date('2026-10-01') }, now).open).toBe(false);
    expect(teamChangeWindow({ ...open, status: EventStatus.CANCELLED }, now).open).toBe(false);
  });
});

describe('addSeatsQuote', () => {
  const fee = (b: number) => ({ base: b, fee: b * 0.05, total: b * 1.05 });
  it('charges per person plus fee on PER_PERSON paid tickets', () => {
    expect(addSeatsQuote({ price: 199, groupPricingMode: GroupPricingMode.PER_PERSON }, 2, fee)).toEqual({
      base: 398,
      fee: 19.9,
      total: 417.9,
    });
  });
  it('is free for PER_GROUP or free tickets', () => {
    expect(addSeatsQuote({ price: 999, groupPricingMode: GroupPricingMode.PER_GROUP }, 3, fee).total).toBe(0);
    expect(addSeatsQuote({ price: 0, groupPricingMode: GroupPricingMode.PER_PERSON }, 3, fee).total).toBe(0);
  });
});

describe('allocateRefund', () => {
  it("draws on the group's own payment first, then extra seats in order", () => {
    expect(
      allocateRefund(500, [
        { key: 'reg', room: 300 },
        { key: 'a1', room: 150 },
        { key: 'a2', room: 150 },
      ]),
    ).toEqual([
      { key: 'reg', amount: 300 },
      { key: 'a1', amount: 150 },
      { key: 'a2', amount: 50 },
    ]);
  });
  it('skips exhausted payments and never over-allocates', () => {
    expect(allocateRefund(100, [{ key: 'reg', room: 0 }, { key: 'a1', room: 40 }])).toEqual([{ key: 'a1', amount: 40 }]);
  });
});
