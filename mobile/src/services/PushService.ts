/**
 * Push on expo-notifications (C14): this install's own APNs (iOS) or FCM
 * (Android) token goes to the backend, which sends to it directly (C12).
 * Replaces the OneSignal SDK.
 *
 * The backend's payload is what expo-notifications reads: iOS carries the
 * app's data under `body`, Android is a data-only message the module presents
 * itself on the `default` channel.
 */

import { AppState, Platform } from 'react-native';
import * as Application from 'expo-application';
import * as Notifications from 'expo-notifications';

/** Must match ANDROID_CHANNEL in the backend's push-sender.ts. */
const ANDROID_CHANNEL = 'default';

/** A push as the app uses it: its copy and the data the backend put on it. */
export interface PushPayload {
  id: string;
  title: string | null;
  body: string | null;
  data: Record<string, unknown>;
}

const payloadOf = (n: Notifications.Notification): PushPayload => ({
  id: n.request.identifier,
  title: n.request.content.title,
  body: n.request.content.body,
  data: (n.request.content.data ?? {}) as Record<string, unknown>,
});

/** True = the app showed it itself, so the system banner is held back. */
type ForegroundHandler = (p: PushPayload) => boolean;

class PushService {
  private initialized = false;
  private foreground: ForegroundHandler = () => false;
  private listeners = new Set<() => void>();
  /**
   * This install's native token once known. Asking the OS for it again fires
   * the token listener, so it is asked once per launch and kept here.
   */
  private token: string | null = null;

  /** Once at launch: how a push shows while the app is open, Android's channel, and token changes. */
  initialize(): void {
    if (this.initialized) return;
    this.initialized = true;
    // One app-wide subscription, so a token rotated while no one is listening
    // (signed out) is still kept. getDevicePushTokenAsync fires this event too
    // (iOS and Android), so a repeat of the kept token must not notify:
    // onChange → getDeviceIdentity → token event → onChange looped in 5.0.1.
    Notifications.addPushTokenListener(({ data }) => {
      if (typeof data !== 'string' || !data || data === this.token) return;
      this.token = data;
      this.listeners.forEach((cb) => cb());
    });
    Notifications.setNotificationHandler({
      handleNotification: async (n) => {
        const inApp = this.foreground(payloadOf(n));
        return { shouldShowBanner: !inApp, shouldShowList: !inApp, shouldPlaySound: !inApp, shouldSetBadge: false };
      },
    });
    if (Platform.OS === 'android') {
      Notifications.setNotificationChannelAsync(ANDROID_CHANNEL, {
        name: 'Notifications',
        importance: Notifications.AndroidImportance.HIGH,
      }).catch(() => {});
    }
  }

  async hasPermission(): Promise<boolean> {
    try {
      return (await Notifications.getPermissionsAsync()).granted;
    } catch {
      return false;
    }
  }

  /** False once the OS prompt has been answered (granted or denied). */
  async canRequestPermission(): Promise<boolean> {
    try {
      return (await Notifications.getPermissionsAsync()).status === 'undetermined';
    } catch {
      return false;
    }
  }

  /** Shows the OS prompt (first time only); either answer is reported to the backend. */
  async requestPermission(): Promise<boolean> {
    let granted = false;
    try {
      granted = (await Notifications.requestPermissionsAsync()).granted;
    } catch {
      granted = false;
    }
    this.listeners.forEach((cb) => cb());
    return granted;
  }

  /**
   * What the backend needs to push this install: the native token, whether
   * the OS lets it show notifications, and (iOS) the APNs environment the
   * build talks to. Null off iOS/Android or when the OS gives no token.
   */
  async getDeviceIdentity(): Promise<{ token: string; optedIn: boolean; apnsEnv: string | null } | null> {
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') return null;
    try {
      const [token, optedIn, apnsEnv] = await Promise.all([
        this.token ??
          Notifications.getDevicePushTokenAsync().then(({ data }) =>
            typeof data === 'string' && data ? (this.token = data) : null,
          ),
        this.hasPermission(),
        Platform.OS === 'ios'
          ? Application.getIosPushNotificationServiceEnvironmentAsync().catch(() => null)
          : Promise.resolve(null),
      ]);
      return token ? { token, optedIn, apnsEnv } : null;
    } catch {
      return null;
    }
  }

  /**
   * Something the backend should hear about: a new token, a permission
   * prompt answered, or back in the app (maybe from Settings). Returns an
   * unsubscribe.
   */
  onChange(cb: () => void): () => void {
    this.listeners.add(cb);
    const app = AppState.addEventListener('change', (s) => {
      if (s === 'active') cb();
    });
    return () => {
      this.listeners.delete(cb);
      app.remove();
    };
  }

  /** How a push that lands while the app is open shows (see initialize). */
  setForegroundHandler(handler: ForegroundHandler): void {
    this.foreground = handler;
  }

  /**
   * Taps, including the one that cold-started the app (read once here). Each
   * tap is handled once, and cleared so a reload doesn't replay it.
   */
  addTapListener(handler: (p: PushPayload) => void): () => void {
    const handled = new Set<string>();
    const handle = (r: Notifications.NotificationResponse | null) => {
      if (!r || r.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
      const p = payloadOf(r.notification);
      if (handled.has(p.id)) return;
      handled.add(p.id);
      Notifications.clearLastNotificationResponseAsync().catch(() => {});
      handler(p);
    };
    const sub = Notifications.addNotificationResponseReceivedListener(handle);
    Notifications.getLastNotificationResponseAsync().then(handle, () => {});
    return () => sub.remove();
  }
}

export default new PushService();
