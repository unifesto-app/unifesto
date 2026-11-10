/**
 * The native module fires the token listener every time the token is fetched
 * (expo-notifications' PushTokenModule, iOS and Android). Wired like
 * AuthContext (onChange → read the identity), that used to loop forever.
 */

const mockListeners = new Set<(t: { data: string }) => void>();
const mockToken = { value: 'tok-1' };
// Like the native module: resolve, then emit the same token as an event.
const mockGetToken = jest.fn(async () => {
  setTimeout(() => mockListeners.forEach((l) => l({ data: mockToken.value })), 0);
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

test('reading the identity from a token event does not loop', async () => {
  const seen: (string | undefined)[] = [];
  const sync = jest.fn(async () => {
    seen.push((await PushService.getDeviceIdentity())?.token);
  });
  const off = PushService.onChange(() => void sync());

  await sync();
  await settle();
  expect(mockGetToken).toHaveBeenCalledTimes(1);
  expect(sync).toHaveBeenCalledTimes(1);
  expect(seen).toEqual(['tok-1']);

  // A rotated token still reaches the backend, once, without asking the OS again.
  mockToken.value = 'tok-2';
  mockListeners.forEach((l) => l({ data: 'tok-2' }));
  await settle();
  expect(sync).toHaveBeenCalledTimes(2);
  expect(seen).toEqual(['tok-1', 'tok-2']);
  expect(mockGetToken).toHaveBeenCalledTimes(1);

  off();
});
