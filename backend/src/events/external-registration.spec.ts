import { BadRequestException } from '@nestjs/common';
import { EventsService } from './events.service';
import { buildRegistrationsService } from '../registrations/registrations.testing';
import {
  assertNoOutsideLink,
  OUTSIDE_LINK_TICKETS_MESSAGE,
  resolveExternalRegistrationUrl,
} from './external-registration';

describe('resolveExternalRegistrationUrl', () => {
  it('leaves the column alone when not sent and clears it when blank', () => {
    expect(resolveExternalRegistrationUrl(undefined)).toBeUndefined();
    expect(resolveExternalRegistrationUrl('')).toBeNull();
    expect(resolveExternalRegistrationUrl('   ')).toBeNull();
    expect(resolveExternalRegistrationUrl(null)).toBeNull();
  });

  it('keeps a public https link', () => {
    expect(resolveExternalRegistrationUrl(' https://forms.gle/AbC123 ')).toBe('https://forms.gle/AbC123');
    expect(resolveExternalRegistrationUrl('https://unstop.com/hackathons/x?ref=1')).toBe('https://unstop.com/hackathons/x?ref=1');
  });

  it.each([
    ['http://forms.gle/x', 'https://'],
    ['javascript:alert(1)', 'https://'],
    ['forms.gle/x', 'full registration link'],
    ['https://user:pass@forms.gle/x', 'username or password'],
    ['https://localhost/x', 'public website'],
    ['https://localhost./x', 'public website'],
    ['https://intranet./x', 'public website'],
    ['https://printer.local/x', 'public website'],
    ['https://nas.lan/x', 'public website'],
    ['https://intranet/x', 'public website'],
    ['https://127.0.0.1/x', 'public website'],
    ['https://169.254.169.254/latest', 'public website'],
    ['https://10.0.0.5/form', 'public website'],
    [`https://forms.gle/${'a'.repeat(2000)}`, 'too long'],
  ])('refuses %s', (raw, why) => {
    expect(() => resolveExternalRegistrationUrl(raw)).toThrow(why);
  });
});

describe('assertNoOutsideLink', () => {
  it('blocks a Unifesto registration only when the event registers elsewhere', () => {
    expect(() => assertNoOutsideLink({ externalRegistrationUrl: 'https://forms.gle/x' })).toThrow(BadRequestException);
    expect(() => assertNoOutsideLink({ externalRegistrationUrl: null })).not.toThrow();
    expect(() => assertNoOutsideLink({})).not.toThrow();
  });
});

describe('an event has an outside link or active tickets, never both', () => {
  const build = (event: Record<string, unknown>, activeTickets = 0) => {
    const row = { id: 'ev-1', slug: 'fest', spaceId: 'sp-1', status: 'DRAFT', externalRegistrationUrl: null, ...event };
    const prisma: any = {
      event: { findUnique: jest.fn(async () => ({ ...row, space: { subscription: {} }, ticketTypes: [] })), update: jest.fn() },
      eventTicketType: {
        count: jest.fn(async () => activeTickets),
        findUnique: jest.fn(async () => ({ id: 'tt-1', eventId: 'ev-1', isActive: false, kind: 'INDIVIDUAL' })),
        create: jest.fn(),
        update: jest.fn(),
      },
    };
    const authz: any = { can: jest.fn(async () => true) };
    const svc = new EventsService(prisma, {} as any, {} as any, {} as any, {} as any, {} as any, { emit: jest.fn() } as any, authz);
    return { svc, prisma };
  };

  it('refuses a link while tickets are on, and writes nothing', async () => {
    const { svc, prisma } = build({}, 2);
    await expect(svc.updateEvent('curator', 'ev-1', { externalRegistrationUrl: 'https://forms.gle/x' })).rejects.toThrow(
      'Switch off this event’s tickets',
    );
    expect(prisma.event.update).not.toHaveBeenCalled();
  });

  it('refuses a new ticket while the link is set', async () => {
    const { svc, prisma } = build({ externalRegistrationUrl: 'https://forms.gle/x' });
    await expect(svc.createTicketType('curator', 'ev-1', { name: 'Entry', price: 0 } as any)).rejects.toThrow(
      OUTSIDE_LINK_TICKETS_MESSAGE,
    );
    expect(prisma.eventTicketType.create).not.toHaveBeenCalled();
  });

  it('refuses switching a ticket back on while the link is set', async () => {
    const { svc, prisma } = build({ externalRegistrationUrl: 'https://forms.gle/x' });
    await expect(svc.updateTicketType('curator', 'ev-1', 'tt-1', { isActive: true } as any)).rejects.toThrow(
      OUTSIDE_LINK_TICKETS_MESSAGE,
    );
    expect(prisma.eventTicketType.update).not.toHaveBeenCalled();
  });
});

describe('self-registration refuses an event that registers elsewhere', () => {
  // Same harness as age-confirmation.z11.spec.ts: stop right after the gates.
  const order = (externalRegistrationUrl: string | null) => {
    const prisma: any = {
      event: {
        findUnique: jest.fn(async () => ({
          id: 'ev-1',
          spaceId: 'sp-1',
          visibility: 'PUBLIC',
          status: 'DRAFT',
          externalRegistrationUrl,
          ticketTypes: [],
          registrations: [],
          space: { status: 'ACTIVE' },
        })),
      },
      space: { findFirst: jest.fn(async () => ({ status: 'ACTIVE' })) },
      platformConfig: { findUnique: jest.fn(async () => null) },
    };
    const svc = buildRegistrationsService(
      prisma, {} as any, {} as any, {} as any, {} as any, {} as any,
      {} as any, {} as any, { emit: jest.fn() } as any, {} as any, {} as any,
      {} as any, {} as any, { can: async () => true } as any,
    );
    return svc.createPaymentOrder('ev-1', 'buyer', { ticketTypeId: 'tt-1', quantity: 1 } as any);
  };

  it('refuses before anything else when the link is set', async () => {
    await expect(order('https://forms.gle/x')).rejects.toThrow("Registration for this event is on the organiser's site.");
  });

  it('lets an ordinary event through to its next check', async () => {
    await expect(order(null)).rejects.toThrow('Event is not open for registration');
  });
});
