import { BadRequestException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PUBLIC_LIVE_SPACE_WHERE } from './space-access';
import { SetSpaceFeaturedDto } from './dto/set-space-featured.dto';
import { SpacesController } from './spaces.controller';
import { SpacesService } from './spaces.service';

describe('featured space', () => {
  const prisma: any = {
    space: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(async ({ data }) => ({ id: 's1', featuredAt: data.featuredAt })),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
    $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  const svc: any = Object.create(SpacesService.prototype);
  svc.prisma = prisma;

  it('picks the latest featured space that is active and public', async () => {
    prisma.space.findFirst.mockResolvedValueOnce({ id: 's1' });
    svc.getSpaceById = jest.fn(async () => ({ id: 's1', slug: 'club' }));
    expect(await svc.getFeaturedSpace()).toEqual({ space: { id: 's1', slug: 'club' } });
    expect(prisma.space.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { featuredAt: { not: null }, ...PUBLIC_LIVE_SPACE_WHERE },
        orderBy: { featuredAt: 'desc' },
      }),
    );
    expect(svc.getSpaceById).toHaveBeenCalledWith('s1');
  });

  it('returns null when nothing qualifies', async () => {
    prisma.space.findFirst.mockResolvedValueOnce(null);
    expect(await svc.getFeaturedSpace()).toEqual({ space: null });
  });

  it('featuring clears every other space in one transaction, then sets this one', async () => {
    prisma.space.findUnique.mockResolvedValue({ id: 's1', status: 'ACTIVE', visibility: 'PUBLIC' });
    expect((await svc.setSpaceFeatured('s1', true)).featuredAt).toBeInstanceOf(Date);
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(prisma.space.updateMany).toHaveBeenCalledWith({
      where: { id: { not: 's1' }, featuredAt: { not: null } },
      data: { featuredAt: null },
    });
  });

  it('rejects featuring a private or not-live space, but un-featuring always works', async () => {
    prisma.space.updateMany.mockClear();
    prisma.space.findUnique.mockResolvedValue({ id: 's1', status: 'ACTIVE', visibility: 'PRIVATE' });
    await expect(svc.setSpaceFeatured('s1', true)).rejects.toBeInstanceOf(BadRequestException);
    prisma.space.findUnique.mockResolvedValue({ id: 's1', status: 'SUSPENDED', visibility: 'PUBLIC' });
    await expect(svc.setSpaceFeatured('s1', true)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.space.updateMany).not.toHaveBeenCalled();
    expect((await svc.setSpaceFeatured('s1', false)).featuredAt).toBeNull();
  });

  it('404s on an unknown space', async () => {
    prisma.space.findUnique.mockResolvedValueOnce(null);
    await expect(svc.setSpaceFeatured('nope', true)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('the DTO needs a boolean', async () => {
    expect(await validate(plainToInstance(SetSpaceFeaturedDto, { featured: true }))).toEqual([]);
    expect(await validate(plainToInstance(SetSpaceFeaturedDto, { featured: 'yes' }))).not.toEqual([]);
  });

  it('GET /spaces/featured is declared before GET /spaces/:id', () => {
    const order = Object.getOwnPropertyNames(SpacesController.prototype);
    expect(order.indexOf('getFeaturedSpace')).toBeLessThan(order.indexOf('getSpaceById'));
  });
});
