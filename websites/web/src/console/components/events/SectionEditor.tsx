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

export type FieldType =
  | "text"
  | "textarea"
  | "datetime"
  | "url"
  | "email"
  | "tel";

export interface FieldDef {
  key: string;
  label: string;
  type?: FieldType;
  required?: boolean;
  placeholder?: string;
  /** Grid columns the field spans (1 or 2). Defaults to 2 (full width). */
  colSpan?: 1 | 2;
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
  /** Initial form values for a new item (null) or an existing one. */
  toForm: (item: T | null) => FormValues;
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
  onCreate,
  onUpdate,
  onDelete,
}: SectionEditorProps<T>) {
  const [list, setList] = useState<T[]>(items);
  // null = form closed; "new" = adding; otherwise the id being edited.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [values, setValues] = useState<FormValues>({});
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const openNew = () => {
    setEditingId("new");
    setValues(toForm(null));
    setError("");
  };

  const openEdit = (item: T) => {
    setEditingId(getId(item));
    setValues(toForm(item));
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
    return null;
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
        <Label htmlFor={common.id}>
          {f.label}
          {f.required && <span className="text-destructive"> *</span>}
        </Label>
        {f.type === "textarea" ? (
          <Textarea
            {...common}
            rows={3}
            onChange={(e) => setValue(f.key, e.target.value)}
          />
        ) : (
          <Input
            {...common}
            type={
              f.type === "datetime"
                ? "datetime-local"
                : f.type === "url"
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
            {list.map((item) => {
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
                        aria-label="Edit"
                      >
                        <PencilSimple className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(id)}
                        disabled={deletingId === id}
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
                disabled={saving}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
