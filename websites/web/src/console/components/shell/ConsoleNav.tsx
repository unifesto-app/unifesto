"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CalendarBlank, CaretDown, CaretRight, Tray } from "@unifesto/unicon/react";
import type { Icon } from "@unifesto/unicon/react";
import { useSession } from "@/console/lib/context/SessionContext";
import { getInboxUnread, getMyUnreadCases, MY_READ_EVENT } from "@/lib/api/support";
import { useWebSession } from "@/lib/auth";
import { isEventScopedSpace, type SpaceMembership } from "@/console/lib/types/rbac";
import { cn } from "@/console/lib/utils/cn";
import { useDeskUnread } from "./AssistInboxLink";
import { useCrumbNames } from "./Breadcrumbs";
import { useEventNavGroups } from "./EventNav";
import { BASE_URL, ME_GROUP, currentItem, resolveNavGroups } from "./nav-config";

const isAt = (pathname: string, href: string, exact?: boolean) =>
  pathname === href || (!exact && pathname.startsWith(`${href}/`));

/**
 * The sidebar as one tree (the full rail and the phone drawer):
 *
 *   Account     Dashboard · Inbox · My tickets · Support · Saved events · My certificates · My account
 *   My Spaces   ▾ the space I'm in: its Dashboard, Events, Members, Finance…
 *                   ▾ the event I'm in, under Events: its Dashboard, Attendees…
 *               ▸ my other spaces: opening one switches to it
 *
 * Built from the same menus and capability filters as the icon rail.
 */
export function ConsoleNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { spaces, currentSpace, setCurrentSpace, access, can, hasAccess } = useSession();
  const names = useCrumbNames();
  const unread = useDeskUnread(currentSpace?.id, can("event:manage-support"), pathname);
  const mine = useMyUnread();
  const personal = ME_GROUP.items.filter((i) => !i.paletteOnly);
  const here = currentItem(personal, pathname);

  const inEvent = pathname.match(/^\/console\/events\/([^/]+)/)?.[1];
  const openEvent = inEvent && inEvent !== "new" ? inEvent : null;
  const eventTitle = (id: string) => names.get(`${BASE_URL}/events/${id}`) ?? "Event";

  const switchTo = (space: SpaceMembership) => {
    setCurrentSpace(space);
    router.push(`${BASE_URL}/space`);
    onNavigate?.();
  };

  const spaceMenu = (space: SpaceMembership) => {
    // Event-only operators: just the events they were added to, and the Assist inbox for those.
    if (isEventScopedSpace(space)) {
      return (
        <>
          {can("event:manage-support") && (
            <li>
              <Row href={`${BASE_URL}/assist`} label="Assist inbox" icon={Tray} active={isAt(pathname, `${BASE_URL}/assist`)} badge={unread} onNavigate={onNavigate} />
            </li>
          )}
          {(space.eventAccess ?? []).map((ev) =>
            ev.eventId === openEvent ? (
              <EventNode key={ev.eventId} eventId={ev.eventId} title={names.get(`${BASE_URL}/events/${ev.eventId}`) ?? ev.title} onNavigate={onNavigate} />
            ) : (
              <li key={ev.eventId}>
                <Row href={`${BASE_URL}/events/${ev.eventId}`} label={ev.title} icon={CalendarBlank} active={false} onNavigate={onNavigate} />
              </li>
            ),
          )}
        </>
      );
    }
    return resolveNavGroups(space, access)
      .flatMap((g) => g.items)
      .filter((i) => !i.paletteOnly)
      .map((i) => {
        const href = `${BASE_URL}${i.href}`;
        const isEvents = i.href === "/events";
        return (
          <li key={i.href}>
            <Row
              href={href}
              label={i.label}
              icon={i.icon}
              // Inside an event, the event itself is the highlighted row.
              active={isAt(pathname, href, i.exact) && !(isEvents && openEvent)}
              badge={i.unreadBadge ? unread : 0}
              onNavigate={onNavigate}
            />
            {isEvents && openEvent && (
              <Nest>
                <EventNode eventId={openEvent} title={eventTitle(openEvent)} onNavigate={onNavigate} />
              </Nest>
            )}
          </li>
        );
      });
  };

  return (
    <nav aria-label="Console" className="space-y-6 p-3">
      <Section label="Account">
        {personal.map((i) => (
          <li key={i.href}>
            <Row
              href={`${BASE_URL}${i.href}`}
              label={i.label}
              icon={i.icon}
              active={i === here}
              badge={i.href === "/account/inbox" ? mine.inbox : i.href === "/account/support" ? mine.support : 0}
              onNavigate={onNavigate}
            />
          </li>
        ))}
      </Section>

      {hasAccess && spaces.length > 0 && (
        <Section label="My Spaces">
          {spaces.map((space) =>
            space.id === currentSpace?.id ? (
              <li key={space.id}>
                <Branch href={`${BASE_URL}/space`} label={space.name} onNavigate={onNavigate} />
                <Nest>{spaceMenu(space)}</Nest>
              </li>
            ) : (
              <li key={space.id}>
                <button
                  type="button"
                  onClick={() => switchTo(space)}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <CaretRight aria-hidden className="h-3.5 w-3.5 shrink-0" weight="bold" />
                  <span className="min-w-0 truncate">{space.name}</span>
                </button>
              </li>
            ),
          )}
        </Section>
      )}
    </nav>
  );
}

/** My unread inbox items and support replies: counted on load, after I read some, and each minute. */
function useMyUnread() {
  const { session } = useWebSession();
  const token = session?.token ?? "";
  const [unread, setUnread] = useState({ inbox: 0, support: 0 });
  useEffect(() => {
    if (!token) return;
    const load = () =>
      Promise.allSettled([getInboxUnread(token), getMyUnreadCases(token)]).then(([i, c]) =>
        setUnread({ inbox: i.status === "fulfilled" ? i.value : 0, support: c.status === "fulfilled" ? c.value : 0 }),
      );
    load();
    const timer = setInterval(load, 60_000);
    window.addEventListener(MY_READ_EVENT, load);
    return () => {
      clearInterval(timer);
      window.removeEventListener(MY_READ_EVENT, load);
    };
  }, [token]);
  return unread;
}

/** The event I'm in, open under Events: its name, then its sections. */
function EventNode({ eventId, title, onNavigate }: { eventId: string; title: string; onNavigate?: () => void }) {
  const pathname = usePathname();
  const base = `${BASE_URL}/events/${eventId}`;
  const items = useEventNavGroups(eventId).flatMap((g) => g.items);
  return (
    <li>
      <Branch href={base} label={title} onNavigate={onNavigate} />
      <Nest>
        {items.map((i) => (
          <li key={i.href}>
            <Row href={`${base}${i.href}`} label={i.label} icon={i.icon} active={isAt(pathname, `${base}${i.href}`, i.exact)} onNavigate={onNavigate} />
          </li>
        ))}
      </Nest>
    </li>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <ul className="space-y-0.5">{children}</ul>
    </div>
  );
}

/** A nested level: indented under a guide line. */
function Nest({ children }: { children: React.ReactNode }) {
  return <ul className="ml-[0.9rem] mt-0.5 space-y-0.5 border-l border-border pl-1.5">{children}</ul>;
}

/** An open level's heading (a space, an event): its name, linking to its dashboard. */
function Branch({ href, label, onNavigate }: { href: string; label: string; onNavigate?: () => void }) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
    >
      <CaretDown aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted-foreground" weight="bold" />
      <span className="min-w-0 truncate">{label}</span>
    </Link>
  );
}

function Row({
  href,
  label,
  icon: Icon,
  active,
  badge = 0,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: Icon;
  active: boolean;
  badge?: number;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors duration-150",
        active ? "bg-primary-soft font-semibold text-primary" : "font-medium text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" weight={active ? "fill" : "regular"} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {badge > 0 && (
        <span
          className="rounded-full bg-primary px-1.5 py-0.5 text-[11px] font-semibold leading-none tabular-nums text-primary-foreground"
          aria-label={`${badge} unread`}
        >
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </Link>
  );
}
