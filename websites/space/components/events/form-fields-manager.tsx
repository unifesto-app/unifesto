"use client";

import { useState } from "react";
import { Plus, Trash, PencilSimple, ArrowBendDownRight } from "@unifesto/unicon/react";
import {
  createFormField,
  updateFormField,
  deleteFormField,
  type EventFormField,
  type FormFieldType,
} from "@/lib/api/events-api";
import {
  CHOICE_TYPES,
  FIELD_TYPES,
  FILE_DEFAULT_KINDS,
  FILE_DEFAULT_MAX_MB,
  FILE_KINDS,
  FILE_MAX_MB_CAP,
  OPTION_TYPES,
  choicesFor,
  configOf,
  describeLimits,
  fieldTypeLabel,
  type FileKind,
  type FormFieldConfig,
} from "@/lib/form-questions";
import { ErrorNotice } from "@/components/shared/ErrorNotice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Field } from "./ticket-editor";

/** Editor state. Limits are kept as input strings until save. */
interface FieldDraft {
  id?: string;
  label: string;
  type: FormFieldType;
  /** One option per line (option types only). */
  options: string;
  required: boolean;
  /** Group tickets only: ask once for the team vs every member. */
  perGroup: boolean;
  helpText: string;
  lo: string;
  hi: string;
  scale: "5" | "10";
  fileKinds: FileKind[];
  maxSizeMb: string;
  /** Show-if: the earlier question it depends on ("" = always shown). */
  showIfField: string;
  showIfAnyOf: string[];
}

const TEXTAREA_CLASS =
  "flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

/** Which min/max pair a type uses, and how to label it. */
const LIMITS: Partial<
  Record<FormFieldType, { lo: keyof FormFieldConfig; hi: keyof FormFieldConfig; label: string; input: "number" | "date" }>
> = {
  TEXT: { lo: "minLength", hi: "maxLength", label: "Length (characters)", input: "number" },
  TEXTAREA: { lo: "minLength", hi: "maxLength", label: "Length (characters)", input: "number" },
  NUMBER: { lo: "min", hi: "max", label: "Allowed range", input: "number" },
  DATE: { lo: "minDate", hi: "maxDate", label: "Allowed dates", input: "date" },
  CHECKBOX: { lo: "minPicks", hi: "maxPicks", label: "How many can be picked", input: "number" },
};

function emptyDraft(): FieldDraft {
  return {
    label: "",
    type: "TEXT",
    options: "",
    required: false,
    perGroup: false,
    helpText: "",
    lo: "",
    hi: "",
    scale: "5",
    fileKinds: [...FILE_DEFAULT_KINDS],
    maxSizeMb: String(FILE_DEFAULT_MAX_MB),
    showIfField: "",
    showIfAnyOf: [],
  };
}

function draftFrom(f: EventFormField): FieldDraft {
  const c = configOf(f);
  const lim = LIMITS[f.type];
  return {
    ...emptyDraft(),
    id: f.id,
    label: f.label,
    type: f.type,
    options: (f.options ?? []).join("\n"),
    required: f.isRequired,
    perGroup: f.perGroup ?? false,
    helpText: f.helpText ?? "",
    lo: lim && c[lim.lo] !== undefined ? String(c[lim.lo]) : "",
    hi: lim && c[lim.hi] !== undefined ? String(c[lim.hi]) : "",
    scale: c.scale === 10 ? "10" : "5",
    fileKinds: c.fileKinds?.length ? c.fileKinds : [...FILE_DEFAULT_KINDS],
    maxSizeMb: String(c.maxSizeMb ?? FILE_DEFAULT_MAX_MB),
    showIfField: f.showIf?.fieldId ?? "",
    showIfAnyOf: f.showIf?.anyOf ?? [],
  };
}

/** Draft limits → the `config` the API stores (null when none). */
function configFrom(d: FieldDraft): FormFieldConfig | null {
  const c: FormFieldConfig = {};
  const lim = LIMITS[d.type];
  if (lim) {
    const put = (k: keyof FormFieldConfig, v: string) => {
      if (!v.trim()) return;
      (c as Record<string, unknown>)[k] = lim.input === "date" ? v : Number(v);
    };
    put(lim.lo, d.lo);
    put(lim.hi, d.hi);
  }
  if (d.type === "RATING") c.scale = d.scale === "10" ? 10 : 5;
  if (d.type === "FILE") {
    c.fileKinds = d.fileKinds;
    c.maxSizeMb = Number(d.maxSizeMb) || FILE_DEFAULT_MAX_MB;
  }
  return Object.keys(c).length ? c : null;
}

/** What a saved question sends; `order` only on create. */
export interface QuestionPayload {
  label: string;
  type: FormFieldType;
  options: string[];
  isRequired: boolean;
  perGroup: boolean;
  helpText: string | null;
  config: FormFieldConfig | null;
  showIf: { fieldId: string; anyOf: string[] } | null;
  order?: number;
}

type StoreResult = Promise<{ error: { message: string } | null }>;

/** Where questions are saved. Defaults to the ticket's registration form; stays pass their own. */
export interface QuestionStore {
  create: (body: QuestionPayload) => StoreResult;
  update: (id: string, body: QuestionPayload) => StoreResult;
  remove: (id: string) => StoreResult;
}

/** Manage one ticket type's custom registration form (extra questions), or another question list via `store`. */
export function FormFieldsManager({
  eventId,
  ticketTypeId,
  fields,
  isGroup,
  onChanged,
  store,
  noFiles,
}: {
  eventId: string;
  ticketTypeId?: string;
  fields: EventFormField[];
  /** GROUP ticket → expose the "ask per member vs once per team" choice. */
  isGroup: boolean;
  onChanged: () => Promise<void>;
  store?: QuestionStore;
  /** Hide the File type (lists that can't take uploads, e.g. feedback). */
  noFiles?: boolean;
}) {
  const api: QuestionStore = store ?? {
    create: (b) => createFormField(eventId, { ticketTypeId: ticketTypeId!, ...b, order: b.order ?? fields.length }),
    update: (id, b) => updateFormField(eventId, id, b),
    remove: (id) => deleteFormField(eventId, id),
  };
  const [draft, setDraft] = useState<FieldDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const sorted = [...fields].sort((a, b) => a.order - b.order);
  const byId = new Map(fields.map((f) => [f.id, f]));
  const setField = (patch: Partial<FieldDraft>) =>
    setDraft((d) => (d ? { ...d, ...patch } : d));

  // Show-if can depend on an earlier choice question asked the same way.
  const draftOrder = draft?.id ? byId.get(draft.id)?.order ?? fields.length : fields.length;
  const parentChoices = draft
    ? sorted.filter(
        (f) =>
          f.id !== draft.id &&
          CHOICE_TYPES.includes(f.type) &&
          f.order < draftOrder &&
          (!isGroup || f.perGroup === draft.perGroup),
      )
    : [];
  const parent = draft?.showIfField ? byId.get(draft.showIfField) : undefined;

  const save = async () => {
    if (!draft) return;
    if (!draft.label.trim()) {
      setErr(draft.type === "SECTION" ? "Heading is required." : "Question label is required.");
      return;
    }
    const options = draft.options
      .split("\n")
      .map((o) => o.trim())
      .filter(Boolean);
    if (OPTION_TYPES.includes(draft.type) && options.length === 0) {
      setErr("Add at least one option for this question.");
      return;
    }
    if (draft.type === "FILE" && draft.fileKinds.length === 0) {
      setErr("Allow at least one file type.");
      return;
    }
    if (draft.showIfField && draft.showIfAnyOf.length === 0) {
      setErr("Pick at least one answer that shows this question.");
      return;
    }
    setBusy(true);
    setErr("");
    const payload = {
      label: draft.label.trim(),
      type: draft.type,
      options: OPTION_TYPES.includes(draft.type) ? options : [],
      isRequired: draft.type === "SECTION" ? false : draft.required,
      // Only meaningful for group tickets; harmless (defaults false) otherwise.
      perGroup: isGroup ? draft.perGroup : false,
      helpText: draft.helpText.trim() || null,
      config: configFrom(draft),
      showIf:
        draft.showIfField && draft.type !== "SECTION"
          ? { fieldId: draft.showIfField, anyOf: draft.showIfAnyOf }
          : null,
    };
    const { error } = draft.id ? await api.update(draft.id, payload) : await api.create({ ...payload, order: fields.length });
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    setDraft(null);
    await onChanged();
  };

  const remove = async (f: EventFormField) => {
    const dependents = fields.filter((x) => x.showIf?.fieldId === f.id).length;
    const note = dependents
      ? ` ${dependents} question${dependents > 1 ? "s" : ""} shown only for its answers will always show.`
      : "";
    if (!confirm(`Delete this question?${note}`)) return;
    const { error } = await api.remove(f.id);
    if (error) setErr(error.message);
    else await onChanged();
  };

  const lim = draft ? LIMITS[draft.type] : undefined;
  const isSection = draft?.type === "SECTION";

  return (
    <div className="space-y-4">
      {err && <ErrorNotice message={err} />}

      {fields.length === 0 && !draft && (
        <p className="text-sm text-muted-foreground">
          No extra questions yet. Attendees are still asked for the default
          fields above.
        </p>
      )}

      {sorted.length > 0 && (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {sorted.map((f) => {
            const cond = f.showIf ? byId.get(f.showIf.fieldId) : undefined;
            const limits = describeLimits(f);
            return (
              <li key={f.id} className="flex items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p
                    className={
                      f.type === "SECTION"
                        ? "text-sm font-semibold text-foreground"
                        : "text-sm font-medium text-foreground"
                    }
                  >
                    {f.label}
                    {f.isRequired && <span className="text-destructive"> *</span>}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {fieldTypeLabel(f.type)}
                    {OPTION_TYPES.includes(f.type) && f.options?.length
                      ? ` · ${f.options.join(", ")}`
                      : ""}
                    {limits ? ` · ${limits}` : ""}
                    {f.isRequired ? " · required" : ""}
                    {isGroup && f.type !== "SECTION"
                      ? f.perGroup
                        ? " · once per team"
                        : " · each member"
                      : ""}
                  </p>
                  {cond && f.showIf && (
                    <p className="mt-1 flex items-center gap-1 text-xs text-primary">
                      <ArrowBendDownRight className="h-3.5 w-3.5" />
                      Only if &ldquo;{cond.label}&rdquo; is {f.showIf.anyOf.join(" or ")}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setErr("");
                      setDraft(draftFrom(f));
                    }}
                    aria-label="Edit question"
                  >
                    <PencilSimple className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => remove(f)}
                    aria-label="Delete question"
                  >
                    <Trash className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {draft ? (
        <div className="space-y-4 rounded-lg border border-primary/30 bg-primary/[0.03] p-4">
          <p className="text-sm font-medium text-foreground">
            {draft.id ? "Edit question" : "New question"}
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={isSection ? "Heading" : "Question"}>
              <Input
                value={draft.label}
                onChange={(e) => setField({ label: e.target.value })}
                placeholder={isSection ? "e.g. Travel details" : "e.g. T-shirt size"}
              />
            </Field>
            <Field label="Answer type">
              <Select
                value={draft.type}
                onValueChange={(v) =>
                  // Limits don't carry across types.
                  setField({ type: v as FormFieldType, lo: "", hi: "" })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FIELD_TYPES.filter((ft) => !noFiles || ft.value !== "FILE").map((ft) => (
                    <SelectItem key={ft.value} value={ft.value}>
                      {ft.label}
                      <span className="ml-2 text-xs text-muted-foreground">{ft.hint}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          {draft.id && (
            <p className="-mt-2 text-xs text-muted-foreground">
              The type can&rsquo;t change once people have registered on this ticket.
            </p>
          )}

          <Field label={isSection ? "Note under the heading (optional)" : "Help text (optional)"}>
            <Input
              value={draft.helpText}
              onChange={(e) => setField({ helpText: e.target.value })}
              maxLength={500}
              placeholder={
                isSection ? "e.g. Only if you're travelling from outside the city" : "e.g. Link to your GitHub"
              }
            />
          </Field>

          {OPTION_TYPES.includes(draft.type) && (
            <Field label="Options (one per line)">
              <textarea
                value={draft.options}
                onChange={(e) => setField({ options: e.target.value })}
                rows={4}
                placeholder={"Small\nMedium\nLarge"}
                className={TEXTAREA_CLASS}
              />
            </Field>
          )}

          {lim && (
            <Field label={`${lim.label} (optional)`}>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  type={lim.input}
                  value={draft.lo}
                  onChange={(e) => setField({ lo: e.target.value })}
                  placeholder={lim.input === "date" ? "" : "Min"}
                  aria-label="Minimum"
                />
                <Input
                  type={lim.input}
                  value={draft.hi}
                  onChange={(e) => setField({ hi: e.target.value })}
                  placeholder={lim.input === "date" ? "" : "Max"}
                  aria-label="Maximum"
                />
              </div>
            </Field>
          )}

          {draft.type === "RATING" && (
            <Field label="Scale">
              <Select value={draft.scale} onValueChange={(v) => setField({ scale: v as "5" | "10" })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">1 to 5</SelectItem>
                  <SelectItem value="10">1 to 10</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          )}

          {draft.type === "FILE" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Allowed files">
                <div className="flex flex-wrap gap-3 pt-1">
                  {FILE_KINDS.map((k) => (
                    <label key={k.value} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={draft.fileKinds.includes(k.value)}
                        onChange={(e) =>
                          setField({
                            fileKinds: e.target.checked
                              ? [...draft.fileKinds, k.value]
                              : draft.fileKinds.filter((x) => x !== k.value),
                          })
                        }
                      />
                      {k.label}
                    </label>
                  ))}
                </div>
              </Field>
              <Field label={`Max size (MB, up to ${FILE_MAX_MB_CAP})`}>
                <Input
                  type="number"
                  min={1}
                  max={FILE_MAX_MB_CAP}
                  value={draft.maxSizeMb}
                  onChange={(e) => setField({ maxSizeMb: e.target.value })}
                />
              </Field>
              <p className="text-xs text-muted-foreground sm:col-span-2">
                Files are private: only the attendee and people who manage attendees can open them.
                They&rsquo;re deleted 180 days after the event.
              </p>
            </div>
          )}

          {isGroup && !isSection && (
            <Field label="Who answers this?">
              <Select
                value={draft.perGroup ? "team" : "member"}
                // A condition must be asked the same way, so switching clears it.
                onValueChange={(v) =>
                  setField({ perGroup: v === "team", showIfField: "", showIfAnyOf: [] })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">Every member</SelectItem>
                  <SelectItem value="team">Once for the whole team</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          )}

          {!isSection && (parentChoices.length > 0 || draft.showIfField) && (
            <Field label="Show this question">
              <Select
                value={draft.showIfField || "always"}
                onValueChange={(v) =>
                  setField({ showIfField: v === "always" ? "" : v, showIfAnyOf: [] })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="always">Always</SelectItem>
                  {parentChoices.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      Only depending on &ldquo;{p.label}&rdquo;
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {parent && (
                <div className="mt-2 space-y-1">
                  <p className="text-xs text-muted-foreground">Show when the answer is any of:</p>
                  <div className="flex max-h-40 flex-wrap gap-x-4 gap-y-1 overflow-y-auto">
                    {choicesFor(parent).map((opt) => (
                      <label key={opt} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={draft.showIfAnyOf.includes(opt)}
                          onChange={(e) =>
                            setField({
                              showIfAnyOf: e.target.checked
                                ? [...draft.showIfAnyOf, opt]
                                : draft.showIfAnyOf.filter((x) => x !== opt),
                            })
                          }
                        />
                        {opt}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </Field>
          )}

          <div className="flex items-center justify-between">
            {isSection ? (
              <span />
            ) : (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={draft.required}
                  onChange={(e) => setField({ required: e.target.checked })}
                />
                {draft.type === "YES_NO" ? "Required (must be ticked)" : "Required"}
              </label>
            )}
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setDraft(null)} disabled={busy}>
                Cancel
              </Button>
              <Button size="sm" onClick={save} disabled={busy}>
                {busy ? "Saving…" : draft.id ? "Save question" : "Add question"}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setErr("");
            setDraft(emptyDraft());
          }}
        >
          <Plus className="h-4 w-4" weight="bold" />
          Add question
        </Button>
      )}
    </div>
  );
}
