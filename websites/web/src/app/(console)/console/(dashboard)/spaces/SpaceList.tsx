"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/console/lib/context/SessionContext";
import { ROLE_LABEL, appRoleFromCode, type SpaceMembership } from "@/console/lib/types/rbac";
import { Button } from "@/console/components/ui/button";
import { cn } from "@/console/lib/utils/cn";

/** Rows the full list shows before "Show more". */
const PAGE = 20;

/** Logo, name and about, (counts on the full list,) my role. */
const FULL = "grid-cols-[2.5rem_minmax(0,1fr)_auto] md:grid-cols-[2.5rem_minmax(0,1fr)_5rem_5rem_7rem]";
const COMPACT = "grid-cols-[2.5rem_minmax(0,1fr)_auto]";

/** What a search matches: name, city and description. */
const haystack = (s: SpaceMembership) => [s.name, s.city, s.description].filter(Boolean).join(" ").toLowerCase();

/**
 * My spaces, a row each with my role; opening one makes it the space the
 * console works in. The full list (My Spaces) adds column heads, each space's
 * event and member counts, and filters by `query`; with `limit` (the
 * dashboard) it's just the first few rows.
 */
export function SpaceList({ limit, query = "" }: { limit?: number; query?: string }) {
  const router = useRouter();
  const { spaces, setCurrentSpace } = useSession();
  const full = limit === undefined;
  const q = query.trim().toLowerCase();
  const matches = q ? spaces.filter((s) => haystack(s).includes(q)) : spaces;
  // The whole list is already here, so "Show more" (not pages): 20 at a time, back to 20 when the search changes.
  const [more, setMore] = useState({ q, count: PAGE });
  const count = more.q === q ? more.count : PAGE;
  const shown = matches.slice(0, full ? count : limit);
  const left = full ? matches.length - shown.length : 0;

  const open = (space: SpaceMembership) => {
    setCurrentSpace(space);
    router.push("/console/space");
  };

  if (q && !shown.length) return <p className="py-12 text-center text-sm text-muted-foreground">No spaces match &ldquo;{query.trim()}&rdquo;.</p>;

  return (
    <div>
      {full && (
        <div className={cn("grid items-center gap-x-4 border-b border-border px-3 pb-2 text-xs font-medium text-muted-foreground", FULL)}>
          <span className="col-span-2">Space</span>
          <span className="hidden text-right md:block">Events</span>
          <span className="hidden text-right md:block">Members</span>
          <span className="text-right">My role</span>
        </div>
      )}
      <ul className="divide-y divide-border">
        {shown.map((s) => {
          const role = ROLE_LABEL[appRoleFromCode(s.userRole?.code)] || (s.eventAccess?.length ? "Event team" : "");
          const about = [s.city, s.tagline || s.description].filter(Boolean).join(" · ");
          return (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => open(s)}
                className={cn(
                  "grid w-full items-center gap-x-4 rounded-lg px-3 py-3 text-left transition-colors duration-150 hover:bg-muted",
                  full ? FULL : COMPACT
                )}
              >
                <span className="grid h-10 w-10 place-items-center overflow-hidden rounded-lg bg-muted text-sm font-semibold text-muted-foreground">
                  {s.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.logo_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    s.name.charAt(0).toUpperCase()
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-foreground">{s.name}</span>
                  {about && <span className="mt-0.5 block truncate text-xs text-muted-foreground">{about}</span>}
                </span>
                {full && <span className="hidden text-right text-sm tabular-nums text-foreground md:block">{s._count?.events ?? 0}</span>}
                {full && (
                  <span className="hidden text-right text-sm tabular-nums text-foreground md:block">{s._count?.members ?? s.member_count ?? 0}</span>
                )}
                <span className="text-right text-xs text-muted-foreground">{role}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {left > 0 && (
        <div className="flex items-center gap-3 border-t border-border px-3 pt-4">
          <Button type="button" variant="outline" size="sm" onClick={() => setMore({ q, count: count + PAGE })}>
            Show {Math.min(left, PAGE)} more
          </Button>
          <span className="text-xs tabular-nums text-muted-foreground">
            {shown.length} of {matches.length}
          </span>
        </div>
      )}
    </div>
  );
}
