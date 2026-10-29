import 'reflect-metadata';
import { NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { LeadsService } from './leads.service';
import { BoothScanDto } from './dto/sponsor.dto';
import { emailInterestLeads } from './interest-fanout';

/** E9: public lead capture takes only what the public can see and never rewrites a lead. */
describe('LeadsService public capture', () => {
  const setup = (over: Record<string, any> = {}) => {
    const prisma: any = {
      event: { findFirst: jest.fn(async () => ({ id: 'ev-1', spaceId: 'sp-1' })) },
      space: { findFirst: jest.fn(async () => ({ id: 'sp-1', name: 'Robotics Club' })) },
      lead: {
        findFirst: jest.fn(async () => null),
        create: jest.fn(async ({ data }: any) => ({ id: 'lead-1', ...data })),
        update: jest.fn(),
      },
      userRole: { findMany: jest.fn(async () => [{ userId: 'admin-1' }, { userId: 'admin-1' }, { userId: 'admin-2' }]) },
      ...over,
    };
    const events = { emit: jest.fn() };
    return { prisma, events, svc: new LeadsService(prisma, {} as any, events as any) };
  };

  it('only takes interest in a live event of a public, live space', async () => {
    const { prisma, svc } = setup();
    prisma.event.findFirst.mockResolvedValueOnce(null);
    await expect(svc.captureEventInterest('ev-1', { email: 'a@b.co' })).rejects.toBeInstanceOf(NotFoundException);
    const where = prisma.event.findFirst.mock.calls[0][0].where;
    expect(where.status).toEqual({ in: ['PUBLISHED', 'ONGOING'] });
    expect(where.space).toEqual({ status: { in: ['APPROVED', 'ACTIVE'] }, visibility: 'PUBLIC' });
    expect(prisma.lead.create).not.toHaveBeenCalled();
  });

  it('a repeat "Notify me" never rewrites the existing lead', async () => {
    const { prisma, svc } = setup();
    prisma.lead.findFirst.mockResolvedValueOnce({ id: 'lead-1' });
    await expect(svc.captureEventInterest('ev-1', { email: 'A@B.co', name: 'Mallory', phone: '1' })).resolves.toEqual({ captured: true });
    expect(prisma.lead.update).not.toHaveBeenCalled();
    expect(prisma.lead.create).not.toHaveBeenCalled();
    expect(prisma.lead.findFirst.mock.calls[0][0].where.email).toEqual({ equals: 'a@b.co', mode: 'insensitive' });
  });

  it('refuses an inquiry to a private or taken-down space', async () => {
    const { prisma, svc } = setup();
    prisma.space.findFirst.mockResolvedValueOnce(null);
    await expect(svc.captureSpaceInquiry('sp-1', { email: 'a@b.co' })).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.space.findFirst.mock.calls[0][0].where).toMatchObject({ visibility: 'PUBLIC', status: { in: ['APPROVED', 'ACTIVE'] } });
  });

  it('each inquiry is a new lead and alerts every Space Admin once', async () => {
    const { prisma, events, svc } = setup();
    await svc.captureSpaceInquiry('sp-1', { email: 'Ana@X.io', message: 'Sponsor?' });
    expect(prisma.lead.findFirst).not.toHaveBeenCalled();
    expect(prisma.lead.create.mock.calls[0][0].data).toMatchObject({ source: 'SPACE_INQUIRY', email: 'ana@x.io' });
    const [name, batch] = events.emit.mock.calls[0];
    expect(name).toBe('notif.notify.batch');
    expect(batch.kind).toBe('space.inquiry');
    expect(batch.items.map((i: any) => i.userId)).toEqual(['admin-1', 'admin-2']);
    expect(batch.items[0].data).toMatchObject({ leadId: 'lead-1', fromEmail: 'ana@x.io', message: 'Sponsor?' });
    expect(prisma.userRole.findMany.mock.calls[0][0].where).toMatchObject({ spaceId: 'sp-1', eventId: null });
  });
});

describe('booth scan consent', () => {
  const errors = (body: object) => validate(plainToInstance(BoothScanDto, body));

  it('refuses a scan the attendee did not agree to', async () => {
    const base = { eventSponsorId: '3f1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f', qrCode: 'QR' };
    expect((await errors(base)).map((e) => e.property)).toEqual(['attendeeConsent']);
    expect((await errors({ ...base, attendeeConsent: false })).length).toBe(1);
    expect(await errors({ ...base, attendeeConsent: true })).toEqual([]);
  });
});

describe('emailInterestLeads', () => {
  it('mails interested people once per moment and skips anyone now registered', async () => {
    const prisma: any = {
      event: {
        findUnique: jest.fn(async () => ({
          id: 'ev-1', slug: 'hack', title: 'Hack Night', type: 'IN_PERSON', timezone: 'Asia/Kolkata',
          startDateTime: new Date('2026-11-20T12:00:00Z'), endDateTime: new Date('2026-11-20T15:00:00Z'),
          venueName: 'Hall A', city: 'Hyderabad',
        })),
      },
      lead: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([
            { id: 'l1', name: 'Ana', email: 'ana@x.io' },
            { id: 'l2', name: null, email: 'Reg@X.io' },
          ])
          .mockResolvedValueOnce([]),
      },
      userIdentity: { findMany: jest.fn(async () => [{ email: 'reg@x.io' }]) },
    };
    const email: any = { sendEventInterest: jest.fn(async () => true) };

    await expect(emailInterestLeads(prisma, email, 'ev-1', 'reminder')).resolves.toBe(1);
    expect(email.sendEventInterest).toHaveBeenCalledTimes(1);
    const [data, delivery] = email.sendEventInterest.mock.calls[0];
    expect(data).toMatchObject({ email: 'ana@x.io', name: 'Ana', eventSlug: 'hack', changes: undefined });
    expect(delivery.dedupKey).toBe('lead.interest:reminder:l1');
    expect(prisma.lead.findMany.mock.calls[0][0].where).toMatchObject({ source: 'EVENT_INTEREST', status: { not: 'ARCHIVED' } });
  });
});
