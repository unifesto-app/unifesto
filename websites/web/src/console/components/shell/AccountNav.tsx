"use client";

import { useEffect, useState } from "react";
import { getInboxUnread, getMyUnreadCases, MY_READ_EVENT } from "@/lib/api/support";
import { getMyPartnerLinks } from "@/lib/api/account";
import { useWebSession } from "@/lib/auth";
import { cn } from "@/console/lib/utils/cn";
import { accountGroups } from "./nav-config";
import { NavGroups } from "./SpaceNav";
import { ThemeMenuItem } from "./ThemeToggle";

/**
 * The sidebar on my own pages: Dashboard, Inbox, My tickets, Support, Saved
 * events, My certificates, My Spaces, Partner stats when I have links, then
 * Settings (Notifications, Security, Theme).
 * My account opens from the sidebar's foot. A space and an event each get
 * their own sidebar (SpaceNav, EventNav).
 */
export function AccountNav({ onNavigate, collapsed = false }: { onNavigate?: () => void; collapsed?: boolean }) {
  const mine = useMyUnread();
  const partner = useHasPartnerLinks();

  return (
    <div className={cn("flex min-h-full flex-col", collapsed ? "p-2" : "p-4")}>
      <NavGroups
        groups={accountGroups(partner)}
        trailing={<ThemeMenuItem collapsed={collapsed} />}
        collapsed={collapsed}
        onNavigate={onNavigate}
        badge={(i) => (i.href === "/account/inbox" ? mine.inbox : i.href === "/account/support" ? mine.support : 0)}
      />
    </div>
  );
}

/** Whether an organiser gave me a tracking link, so Partner stats has something to show. */
function useHasPartnerLinks() {
  const { session } = useWebSession();
  const token = session?.token ?? "";
  const [has, setHas] = useState(false);
  useEffect(() => {
    if (token) getMyPartnerLinks(token).then((l) => setHas(l.length > 0), () => setHas(false));
  }, [token]);
  return has;
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
