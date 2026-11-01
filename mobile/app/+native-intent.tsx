import AsyncStorage from '@react-native-async-storage/async-storage';
import { captureUtmFromLink } from '../src/services/utm';
import { claimTokenFrom, isClaimLinkHandled, seenClaimLinkBefore } from '../src/services/claimLinks';

const QR_LAUNCH_KEY = 'qr.launchCode';

/**
 * System links (scheme / universal links, including the one that launched the
 * app) pass through here before expo-router routes them. Android re-delivers
 * the launch link when the app is reopened from recents, which kept opening
 * "Claim your seat" for an invite that was already claimed or declined, or
 * whose link no longer works. Those replays go home; everything else is
 * routed as usual.
 */
export async function redirectSystemPath({ path, initial }: { path: string; initial: boolean }): Promise<string> {
  // Tagged event/space links (utm_*) are remembered for registration attribution.
  await captureUtmFromLink(path);
  // AASA + Android intent filters still hand /signup links to the app; the
  // signup route is gone, so send them to login.
  if (/^(?:[a-z]+:\/\/(?:[^/]*\/)?|\/)signup(?:[/?#]|$)/i.test(path)) return '/login';
  // Huddle sessions were retired; a cached AASA can still hand their links over.
  if (/^(?:[a-z]+:\/\/(?:[^/]*\/)?|\/)(?:session|huddle)(?:[/?#]|$)/i.test(path)) return '/';
  try {
    // Sign-in QR codes are single use: the launch link coming back would only
    // say the code expired, so it goes home.
    const qr = /^(?:[a-z]+:\/\/(?:[^/]*\/)?|\/)qr\/([\w-]+)/i.exec(path)?.[1];
    if (qr && initial) {
      if ((await AsyncStorage.getItem(QR_LAUNCH_KEY)) === qr) return '/';
      await AsyncStorage.setItem(QR_LAUNCH_KEY, qr);
    }
    const token = claimTokenFrom(path);
    if (token) {
      if (await isClaimLinkHandled(token)) return '/';
      // The launch link coming back again is a replay, not a new tap: go home
      // (a still-open invite is on the Home card). A link tapped while the app
      // is running (initial = false) always opens.
      const seen = await seenClaimLinkBefore(token);
      if (initial && seen) return '/';
    }
  } catch {
    // Never block a link on a storage error.
  }
  return path;
}
