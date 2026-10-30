"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/console/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/console/components/ui/dialog";

/**
 * The one confirm step for actions that can't be taken back.
 *
 *   if (!(await confirmDialog({ title: "Cancel this payout?", destructive: true }))) return;
 *
 * `load` runs when the dialog opens (a server audience count, say); confirm
 * stays disabled until it lands, and an error keeps it disabled. `test` adds a
 * side button such as "Send a test to me" that reports back inline.
 * Needs <ConfirmDialogHost /> mounted once (the dashboard layout does it).
 */
export interface ConfirmOptions {
  title: string;
  description?: ReactNode;
  load?: () => Promise<ReactNode>;
  confirmLabel?: string;
  destructive?: boolean;
  test?: { label: string; run: () => Promise<string> };
}

type Request = ConfirmOptions & { resolve: (ok: boolean) => void };

let open: ((req: Request) => void) | null = null;

export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    if (open) open({ ...options, resolve });
    // Host not mounted: fall back to the browser so nothing fires unconfirmed.
    else resolve(window.confirm(options.title));
  });
}

export function ConfirmDialogHost() {
  const [req, setReq] = useState<Request | null>(null);
  const [loaded, setLoaded] = useState<{ node?: ReactNode; error?: string } | null>(null);
  const [testState, setTestState] = useState<{ busy?: boolean; note?: string }>({});
  // Drops a slow load that lands after its dialog was replaced.
  const seq = useRef(0);

  useEffect(() => {
    open = (next) => {
      const id = ++seq.current;
      setReq(next);
      setLoaded(null);
      setTestState({});
      next
        .load?.()
        .then((node) => id === seq.current && setLoaded({ node }))
        .catch(
          (e: unknown) =>
            id === seq.current &&
            setLoaded({ error: e instanceof Error ? e.message : "Couldn't load this." })
        );
    };
    return () => {
      open = null;
    };
  }, []);

  const close = (ok: boolean) => {
    req?.resolve(ok);
    setReq(null);
  };

  const waiting = !!req?.load && !loaded?.node && !loaded?.error;
  const blocked = waiting || !!loaded?.error;

  const runTest = async () => {
    if (!req?.test) return;
    setTestState({ busy: true });
    try {
      setTestState({ note: await req.test.run() });
    } catch (e) {
      setTestState({ note: e instanceof Error ? e.message : "The test didn't send." });
    }
  };

  return (
    <Dialog open={!!req} onOpenChange={(o) => !o && close(false)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{req?.title}</DialogTitle>
          {req?.description ? (
            <DialogDescription asChild>
              <div className="space-y-2">{req.description}</div>
            </DialogDescription>
          ) : null}
        </DialogHeader>

        {req?.load ? (
          <div className="text-sm">
            {loaded?.error ? (
              <span className="text-destructive">{loaded.error}</span>
            ) : waiting ? (
              <span className="text-muted-foreground">Counting…</span>
            ) : (
              loaded?.node
            )}
          </div>
        ) : null}

        {testState.note ? (
          <p className="text-xs text-muted-foreground">{testState.note}</p>
        ) : null}

        <DialogFooter className="gap-2 sm:gap-0">
          {req?.test ? (
            <Button
              variant="ghost"
              className="sm:mr-auto"
              disabled={testState.busy}
              onClick={runTest}
            >
              {testState.busy ? "Sending…" : req.test.label}
            </Button>
          ) : null}
          <Button variant="outline" onClick={() => close(false)}>
            Cancel
          </Button>
          <Button
            variant={req?.destructive ? "destructive" : "default"}
            disabled={blocked}
            onClick={() => close(true)}
          >
            {req?.confirmLabel ?? "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * `load` for a bulk send: the server's own recipient count, as "Goes to 1,204
 * people right now." Nobody, or a failed count, throws so confirm stays off.
 */
export async function audienceLine(
  call: Promise<{
    data: { recipientCount: number } | null;
    error: { message: string } | null;
  }>,
  verb = "Goes to"
): Promise<ReactNode> {
  const { data, error } = await call;
  if (error || !data) throw new Error(error?.message ?? "Couldn't count the audience.");
  const n = data.recipientCount;
  if (n === 0) throw new Error("Nobody in this audience can receive it right now.");
  return (
    <>
      {verb} <strong className="text-foreground">{n.toLocaleString("en-IN")}</strong>{" "}
      {n === 1 ? "person" : "people"} right now.
    </>
  );
}
