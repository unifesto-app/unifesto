import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { EventFilterDto } from './dto';
import { EventsService } from './events.service';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

describe('GET /events?spaceIds=', () => {
  const dto = (spaceIds: unknown) => plainToInstance(EventFilterDto, { spaceIds });

  it('splits, trims and drops empties', () => {
    expect(dto(` ${A}, ,${B},`).spaceIds).toEqual([A, B]);
    expect(dto(' , ').spaceIds).toBeUndefined();
  });

  it('rejects a non-UUID and more than 20', async () => {
    expect(await validate(dto(`${A},nope`))).not.toEqual([]);
    expect(await validate(dto(Array.from({ length: 21 }, () => A).join(',')))).not.toEqual([]);
    expect(await validate(dto(`${A},${B}`))).toEqual([]);
  });

  it('filters spaceId in (...) and keeps the public rules', async () => {
    const prisma: any = { event: { findMany: jest.fn(async () => []), count: jest.fn(async () => 0) } };
    const svc = new EventsService(prisma, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
    await svc.getEvents({ spaceIds: [A, B], limit: 10 });
    const q = prisma.event.findMany.mock.calls[0][0];
    expect(q.where.spaceId).toEqual({ in: [A, B] });
    expect(q.where.visibility).toBe('PUBLIC');
    expect(q.where.status).toEqual({ in: ['PUBLISHED', 'ONGOING'] });
    expect(q.take).toBe(10);
    expect(q.select.space.select).toMatchObject({ name: true, slug: true });
    expect(q.select).toMatchObject({ registeredCount: true, capacity: true });
  });
});
