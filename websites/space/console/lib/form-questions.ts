/**
 * Registration-question rules, mirrored from the backend
 * (`backend/src/registrations/form-answers.util.ts`, the source of truth) so
 * forms can show and check answers instantly. Keep the two in step.
 */
import type { EventFormField, FormFieldType } from "@/console/lib/api/events-api";

export const FIELD_TYPES: { value: FormFieldType; label: string; hint: string }[] = [
  { value: "TEXT", label: "Short text", hint: "One line" },
  { value: "TEXTAREA", label: "Paragraph", hint: "Several lines" },
  { value: "NUMBER", label: "Number", hint: "Digits only" },
  { value: "EMAIL", label: "Email", hint: "A valid email" },
  { value: "PHONE", label: "Phone", hint: "A phone number" },
  { value: "URL", label: "Link", hint: "GitHub, LinkedIn, portfolio" },
  { value: "DATE", label: "Date", hint: "Picked from a calendar" },
  { value: "SELECT", label: "Dropdown", hint: "Pick one from a list" },
  { value: "RADIO", label: "Single choice", hint: "Pick one, all shown" },
  { value: "CHECKBOX", label: "Checkboxes", hint: "Pick any" },
  { value: "YES_NO", label: "Yes / No tick", hint: "Consent or a simple yes" },
  { value: "STATE", label: "State / UT", hint: "Indian states and UTs" },
  { value: "RATING", label: "Rating", hint: "1 to 5 or 1 to 10" },
  { value: "FILE", label: "File upload", hint: "Resume, ID, deck" },
  { value: "SECTION", label: "Section heading", hint: "Splits the form, no answer" },
];

export const fieldTypeLabel = (t: FormFieldType) =>
  FIELD_TYPES.find((f) => f.value === t)?.label ?? t.toLowerCase();

/** The organiser lists the options. */
export const OPTION_TYPES: FormFieldType[] = ["SELECT", "RADIO", "CHECKBOX"];
/** Can drive a show-if condition. */
export const CHOICE_TYPES: FormFieldType[] = ["SELECT", "RADIO", "CHECKBOX", "YES_NO", "STATE"];

export const INDIAN_STATES_AND_UTS = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa",
  "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala",
  "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland",
  "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura",
  "Uttar Pradesh", "Uttarakhand", "West Bengal",
  "Andaman and Nicobar Islands", "Chandigarh",
  "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Jammu and Kashmir",
  "Ladakh", "Lakshadweep", "Puducherry",
];

export type FileKind = "pdf" | "image" | "doc";
export const FILE_KINDS: { value: FileKind; label: string; accept: string }[] = [
  { value: "pdf", label: "PDF", accept: "application/pdf" },
  { value: "image", label: "Image", accept: "image/jpeg,image/png,image/webp,image/heic,image/heif" },
  {
    value: "doc",
    label: "Word document",
    accept:
      "application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  },
];
export const FILE_DEFAULT_KINDS: FileKind[] = ["pdf", "image"];
export const FILE_DEFAULT_MAX_MB = 5;
export const FILE_MAX_MB_CAP = 10;

export interface FormFieldConfig {
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  minDate?: string;
  maxDate?: string;
  minPicks?: number;
  maxPicks?: number;
  scale?: 5 | 10;
  fileKinds?: FileKind[];
  maxSizeMb?: number;
}

export interface ShowIf {
  fieldId: string;
  anyOf: string[];
}

export interface FileAnswer {
  key: string;
  name: string;
  size: number;
  mime: string;
}

export const configOf = (f: Pick<EventFormField, "config">): FormFieldConfig =>
  (f.config ?? {}) as FormFieldConfig;

export function choicesFor(f: Pick<EventFormField, "type" | "options">): string[] {
  if (f.type === "STATE") return INDIAN_STATES_AND_UTS;
  if (f.type === "YES_NO") return ["Yes", "No"];
  return f.options ?? [];
}

function answerTokens(f: Pick<EventFormField, "type">, v: unknown): string[] {
  if (v === true) return ["Yes"];
  if (v === false) return f.type === "YES_NO" ? ["No"] : [];
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === "string" && v) return [v];
  return [];
}

/** Questions the attendee sees, given the answers so far (in order). */
export function visibleFieldIds(
  fields: EventFormField[],
  answers: Record<string, unknown>,
): Set<string> {
  const byId = new Map(fields.map((f) => [f.id, f]));
  const visible = new Set<string>();
  for (const f of [...fields].sort((a, b) => a.order - b.order)) {
    const cond = f.showIf;
    const parent = cond ? byId.get(cond.fieldId) : undefined;
    if (!cond || !parent) {
      visible.add(f.id);
      continue;
    }
    if (!visible.has(parent.id)) continue;
    if (answerTokens(parent, answers[parent.id]).some((t) => cond.anyOf.includes(t))) {
      visible.add(f.id);
    }
  }
  return visible;
}

/** An answer as display text. */
export function formatAnswer(v: unknown): string {
  if (v === null || v === undefined || v === "") return "";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "object") {
    const file = v as Partial<FileAnswer>;
    return typeof file.key === "string" ? file.name || "File" : JSON.stringify(v);
  }
  return String(v);
}

export const isFileAnswer = (v: unknown): v is FileAnswer =>
  !!v && typeof v === "object" && typeof (v as FileAnswer).key === "string";

/** A short summary of a question's limits, for the editor list. */
export function describeLimits(f: EventFormField): string {
  const c = configOf(f);
  const parts: string[] = [];
  if (c.minLength || c.maxLength) parts.push(`${c.minLength ?? 0}–${c.maxLength ?? "∞"} chars`);
  if (c.min !== undefined || c.max !== undefined) parts.push(`${c.min ?? "−∞"} to ${c.max ?? "∞"}`);
  if (c.minDate || c.maxDate) parts.push(`${c.minDate ?? "any"} → ${c.maxDate ?? "any"}`);
  if (c.minPicks || c.maxPicks) parts.push(`pick ${c.minPicks ?? 0}–${c.maxPicks ?? "any"}`);
  if (f.type === "RATING") parts.push(`1–${c.scale === 10 ? 10 : 5}`);
  if (f.type === "FILE") {
    const kinds = (c.fileKinds?.length ? c.fileKinds : FILE_DEFAULT_KINDS)
      .map((k) => FILE_KINDS.find((x) => x.value === k)?.label)
      .join(", ");
    parts.push(`${kinds}, up to ${c.maxSizeMb ?? FILE_DEFAULT_MAX_MB} MB`);
  }
  return parts.join(" · ");
}
