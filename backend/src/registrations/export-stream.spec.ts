import { RegistrationsService } from './registrations.service';
import { buildRegistrationsService } from './registrations.testing';

/**
 * S33: the attendee/transactions CSV export reads registrations a page at a
 * time and streams, instead of loading every row and building one buffer.
 */
describe('RegistrationsService.exportRegistrations (streamed CSV)', () => {
  const reg = (i: number) => ({
    id: `r${String(i).padStart(4, '0')}`,
    userId: `u${i}`,
    user: { fullName: `User ${i}`, username: `user${i}`, mobileNumber: null, identities: [{ email: `u${i}@x.com` }] },
    ticketType: { name: 'GA' },
    status: 'REGISTERED',
    paymentStatus: 'PAID',
    totalAmount: 105,
    processingFee: 5,
    refundedAmount: 0,
    paymentId: `pay_${i}`,
    orderId: null,
    paidAt: null,
    quantity: 1,
    groupSize: null,
    formResponses: {},
    registeredAt: new Date('2026-10-01T00:00:00Z'),
    checkedInAt: null,
  });

  const build = (total: number) => {
    const all = Array.from({ length: total }, (_, i) => reg(i));
    const findMany = jest.fn(async (args: any) => {
      const start = args.cursor ? all.findIndex((r) => r.id === args.cursor.id) + 1 : 0;
      return all.slice(start, start + args.take);
    });
    const prisma: any = {
      event: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'e1',
          slug: 'fest',
          title: 'Fest',
          spaceId: 's1',
          space: { subscription: { id: 'sub' } },
        }),
      },
      userRole: { count: jest.fn().mockResolvedValue(1) },
      eventRegistration: { findMany },
      eventFormField: { findMany: jest.fn().mockResolvedValue([]) },
      groupSeat: { findMany: jest.fn().mockResolvedValue([]) },
      eventGroupMemberCheckin: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const planConfig = { getEffectiveLimits: () => ({ hasBulkExport: true }), resolvePlatformFeePercent: () => 0 };
    const svc = buildRegistrationsService(
      prisma, {} as any, {} as any, {} as any, planConfig as any, {} as any, {} as any,
      {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, { can: async () => true } as any,
    );
    return { svc, findMany, prisma };
  };

  const drain = async (stream: NodeJS.ReadableStream) => {
    let out = '';
    for await (const chunk of stream as any) out += chunk;
    return out;
  };

  it('streams every transaction across pages, keeping the header once', async () => {
    const { svc, findMany } = build(501);
    const res = await svc.exportRegistrations('admin', 'e1', 'csv', 'transactions');
    expect(res.filename).toBe('fest-transactions.csv');
    const lines = (await drain(res.stream)).split('\r\n');
    expect(lines).toHaveLength(502);
    expect(lines[0].replace('﻿', '')).toMatch(/^Name,Email,Ticket Type/);
    expect(lines[501]).toContain('u500@x.com');
    expect(findMany).toHaveBeenCalledTimes(2);
    expect(findMany.mock.calls[0][0].take).toBe(500);
  });

  it('streams attendees, xlsx and pdf too', async () => {
    const { svc } = build(3);
    const csv = await svc.exportRegistrations('admin', 'e1', 'csv', 'attendees');
    expect((await drain(csv.stream)).split('\r\n')).toHaveLength(4);

    const xls = await svc.exportRegistrations('admin', 'e1', 'xlsx', 'attendees');
    const xml = await drain(xls.stream);
    expect(xml).toContain('u2@x.com');
    expect(xml.endsWith('</Table></Worksheet></Workbook>')).toBe(true);
    expect(xls.filename).toBe('fest-attendees.xls');

    const pdf = await svc.exportRegistrations('admin', 'e1', 'pdf', 'attendees');
    expect((await drain(pdf.stream)).startsWith('%PDF-')).toBe(true);
  });

  it('expands a paid group per seat but keeps an unpaid checkout as one lead row (S42)', async () => {
    const { svc, findMany, prisma } = build(0);
    const group = (id: string, paymentStatus: string): any => ({ ...reg(1), id, groupSize: 2, paymentStatus });
    findMany.mockImplementation(async (args: any) =>
      args.cursor ? [] : [group('paid', 'PAID'), group('unpaid', 'PENDING')],
    );
    const seat = (registrationId: string, seatIndex: number) => ({
      registrationId,
      seatIndex,
      status: 'CLAIMED',
      memberDetails: { name: `${registrationId}-m${seatIndex}` },
      claimedBy: null,
    });
    prisma.eventGroupMemberCheckin.findMany.mockResolvedValue([{ registrationId: 'paid', memberIndex: 1 }]);
    const seatFind = prisma.groupSeat.findMany as jest.Mock;
    seatFind.mockImplementation(async ({ where }: any) =>
      ['paid', 'unpaid']
        .filter((id) => where.registrationId.in.includes(id))
        .flatMap((id) => [seat(id, 1), seat(id, 2)]),
    );

    const res = await svc.exportRegistrations('admin', 'e1', 'csv', 'attendees');
    const csv = await drain(res.stream);
    expect(seatFind.mock.calls[0][0].where.registrationId.in).toEqual(['paid']);
    expect(csv).toContain('paid-m2');
    expect(csv).not.toContain('unpaid-m2');
    expect(csv.split('\r\n')).toHaveLength(1 + 2 + 1); // header + 2 seats + 1 lead row
    // G10: only the member who was scanned reads as checked in.
    const row = (name: string) => csv.split('\r\n').find((l) => l.includes(name))!;
    expect(row('paid-m2')).toMatch(/,Yes,/);
    expect(row('paid-m1')).toMatch(/,No,/);
  });

  it('check-in log lists group members instead of the group summary record (B5)', async () => {
    const { svc, prisma } = build(0);
    const user = { fullName: 'Lead', username: 'lead', mobileNumber: null, identities: [{ email: 'lead@x.com' }] };
    const registration = { user, ticketType: { name: 'Team' } };
    const at = new Date('2026-10-02T09:00:00Z');
    const base = { checkinType: { name: 'Entry' }, checkedInAt: at, recordedAt: at, checkedInByUser: { fullName: 'Crew', username: null } };
    const records = [
      { id: 'c1', registrationId: 'grp', checkinTypeId: 'entry', registration, ...base },
      { id: 'c2', registrationId: 'solo', checkinTypeId: 'entry', registration: { ...registration, user: { ...user, fullName: 'Solo' } }, ...base },
    ];
    const members = [
      { id: 'm1', registrationId: 'grp', checkinTypeId: 'entry', memberIndex: 1, registration, ...base,
        groupSeat: { seatIndex: 2, memberDetails: { name: 'Member Two' }, claimedBy: null } },
    ];
    const page = (rows: any[]) => jest.fn(async (args: any) => (args.cursor || !args.take ? (args.take ? [] : rows) : rows));
    prisma.eventCheckinRecord = { findMany: page(records) };
    prisma.eventGroupMemberCheckin = { findMany: page(members) };

    const res = await svc.exportRegistrations('admin', 'e1', 'csv', 'checkins');
    expect(res.filename).toBe('fest-checkins.csv');
    const lines = (await drain(res.stream)).split('\r\n');
    expect(lines).toHaveLength(3); // header + Solo + Member Two; the group's summary record is dropped
    expect(lines[1]).toMatch(/^Solo,lead@x.com,Team,,,Entry,/);
    expect(lines[2]).toMatch(/^Member Two,,Team,Lead,2,Entry,/);
  });
});
