import { SpaceActivity } from '@prisma/client';
import { activityLevel, SpaceActivityService } from './space-activity';
import { visibleSpacesWhere, PUBLIC_LIVE_SPACE_WHERE } from './space-access';
import { NOT_DORMANT_WHERE } from './space-activity';

const NOW = new Date('2026-11-03T00:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

describe('activityLevel (Q38)', () => {
  const base = { createdAt: daysAgo(400), hasUpcomingPublished: false, everPublished: true };

  it('is Active within 60 days of activity', () => {
    expect(activityLevel({ ...base, lastActivityAt: daysAgo(59) }, NOW)).toBe(SpaceActivity.ACTIVE);
  });
  it('is Quiet from 60 to 180 days', () => {
    expect(activityLevel({ ...base, lastActivityAt: daysAgo(61) }, NOW)).toBe(SpaceActivity.QUIET);
    expect(activityLevel({ ...base, lastActivityAt: daysAgo(179) }, NOW)).toBe(SpaceActivity.QUIET);
  });
  it('is Dormant at 180+ days', () => {
    expect(activityLevel({ ...base, lastActivityAt: daysAgo(181) }, NOW)).toBe(SpaceActivity.DORMANT);
  });
  it('an upcoming published event keeps it Active however old the last activity', () => {
    expect(activityLevel({ ...base, lastActivityAt: daysAgo(300), hasUpcomingPublished: true }, NOW)).toBe(SpaceActivity.ACTIVE);
  });
  it('a space that never published is Active for its first 30 days, then Dormant', () => {
    const never = { lastActivityAt: daysAgo(5), hasUpcomingPublished: false, everPublished: false };
    expect(activityLevel({ ...never, createdAt: daysAgo(10) }, NOW)).toBe(SpaceActivity.ACTIVE);
    expect(activityLevel({ ...never, createdAt: daysAgo(31) }, NOW)).toBe(SpaceActivity.DORMANT);
  });
});

describe('SpaceActivityService.sweep (Q38)', () => {
  const row = (over: object) => ({
    id: 's1',
    name: 'Code Club',
    created_by: 'owner',
    created_at: daysAgo(400),
    last_activity_at: null,
    activity_level: SpaceActivity.ACTIVE,
    quiet_nudged_at: null,
    latest: daysAgo(61),
    upcoming: false,
    ever_published: true,
    ...over,
  });

  const build = (rows: object[]) => {
    const prisma: any = {
      $queryRaw: jest.fn(async () => rows),
      space: {
        update: jest.fn(async () => ({})),
        updateMany: jest.fn(async () => ({ count: 1 })),
      },
      userRole: { findMany: jest.fn(async () => [{ userId: 'admin' }, { userId: 'owner' }]) },
    };
    const events: any = { emit: jest.fn() };
    const svc = new SpaceActivityService(prisma, {} as any, events);
    return { svc, prisma, events };
  };

  it('a space idle 61 days turns Quiet and its owner and admins get one nudge', async () => {
    const { svc, prisma, events } = build([row({})]);
    const out = await svc.sweep(NOW);
    expect(prisma.space.update).toHaveBeenCalledWith({
      where: { id: 's1' },
      data: { activityLevel: SpaceActivity.QUIET, lastActivityAt: daysAgo(61) },
    });
    expect(out).toEqual({ updated: 1, nudged: 1 });
    const batch = events.emit.mock.calls[0][1];
    expect(batch.kind).toBe('space.quiet');
    expect(batch.items.map((i: any) => i.userId).sort()).toEqual(['admin', 'owner']);
  });

  it('does not nudge again in the same Quiet spell', async () => {
    const { svc, events } = build([
      row({ activity_level: SpaceActivity.QUIET, last_activity_at: daysAgo(61), quiet_nudged_at: daysAgo(1) }),
    ]);
    const out = await svc.sweep(NOW);
    expect(out.nudged).toBe(0);
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('nudges again after new activity starts a new Quiet spell', async () => {
    const { svc, events } = build([
      row({ activity_level: SpaceActivity.ACTIVE, latest: daysAgo(70), quiet_nudged_at: daysAgo(200) }),
    ]);
    const out = await svc.sweep(NOW);
    expect(out.nudged).toBe(1);
    expect(events.emit).toHaveBeenCalledTimes(1);
  });

  it('marks a space idle 181 days Dormant without a nudge', async () => {
    const { svc, prisma, events } = build([row({ latest: daysAgo(181) })]);
    await svc.sweep(NOW);
    expect(prisma.space.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ activityLevel: SpaceActivity.DORMANT }) }),
    );
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('never moves lastActivityAt backwards past a fresher publish stamp', async () => {
    const { svc, prisma } = build([row({ last_activity_at: daysAgo(2), latest: daysAgo(90), activity_level: SpaceActivity.ACTIVE })]);
    await svc.sweep(NOW);
    expect(prisma.space.update).not.toHaveBeenCalled();
  });
});

describe('Explore leaves Dormant spaces out (Q38)', () => {
  it('the public listing filter excludes Dormant; members still see their own', () => {
    const listed = { ...PUBLIC_LIVE_SPACE_WHERE, ...NOT_DORMANT_WHERE };
    expect(visibleSpacesWhere(undefined, listed)).toEqual(listed);
    const signedIn = visibleSpacesWhere('u1', listed) as any;
    expect(signedIn.OR[0]).toEqual(listed);
    expect(signedIn.OR[1]).toEqual({ userRoles: { some: { userId: 'u1' } } });
  });
});
