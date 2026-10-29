import { SpacesService } from './spaces.service';
import { CategoriesService } from '../categories/categories.service';

/** K1: spaces near you really filter by city, lists lead with active spaces, and a category rename keeps its events. */
describe('discovery (K1)', () => {
  it('filters the public space list by city and orders it by activity', async () => {
    const prisma: any = {
      space: { findMany: jest.fn(async () => []), count: jest.fn(async () => 0) },
      userRole: { findFirst: jest.fn(async () => null) },
    };
    const svc = new SpacesService(prisma as never, {} as never, {} as never, {} as never, {} as never);
    await svc.getAllSpaces({ city: 'Vijayawada' });
    const q = prisma.space.findMany.mock.calls[0][0];
    expect(q.where.city).toEqual({ equals: 'Vijayawada', mode: 'insensitive' });
    expect(q.orderBy[0]).toEqual({ verifiedAt: { sort: 'desc', nulls: 'last' } });
    expect(q.orderBy[1]).toEqual({ events: { _count: 'desc' } });
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
