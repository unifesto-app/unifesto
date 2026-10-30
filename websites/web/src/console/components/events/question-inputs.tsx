"use client";

import { useId, useState } from "react";
import { Paperclip, X } from "@unifesto/unicon/react";
import {
  uploadFormFieldFile,
  type EventFormField,
} from "@/console/lib/api/events-api";
import {
  FILE_DEFAULT_KINDS,
  FILE_KINDS,
  choicesFor,
  configOf,
  isFileAnswer,
  visibleFieldIds,
} from "@/console/lib/form-questions";
import { Input } from "@/console/components/ui/input";
import { Textarea } from "@/console/components/ui/textarea";
import { Label } from "@/console/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/console/components/ui/select";

type Answers = Record<string, unknown>;

/**
 * Inputs for a set of registration questions bound to one answers object
 * (keyed by field id). Hides questions whose show-if isn't met and renders
 * section headings. The backend re-checks everything on submit.
 */
export function QuestionInputs({
  eventId,
  fields,
  values,
  onChange,
}: {
  eventId: string;
  fields: EventFormField[];
  values: Answers;
  onChange: (fieldId: string, value: unknown) => void;
}) {
  const uid = useId();
  if (fields.length === 0) return null;
  const visible = visibleFieldIds(fields, values);
  const shown = [...fields].sort((a, b) => a.order - b.order).filter((f) => visible.has(f.id));

  return (
    <div className="space-y-4">
      {shown.map((f) =>
        f.type === "SECTION" ? (
          <div key={f.id} className="pt-2">
            <p className="text-sm font-semibold text-foreground">{f.label}</p>
            {f.helpText && <p className="text-xs text-muted-foreground">{f.helpText}</p>}
          </div>
        ) : (
          <div key={f.id} className="space-y-1.5">
            {f.type !== "YES_NO" && (
              <Label id={`${uid}-${f.id}`}>
                {f.label}
                {f.isRequired && <span className="text-destructive"> *</span>}
              </Label>
            )}
            {f.helpText && f.type !== "YES_NO" && (
              <p className="text-xs text-muted-foreground">{f.helpText}</p>
            )}
            <QuestionInput
              eventId={eventId}
              field={f}
              labelId={`${uid}-${f.id}`}
              value={values[f.id]}
              onChange={(v) => onChange(f.id, v)}
            />
          </div>
        ),
      )}
    </div>
  );
}

function QuestionInput({
  eventId,
  field: f,
  labelId,
  value,
  onChange,
}: {
  eventId: string;
  field: EventFormField;
  /** id of the question's visible label: names single controls, or the group for composites. */
  labelId: string;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const c = configOf(f);
  const named = { "aria-labelledby": labelId };
  const group = { role: "group", "aria-labelledby": labelId };
  const str = typeof value === "string" || typeof value === "number" ? String(value) : "";

  switch (f.type) {
    case "TEXTAREA":
      return (
        <Textarea
          {...named}
          value={str}
          onChange={(e) => onChange(e.target.value)}
          maxLength={c.maxLength}
          rows={3}
        />
      );
    case "NUMBER":
      return (
        <Input
          {...named}
          type="number"
          value={str}
          min={c.min}
          max={c.max}
          onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
        />
      );
    case "EMAIL":
      return <Input {...named} type="email" value={str} onChange={(e) => onChange(e.target.value)} />;
    case "PHONE":
      return <Input {...named} type="tel" value={str} onChange={(e) => onChange(e.target.value)} />;
    case "URL":
      return (
        <Input
          {...named}
          type="url"
          value={str}
          placeholder="https://"
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case "DATE":
      return (
        <Input
          {...named}
          type="date"
          value={str}
          min={c.minDate}
          max={c.maxDate}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case "SELECT":
    case "STATE":
      return (
        <Select value={str} onValueChange={onChange}>
          <SelectTrigger {...named}>
            <SelectValue placeholder="Choose…" />
          </SelectTrigger>
          <SelectContent>
            {choicesFor(f).map((o) => (
              <SelectItem key={o} value={o}>
                {o}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    case "RADIO":
      return (
        <div {...group} className="flex flex-wrap gap-x-4 gap-y-1">
          {f.options.map((o) => (
            <label key={o} className="flex items-center gap-2 text-sm">
              <input type="radio" checked={value === o} onChange={() => onChange(o)} />
              {o}
            </label>
          ))}
        </div>
      );
    case "CHECKBOX": {
      const picks = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div {...group} className="flex flex-wrap gap-x-4 gap-y-1">
          {f.options.map((o) => (
            <label key={o} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={picks.includes(o)}
                onChange={(e) =>
                  onChange(e.target.checked ? [...picks, o] : picks.filter((p) => p !== o))
                }
              />
              {o}
            </label>
          ))}
        </div>
      );
    }
    case "YES_NO":
      return (
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={value === true}
            onChange={(e) => onChange(e.target.checked)}
          />
          <span>
            {f.label}
            {f.isRequired && <span className="text-destructive"> *</span>}
            {f.helpText && (
              <span className="block text-xs text-muted-foreground">{f.helpText}</span>
            )}
          </span>
        </label>
      );
    case "RATING": {
      const scale = c.scale === 10 ? 10 : 5;
      return (
        <div {...group} className="flex flex-wrap gap-1">
          {Array.from({ length: scale }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onChange(value === n ? "" : n)}
              aria-pressed={value === n}
              className={`h-8 w-8 rounded-md border text-sm ${
                value === n
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input hover:bg-muted"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      );
    }
    case "FILE":
      return (
        <div {...group}>
          <FileInput eventId={eventId} field={f} value={value} onChange={onChange} />
        </div>
      );
    default:
      return (
        <Input {...named} value={str} maxLength={c.maxLength} onChange={(e) => onChange(e.target.value)} />
      );
  }
}

function FileInput({
  eventId,
  field,
  value,
  onChange,
}: {
  eventId: string;
  field: EventFormField;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const c = configOf(field);
  const kinds = c.fileKinds?.length ? c.fileKinds : FILE_DEFAULT_KINDS;
  const accept = FILE_KINDS.filter((k) => kinds.includes(k.value))
    .map((k) => k.accept)
    .join(",");

  if (isFileAnswer(value)) {
    return (
      <div className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
        <Paperclip className="h-4 w-4 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate">{value.name}</span>
        <button type="button" onClick={() => onChange("")} aria-label="Remove file">
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }
  return (
    <div className="space-y-1">
      <Input
        type="file"
        accept={accept}
        disabled={busy}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          setBusy(true);
          setErr("");
          const { data, error } = await uploadFormFieldFile(eventId, field.id, file);
          setBusy(false);
          if (error) setErr(error.message);
          else if (data) onChange(data);
        }}
      />
      {busy && <p className="text-xs text-muted-foreground">Uploading…</p>}
      {err && <p className="text-xs text-destructive">{err}</p>}
    </div>
  );
}
