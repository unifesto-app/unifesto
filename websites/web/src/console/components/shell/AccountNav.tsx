"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/console/lib/context/SessionContext";
import { getInboxUnread, getMyUnreadCases, MY_READ_EVENT } from "@/lib/api/support";
import { useWebSession } from "@/lib/auth";
import { cn } from "@/console/lib/utils/cn";
import { accountGroup } from "./nav-config";
import { NavGroups } from "./SpaceNav";

/**
 * The sidebar on my own pages: Dashboard, Inbox, My tickets, Support, Saved
 * events, My certificates, My account, and My Spaces once I hold a space
 * role. A space and an event each get their own sidebar (SpaceNav, EventNav).
 */
export function AccountNav({ onNavigate, collapsed = false }: { onNavigate?: () => void; collapsed?: boolean }) {
  const { hasAccess } = useSession();
  const mine = useMyUnread();

  return (
    <div className={cn("flex min-h-full flex-col", collapsed ? "p-2" : "p-4")}>
      <NavGroups
        groups={[accountGroup(hasAccess)]}
        collapsed={collapsed}
        onNavigate={onNavigate}
        badge={(i) => (i.href === "/account/inbox" ? mine.inbox : i.href === "/account/support" ? mine.support : 0)}
      />
    </div>
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
