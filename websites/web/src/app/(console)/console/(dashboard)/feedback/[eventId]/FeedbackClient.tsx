"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { SignInPrompt } from "@/console/components/shared/SignInPrompt";
import { FIELD, Question } from "@/components/FormQuestion";
import { visibleFieldIds, type FormField } from "@/lib/api/registration";
import { getFeedback, submitFeedback, type Answers, type FeedbackForm } from "@/lib/api/tickets";
import { useWebSession } from "@/lib/auth";
import { TicketsFrame, when } from "../../tickets/TicketsClient";

/** The app's F1 feedback: a 1 to 5 rating, 0 to 10 recommend, a comment and the organiser's questions. */
export default function FeedbackClient({ eventId }: { eventId: string }) {
  const { session, ready } = useWebSession();
  const token = session?.token ?? "";
  const [form, setForm] = useState<FeedbackForm | null>(null);
  const [rating, setRating] = useState<number | null>(null);
  const [nps, setNps] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [answers, setAnswers] = useState<Answers>({});
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) return;
    getFeedback(token, eventId).then(
      (f) => {
        setForm(f);
        if (f.response) {
          setRating(f.response.rating);
          setNps(f.response.nps);
          setComment(f.response.comment ?? "");
          setAnswers(f.response.answers ?? {});
        }
      },
      (e) => setError(e.message),
    );
  }, [token, eventId]);

  if (!ready) return <TicketsFrame title="Feedback">{null}</TicketsFrame>;
  if (!session)
    return (
      <TicketsFrame title="Feedback">
        <SignInPrompt />
      </TicketsFrame>
    );
  if (!form) return <TicketsFrame title="Feedback">{error ? <p className="text-sm text-red-400">{error}</p> : <p className="text-paper/65">Loading…</p>}</TicketsFrame>;

  const questions: FormField[] = form.questions.map((q) => ({ ...q, ticketTypeId: null, perGroup: false })).sort((a, b) => a.order - b.order);
  const visible = visibleFieldIds(questions, answers);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (!rating) return setError("Pick a rating from 1 to 5.");
    setBusy(true);
    setError("");
    try {
      await submitFeedback(token, eventId, { rating, nps, comment: comment.trim() || undefined, answers });
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send it.");
    } finally {
      setBusy(false);
    }
  };

  let body;
  if (!form.enabled) body = <p className="text-paper/75">This event isn&apos;t collecting feedback.</p>;
  else if (sent)
    body = (
      <p className="text-paper/85">
        Thanks, the organiser gets it.{" "}
        {form.unlocksCertificate && (
          <Link href="/console/account/certificates" className="font-medium text-primary hover:underline">
            My certificate is ready
          </Link>
        )}
      </p>
    );
  else if (!form.open && !form.response) body = <p className="text-paper/75">Feedback opens once the event starts, for people who attended, and closes a week after it ends.</p>;
  else
    body = (
      <form onSubmit={send} className="space-y-8">
        <fieldset disabled={!form.open || busy} className="space-y-8 disabled:opacity-70">
          <Scale legend="How was it?" from={1} to={5} value={rating} onChange={setRating} />
          <Scale legend="How likely am I to recommend it to a friend?" from={0} to={10} value={nps} onChange={setNps} />
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-paper">
              Anything to add? <span className="font-normal text-paper/50">(optional)</span>
            </span>
            <textarea rows={4} maxLength={2000} value={comment} onChange={(e) => setComment(e.target.value)} className={`${FIELD} resize-y`} />
          </label>
          {questions
            .filter((q) => visible.has(q.id))
            .map((q) => (
              <Question key={q.id} field={q} value={answers[q.id]} onChange={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))} />
            ))}
        </fieldset>
        {form.unlocksCertificate && <p className="text-sm text-paper/75">My certificate for this event unlocks when I send this.</p>}
        {error && <p className="text-sm text-red-400">{error}</p>}
        {form.open ? (
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" disabled={busy} className="btn btn-primary">
              {busy ? "Sending…" : form.response ? "Update my feedback" : "Send feedback"}
            </button>
            <span className="text-xs text-paper/55">Open until {when(form.closesAt)}.</span>
          </div>
        ) : (
          <p className="text-sm text-paper/65">Feedback has closed. This is what I sent.</p>
        )}
      </form>
    );

  return <TicketsFrame title={`Feedback: ${form.event.title}`}>{body}</TicketsFrame>;
}

/** A row of numbered choices, as the app's Scale. */
function Scale({ legend, from, to, value, onChange }: { legend: string; from: number; to: number; value: number | null; onChange: (v: number) => void }) {
  return (
    <fieldset>
      <legend className="mb-2 block text-sm font-semibold text-paper">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: to - from + 1 }, (_, i) => from + i).map((n) => (
          <label
            key={n}
            className={`grid h-10 min-w-10 cursor-pointer place-items-center rounded-full px-3 text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary/60 ${
              value === n ? "bg-primary text-ink" : "bg-canvas text-paper/80 hover:text-paper"
            }`}
          >
            <input type="radio" name={legend} value={n} checked={value === n} onChange={() => onChange(n)} className="sr-only" />
            {n}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
