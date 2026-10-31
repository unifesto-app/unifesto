"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSession } from "@/console/lib/context/SessionContext";
import { apexUrl, isPlatformStaff } from "@/console/lib/types/rbac";
import { getMyPortal } from "@/console/lib/api/sponsor-portal-api";
import { currentToken } from "@/console/lib/utils/auth";
import { PageHeader } from "@/console/components/shared/PageHeader";
import { Button } from "@/console/components/ui/button";
import { Skeleton } from "@/console/components/ui/skeleton";
import { isOver, loadTickets, type Ticket } from "@/lib/api/tickets";
import { SpaceList } from "./spaces/SpaceList";
import { TicketRow } from "./tickets/TicketsClient";

/** A block of the home page, no card: its title over a hairline, the way to the full list on the right. */
function Block({ title, href, more, children }: { title: string; href: string; more: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="flex items-baseline justify-between gap-4 border-b border-border pb-3">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        <Link href={href} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
          {more}
        </Link>
      </div>
      {children}
    </section>
  );
}

/**
 * /console, everyone's home (Track V9): my next tickets, and for anyone with a
 * space role, my spaces. Platform staff get a way into Apex, sponsors into
 * their portal.
 */
export default function ConsoleHome() {
  const { user, spaces, hasAccess } = useSession();
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

  const firstName = user?.name?.split(" ")[0];

  return (
    <div className="space-y-10">
      <PageHeader title={firstName ? `Hi, ${firstName}` : "Home"} />

      <Block title="My next events" href="/console/tickets" more="All my tickets">
        {!upcoming ? (
          <Skeleton className="mt-3 h-16 w-full" />
        ) : !upcoming.length ? (
          <p className="pt-4 text-sm text-muted-foreground">
            Nothing coming up.{" "}
            <Link href="/events" className="text-foreground underline underline-offset-4">
              Find an event
            </Link>
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {upcoming.slice(0, 3).map((t) => (
              <li key={t.id}>
                <TicketRow ticket={t} />
              </li>
            ))}
          </ul>
        )}
      </Block>

      {hasAccess && spaces.length > 0 ? (
        <Block title="My Spaces" href="/console/spaces" more="All my spaces">
          <SpaceList limit={3} />
        </Block>
      ) : (
        // Q20: no role anywhere (the old no-access page) gets the way in.
        <Block title="My Spaces" href="/console/spaces" more="All my spaces">
          <div className="flex flex-wrap items-center justify-between gap-4 pt-4">
            <p className="text-sm text-muted-foreground">
              Running a club, fest or community? Start a space and run its events here today.
            </p>
            <Button asChild size="sm">
              <Link href="/request-space">Start a space</Link>
            </Button>
          </div>
        </Block>
      )}

      {(isPlatformStaff(user) || sponsor) && (
        <section className="flex flex-wrap gap-4">
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
