"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";
import { WarningCircle } from "@unifesto/unicon/react";
import { SignInPrompt } from "@/console/components/shared/SignInPrompt";
import { PageHeader } from "@/console/components/shared/PageHeader";

import { getMe, getMyPartnerLinks, getMySpaces, type Me, type MySpace, type PartnerLink } from "@/lib/api/account";
import { myTickets, type MyTicket } from "@/lib/api/registration";
import { useWebSession } from "@/lib/auth";
import { IST } from "@/lib/site";

interface Account {
  me: Me;
  setMe: (me: Me) => void;
  /** One row per role I hold, as the API sends it. */
  spaces: MySpace[];
  setSpaces: (spaces: MySpace[]) => void;
  partnerLinks: PartnerLink[];
  /** Events I'm going to and have been to, one per event, as the app counts them. */
  counts: { going: number; been: number };
}

const AccountContext = createContext<Account | null>(null);
/** What the shell loaded once for every page under /console/account. Only inside the shell, once signed in. */
export const useAccount = () => useContext(AccountContext)!;

/**
 * K19: the web account pages, signed in through K18, on the app's APIs.
 * /console/account itself is My account, just my profile (it draws its own
 * header); every other page here opens from the sidebar and gets its title
 * and one card. Push settings and the share card stay in the app.
 */
export default function AccountShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/console/account";
  const { session, ready } = useWebSession();
  const token = session?.token ?? "";
  const [me, setMe] = useState<Me | null>(null);
  const [spaces, setSpaces] = useState<MySpace[]>([]);
  const [counts, setCounts] = useState({ going: 0, been: 0 });
  const [partnerLinks, setPartnerLinks] = useState<PartnerLink[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) return;
    let live = true;
    // Only the profile is required; the counts and lists it feeds just stay empty.
    Promise.allSettled([
      getMe(token),
      myTickets(token),
      getMySpaces(token),
      getMyPartnerLinks(token),
    ]).then(([m, t, s, p]) => {
      if (!live) return;
      if (m.status === "fulfilled") setMe(m.value);
      else setError(m.reason instanceof Error ? m.reason.message : "Couldn't load My account.");
      if (t.status === "fulfilled") setCounts(eventCounts(t.value));
      if (s.status === "fulfilled") setSpaces(s.value);
      if (p.status === "fulfilled") setPartnerLinks(p.value);
    });
    return () => {
      live = false;
    };
  }, [token]);

  const segment = pathname.split("/")[3];
  const page = PAGES[segment];
  const loaded = !!(session && me);

  let body;
  if (!ready) body = null;
  else if (!session) body = <SignInPrompt />;
  else if (!me)
    body = error ? <p className="text-sm text-destructive">{error}</p> : <p className="text-sm text-muted-foreground">Loading…</p>;
  else
    body = (
      <AccountContext.Provider value={{ me, setMe, spaces, setSpaces, partnerLinks, counts }}>{children}</AccountContext.Provider>
    );

  return (
    <div className="space-y-6">
      {/* Not over Security or Delete account: their deletion section says it already. */}
      {session && me?.deletionScheduledFor && pathname !== "/console/account/delete" && pathname !== "/console/account/sign-in" && (
        <div role="status" className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-foreground">
          <WarningCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning" weight="fill" aria-hidden="true" />
          <p>
            My account closes on{" "}
            {new Date(me.deletionScheduledFor).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: IST })}.{" "}
            <Link href="/console/account/sign-in#delete" className="font-medium underline underline-offset-4">
              Keep my account
            </Link>
          </p>
        </div>
      )}
      {page || !loaded ? (
        <>
          <PageHeader title={page ?? "My account"} subtitle={SUBTITLES[segment]} />
          {body}
        </>
      ) : (
        body
      )}
    </div>
  );
}

/** Pages under /console/account that open from the sidebar, by their segment: titled here, full width, no card. */
const PAGES: Record<string, string> = {
  inbox: "Inbox",
  support: "Support",
  saved: "Saved events",
  certificates: "My certificates",
  partner: "Partner stats",
  notifications: "Notifications",
  "sign-in": "Security",
  delete: "Delete account",
};

/** One line under a title where the name alone gets mixed up: Inbox (sent to me) vs Support (what I asked). */
const SUBTITLES: Record<string, string> = {
  inbox: "Updates Unifesto and organisers send me about my tickets, events and requests.",
};

/** One per event, split at now, as the app counts them. */
function eventCounts(tickets: MyTicket[]) {
  const now = Date.now();
  const starts = new Map(tickets.map((t) => [t.event.slug, new Date(t.event.startDateTime).getTime()]));
  const going = [...starts.values()].filter((at) => at >= now).length;
  return { going, been: starts.size - going };
}
