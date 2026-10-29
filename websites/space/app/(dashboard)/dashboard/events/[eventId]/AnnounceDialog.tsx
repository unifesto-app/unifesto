"use client";

import { useState } from "react";
import { announceToAttendees } from "@/console/lib/api/events-api";
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

/** Push notification to every attendee of the event. */
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
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  const close = (next: boolean) => {
    if (sending) return;
    if (!next) {
      setTitle("");
      setBody("");
      setError("");
      setSent(false);
    }
    onOpenChange(next);
  };

  const send = async () => {
    if (!window.confirm("Send this to every attendee now? It can't be recalled.")) return;
    setSending(true);
    setError("");
    const { error } = await announceToAttendees(eventId, {
      title: title.trim(),
      body: body.trim(),
    });
    setSending(false);
    if (error) setError(error.message);
    else setSent(true);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Announce to attendees</DialogTitle>
          <DialogDescription>
            Sends a push notification to everyone registered. Up to 3 per event
            per day.
          </DialogDescription>
        </DialogHeader>

        {sent ? (
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
