"use client";

import { useEffect, useState } from "react";
import { Sparkle } from "@unifesto/unicon/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { draftReply, getCaseFacts, summariseCase, type DraftResult } from "@/lib/api/support-api";

const DRAFT_FAILED: Record<Extract<DraftResult, { ok: false }>["reason"], string> = {
  disabled: "Assist drafts are off right now.",
  capped: "You have used today's Assist drafts.",
  refused: "Assist could not draft this one. Write the reply yourself.",
  error: "Assist could not draft this one. Write the reply yourself.",
};

interface AssistCopilotProps {
  ticketId: string;
  /** Changes when the thread does, so the summary catches up. */
  lastMessageAt: string;
  /** The viewer works the case now (can reply), so drafting makes sense. */
  canDraft: boolean;
  onDraft: (text: string) => void;
}

/**
 * D15 desk copilot: thread summary, booking facts computed by code, and a
 * "Draft reply" that fills the composer. Staff edit and send; Assist never does.
 */
export function AssistCopilot({ ticketId, lastMessageAt, canDraft, onDraft }: AssistCopilotProps) {
  const [summary, setSummary] = useState<string | null>(null);
  const [facts, setFacts] = useState<string[]>([]);
  const [drafting, setDrafting] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    summariseCase(ticketId).then(({ data }) => live && setSummary(data?.summary ?? null));
    getCaseFacts(ticketId).then(({ data }) => live && setFacts(data?.facts ?? []));
    return () => {
      live = false;
    };
  }, [ticketId, lastMessageAt]);

  const draft = async () => {
    setDrafting(true);
    setNote(null);
    const { data, error } = await draftReply(ticketId);
    setDrafting(false);
    if (!data) return setNote(error?.message || DRAFT_FAILED.error);
    setFacts(data.facts);
    if (data.ok) onDraft(data.draft);
    else setNote(DRAFT_FAILED[data.reason]);
  };

  if (!summary && !facts.length && !canDraft) return null;
  return (
    <Card className="h-fit">
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkle className="h-4 w-4 text-primary" weight="fill" /> Assist
        </CardTitle>
        {canDraft && (
          <Button size="sm" variant="outline" onClick={draft} disabled={drafting}>
            {drafting ? "Drafting…" : "Draft reply"}
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {note && <p className="text-muted-foreground">{note}</p>}
        {summary && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Summary</p>
            <p>{summary}</p>
          </div>
        )}
        {facts.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Booking facts</p>
            <ul className="space-y-1">
              {facts.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </div>
        )}
        {canDraft && (
          <p className="text-xs text-muted-foreground">
            Drafts are suggestions. Check them against the facts before you send.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
