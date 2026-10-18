import { Prisma } from '@prisma/client';
import { RecurrenceService } from './recurrence.service';

const DAY = 86_400_000;

function setup(opts: { createFails?: (n: number) => unknown } = {}) {
  const start = new Date(Date.now() + DAY);
  const parent = {
    id: 'p1',
    isRecurring: true,
    status: 'PUBLISHED',
    recurringRule: 'FREQ=DAILY;COUNT=3',
    startDateTime: start,
    endDateTime: new Date(start.getTime() + 3_600_000),
    ticketTypes: [],
  };
  let calls = 0;
  const prisma = {
    event: {
      findUnique: jest.fn().mockResolvedValue(parent),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
      create: jest.fn(async () => {
        calls += 1;
        const err = opts.createFails?.(calls);
        if (err) throw err;
        return { id: `occ${calls}` };
      }),
    },
  };
  const redis = { runExclusive: jest.fn() };
  const svc = new RecurrenceService(prisma as any, redis as any);
  jest.spyOn(svc, 'syncSetup').mockResolvedValue(0);
  return { svc, prisma, redis };
}

describe('RecurrenceService (S22)', () => {
  it('skips a slot another replica created first (unique violation) and keeps going', async () => {
    const dup = new Prisma.PrismaClientKnownRequestError('dup', {
      code: 'P2002',
      clientVersion: 'test',
    });
    const { svc, prisma } = setup({ createFails: (n) => (n === 1 ? dup : null) });
    jest
      .spyOn(svc as any, 'occurrenceDataFromParent')
      .mockReturnValue({});
    const created = await svc.generateOccurrences('p1');
    expect(prisma.event.create).toHaveBeenCalledTimes(3);
    expect(created).toBe(2);
    expect(svc.syncSetup).toHaveBeenCalledWith('p1', expect.objectContaining({ onlyIds: ['occ2', 'occ3'] }));
  });

  it('rethrows any other create error', async () => {
    const { svc } = setup({ createFails: () => new Error('db down') });
    jest
      .spyOn(svc as any, 'occurrenceDataFromParent')
      .mockReturnValue({});
    await expect(svc.generateOccurrences('p1')).rejects.toThrow('db down');
  });

  it('runs the daily reconcile only on the replica that wins the lock', async () => {
    const { svc, redis } = setup();
    const reconcile = jest
      .spyOn(svc, 'reconcileAllSeries')
      .mockResolvedValue(undefined);

    redis.runExclusive.mockResolvedValueOnce(false);
    await svc.dailyReconcile();
    expect(reconcile).not.toHaveBeenCalled();

    redis.runExclusive.mockImplementationOnce(
      async (_k: string, _t: number, task: () => Promise<void>) => {
        await task();
        return true;
      },
    );
    await svc.dailyReconcile();
    expect(reconcile).toHaveBeenCalledTimes(1);
    expect(redis.runExclusive.mock.calls[0][0]).toMatch(
      /^cron:recurrenceReconcile:\d{4}-\d{2}-\d{2}$/,
    );
  });

  it('mirrors setup into an occurrence, remapping ids and shifting dates (B17)', async () => {
    const start = new Date('2026-12-01T10:00:00Z');
    const week = 7 * DAY;
    const ticket = (id: string, extra = {}) => ({
      id, name: id, description: null, price: new Prisma.Decimal(100), currency: 'INR', totalQuantity: 50,
      kind: 'INDIVIDUAL', groupPricingMode: null, minGroupSize: null, maxGroupSize: null,
      saleStartsAt: null, saleEndsAt: null, perUserLimit: 1, waitlistEnabled: false, waitlistOfferTtlHours: 24,
      isVisible: true, isActive: true, order: 0, whatsappGroupUrl: null, blocks: [], ...extra,
    });
    const parent = {
      id: 'p1', isRecurring: true, startDateTime: start,
      ticketTypes: [
        ticket('vip', { saleEndsAt: new Date(start.getTime() - DAY), blocks: [{ blockedId: 'ga' }] }),
        ticket('ga'),
      ],
      formFields: [
        { id: 'f1', ticketTypeId: null, label: 'Veg?', type: 'SELECT', options: ['Yes', 'No'], isRequired: true, order: 0, perGroup: false, helpText: null, config: null, showIf: null },
        { id: 'f2', ticketTypeId: 'vip', label: 'Meal', type: 'TEXT', options: [], isRequired: false, order: 1, perGroup: false, helpText: null, config: null, showIf: { fieldId: 'f1', anyOf: ['Yes'] } },
      ],
      agenda: [{ id: 'a1', eventId: 'p1', title: 'Talk', description: null, speakerName: null, order: 0, startTime: start, endTime: new Date(start.getTime() + 3_600_000), createdAt: start }],
      speakers: [], prizes: [], contacts: [],
      faqs: [{ id: 'q1', eventId: 'p1', question: 'Parking?', answer: 'Yes', order: 0, createdAt: start }],
      userRoles: [{ id: 'r1', userId: 'u1', roleId: 'crew', spaceId: 's1', eventId: 'p1', assignedBy: 'u0', createdAt: start }],
    };
    const occStart = new Date(start.getTime() + week);
    const tx: any = {};
    for (const m of ['eventTicketType', 'ticketTypeBlock', 'eventFormField', 'eventAgenda', 'eventSpeaker', 'eventPrize', 'eventContact', 'eventFaq', 'userRole']) {
      tx[m] = { deleteMany: jest.fn(), createMany: jest.fn(), updateMany: jest.fn(), update: jest.fn(), findMany: jest.fn().mockResolvedValue([]) };
    }
    const prisma: any = {
      event: {
        findUnique: jest.fn().mockResolvedValue(parent),
        findMany: jest.fn().mockResolvedValue([{ id: 'o1', startDateTime: occStart }]),
      },
      $transaction: jest.fn((fn: (t: unknown) => unknown) => fn(tx)),
    };
    const svc = new RecurrenceService(prisma, {} as any);
    await expect(svc.syncSetup('p1', { now: start })).resolves.toBe(1);

    // Only untouched occurrences: future, attached, nobody registered.
    expect(prisma.event.findMany.mock.calls[0][0].where).toMatchObject({ seriesDetached: false, registrations: { none: {} } });

    const tickets = tx.eventTicketType.createMany.mock.calls[0][0].data;
    const vip = tickets.find((t: any) => t.sourceTicketTypeId === 'vip');
    const ga = tickets.find((t: any) => t.sourceTicketTypeId === 'ga');
    expect(vip).toMatchObject({ eventId: 'o1', soldCount: 0 });
    expect(vip.saleEndsAt.getTime()).toBe(occStart.getTime() - DAY);
    expect(tx.ticketTypeBlock.createMany.mock.calls[0][0].data).toEqual([{ blockerId: vip.id, blockedId: ga.id }]);

    const [f1, f2] = tx.eventFormField.createMany.mock.calls[0][0].data;
    expect(f1.id).not.toBe('f1');
    expect(f2).toMatchObject({ eventId: 'o1', ticketTypeId: vip.id, showIf: { fieldId: f1.id, anyOf: ['Yes'] } });

    expect(tx.eventAgenda.createMany.mock.calls[0][0].data[0].startTime.getTime()).toBe(occStart.getTime());
    expect(tx.eventFaq.createMany.mock.calls[0][0].data).toEqual([{ question: 'Parking?', answer: 'Yes', order: 0, eventId: 'o1' }]);
    expect(tx.userRole.createMany.mock.calls[0][0].data).toEqual([{ userId: 'u1', roleId: 'crew', spaceId: 's1', assignedBy: 'u0', eventId: 'o1' }]);
  });
});
