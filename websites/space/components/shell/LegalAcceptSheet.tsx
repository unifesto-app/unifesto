"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { call } from "@/lib/api/call";

type Pending = { slug: string; version: number; title: string; summary: string | null };

/**
 * I2: blocks the console until the signed-in user accepts every legal document
 * with a new version that needs their consent. Checked once per load, so on
 * sign-in and on every fresh visit. The only way past it is to agree or sign out.
 */
export function LegalAcceptSheet({ onSignOut }: { onSignOut: () => void }) {
  const [pending, setPending] = useState<Pending[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    call<Pending[]>("/legal/pending").then((r) => r.ok && setPending(r.data));
  }, []);

  const agree = async () => {
    setBusy(true);
    setError(null);
    for (const d of pending) {
      const r = await call(`/legal/${d.slug}/accept`, {
        method: "POST",
        body: JSON.stringify({ version: d.version, client: "space" }),
      });
      if (!r.ok) {
        setError(r.message);
        setBusy(false);
        return;
      }
    }
    setPending([]);
    setBusy(false);
  };

  return (
    <Dialog open={pending.length > 0}>
      <DialogContent
        className="[&>button:last-child]:hidden"
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>We have updated our terms</DialogTitle>
          <DialogDescription>Please read what changed and agree to continue.</DialogDescription>
        </DialogHeader>
        <ul className="space-y-4">
          {pending.map((d) => (
            <li key={d.slug} className="text-sm">
              <p className="font-medium text-foreground">{d.title}</p>
              {d.summary ? <p className="mt-1 text-muted-foreground">{d.summary}</p> : null}
              <a
                href={`https://unifesto.app/${d.slug}`}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-block underline"
              >
                Read the full text
              </a>
            </li>
          ))}
        </ul>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onSignOut} disabled={busy}>
            Sign out
          </Button>
          <Button onClick={agree} disabled={busy}>
            {busy ? "Saving…" : "I agree"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
