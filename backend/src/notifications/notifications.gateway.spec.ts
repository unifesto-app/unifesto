import { NotificationsGateway, userRoom } from './notifications.gateway';

describe('NotificationsGateway (C13)', () => {
  const socket = (auth: Record<string, string> = {}) =>
    ({ handshake: { auth, headers: {} }, data: {}, join: jest.fn(), once: jest.fn(), disconnect: jest.fn() }) as any;

  it('refuses a socket without a valid token', async () => {
    const gw = new NotificationsGateway({ validateAccessToken: jest.fn().mockRejectedValue(new Error('bad')) } as any);
    await expect(gw.authenticate(socket())).rejects.toThrow('no token');
    await expect(gw.authenticate(socket({ token: 'x' }))).rejects.toThrow('bad');
  });

  it("joins the user's own room once signed in", async () => {
    const gw = new NotificationsGateway({ validateAccessToken: jest.fn().mockResolvedValue({ id: 'u1' }) } as any);
    const s = socket({ token: 'no-exp' });
    await gw.authenticate(s);
    gw.handleConnection(s);
    expect(s.join).toHaveBeenCalledWith(userRoom('u1'));
  });

  it('sends one emit to every recipient room', () => {
    const gw = new NotificationsGateway({} as any);
    const emit = jest.fn();
    gw.server = { to: jest.fn().mockReturnValue({ emit }) } as any;
    const n = { type: 'hackathon', eventId: 'e1', title: 'T', body: 'B', deepLink: null, data: null };
    gw.toUsers(['a', 'b'], n);
    expect(gw.server.to).toHaveBeenCalledWith([userRoom('a'), userRoom('b')]);
    expect(emit).toHaveBeenCalledWith('notification:new', n);
  });
});
