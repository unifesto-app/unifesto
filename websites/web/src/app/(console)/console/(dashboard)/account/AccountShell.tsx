"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";
import { SignInPrompt } from "@/console/components/shared/SignInPrompt";
import { getMe, getMyPartnerLinks, getMySpaces, type Me, type MySpace, type PartnerLink } from "@/lib/api/account";
import { myTickets, type MyTicket } from "@/lib/api/registration";
import { getInboxUnread, getMyUnreadCases } from "@/lib/api/support";
import { useWebSession } from "@/lib/auth";
import { signOut } from "@/console/lib/utils/auth";
import { IST } from "@/lib/site";

interface Account {
  me: Me;
  setMe: (me: Me) => void;
  /** One row per role I hold, as the API sends it. */
  spaces: MySpace[];
  setSpaces: (spaces: MySpace[]) => void;
  partnerLinks: PartnerLink[];
  /** Unread inbox items and support cases, for the tab counts. */
  unread: { inbox: number; support: number };
  setUnread: React.Dispatch<React.SetStateAction<{ inbox: number; support: number }>>;
}

const AccountContext = createContext<Account | null>(null);
/** What the shell loaded once for every account tab. Only inside the shell, once signed in. */
export const useAccount = () => useContext(AccountContext)!;

/**
 * K19: the web account pages, signed in through K18. The app's Profile tab
 * on the same APIs: a header with my name and counts, then one tab per area.
 * Push settings and the share card stay in the app.
 */
export default function AccountShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/console/account";
  const { session, ready } = useWebSession();
  const token = session?.token ?? "";
  const [me, setMe] = useState<Me | null>(null);
  const [spaces, setSpaces] = useState<MySpace[]>([]);
  const [counts, setCounts] = useState({ going: 0, been: 0 });
  const [partnerLinks, setPartnerLinks] = useState<PartnerLink[]>([]);
  const [unread, setUnread] = useState({ inbox: 0, support: 0 });
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) return;
    let live = true;
    // Only the profile is required; the counts and tabs it feeds just stay empty.
    Promise.allSettled([
      getMe(token),
      myTickets(token),
      getMySpaces(token),
      getMyPartnerLinks(token),
      getInboxUnread(token),
      getMyUnreadCases(token),
    ]).then(([m, t, s, p, i, c]) => {
      if (!live) return;
      if (m.status === "fulfilled") setMe(m.value);
      else setError(m.reason instanceof Error ? m.reason.message : "Couldn't load My account.");
      if (t.status === "fulfilled") setCounts(eventCounts(t.value));
      if (s.status === "fulfilled") setSpaces(s.value);
      if (p.status === "fulfilled") setPartnerLinks(p.value);
      setUnread({ inbox: i.status === "fulfilled" ? i.value : 0, support: c.status === "fulfilled" ? c.value : 0 });
    });
    return () => {
      live = false;
    };
  }, [token]);

  const tabs = [
    { href: "/console/account", label: "Profile" },
    { href: "/console/account/inbox", label: "Inbox", count: unread.inbox },
    { href: "/console/tickets", label: "My tickets" },
    { href: "/console/account/support", label: "Support", count: unread.support },
    { href: "/console/account/saved", label: "Saved events" },
    { href: "/console/account/certificates", label: "My certificates" },
    { href: "/console/account/circles", label: "My circles" },
    ...(partnerLinks.length ? [{ href: "/console/account/partner", label: "Partner stats" }] : []),
    { href: "/console/account/notifications", label: "Notifications" },
    { href: "/console/account/sign-in", label: "Sign-in" },
    { href: "/console/account/delete", label: "Delete account" },
  ];

  let body;
  if (!ready) body = null;
  else if (!session)
    body = (
      <SignInPrompt />
    );
  else if (!me) body = error ? <p className="text-sm text-red-400">{error}</p> : <p className="text-paper/65">Loading My account…</p>;
  else
    body = (
      <AccountContext.Provider value={{ me, setMe, spaces, setSpaces, partnerLinks, unread, setUnread }}>{children}</AccountContext.Provider>
    );

  return (
    <div className="mx-auto max-w-3xl">
          {session && me ? (
            <Header me={me} email={session.email} {...counts} circles={new Set(spaces.map((s) => s.id)).size} />
          ) : (
            <h1 className="font-display text-2xl font-semibold tracking-tight text-paper">My account</h1>
          )}
          {session && me?.deletionScheduledFor && pathname !== "/console/account/delete" && (
            <p className="mt-5 rounded-2xl bg-night-2 px-4 py-3 text-sm text-paper/80">
              My account closes on{" "}
              {new Date(me.deletionScheduledFor).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: IST })}.{" "}
              <Link href="/console/account/delete" className="font-medium text-primary hover:underline">
                Keep my account
              </Link>
            </p>
          )}
          {session && me && (
            <nav aria-label="Account" className="-mx-5 mt-6 flex gap-2 overflow-x-auto px-5 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0">
              {tabs.map((t) => {
                // A support case keeps its tab lit.
                const active = pathname === t.href || (t.href !== "/console/account" && pathname.startsWith(`${t.href}/`));
                return (
                  <Link
                    key={t.href}
                    href={t.href}
                    aria-current={active ? "page" : undefined}
                    className={`shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm transition-colors duration-150 ${
                      active ? "bg-primary text-ink" : "bg-night-2 text-paper/80 hover:bg-night-3 hover:text-paper"
                    }`}
                  >
                    {t.label}
                    {!!t.count && <span className="ml-1.5 font-semibold">{t.count}</span>}
                  </Link>
                );
              })}
            </nav>
          )}
          <div className="mt-6 rounded-xl border border-border bg-night-2 p-6 sm:p-8">{body}</div>
    </div>
  );
}

/** One per event, split at now, as the app counts them. */
function eventCounts(tickets: MyTicket[]) {
  const now = Date.now();
  const starts = new Map(tickets.map((t) => [t.event.slug, new Date(t.event.startDateTime).getTime()]));
  const going = [...starts.values()].filter((at) => at >= now).length;
  return { going, been: starts.size - going };
}

/** The app's identity card: who I am and the same three counts. */
function Header({ me, email, going, been, circles }: { me: Me; email: string; going: number; been: number; circles: number }) {
  const stats = [
    { label: "Going to", value: going, href: "/console/tickets" },
    { label: "Been to", value: been, href: "/console/tickets" },
    { label: "Circles", value: circles, href: "/console/account/circles" },
  ];
  const name = me.fullName || me.username || email;
  const since = new Date(me.createdAt).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: IST });

  return (
    <header className="flex items-start gap-4 sm:gap-5">
      {me.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={me.avatarUrl} alt="" className="h-16 w-16 shrink-0 rounded-full object-cover sm:h-20 sm:w-20" />
      ) : (
        <div aria-hidden className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-night-3 text-xl font-semibold text-paper sm:h-20 sm:w-20">
          {name.slice(0, 1).toUpperCase()}
        </div>
      )}
      <div className="min-w-0">
        <h1 className="truncate font-display text-2xl font-semibold tracking-tight text-paper">{name}</h1>
        <p className="mt-1 text-sm text-paper/60">
          {me.username && <>@{me.username} · </>}Member since {since}
        </p>
        <p className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
          {stats.map((s) => (
            <Link key={s.label} href={s.href} className="text-paper/60 hover:text-paper">
              <strong className="font-semibold text-paper">{s.value}</strong> {s.label}
            </Link>
          ))}
        </p>
        <p className="mt-2 text-xs text-paper/55">
          Signed in as {email}.{" "}
          <button type="button" onClick={() => void signOut().then(() => window.location.assign("/login"))} className="underline hover:text-paper">
            Sign out
          </button>
        </p>
      </div>
    </header>
  );
}
