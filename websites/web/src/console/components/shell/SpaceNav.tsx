"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft } from "@unifesto/unicon/react";
import { useSession } from "@/console/lib/context/SessionContext";
import { BASE_URL, currentItem, resolveNavGroups, type NavGroup, type NavItem } from "./nav-config";
import { cn } from "@/console/lib/utils/cn";
import { useDeskUnread } from "./QuestionsLink";

interface SpaceNavProps {
  /**
   * Fired when a nav link is activated. The mobile drawer passes its close
   * handler here so tapping a destination dismisses the drawer; the desktop
   * rail leaves it undefined.
   */
  onNavigate?: () => void;
  /**
   * Icon-only rail. Hides the space identity block, group labels and item
   * labels, centres the icons, and exposes each label as a hover tooltip.
   * Only the desktop rail sets this; the mobile drawer is always expanded.
   */
  collapsed?: boolean;
}

/**
 * The space sidebar: back to My Spaces, the space I'm in, then its
 * capability-filtered menu. My own pages have their own sidebar (AccountNav)
 * and an event its own (EventNav).
 */
export function SpaceNav({ onNavigate, collapsed = false }: SpaceNavProps) {
  const pathname = usePathname();
  const { currentSpace: space, access, can } = useSession();
  const unread = useDeskUnread(space?.id, can("event:manage-support"), pathname);
  if (!space) return null;

  return (
    <div className={cn("flex min-h-full flex-col", collapsed ? "p-2" : "p-4")}>
      <BackLink href={`${BASE_URL}/spaces`} label="My Spaces" collapsed={collapsed} onNavigate={onNavigate} />
      {/* Space identity — hidden on the icon rail */}
      {!collapsed && (
        <div className="space-y-1 px-3 pb-6">
          <h2 className="text-base font-semibold text-foreground line-clamp-2">{space.name}</h2>
          {(space.description || space.tagline) && (
            <p className="text-xs text-muted-foreground line-clamp-2">{space.description || space.tagline}</p>
          )}
        </div>
      )}
      <NavGroups
        groups={resolveNavGroups(space, access)}
        collapsed={collapsed}
        onNavigate={onNavigate}
        badge={(item) => (item.unreadBadge ? unread : 0)}
      />
    </div>
  );
}

/**
 * A sidebar item for the page I'm on: bright type and a small glowing star at
 * its left, no filled pill. Every sidebar uses it; the item needs `relative`.
 */
export const NAV_ITEM_ACTIVE =
  "font-semibold text-foreground before:absolute before:left-0 before:top-1/2 before:h-1 before:w-1 before:-translate-y-1/2 before:rounded-full before:bg-foreground before:shadow-[0_0_6px_rgb(var(--bloom)/0.9)]";

/** The way up from a dedicated sidebar: to My Spaces from a space, to all events from an event. */
export function BackLink({ href, label, collapsed, onNavigate }: { href: string; label: string; collapsed: boolean; onNavigate?: () => void }) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      title={collapsed ? label : undefined}
      className={cn(
        "mb-4 flex items-center rounded-lg text-sm font-semibold text-foreground transition-colors hover:bg-muted",
        collapsed ? "justify-center p-2.5" : "gap-2.5 px-3 py-2"
      )}
    >
      <ArrowLeft className="h-[18px] w-[18px] flex-shrink-0" />
      {!collapsed && label}
    </Link>
  );
}

/** A sidebar's groups: a header each (a hairline on the icon rail), a link per item, this page's item lit. */
export function NavGroups({
  groups,
  collapsed,
  onNavigate,
  badge,
  trailing,
}: {
  groups: NavGroup[];
  collapsed: boolean;
  onNavigate?: () => void;
  /** An unread count to show on an item. */
  badge?: (item: NavItem) => number;
  /** A last item that isn't a page, e.g. Theme under Settings, closing the last group. */
  trailing?: React.ReactNode;
}) {
  const pathname = usePathname();
  const shown = groups.map((g) => ({ ...g, items: g.items.filter((i) => !i.paletteOnly) }));
  const current = currentItem(shown.flatMap((g) => g.items), pathname);

  return (
    <nav className={cn("flex-1", collapsed ? "space-y-2" : "space-y-6")}>
      {shown.map((group, groupIdx) => (
        <div key={group.label ?? `group-${groupIdx}`}>
          {group.label &&
            (collapsed ? (
              // On the rail, a hairline stands in for the section header.
              groupIdx > 0 && <div className="mx-2 mb-2 border-t border-border" />
            ) : (
              <p className="mb-1.5 px-3 text-xs font-medium text-muted-foreground">{group.label}</p>
            ))}
          <div className="space-y-0.5">
            {group.items.map((item) => {
              const active = item === current;
              const Icon = item.icon;
              const count = badge?.(item) ?? 0;

              return (
                <Link
                  key={item.href}
                  href={`${BASE_URL}${item.href}`}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  title={collapsed ? item.label : undefined}
                  className={cn(
                    "relative flex items-center rounded-lg text-sm transition-colors duration-150",
                    collapsed ? "justify-center p-2.5" : "gap-3 px-3 py-2",
                    // This page: bright type, filled icon and a small star at the left, no filled pill.
                    active
                      ? NAV_ITEM_ACTIVE
                      : "font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <Icon className="h-[18px] w-[18px] flex-shrink-0" weight={active ? "fill" : "regular"} />
                  {!collapsed && item.label}
                  {count > 0 && (
                    <span
                      className={cn(
                        "rounded-full bg-primary font-semibold leading-none tabular-nums text-primary-foreground",
                        collapsed ? "sr-only" : "ml-auto px-1.5 py-0.5 text-[11px]"
                      )}
                      aria-label={`${count} unread`}
                    >
                      {count > 99 ? "99+" : count}
                    </span>
                  )}
                </Link>
              );
            })}
            {groupIdx === shown.length - 1 && trailing}
          </div>
        </div>
      ))}
    </nav>
  );
}
