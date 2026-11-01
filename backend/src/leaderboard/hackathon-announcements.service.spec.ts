import { HackathonAnnouncementsService } from './hackathon-announcements.service';
import { NotificationEvents } from '../notifications/notifications.constants';

/** AI19 on curator announcements: checked after the request, held for staff when flagged. */
describe('HackathonAnnouncementsService delivery', () => {
  const notice = { userIds: ['u1', 'u2'], eventId: 'e1', eventTitle: 'HackHyd', title: 'Prize claim', body: 'Pay ₹500 on UPI to 98xxxx' };
  const build = (clear: boolean | null) => {
    const events = { emit: jest.fn() };
    const check = clear === null ? undefined : { clear: jest.fn().mockResolvedValue(clear) };
    const svc = new HackathonAnnouncementsService({} as any, {} as any, {} as any, events as any, check as any);
    return { svc, events, check };
  };

  it('sends when cleared, holds when flagged, and sends the kept notice on release', async () => {
    const ok = build(true);
    await (ok.svc as any).deliver('a1', 's1', 'org', notice);
    expect(ok.check!.clear).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'HACKATHON', refId: 'a1', spaceId: 's1', senderId: 'org', payload: notice }),
    );
    expect(ok.events.emit).toHaveBeenCalledWith(NotificationEvents.HackathonAnnouncement, notice);

    const held = build(false);
    await (held.svc as any).deliver('a1', 's1', 'org', notice);
    expect(held.events.emit).not.toHaveBeenCalled();
    held.svc.onBroadcastDecided({ kind: 'HACKATHON' as any, refId: 'a1', release: true, payload: notice });
    expect(held.events.emit).toHaveBeenCalledWith(NotificationEvents.HackathonAnnouncement, notice);

    // Blocked: nothing goes out.
    const blocked = build(false);
    blocked.svc.onBroadcastDecided({ kind: 'HACKATHON' as any, refId: 'a1', release: false, payload: notice });
    expect(blocked.events.emit).not.toHaveBeenCalled();
  });
});
