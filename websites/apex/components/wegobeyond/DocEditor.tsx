"use client";

import { useId, useState } from "react";
import { ArrowDown, ArrowUp, CaretDown, CaretUp, Plus, Trash, UploadSimple } from "@unifesto/unicon/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUnsavedGuard } from "@/lib/utils/use-unsaved-guard";
import { cn } from "@/lib/utils/cn";
import {
  saveWegobeyondDoc,
  uploadWegobeyondPhoto,
  type DocData,
  type Field,
  type ListSpec,
  type WegobeyondDoc,
} from "@/lib/api/wegobeyond-api";

const PHOTO_MAX_MB = 3;

const blank = (fields: Field[]): DocData =>
  Object.fromEntries(fields.map((f) => [f.key, f.kind === "lines" ? [] : f.kind === "select" ? (f.options?.[0] ?? "") : ""]));

/**
 * One WeGoBeyond document, as a form built from the spec the backend sends with
 * it. The backend validates again on save (and normalises: trims, drops blank
 * lines); the save names the loaded version, so someone else's newer save wins
 * and this editor is told to reload instead of overwriting it.
 */
export function DocEditor({ doc, onSaved }: { doc: WegobeyondDoc; onSaved: (doc: WegobeyondDoc) => void }) {
  const { spec } = doc;
  const draft = useDocDraft(doc, onSaved);
  const { data, change } = draft;

  return (
    <div className="space-y-10 pb-4">
      {spec.fields.length > 0 && (
        <div className="grid gap-5 md:grid-cols-2">
          {spec.fields.map((f) => (
            <FieldInput key={f.key} field={f} value={data[f.key]} onChange={(v) => change({ ...data, [f.key]: v })} />
          ))}
        </div>
      )}

      {spec.lists.map((list) => (
        <ListEditor
          key={list.key}
          spec={list}
          items={(data[list.key] as DocData[]) ?? []}
          onChange={(items) => change({ ...data, [list.key]: items })}
        />
      ))}

      <SaveBar draft={draft} />
    </div>
  );
}

/** A document being edited: its working copy, and a save that names the loaded version. */
export function useDocDraft(doc: WegobeyondDoc, onSaved: (doc: WegobeyondDoc) => void) {
  const [data, setData] = useState<DocData>(doc.data);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; messages: string[] } | null>(null);
  useUnsavedGuard(dirty);

  const change = (next: DocData) => {
    setData(next);
    setDirty(true);
    setStatus(null);
  };

  const save = async () => {
    setSaving(true);
    const { data: saved, error } = await saveWegobeyondDoc(doc.name, data, doc.version);
    setSaving(false);
    if (saved) {
      setData(saved.data);
      setDirty(false);
      setStatus({ ok: true, messages: ["Saved. wegobeyond.in shows it within a minute or two."] });
      onSaved(saved);
    } else {
      const m = error?.message as unknown;
      setStatus({ ok: false, messages: Array.isArray(m) ? m.map(String) : [String(m ?? "Couldn't save.")] });
    }
  };

  return { data, change, save, saving, dirty, status };
}

export function SaveBar({ draft }: { draft: ReturnType<typeof useDocDraft> }) {
  const { status, dirty, saving, save } = draft;
  return (
    <div className="sticky bottom-4 z-10 flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-md sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 text-sm" role="status" aria-live="polite">
        {status && !status.ok ? (
          <ul className="space-y-1 text-destructive">
            {status.messages.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">{status?.messages[0] ?? (dirty ? "Unsaved changes." : "All changes saved.")}</p>
        )}
      </div>
      <Button onClick={() => void save()} disabled={!dirty || saving} className="shrink-0">
        {saving ? "Saving…" : "Save changes"}
      </Button>
    </div>
  );
}

function ListEditor({ spec, items, onChange }: { spec: ListSpec; items: DocData[]; onChange: (items: DocData[]) => void }) {
  const [open, setOpen] = useState<number | null>(null);

  const move = (i: number, by: number) => {
    const j = i + by;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
    setOpen(open === i ? j : open === j ? i : open);
  };
  const remove = (i: number) => {
    const label = String(items[i]?.[spec.titleKey] || `this ${spec.itemLabel}`);
    if (!window.confirm(`Remove ${label}? It goes when you save.`)) return;
    onChange(items.filter((_, k) => k !== i));
    setOpen(null);
  };
  const add = () => {
    onChange([...items, blank(spec.fields)]);
    setOpen(items.length);
  };
  const full = spec.max !== undefined && items.length >= spec.max;

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-base font-semibold text-foreground">{spec.title}</h2>
        <span className="text-xs text-muted-foreground">
          {items.length}
          {spec.max !== undefined && ` of ${spec.max}`}
        </span>
      </div>
      {items.length > 0 && (
        <ol className="divide-y divide-border rounded-xl border border-border">
          {items.map((item, i) => {
            const isOpen = open === i;
            const title = String(item[spec.titleKey] || "") || `New ${spec.itemLabel}`;
            return (
              <li key={i}>
                <div className="flex items-center gap-2 px-3 py-2">
                  <button
                    type="button"
                    onClick={() => setOpen(isOpen ? null : i)}
                    aria-expanded={isOpen}
                    className="flex min-w-0 flex-1 items-center gap-2 py-1 text-left text-sm text-foreground"
                  >
                    {isOpen ? <CaretUp className="h-4 w-4 shrink-0 text-muted-foreground" /> : <CaretDown className="h-4 w-4 shrink-0 text-muted-foreground" />}
                    <span className="truncate">{title}</span>
                  </button>
                  <div className="flex shrink-0 items-center">
                    <Button variant="ghost" size="icon" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${title} up`}>
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => move(i, 1)} disabled={i === items.length - 1} aria-label={`Move ${title} down`}>
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => remove(i)} aria-label={`Remove ${title}`} className="hover:text-destructive">
                      <Trash className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                {isOpen && (
                  <div className="grid gap-5 border-t border-border bg-muted/30 px-3 py-4 md:grid-cols-2">
                    {spec.fields.map((f) => (
                      <FieldInput
                        key={f.key}
                        field={f}
                        value={item[f.key]}
                        onChange={(v) => onChange(items.map((it, k) => (k === i ? { ...it, [f.key]: v } : it)))}
                      />
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
      <Button variant="outline" size="sm" onClick={add} disabled={full}>
        <Plus className="h-4 w-4" />
        Add {spec.itemLabel}
      </Button>
    </section>
  );
}

export function FieldInput({ field, value, onChange }: { field: Field; value: unknown; onChange: (v: unknown) => void }) {
  const id = useId();
  const wide = field.kind === "textarea" || field.kind === "lines" || field.kind === "image";
  const text = typeof value === "string" ? value : "";
  const lines = Array.isArray(value) ? (value as string[]) : [];

  return (
    <div className={cn("space-y-2", wide && "md:col-span-2")}>
      <Label htmlFor={id}>
        {field.label}
        {!field.required && <span className="font-normal text-muted-foreground"> (optional)</span>}
      </Label>
      {field.kind === "textarea" ? (
        <Textarea id={id} rows={4} value={text} maxLength={field.max} onChange={(e) => onChange(e.target.value)} />
      ) : field.kind === "lines" ? (
        <Textarea id={id} rows={Math.max(3, lines.length + 1)} value={lines.join("\n")} onChange={(e) => onChange(e.target.value.split("\n"))} />
      ) : field.kind === "select" ? (
        <Select value={text} onValueChange={onChange}>
          <SelectTrigger id={id}>
            <SelectValue placeholder="Pick one" />
          </SelectTrigger>
          <SelectContent>
            {field.options?.map((o) => (
              <SelectItem key={o} value={o}>
                {o}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : field.kind === "image" ? (
        <PhotoInput id={id} value={text} onChange={onChange} />
      ) : (
        <Input
          id={id}
          type={field.kind === "email" ? "email" : field.kind === "url" ? "url" : field.kind === "date" ? "date" : "text"}
          value={text}
          maxLength={field.max}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {field.hint && <p className="text-xs text-muted-foreground">{field.hint}</p>}
    </div>
  );
}

/** A photo: upload one to the bucket, or paste an https:// link. */
function PhotoInput({ id, value, onChange }: { id: string; value: string; onChange: (v: unknown) => void }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > PHOTO_MAX_MB * 1024 * 1024) return setError(`That photo is over ${PHOTO_MAX_MB} MB.`);
    setError("");
    setBusy(true);
    const { data, error } = await uploadWegobeyondPhoto(file);
    setBusy(false);
    if (data) onChange(data.url);
    else setError(error?.message ?? "Couldn't upload that photo.");
  };

  // Site-relative /gallery/ photos live on wegobeyond.in, not here.
  const preview = value.startsWith("https://") ? value : value.startsWith("/gallery/") ? `https://wegobeyond.in${value}` : null;

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
      <div className="grid h-28 w-28 shrink-0 place-items-center overflow-hidden rounded-xl bg-muted">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element -- an uploaded photo or any https link
          <img src={preview} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="text-xs text-muted-foreground">No photo</span>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <Button variant="outline" size="sm" asChild className={cn("w-fit cursor-pointer", busy && "pointer-events-none opacity-50")}>
          <label>
            <UploadSimple className="h-4 w-4" />
            {busy ? "Uploading…" : value ? "Replace photo" : "Upload photo"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              disabled={busy}
              onChange={(e) => {
                void upload(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
        </Button>
        <Input id={id} placeholder="or paste an https:// link" value={value} onChange={(e) => onChange(e.target.value)} />
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    </div>
  );
}
