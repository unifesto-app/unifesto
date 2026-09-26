import { useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import OneSignalService from '../services/OneSignalService';
import {
  routeToDeepLink,
  extractPushDeepLink,
  consumePendingDeepLink,
} from '../services/deepLinkRouter';
import { takeClipResumePath } from '../services/clipHandoff';

/**
 * Wires the app's deep-link entry points once, near the navigation root.
 *
 * - OneSignal push taps → route to the notification's deepLink. OneSignal also
 *   fires this click listener for a tap that cold-starts the app, so this covers
 *   both foreground and cold-start push (no separate getInitialURL needed).
 * - After the user authenticates, replay any link that was queued behind the
 *   auth gate (see `deepLinkRouter.handleUnauthenticatedLink`).
 * - First start after installing from the App Clip → reopen the event the clip
 *   was showing (see `services/clipHandoff`). iOS only; a no-op elsewhere.
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
    // OneSignalService owns the underlying listener for the app's lifetime; it is
    // registered at the root and never needs teardown.
  }, []);

  // Once auth has settled, so the auth gate in routeToDeepLink sees real state.
  const clipChecked = useRef(false);
  useEffect(() => {
    if (isLoading || clipChecked.current) return;
    clipChecked.current = true;
    const path = takeClipResumePath();
    if (path) routeToDeepLink(path, { isAuthenticated: authRef.current });
  }, [isLoading]);

  useEffect(() => {
    if (isLoading || !isAuthenticated) return;
    const pending = consumePendingDeepLink();
    if (pending) routeToDeepLink(pending, { isAuthenticated: true });
  }, [isAuthenticated, isLoading]);
}
