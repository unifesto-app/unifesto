"use client";

import { useState } from "react";
import Link from "next/link";
import { Sparkle, X } from "@unifesto/unicon/react";
import {
  createAgenda,
  createFaq,
  draftEventContent,
  type EventDraft,
  type EventDraftResult,
} from "@/console/lib/api/events-api";
import { toIso, toLocalDatetime } from "@/console/lib/constants/event-form";
import { Button } from "@/console/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/console/components/ui/card";
import { Input } from "@/console/components/ui/input";
import { Label } from "@/console/components/ui/label";
import { Textarea } from "@/console/components/ui/textarea";

const FAILED: Record<Extract<EventDraftResult, { ok: false }>["reason"], string> = {
  disabled: "AI drafts are off right now.",
  capped: "You have used today's AI drafts. Try again tomorrow.",
  refused: "AI could not draft from that. Try different notes.",
  error: "AI could not draft this one. Try again, or write it yourself.",
  empty: "There wasn't enough about an event to draft from. Add a few more details.",
};

interface AgendaRow {
  title: string;
  detail: string;
  /** datetime-local values, browser time. */
  start: string;
  end: string;
}
type FaqRow = EventDraft["faqs"][number];

/** A draft time ("HH:MM" IST on event day N) as a datetime-local value. */
function slot(eventStart: string, day: number, hhmm: string): string {
  const firstDay = new Date(eventStart).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const d = new Date(`${firstDay}T${hhmm}:00+05:30`);
  d.setUTCDate(d.getUTCDate() + day - 1);
  return toLocalDatetime(d.toISOString());
}

const plusHour = (local: string) =>
  toLocalDatetime(new Date(new Date(local).getTime() + 3_600_000).toISOString());

/**
 * The agenda model needs real start and end times, so untimed draft items get
 * a guess (the previous item's end; an hour long) for the curator to fix.
 */
function toRows(agenda: EventDraft["agenda"], eventStart: string): AgendaRow[] {
  const starts = agenda.map((a) => (a.start ? slot(eventStart, a.day, a.start) : ""));
  let prev = toLocalDatetime(eventStart);
  return agenda.map((a, i) => {
    const start = starts[i] || prev;
    const next = starts[i + 1];
    const end = a.end ? slot(eventStart, a.day, a.end) : next && next > start ? next : plusHour(start);
    prev = end;
    return { title: a.title, detail: a.detail ?? "", start, end };
  });
}

interface AiDraftPanelProps {
  eventId: string;
  eventStart: string;
  /** Existing counts, so applied items go after what's there. */
  agendaCount: number;
  faqCount: number;
  onUseDescription: (text: string) => void;
  onClose: () => void;
}

/**
 * M1: drafts description, agenda and FAQs from notes or a link. Everything is
 * an editable suggestion (D7); each section is applied only on its own click.
 */
export function AiDraftPanel({
  eventId,
  eventStart,
  agendaCount,
  faqCount,
  onUseDescription,
  onClose,
}: AiDraftPanelProps) {
  const [notes, setNotes] = useState("");
  const [url, setUrl] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [description, setDescription] = useState<string | null>(null);
  const [agenda, setAgenda] = useState<AgendaRow[]>([]);
  const [faqs, setFaqs] = useState<FaqRow[]>([]);
  const [applied, setApplied] = useState({ description: false, agenda: 0, faqs: 0 });
  const [applying, setApplying] = useState<"agenda" | "faqs" | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);

  const draft = async () => {
    setDrafting(true);
    setNote(null);
    const { data, error } = await draftEventContent(eventId, {
      ...(notes.trim() ? { notes: notes.trim() } : {}),
      ...(url.trim() ? { url: url.trim() } : {}),
    });
    setDrafting(false);
    if (!data) return setNote(error?.message || FAILED.error);
    if (!data.ok) return setNote(FAILED[data.reason]);
    setDescription(data.draft.description || null);
    setAgenda(toRows(data.draft.agenda, eventStart));
    setFaqs(data.draft.faqs);
    setApplied({ description: false, agenda: 0, faqs: 0 });
    setApplyError(null);
  };

  const editAgenda = (i: number, patch: Partial<AgendaRow>) =>
    setAgenda((rows) => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const editFaq = (i: number, patch: Partial<FaqRow>) =>
    setFaqs((rows) => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  // One by one, dropping each row once saved, so a failure part-way leaves only the rest to retry.
  const applyAll = async <T,>(
    key: "agenda" | "faqs",
    rows: T[],
    setRows: (rows: T[]) => void,
    save: (row: T, order: number) => Promise<{ error: { message: string } | null }>,
    base: number
  ) => {
    setApplying(key);
    setApplyError(null);
    let done = applied[key];
    while (rows.length) {
      const { error } = await save(rows[0], base + done);
      if (error) {
        setApplyError(error.message);
        break;
      }
      rows = rows.slice(1);
      setRows(rows);
      done += 1;
      setApplied((a) => ({ ...a, [key]: done }));
    }
    setApplying(null);
  };

  const applyAgenda = () => {
    const bad = agenda.findIndex((r) => !r.title.trim() || !r.start || !r.end || r.end <= r.start);
    if (bad >= 0) return setApplyError(`Agenda item ${bad + 1} needs a title and an end after its start.`);
    void applyAll("agenda", agenda, setAgenda, (r, order) =>
      createAgenda(eventId, {
        title: r.title.trim(),
        ...(r.detail.trim() ? { description: r.detail.trim() } : {}),
        startTime: toIso(r.start),
        endTime: toIso(r.end),
        order,
      }), agendaCount);
  };

  const applyFaqs = () => {
    const bad = faqs.findIndex((f) => !f.question.trim() || !f.answer.trim());
    if (bad >= 0) return setApplyError(`FAQ ${bad + 1} needs a question and an answer.`);
    void applyAll("faqs", faqs, setFaqs, (f, order) =>
      createFaq(eventId, { question: f.question.trim(), answer: f.answer.trim(), order }), faqCount);
  };

  const hasDraft = description !== null || agenda.length > 0 || faqs.length > 0 || applied.agenda > 0 || applied.faqs > 0;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkle className="h-4 w-4 text-primary" weight="fill" /> Draft with AI
        </CardTitle>
        <Button type="button" size="icon" variant="ghost" onClick={onClose} aria-label="Close AI draft">
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-4 px-4 pb-4 text-sm">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ai-notes">A few lines about the event</Label>
            <Textarea
              id="ai-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Who it's for, what happens, timings, what to bring…"
              rows={4}
              maxLength={4000}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ai-url">Or a link to an existing event page</Label>
            <Input
              id="ai-url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://"
              maxLength={2000}
            />
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <Button type="button" onClick={draft} disabled={drafting || (!notes.trim() && !url.trim())}>
              {drafting ? "Drafting…" : hasDraft ? "Draft again" : "Draft"}
            </Button>
            <span className="text-xs text-muted-foreground">
              Nothing is saved until you apply it. Check every detail first.
            </span>
          </div>
          {note && <p className="text-muted-foreground">{note}</p>}
        </div>

        {applyError && <p className="text-destructive">{applyError}</p>}

        {description !== null && (
          <section className="space-y-2 border-t border-border pt-4">
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium">Description</p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  onUseDescription(description.trim());
                  setApplied((a) => ({ ...a, description: true }));
                }}
                disabled={!description.trim()}
              >
                {applied.description ? "Used" : "Use description"}
              </Button>
            </div>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={8} />
            {applied.description && (
              <p className="text-xs text-muted-foreground">Copied into the description field below. Save changes to keep it.</p>
            )}
          </section>
        )}

        {(agenda.length > 0 || applied.agenda > 0) && (
          <section className="space-y-4 border-t border-border pt-4">
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium">Agenda</p>
              {agenda.length > 0 && (
                <Button type="button" size="sm" variant="outline" onClick={applyAgenda} disabled={applying !== null}>
                  {applying === "agenda" ? "Adding…" : `Add ${agenda.length} to agenda`}
                </Button>
              )}
            </div>
            {agenda.map((r, i) => (
              <div key={i} className="space-y-2 rounded-lg bg-muted p-3">
                <div className="flex items-center gap-2">
                  <Input value={r.title} onChange={(e) => editAgenda(i, { title: e.target.value })} aria-label="Agenda title" />
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() => setAgenda((rows) => rows.filter((_, j) => j !== i))}
                    aria-label="Remove agenda item"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <Input
                  value={r.detail}
                  onChange={(e) => editAgenda(i, { detail: e.target.value })}
                  placeholder="Detail (optional)"
                  aria-label="Agenda detail"
                />
                <div className="grid gap-2 sm:grid-cols-2">
                  <Input type="datetime-local" value={r.start} onChange={(e) => editAgenda(i, { start: e.target.value })} aria-label="Starts" />
                  <Input type="datetime-local" value={r.end} onChange={(e) => editAgenda(i, { end: e.target.value })} aria-label="Ends" />
                </div>
              </div>
            ))}
            {agenda.length > 0 && (
              <p className="text-xs text-muted-foreground">Times the source didn&apos;t give are guesses. Check them before adding.</p>
            )}
            {applied.agenda > 0 && (
              <p className="text-xs text-muted-foreground">
                Added {applied.agenda} to the agenda.{" "}
                <Link href={`/console/events/${eventId}/content`} className="text-primary hover:underline">
                  Edit in Content
                </Link>
              </p>
            )}
          </section>
        )}

        {(faqs.length > 0 || applied.faqs > 0) && (
          <section className="space-y-4 border-t border-border pt-4">
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium">FAQs</p>
              {faqs.length > 0 && (
                <Button type="button" size="sm" variant="outline" onClick={applyFaqs} disabled={applying !== null}>
                  {applying === "faqs" ? "Adding…" : `Add ${faqs.length} FAQs`}
                </Button>
              )}
            </div>
            {faqs.map((f, i) => (
              <div key={i} className="space-y-2 rounded-lg bg-muted p-3">
                <div className="flex items-center gap-2">
                  <Input value={f.question} onChange={(e) => editFaq(i, { question: e.target.value })} aria-label="Question" />
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() => setFaqs((rows) => rows.filter((_, j) => j !== i))}
                    aria-label="Remove FAQ"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <Textarea value={f.answer} onChange={(e) => editFaq(i, { answer: e.target.value })} rows={2} aria-label="Answer" />
              </div>
            ))}
            {applied.faqs > 0 && (
              <p className="text-xs text-muted-foreground">
                Added {applied.faqs} FAQs.{" "}
                <Link href={`/console/events/${eventId}/content`} className="text-primary hover:underline">
                  Edit in Content
                </Link>
              </p>
            )}
          </section>
        )}
      </CardContent>
    </Card>
  );
}
