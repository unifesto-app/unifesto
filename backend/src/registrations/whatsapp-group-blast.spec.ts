import { buildRegistrationsService } from './registrations.testing';

/**
 * End-to-end proof of the per-member WhatsApp group blast, run against an
 * in-memory Prisma double + a recording WhatsApp stub. Invokes the REAL
 * `sendGroupInviteBlast` (and its `sendInviteToGroupMemberSeats` helper) so the
 * lead-vs-member split, phone resolution, no-phone skip, per-seat stamping and
 * re-run dedup are all exercised as they run in production.
 */

interface Seat {
  id: string;
  seatIndex: number;
  whatsappInviteSentAt: Date | null;
  memberDetails: Record<string, unknown> | null;
  claimedBy: {
    mobileNumber: string | null;
    fullName: string | null;
    username: string | null;
  } | null;
}
interface Reg {
  id: string;
  whatsappInviteSentAt: Date | null;
  whatsappGroupJoinedAt: Date | null;
  ticketType: { whatsappGroupUrl: string | null } | null;
  user: { mobileNumber: string | null; fullName: string | null; username: string | null };
  groupSeats: Seat[];
}

function makeHarness() {
  const event = {
    id: 'ev1',
    title: 'Hackverse 2026',
    whatsappAttendeeGroupUrl: 'https://chat.whatsapp.com/AbCdEfGhIjKlMnOpQrStUv',
    parentEvent: null as { whatsappAttendeeGroupUrl: string | null } | null,
  };

  const registrations: Reg[] = [
    // Individual attendee (no seats) — invited via the registration row.
    {
      id: 'r1',
      whatsappInviteSentAt: null,
      whatsappGroupJoinedAt: null,
      ticketType: { whatsappGroupUrl: null },
      user: { mobileNumber: '9111111111', fullName: 'Ana Solo', username: null },
      groupSeats: [],
    },
    // Group of 3: lead (seat 1) + one claimed member with a phone (seat 2) +
    // one still-open seat with no phone (seat 3).
    {
      id: 'r2',
      whatsappInviteSentAt: null,
      whatsappGroupJoinedAt: null,
      ticketType: { whatsappGroupUrl: null },
      user: { mobileNumber: '9222222222', fullName: 'Lead Larry', username: null },
      groupSeats: [
        {
          id: 's1',
          seatIndex: 1,
          whatsappInviteSentAt: null,
          memberDetails: { name: 'Lead Larry', mobile: '9222222222' },
          claimedBy: { mobileNumber: '9222222222', fullName: 'Lead Larry', username: null },
        },
        {
          id: 's2',
          seatIndex: 2,
          whatsappInviteSentAt: null,
          memberDetails: { name: 'Mia Member', mobile: '9333333333' },
          claimedBy: null,
        },
        {
          id: 's3',
          seatIndex: 3,
          whatsappInviteSentAt: null,
          memberDetails: null, // unfilled / unclaimed → no phone
          claimedBy: null,
        },
      ],
    },
  ];

  const allSeats = () => registrations.flatMap((r) => r.groupSeats);

  const prisma = {
    event: {
      findUnique: async () => event,
    },
    eventTicketType: {
      count: async () => 0, // no ticket-type-specific links in this fixture
    },
    eventRegistration: {
      findMany: async () => registrations, // COUNTS_AS_ATTENDING applied by real DB
      update: async ({ where, data }: any) => {
        const r = registrations.find((x) => x.id === where.id)!;
        Object.assign(r, data);
        return r;
      },
    },
    groupSeat: {
      update: async ({ where, data }: any) => {
        const s = allSeats().find((x) => x.id === where.id)!;
        Object.assign(s, data);
        return s;
      },
    },
  };

  const sends: { to: string; userName: string; inviteUrl: string; isCommunity: boolean }[] = [];
  const whatsappService = {
    sendEventWhatsAppGroupInvite: async (to: string, d: any) => {
      sends.push({ to, ...d });
    },
  };

  // Real services wired with only what the blast touches. The blast
  // materialises seats for legacy seatless groups first; these fixtures already
  // carry their seats, so the ensure step is a no-op stub.
  const groupSeats = { ensureSeatsForRegistration: async () => undefined };
  const none = {} as any;
  const svc = buildRegistrationsService(
    prisma, none, whatsappService, none, none, none, none, none, none, groupSeats,
    none, none, none, none, none,
  );

  return { svc, registrations, sends };
}

describe('sendGroupInviteBlast — per-member group invite', () => {
  it('invites the lead + each member seat with a phone, skips no-phone, and dedups on re-run', async () => {
    const { svc, registrations, sends } = makeHarness();

    // ---- First blast ----
    const first = await svc.sendGroupInviteBlast('ev1');

    // Recipients attempted: r1 lead, r2 lead, r2 seat2, r2 seat3 = 4.
    expect(first).toEqual({ eligible: 4, sent: 3, noPhone: 1, noLink: 0, failed: 0 });

    // Exactly the three phones with numbers were messaged — crucially including
    // the group MEMBER (9333333333), not just the two leads.
    expect(sends.map((s) => s.to).sort()).toEqual([
      '9111111111', // individual
      '9222222222', // group lead
      '9333333333', // group member (seat 2)
    ]);

    // Stamps landed where the send happened.
    const r2 = registrations.find((r) => r.id === 'r2')!;
    expect(r2.whatsappInviteSentAt).toBeInstanceOf(Date); // lead via reg row
    expect(r2.groupSeats[1].whatsappInviteSentAt).toBeInstanceOf(Date); // seat 2 sent
    expect(r2.groupSeats[0].whatsappInviteSentAt).toBeNull(); // seat 1 = lead, tracked on reg
    expect(r2.groupSeats[2].whatsappInviteSentAt).toBeNull(); // seat 3 = no phone, never sent

    // ---- Second blast (nothing new except the still-un-phoned seat) ----
    sends.length = 0;
    const second = await svc.sendGroupInviteBlast('ev1');

    // Only seat 3 remains eligible (no phone) → attempted but skipped; no sends.
    expect(second).toEqual({ eligible: 1, sent: 0, noPhone: 1, noLink: 0, failed: 0 });
    expect(sends).toHaveLength(0);
  });
});
