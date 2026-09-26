/**
 * Formats `User.lastSeenAt` for admin views. The backend stamps it at most
 * once per 5 minutes per user, so anything under 10 minutes counts as
 * "Active now" rather than a misleadingly precise "7m ago".
 */
export function formatLastSeen(iso: string | null | undefined): string {
  if (!iso) return "Never";
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 10) return "Active now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Exact timestamp for a tooltip. */
export function lastSeenTitle(iso: string | null | undefined): string | undefined {
  return iso ? new Date(iso).toLocaleString("en-IN") : undefined;
}
