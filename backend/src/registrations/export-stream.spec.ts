import { RegistrationsService } from './registrations.service';

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
    groupMembers: null,
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
    };
    const planConfig = { getEffectiveLimits: () => ({ hasBulkExport: true }), resolvePlatformFeePercent: () => 0 };
    const svc = new RegistrationsService(
      prisma, {} as any, {} as any, {} as any, planConfig as any, {} as any, {} as any,
      {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, { can: async () => true } as any,
    );
    return { svc, findMany };
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
});
