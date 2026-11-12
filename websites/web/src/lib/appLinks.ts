/**
 * Deep-link into the Unifesto mobile app, falling back to the app store when
 * the app isn't installed. Shared by the "Open in app" buttons and the signup
 * redirect so the behaviour is consistent everywhere.
 */

import { useSyncExternalStore, type MouseEvent } from 'react';

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

// Paths public/.well-known/apple-app-site-association hands to the app.
const IOS_APP_PATHS = /^(?:event|space|claim|qr)\//;

/**
 * `unifesto://event/x` → `https://unifesto.app/event/x?app=1`, a Universal
 * Link. Safari opens the app for one only when it points at another host than
 * the page, and the site lives on www, so the link uses the bare host. Without
 * the app, the bare host 308s back to www with the query kept, and proxy.ts
 * turns `app=1` into the App Store. Paths the AASA doesn't list go straight to
 * the store.
 */
export function iosAppUrl(scheme: string): string {
  const rest = scheme.split('://')[1] ?? '';
  if (!IOS_APP_PATHS.test(rest)) return APP_STORE_URL;
  return `https://unifesto.app/${rest}${rest.includes('?') ? '&' : '?'}app=1`;
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
  return platform === 'android' ? androidIntentUrl(scheme) : platform === 'ios' ? iosAppUrl(scheme) : storeUrlFor(platform);
}

/**
 * Hand off to the app. Android: an intent URL opens the app, or the Play Store
 * when it isn't installed. iOS: a Universal Link on the bare host (iosAppUrl),
 * which falls back to the App Store. Not the custom scheme: Safari alerts
 * "address is invalid" for it when the app is missing. Desktop: /download,
 * carrying the current page so it can point back to it.
 *
 * Pass the click event from an <a>: iOS opens an app only for a real tap on a
 * link, so there the link follows its own (refreshed) href instead of a script
 * navigation.
 *
 * Returns a cleanup function (kept for callers that run it from an effect).
 */
export function openAppOrStore(scheme: string, e?: MouseEvent<HTMLAnchorElement>): () => void {
  const platform = detectMobilePlatform();
  const url =
    platform === 'android'
      ? androidIntentUrl(scheme)
      : platform === 'ios'
        ? iosAppUrl(scheme)
        : `/download?from=${encodeURIComponent(window.location.pathname)}`;
  if (e && platform === 'ios') {
    e.currentTarget.href = url;
  } else {
    e?.preventDefault();
    window.location.href = url;
  }
  return () => {};
}
