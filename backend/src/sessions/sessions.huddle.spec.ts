import { SessionPlatform, SessionStatus } from '@prisma/client';
import { SessionsService } from './sessions.service';
import { rateCardTerms } from '../subscription/terms.testing';

/** B18: Huddle sessions dead-ends. */
describe('SessionsService (B18)', () => {
  const base: any = {
    id: 's-1',
    spaceId: 'space-1',
    title: 'Talk',
    status: SessionStatus.PUBLISHED,
    platform: SessionPlatform.UNIFESTO_LIVE,
    deletedAt: null,
    recordingEgressId: 'EG_1',
    registeredCount: 3,
    meetingUrl: null,
    platformOther: null,
    durationMinutes: 60,
    startDateTime: new Date(Date.now() + 86_400_000),
  };
  const build = (session = base, plan = { hasSessions: true }) => {
    const prisma: any = {
      session: { findUnique: jest.fn(async () => session), update: jest.fn(async (a: any) => ({ ...session, ...a.data })), updateMany: jest.fn(async () => ({ count: 1 })) },
      space: { findUnique: jest.fn(async () => ({ subscription: { id: 'sub' } })) },
      sessionRegistration: { findMany: jest.fn(async () => []), updateMany: jest.fn(async () => ({ count: 0 })) },
    };
    const livekit = { stopRecording: jest.fn(), endRoom: jest.fn(), roomName: (id: string) => `sess_${id}`, removeParticipant: jest.fn() };
    const svc = new SessionsService(
      prisma, {} as any, {} as any, livekit as any,
      { getEffectiveLimits: () => plan } as any, { can: jest.fn().mockResolvedValue(true) } as any, rateCardTerms(),
    );
    return { svc, prisma, livekit };
  };

  it('ending a recording session keeps the egress id so the file is saved', async () => {
    const { svc, prisma, livekit } = build();
    await svc.completeSession('host', 's-1');
    expect(livekit.stopRecording).toHaveBeenCalledWith('EG_1');
    expect(prisma.session.update.mock.calls[0][0].data).toEqual({ status: SessionStatus.COMPLETED });
  });

  it('refuses to move a session into the past', async () => {
    const { svc } = build();
    await expect(
      svc.updateSession('host', 's-1', { startDateTime: new Date(Date.now() - 3_600_000).toISOString() } as any),
    ).rejects.toThrow(/in the past/);
  });

  it('a space that lost Sessions can still cancel what it sold, but not publish new ones', async () => {
    const { svc } = build(base, { hasSessions: false });
    await expect(svc.cancelSession('host', 's-1')).resolves.toMatchObject({ cancelled: true });
    const { svc: draftSvc } = build({ ...base, status: SessionStatus.DRAFT }, { hasSessions: false });
    await expect(draftSvc.publishSession('host', 's-1')).rejects.toThrow(/not included in this plan/);
  });

  it('removing a co-host takes them out of the live room', async () => {
    const { svc, prisma, livekit } = build();
    prisma.sessionCoHost = { deleteMany: jest.fn() };
    jest.spyOn(svc, 'listCoHosts').mockResolvedValue([] as any);
    await svc.removeCoHost('host', 's-1', 'u-9');
    expect(livekit.removeParticipant).toHaveBeenCalledWith('sess_s-1', 'u-9');
  });
});
