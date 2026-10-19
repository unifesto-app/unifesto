import { apiBase, withInternal } from "@/lib/api/internal";
// Universal module (server pages and client components): no browser APIs.

const API_URL = apiBase(process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000");

/** A Huddle session as the public API returns it (never the meeting link). */
export interface PublicSession {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  coverImageUrl: string | null;
  platform: string;
  startDateTime: string;
  durationMinutes: number;
  timezone: string;
  capacity: number | null;
  registeredCount: number;
  price: string | number;
  currency: string;
  status: "PUBLISHED" | "COMPLETED" | "CANCELLED" | string;
  cancellationReason: string | null;
  space: { id: string; name: string; slug: string; logoUrl: string | null } | null;
}

/** One session by slug, or null when it doesn't exist (or is a draft / hidden). */
export async function getSessionBySlug(slug: string): Promise<PublicSession | null> {
  const res = await fetch(
    `${API_URL}/sessions/${encodeURIComponent(slug)}`,
    withInternal({ next: { revalidate: 60 }, signal: AbortSignal.timeout(10000) }),
  );
  // Only a 404 is "no such session"; anything else errors so a blip never
  // tells crawlers to drop a live page.
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Error fetching session: ${res.status}`);
  return res.json();
}

/** A space's published, public, upcoming sessions (empty on any error). */
export async function getSpaceSessions(spaceId: string): Promise<PublicSession[]> {
  try {
    const res = await fetch(
      `${API_URL}/sessions?spaceId=${encodeURIComponent(spaceId)}`,
      withInternal({ next: { revalidate: 60 }, signal: AbortSignal.timeout(10000) }),
    );
    return res.ok ? res.json() : [];
  } catch {
    return [];
  }
}

/** "₹499" or "Free". */
export function sessionPrice(s: Pick<PublicSession, "price">): string {
  const n = Number(s.price);
  return n > 0 ? `₹${n.toLocaleString("en-IN")}` : "Free";
}

/** "Sat 25 Oct, 6:00 pm" in the session's own timezone. */
export function sessionWhen(s: Pick<PublicSession, "startDateTime" | "timezone">): string {
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: s.timezone || "Asia/Kolkata",
  }).format(new Date(s.startDateTime));
}
