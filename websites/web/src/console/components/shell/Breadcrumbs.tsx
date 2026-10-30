"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import { CaretRight } from "@unifesto/unicon/react";
import { useSession } from "@/console/lib/context/SessionContext";
import { trail } from "@/console/lib/crumbs";
import { cn } from "@/console/lib/utils/cn";
import { EVENT_NAV_GROUPS } from "./EventNav";
import { NAV_GROUPS, ORBIT_NAV_ITEM, SUBSPACES_NAV_ITEM } from "./nav-config";

const SECTIONS = new Map(
  [...NAV_GROUPS.flatMap((g) => g.items), SUBSPACES_NAV_ITEM, ORBIT_NAV_ITEM].map((i) => [i.href.slice(1), i.label]),
);
const EVENT_SECTIONS = new Map(EVENT_NAV_GROUPS.flatMap((g) => g.items).map((i) => [i.href.slice(1), i.label]));

/* Names the URL doesn't carry (an event's title), published by the page that loaded them. */
let names = new Map<string, string>();
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
const publish = (next: Map<string, string>) => {
  names = next;
  listeners.forEach((l) => l());
};

/** Names pages have published (an event's title); the sidebar tree reads them too. */
export const useCrumbNames = () => useSyncExternalStore(subscribe, () => names, () => names);

/** Names the crumb for `href` while this page is open, e.g. the event layout with its event's title. */
export function useCrumbName(href: string, name: string | undefined) {
  useEffect(() => {
    if (!name) return;
    publish(new Map(names).set(href, name));
    return () => {
      const next = new Map(names);
      next.delete(href);
      publish(next);
    };
  }, [href, name]);
}

/**
 * Where I am, a line above the page: Dashboard › My Spaces › space › …. Every crumb but
 * the last is a link (My Spaces lists my spaces to switch between). On a
 * phone only the last one shows.
 */
export function Breadcrumbs() {
  const pathname = usePathname();
  const { currentSpace, hasAccess } = useSession();
  const named = useCrumbNames();
  const crumbs = trail(pathname, {
    space: hasAccess ? currentSpace?.name ?? null : null,
    section: (p) => SECTIONS.get(p),
    eventSection: (s) => EVENT_SECTIONS.get(s),
    named: (href) => named.get(href),
  });

  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1.5 text-sm">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            // Names give way first; page labels (Dashboard, Events, Attendees) stay whole.
            <li key={c.href} className={cn("flex items-center gap-1.5", c.name ? "min-w-0" : last ? "min-w-0 md:shrink-0" : "shrink-0", !last && "hidden md:flex")}>
              {i > 0 && (
                <CaretRight aria-hidden className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground", last && "hidden md:block")} weight="bold" />
              )}
              {last ? (
                <span aria-current="page" className="truncate font-medium text-foreground">
                  {c.label}
                </span>
              ) : (
                <Link href={c.href} className={cn("truncate text-muted-foreground transition-colors hover:text-foreground", c.name && "max-w-[12rem]")}>
                  {c.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
