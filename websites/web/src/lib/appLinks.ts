/**
 * Deep-link into the Unifesto mobile app, falling back to the app store when
 * the app isn't installed. Shared by the "Open in app" buttons and the signup
 * redirect so the behaviour is consistent everywhere.
 */

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
