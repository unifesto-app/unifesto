"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MagnifyingGlass } from "@unifesto/unicon/react";
import { getMySpaceRequests, getMySpaces, leaveSpace, type MySpace, type SpaceRequest } from "@/lib/api/account";
import { useWebSession } from "@/lib/auth";
import { IST } from "@/lib/site";
import { useSession } from "@/console/lib/context/SessionContext";
import { PageHeader } from "@/console/components/shared/PageHeader";
import { Button } from "@/console/components/ui/button";
import { Input } from "@/console/components/ui/input";
import Section from "../account/Section";
import { SpaceList } from "./SpaceList";

const REQUEST_STATUS = {
  PENDING: { label: "In review", className: "text-muted-foreground" },
  APPROVED: { label: "Approved", className: "text-success" },
  REJECTED: { label: "Not approved", className: "text-destructive" },
} as const;
const STATUS_ORDER: Record<string, number> = { PENDING: 0, REJECTED: 1, APPROVED: 2 };
/** Requests shown before "Show more". */
const REQUEST_PAGE = 5;

/**
 * My Spaces (once two pages, now one): the spaces I help
 * run, searchable, each opening its menu in the sidebar; the ones I joined,
 * with Leave; and the spaces I asked Unifesto to set up. Everyone signed in
 * has it, not only people with a space role.
 */
export default function MySpacesPage() {
  const { session } = useWebSession();
  const token = session?.token ?? "";
  const { spaces: run, hasAccess } = useSession();
  const [joined, setJoined] = useState<MySpace[]>([]);
  const [requests, setRequests] = useState<SpaceRequest[]>([]);
  const [query, setQuery] = useState("");
  const [requestCount, setRequestCount] = useState(REQUEST_PAGE);
  const [sure, setSure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) return;
    // The API sends one row per role: a space is "joined" only when MEMBER is my one role there.
    getMySpaces(token).then((rows) => {
      const running = new Set(rows.filter((s) => s.userRole.code !== "MEMBER").map((s) => s.id));
      const member = new Map(rows.filter((s) => s.userRole.code === "MEMBER" && !running.has(s.id)).map((s) => [s.id, s]));
      setJoined([...member.values()]);
    }, () => undefined);
    getMySpaceRequests(token).then(setRequests, () => undefined);
  }, [token]);

  const leave = async (id: string) => {
    setBusy(true);
    setError("");
    try {
      await leaveSpace(token, id);
      setJoined((list) => list.filter((s) => s.id !== id));
      setSure(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't leave this space.");
    } finally {
      setBusy(false);
    }
  };

  const running = hasAccess ? run : [];
  const nothing = !running.length && !joined.length && !requests.length;
  // Approved requests are already spaces I run, so the ones still in review (then not approved) lead.
  const sortedRequests = [...requests].sort((a, b) => (STATUS_ORDER[a.status] ?? 3) - (STATUS_ORDER[b.status] ?? 3));
  const shownRequests = sortedRequests.slice(0, requestCount);

  return (
    <div className="space-y-4">
      <PageHeader
        title="My Spaces"
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/request-space">{running.length ? "Request another space" : "Request a space"}</Link>
          </Button>
        }
      />

      <div>
        {nothing && (
          <p className="border-t border-border py-6 text-sm text-muted-foreground">
            No spaces yet. Join a club or community from its page on{" "}
            <Link href="/spaces" className="text-foreground underline underline-offset-4">
              Spaces
            </Link>
            .
          </p>
        )}

        {running.length > 0 && (
          <Section title="Spaces I run" description={`${running.length} ${running.length === 1 ? "space" : "spaces"}. Open one to work on it here.`}>
            {running.length > 6 && (
              <div className="relative max-w-sm">
                <MagnifyingGlass aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="search"
                  aria-label="Search the spaces I run"
                  placeholder="Search by name or city"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            )}
            <SpaceList query={query} />
          </Section>
        )}

        {joined.length > 0 && (
          <Section title="Spaces I'm in" description="Clubs and communities I joined.">
            <ul className="-my-3 divide-y divide-border">
              {joined.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-4 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-lg bg-muted text-sm font-semibold text-muted-foreground">
                      {s.logo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={s.logo_url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        s.name.slice(0, 1).toUpperCase()
                      )}
                    </span>
                    <div className="min-w-0">
                      <Link href={`/space/${s.slug}`} className="block truncate text-sm font-medium text-foreground hover:underline">
                        {s.name}
                      </Link>
                      <p className="mt-0.5 text-xs text-muted-foreground">{["Member", s.city].filter(Boolean).join(" · ")}</p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    {sure === s.id ? (
                      <>
                        <Button type="button" variant="destructive" size="sm" disabled={busy} onClick={() => leave(s.id)}>
                          {busy ? "Leaving…" : "Yes, leave"}
                        </Button>
                        <Button type="button" variant="ghost" size="sm" onClick={() => setSure(null)}>
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <Button type="button" variant="ghost" size="sm" onClick={() => setSure(s.id)}>
                        Leave
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            {error && <p className="pt-3 text-sm text-destructive">{error}</p>}
          </Section>
        )}

        {requests.length > 0 && (
          <Section title="My space requests" description="Spaces I asked Unifesto to set up.">
            <ul className="-mt-4 divide-y divide-border">
              {shownRequests.map((r) => (
                <li key={r.id} className="py-4">
                  <p className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-sm font-medium text-foreground">{r.name}</span>
                    <span className={`text-xs font-medium ${REQUEST_STATUS[r.status]?.className ?? "text-muted-foreground"}`}>
                      {REQUEST_STATUS[r.status]?.label ?? r.status}
                    </span>
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Sent {new Date(r.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: IST })}
                  </p>
                  {r.reviewNote && <p className="mt-2 text-sm text-muted-foreground">{r.reviewNote}</p>}
                </li>
              ))}
            </ul>
            {requests.length > shownRequests.length && (
              <div className="flex items-center gap-3 border-t border-border pt-4">
                <Button type="button" variant="outline" size="sm" onClick={() => setRequestCount((n) => n + REQUEST_PAGE * 4)}>
                  Show {Math.min(requests.length - shownRequests.length, REQUEST_PAGE * 4)} more
                </Button>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {shownRequests.length} of {requests.length}
                </span>
              </div>
            )}
          </Section>
        )}
      </div>
    </div>
  );
}
