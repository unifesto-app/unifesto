import { EventsService } from './events.service';

/** A31: a cached public event still shows live seat counts. */
describe('cached event payload gets live counts', () => {
  const cached = {
    id: 'ev-1',
    slug: 'fest',
    title: 'Fest',
    registeredCount: 10,
    waitlistCount: 0,
    ticketTypes: [
      { id: 'tt-1', name: 'GA', soldCount: 10, totalQuantity: 100 },
      { id: 'tt-gone', name: 'Old', soldCount: 1, totalQuantity: 5 },
    ],
  };
  const prisma: any = {
    event: {
      findUnique: jest.fn(async () => ({
        registeredCount: 100,
        waitlistCount: 4,
        ticketTypes: [{ id: 'tt-1', soldCount: 100, totalQuantity: 100 }],
      })),
    },
  };
  const svc = new EventsService(prisma, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);

  it('overlays sold, registered and waitlist counts, keeping everything else', async () => {
    const out = await (svc as any).withLiveCounts(cached);
    expect(out.registeredCount).toBe(100);
    expect(out.waitlistCount).toBe(4);
    expect(out.ticketTypes[0]).toEqual({ id: 'tt-1', name: 'GA', soldCount: 100, totalQuantity: 100 });
    expect(out.ticketTypes[1]).toEqual(cached.ticketTypes[1]); // not in the live read: left as cached
    expect(out.title).toBe('Fest');
    expect(cached.ticketTypes[0].soldCount).toBe(10); // the cached object isn't mutated
  });

  it('falls back to the cached payload when the event is gone', async () => {
    prisma.event.findUnique.mockResolvedValueOnce(null);
    expect(await (svc as any).withLiveCounts(cached)).toBe(cached);
  });
});
