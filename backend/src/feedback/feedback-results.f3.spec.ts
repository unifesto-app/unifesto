import { FeedbackService } from './feedback.service';
import { publicRating } from './public-rating';

/** F3: results maths and the public rating threshold. */
describe('feedback results (F3)', () => {
  const responses = [
    { rating: 5, nps: 10, comment: 'Loved it', answers: { q1: 'Keynote', q2: true }, createdAt: new Date() },
    { rating: 4, nps: 9, comment: null, answers: { q1: 'Workshops', q2: true }, createdAt: new Date() },
    { rating: 3, nps: 7, comment: null, answers: { q1: 'Keynote' }, createdAt: new Date() },
    { rating: 2, nps: 3, comment: 'Too long', answers: { q2: false }, createdAt: new Date() },
    { rating: 4, nps: null, comment: null, answers: null, createdAt: new Date() },
  ];
  const prisma: any = {
    event: {
      findUnique: jest.fn(async () => ({ id: 'ev-1', title: 'Fest', feedbackPublic: true, deletedAt: null })),
    },
    eventFeedbackQuestion: {
      findMany: jest.fn(async () => [
        { id: 'q1', label: 'Best part', type: 'TEXT', options: [] },
        { id: 'q2', label: 'Come again?', type: 'YES_NO', options: [] },
      ]),
    },
    eventFeedbackResponse: {
      findMany: jest.fn(async () => responses),
      aggregate: jest.fn(async () => ({ _avg: { rating: 3.6 }, _count: responses.length })),
    },
  };
  const svc = new FeedbackService(prisma, {} as any, {} as any);

  it('averages, spreads and scores NPS over those who answered it', async () => {
    const r = await svc.results('ev-1');
    expect(r.count).toBe(5);
    expect(r.averageRating).toBe(3.6);
    expect(r.distribution.map((d) => d.count)).toEqual([0, 1, 1, 2, 1]);
    // 2 promoters (10, 9), 1 passive (7), 1 detractor (3) of 4 answered: (2 - 1) / 4 = 25.
    expect(r.nps).toEqual({ score: 25, answered: 4, promoters: 2, passives: 1, detractors: 1 });
    expect(r.questions[0]).toMatchObject({ label: 'Best part', answered: 3, texts: ['Keynote', 'Workshops', 'Keynote'] });
    expect(r.questions[1]).toMatchObject({ label: 'Come again?', options: [{ option: 'Yes', count: 2 }, { option: 'No', count: 1 }] });
    expect(r.comments.map((c) => c.comment)).toEqual(['Loved it', 'Too long']);
  });

  it('shows a public rating only when opted in and 5+ have rated', async () => {
    expect(await publicRating(prisma, { id: 'ev-1', feedbackPublic: true })).toEqual({ average: 3.6, count: 5 });
    expect(await publicRating(prisma, { id: 'ev-1', feedbackPublic: false })).toBeNull();
    prisma.eventFeedbackResponse.aggregate.mockResolvedValueOnce({ _avg: { rating: 5 }, _count: 4 });
    expect(await publicRating(prisma, { id: 'ev-1', feedbackPublic: true })).toBeNull();
  });
});
