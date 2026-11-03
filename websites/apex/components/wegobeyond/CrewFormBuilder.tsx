"use client";

import { useId, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, CaretDown, CaretUp, CopySimple, Plus, Trash } from "@unifesto/unicon/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils/cn";
import {
  CORE_QUESTIONS,
  RESERVED_IDS,
  type ChoiceDisplay,
  type CrewForm,
  type FormQuestion,
  type QuestionType,
  type QuestionWidth,
  type WegobeyondDoc,
} from "@/lib/api/wegobeyond-api";
import { FieldInput, SaveBar, useDocDraft } from "./DocEditor";
import { CrewFormPreview } from "./CrewFormPreview";

/** `_k` marks a question that isn't saved yet: its answer key still follows its label. */
type Draft = FormQuestion & { _k?: string };

const MAX_QUESTIONS = 40;

const TYPE_LABELS: Record<QuestionType, string> = {
  short: "Short answer",
  long: "Paragraph",
  email: "Email",
  phone: "Phone",
  url: "Link",
  number: "Number",
  date: "Date",
  choice: "Pick one",
  multi: "Pick any",
  yesno: "Yes / no",
  heading: "Section heading",
};
const TYPES = Object.keys(TYPE_LABELS) as QuestionType[];

const WIDTHS: { value: QuestionWidth; label: string }[] = [
  { value: "full", label: "Full" },
  { value: "half", label: "Half" },
  { value: "third", label: "Third" },
];
const DISPLAYS: { value: ChoiceDisplay; label: string }[] = [
  { value: "dropdown", label: "Dropdown" },
  { value: "pills", label: "Pills" },
  { value: "tiles", label: "Tiles" },
  { value: "list", label: "List" },
];

const isChoice = (t: QuestionType) => t === "choice" || t === "multi";
const TEXT_TYPES = new Set<QuestionType>(["short", "long", "email", "phone", "url", "number", "date"]);

const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+/, "").slice(0, 40).replace(/-+$/, "") || "question";

function uniqueId(base: string, taken: Set<string>) {
  let id = base;
  for (let n = 2; taken.has(id) || RESERVED_IDS.includes(id); n++) id = `${base}-${n}`;
  return id;
}

/**
 * The crew sign-up form builder: page text, then the questions in order, with
 * a live preview of the form as wegobeyond.in draws it. The backend checks the
 * whole definition on save (crew-form.ts) and every sign-up against it.
 */
export function CrewFormBuilder({ doc, onSaved }: { doc: WegobeyondDoc; onSaved: (doc: WegobeyondDoc) => void }) {
  const draft = useDocDraft(doc, onSaved);
  const form = draft.data as unknown as CrewForm;
  const fields = form.fields as Draft[];
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const keyOf = (q: Draft) => q._k ?? q.id;
  const takenBy = (except: number) => new Set(fields.filter((_, k) => k !== except).map((f) => f.id));
  const setFields = (next: Draft[]) => draft.change({ ...draft.data, fields: next });

  const update = (i: number, patch: Partial<Draft>) => {
    const q = { ...fields[i], ...patch };
    if (q._k && patch.label !== undefined) q.id = uniqueId(slug(q.label), takenBy(i));
    if (q.type === "multi" && q.display === "dropdown") q.display = "pills";
    if (q.type === "heading") q.required = false;
    setFields(fields.map((f, k) => (k === i ? q : f)));
  };
  const move = (i: number, by: number) => {
    const j = i + by;
    if (j < 0 || j >= fields.length) return;
    const next = [...fields];
    [next[i], next[j]] = [next[j], next[i]];
    setFields(next);
  };
  const insert = (at: number, q: Draft) => {
    setFields([...fields.slice(0, at), q, ...fields.slice(at)]);
    setOpen(keyOf(q));
  };
  const add = (type: QuestionType) => {
    const label = type === "heading" ? "New section" : "New question";
    insert(fields.length, {
      id: uniqueId(slug(label), takenBy(-1)),
      type,
      label,
      help: "",
      placeholder: "",
      required: false,
      options: isChoice(type) ? ["Option 1", "Option 2"] : [],
      width: "full",
      display: "pills",
      _k: crypto.randomUUID(),
    });
    setAdding(false);
  };
  const duplicate = (i: number) => {
    const label = `${fields[i].label} (copy)`;
    insert(i + 1, { ...fields[i], label, id: uniqueId(slug(label), takenBy(-1)), _k: crypto.randomUUID() });
  };
  const remove = (i: number) => {
    const q = fields[i];
    const note = q._k ? "" : " Answers already given to it stay on past sign-ups.";
    if (!window.confirm(`Remove “${q.label || "this question"}”? It goes when you save.${note}`)) return;
    setFields(fields.filter((_, k) => k !== i));
  };

  return (
    <div className="space-y-6 pb-4">
      <div className="grid gap-8 xl:grid-cols-2">
        <div className="min-w-0 space-y-10">
          <section className="space-y-4">
            <h2 className="text-base font-semibold text-foreground">Page text</h2>
            <div className="grid gap-5 md:grid-cols-2">
              {doc.spec.fields.map((f) => (
                <FieldInput key={f.key} field={f} value={draft.data[f.key]} onChange={(v) => draft.change({ ...draft.data, [f.key]: v })} />
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="text-base font-semibold text-foreground">Questions</h2>
              <span className="text-xs text-muted-foreground">
                {fields.length} of {MAX_QUESTIONS}
              </span>
            </div>
            <ol className="divide-y divide-border rounded-xl border border-border">
              {fields.map((q, i) => (
                <QuestionRow
                  key={keyOf(q)}
                  q={q}
                  first={i === 0}
                  last={i === fields.length - 1}
                  open={open === keyOf(q)}
                  onToggle={() => setOpen(open === keyOf(q) ? null : keyOf(q))}
                  onChange={(patch) => update(i, patch)}
                  onMove={(by) => move(i, by)}
                  onDuplicate={() => duplicate(i)}
                  onRemove={() => remove(i)}
                />
              ))}
            </ol>
            {adding ? (
              <div className="space-y-2 rounded-xl border border-dashed border-border p-3">
                <p className="text-xs text-muted-foreground">Add a question of type:</p>
                <div className="flex flex-wrap gap-2">
                  {TYPES.map((t) => (
                    <Button key={t} variant="outline" size="sm" onClick={() => add(t)}>
                      {TYPE_LABELS[t]}
                    </Button>
                  ))}
                  <Button variant="ghost" size="sm" onClick={() => setAdding(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setAdding(true)} disabled={fields.length >= MAX_QUESTIONS}>
                <Plus className="h-4 w-4" />
                Add question
              </Button>
            )}
          </section>
        </div>

        <div className="min-w-0 xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:self-start xl:overflow-y-auto">
          <CrewFormPreview form={form} />
        </div>
      </div>

      <SaveBar draft={draft} />
    </div>
  );
}

function QuestionRow({
  q,
  first,
  last,
  open,
  onToggle,
  onChange,
  onMove,
  onDuplicate,
  onRemove,
}: {
  q: Draft;
  first: boolean;
  last: boolean;
  open: boolean;
  onToggle: () => void;
  onChange: (patch: Partial<Draft>) => void;
  onMove: (by: number) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const id = useId();
  const core = !q._k && CORE_QUESTIONS.includes(q.id);
  const name = q.label || "Untitled question";
  const placeholder = TEXT_TYPES.has(q.type) || (q.type === "choice" && q.display === "dropdown");

  return (
    <li>
      <div className="flex items-center gap-2 px-3 py-2">
        <button type="button" onClick={onToggle} aria-expanded={open} className="flex min-w-0 flex-1 items-center gap-2 py-1 text-left text-sm">
          {open ? <CaretUp className="h-4 w-4 shrink-0 text-muted-foreground" /> : <CaretDown className="h-4 w-4 shrink-0 text-muted-foreground" />}
          <span className={cn("truncate text-foreground", q.type === "heading" && "font-semibold")}>{name}</span>
          <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
            {TYPE_LABELS[q.type]}
            {q.required && " · required"}
          </span>
        </button>
        <div className="flex shrink-0 items-center">
          <Button variant="ghost" size="icon" onClick={() => onMove(-1)} disabled={first} aria-label={`Move ${name} up`}>
            <ArrowUp className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => onMove(1)} disabled={last} aria-label={`Move ${name} down`}>
            <ArrowDown className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={onDuplicate} aria-label={`Duplicate ${name}`}>
            <CopySimple className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onRemove}
            disabled={core}
            aria-label={core ? `${name} is a contact detail and can't be removed` : `Remove ${name}`}
            title={core ? "Contact details are always asked" : undefined}
            className="hover:text-destructive"
          >
            <Trash className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {open && (
        <div className="grid gap-5 border-t border-border bg-muted/30 px-3 py-4 md:grid-cols-2">
          <Labeled htmlFor={`${id}-label`} label={q.type === "heading" ? "Heading" : "Question"} wide>
            <Input id={`${id}-label`} value={q.label} maxLength={120} onChange={(e) => onChange({ label: e.target.value })} />
            <p className="text-xs text-muted-foreground">
              Answer key <code className="font-mono">{q.id}</code>
              {q._k
                ? ": follows the question until you save, then stays fixed."
                : core
                  ? ": a contact detail, always asked and always required."
                  : ": fixed, past answers are stored under it."}
            </p>
          </Labeled>

          {!core && (
            <Labeled htmlFor={`${id}-type`} label="Type">
              <Select value={q.type} onValueChange={(t) => onChange({ type: t as QuestionType })}>
                <SelectTrigger id={`${id}-type`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Labeled>
          )}

          {q.type !== "heading" && (
            <Labeled htmlFor={`${id}-required`} label="Required">
              <div className="flex h-10 items-center">
                <Switch id={`${id}-required`} on={q.required} disabled={core} onClick={() => onChange({ required: !q.required })} />
              </div>
            </Labeled>
          )}

          <Labeled htmlFor={`${id}-help`} label={q.type === "heading" ? "Text under the heading" : "Help text"} wide>
            <Input id={`${id}-help`} value={q.help} maxLength={300} onChange={(e) => onChange({ help: e.target.value })} />
          </Labeled>

          {placeholder && (
            <Labeled htmlFor={`${id}-placeholder`} label="Placeholder">
              <Input id={`${id}-placeholder`} value={q.placeholder} maxLength={120} onChange={(e) => onChange({ placeholder: e.target.value })} />
            </Labeled>
          )}

          {q.type !== "heading" && (
            <Labeled htmlFor={`${id}-width`} label="Width">
              <Segmented id={`${id}-width`} options={WIDTHS} value={q.width} onChange={(width) => onChange({ width })} />
            </Labeled>
          )}

          {isChoice(q.type) && (
            <>
              <Labeled htmlFor={`${id}-display`} label="Show options as">
                <Segmented
                  id={`${id}-display`}
                  options={q.type === "multi" ? DISPLAYS.filter((d) => d.value !== "dropdown") : DISPLAYS}
                  value={q.display}
                  onChange={(display) => onChange({ display })}
                />
              </Labeled>
              <Labeled
                htmlFor={`${id}-options`}
                label="Options"
                wide
                hint="One per line. Add a hint after “ | ”, e.g. Speaking | Give a talk or join a panel. Hints show in tiles and list; the answer stored is the part before it."
              >
                <Textarea
                  id={`${id}-options`}
                  rows={Math.max(3, q.options.length + 1)}
                  value={q.options.join("\n")}
                  onChange={(e) => onChange({ options: e.target.value.split("\n") })}
                />
              </Labeled>
            </>
          )}
        </div>
      )}
    </li>
  );
}

function Labeled({ htmlFor, label, hint, wide, children }: { htmlFor: string; label: string; hint?: string; wide?: boolean; children: ReactNode }) {
  return (
    <div className={cn("space-y-2", wide && "md:col-span-2")}>
      <Label htmlFor={htmlFor} id={`${htmlFor}-label-text`}>
        {label}
      </Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Segmented<T extends string>({ id, options, value, onChange }: { id: string; options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div id={id} role="radiogroup" aria-labelledby={`${id}-label-text`} className="inline-flex flex-wrap items-center gap-1 rounded-lg border border-border bg-card p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
            value === o.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Switch({ id, on, disabled, onClick }: { id: string; on: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={onClick}
      className={cn("relative h-5 w-9 rounded-full transition-colors disabled:opacity-50", on ? "bg-primary" : "bg-muted-foreground/30")}
    >
      <span className={cn("absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-card shadow-sm transition-transform", on && "translate-x-4")} />
    </button>
  );
}
