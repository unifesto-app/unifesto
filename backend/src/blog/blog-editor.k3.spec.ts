import { ConflictException } from '@nestjs/common';
import { BlogService } from './blog.service';
import { CareersService } from '../careers/careers.service';

/** K3: renamed posts keep their old address, schedules publish once, roles with applicants close instead. */
describe('blog and careers editors (K3)', () => {
  const post = (over: Record<string, unknown> = {}) => ({
    id: 'p1', slug: 'old', status: 'PUBLISHED', publishedAt: new Date('2026-10-01'), previousSlugs: [] as string[], ...over,
  });

  it('keeps a public post’s old slug when it is renamed', async () => {
    const prisma: any = {
      blogPost: {
        findUnique: jest.fn(async () => post({ previousSlugs: ['older'] })),
        findFirst: jest.fn(async () => null), // new slug is free
        update: jest.fn(async ({ data }: any) => ({ ...post(), ...data })),
      },
    };
    await new BlogService(prisma, {} as any).update('p1', { slug: 'new' });
    expect(prisma.blogPost.update.mock.calls[0][0].data).toMatchObject({ slug: 'new', previousSlugs: ['older', 'old'] });
  });

  it('a draft that was never public leaves no redirect behind', async () => {
    const prisma: any = {
      blogPost: {
        findUnique: jest.fn(async () => post({ status: 'DRAFT', publishedAt: null })),
        findFirst: jest.fn(async () => null),
        update: jest.fn(async ({ data }: any) => data),
      },
    };
    await new BlogService(prisma, {} as any).update('p1', { slug: 'new' });
    expect(prisma.blogPost.update.mock.calls[0][0].data.previousSlugs).toEqual([]);
  });

  it('finds a post by an old slug', async () => {
    const prisma: any = {
      blogPost: { findFirst: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(post({ slug: 'new' })) },
    };
    await expect(new BlogService(prisma, {} as any).getBySlug('old')).resolves.toMatchObject({ slug: 'new' });
    expect(prisma.blogPost.findFirst.mock.calls[1][0].where).toMatchObject({ previousSlugs: { has: 'old' } });
  });

  it('publishes a due draft once, even when another replica got there first', async () => {
    const due = post({ status: 'DRAFT', publishedAt: null, scheduledFor: new Date('2026-10-01') });
    const prisma: any = {
      blogPost: {
        findMany: jest.fn(async () => [due, { ...due, id: 'p2' }]),
        updateMany: jest.fn().mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 }),
      },
    };
    const now = new Date('2026-10-02');
    await new BlogService(prisma, {} as any).publishScheduled(now);
    expect(prisma.blogPost.updateMany.mock.calls[0][0]).toEqual({
      where: { id: 'p1', status: 'DRAFT', scheduledFor: { lte: now } },
      data: { status: 'PUBLISHED', publishedAt: now, scheduledFor: null },
    });
    expect(prisma.blogPost.updateMany).toHaveBeenCalledTimes(2);
  });

  it('refuses to delete a role that has applications', async () => {
    const prisma: any = {
      career: { count: jest.fn(async () => 1), delete: jest.fn() },
      careerApplication: { count: jest.fn(async () => 2) },
    };
    const careers = new CareersService(prisma, {} as any);
    await expect(careers.remove('c1')).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.career.delete).not.toHaveBeenCalled();

    prisma.careerApplication.count.mockResolvedValueOnce(0);
    await expect(careers.remove('c1')).resolves.toEqual({ deleted: true });
  });
});
