"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useSession } from "@/console/lib/context/SessionContext";
import { apexUrl, appRoleFromCode, isPlatformStaff, type SpaceMembership } from "@/console/lib/types/rbac";
import { getMyPortal } from "@/console/lib/api/sponsor-portal-api";
import { currentToken } from "@/console/lib/utils/auth";
import { ROLE_LABEL } from "@/console/components/shell/SpaceSwitcher";
import { Button } from "@/console/components/ui/button";
import { Card, CardContent } from "@/console/components/ui/card";
import { Skeleton } from "@/console/components/ui/skeleton";
import { isOver, loadTickets, type Ticket } from "@/lib/api/tickets";
import { when, where } from "./tickets/TicketsClient";

/**
 * /console, everyone's home (Track V9): my next tickets, and for anyone with a
 * space role, my spaces. Platform staff get a way into Apex, sponsors into
 * their portal.
 */
export default function ConsoleHome() {
  const router = useRouter();
  const { user, spaces, hasAccess, setCurrentSpace } = useSession();
  const [upcoming, setUpcoming] = useState<Ticket[] | null>(null);
  const [sponsor, setSponsor] = useState(false);

  useEffect(() => {
    let live = true;
    currentToken().then(async (token) => {
      const lists = token ? await loadTickets(token).catch(() => null) : null;
      const now = Date.now();
      // Soonest first, as on My tickets.
      const next = (lists?.live ?? [])
        .filter((t) => !isOver(t, now))
        .sort((a, b) => a.event.startDateTime.localeCompare(b.event.startDateTime));
      if (live) setUpcoming(next);
    });
    getMyPortal().then(({ data }) => live && setSponsor(!!data?.length));
    return () => {
      live = false;
    };
  }, []);

  const openSpace = (space: SpaceMembership) => {
    setCurrentSpace(space);
    router.push("/console/space");
  };

  const firstName = user?.name?.split(" ")[0];

  return (
    <div className="space-y-8">
      <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
        {firstName ? `Hi, ${firstName}` : "Home"}
      </h1>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-sm font-semibold text-foreground">My next events</h2>
          <Link href="/console/tickets" className="text-sm text-muted-foreground hover:text-foreground hover:underline">
            All my tickets
          </Link>
        </div>
        {!upcoming ? (
          <Skeleton className="h-20 w-full" />
        ) : !upcoming.length ? (
          <Card>
            <CardContent className="p-5 text-sm text-muted-foreground">
              Nothing coming up.{" "}
              <Link href="/events" className="font-medium text-primary hover:underline">
                Find an event
              </Link>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <ul className="divide-y divide-border">
              {upcoming.slice(0, 3).map((t) => (
                <li key={t.id}>
                  <Link href={`/console/tickets/${t.id}`} className="block px-5 py-4 hover:bg-muted">
                    <span className="block truncate font-medium text-foreground">{t.event.title}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {when(t.event.startDateTime)} · {where(t.event)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>

      {hasAccess && spaces.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">My spaces</h2>
          <Card>
            <ul className="divide-y divide-border">
              {spaces.map((s) => {
                const role = ROLE_LABEL[appRoleFromCode(s.userRole?.code)] || (s.eventAccess?.length ? "Event team" : "");
                return (
                  <li key={s.id}>
                    <button type="button" onClick={() => openSpace(s)} className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left hover:bg-muted">
                      <span className="truncate font-medium text-foreground">{s.name}</span>
                      {role && <span className="shrink-0 text-xs text-muted-foreground">{role}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </Card>
        </section>
      )}

      {(isPlatformStaff(user) || sponsor) && (
        <section className="flex flex-wrap gap-3">
          {isPlatformStaff(user) && (
            <Button asChild variant="outline">
              <a href={apexUrl()}>Open Apex</a>
            </Button>
          )}
          {sponsor && (
            <Button asChild variant="outline">
              <Link href="/console/sponsor">My sponsor portal</Link>
            </Button>
          )}
        </section>
      )}
    </div>
  );
}
