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
 *   npx ts-node scripts/demo-space.ts --owner=you@unifesto.app   # create (re-run = rebuild)
 *   npx ts-node scripts/demo-space.ts --remove                   # delete space + demo users
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
    checkInShare: number; // 0..1, only for past events
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
      status: EventStatus.PUBLISHED,
      start: at(20, 18),
      end: at(21, 18),
      registrationType: RegistrationType.TICKETED,
      tickets: [
        { name: 'Team of 3', price: 450, total: 90, kind: TicketKind.GROUP, groupSize: 3 },
      ],
      attendees: 8,
      checkInShare: 0,
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

    let seatsTaken = 0;
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
          checkedInAt: checkedIn ? new Date(spec.start.getTime() + (i % 90) * 60_000) : null,
          checkedInBy: checkedIn ? team[2 + (i % 2)].id : null,
          registeredAt,
          tickets: {
            create: {
              ticketCode: hex(4).toUpperCase(),
              qrCode: hex(16),
              attendeeName: lead.name,
              attendeeEmail: lead.email,
              checkedInAt: checkedIn ? new Date(spec.start.getTime() + (i % 90) * 60_000) : null,
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
    }
    await prisma.event.update({ where: { id: event.id }, data: { registeredCount: seatsTaken } });
    console.log(`  ${spec.title}: ${spec.attendees} registrations, ${seatsTaken} seats`);
  }

  console.log(`Demo space ready: /${SLUG} (owner ${ownerEmail} is Space Admin).`);
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
