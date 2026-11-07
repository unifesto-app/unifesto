"use client";

import { useState } from "react";
import { announceToEvent } from "@/console/lib/api/campaigns-api";
import { Button } from "@/console/components/ui/button";
import { Input } from "@/console/components/ui/input";
import { Label } from "@/console/components/ui/label";
import { Textarea } from "@/console/components/ui/textarea";
import { ErrorNotice } from "@/console/components/shared/ErrorNotice";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/console/components/ui/dialog";

/** The message as email HTML: escaped, one paragraph per blank-line block. */
function asEmailHtml(text: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return text
    .split(/\n{2,}/)
    .map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/** An event campaign (C17): a push with its in-app copy to every attendee, and an email if asked. */
export function AnnounceDialog({
  eventId,
  open,
  onOpenChange,
}: {
  eventId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [alsoEmail, setAlsoEmail] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState<"sent" | "held" | null>(null);

  const close = (next: boolean) => {
    if (sending) return;
    if (!next) {
      setTitle("");
      setBody("");
      setAlsoEmail(false);
      setError("");
      setSent(null);
    }
    onOpenChange(next);
  };

  const send = async () => {
    if (!window.confirm("Send this to every attendee now? It can't be recalled.")) return;
    setSending(true);
    setError("");
    const { data, error } = await announceToEvent(eventId, {
      channels: alsoEmail ? ["push", "email"] : ["push"],
      audience: { type: "event", eventId },
      push: { title: title.trim(), body: body.trim(), deepLink: `unifesto://event/${eventId}` },
      ...(alsoEmail ? { email: { subject: title.trim(), html: asEmailHtml(body.trim()) } } : {}),
    });
    setSending(false);
    if (error || !data) setError(error?.message ?? "It didn't send.");
    else if (data.status === "FAILED") setError(data.error ?? "It didn't send.");
    else setSent(data.status === "HELD" ? "held" : "sent");
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Announce to attendees</DialogTitle>
          <DialogDescription>
            A notification to everyone registered, and in their app inbox. Up
            to 3 per event per day.
          </DialogDescription>
        </DialogHeader>

        {sent === "held" ? (
          <p className="text-sm text-foreground">
            Unifesto is checking it before it goes out. Nothing has been sent yet.
          </p>
        ) : sent ? (
          <p className="text-sm text-foreground">
            Sent. Attendees will get it in the next minute or so.
          </p>
        ) : (
          <div className="space-y-4">
            {error && <ErrorNotice message={error} />}
            <div className="space-y-1.5">
              <Label htmlFor="announce-title">Title</Label>
              <Input
                id="announce-title"
                value={title}
                maxLength={255}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Doors open at 9:30"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="announce-body">Message</Label>
              <Textarea
                id="announce-body"
                value={body}
                maxLength={2000}
                rows={4}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Bring your ticket QR. Entry is through Gate 2."
              />
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={alsoEmail}
                onChange={(e) => setAlsoEmail(e.target.checked)}
                className="h-4 w-4 rounded border-border accent-primary"
              />
              Also email it
            </label>
          </div>
        )}

        <DialogFooter>
          {sent ? (
            <Button onClick={() => close(false)}>Done</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => close(false)} disabled={sending}>
                Cancel
              </Button>
              <Button
                onClick={send}
                disabled={sending || !title.trim() || !body.trim()}
              >
                {sending ? "Sending…" : "Send"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
