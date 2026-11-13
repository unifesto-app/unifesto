"use client";

import { useState, type ReactNode } from "react";
import { Plus, PencilSimple, Trash, X, Spinner } from "@unifesto/unicon/react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/console/components/ui/card";
import { Button } from "@/console/components/ui/button";
import { Input } from "@/console/components/ui/input";
import { Label } from "@/console/components/ui/label";
import { Textarea } from "@/console/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/console/components/ui/select";
import {
  ImageUploadCard,
  type ImageUploadResult,
} from "@/console/components/shared/ImageUploadCard";

export type FieldType =
  | "text"
  | "textarea"
  | "url"
  | "email"
  | "tel"
  /** One of `options`. */
  | "select"
  /** A time as "1:30 pm": a time box beside am | pm buttons. */
  | "clock"
  /** An uploaded square photo; the value is its URL. Needs `upload`. */
  | "image";

export interface FieldDef {
  key: string;
  label: string;
  type?: FieldType;
  required?: boolean;
  placeholder?: string;
  /** Grid columns the field spans (1 or 2). Defaults to 2 (full width). */
  colSpan?: 1 | 2;
  options?: { value: string; label: string }[];
  upload?: (file: File) => Promise<ImageUploadResult>;
}

type FormValues = Record<string, string>;

interface SectionEditorProps<T> {
  title: string;
  description?: string;
  icon?: ReactNode;
  addLabel: string;
  emptyText: string;
  items: T[];
  fields: FieldDef[];
  disabled?: boolean;
  getId: (item: T) => string;
  renderSummary: (item: T) => ReactNode;
  /** Initial form values for a new item (null) or an existing one; `list` is what's there now. */
  toForm: (item: T | null, list: T[]) => FormValues;
  /** List order; insertion order when absent. */
  sort?: (a: T, b: T) => number;
  /** Why the values can't be saved, after the required-field checks; null when they can. */
  check?: (values: FormValues) => string | null;
  onCreate: (values: FormValues) => Promise<{ item: T | null; error: string | null }>;
  onUpdate: (
    id: string,
    values: FormValues
  ) => Promise<{ item: T | null; error: string | null }>;
  onDelete: (id: string) => Promise<{ error: string | null }>;
}

/**
 * A card that manages an ordered collection of sub-items (agenda entries,
 * speakers, prizes, contacts, FAQs). Generic over the item shape via a field
 * schema plus create/update/delete adapters supplied by the parent. Keeps its
 * own copy of the list so edits reflect immediately without a full reload.
 */
export function SectionEditor<T>({
  title,
  description,
  icon,
  addLabel,
  emptyText,
  items,
  fields,
  disabled = false,
  getId,
  renderSummary,
  toForm,
  sort,
  check,
  onCreate,
  onUpdate,
  onDelete,
}: SectionEditorProps<T>) {
  const [list, setList] = useState<T[]>(items);
  // null = form closed; "new" = adding; otherwise the id being edited.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [values, setValues] = useState<FormValues>({});
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(0);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const openNew = () => {
    setEditingId("new");
    setValues(toForm(null, list));
    setError("");
  };

  const openEdit = (item: T) => {
    setEditingId(getId(item));
    setValues(toForm(item, list));
    setError("");
  };

  const closeForm = () => {
    setEditingId(null);
    setValues({});
    setError("");
  };

  const setValue = (key: string, value: string) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const validate = (): string | null => {
    for (const f of fields) {
      if (f.required && !values[f.key]?.trim()) {
        return `${f.label} is required.`;
      }
    }
    return check?.(values) ?? null;
  };

  // In-flight photo uploads hold Save, so a speaker never saves without the photo just picked.
  const trackUpload = (upload: NonNullable<FieldDef["upload"]>) => async (file: File) => {
    setUploading((n) => n + 1);
    try {
      return await upload(file);
    } finally {
      setUploading((n) => n - 1);
    }
  };

  const handleSave = async () => {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setSaving(true);
    setError("");
    if (editingId === "new") {
      const { item, error: err } = await onCreate(values);
      setSaving(false);
      if (err) {
        setError(err);
        return;
      }
      if (item) setList((prev) => [...prev, item]);
    } else if (editingId) {
      const { item, error: err } = await onUpdate(editingId, values);
      setSaving(false);
      if (err) {
        setError(err);
        return;
      }
      if (item) {
        setList((prev) =>
          prev.map((it) => (getId(it) === editingId ? item : it))
        );
      }
    }
    closeForm();
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    setError("");
    const { error: err } = await onDelete(id);
    setDeletingId(null);
    if (err) {
      setError(err);
      return;
    }
    setList((prev) => prev.filter((it) => getId(it) !== id));
    if (editingId === id) closeForm();
  };

  const renderField = (f: FieldDef) => {
    const common = {
      id: `${title}-${f.key}`,
      value: values[f.key] ?? "",
      placeholder: f.placeholder,
      disabled: saving,
    };
    return (
      <div
        key={f.key}
        className={`space-y-1.5 ${f.colSpan === 1 ? "" : "sm:col-span-2"}`}
      >
        {/* The photo card carries its own title. */}
        {f.type !== "image" && (
          <Label htmlFor={common.id}>
            {f.label}
            {f.required && <span className="text-destructive"> *</span>}
          </Label>
        )}
        {f.type === "textarea" ? (
          <Textarea
            {...common}
            rows={3}
            onChange={(e) => setValue(f.key, e.target.value)}
          />
        ) : f.type === "select" ? (
          <Select
            value={common.value}
            onValueChange={(v) => setValue(f.key, v)}
            disabled={saving}
          >
            <SelectTrigger id={common.id}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(f.options ?? []).map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : f.type === "clock" ? (
          <ClockInput
            id={common.id}
            value={common.value}
            disabled={saving}
            onChange={(v) => setValue(f.key, v)}
          />
        ) : f.type === "image" && f.upload ? (
          <div className="space-y-2">
            <ImageUploadCard
              title={f.label}
              imageUrl={common.value || null}
              aspectClassName="aspect-square"
              previewClassName="rounded-full"
              containerClassName="max-w-[96px]"
              emptyLabel="No photo"
              maxSizeMb={5}
              cropAspect={1}
              disabled={saving}
              onUpload={trackUpload(f.upload)}
              onUploaded={(url) => setValue(f.key, url)}
            />
            {common.value && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setValue(f.key, "")}
                disabled={saving}
              >
                Remove photo
              </Button>
            )}
          </div>
        ) : (
          <Input
            {...common}
            type={
              f.type === "url"
                ? "url"
                : f.type === "email"
                ? "email"
                : f.type === "tel"
                ? "tel"
                : "text"
            }
            onChange={(e) => setValue(f.key, e.target.value)}
          />
        )}
      </div>
    );
  };

  const isFormOpen = editingId !== null;
  // While a photo uploads, the form can't close or switch rows, so the photo lands on the item it was picked for.
  const busy = uploading > 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-base">
            {icon}
            {title}
          </CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
        {!disabled && !isFormOpen && (
          <Button type="button" variant="outline" size="sm" onClick={openNew}>
            <Plus className="h-4 w-4" />
            {addLabel}
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4 px-4 py-4">
        {error && <p className="text-sm text-destructive">{error}</p>}

        {list.length === 0 && !isFormOpen && (
          <p className="text-sm text-muted-foreground">{emptyText}</p>
        )}

        {list.length > 0 && (
          <ul className="divide-y divide-border">
            {(sort ? [...list].sort(sort) : list).map((item) => {
              const id = getId(item);
              return (
                <li
                  key={id}
                  className="flex items-start justify-between gap-3 py-2.5"
                >
                  <div className="min-w-0 flex-1 text-sm">
                    {renderSummary(item)}
                  </div>
                  {!disabled && (
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => openEdit(item)}
                        disabled={busy}
                        aria-label="Edit"
                      >
                        <PencilSimple className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(id)}
                        disabled={deletingId === id || busy}
                        aria-label="Delete"
                      >
                        {deletingId === id ? (
                          <Spinner className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash className="h-4 w-4 text-destructive" />
                        )}
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {isFormOpen && (
          <div className="space-y-4 border-t border-border pt-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">
                {editingId === "new" ? `New ${addLabel.toLowerCase()}` : "Edit"}
              </p>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={closeForm}
                disabled={busy}
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {fields.map(renderField)}
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={closeForm}
                disabled={saving || busy}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleSave}
                disabled={saving || busy}
              >
                {saving ? "Saving…" : busy ? "Uploading…" : "Save"}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * A time as "1:30 pm": the time box, then am | pm as two buttons, so the half
 * of the day is always a visible choice (a browser time box hid it and let
 * "1:00" save as 1 am). "13:30" typed in the box reads as 24-hour.
 */
function ClockInput({
  id,
  value,
  disabled,
  onChange,
}: {
  id: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const [, time = "", half = "am"] = value.match(/^(.*?)\s*(am|pm)?$/) ?? [];
  return (
    <div className="flex gap-2">
      <Input
        id={id}
        value={time}
        inputMode="numeric"
        placeholder="10:30"
        className="w-24"
        disabled={disabled}
        onChange={(e) => onChange(`${e.target.value.trim()} ${half}`)}
      />
      <div role="group" aria-label="am or pm" className="inline-flex rounded-md border border-input p-0.5">
        {(["am", "pm"] as const).map((h) => (
          <button
            key={h}
            type="button"
            aria-pressed={half === h}
            disabled={disabled}
            onClick={() => onChange(`${time} ${h}`)}
            className={`rounded px-3 text-sm transition-colors ${
              half === h
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {h}
          </button>
        ))}
      </div>
    </div>
  );
}
