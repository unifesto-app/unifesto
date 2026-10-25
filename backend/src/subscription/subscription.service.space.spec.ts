import { SubscriptionService } from './subscription.service';
import { rateCardTerms } from './terms.testing';

/**
 * getEffectiveSubscriptionForSpace resolves a space's governing subscription
 * from its own space-keyed row. The legacy per-user fallback was removed with
 * the P2.2 contract migration once every space owned a row.
 */
describe('SubscriptionService.getEffectiveSubscriptionForSpace', () => {
  const SPACE = 'space-1';

  const build = (bySpace: any) => {
    const prisma = {
      orgSubscription: {
        findUnique: jest.fn(({ where }: any) =>
          Promise.resolve(where.spaceId ? bySpace : null),
        ),
      },
    };
    const svc = new SubscriptionService(
      prisma as any,
      {} as any,
      {} as any,
      {} as any,
      rateCardTerms(),
    );
    return { svc, prisma };
  };

  it('returns the space-keyed row when present', async () => {
    const { svc } = build({ id: 'own', plan: 'GROWTH' });
    expect(await svc.getEffectiveSubscriptionForSpace(SPACE)).toEqual({
      id: 'own',
      plan: 'GROWTH',
    });
  });

  it('returns null when the space has no row', async () => {
    const { svc } = build(null);
    expect(await svc.getEffectiveSubscriptionForSpace(SPACE)).toBeNull();
  });
});
