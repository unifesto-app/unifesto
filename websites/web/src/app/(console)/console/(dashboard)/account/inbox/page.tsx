"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getInbox, markRead, MY_READ_EVENT, webLink, type InboxItem } from "@/lib/api/support";
import { useWebSession } from "@/lib/auth";
import { IST } from "@/lib/site";
import { Button } from "@/console/components/ui/button";
import { cn } from "@/console/lib/utils/cn";

const stamp = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: IST });

/** The app's notification inbox: what Unifesto and organisers sent me, newest first. Opening one marks it read. */
export default function InboxPage() {
  const router = useRouter();
  const { session } = useWebSession();
  const token = session?.token ?? "";
  const [items, setItems] = useState<InboxItem[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) return;
    getInbox(token).then(
      (r) => {
        setItems(r.items);
        setNext(r.nextBefore);
      },
      (e) => setError(e.message),
    );
  }, [token]);

  const more = async () => {
    if (!next) return;
    setBusy(true);
    try {
      const r = await getInbox(token, next);
      setItems((cur) => [...(cur ?? []), ...r.items]);
      setNext(r.nextBefore);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load more.");
    } finally {
      setBusy(false);
    }
  };

  const readAll = async () => {
    setBusy(true);
    try {
      await markRead(token);
      const now = new Date().toISOString();
      setItems((cur) => cur?.map((n) => ({ ...n, readAt: n.readAt ?? now })) ?? null);
      window.dispatchEvent(new Event(MY_READ_EVENT));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't mark them read.");
    } finally {
      setBusy(false);
    }
  };

  const open = (n: InboxItem) => {
    if (!n.readAt) {
      void markRead(token, [n.id]).then(() => window.dispatchEvent(new Event(MY_READ_EVENT)), () => undefined);
      setItems((cur) => cur?.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)) ?? null);
    }
    const to = webLink(n.deepLink);
    if (to) router.push(to);
  };

  if (!items) return error ? <p className="text-sm text-destructive">{error}</p> : <p className="text-sm text-muted-foreground">Loading my inbox…</p>;
  if (!items.length)
    return (
      <p className="border-t border-border pt-6 text-sm text-muted-foreground">
        Nothing here yet. Updates about my tickets, events and requests show up here.
      </p>
    );

  const unread = items.filter((n) => !n.readAt).length;
  return (
    <div>
      <div className="flex min-h-12 items-center justify-between gap-3 border-b border-border pb-3">
        <p className="text-sm text-muted-foreground">{unread ? `${unread} unread` : "All read"}</p>
        {unread > 0 && (
          <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={readAll}>
            Mark all as read
          </Button>
        )}
      </div>
      <ul className="divide-y divide-border">
        {items.map((n) => {
          const to = webLink(n.deepLink);
          return (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => open(n)}
                className="flex w-full items-start gap-3 rounded-lg px-3 py-4 text-left transition-colors duration-150 hover:bg-muted"
              >
                {/* Unread: the sidebar's star, bright and glowing; read: nothing. */}
                <span
                  aria-hidden="true"
                  className={cn("mt-2 h-1.5 w-1.5 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-foreground shadow-[0_0_6px_rgb(var(--bloom)/0.9)]")}
                />
                <span className="min-w-0 flex-1">
                  <span className={cn("block text-sm", n.readAt ? "text-foreground/80" : "font-semibold text-foreground", !to && "cursor-default")}>
                    {n.title}
                    {!n.readAt && <span className="sr-only"> (unread)</span>}
                  </span>
                  {n.body && <span className="mt-0.5 block text-sm text-muted-foreground">{n.body}</span>}
                  <span className="mt-1 block text-xs tabular-nums text-muted-foreground sm:hidden">{stamp(n.createdAt)}</span>
                </span>
                <span className="hidden shrink-0 pt-0.5 text-xs tabular-nums text-muted-foreground sm:block">{stamp(n.createdAt)}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {error && <p className="pt-4 text-sm text-destructive">{error}</p>}
      {next && (
        <div className="pt-4">
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={more}>
            {busy ? "Loading…" : "Show older"}
          </Button>
        </div>
      )}
    </div>
  );
}
