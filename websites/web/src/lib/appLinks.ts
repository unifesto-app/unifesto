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

/**
 * `href` for an "Open in app" link. The click handler (openAppOrStore) is the
 * main path, but taps before hydration, long-press "open" and in-app browsers
 * that follow the href directly use this, so on Android it must be the intent
 * URL too. The server render can't know the platform: it starts as the scheme
 * and switches on hydration.
 */
export function useAppHref(scheme: string): string {
  const android = useSyncExternalStore(
    noopSubscribe,
    () => detectMobilePlatform() === 'android',
    () => false,
  );
  return android ? androidIntentUrl(scheme) : scheme;
}

/**
 * Try to open the app via its custom scheme. If the app is installed the page
 * backgrounds (visibility → hidden) and we do nothing further. If it isn't
 * installed the page stays visible, so after a short delay we send the user to
 * the store. On desktop there's no app to open → go straight to the store page.
 *
 * Returns a cleanup function (cancels the pending store redirect + listeners).
 */
export function openAppOrStore(
  scheme: string,
  opts: { delayMs?: number } = {},
): () => void {
  const platform = detectMobilePlatform();

  // Desktop / unknown: no app to open — send them to the download page.
  if (platform === 'unknown') {
    window.location.href = '/download';
    return () => {};
  }

  // Android: a bare custom scheme is often ignored by Chrome and in-app
  // browsers. An intent:// URL is the supported way: Chrome opens the app if
  // it's installed and goes to the fallback (Play Store) itself if not.
  if (platform === 'android') {
    window.location.href = androidIntentUrl(scheme);
    return () => {};
  }

  let appOpened = false;
  const markOpened = () => {
    appOpened = true;
  };
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') markOpened();
  };
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', markOpened);
  window.addEventListener('blur', markOpened);

  // Attempt to open the app.
  window.location.href = scheme;

  const timer = window.setTimeout(() => {
    if (!appOpened && document.visibilityState === 'visible') {
      window.location.href = storeUrlFor(platform);
    }
  }, opts.delayMs ?? 1500);

  const cleanup = () => {
    window.clearTimeout(timer);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pagehide', markOpened);
    window.removeEventListener('blur', markOpened);
  };
  return cleanup;
}
