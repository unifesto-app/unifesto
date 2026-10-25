import { GroupSeatStatus } from '@prisma/client';
import { GroupSeatsService } from './group-seats.service';

/**
 * Exercises GroupSeat as the single source of truth for a group roster:
 *   register (seed seats, partial roster) → lead roster edit → invite → claim,
 * plus the roster-edit merge policy in isolation.
 *
 * A small in-memory `group_seats` store backs a fake Prisma so the invite/claim
 * state machine runs end-to-end against real transitions, not per-call stubs.
 * Only the query shapes these methods actually use are implemented.
 */

type Seat = {
  id: string;
  registrationId: string;
  seatIndex: number;
  status: GroupSeatStatus;
  inviteEmail: string | null;
  inviteToken: string;
  claimedByUserId: string | null;
  memberDetails: any;
  claimedAt: Date | null;
  reminderSentAt: Date | null;
};

const REG = 'reg-1';
const LEAD = 'user-lead';
const EVENT = { id: 'event-1', title: 'Hack Night', slug: 'hack-night' };

/** Match a where.status that may be a plain enum, `{ not: X }`, or `{ in: [...] }`. */
const statusMatches = (seatStatus: GroupSeatStatus, cond: any): boolean => {
  if (cond === undefined) return true;
  if (cond && typeof cond === 'object' && 'not' in cond) return seatStatus !== cond.not;
  if (cond && typeof cond === 'object' && 'in' in cond) return cond.in.includes(seatStatus);
  return seatStatus === cond;
};

/** The where-clause shapes the service uses on group_seats, nothing more. */
const seatMatches = (s: Seat, where: any = {}): boolean =>
  (where.id === undefined || s.id === where.id) &&
  (where.inviteToken === undefined || s.inviteToken === where.inviteToken) &&
  (where.registrationId === undefined || s.registrationId === where.registrationId) &&
  (where.seatIndex === undefined ||
    (typeof where.seatIndex === 'object' ? s.seatIndex > where.seatIndex.gt : s.seatIndex === where.seatIndex)) &&
  (where.claimedByUserId === undefined ||
    (where.claimedByUserId && typeof where.claimedByUserId === 'object'
      ? s.claimedByUserId !== null
      : s.claimedByUserId === where.claimedByUserId)) &&
  statusMatches(s.status, where.status) &&
  (where.NOT?.id === undefined || s.id !== where.NOT.id) &&
  (where.OR === undefined || where.OR.some((w: any) => seatMatches(s, w))) &&
  (where.AND === undefined || where.AND.every((w: any) => seatMatches(s, w)));

function makeDb(seed: Seat[] = []) {
  const seats: Seat[] = seed.map((s) => ({ ...s }));
  let seq = seats.length;

  const groupSeat = {
    count: async ({ where }: any) =>
      seats.filter((s) => s.registrationId === where.registrationId).length,

    createMany: async ({ data }: any) => {
      for (const row of data) {
        seats.push({
          id: `seat-${++seq}`,
          inviteEmail: null,
          claimedByUserId: null,
          memberDetails: null,
          claimedAt: null,
          reminderSentAt: null,
          ...row,
        });
      }
      return { count: data.length };
    },

    findMany: async ({ where = {}, orderBy }: any) => {
      let out = seats.filter((s) => seatMatches(s, where));
      if (orderBy?.seatIndex === 'asc')
        out = [...out].sort((a, b) => a.seatIndex - b.seatIndex);
      return out.map((s) => ({ ...s }));
    },

    findUnique: async ({ where, include }: any) => {
      const seat = seats.find((s) => s.inviteToken === where.inviteToken);
      if (!seat) return null;
      const out: any = { ...seat };
      if (include?.registration)
        out.registration = {
          id: REG,
          eventId: EVENT.id,
          // A live group on a live event, so claims are allowed.
          status: 'REGISTERED',
          paymentStatus: 'PAID',
          event: { ...EVENT, status: 'PUBLISHED', endDateTime: new Date(Date.now() + 86_400_000), deletedAt: null },
        };
      return out;
    },

    findFirst: async ({ where }: any) => {
      const hit = seats.find((s) => s.claimedByUserId === where.claimedByUserId && seatMatches(s, where));
      return hit ? { id: hit.id } : null;
    },

    update: async ({ where, data }: any) => {
      const seat = seats.find((s) => s.id === where.id);
      Object.assign(seat!, data);
      return { ...seat! };
    },

    updateMany: async ({ where, data }: any) => {
      const matched = seats.filter((s) => seatMatches(s, where));
      matched.forEach((s) => Object.assign(s, data));
      return { count: matched.length };
    },
  };

  const prisma: any = {
    groupSeat,
    eventRegistration: {
      findUnique: async () => ({ id: REG, userId: LEAD, status: 'REGISTERED', paymentStatus: 'PAID', isWaitlisted: false, event: EVENT }),
      findFirst: async () => null,
    },
    // Linked emails per account; claims must come from the invited email.
    userIdentity: {
      findMany: async ({ where }: any) => {
        const want = String(where?.email?.equals ?? '').toLowerCase();
        return IDENTITIES.filter(
          (i) =>
            i.userId === where?.userId &&
            i.email.toLowerCase() === want &&
            (where?.emailVerified === undefined || i.emailVerified === where.emailVerified),
        );
      },
    },
    // No custom questions on this ticket: the answer policy passes through.
    eventFormField: { findMany: async () => [] },
    eventTicket: {
      create: async ({ data }: any) => ({
        ticketCode: data.ticketCode,
        qrCode: data.qrCode,
      }),
      findMany: async () => [],
      deleteMany: async () => ({ count: 0 }),
    },
    $transaction: async (fn: any) => fn(prisma),
  };

  return { prisma, seats };
}

const build = (seed?: Seat[]) => {
  const { prisma, seats } = makeDb(seed);
  const email = { sendRawEmail: jest.fn().mockResolvedValue(undefined) };
  const whatsapp = {
    sendEventWhatsAppGroupInvite: jest.fn().mockResolvedValue(true),
  };
  const svc = new GroupSeatsService(prisma as any, email as any, whatsapp as any);
  return { svc, prisma, seats, email };
};

const IDENTITIES = [
  { userId: 'user-dinesh', email: 'Dinesh@x.com', emailVerified: true },
  { userId: 'user-bimal', email: 'bimal@x.com', emailVerified: true },
];

describe('GroupSeatsService — seats as source of truth', () => {
  it('end to end: seed partial roster → edit → invite → claim → check-in ready', async () => {
    const { svc, prisma, seats, email } = build();

    // 1) Register a group of 4 with only the lead + one member filled up front.
    //    The service takes the transaction client directly; our `prisma` fake is it.
    await svc.createSeatsForRegistration(prisma as any, {
      registrationId: REG,
      leadUserId: LEAD,
      seatCount: 4,
      groupMembers: [
        { name: 'Lead' },
        { name: 'Bimal', email: 'bimal@x.com', mobile: '9000000001' },
      ],
    });

    expect(seats).toHaveLength(4);
    expect(seats[0]).toMatchObject({ seatIndex: 1, status: 'CLAIMED', claimedByUserId: LEAD });
    expect(seats[1]).toMatchObject({ seatIndex: 2, status: 'CLAIMED', claimedByUserId: null });
    expect(seats[2]).toMatchObject({ seatIndex: 3, status: 'OPEN' });
    expect(seats[3]).toMatchObject({ seatIndex: 4, status: 'OPEN' });

    // 2) Lead edits the roster to also fill seat 3.
    const { filledMembers } = await svc.applyLeadRoster(REG, LEAD, 4, [
      { name: 'Lead' },
      { name: 'Bimal', email: 'bimal@x.com', mobile: '9000000001' },
      { name: 'Chandra', email: 'chandra@x.com', mobile: '9000000002' },
    ]);
    expect(filledMembers.map((m) => m.name)).toEqual(['Chandra']); // only the newly-filled OPEN seat
    expect(seats[2]).toMatchObject({ seatIndex: 3, status: 'CLAIMED', claimedByUserId: null });
    expect(seats[3].status).toBe('OPEN'); // seat 4 still open

    // 3) Invite the last OPEN seat.
    const openToken = seats[3].inviteToken;
    const { invited } = await svc.invite(REG, LEAD, [{ email: 'dinesh@x.com' }]);
    expect(invited).toEqual([{ seatIndex: 4, email: 'dinesh@x.com' }]);
    expect(seats[3]).toMatchObject({ status: 'INVITED', inviteEmail: 'dinesh@x.com' });
    expect(email.sendRawEmail).toHaveBeenCalledWith(
      'dinesh@x.com',
      expect.stringContaining('Hack Night'),
      expect.any(String),
    );

    // 4) Dinesh claims seat 4 → own ticket, seat CLAIMED to their account.
    const res = await svc.claim(openToken, 'user-dinesh', { name: 'Dinesh' });
    expect(res.seatIndex).toBe(4);
    expect(res.ticket.qrCode).toEqual(expect.any(String));
    expect(seats[3]).toMatchObject({ status: 'CLAIMED', claimedByUserId: 'user-dinesh' });
    // The app sends no email on claim; the seat must still record one (falls
    // back to the invite email when the account email can't be read).
    expect(seats[3].memberDetails).toMatchObject({ name: 'Dinesh', email: 'dinesh@x.com' });

    // 5) Every seat is now CLAIMED → all four are attendees a scanner may check
    // in by stable seatIndex (memberIndex = seatIndex - 1).
    expect(seats.every((s) => s.status === 'CLAIMED')).toBe(true);
    expect(seats.map((s) => s.seatIndex)).toEqual([1, 2, 3, 4]);
  });

  it('only the account that owns the invited email can claim', async () => {
    const seed: Seat[] = [
      seat(1, 'CLAIMED', { claimedByUserId: LEAD }),
      seat(2, 'INVITED', { inviteEmail: 'dinesh@x.com' }),
    ];
    const { svc, seats } = build(seed);
    const token = seats[1].inviteToken;

    await expect(svc.claim(token, 'user-someone-else', { name: 'Eve' })).rejects.toThrow(/different account/);
    expect(seats[1].status).toBe('INVITED'); // untouched

    const res = await svc.claim(token, 'user-dinesh', { name: 'Dinesh' }); // case-insensitive match
    expect(res.seatIndex).toBe(2);
  });

  it('null roster entries leave their seat untouched (edit one member past a gap)', async () => {
    const seed: Seat[] = [
      seat(1, 'CLAIMED', { claimedByUserId: LEAD, memberDetails: { name: 'Lead' } }),
      seat(2, 'OPEN'), // invite-later seat, nothing to send
      seat(3, 'OPEN'),
    ];
    const { svc, seats } = build(seed);

    // Lead fills only seat 3; seats 1 and 2 are sent as null.
    const { filledMembers } = await svc.applyLeadRoster(REG, LEAD, 3, [
      null,
      null,
      { name: 'Chandra', email: 'chandra@x.com', mobile: '9000000002' },
    ]);

    expect(filledMembers.map((m) => m.name)).toEqual(['Chandra']);
    expect(seats[0].memberDetails).toMatchObject({ name: 'Lead' }); // unchanged
    expect(seats[1]).toMatchObject({ status: 'OPEN', memberDetails: null }); // gap untouched
    expect(seats[2]).toMatchObject({ status: 'CLAIMED', memberDetails: { name: 'Chandra' } });
  });

  it('member identity is write-once: only blanks and custom answers change', async () => {
    const seed: Seat[] = [
      seat(1, 'CLAIMED', { claimedByUserId: LEAD, memberDetails: { name: 'Lead' } }),
      seat(2, 'CLAIMED', {
        memberDetails: { name: 'Bimal', email: 'bimal@x.com', mobile: '9000000001', gender: '' },
      }),
    ];
    const { svc, seats } = build(seed);

    await svc.applyLeadRoster(REG, LEAD, 2, [
      null,
      {
        name: 'Renamed',
        email: 'other@x.com',
        mobile: '9999999999',
        gender: 'Male', // was blank, so this one is allowed
        customFields: { tshirt: 'L' },
      },
    ]);

    expect(seats[1].memberDetails).toMatchObject({
      name: 'Bimal',
      email: 'bimal@x.com',
      mobile: '9000000001',
      gender: 'Male',
      customFields: { tshirt: 'L' },
    });
  });

  it('roster edit never disturbs a member-claimed seat or an in-flight invite', async () => {
    const seed: Seat[] = [
      seat(1, 'CLAIMED', { claimedByUserId: LEAD }),
      seat(2, 'CLAIMED', { claimedByUserId: 'user-real' }), // a member claimed their own
      seat(3, 'INVITED', { inviteEmail: 'pending@x.com' }), // invite in flight
      seat(4, 'OPEN'),
    ];
    const { svc, seats } = build(seed);

    const { filledMembers } = await svc.applyLeadRoster(REG, LEAD, 4, [
      { name: 'Lead edited' },
      { name: 'HIJACK', email: 'hijack@x.com', mobile: '9' }, // must NOT overwrite seat 2
      { name: 'HIJACK2', email: 'h2@x.com', mobile: '9' }, // must NOT touch INVITED seat 3
      { name: 'Fourth', email: 'fourth@x.com', mobile: '9' }, // fills the OPEN seat
    ]);

    expect(seats[0].memberDetails).toMatchObject({ name: 'Lead edited' }); // lead editable
    expect(seats[1].claimedByUserId).toBe('user-real'); // untouched
    expect(seats[1].memberDetails).toBeNull();
    expect(seats[2].status).toBe('INVITED'); // untouched
    expect(seats[3]).toMatchObject({ status: 'CLAIMED', claimedByUserId: null });
    expect(filledMembers.map((m) => m.name)).toEqual(['Fourth']);
  });

  it('releases an OPEN or INVITED seat, and reopen brings it back', async () => {
    const { svc, seats } = build([
      seat(1, 'CLAIMED', { claimedByUserId: LEAD }),
      seat(2, 'OPEN'),
      seat(3, 'INVITED', { inviteEmail: 'pending@x.com' }),
    ]);

    // Retire the OPEN seat.
    const r2 = await svc.releaseSeat(REG, 2);
    expect(r2).toMatchObject({ seatIndex: 2, status: 'RELEASED' });
    expect(seats[1].status).toBe('RELEASED');

    // Retiring an INVITED seat also kills its live link: token rotated, email cleared.
    const oldToken = seats[2].inviteToken;
    await svc.releaseSeat(REG, 3);
    expect(seats[2]).toMatchObject({ status: 'RELEASED', inviteEmail: null });
    expect(seats[2].inviteToken).not.toBe(oldToken);

    // Reopen the first one back to OPEN with a fresh token.
    const openToken = seats[1].inviteToken;
    const back = await svc.reopenSeat(REG, 2);
    expect(back).toMatchObject({ seatIndex: 2, status: 'OPEN' });
    expect(seats[1].inviteToken).not.toBe(openToken);
  });

  it('never releases a CLAIMED seat, and never reopens a non-released seat', async () => {
    const { svc } = build([
      seat(1, 'CLAIMED', { claimedByUserId: LEAD }),
      seat(2, 'OPEN'),
    ]);
    await expect(svc.releaseSeat(REG, 1)).rejects.toThrow(/cannot be released/i);
    await expect(svc.reopenSeat(REG, 2)).rejects.toThrow(/not currently released/i);
  });

  it('a roster edit never revives a RELEASED seat', async () => {
    const seed: Seat[] = [
      seat(1, 'CLAIMED', { claimedByUserId: LEAD }),
      seat(2, 'RELEASED'),
      seat(3, 'OPEN'),
    ];
    const { svc, seats } = build(seed);

    const { filledMembers } = await svc.applyLeadRoster(REG, LEAD, 3, [
      { name: 'Lead' },
      { name: 'SHOULD_NOT_LAND', email: 'x@x.com', mobile: '9' }, // targets the RELEASED seat
      { name: 'Third', email: 'third@x.com', mobile: '9' },
    ]);

    expect(seats[1].status).toBe('RELEASED'); // untouched
    expect(seats[1].memberDetails).toBeNull();
    expect(seats[2]).toMatchObject({ status: 'CLAIMED', claimedByUserId: null });
    expect(filledMembers.map((m) => m.name)).toEqual(['Third']);
  });

  it('a released seat cannot be claimed', async () => {
    const { svc, seats } = build([
      seat(1, 'CLAIMED', { claimedByUserId: LEAD }),
      seat(2, 'RELEASED'),
    ]);
    await expect(svc.claim(seats[1].inviteToken, 'user-x')).rejects.toThrow(
      /no longer available/i,
    );
    expect(seats[1].status).toBe('RELEASED'); // untouched
  });

  it('a losing concurrent claim gets a clean "already taken"', async () => {
    const { svc, prisma } = build([
      seat(1, 'CLAIMED', { claimedByUserId: LEAD }),
      seat(2, 'INVITED', { inviteEmail: 'dinesh@x.com' }),
    ]);
    // Simulate the guarded update losing the race (0 rows changed).
    prisma.groupSeat.updateMany = jest.fn().mockResolvedValue({ count: 0 });
    const token = (await prisma.groupSeat.findMany({ where: { registrationId: REG } }))[1]
      .inviteToken;
    await expect(svc.claim(token, 'user-dinesh')).rejects.toThrow(/just been taken/i);
  });
});

// ── helpers ──────────────────────────────────────────────────────────────────

describe('GroupSeatsService — linking a typed-in teammate', () => {
  // Seat 2 was typed in by the lead: CLAIMED (checkable at the door) but no
  // account holds it, so the hackathon shows them "Not joined yet".
  const typedTeam = () => [
    seat(1, GroupSeatStatus.CLAIMED, { claimedByUserId: LEAD }),
    seat(2, GroupSeatStatus.CLAIMED, {
      memberDetails: { name: 'Bimal', email: 'bimal@x.com', mobile: '9000000001' },
    }),
    seat(3, GroupSeatStatus.OPEN),
  ];

  it('invites the typed-in seat by number without taking it off the team', async () => {
    const { svc, seats, email } = build(typedTeam());
    const { invited } = await svc.invite(REG, LEAD, [{ seatIndex: 2, email: 'Bimal@x.com' }]);
    expect(invited).toEqual([{ seatIndex: 2, email: 'bimal@x.com' }]);
    expect(seats[1]).toMatchObject({ status: 'CLAIMED', claimedByUserId: null, inviteEmail: 'bimal@x.com' });
    expect(seats[1].memberDetails).toMatchObject({ name: 'Bimal' });
    expect(email.sendRawEmail).toHaveBeenCalledWith('bimal@x.com', expect.any(String), expect.any(String));
  });

  it('never picks a typed-in seat when no seat number is given', async () => {
    const { svc, seats } = build(typedTeam());
    const { invited } = await svc.invite(REG, LEAD, [{ email: 'x@x.com' }]);
    expect(invited).toEqual([{ seatIndex: 3, email: 'x@x.com' }]);
    await expect(svc.invite(REG, LEAD, [{ email: 'y@x.com' }])).rejects.toThrow(/no open seats/i);
    expect(seats[1].inviteEmail).toBeNull();
  });

  it('refuses to invite seat 1, which is always the lead', async () => {
    const { svc } = build(typedTeam());
    await expect(svc.invite(REG, LEAD, [{ seatIndex: 1, email: 'x@x.com' }])).rejects.toThrow(/no open seats/i);
  });

  it('the invited account claims it: account linked, typed details kept under theirs', async () => {
    const { svc, seats } = build(typedTeam());
    await svc.invite(REG, LEAD, [{ seatIndex: 2, email: 'bimal@x.com' }]);
    const token = seats[1].inviteToken;

    await expect(svc.claim(token, 'user-dinesh', { name: 'Dinesh' })).rejects.toThrow(/different account/);
    expect((await svc.getClaimInfo(token, 'user-bimal')).seatIndex).toBe(2);

    const res = await svc.claim(token, 'user-bimal', { name: 'Bimal K' });
    expect(res.ticket.qrCode).toEqual(expect.any(String));
    expect(seats[1]).toMatchObject({ status: 'CLAIMED', claimedByUserId: 'user-bimal' });
    expect(seats[1].memberDetails).toMatchObject({ name: 'Bimal K', mobile: '9000000001', email: 'bimal@x.com' });

    // Linked now, so it can't be claimed again.
    await expect(svc.claim(token, 'user-bimal')).rejects.toThrow(/already been claimed/);
  });

  it('a typed-in seat nobody invited cannot be claimed, even with its token', async () => {
    const { svc, seats } = build(typedTeam());
    await expect(svc.claim(seats[1].inviteToken, 'user-bimal')).rejects.toThrow(/hasn't been sent/);
    expect(seats[1].claimedByUserId).toBeNull();
  });

  it('declining only cancels the link: they stay on the team as typed', async () => {
    const { svc, seats } = build(typedTeam());
    await svc.invite(REG, LEAD, [{ seatIndex: 2, email: 'bimal@x.com' }]);
    const token = seats[1].inviteToken;
    expect(await svc.decline(token, 'user-bimal')).toEqual({ seatIndex: 2, status: 'CLAIMED' });
    expect(seats[1]).toMatchObject({ status: 'CLAIMED', claimedByUserId: null, inviteEmail: null });
    expect(seats[1].inviteToken).not.toBe(token);
    expect(seats[1].memberDetails).toMatchObject({ name: 'Bimal' });
  });
});

let tokenSeq = 0;
function seat(seatIndex: number, status: GroupSeatStatus, extra: Partial<Seat> = {}): Seat {
  return {
    id: `seat-${seatIndex}`,
    registrationId: REG,
    seatIndex,
    status,
    inviteEmail: null,
    inviteToken: `tok-${seatIndex}-${++tokenSeq}`,
    claimedByUserId: null,
    memberDetails: null,
    claimedAt: null,
    reminderSentAt: null,
    ...extra,
  };
}
