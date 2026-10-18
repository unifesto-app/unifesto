import { HelpService } from './help.service';

// D17: drafts never leak to the public; slugs stay unique.
describe('HelpService', () => {
  const build = (taken: string[] = []) => {
    const prisma = {
      helpArticle: {
        findFirst: jest.fn(({ where }) =>
          Promise.resolve(
            where.status || !taken.includes(where.slug) ? null : { id: 'x' },
          ),
        ),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(({ data }) => Promise.resolve(data)),
      },
    };
    return { svc: new HelpService(prisma as never), prisma };
  };

  it('public reads only ever ask for PUBLISHED articles', async () => {
    const { svc, prisma } = build();
    await svc.listPublished();
    expect(prisma.helpArticle.findMany.mock.calls[0][0].where).toEqual({
      status: 'PUBLISHED',
    });
    await expect(svc.getBySlug('nope')).rejects.toThrow('Article not found');
    expect(prisma.helpArticle.findFirst.mock.calls[0][0].where).toEqual({
      slug: 'nope',
      status: 'PUBLISHED',
    });
  });

  it('slugifies the title and suffixes on collision', async () => {
    const { svc } = build(['how-refunds-work', 'how-refunds-work-2']);
    const a = await svc.create(
      { title: 'How refunds work?', body: 'x', category: 'Payments' },
      'admin',
    );
    expect(a.slug).toBe('how-refunds-work-3');
    expect(a.status).toBe('DRAFT');
  });
});
