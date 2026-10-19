"use client";

import { useEffect, useState } from "react";
import { PaperPlaneRight } from "@unifesto/unicon/react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils/cn";
import type { CannedReply, SupportMessage } from "@/lib/api/support-api";

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

function authorName(m: SupportMessage) {
  return (
    m.author?.fullName ||
    m.author?.username ||
    (m.isStaffReply ? "Support" : "You")
  );
}

interface TicketThreadProps {
  messages: SupportMessage[];
  /**
   * Which side of the conversation the viewer is on. Staff-authored messages
   * are aligned right for admins; the requester's own messages are aligned
   * right for organisers/attendees.
   */
  viewerIsStaff: boolean;
  /** `aiDrafted`: the reply started from an Assist draft (D15). */
  onReply: (body: string, aiDrafted: boolean) => Promise<void>;
  /** Desk only: adds an "Internal note" mode to the composer. */
  onNote?: (body: string) => Promise<void>;
  /** Disable the composer (e.g. a closed ticket). */
  disabled?: boolean;
  disabledHint?: string;
  /** D15: an Assist draft to put in the composer; a new `n` replaces the text. */
  draft?: { text: string; n: number };
  /** D19: the desk's saved replies, offered above the composer. */
  cannedReplies?: CannedReply[];
}

/** The message thread + reply composer, shared by both Apex support surfaces. */
export function TicketThread({
  messages,
  viewerIsStaff,
  onReply,
  onNote,
  disabled = false,
  disabledHint,
  draft,
  cannedReplies,
}: TicketThreadProps) {
  const [body, setBody] = useState("");
  // Whether the composer holds (an edit of) an Assist draft.
  const [fromDraft, setFromDraft] = useState(false);

  useEffect(() => {
    if (!draft) return;
    setBody(draft.text);
    setFromDraft(true);
  }, [draft]);
  const [sending, setSending] = useState(false);
  const [noting, setNoting] = useState(false);
  const asNote = noting && !!onNote;

  const send = async () => {
    const text = body.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      await (asNote && onNote ? onNote(text) : onReply(text, fromDraft));
      setBody("");
      setFromDraft(false);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-3">
        {messages.map((m) => {
          const mine = m.isStaffReply === viewerIsStaff;
          return (
            <li
              key={m.id}
              className={cn("flex flex-col gap-1", mine ? "items-end" : "items-start")}
            >
              <div
                className={cn(
                  "max-w-[85%] rounded-lg px-3.5 py-2.5 text-sm whitespace-pre-wrap break-words",
                  m.internal
                    ? "border border-dashed border-warning/40 bg-warning-soft text-foreground"
                    : mine
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground"
                )}
              >
                {m.body}
              </div>
              <span className="px-1 text-xs text-muted-foreground">
                {authorName(m)}
                {m.aiDrafted ? " · Drafted with Assist" : ""}
                {m.internal ? " · Internal note" : m.isStaffReply ? " · Support" : ""} ·{" "}
                {formatTime(m.createdAt)}
              </span>
            </li>
          );
        })}
      </ul>

      {disabled ? (
        <p className="rounded-md border border-border bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground">
          {disabledHint ?? "This conversation is closed."}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {!!cannedReplies?.length && (
            <Select
              value=""
              onValueChange={(id) => {
                const reply = cannedReplies.find((r) => r.id === id);
                if (reply) setBody((b) => (b.trim() ? `${b.trimEnd()}\n\n${reply.body}` : reply.body));
              }}
            >
              <SelectTrigger className="w-full sm:w-64" aria-label="Insert a saved reply">
                <SelectValue placeholder="Insert a saved reply" />
              </SelectTrigger>
              <SelectContent>
                {cannedReplies.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {onNote && (
            <div className="flex gap-1" role="group" aria-label="Message type">
              {[
                { note: false, label: "Reply" },
                { note: true, label: "Internal note" },
              ].map((o) => (
                <Button
                  key={o.label}
                  size="sm"
                  variant={noting === o.note ? "secondary" : "ghost"}
                  aria-pressed={noting === o.note}
                  onClick={() => setNoting(o.note)}
                >
                  {o.label}
                </Button>
              ))}
            </div>
          )}
          <Textarea
            value={body}
            onChange={(e) => {
              setBody(e.target.value);
              if (!e.target.value.trim()) setFromDraft(false);
            }}
            placeholder={asNote ? "Write a note for your team…" : "Write a reply…"}
            rows={3}
            aria-label={asNote ? "Internal note" : "Reply to ticket"}
            className={asNote ? "border-dashed border-warning/60 bg-warning-soft" : undefined}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") send();
            }}
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {asNote ? "Only your team sees notes. " : ""}⌘/Ctrl + Enter to send
            </span>
            <Button size="sm" onClick={send} disabled={!body.trim() || sending}>
              <PaperPlaneRight className="h-4 w-4" weight="fill" />
              {sending ? "Sending…" : asNote ? "Add note" : "Send reply"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function statusBadgeVariant(
  status: string
): "success" | "warning" | "destructive" | "neutral" {
  switch (status) {
    case "RESOLVED":
      return "success";
    case "OPEN":
      return "warning";
    case "PENDING":
      return "neutral";
    case "CLOSED":
      return "destructive";
    default:
      return "neutral";
  }
}

export function priorityBadgeVariant(
  priority: string
): "brand" | "warning" | "destructive" | "neutral" {
  switch (priority) {
    case "URGENT":
      return "destructive";
    case "HIGH":
      return "warning";
    case "NORMAL":
      return "neutral";
    case "LOW":
      return "neutral";
    default:
      return "neutral";
  }
}
