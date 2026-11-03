import { buildRegistrationsService } from './registrations.testing';
import { contactMobile } from './group-invite.util';

/**
 * A35: a curator imports a solo attendee with a mobile. Their new account keeps
 * its `+0…` placeholder, and the typed number is what the attendee list, the
 * attendee export and the WhatsApp group invite use. Runs the REAL import,
 * list, export and invite over one in-memory store whose reads honour
 * `select`, so a reader that forgets to select `attendeeMobile` fails here.
 */

/** What Prisma returns for `select` / `include` (top-level and nested selects). */
function project(value: any, shape: any): any {
  if (!shape?.select || value == null) return value;
  if (Array.isArray(value)) return value.map((v) => project(v, shape));
  return Object.fromEntries(
    Object.entries(shape.select)
      .filter(([, s]) => s)
      .map(([k, s]) => [k, s === true ? value[k] : project(value[k], s)]),
  );
}
const read = (row: any, args: any = {}) =>
  args.select
    ? project(row, args)
    : { ...row, ...Object.fromEntries(Object.entries(args.include ?? {}).map(([k, s]) => [k, project(row[k], s)])) };

function harness() {
  const event = {
    id: 'ev1',
    spaceId: 'sp1',
    slug: 'fest',
    title: 'Fest',
    endDateTime: new Date(Date.now() + 86_400_000),
    whatsappAttendeeGroupUrl: 'https://chat.whatsapp.com/AbCdEfGhIjKlMnOpQrStUv',
    parentEvent: null,
    space: { subscription: { id: 'sub' } },
  };
  const ticketType = {
    id: 'tt1',
    eventId: 'ev1',
    name: 'General',
    kind: 'INDIVIDUAL',
    price: 0,
    currency: 'INR',
    minGroupSize: null,
    maxGroupSize: null,
    totalQuantity: null,
    soldCount: 0,
    groupPricingMode: null,
    whatsappGroupUrl: null,
    formFields: [],
  };
  const users: any[] = [];
  const regs: any[] = [];

  // A registration as the DB would join it.
  const view = (r: any) => {
    const u = users.find((x) => x.id === r.userId);
    return {
      ...r,
      user: { ...u, identities: [{ email: u.email }] },
      ticketType,
      event,
      tickets: [],
      groupSeats: [],
    };
  };

  const prisma: any = {
    event: { findUnique: async (args: any) => read(event, args) },
    space: { findFirst: async () => ({ status: 'ACTIVE' }) },
    eventTicketType: { findFirst: async () => ticketType },
    eventFormField: { findMany: async () => [] },
    userIdentity: {
      findMany: async ({ where }: any) =>
        users
          .filter((u) => u.email === where.email.equals)
          .map((u) => ({ userId: u.id, email: u.email, user: { fullName: u.fullName } })),
    },
    user: {
      create: async ({ data }: any) => {
        const u = {
          id: `u${users.length + 1}`,
          mobileNumber: data.mobileNumber,
          fullName: data.fullName,
          username: null,
          email: data.identities.create.email,
        };
        users.push(u);
        return { id: u.id };
      },
    },
    eventRegistration: {
      findFirst: async () => null,
      create: async ({ data }: any) => {
        const r = {
          id: `r${regs.length + 1}`,
          registeredAt: new Date('2026-11-03T00:00:00Z'),
          status: 'REGISTERED',
          checkedInAt: null,
          whatsappInviteSentAt: null,
          whatsappGroupJoinedAt: null,
          ...data,
        };
        regs.push(r);
        return r;
      },
      findMany: async (args: any) => (args.cursor ? [] : regs.map((r) => read(view(r), args))),
      findUnique: async (args: any) => {
        const r = regs.find((x) => x.id === args.where.id);
        return r ? read(view(r), args) : null;
      },
      count: async () => regs.length,
      updateMany: async ({ where, data }: any) => {
        const r = regs.find((x) => x.id === where.id && x.whatsappInviteSentAt === where.whatsappInviteSentAt);
        if (r) Object.assign(r, data);
        return { count: r ? 1 : 0 };
      },
    },
    eventTicket: { create: async () => ({}) },
    $executeRaw: async () => 1,
    $transaction: async (fn: any) => fn(prisma),
  };

  const sends: string[] = [];
  const whatsapp = {
    sendEventWhatsAppGroupInvite: async (to: string) => {
      sends.push(to);
      return true;
    },
  };
  const groupSeats = { createSeatsForRegistration: async () => undefined };
  const platformConfig = { isWithinPostEventWindow: () => true };
  const planConfig = { getEffectiveLimits: () => ({ hasBulkExport: true }) };
  const authz = { can: async () => true };
  const none = {} as any;
  const svc = buildRegistrationsService(
    prisma, none, whatsapp, none, planConfig, platformConfig, none, none, none, groupSeats,
    none, none, none, authz,
  );
  return { svc, users, regs, sends };
}

const drain = async (stream: NodeJS.ReadableStream) => {
  let out = '';
  for await (const chunk of stream as any) out += chunk;
  return out;
};
// The import sends the WhatsApp invite in the background: let it finish.
const settle = () => new Promise((r) => setTimeout(r, 0));

describe('A35: the mobile a curator types for an imported attendee', () => {
  it('shows in the attendee list, the export and the WhatsApp invite; the account keeps its placeholder', async () => {
    const { svc, users, regs, sends } = harness();

    const result = await svc.importAttendees(
      'ev1',
      'tt1',
      'Name,Email,Mobile\nAsha Rao,asha@example.com,98765 43210\nRavi,ravi@example.com,12ab\n',
      false,
    );
    await settle();

    // Both rows are added; the bad number is a warning, not a failed row.
    expect(result).toMatchObject({ created: 2, errored: 0 });
    expect(result.rows[0].warning).toBeUndefined();
    expect(result.rows[1]).toMatchObject({
      status: 'created',
      warning: 'Mobile "12ab" is not a valid number, so it was left off.',
    });

    // Never the account's mobile: both new accounts keep their placeholder.
    expect(users.map((u) => u.mobileNumber)).toEqual([
      expect.stringMatching(/^\+0\d{9}$/),
      expect.stringMatching(/^\+0\d{9}$/),
    ]);
    // Stored on the registration, normalised like every other number.
    expect(regs.map((r) => r.attendeeMobile)).toEqual(['+919876543210', null]);

    // Attendee list: the typed number, and never the placeholder.
    const list = await svc.getEventRegistrations('curator', 'ev1');
    const mobileOf = (email: string) =>
      list.registrations.find((r: any) => r.user.email === email).user.mobileNumber;
    expect(mobileOf('asha@example.com')).toBe('+919876543210');
    expect(mobileOf('ravi@example.com')).toBeNull();

    // Attendee export: the Mobile column.
    const csv = await drain((await svc.exportRegistrations('curator', 'ev1', 'csv', 'attendees')).stream);
    const asha = csv.split('\r\n').find((l) => l.includes('asha@example.com'))!;
    expect(asha.split(',')[3]).toBe('+919876543210');
    expect(csv).not.toContain('+0');

    // WhatsApp: the invite went to the typed number, and only there.
    expect(sends).toEqual(['+919876543210']);
  });
});

describe('contactMobile', () => {
  it("prefers a real account mobile, and the typed one over a placeholder", () => {
    expect(contactMobile('+919000000000', '+919876543210')).toBe('+919000000000');
    expect(contactMobile('+0123456789', '+919876543210')).toBe('+919876543210');
    expect(contactMobile('deleted-ab12', null)).toBeNull();
    expect(contactMobile(null, '9876543210')).toBe('9876543210');
  });
});
