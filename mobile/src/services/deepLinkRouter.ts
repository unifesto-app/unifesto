import { router } from 'expo-router';
import { claimTokenFrom, isClaimLinkHandled, seenClaimLinkBefore } from './claimLinks';

/**
 * Shared deep-link router.
 *
 * ONE place that turns an arbitrary link string into an in-app navigation.
 * Three producers feed it (P1 plan, item 6):
 *   1. OneSignal push taps  — data.deepLink / launchURL on the click event.
 *   2. Content/share links  — unifesto:// or https://unifesto.app/… URLs.
 *   3. Claim/invite links   — group-registration claim links (P2 consumers).
 *
 * Why centralize instead of letting expo-router auto-handle every URL:
 *   - Push taps never reach expo-router's Linking listener (OneSignal intercepts
 *     the tap), so the routing has to be driven manually from the click event.
 *   - We want a single allowlist + auth gate so a crafted push/link can't drive
 *     navigation to arbitrary internal paths or into gated screens while logged out.
 *
 * Note: OS-level universal/scheme links that arrive through `Linking` are already
 * routed by expo-router's own listener. We deliberately do NOT add a second
 * `Linking('url')` listener here to avoid double-navigation — this module owns the
 * push-tap path and exposes `normalizeDeepLink`/`routeToDeepLink` for the future
 * claim-link handlers to reuse.
 */

const APP_SCHEME = 'unifesto://';
const WEB_HOSTS = ['unifesto.app', 'www.unifesto.app'];

/**
 * First path segments we permit routing into. Anything outside this set is
 * rejected so a malicious/mistyped link can't navigate to arbitrary routes.
 * Keep in sync with the route tree under `app/`.
 */
const ALLOWED_PREFIXES = new Set([
  'event',
  'space',
  'session',
  'ticket',
  'tickets',
  'checkin',
  'certificates',
  'events',
  'sessions',
  'user-profile',
  'notification-settings',
  'claim', // group-seat invite claim links (fast-registration Part 2)
  'apex', // platform-admin alerts (e.g. WhatsApp inbox); screens re-check the role server-side
  'hackathon', // a team's hackathon hub (room, Team ID, updates)
  'competition', // a participant's round results / winners
  'judging', // a judge's console (hackathon queue pushes); screens re-check the panel server-side
  'group', // Manage group (team changes: lead handover requests, seats added)
  'manage', // support case threads (Assist pushes); screens re-check access server-side
]);

/**
 * Routes that only make sense for a signed-in user. A link into one of these
 * while logged out is handled by the auth gate in `routeToDeepLink`.
 */
const AUTH_REQUIRED_PREFIXES = new Set([
  'ticket',
  'tickets',
  'checkin',
  'certificates',
  'notification-settings',
  'claim', // must be signed in to claim a seat (queues → login → replays)
  'apex',
  'hackathon',
  'competition',
  'judging',
  'group',
  'manage',
]);

/** First path segment, lowercased (e.g. "/ticket/123" -> "ticket"). */
function headSegment(path: string): string {
  return path.replace(/^\/+/, '').split('/')[0]?.toLowerCase() ?? '';
}

/**
 * Turn any supported link form into a validated, app-relative expo-router path,
 * or return null if it isn't a link we route.
 *
 * Accepts:
 *   - `unifesto://ticket/123`      (custom scheme)
 *   - `https://unifesto.app/event/my-slug?tab=info`  (universal link)
 *   - `/event/my-slug`            (already app-relative)
 *
 * Rejects foreign hosts, unknown route prefixes, and empty paths.
 */
export function normalizeDeepLink(raw?: string | null): string | null {
  if (!raw) return null;
  let s = raw.trim();
  if (!s) return null;

  if (s.toLowerCase().startsWith(APP_SCHEME)) {
    // unifesto://ticket/123  ->  /ticket/123   (tolerate extra leading slashes)
    s = '/' + s.slice(APP_SCHEME.length).replace(/^\/+/, '');
  } else if (/^https?:\/\//i.test(s)) {
    const withoutProto = s.replace(/^https?:\/\//i, '');
    const slash = withoutProto.indexOf('/');
    const host = (slash === -1 ? withoutProto : withoutProto.slice(0, slash))
      .toLowerCase()
      .split(':')[0]; // drop any :port
    if (!WEB_HOSTS.includes(host)) return null; // never route foreign hosts
    s = slash === -1 ? '/' : withoutProto.slice(slash);
  } else if (!s.startsWith('/')) {
    return null;
  }

  const [pathPart, queryPart] = s.split('?');
  const segments = pathPart.split('/').filter(Boolean);
  if (segments.length === 0) return null;
  if (!ALLOWED_PREFIXES.has(segments[0].toLowerCase())) return null;

  const path = '/' + segments.join('/');
  return queryPart ? `${path}?${queryPart}` : path;
}

/** Whether a normalized path targets a screen that requires authentication. */
export function isAuthRequired(path: string): boolean {
  return AUTH_REQUIRED_PREFIXES.has(headSegment(path));
}

/**
 * Read the deep link off a OneSignal notification-click event.
 * OneSignal v5 shape: `{ notification: { additionalData, launchURL } }`.
 */
export function extractPushDeepLink(clickEvent: any): string | null {
  const n = clickEvent?.notification ?? clickEvent;
  return (
    n?.additionalData?.deepLink ??
    n?.additionalData?.deep_link ??
    n?.launchURL ??
    null
  );
}

// ── Auth-gated deferral ───────────────────────────────────────────────────────
// A deep link can arrive while the user is logged out. We stash it and replay it
// after authentication (see `useDeepLinks`).
let pendingDeepLink: string | null = null;

export function setPendingDeepLink(path: string | null): void {
  pendingDeepLink = path;
}

/** Return and clear the queued deep link (single-shot). */
export function consumePendingDeepLink(): string | null {
  const p = pendingDeepLink;
  pendingDeepLink = null;
  return p;
}

export type RouteOutcome = 'routed' | 'queued' | 'ignored';

/**
 * Normalize `raw`, then navigate — applying the auth gate.
 */
export function routeToDeepLink(
  raw: string | null | undefined,
  ctx: { isAuthenticated: boolean },
): RouteOutcome {
  const path = normalizeDeepLink(raw);
  if (!path) return 'ignored';

  if (isAuthRequired(path) && !ctx.isAuthenticated) {
    return handleUnauthenticatedLink(path);
  }

  // A claim link that already reached an outcome on this device (e.g. a push
  // tap replayed on relaunch) is dropped instead of re-opening an error screen.
  const claimToken = claimTokenFrom(path);
  if (claimToken) {
    // Push taps: drop links already finished on this device, and pushes for a
    // link we've already opened (OneSignal can re-fire the launch tap).
    Promise.all([isClaimLinkHandled(claimToken), seenClaimLinkBefore(claimToken)])
      .then(([handled, seen]) => {
        if (!handled && !seen) router.push(path as any);
      })
      .catch(() => router.push(path as any));
    return 'routed';
  }

  router.push(path as any);
  return 'routed';
}

/**
 * Policy for an auth-gated deep link that arrives while the user is logged out:
 * queue it, redirect to login, and replay it after successful auth (see
 * `useDeepLinks`). Chosen for continuity — the tap's intent survives the login.
 */
function handleUnauthenticatedLink(path: string): RouteOutcome {
  setPendingDeepLink(path);
  router.push('/login');
  return 'queued';
}
