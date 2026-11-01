import { readFileSync } from 'fs';
import { join } from 'path';
import { EventStatus, PaymentStatus, RegistrationStatus } from '@prisma/client';
import { RegistrationTransfersService } from './registration-transfers.service';
import { AttendeeDetailsService } from './attendee-details.service';

/**
 * Q17 (decision F): an attendee transfers their own free ticket when the
 * organiser turned transfers on for the event. Paid tickets, and events with
 * the switch off, keep today's organiser request path.
 */

const flush = () => new Promise((r) => setImmediate(r));
const later = new Date(Date.now() + 86_400_000);

function build(over: Record<string, unknown> = {}, event: Record<string, unknown> = {}) {
  const reg = {
    id: 'r-1',
    eventId: 'e-1',
    userId: 'me',
    ticketTypeId: 't-1',
    totalAmount: 0,
    paymentStatus: PaymentStatus.PAID,
    status: RegistrationStatus.REGISTERED,
    isWaitlisted: false,
    groupSize: 1,
    checkedInAt: null,
    event: { allowSelfTransfer: true, status: EventStatus.PUBLISHED, endDateTime: later, deletedAt: null, ...event },
    ...over,
  };
  const sent: Array<{ to: string; subject: string; html: string }> = [];
  const db: any = {
    userIdentity: {
      // performTransfer resolves the target; notifyTransfer finds the old holder.
      findFirst: jest.fn(async ({ where }: any) =>
        where.userId === 'me' ? { email: 'me@x.com', user: { fullName: 'Asha', username: null } } : { userId: 'friend' },
      ),
      findMany: jest.fn(async () => [{ userId: 'friend', email: 'friend@x.com' }]),
    },
    eventRegistration: {
      findUnique: jest.fn(async () => reg),
      findFirst: jest.fn(async () => null),
      updateMany: jest.fn(async () => ({ count: 1 })),
      update: jest.fn(async () => ({})),
      findUniqueOrThrow: jest.fn(async () => ({
        id: 'r-1',
        eventId: 'e-1',
        user: { id: 'friend', mobileNumber: '+91999', identities: [{ email: 'friend@x.com' }] },
      })),
    },
    groupSeat: { count: jest.fn(async () => 0), updateMany: jest.fn(async () => ({ count: 0 })), findMany: jest.fn(async () => []) },
    eventTicket: { findMany: jest.fn(async () => []), update: jest.fn(async () => ({})) },
    groupLeadTransfer: { updateMany: jest.fn(async () => ({ count: 0 })) },
    event: { findUnique: jest.fn(async () => ({ title: 'Open Mic' })) },
  };
  db.$transaction = jest.fn(async (fn: any) => fn(db));
  const email = {
    sendRawEmail: jest.fn(async (to: string, subject: string, html: string) => {
      sent.push({ to, subject, html });
      return null;
    }),
  };
  const seats = { resendConfirmation: jest.fn(async () => undefined) };
  const svc = new RegistrationTransfersService(db, {} as any, email as any, seats as any);
  return { svc, db, sent, seats };
}

describe('self-serve ticket transfer (Q17)', () => {
  it('moves a free ticket to the new holder, clears the old answers and mails both', async () => {
    const { svc, db, sent, seats } = build();
    const res = await svc.selfTransfer('me', 'r-1', ' friend@x.com ');

    expect(db.eventRegistration.updateMany).toHaveBeenCalledWith({
      where: { id: 'r-1', userId: 'me' },
      data: { userId: 'friend', qrCode: expect.any(String) },
    });
    expect(db.eventRegistration.update).toHaveBeenCalledWith({
      where: { id: 'r-1' },
      data: { formResponses: expect.anything() },
    });
    // The old holder learns only the email they typed, never the account's phone.
    expect(res).toEqual({ registrationId: 'r-1', eventId: 'e-1', toEmail: 'friend@x.com' });

    await flush();
    expect(seats.resendConfirmation).toHaveBeenCalledWith('r-1', 'friend');
    expect(sent.map((m) => m.to)).toEqual(['me@x.com', 'friend@x.com']);
    expect(sent[0].html).toContain('You sent your ticket');
    expect(sent[1].html).toContain('Asha sent you their ticket');
  });

  it('with the switch off, refuses and moves nothing (organiser path unchanged)', async () => {
    const { svc, db } = build({}, { allowSelfTransfer: false });
    await expect(svc.selfTransfer('me', 'r-1', 'friend@x.com')).rejects.toThrow(/hasn't turned on ticket transfers/);
    expect(db.eventRegistration.updateMany).not.toHaveBeenCalled();
  });

  it('refuses a paid ticket', async () => {
    const { svc, db } = build({ totalAmount: 499 });
    await expect(svc.selfTransfer('me', 'r-1', 'friend@x.com')).rejects.toThrow(/Only free tickets/);
    expect(db.eventRegistration.updateMany).not.toHaveBeenCalled();
  });

  it("refuses someone else's ticket as not found", async () => {
    const { svc } = build({ userId: 'other' });
    await expect(svc.selfTransfer('me', 'r-1', 'friend@x.com')).rejects.toThrow(/Ticket not found/);
  });

  it.each([
    ['a group booking', { groupSize: 3 }, {}, /group screen/],
    ['a checked-in ticket', { checkedInAt: new Date() }, {}, /can't be transferred/],
    ['a waitlisted ticket', { isWaitlisted: true }, {}, /can't be transferred/],
    ['a cancelled ticket', { status: RegistrationStatus.CANCELLED }, {}, /can't be transferred/],
    ['an ended event', {}, { endDateTime: new Date(Date.now() - 1000) }, /over/],
    ['a cancelled event', {}, { status: EventStatus.CANCELLED }, /over/],
  ])('refuses %s', async (_n, over, event, msg) => {
    const { svc, db } = build(over, event);
    await expect(svc.selfTransfer('me', 'r-1', 'friend@x.com')).rejects.toThrow(msg);
    expect(db.eventRegistration.updateMany).not.toHaveBeenCalled();
  });

  it('needs the new holder to have an account', async () => {
    const { svc, db } = build();
    db.userIdentity.findFirst.mockResolvedValue(null);
    db.userIdentity.findMany.mockResolvedValue([]);
    await expect(svc.selfTransfer('me', 'r-1', 'nobody@x.com')).rejects.toThrow(/No Unifesto account/);
  });
});

describe('organiser switch (Q17)', () => {
  it('saves allowSelfTransfer with the other attendee controls, off by default', async () => {
    const event = {
      id: 'e-1',
      slug: 'open-mic',
      status: 'PUBLISHED',
      endDateTime: later,
      allowTeamChanges: false,
      teamChangesUntil: null,
      attendeeEditsEnabled: false,
      attendeeEditsUntil: null,
      allowSelfTransfer: true,
    };
    const prisma: any = { event: { update: jest.fn(async () => event) } };
    const cache: any = { invalidateEventCache: jest.fn(async () => undefined) };
    const svc = new AttendeeDetailsService(prisma, cache);
    const out = await svc.setControls('e-1', { allowSelfTransfer: true });
    expect(prisma.event.update.mock.calls[0][0].data).toEqual({ allowSelfTransfer: true });
    expect(out.allowSelfTransfer).toBe(true);
  });

  it('migration adds the column off by default', () => {
    const sql = readFileSync(
      join(__dirname, '../../prisma/migrations/20261130100000_self_ticket_transfer/migration.sql'),
      'utf8',
    );
    expect(sql).toContain('ADD COLUMN "allow_self_transfer" BOOLEAN NOT NULL DEFAULT false');
  });
});
