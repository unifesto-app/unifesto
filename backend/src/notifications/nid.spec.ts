import { utmColumns } from '../common/utm';
import { nid, withNid } from './nid';
import { UserNotificationsService } from './user-notifications.service';

const PUSH_CAMPAIGN = '3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b';

describe('nid (C19)', () => {
  it('tags links into Unifesto only, keeping their own query', () => {
    expect(withNid('https://unifesto.app/event/fest?utm_source=x', 'e:c1')).toBe(
      'https://unifesto.app/event/fest?utm_source=x&nid=e%3Ac1',
    );
    expect(withNid('https://www.unifesto.app/e', 'e:c1')).toContain('nid=e%3Ac1');
    expect(withNid('https://forms.gle/abc', 'e:c1')).toBe('https://forms.gle/abc');
    expect(withNid('https://unifesto.app.evil.com/x', 'e:c1')).toBe('https://unifesto.app.evil.com/x');
    expect(withNid('not a url', 'e:c1')).toBe('not a url');
  });

  it('a booking keeps a well-formed nid as sent and drops anything else', () => {
    expect(utmColumns({ sourceNid: nid('p', PUSH_CAMPAIGN) }).sourceNid).toBe(`p:${PUSH_CAMPAIGN}`);
    expect(utmColumns({ sourceNid: 'i:organiserAnnouncements' }).sourceNid).toBe('i:organiserAnnouncements');
    expect(utmColumns({ sourceNid: 'x:nope' }).sourceNid).toBeNull();
    expect(utmColumns({ sourceNid: 'p:<script>' }).sourceNid).toBeNull();
    expect(utmColumns({}).sourceNid).toBeNull();
  });

  describe('opened', () => {
    const build = (row: { id: string } | null) => {
      const prisma: any = {
        messageDelivery: { findFirst: jest.fn().mockResolvedValue(row), update: jest.fn().mockResolvedValue({}) },
      };
      return { svc: new UserNotificationsService(prisma), prisma };
    };

    it("marks this user's latest push from that campaign opened", async () => {
      const { svc, prisma } = build({ id: 'd1' });
      expect(await svc.opened('u1', `p:${PUSH_CAMPAIGN}`)).toEqual({ opened: true });
      expect(prisma.messageDelivery.findFirst.mock.calls[0][0].where).toMatchObject({
        userId: 'u1',
        channel: 'PUSH',
        campaignId: PUSH_CAMPAIGN,
      });
      expect(prisma.messageDelivery.update.mock.calls[0][0]).toMatchObject({ where: { id: 'd1' }, data: { status: 'OPENED' } });
    });

    it('matches an automatic push by its kind', async () => {
      const { svc, prisma } = build({ id: 'd2' });
      await svc.opened('u1', 'p:checkout.unpaid');
      expect(prisma.messageDelivery.findFirst.mock.calls[0][0].where).toMatchObject({ kind: 'checkout.unpaid', campaignId: null });
    });

    it('ignores in-app and email nids, and a push it never sent', async () => {
      const inApp = build({ id: 'd3' });
      expect(await inApp.svc.opened('u1', 'i:checkout.unpaid')).toEqual({ opened: false });
      expect(inApp.prisma.messageDelivery.findFirst).not.toHaveBeenCalled();
      const none = build(null);
      expect(await none.svc.opened('u1', 'p:checkout.unpaid')).toEqual({ opened: false });
      expect(none.prisma.messageDelivery.update).not.toHaveBeenCalled();
    });
  });
});
