import { SpacesService } from './spaces.service';
import { CategoriesService } from '../categories/categories.service';

/** K1: spaces near you really filter by city, lists lead with active spaces, and a category rename keeps its events. */
describe('discovery (K1)', () => {
  it('filters the public space list by city and orders it by activity', async () => {
    const prisma: any = {
      space: { findMany: jest.fn(async () => []), count: jest.fn(async () => 0) },
      userRole: { findFirst: jest.fn(async () => null) },
    };
    const svc = new SpacesService(prisma as never, {} as never, {} as never, {} as never, {} as never, {} as never);
    await svc.getAllSpaces({ city: 'Vijayawada' });
    const q = prisma.space.findMany.mock.calls[0][0];
    expect(q.where.city).toEqual({ equals: 'Vijayawada', mode: 'insensitive' });
    expect(q.orderBy[0]).toEqual({ verifiedAt: { sort: 'desc', nulls: 'last' } });
    expect(q.orderBy[1]).toEqual({ events: { _count: 'desc' } });
  });

  it('gives platform admins the same filtered list (Apex has its own)', async () => {
    const prisma: any = {
      space: { findMany: jest.fn(async () => []), count: jest.fn(async () => 0) },
    };
    const authz = { can: jest.fn(async () => true) };
    const svc = new SpacesService(prisma as never, {} as never, {} as never, {} as never, {} as never, authz as never);
    await svc.getAllSpaces({ viewerId: 'admin' });
    expect(prisma.space.findMany.mock.calls[0][0].where.AND[0].OR).toHaveLength(3);
  });

  it('counts a category tile by the same rule as the feed it opens', async () => {
    const prisma: any = {
      eventCategory: { findMany: jest.fn(async () => [{ id: 'c1', name: 'Tech' }]) },
      $queryRaw: jest.fn(async () => [{ name: 'Tech', count: BigInt(2) }]),
    };
    const [tech] = await new CategoriesService(prisma, {} as never).getAll();
    expect(tech.event_count).toBe(2);
    const sql = prisma.$queryRaw.mock.calls[0][0].join('?');
    expect(sql).toContain(`e."visibility" = 'PUBLIC'`);
    expect(sql).toContain(`e."parent_event_id" IS NULL`);
    expect(sql).toContain(`s."visibility" = 'PUBLIC'`);
  });

  it('carries a category rename over to its events', async () => {
    const prisma: any = {
      eventCategory: {
        findUnique: jest.fn(async () => ({ name: 'Tech' })),
        update: jest.fn(async ({ data }: any) => ({ id: 'c1', ...data })),
      },
      $executeRaw: jest.fn(() => 'raw'),
      $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
    };
    await new CategoriesService(prisma, {} as never).update('c1', { name: 'Technology' });
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    const values = prisma.$executeRaw.mock.calls[0].slice(1);
    expect(values).toEqual(['Tech', 'Technology', 'Tech', 'Technology', 'Tech', 'Tech']);
  });

  it('leaves events alone when the name does not change', async () => {
    const prisma: any = {
      eventCategory: { findUnique: jest.fn(async () => ({ name: 'Tech' })), update: jest.fn(async () => ({})) },
      $executeRaw: jest.fn(),
    };
    await new CategoriesService(prisma, {} as never).update('c1', { name: 'Tech', description: 'x' });
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });
});
