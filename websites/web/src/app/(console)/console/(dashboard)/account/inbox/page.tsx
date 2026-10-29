"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getInbox, markRead, MY_READ_EVENT, webLink, type InboxItem } from "@/lib/api/support";
import { useWebSession } from "@/lib/auth";
import { IST } from "@/lib/site";

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

  if (!items) return error ? <p className="text-sm text-red-400">{error}</p> : <p className="text-paper/65">Loading my inbox…</p>;
  if (!items.length) return <p className="text-paper/75">Nothing here yet. Updates about my tickets, events and requests show up here.</p>;

  return (
    <div className="space-y-4">
      {items.some((n) => !n.readAt) && (
        <button type="button" disabled={busy} onClick={readAll} className="text-sm text-paper/70 hover:text-paper hover:underline">
          Mark all as read
        </button>
      )}
      <ul className="divide-y divide-white/[0.06]">
        {items.map((n) => {
          const to = webLink(n.deepLink);
          return (
            <li key={n.id}>
              <button type="button" onClick={() => open(n)} className="group flex w-full items-start gap-3 py-4 text-left">
                <span aria-hidden className={`mt-2 h-2 w-2 shrink-0 rounded-full ${n.readAt ? "bg-transparent" : "bg-primary"}`} />
                <span className="min-w-0 flex-1">
                  <span className={`block ${n.readAt ? "text-paper/80" : "font-semibold text-paper"} ${to ? "group-hover:underline" : ""}`}>
                    {n.title}
                    {!n.readAt && <span className="sr-only"> (unread)</span>}
                  </span>
                  {n.body && <span className="mt-0.5 block text-sm text-paper/65">{n.body}</span>}
                  <span className="mt-1 block text-xs text-paper/50">{stamp(n.createdAt)}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {error && <p className="text-sm text-red-400">{error}</p>}
      {next && (
        <button type="button" disabled={busy} onClick={more} className="btn btn-sm btn-secondary">
          {busy ? "Loading…" : "Show older"}
        </button>
      )}
    </div>
  );
}
