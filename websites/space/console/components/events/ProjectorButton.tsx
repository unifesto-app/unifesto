"use client";

import { useState } from "react";
import { Copy, Desktop } from "@unifesto/unicon/react";
import { call } from "@/console/lib/api/call";
import { Button } from "@/console/components/ui/button";
import { Input } from "@/console/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/console/components/ui/dialog";

/**
 * L4: open the projector view, or hand the venue laptop a display link that
 * needs no login. Making a new link turns the old one off on every screen.
 */
export function ProjectorButton({ eventId }: { eventId: string }) {
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const path = `/present/${eventId}`;
  const link = token && typeof window !== "undefined" ? `${window.location.origin}${path}#k=${token}` : "";

  const fetchToken = async (regenerate: boolean) => {
    setBusy(true);
    setError("");
    const res = await call<{ token: string }>(`/events/${eventId}/projector/link`, regenerate ? { method: "POST" } : {});
    setBusy(false);
    if (res.ok) setToken(res.data.token);
    else setError(res.message);
  };

  const openDialog = () => {
    setOpen(true);
    setCopied(false);
    if (!token) void fetchToken(false);
  };

  const regenerate = () => {
    if (window.confirm("Make a new display link? Screens using the current one stop updating right away.")) {
      setCopied(false);
      void fetchToken(true);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setError("Couldn’t copy. Select the link and copy it yourself.");
    }
  };

  return (
    <>
      <Button variant="outline" onClick={openDialog}>
        <Desktop className="size-4" />
        Projector view
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Projector view</DialogTitle>
            <DialogDescription>
              A full-screen display for the venue screen. It shows whatever you launch last: poll results, the Q&amp;A wall or the quiz. Press F for full screen and 1, 2 or 3 to hold one view.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">Display link</p>
            <p className="text-sm text-muted-foreground">
              Open this on the venue laptop, no login needed. It can only watch, and it never shows attendee contact details.
            </p>
            <div className="flex gap-2">
              <Input readOnly value={busy && !link ? "Loading…" : link} onFocus={(e) => e.currentTarget.select()} aria-label="Display link" />
              <Button variant="outline" onClick={copy} disabled={!link}>
                <Copy className="size-4" />
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button variant="link" className="h-auto px-0" onClick={regenerate} disabled={busy || !token}>
              Make a new link and turn this one off
            </Button>
          </div>
          <DialogFooter>
            <Button asChild>
              <a href={path} target="_blank" rel="noopener">
                Open projector view
              </a>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
