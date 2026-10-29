"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Tray } from "@unifesto/unicon/react";
import { useSession } from "@/console/lib/context/SessionContext";
import { isEventScopedSpace } from "@/console/lib/types/rbac";
import { getSpaceDeskUnread, ASSIST_READ_EVENT } from "@/console/lib/api/support-api";
import { cn } from "@/console/lib/utils/cn";

/** Unread cases on this space's Assist desk: recounted on navigation, on read, and each minute. */
export function useDeskUnread(spaceId: string | undefined, enabled: boolean, pathname: string) {
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    if (!spaceId || !enabled) {
      setUnread(0);
      return;
    }
    const load = () => getSpaceDeskUnread(spaceId).then(({ data }) => setUnread(data?.unread ?? 0));
    load();
    const timer = setInterval(load, 60_000);
    window.addEventListener(ASSIST_READ_EVENT, load);
    return () => {
      clearInterval(timer);
      window.removeEventListener(ASSIST_READ_EVENT, load);
    };
  }, [spaceId, enabled, pathname]);
  return unread;
}

/**
 * Assist inbox entry for event-only operators, who never get `SpaceNav`.
 * Renders nothing unless one of their event roles answers cases.
 */
export function AssistInboxLink({
  collapsed = false,
  onNavigate,
}: {
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const { currentSpace, can } = useSession();
  const enabled = isEventScopedSpace(currentSpace) && can("event:manage-support");
  const unread = useDeskUnread(currentSpace?.id, enabled, pathname);

  if (!enabled) return null;

  const href = "/dashboard/assist";
  const active = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      title={collapsed ? "Assist inbox" : undefined}
      className={cn(
        "mb-4 flex items-center rounded-lg text-sm transition-colors duration-150",
        collapsed ? "justify-center p-2.5" : "gap-2.5 px-3 py-2",
        active
          ? "bg-primary-soft font-semibold text-primary"
          : "font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      <Tray className="h-[18px] w-[18px] flex-shrink-0" weight={active ? "fill" : "regular"} />
      {!collapsed && "Assist inbox"}
      {unread > 0 && (
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
}
