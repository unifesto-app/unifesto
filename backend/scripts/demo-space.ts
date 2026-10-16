/*
 * Demo Space for screen recordings (Track P4). Every name, email and number is
 * made up, so marketing videos never show a real attendee.
 *
 * Creates one PRIVATE Space ("Aurora Tech Club") on the PRO plan with a team,
 * four PRIVATE events (a finished paid fest with check-ins, an upcoming paid
 * hackathon with team tickets, a free RSVP workshop, a draft) and ~110
 * attendees. PRIVATE keeps it out of every public listing, sitemap and search.
 * `--owner` gets Space Admin so they can log in to space.unifesto.app and record.
 *
 *   npx ts-node -T scripts/demo-space.ts --owner=you@unifesto.app   # create (re-run = rebuild)
 *   npx ts-node -T scripts/demo-space.ts --remove                   # delete space + demo users
 *
 * Demo accounts are marked by a `+0999` mobile and a `demo.N@example.com` email
 * (example.com is reserved, so nothing can ever be delivered to them). They do
 * count in platform-wide user totals while they exist; remove after recording.
 */
import 'dotenv/config';
import * as crypto from 'crypto';
import {
  EventStatus,
  EventType,
  GroupPricingMode,
  GroupSeatStatus,
  OrgPlan,
  PaymentStatus,
  Prisma,
  PrismaClient,
  Provider,
  RegistrationStatus,
  RegistrationType,
  RoleCode,
  SpaceStatus,
  TicketKind,
} from '@prisma/client';

const prisma = new PrismaClient();

const SLUG = 'aurora-tech-club-demo';
const MOBILE_PREFIX = '+0999';
const EMAIL_RE = /^demo\.\d+@example\.com$/;

const FIRST = ['Aarav', 'Diya', 'Kabir', 'Meera', 'Rohan', 'Ananya', 'Vihaan', 'Isha', 'Arjun', 'Saanvi', 'Reyansh', 'Kavya', 'Aditya', 'Tara', 'Neel', 'Riya', 'Dev', 'Nisha', 'Ishaan', 'Pooja'];
const LAST = ['Rao', 'Sharma', 'Reddy', 'Iyer', 'Menon', 'Patel', 'Nair', 'Gupta', 'Varma', 'Das', 'Joshi', 'Kulkarni'];

const DAY = 86_400_000;
const at = (days: number, hour = 10) => {
  const d = new Date(Date.now() + days * DAY);
  d.setUTCHours(hour - 5, 30, 0, 0); // IST wall-clock hour
  return d;
};
const hex = (bytes: number) => crypto.randomBytes(bytes).toString('hex');
const arg = (name: string) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];

async function remove() {
  const space = await prisma.space.findUnique({ where: { slug: SLUG }, select: { id: true } });
  if (space) {
    // Events cascade to registrations, tickets, seats and event roles.
    await prisma.event.deleteMany({ where: { spaceId: space.id } });
    await prisma.space.delete({ where: { id: space.id } });
  }
  const demoUsers = await prisma.user.findMany({
    where: {
      mobileNumber: { startsWith: MOBILE_PREFIX },
      identities: { some: { email: { endsWith: '@example.com' } } },
    },
    select: { id: true, identities: { select: { email: true } } },
  });
  // Belt and braces: only accounts whose every identity is a demo email.
  const ids = demoUsers
    .filter((u) => u.identities.every((i) => i.email && EMAIL_RE.test(i.email)))
    .map((u) => u.id);
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  console.log(`Removed ${space ? 'demo space' : 'no space'} and ${ids.length} demo users.`);
}

async function create(ownerEmail: string) {
  const owner = await prisma.userIdentity.findFirst({
    where: { email: ownerEmail.trim().toLowerCase() },
    select: { userId: true },
  });
  if (!owner) throw new Error(`No account with email ${ownerEmail}`);

  await remove(); // re-run = fresh data

  const roles = Object.fromEntries(
    (await prisma.role.findMany({ select: { id: true, code: true } })).map((r) => [r.code, r.id]),
  ) as Record<RoleCode, string>;
  const feePercent = Number(
    (await prisma.platformConfig.findFirst({ select: { processingFeePercent: true } }))
      ?.processingFeePercent ?? 0,
  );

  // 120 demo people: index 0–4 are the team, the rest attend.
  const people: { id: string; name: string; email: string }[] = [];
  for (let i = 0; i < 120; i++) {
    const name = `${FIRST[i % FIRST.length]} ${LAST[(i * 7) % LAST.length]}`;
    const email = `demo.${i + 1}@example.com`;
    const user = await prisma.user.create({
      data: {
        mobileNumber: `${MOBILE_PREFIX}${String(i + 1).padStart(6, '0')}`,
        fullName: name,
        username: `demo_${name.split(' ')[0].toLowerCase()}_${i + 1}`,
        identities: {
          create: { provider: Provider.EMAIL, providerUserId: email, email, isPrimary: true },
        },
      },
      select: { id: true },
    });
    people.push({ id: user.id, name, email });
  }
  const team = people.slice(0, 5);
  const crowd = people.slice(5);

  const space = await prisma.space.create({
    data: {
      name: 'Aurora Tech Club',
      slug: SLUG,
      description:
        'The student tech club behind Aurora Fest, Build Night and weekly workshops. Demo space for Unifesto guides.',
      city: 'Hyderabad',
      state: 'Telangana',
      country: 'India',
      tags: ['tech', 'college', 'hackathon'],
      visibility: 'PRIVATE',
      status: SpaceStatus.ACTIVE,
      submittedAt: at(-60),
      approvedAt: at(-59),
      plan: OrgPlan.PRO,
      planActivatedAt: at(-59),
      createdBy: owner.userId,
      subscription: { create: { plan: OrgPlan.PRO, billingModel: 'FREE', isActive: true } },
    },
  });

  const spaceRoles: Prisma.UserRoleCreateManyInput[] = [
    { userId: owner.userId, roleId: roles.SPACE_ADMIN, spaceId: space.id },
    { userId: owner.userId, roleId: roles.MEMBER, spaceId: space.id },
    ...team.map((t) => ({ userId: t.id, roleId: roles.MEMBER, spaceId: space.id })),
  ];
  await prisma.userRole.createMany({ data: spaceRoles, skipDuplicates: true });

  type TicketSpec = {
    name: string;
    price: number;
    total: number;
    kind?: TicketKind;
    groupSize?: number;
  };
  type EventSpec = {
    title: string;
    slug: string;
    description: string;
    status: EventStatus;
    start: Date;
    end: Date;
    registrationType: RegistrationType;
    tickets: TicketSpec[];
    attendees: number; // registrations to create
    checkInShare: number; // 0..1, only for past/live events
    hackathon?: boolean; // seed Sprint: rounds, scores, rooms, help desk
  };

  const events: EventSpec[] = [
    {
      title: 'Aurora Fest 2026',
      slug: 'aurora-fest-2026-demo',
      description: 'Two days of talks, a startup expo and the night concert.',
      status: EventStatus.COMPLETED,
      start: at(-21, 9),
      end: at(-20, 22),
      registrationType: RegistrationType.TICKETED,
      tickets: [
        { name: 'Early bird', price: 199, total: 40 },
        { name: 'Regular', price: 299, total: 120 },
        { name: 'Squad of 4', price: 999, total: 60, kind: TicketKind.GROUP, groupSize: 4 },
      ],
      attendees: 70,
      checkInShare: 0.86,
    },
    {
      title: 'Build Night: 24h Hackathon',
      slug: 'build-night-24h-hackathon-demo',
      description: '24 hours, teams of 3, mentors on call and prizes for the top three builds.',
      // Live right now (half-way through) so Sprint screens have scores,
      // an active round and open help-desk queries. Re-seed before recording.
      status: EventStatus.ONGOING,
      start: new Date(Date.now() - 12 * 3_600_000),
      end: new Date(Date.now() + 12 * 3_600_000),
      registrationType: RegistrationType.TICKETED,
      tickets: [
        { name: 'Team of 3', price: 450, total: 90, kind: TicketKind.GROUP, groupSize: 3 },
      ],
      attendees: 8,
      checkInShare: 0.75,
      hackathon: true,
    },
    {
      title: 'Figma for beginners',
      slug: 'figma-for-beginners-demo',
      description: 'A hands-on 2-hour workshop. Bring a laptop.',
      status: EventStatus.PUBLISHED,
      start: at(5, 16),
      end: at(5, 18),
      registrationType: RegistrationType.RSVP,
      tickets: [{ name: 'Free pass', price: 0, total: 60, kind: TicketKind.RSVP }],
      attendees: 34,
      checkInShare: 0,
    },
    {
      title: 'Aurora Fest 2027',
      slug: 'aurora-fest-2027-demo',
      description: 'Save the date.',
      status: EventStatus.DRAFT,
      start: at(340, 9),
      end: at(341, 22),
      registrationType: RegistrationType.TICKETED,
      tickets: [],
      attendees: 0,
      checkInShare: 0,
    },
  ];

  let cursor = 0; // rotates through the crowd so people attend several events
  const nextPerson = () => crowd[cursor++ % crowd.length];

  for (const spec of events) {
    const capacity = spec.tickets.reduce((n, t) => n + t.total, 0) || null;
    const event = await prisma.event.create({
      data: {
        title: spec.title,
        slug: spec.slug,
        description: spec.description,
        type: EventType.IN_PERSON,
        registrationType: spec.registrationType,
        startDateTime: spec.start,
        endDateTime: spec.end,
        venueName: 'Main Auditorium',
        city: 'Hyderabad',
        state: 'Telangana',
        capacity,
        isFree: spec.tickets.every((t) => t.price === 0),
        tags: ['tech'],
        category: 'Technology',
        categories: ['Technology'],
        visibility: 'PRIVATE',
        status: spec.status,
        spaceId: space.id,
        createdBy: owner.userId,
      },
    });

    // Team: curator, co-curator, two crew.
    await prisma.userRole.createMany({
      data: [
        { userId: team[0].id, roleId: roles.CURATOR, spaceId: space.id, eventId: event.id },
        { userId: team[1].id, roleId: roles.CO_CURATOR, spaceId: space.id, eventId: event.id },
        { userId: team[2].id, roleId: roles.CREW, spaceId: space.id, eventId: event.id },
        { userId: team[3].id, roleId: roles.CREW, spaceId: space.id, eventId: event.id },
      ],
      skipDuplicates: true,
    });

    const ticketTypes: { spec: TicketSpec; row: { id: string } }[] = [];
    for (const [order, t] of spec.tickets.entries()) {
      ticketTypes.push({
        spec: t,
        row: await prisma.eventTicketType.create({
          data: {
            eventId: event.id,
            name: t.name,
            price: t.price,
            totalQuantity: t.total,
            kind: t.kind ?? TicketKind.INDIVIDUAL,
            groupPricingMode: t.groupSize ? GroupPricingMode.PER_GROUP : null,
            minGroupSize: t.groupSize ?? null,
            maxGroupSize: t.groupSize ?? null,
            order,
          },
        }),
      });
    }

    // Real check-ins always write a per-point record (the check-in page counts
    // those), so seed the default "Entry" point and record against it.
    const entry = await prisma.eventCheckinType.create({
      data: { eventId: event.id, name: 'Entry', order: 0 },
    });

    let seatsTaken = 0;
    const regs: { id: string; lead: (typeof people)[number] }[] = [];
    for (let i = 0; i < spec.attendees; i++) {
      // Weight towards the cheaper/regular tickets; every 6th is a group.
      const tt = ticketTypes[i % 6 === 5 ? ticketTypes.length - 1 : i % Math.max(1, ticketTypes.length - 1)];
      const seats = tt.spec.groupSize ?? 1;
      const lead = nextPerson();
      const members = Array.from({ length: seats - 1 }, nextPerson);
      const paid = tt.spec.price > 0;
      const fee = paid ? Math.round(tt.spec.price * feePercent + 1e-9) / 100 : 0;
      const registeredAt = new Date(
        Math.min(Date.now(), spec.start.getTime()) - (5 + ((i * 13) % 30)) * DAY,
      );
      const checkedIn = spec.checkInShare > 0 && i / spec.attendees < spec.checkInShare;
      const checkedInAt = checkedIn ? new Date(spec.start.getTime() + (i % 90) * 60_000) : null;
      const checkedInBy = checkedIn ? team[2 + (i % 2)].id : null;

      const reg = await prisma.eventRegistration.create({
        data: {
          eventId: event.id,
          userId: lead.id,
          ticketTypeId: tt.row.id,
          groupSize: seats > 1 ? seats : null,
          totalAmount: tt.spec.price + fee,
          razorpayAmount: tt.spec.price + fee,
          processingFee: fee,
          paymentStatus: PaymentStatus.PAID,
          paymentId: paid ? `demo_pay_${hex(8)}` : null,
          orderId: paid ? `demo_order_${hex(8)}` : null,
          paidAt: registeredAt,
          status: checkedIn ? RegistrationStatus.ATTENDED : RegistrationStatus.REGISTERED,
          qrCode: hex(16),
          checkedInAt,
          checkedInBy,
          registeredAt,
          checkinRecords:
            checkedInAt && checkedInBy
              ? { create: { checkinTypeId: entry.id, checkedInAt, checkedInBy } }
              : undefined,
          tickets: {
            create: {
              ticketCode: hex(4).toUpperCase(),
              qrCode: hex(16),
              attendeeName: lead.name,
              attendeeEmail: lead.email,
              checkedInAt,
            },
          },
        },
      });

      if (seats > 1) {
        await prisma.groupSeat.createMany({
          data: [lead, ...members].map((m, idx) => ({
            registrationId: reg.id,
            seatIndex: idx + 1,
            status: GroupSeatStatus.CLAIMED,
            inviteToken: hex(32),
            memberDetails: idx === 0 ? Prisma.JsonNull : { name: m.name, email: m.email },
            claimedByUserId: m.id,
            claimedAt: registeredAt,
          })),
        });
      }

      await prisma.eventTicketType.update({
        where: { id: tt.row.id },
        data: { soldCount: { increment: seats } },
      });
      seatsTaken += seats;
      regs.push({ id: reg.id, lead });
    }
    await prisma.event.update({ where: { id: event.id }, data: { registeredCount: seatsTaken } });
    if (spec.hackathon) await seedHackathon(event.id, regs, team, owner.userId, roles);
    console.log(`  ${spec.title}: ${spec.attendees} registrations, ${seatsTaken} seats`);
  }

  console.log(`Demo space ready: /${SLUG} (owner ${ownerEmail} is Space Admin).`);
}

const TEAM_NAMES = ['Null Pointers', 'Byte Me', 'Ctrl Alt Elite', 'Stack Smashers', 'The Debuggers', 'Pixel Pirates', 'Code Brew', 'Lambda Squad'];

/** Unifesto Sprint data for the live hackathon: everything the curator and
 * judge screens show, mid-event (round 1 scored, round 2 judging). */
async function seedHackathon(
  eventId: string,
  regs: { id: string; lead: { id: string; name: string } }[],
  team: { id: string }[],
  ownerId: string,
  roles: Record<RoleCode, string>,
) {
  const now = Date.now();
  const board = await prisma.leaderboard.create({
    data: {
      eventId,
      mode: 'RUBRIC',
      isHackathon: true,
      enabled: true,
      status: 'LIVE',
      title: 'Build Night leaderboard',
      teamCodePrefix: 'BN',
      teamCodeNext: regs.length + 1,
      psMode: 'TEAM_PICKS',
      venueName: 'Innovation Lab, Block C',
      createdBy: ownerId,
    },
  });

  const rooms = await Promise.all(
    ['Lab 1', 'Lab 2'].map((name) =>
      prisma.hackathonRoom.create({ data: { leaderboardId: board.id, name, capacity: 20 } }),
    ),
  );
  const themes = await Promise.all(
    ['Campus life', 'Fintech for students', 'Open innovation'].map((name) =>
      prisma.hackathonTheme.create({ data: { leaderboardId: board.id, name } }),
    ),
  );
  for (const name of ['Wi-Fi and power', 'Mentor help', 'APIs and credits']) {
    await prisma.hackathonHelpTopic.create({ data: { leaderboardId: board.id, name } });
  }

  // One problem statement per theme; teams pick (and lock) one each.
  const statements = await Promise.all(
    [
      ['PS-01', 'Find a free room on campus', 'Live map of empty classrooms and labs.'],
      ['PS-02', 'Split the hostel mess bill', 'Track shared expenses and settle with UPI.'],
      ['PS-03', 'Your own idea', 'Anything that makes student life better.'],
    ].map(([code, title, description], i) =>
      prisma.hackathonStatement.create({
        data: { leaderboardId: board.id, code, title, description, themeId: themes[i].id, order: i },
      }),
    ),
  );

  const round1 = await prisma.leaderboardRound.create({
    data: { leaderboardId: board.id, name: 'Idea pitch', order: 0, status: 'CLOSED', startAt: new Date(now - 10 * 3_600_000), endAt: new Date(now - 8 * 3_600_000) },
  });
  const round2 = await prisma.leaderboardRound.create({
    data: { leaderboardId: board.id, name: 'Mid-build demo', order: 1, status: 'ACTIVE', startAt: new Date(now - 3_600_000) },
  });
  await prisma.leaderboardRound.create({
    data: { leaderboardId: board.id, name: 'Final demo', order: 2, startAt: new Date(now + 10 * 3_600_000) },
  });

  const criteria = [
    ['innovation', 'Innovation'],
    ['execution', 'Execution'],
    ['impact', 'Impact'],
    ['presentation', 'Presentation'],
  ];
  const metrics = await Promise.all(
    criteria.map(([key, label], i) =>
      prisma.leaderboardMetric.create({
        data: { leaderboardId: board.id, key, label, maxValue: 10, displayOrder: i, isPrimary: i === 0 },
      }),
    ),
  );

  // Judge + mentor from the demo team.
  await prisma.leaderboardPanelist.createMany({
    data: [
      { leaderboardId: board.id, userId: team[4].id, kind: 'JUDGE' },
      { leaderboardId: board.id, userId: team[3].id, kind: 'MENTOR' },
    ],
  });
  await prisma.userRole.createMany({
    data: [{ userId: team[4].id, roleId: roles.JUDGE, eventId }],
    skipDuplicates: true,
  });

  const entrants: { entrant: { id: string }; lead: { id: string; name: string }; total: number }[] = [];
  for (const [i, r] of regs.entries()) {
    // Deterministic, spread-out round-1 scores (out of 10 per criterion).
    const scores = metrics.map((_, m) => 5 + ((i * 3 + m * 2) % 5));
    const total = scores.reduce((a, b) => a + b, 0);
    const entrant = await prisma.leaderboardEntrant.create({
      data: {
        leaderboardId: board.id,
        name: TEAM_NAMES[i % TEAM_NAMES.length],
        registrationId: r.id,
        userId: r.lead.id,
        teamCode: `BN${String(i + 1).padStart(3, '0')}`,
        teamSeq: i + 1,
        teamNameSource: 'LEAD',
        roomId: rooms[i % 2].id,
        themeId: themes[i % 3].id,
        statementId: statements[i % 3].id,
        statementLockedAt: new Date(now - 11 * 3_600_000),
        statementSetBy: r.lead.id,
        totalScore: total,
      },
    });
    await prisma.leaderboardScore.createMany({
      data: metrics.map((metric, m) => ({
        entrantId: entrant.id,
        metricId: metric.id,
        roundId: round1.id,
        judgeUserId: team[4].id,
        value: scores[m],
      })),
    });
    // The judge's submitted marks for round 1.
    await prisma.leaderboardJudgment.create({
      data: {
        entrantId: entrant.id,
        roundId: round1.id,
        panelistUserId: team[4].id,
        kind: 'JUDGE',
        overallReview: 'Clear problem, working prototype. Tighten the demo.',
        submittedAt: new Date(now - 8.5 * 3_600_000),
      },
    });
    entrants.push({ entrant, lead: r.lead, total });
  }

  // Round-1 results: all advance (round 2 is under way, still undecided).
  const ranked = [...entrants].sort((a, b) => b.total - a.total);
  for (const [rank, e] of ranked.entries()) {
    await prisma.leaderboardEntrant.update({ where: { id: e.entrant.id }, data: { rank: rank + 1 } });
    await prisma.leaderboardEntrantRound.createMany({
      data: [
        { entrantId: e.entrant.id, roundId: round1.id, status: 'ADVANCED', roundScore: e.total, rank: rank + 1, decidedBy: ownerId, decidedAt: new Date(now - 8 * 3_600_000) },
        { entrantId: e.entrant.id, roundId: round2.id },
      ],
    });
  }

  // Help desk: one open, one acknowledged, one resolved.
  const queries: [number, string, string, 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED'][] = [
    [0, 'Wi-Fi and power', 'Our table has no power strip, two laptops are about to die.', 'OPEN'],
    [2, 'APIs and credits', 'The maps API key from the kit returns 403.', 'ACKNOWLEDGED'],
    [5, 'Mentor help', 'Can a mentor review our database design before the demo?', 'RESOLVED'],
  ];
  for (const [i, topicName, message, status] of queries) {
    const e = entrants[i % entrants.length];
    await prisma.hackathonHelpQuery.create({
      data: {
        leaderboardId: board.id,
        entrantId: e.entrant.id,
        topicName,
        roomId: rooms[i % 2].id,
        roomName: rooms[i % 2].name,
        message,
        status,
        raisedBy: e.lead.id,
        handledBy: status === 'OPEN' ? null : team[2].id,
        acknowledgedAt: status === 'OPEN' ? null : new Date(now - 20 * 60_000),
        resolvedAt: status === 'RESOLVED' ? new Date(now - 5 * 60_000) : null,
        createdAt: new Date(now - (30 + i * 10) * 60_000),
      },
    });
  }

  await prisma.hackathonAnnouncement.create({
    data: {
      leaderboardId: board.id,
      audience: 'ALL',
      title: 'Mid-build demos start now',
      body: 'Judges are coming to your table in team-code order. Have your demo ready.',
      recipients: entrants.length * 3 + 2, // every member + judge + mentor
      createdBy: ownerId,
    },
  });

  console.log(`  Sprint: ${entrants.length} teams, 3 rounds, judge + mentor, help desk`);
}

async function main() {
  if (process.argv.includes('--remove')) return remove();
  const owner = arg('owner');
  if (!owner) throw new Error('Pass --owner=<email> (or --remove).');
  return create(owner);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
