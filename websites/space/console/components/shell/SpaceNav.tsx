"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "@/console/lib/context/SessionContext";
import { BASE_URL, resolveNavGroups, type NavItem } from "./nav-config";
import { cn } from "@/console/lib/utils/cn";
import { useDeskUnread } from "./AssistInboxLink";

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
 * The space sidebar contents — space identity header + capability-filtered
 * workflow nav. Rendered in three modes: the fixed desktop rail (expanded or
 * `collapsed`) and the mobile slide-in drawer, all reading from the shared
 * `nav-config` source.
 */
export function SpaceNav({ onNavigate, collapsed = false }: SpaceNavProps) {
  const pathname = usePathname();
  const { currentSpace, access, can } = useSession();
  const unread = useDeskUnread(currentSpace?.id, can("event:manage-support"), pathname);

  if (!currentSpace) return null;

  const navGroups = resolveNavGroups(currentSpace, access);

  const isActive = (item: NavItem) => {
    const fullPath = `${BASE_URL}${item.href}`;
    if (item.exact) return pathname === fullPath;
    return pathname === fullPath || pathname.startsWith(`${fullPath}/`);
  };

  return (
    <div className={cn("flex min-h-full flex-col", collapsed ? "p-2" : "p-4")}>
      {/* Space identity — hidden on the icon rail */}
      {!collapsed && (
        <div className="space-y-1 px-3 pb-6">
          <h2 className="text-base font-semibold text-foreground line-clamp-2">
            {currentSpace.name}
          </h2>
          {(currentSpace.description || currentSpace.tagline) && (
            <p className="text-xs text-muted-foreground line-clamp-2">
              {currentSpace.description || currentSpace.tagline}
            </p>
          )}
        </div>
      )}

      {/* Navigation — workflow groups */}
      <nav className={cn("flex-1", collapsed ? "space-y-2" : "space-y-6")}>
        {navGroups.map((group, groupIdx) => (
          <div key={group.label ?? `group-${groupIdx}`}>
            {group.label &&
              (collapsed ? (
                // On the rail, a hairline stands in for the section header.
                groupIdx > 0 && <div className="mx-2 mb-2 border-t border-border" />
              ) : (
                <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {group.label}
                </p>
              ))}
            <div className="space-y-0.5">
              {group.items.filter((i) => !i.paletteOnly).map((item) => {
                const active = isActive(item);
                const Icon = item.icon;
                const href = `${BASE_URL}${item.href}`;

                return (
                  <Link
                    key={item.href}
                    href={href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    title={collapsed ? item.label : undefined}
                    className={cn(
                      "flex items-center rounded-lg text-sm transition-colors duration-150",
                      collapsed
                        ? "justify-center p-2.5"
                        : "gap-3 px-3 py-2",
                      active
                        ? "bg-primary-soft font-semibold text-primary"
                        : "font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <Icon
                      className="h-[18px] w-[18px] flex-shrink-0"
                      weight={active ? "fill" : "regular"}
                    />
                    {!collapsed && item.label}
                    {item.unreadBadge && unread > 0 && (
                      <span
                        className={cn(
                          "rounded-full bg-primary font-semibold leading-none tabular-nums text-primary-foreground",
                          collapsed ? "sr-only" : "ml-auto px-1.5 py-0.5 text-[11px]"
                        )}
                        aria-label={`${unread} unread`}
                      >
                        {unread > 99 ? "99+" : unread}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </div>
  );
}
