"use client";

import { useSession } from "@/lib/context/SessionContext";

/**
 * The id of the space the operator is currently acting in.
 *
 * In Apex the space is a URL segment (`/dashboard/[spaceId]/…`); here there is
 * a single current space held in {@link SessionContext} and switched from the
 * header. Ported pages read the id through this hook instead of `useParams`,
 * so the URL carries only what is genuinely per-page (eventId, sessionId, …).
 *
 * Returns `""` while the session is still resolving — the dashboard layout
 * holds a skeleton until `currentSpace` exists, so pages generally render with
 * a real id, but guard for the empty string before firing space-scoped calls.
 */
export function useSpaceId(): string {
  const { currentSpace } = useSession();
  return currentSpace?.id ?? "";
}
