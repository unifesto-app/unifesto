import { captureUtmFromLink } from '../src/services/utm';
import { claimTokenFrom, isClaimLinkHandled, seenClaimLinkBefore } from '../src/services/claimLinks';

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
