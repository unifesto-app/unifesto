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
import { seenLive, useNotificationSocket } from './useNotificationSocket';

/** Push types shown as an in-app card when the app is open (they also land in the in-app feed). */
const IN_APP_TYPES = new Set(['hackathon', 'competition']);

interface Arrived {
  type?: string;
  eventId?: string | null;
  kind?: unknown;
  title?: string | null;
  body?: string | null;
}

/**
 * Show a notification that lands while the app is open, from the live socket
 * (C13) or a foreground push. Every one refreshes the screen on display and
 * the bell; in-app types also show as a card. True when it showed its own
 * card or modal.
 */
function presentInApp(n: Arrived, open: () => void): boolean {
  notificationArrived({ type: n.type ?? '', eventId: n.eventId ?? undefined });
  if (!n.type || !IN_APP_TYPES.has(n.type)) return false;
  // "You're up" must not be missed: a modal instead of a card that slides away.
  if (n.type === 'hackathon' && n.kind === 'QUEUE_CALLED') {
    AppAlert.alert(n.title || 'You’re up!', n.body ?? undefined, [
      { text: 'Later', style: 'cancel' },
      { text: 'Open', onPress: open },
    ]);
    return true;
  }
  return showInAppNotice({ title: n.title || 'Update', body: n.body ?? undefined, onPress: open });
}

/**
 * Wires the app's deep-link entry points once, near the navigation root.
 *
 * - OneSignal push taps → route to the notification's deepLink. OneSignal also
 *   fires this click listener for a tap that cold-starts the app, so this covers
 *   both foreground and cold-start push (no separate getInitialURL needed); a
 *   cold-start tap waits for the session restore before it routes.
 * - Notifications that land while the app is open, live over the socket (C13)
 *   or as a foreground push, show through `presentInApp`, never twice.
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
  const loadingRef = useRef(isLoading);
  loadingRef.current = isLoading;
  // A push tap that cold-started the app lands before the stored session is
  // read; routing it then would treat a signed-in user as signed out and
  // bounce them through /login. Held here until auth settles.
  const coldStartLink = useRef<string | null>(null);
  const openLink = (deepLink: string | null | undefined) => () =>
    routeToDeepLink(deepLink, { isAuthenticated: authRef.current });

  useEffect(() => {
    OneSignalService.addNotificationClickListener((event: any) => {
      const link = extractPushDeepLink(event);
      if (loadingRef.current) {
        coldStartLink.current = link;
        return;
      }
      routeToDeepLink(link, { isAuthenticated: authRef.current });
    });
    // A push that lands while the app is open: a card instead of the system
    // banner for in-app types. preventDefault has to run synchronously inside
    // this listener.
    OneSignalService.addNotificationForegroundListener((event: any) => {
      const notification = event?.getNotification?.() ?? event?.notification;
      const data = (notification?.additionalData ?? {}) as { type?: string; eventId?: string; kind?: string };
      const n = { ...data, title: notification?.title, body: notification?.body, deepLink: extractPushDeepLink({ notification }) };
      // The live socket already showed it (it goes out before the push): no second card.
      if (seenLive(n)) {
        if (n.type && IN_APP_TYPES.has(n.type)) event?.preventDefault?.();
        return;
      }
      if (presentInApp(n, openLink(n.deepLink))) event?.preventDefault?.();
    });
    // OneSignalService owns the underlying listeners for the app's lifetime;
    // they are registered at the root and never need teardown.
  }, []);

  // C13: notifications delivered live while the app is open, push or not.
  useNotificationSocket((n) => {
    presentInApp({ ...(n.data ?? {}), ...n }, openLink(n.deepLink));
  });

  useEffect(() => {
    if (isLoading) return;
    const held = coldStartLink.current;
    coldStartLink.current = null;
    if (held) routeToDeepLink(held, { isAuthenticated });
    if (!isAuthenticated) return;
    const pending = consumePendingDeepLink();
    if (pending) routeToDeepLink(pending, { isAuthenticated: true });
  }, [isAuthenticated, isLoading]);
}
