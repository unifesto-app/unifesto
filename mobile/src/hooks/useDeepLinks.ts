import { useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import OneSignalService from '../services/OneSignalService';
import {
  routeToDeepLink,
  extractPushDeepLink,
  consumePendingDeepLink,
} from '../services/deepLinkRouter';
import { showInAppNotice } from '../components/ui/InAppNotice';
import { AppAlert } from '../components/ui/AppAlert';
import { notificationArrived } from '../lib/notificationBus';

/** Push types shown as an in-app card when the app is open (they also land in the in-app feed). */
const IN_APP_TYPES = new Set(['hackathon', 'competition']);

/**
 * Wires the app's deep-link entry points once, near the navigation root.
 *
 * - OneSignal push taps → route to the notification's deepLink. OneSignal also
 *   fires this click listener for a tap that cold-starts the app, so this covers
 *   both foreground and cold-start push (no separate getInitialURL needed).
 * - After the user authenticates, replay any link that was queued behind the
 *   auth gate (see `deepLinkRouter.handleUnauthenticatedLink`).
 *
 * OS-level universal/scheme links are intentionally NOT handled here — expo-router
 * already routes those through its own Linking listener; adding a second one would
 * double-navigate.
 */
export function useDeepLinks(): void {
  const { isAuthenticated, isLoading } = useAuth();

  // Keep the latest auth state readable inside the once-registered listener.
  const authRef = useRef(isAuthenticated);
  authRef.current = isAuthenticated;

  useEffect(() => {
    OneSignalService.addNotificationClickListener((event: any) => {
      routeToDeepLink(extractPushDeepLink(event), {
        isAuthenticated: authRef.current,
      });
    });
    // Hackathon/competition pushes that land while the app is open show as an
    // in-app card (and refresh the screen on display) instead of the system
    // banner. preventDefault has to run synchronously inside this listener.
    OneSignalService.addNotificationForegroundListener((event: any) => {
      const notification = event?.getNotification?.() ?? event?.notification;
      const data = (notification?.additionalData ?? {}) as { type?: string; eventId?: string; kind?: string };
      // Every push may have added to the inbox, so the bell refetches for all of them.
      notificationArrived({ type: data.type ?? '', eventId: data.eventId });
      if (!data.type || !IN_APP_TYPES.has(data.type)) return;
      const deepLink = extractPushDeepLink({ notification });
      // "You're up" must not be missed: a modal instead of a card that slides away.
      if (data.type === 'hackathon' && data.kind === 'QUEUE_CALLED') {
        event?.preventDefault?.();
        AppAlert.alert(notification?.title || 'You’re up!', notification?.body, [
          { text: 'Later', style: 'cancel' },
          { text: 'Open', onPress: () => routeToDeepLink(deepLink, { isAuthenticated: authRef.current }) },
        ]);
        return;
      }
      const shown = showInAppNotice({
        title: notification?.title || 'Update',
        body: notification?.body,
        onPress: () => routeToDeepLink(deepLink, { isAuthenticated: authRef.current }),
      });
      if (shown) event?.preventDefault?.();
    });
    // OneSignalService owns the underlying listeners for the app's lifetime;
    // they are registered at the root and never need teardown.
  }, []);

  useEffect(() => {
    if (isLoading || !isAuthenticated) return;
    const pending = consumePendingDeepLink();
    if (pending) routeToDeepLink(pending, { isAuthenticated: true });
  }, [isAuthenticated, isLoading]);
}
