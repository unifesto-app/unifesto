import { GroupSeatStatus } from '@prisma/client';
import {
  BADGE_LAYOUT_KEYS,
  badgeGrid,
  badgesFor,
  mmToPt,
  pageCount,
  type BadgeRegistration,
  type BadgeSeat,
} from './badges.util';

describe('badge layouts (N1)', () => {
  it('tiles an A4 sheet 2 × 4 inside its margin, without overlaps', () => {
    const g = badgeGrid('a4-8');
    expect([g.cols, g.rows, g.perPage, g.cutMarks]).toEqual([2, 4, 8, true]);
    const [pw, ph] = g.page;
    const [bw, bh] = g.badge;
    const margin = mmToPt(10);
    for (const c of g.cells) {
      expect(c.x).toBeGreaterThanOrEqual(margin - 1e-6);
      expect(c.y).toBeGreaterThanOrEqual(margin - 1e-6);
      expect(c.x + bw).toBeLessThanOrEqual(pw - margin + 1e-6);
      expect(c.y + bh).toBeLessThanOrEqual(ph - margin + 1e-6);
    }
    // Neighbours are a full gap apart, so cut marks never land on a badge.
    expect(g.cells[1].x - g.cells[0].x).toBeCloseTo(bw + mmToPt(6));
    expect(g.cells[2].y - g.cells[0].y).toBeCloseTo(bh + mmToPt(6));
  });

  it('prints one badge per label page, edge to edge, without cut marks', () => {
    for (const key of BADGE_LAYOUT_KEYS.filter((k) => k.startsWith('label-'))) {
      const g = badgeGrid(key);
      expect(g.perPage).toBe(1);
      expect(g.cells).toEqual([{ x: 0, y: 0 }]);
      expect(g.badge).toEqual(g.page);
      expect(g.cutMarks).toBe(false);
    }
  });

  it('counts pages', () => {
    expect(pageCount(0, 'a4-8')).toBe(0);
    expect(pageCount(8, 'a4-8')).toBe(1);
    expect(pageCount(17, 'a4-8')).toBe(3);
    expect(pageCount(2000, 'a4-8')).toBe(250);
    expect(pageCount(2000, 'label-4x3in')).toBe(2000);
  });
});

describe('badgesFor (N1 roster)', () => {
  const checkout = new Date('2026-10-01T10:00:00Z');
  const later = new Date('2026-10-03T09:00:00Z');
  const groupTicket = {
    id: 't-group',
    qrCode: 'QR-GROUP-TICKET',
    attendeeEmail: null,
    createdAt: checkout,
  };

  const reg = (over: Partial<BadgeRegistration> = {}): BadgeRegistration => ({
    qrCode: 'QR-REG',
    groupSize: null,
    user: { fullName: 'Asha Lead', username: 'asha' },
    ticketType: { name: 'Hacker' },
    tickets: [groupTicket],
    ...over,
  });
  const seat = (
    seatIndex: number,
    over: Partial<BadgeSeat> = {},
  ): BadgeSeat => ({
    seatIndex,
    status: GroupSeatStatus.CLAIMED,
    claimedAt: checkout,
    memberDetails: null,
    claimedBy: null,
    ...over,
  });

  it('gives an individual booking one badge on the registration QR', () => {
    expect(badgesFor(reg(), [])).toEqual([
      { name: 'Asha Lead', ticketType: 'Hacker', qr: 'QR-REG' },
    ]);
  });

  it('gives each claimed member their own seat ticket, the lead the group QR, and skips unclaimed seats', () => {
    const r = reg({
      groupSize: 5,
      tickets: [
        groupTicket,
        // Stamped seat ticket for a typed-in member.
        {
          id: 't-2',
          qrCode: 'QR-SEAT-2',
          attendeeEmail: 'Ravi@x.in',
          createdAt: checkout,
        },
        // Unstamped ticket minted when member 3 claimed with their account.
        {
          id: 't-3',
          qrCode: 'QR-SEAT-3',
          attendeeEmail: null,
          createdAt: new Date(+later + 2_000),
        },
      ],
    });
    const seats = [
      seat(4, { status: GroupSeatStatus.OPEN, claimedAt: null }),
      seat(3, {
        claimedAt: later,
        claimedBy: {
          fullName: 'Meera K',
          username: 'meera',
          identities: [{ email: 'meera@x.in' }],
        },
      }),
      seat(1, {
        claimedBy: { fullName: 'Asha Lead', username: 'asha', identities: [] },
      }),
      seat(2, { memberDetails: { name: 'Ravi', email: 'ravi@x.in' } }),
      seat(5, { status: GroupSeatStatus.RELEASED, claimedAt: null }),
    ];
    expect(badgesFor(r, seats)).toEqual([
      { name: 'Asha Lead', ticketType: 'Hacker', qr: 'QR-REG' },
      { name: 'Ravi', ticketType: 'Hacker', qr: 'QR-SEAT-2' },
      { name: 'Meera K', ticketType: 'Hacker', qr: 'QR-SEAT-3' },
    ]);
  });

  it("never hands a typed-in member the group's own ticket (both are minted at checkout)", () => {
    const r = reg({ groupSize: 2 });
    const [, member] = badgesFor(r, [
      seat(1),
      seat(2, { memberDetails: { customFields: { 'Full Name': 'Kiran' } } }),
    ]);
    expect(member).toEqual({
      name: 'Kiran',
      ticketType: 'Hacker',
      qr: 'QR-REG',
    });
  });

  it('labels a member with no name as Guest and an untyped ticket as RSVP', () => {
    const r = reg({ groupSize: 2, ticketType: null });
    expect(
      badgesFor(r, [seat(1), seat(2)]).map((b) => [b.name, b.ticketType]),
    ).toEqual([
      ['Asha Lead', 'RSVP'],
      ['Guest', 'RSVP'],
    ]);
  });
});
