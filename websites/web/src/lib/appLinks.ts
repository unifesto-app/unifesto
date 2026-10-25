/**
 * Deep-link into the Unifesto mobile app, falling back to the app store when
 * the app isn't installed. Shared by the "Open in app" buttons and the signup
 * redirect so the behaviour is consistent everywhere.
 */

import { useSyncExternalStore } from 'react';

export const APP_PACKAGE = 'com.unifesto.app';
export const IOS_APP_ID = '6767165496';
export const APP_STORE_URL = `https://apps.apple.com/in/app/unifesto-discover-events/id${IOS_APP_ID}`;
export const PLAY_STORE_URL = `https://play.google.com/store/apps/details?id=${APP_PACKAGE}`;

export type MobilePlatform = 'ios' | 'android' | 'unknown';

export function detectMobilePlatform(): MobilePlatform {
  if (typeof navigator === 'undefined') return 'unknown';
  const ua =
    navigator.userAgent ||
    navigator.vendor ||
    (window as unknown as { opera?: string }).opera ||
    '';
  if (/iPad|iPhone|iPod/.test(ua) && !(window as unknown as { MSStream?: unknown }).MSStream) {
    return 'ios';
  }
  if (/android/i.test(ua)) return 'android';
  return 'unknown';
}

/** The right store URL for the platform; `/download` for desktop/unknown. */
export function storeUrlFor(platform: MobilePlatform = detectMobilePlatform()): string {
  if (platform === 'ios') return APP_STORE_URL;
  if (platform === 'android') return PLAY_STORE_URL;
  return '/download';
}

/** `unifesto://event/x` → Android intent URL that falls back to the Play Store. */
export function androidIntentUrl(scheme: string): string {
  const [proto, rest] = scheme.split('://');
  return (
    `intent://${rest}#Intent;scheme=${proto};package=${APP_PACKAGE};` +
    `S.browser_fallback_url=${encodeURIComponent(PLAY_STORE_URL)};end`
  );
}

const noopSubscribe = () => () => {};

/** The visitor's phone platform; `unknown` on desktop and during the server render. */
export function useMobilePlatform(): MobilePlatform {
  return useSyncExternalStore(noopSubscribe, detectMobilePlatform, () => 'unknown' as const);
}

/**
 * `href` for an "Open in app" link: where openAppOrStore would go. The click
 * handler is the main path, but taps before hydration, long-press "open" and
 * in-app browsers that follow the href directly use this. The server render
 * can't know the platform: it starts as /download (which forwards phones to
 * their store) and switches on hydration.
 */
export function useAppHref(scheme: string): string {
  const platform = useMobilePlatform();
  return platform === 'android' ? androidIntentUrl(scheme) : storeUrlFor(platform);
}

/**
 * Hand off to the app. Android: an intent URL opens the app, or the Play Store
 * when it isn't installed. iOS: straight to the App Store (it shows "Open"
 * when the app is installed). A custom scheme there makes Safari alert
 * "address is invalid" when the app is missing, and installed users already
 * reach the app through Universal Links and the Smart App Banner. Desktop:
 * /download, carrying the current page so it can point back to it.
 *
 * Returns a cleanup function (kept for callers that run it from an effect).
 */
export function openAppOrStore(scheme: string): () => void {
  const platform = detectMobilePlatform();
  window.location.href =
    platform === 'android'
      ? androidIntentUrl(scheme)
      : platform === 'ios'
        ? APP_STORE_URL
        : `/download?from=${encodeURIComponent(window.location.pathname)}`;
  return () => {};
}
