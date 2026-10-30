"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { X } from "@unifesto/unicon/react";
import { cn } from "@/lib/utils/cn";
import { isNavActive, navFor } from "./nav-config";
import { useSession } from "@/lib/context/SessionContext";
import { getSupportStats, ASSIST_READ_EVENT } from "@/lib/api/support-api";
import { RailFooter, RailHeader } from "./RailChrome";
import { ThemeMenuItem } from "./ThemeToggle";

/**
 * A sidebar item for the page I'm on: bright type and a small glowing star at
 * its left, no filled pill (the console's look). The item needs `relative`.
 */
const NAV_ITEM_ACTIVE =
  "font-semibold text-foreground before:absolute before:left-0 before:top-1/2 before:h-1 before:w-1 before:-translate-y-1/2 before:rounded-full before:bg-foreground before:shadow-[0_0_6px_rgb(var(--bloom)/0.9)]";

/** Unread cases on the Unifesto desk (D3): recounted on navigation, on read, and each minute. */
function useAssistUnread(pathname: string, enabled: boolean) {
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const load = () => getSupportStats().then(({ data }) => data && setUnread(data.unread));
    load();
    const timer = setInterval(load, 60_000);
    window.addEventListener(ASSIST_READ_EVENT, load);
    return () => {
      clearInterval(timer);
      window.removeEventListener(ASSIST_READ_EVENT, load);
    };
  }, [pathname, enabled]);
  return unread;
}

/**
 * Platform nav, with Apex's chrome: wordmark and ⌘K at the top, my profile
 * and sign out at the foot, Theme closing the menu. A fixed rail from `lg` up
 * (it doesn't collapse); below that the same list slides in as a drawer the
 * phone bar's menu button opens.
 */
export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const { user, role } = useSession();
  const nav = navFor(role, user?.platform);
  // Support desk stats are admin-only; employees don't see the desk.
  const unread = useAssistUnread(pathname, role === "platform_admin");

  // Navigating closes the drawer; Escape does too.
  useEffect(onClose, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const groups = (
    <nav className="space-y-4 p-4">
      {nav.map((group, i) => (
        <div key={group.label ?? i}>
          {group.label && <p className="text-eyebrow mb-1.5 px-3">{group.label}</p>}
          <div className="space-y-0.5">
            {group.items.map((item) => {
              const active = isNavActive(pathname, item);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors duration-150 ease-standard",
                    active ? NAV_ITEM_ACTIVE : "font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <Icon className="h-[18px] w-[18px] flex-shrink-0" weight={active ? "fill" : "regular"} />
                  {item.label}
                  {item.unreadBadge && unread > 0 && (
                    <span
                      className="ml-auto rounded-full bg-primary px-1.5 py-0.5 text-[11px] font-semibold leading-none tabular-nums text-primary-foreground"
                      aria-label={`${unread} unread`}
                    >
                      {unread > 99 ? "99+" : unread}
                    </span>
                  )}
                </Link>
              );
            })}
            {i === nav.length - 1 && <ThemeMenuItem />}
          </div>
        </div>
      ))}
    </nav>
  );

  return (
    <>
      {/* Desktop rail */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-border bg-sidebar lg:flex">
        <RailHeader />
        <div className="flex-1 overflow-y-auto">{groups}</div>
        <RailFooter />
      </aside>

      {/* Phone drawer */}
      {open && <div className="fixed inset-0 z-30 bg-background/70 backdrop-blur-sm lg:hidden" onClick={onClose} aria-hidden />}
      <aside
        aria-label="Navigation"
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-64 max-w-[85vw] flex-col border-r border-border bg-sidebar transition-transform duration-200 ease-out lg:hidden",
          open ? "translate-x-0" : "-translate-x-full invisible"
        )}
      >
        <div className="relative">
          <RailHeader />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation"
            className="absolute right-2 top-3 rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">{groups}</div>
        <RailFooter />
      </aside>
    </>
  );
}
