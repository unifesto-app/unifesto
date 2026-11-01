"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { browserSupportsWebAuthn, WebAuthnError } from "@simplewebauthn/browser";
import { LockKey } from "@unifesto/unicon/react";
import { addPasskey, cancelled, getPasskeys, removePasskey, type Passkey } from "@/lib/api/passkeys";
import { useWebSession } from "@/lib/auth";
import { Button } from "@/console/components/ui/button";

const noop = () => () => {};
const day = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

/** Security › Passkeys: the ones on my account, adding one from this browser, removing one. */
export default function Passkeys() {
  const { session } = useWebSession();
  const token = session?.token ?? "";
  const [list, setList] = useState<Passkey[] | null>(null);
  const supported = useSyncExternalStore(noop, browserSupportsWebAuthn, () => true);
  const [busy, setBusy] = useState(false);
  const [sure, setSure] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = () => getPasskeys(token).then(setList, (e) => setError(e.message));
  useEffect(() => {
    if (token) void load();
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      setSure(null);
      await load();
    } catch (e) {
      if (e instanceof WebAuthnError && e.code === "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED") {
        setError("This device already has a passkey for my account.");
      } else if (!cancelled(e)) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {!list ? (
        <p className={`text-sm ${error ? "text-destructive" : "text-muted-foreground"}`}>{error || "Loading…"}</p>
      ) : list.length ? (
        <ul className="-my-4 divide-y divide-border">
          {list.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-4 py-4">
              <div className="flex min-w-0 items-center gap-3">
                <LockKey className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{p.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Added {day(p.createdAt)}
                    {p.lastUsedAt && ` · Last used ${day(p.lastUsedAt)}`}
                  </p>
                </div>
              </div>
              {sure === p.id ? (
                <Button type="button" variant="destructive" size="sm" disabled={busy} onClick={() => act(() => removePasskey(token, p.id))}>
                  {busy ? "Removing…" : "Yes, remove"}
                </Button>
              ) : (
                <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => setSure(p.id)}>
                  Remove
                </Button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No passkeys yet.</p>
      )}
      <div className="space-y-4 pt-4">
        {list && error && <p className="text-sm text-destructive">{error}</p>}
        {supported ? (
          <Button type="button" variant="outline" size="sm" disabled={busy || !list} onClick={() => act(() => addPasskey(token))}>
            {busy && !sure ? "Adding…" : "Add a passkey"}
          </Button>
        ) : (
          <p className="text-xs text-muted-foreground">This browser can&apos;t make passkeys.</p>
        )}
      </div>
    </>
  );
}
