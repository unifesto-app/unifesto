/**
 * OneSignal Service - Centralized wrapper for all OneSignal SDK interactions
 * 
 * This service provides a clean interface for:
 * - SDK initialization
 * - User identity management (login/logout)
 * - Email and SMS subscriptions
 * - User tags management
 * - Notification permissions
 * - Logging configuration
 * 
 * Note: OneSignal requires a development build and will not work in Expo Go
 */

import Constants from 'expo-constants';

// Get OneSignal App ID from environment variables
const ONESIGNAL_APP_ID = Constants.expoConfig?.extra?.EXPO_PUBLIC_ONESIGNAL_APP_ID || 
                         process.env.EXPO_PUBLIC_ONESIGNAL_APP_ID || 
                         '041e596b-0d7e-43f5-87a2-6fe4785ac44c';

// Lazy load OneSignal to prevent crashes in Expo Go
let OneSignal: any = null;
let LogLevel: any = null;

try {
  const onesignalModule = require('react-native-onesignal');
  OneSignal = onesignalModule.OneSignal;
  LogLevel = onesignalModule.LogLevel;
} catch (error) {
  // OneSignal not available in Expo Go
}

class OneSignalService {
  private isInitialized = false;
  private isAvailable = false;
  // Last external id requested via login(). Retained so that a login() call
  // that arrives BEFORE initialize() (consent-gated init can lag the session
  // restore that knows the user id) is not lost — it's replayed in initialize().
  private pendingExternalId: string | null = null;
  private subscriptionListeners = new Set<() => void>();

  constructor() {
    this.isAvailable = OneSignal !== null;
  }

  /**
   * Check if OneSignal is available (not in Expo Go)
   */
  private checkAvailability(): boolean {
    if (!this.isAvailable) {
      return false;
    }
    return true;
  }

  /**
   * Initialize OneSignal SDK
   * Should be called once at app startup
   */
  initialize(): void {
    if (!this.checkAvailability()) return;

    if (this.isInitialized) {
      return;
    }

    try {
      // Set log level for debugging (use LogLevel.None in production)
      if (__DEV__ && LogLevel) {
        OneSignal.Debug.setLogLevel(LogLevel.Verbose);
      }
    } catch {}

    try {
      OneSignal.initialize(ONESIGNAL_APP_ID);
    } catch (error) {
      // Push is dead for this session if this fails, so never swallow it.
      if (__DEV__) console.error('[OneSignalService] initialize failed:', error);
      return;
    }
    this.isInitialized = true;

    try {
      // Disable in-app messages by default (can be enabled later if needed).
      // v5 API is setPaused(); the v4 `paused()` threw here and, before the
      // try blocks were split, left the SDK marked uninitialised: no login(),
      // no subscription observer, no device registration.
      OneSignal.InAppMessages.setPaused(true);
    } catch (error) {
      if (__DEV__) console.warn('[OneSignalService] pausing in-app messages failed:', error);
    }

    try {
      // Replay a login() that arrived before the SDK was ready, so the device
      // gets linked to the user's external_id as soon as OneSignal is up.
      if (this.pendingExternalId) {
        OneSignal.login(this.pendingExternalId);
      }

      // Setup push subscription observer
      this.setupPushSubscriptionObserver();

      // Consent-gated init can land after the session already asked for the
      // device identity (and got null). An existing subscription fires no
      // 'change', so nudge listeners once now that the SDK is up.
      this.subscriptionListeners.forEach((cb) => {
        try { cb(); } catch {}
      });
    } catch (error) {
      if (__DEV__) console.warn('[OneSignalService] post-init setup failed:', error);
    }
  }

  /**
   * Setup push subscription observer
   */
  private setupPushSubscriptionObserver(): void {
    if (!this.checkAvailability()) return;

    try {
      OneSignal.User.pushSubscription.addEventListener('change', () => {
        // Subscription id appears (first registration) or opt-in flips — tell
        // listeners so the device can be (re)reported to the backend.
        this.subscriptionListeners.forEach((cb) => {
          try { cb(); } catch {}
        });
      });
    } catch (error) {
    }
  }

  /**
   * Request notification permission from user
   * @returns Promise<boolean> - true if permission granted
   */
  async requestPermission(): Promise<boolean> {
    if (!this.checkAvailability()) return false;

    try {
      const granted = await OneSignal.Notifications.requestPermission(true);
      return granted;
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if user has granted notification permission
   * @returns Promise<boolean> - true if permission granted
   */
  async hasPermission(): Promise<boolean> {
    if (!this.checkAvailability()) return false;

    try {
      return await OneSignal.Notifications.getPermissionAsync();
    } catch (error) {
      return false;
    }
  }

  /**
   * Login user with external ID
   * Call this after user logs in to your app
   * @param externalId - Your app's user ID
   */
  login(externalId: string): void {
    if (!this.checkAvailability()) return;

    // Remember it regardless — initialize() replays this if the SDK isn't up yet.
    this.pendingExternalId = externalId;

    if (!this.isInitialized) return;

    try {
      OneSignal.login(externalId);
    } catch (error) {
    }
  }

  /**
   * Logout current user
   * Call this when user logs out of your app
   */
  logout(): void {
    if (!this.checkAvailability()) return;

    // Drop any remembered identity so a later initialize() won't re-link it.
    this.pendingExternalId = null;

    try {
      OneSignal.logout();
    } catch (error) {
    }
  }

  /**
   * Add email to current user
   * @param email - User's email address
   */
  setEmail(email: string): void {
    if (!this.checkAvailability()) return;

    try {
      OneSignal.User.addEmail(email);
    } catch (error) {
    }
  }

  /**
   * Remove email from current user
   * @param email - Email address to remove
   */
  removeEmail(email: string): void {
    if (!this.checkAvailability()) return;

    try {
      OneSignal.User.removeEmail(email);
    } catch (error) {
    }
  }

  /**
   * Add SMS number to current user
   * @param smsNumber - User's phone number (E.164 format recommended)
   */
  setSMS(smsNumber: string): void {
    if (!this.checkAvailability()) return;

    try {
      OneSignal.User.addSms(smsNumber);
    } catch (error) {
    }
  }

  /**
   * Remove SMS number from current user
   * @param smsNumber - Phone number to remove
   */
  removeSMS(smsNumber: string): void {
    if (!this.checkAvailability()) return;

    try {
      OneSignal.User.removeSms(smsNumber);
    } catch (error) {
    }
  }

  /**
   * Add tags to current user for segmentation
   * @param tags - Object with key-value pairs
   */
  setTags(tags: Record<string, string>): void {
    if (!this.checkAvailability()) return;

    try {
      OneSignal.User.addTags(tags);
    } catch (error) {
    }
  }

  /**
   * Remove tags from current user
   * @param tagKeys - Array of tag keys to remove
   */
  removeTags(tagKeys: string[]): void {
    if (!this.checkAvailability()) return;

    try {
      OneSignal.User.removeTags(tagKeys);
    } catch (error) {
    }
  }

  /**
   * Everything the backend needs to map this install to the signed-in user:
   * the push subscription id (device id), OneSignal's user id and opt-in state.
   * Returns null until OneSignal has registered the device (id not issued yet).
   */
  async getDeviceIdentity(): Promise<{
    subscriptionId: string;
    oneSignalId: string | null;
    optedIn: boolean;
  } | null> {
    if (!this.checkAvailability() || !this.isInitialized) return null;

    try {
      const subscriptionId = await OneSignal.User.pushSubscription.getIdAsync();
      if (!subscriptionId) return null;
      const [oneSignalId, optedIn] = await Promise.all([
        OneSignal.User.getOnesignalId().catch(() => null),
        OneSignal.User.pushSubscription.getOptedInAsync().catch(() => false),
      ]);
      return { subscriptionId, oneSignalId: oneSignalId || null, optedIn: !!optedIn };
    } catch (error) {
      return null;
    }
  }

  /**
   * Subscribe to push-subscription changes (id issued, opt-in toggled).
   * Returns an unsubscribe function.
   */
  onPushSubscriptionChange(cb: () => void): () => void {
    this.subscriptionListeners.add(cb);
    return () => {
      this.subscriptionListeners.delete(cb);
    };
  }

  /**
   * Opt user in to push notifications
   */
  optInToPush(): void {
    if (!this.checkAvailability()) return;

    try {
      OneSignal.User.pushSubscription.optIn();
    } catch (error) {
    }
  }

  /**
   * Opt user out of push notifications
   */
  optOutOfPush(): void {
    if (!this.checkAvailability()) return;

    try {
      OneSignal.User.pushSubscription.optOut();
    } catch (error) {
    }
  }

  /**
   * Add notification click listener
   * @param handler - Function to call when notification is clicked
   */
  addNotificationClickListener(handler: (event: any) => void): void {
    if (!this.checkAvailability()) return;

    try {
      OneSignal.Notifications.addEventListener('click', handler);
    } catch (error) {
    }
  }

  /**
   * Add notification foreground will display listener
   * @param handler - Function to call when notification is received in foreground
   */
  addNotificationForegroundListener(handler: (event: any) => void): void {
    if (!this.checkAvailability()) return;

    try {
      OneSignal.Notifications.addEventListener('foregroundWillDisplay', handler);
    } catch (error) {
    }
  }

  /**
   * Add permission change listener
   * @param handler - Function to call when permission changes
   */
  addPermissionChangeListener(handler: (granted: boolean) => void): void {
    if (!this.checkAvailability()) return;

    try {
      OneSignal.Notifications.addEventListener('permissionChange', handler);
    } catch (error) {
    }
  }
}

// Export singleton instance
export default new OneSignalService();
