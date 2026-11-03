import { jest } from '@jest/globals';

// Native modules with no JS side under jest. Screens and the API layer stay real.
jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

/** A native SDK that does nothing: any property path is callable and returns itself. */
function mockNativeSdk(): unknown {
  const sdk: unknown = new Proxy(() => sdk, {
    get: (_, key) => (key === '__esModule' ? true : typeof key === 'symbol' || key === 'then' ? undefined : sdk),
  });
  return sdk;
}
jest.mock('react-native-passkeys', () => mockNativeSdk());
jest.mock('@react-native-firebase/app', () => mockNativeSdk());
jest.mock('@react-native-firebase/crashlytics', () => mockNativeSdk());
jest.mock('react-native-onesignal', () => mockNativeSdk());
jest.mock('expo-widgets', () => mockNativeSdk());
jest.mock('react-native-android-widget', () => mockNativeSdk());
jest.mock('react-native-image-colors', () => ({ getColors: async () => ({}) }));
// Sign-in links the push device; with no OneSignal id it polls for 22 s and holds jest open.
jest.mock('../../src/lib/pushDeviceReport', () => ({ syncPushDevice: async () => {}, unregisterPushDevice: async () => {} }));

// The Google/Apple browser sheet: it needs an app manifest jest doesn't have, and isn't opened here.
jest.mock('expo-auth-session', () => ({
  makeRedirectUri: () => 'unifesto://auth/callback',
  useAuthRequest: () => [null, null, async () => ({ type: 'dismiss' })],
  ResponseType: { Code: 'code' },
}));

// Signed in: the API helpers read the access token from here.
jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>([['unifesto_access_token_v2', 'test-token']]);
  return {
    AFTER_FIRST_UNLOCK: 0,
    getItemAsync: async (key: string) => store.get(key) ?? null,
    setItemAsync: async (key: string, value: string) => void store.set(key, value),
    deleteItemAsync: async (key: string) => void store.delete(key),
  };
});

/** What expo-router hands the screen under test; tests set params and read router calls. */
export const mockNav = {
  params: {} as Record<string, string>,
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), dismiss: jest.fn(), canGoBack: () => true },
};
jest.mock('expo-router', () => ({
  router: mockNav.router,
  useRouter: () => mockNav.router,
  useLocalSearchParams: () => mockNav.params,
  // The screen is focused once, on mount.
  useFocusEffect: (effect: () => void | (() => void)) => require('react').useEffect(effect, [effect]),
  Stack: { Screen: () => null },
}));
jest.mock('expo-router/react-navigation', () => ({
  useHeaderHeight: () => 0,
  useNavigation: () => ({ setOptions: jest.fn(), addListener: () => jest.fn(), goBack: mockNav.router.back }),
}));
