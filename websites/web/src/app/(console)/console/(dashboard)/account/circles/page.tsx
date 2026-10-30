"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getMySpaceRequests, leaveSpace, type MySpace, type SpaceRequest } from "@/lib/api/account";
import { useWebSession } from "@/lib/auth";
import { IST } from "@/lib/site";
import { useAccount } from "../AccountShell";

const REQUEST_STATUS = {
  PENDING: { label: "In review", className: "text-paper/70" },
  APPROVED: { label: "Approved", className: "text-primary" },
  REJECTED: { label: "Not approved", className: "text-red-400" },
} as const;

/**
 * The app's My circles: spaces I help run (to the console) and spaces I
 * joined (with Leave), then the spaces I asked Unifesto to set up.
 */
export default function CirclesPage() {
  const { session } = useWebSession();
  const token = session?.token ?? "";
  const { spaces, setSpaces } = useAccount();
  const [requests, setRequests] = useState<SpaceRequest[]>([]);
  const [sure, setSure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (token) getMySpaceRequests(token).then(setRequests, () => undefined);
  }, [token]);

  // The API sends one row per role: keep one per space, a running role over MEMBER.
  const one = new Map<string, MySpace>();
  for (const s of spaces) if (!one.has(s.id) || one.get(s.id)!.userRole.code === "MEMBER") one.set(s.id, s);
  const run = [...one.values()].filter((s) => s.userRole.code !== "MEMBER");
  const joined = [...one.values()].filter((s) => s.userRole.code === "MEMBER");

  const leave = async (id: string) => {
    setBusy(true);
    setError("");
    try {
      await leaveSpace(token, id);
      setSpaces(spaces.filter((s) => s.id !== id));
      setSure(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't leave this space.");
    } finally {
      setBusy(false);
    }
  };

  const row = (s: MySpace, actions: React.ReactNode) => (
    <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
      <div className="flex min-w-0 items-center gap-3">
        {s.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={s.logo_url} alt="" className="h-10 w-10 shrink-0 rounded-xl object-cover" />
        ) : (
          <div aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-night-3 font-semibold text-paper">
            {s.name.slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <Link href={`/space/${s.slug}`} className="block truncate font-semibold text-paper hover:underline">
            {s.name}
          </Link>
          <p className="mt-0.5 text-xs text-paper/60">{[s.userRole.code === "MEMBER" ? "Member" : s.userRole.name, s.city].filter(Boolean).join(" · ")}</p>
        </div>
      </div>
      <div className="flex gap-4 text-sm">{actions}</div>
    </li>
  );

  return (
    <div className="space-y-10">
      {!run.length && !joined.length && (
        <p className="text-paper/75">
          No circles yet. Join a club or community from its page on{" "}
          <Link href="/spaces" className="underline">
            Spaces
          </Link>
          .
        </p>
      )}

      {run.length > 0 && (
        <section>
          <h2 className="text-sm font-medium text-paper/75">Spaces I run</h2>
          <ul className="mt-1 divide-y divide-white/[0.06]">
            {run.map((s) =>
              row(
                s,
                <a href={`/console?space=${s.id}`} className="font-medium text-primary hover:underline">
                  Open console
                </a>,
              ),
            )}
          </ul>
        </section>
      )}

      {joined.length > 0 && (
        <section>
          <h2 className="text-sm font-medium text-paper/75">Spaces I&apos;m in</h2>
          <ul className="mt-1 divide-y divide-white/[0.06]">
            {joined.map((s) =>
              row(
                s,
                sure === s.id ? (
                  <>
                    <button type="button" disabled={busy} onClick={() => leave(s.id)} className="font-medium text-red-400 hover:underline">
                      {busy ? "Leaving…" : "Yes, leave"}
                    </button>
                    <button type="button" onClick={() => setSure(null)} className="text-paper/70 hover:underline">
                      Cancel
                    </button>
                  </>
                ) : (
                  <button type="button" onClick={() => setSure(s.id)} className="text-paper/70 hover:text-paper hover:underline">
                    Leave
                  </button>
                ),
              ),
            )}
          </ul>
        </section>
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}

      <section>
        <h2 className="text-sm font-medium text-paper/75">My space requests</h2>
        {requests.length > 0 && (
          <ul className="mt-1 divide-y divide-white/[0.06]">
            {requests.map((r) => (
              <li key={r.id} className="py-4">
                <p className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-semibold text-paper">{r.name}</span>
                  <span className={`text-sm font-medium ${REQUEST_STATUS[r.status]?.className ?? "text-paper/70"}`}>
                    {REQUEST_STATUS[r.status]?.label ?? r.status}
                  </span>
                </p>
                <p className="mt-0.5 text-xs text-paper/60">
                  Sent {new Date(r.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: IST })}
                </p>
                {r.reviewNote && <p className="mt-2 text-sm text-paper/75">{r.reviewNote}</p>}
              </li>
            ))}
          </ul>
        )}
        <Link href="/request-space" className="btn btn-sm btn-secondary mt-3">
          {run.length ? "Request another space" : "Request a space"}
        </Link>
      </section>
    </div>
  );
}
