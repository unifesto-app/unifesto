/**
 * Links into the competitive-dashboard app (hack.unifesto.app). It's a separate
 * app on a sibling subdomain that shares the `unifesto_token` cookie, so an
 * organiser who's signed in to Apex is already authenticated there.
 */

const HACK_URL = (
  process.env.NEXT_PUBLIC_HACK_URL || "https://hack.unifesto.app"
).replace(/\/$/, "");

/** Organiser setup + judging console for an event's leaderboard. */
export function hackAdminUrl(eventId: string): string {
  return `${HACK_URL}/admin/${eventId}`;
}

/** Public-facing leaderboard for an event. */
export function hackPublicUrl(eventId: string): string {
  return `${HACK_URL}/e/${eventId}`;
}
