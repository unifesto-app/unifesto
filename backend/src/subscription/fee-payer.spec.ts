import { TermsService } from './terms.service';

/** Who pays the processing fee is set per space in Apex and written to every event (12 Nov 2026). */
describe('space fee payer', () => {
  const build = () => {
    const prisma: any = {
      space: {
        update: jest.fn((args) => ({ op: 'space', args })),
        findUnique: jest.fn(async () => ({ absorbProcessingFee: true })),
      },
      event: {
        updateMany: jest.fn((args) => ({ op: 'events', args })),
        findMany: jest.fn(async () => [{ slug: 'a' }, { slug: 'b' }]),
      },
      $transaction: jest.fn(async (ops: any[]) => [ops[0], { count: 3 }]),
      deal: { findMany: jest.fn(async () => []) },
      orgSubscription: { findUnique: jest.fn(async () => null) },
    };
    const planConfig: any = { getLimits: () => ({ platformFeePercent: 3 }), resolvePlatformFeePercent: () => 0 };
    const platformConfig: any = { getProcessingFeePercent: () => 4, getProcessingFeeCapPerTicket: () => 99 };
    const cache: any = { invalidateEventCache: jest.fn(async () => {}) };
    return { prisma, cache, svc: new TermsService(prisma, planConfig, platformConfig, cache) };
  };

  it('sets the space and every one of its events in one transaction, then clears their cached details', async () => {
    const { prisma, cache, svc } = build();
    expect(await svc.setFeePayer('sp', true)).toEqual({ included: true, events: 3 });
    // Both writes are handed to the one transaction, not run on their own.
    expect(prisma.$transaction).toHaveBeenCalledWith([
      { op: 'space', args: { where: { id: 'sp' }, data: { absorbProcessingFee: true } } },
      { op: 'events', args: { where: { spaceId: 'sp' }, data: { absorbProcessingFee: true } } },
    ]);
    // The app prices from the cached event, so a stale flag would show the wrong total.
    expect(cache.invalidateEventCache.mock.calls).toEqual([['a'], ['b']]);
  });

  it('organisers see the fee they pay and who pays it', async () => {
    const { svc } = build();
    expect(await svc.feeSummary('sp')).toEqual({ percent: 4, capPerTicket: 99, organiserPercent: 0, included: true });
  });
});
