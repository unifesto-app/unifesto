"use client";

import { useState } from "react";
import { PaperPlaneRight } from "@unifesto/unicon/react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils/cn";
import type { SupportMessage } from "@/lib/api/support-api";

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

function authorName(m: SupportMessage) {
  if (m.side === "ASSISTANT") return "Assist bot";
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
  /** Resolve `false` when the send failed, so the draft is kept. */
  onReply: (body: string) => Promise<boolean | void>;
  /** Disable the composer (e.g. a closed ticket). */
  disabled?: boolean;
  disabledHint?: string;
}

/** The message thread + reply composer, shared by both Apex support surfaces. */
export function TicketThread({
  messages,
  viewerIsStaff,
  onReply,
  disabled = false,
  disabledHint,
}: TicketThreadProps) {
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  const send = async () => {
    const text = body.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      if ((await onReply(text)) !== false) setBody("");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-3">
        {messages.map((m) => {
          // Actions (refund approved, request accepted…) read as a timeline line.
          if (m.side === "SYSTEM") {
            return (
              <li key={m.id} className="text-center text-xs text-muted-foreground">
                {m.body} · {formatTime(m.createdAt)}
              </li>
            );
          }
          const staffSide = m.side ? m.side !== "REQUESTER" : m.isStaffReply;
          const mine = staffSide === viewerIsStaff;
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
                {m.internal ? " · Internal note" : staffSide ? " · Support" : ""} · {formatTime(m.createdAt)}
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
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write a reply…"
            rows={3}
            aria-label="Reply to ticket"
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") send();
            }}
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              ⌘/Ctrl + Enter to send
            </span>
            <Button size="sm" onClick={send} disabled={!body.trim() || sending}>
              <PaperPlaneRight className="h-4 w-4" weight="fill" />
              {sending ? "Sending…" : "Send reply"}
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
    case "BOT":
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
