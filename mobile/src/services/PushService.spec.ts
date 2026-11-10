/**
 * The native module fires the token listener every time the token is fetched
 * (expo-notifications' PushTokenModule, iOS and Android). Wired like
 * AuthContext (onChange → read the identity), that used to loop forever.
 * The tests share the PushService singleton and run in order.
 */

const mockListeners = new Set<(t: { data: string }) => void>();
const mockToken = { value: 'tok-1' };
const mockEmit = (data: string) => mockListeners.forEach((l) => l({ data }));
// Like the native module: resolve, then emit the same token as an event.
const mockGetToken = jest.fn(async () => {
  setTimeout(() => mockEmit(mockToken.value), 0);
  return { type: 'ios', data: mockToken.value };
});

jest.mock('expo-notifications', () => ({
  getDevicePushTokenAsync: () => mockGetToken(),
  addPushTokenListener: (l: (t: { data: string }) => void) => {
    mockListeners.add(l);
    return { remove: () => mockListeners.delete(l) };
  },
  getPermissionsAsync: async () => ({ granted: true, status: 'granted' }),
  setNotificationHandler: () => {},
}));
jest.mock('expo-application', () => ({ getIosPushNotificationServiceEnvironmentAsync: async () => 'production' }));

import PushService from './PushService';

const settle = async () => {
  for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0));
};

/** AuthContext's wiring: each change re-reads the identity, as syncPushDevice does. */
function subscribe() {
  const seen: (string | undefined)[] = [];
  const sync = jest.fn(async () => {
    seen.push((await PushService.getDeviceIdentity())?.token);
  });
  const off = PushService.onChange(() => void sync());
  return { seen, sync, off };
}

beforeAll(() => PushService.initialize());

test('reading the identity from a token event does not loop', async () => {
  const s = subscribe();
  await s.sync();
  await settle();
  expect(mockGetToken).toHaveBeenCalledTimes(1);
  expect(s.sync).toHaveBeenCalledTimes(1);
  expect(s.seen).toEqual(['tok-1']);

  // The same token again (another fetch, a reconnect) is not a change.
  mockEmit('tok-1');
  await settle();
  expect(s.sync).toHaveBeenCalledTimes(1);
  s.off();
});

test('a token rotated while no one listens is used by the next sync', async () => {
  // Signed out: AuthContext has unsubscribed when the OS rotates the token.
  mockToken.value = 'tok-2';
  mockEmit('tok-2');
  await settle();

  // Signed in again in the same launch: reports the new token, no new OS fetch.
  expect((await PushService.getDeviceIdentity())?.token).toBe('tok-2');
  expect(mockGetToken).toHaveBeenCalledTimes(1);
});

test('every subscriber hears a rotation once', async () => {
  const a = subscribe();
  const b = subscribe();
  mockToken.value = 'tok-3';
  mockEmit('tok-3');
  await settle();
  expect(a.seen).toEqual(['tok-3']);
  expect(b.seen).toEqual(['tok-3']);
  expect(mockGetToken).toHaveBeenCalledTimes(1);
  a.off();
  b.off();
});
