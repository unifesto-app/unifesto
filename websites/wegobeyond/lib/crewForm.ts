// The crew sign-up form, as data: edited in Unifesto Apex, drawn by the site from the
// definition (getContent().crewForm), and every sign-up is checked against the same one
// here (instant feedback) and again by the Unifesto API (the real check, same rules).
// No imports, so the self-check runs in plain Node: lib/crewForm.check.ts.

export type FieldType =
  | "short"
  | "long"
  | "email"
  | "phone"
  | "url"
  | "number"
  | "date"
  | "choice" // pick one
  | "multi" // pick any
  | "yesno"
  | "heading"; // a section title and line of text, no input

export type FieldWidth = "full" | "half" | "third";
export type ChoiceDisplay = "dropdown" | "pills" | "tiles" | "list";

export type FormField = {
  /** Stable answer key, lowercase-and-dashes. Never reuse one for a different question. */
  id: string;
  type: FieldType;
  label: string;
  help: string;
  placeholder: string;
  required: boolean;
  /** For choice and multi. A line can carry a hint after " | " (shown in tiles). */
  options: string[];
  width: FieldWidth;
  /** For choice and multi; dropdown only applies to choice. */
  display: ChoiceDisplay;
};

export type CrewFormDef = {
  intro: string;
  consent: string;
  submitLabel: string;
  successTitle: string;
  successBody: string;
  fields: FormField[];
};

export const FIELD_TYPES: FieldType[] = ["short", "long", "email", "phone", "url", "number", "date", "choice", "multi", "yesno", "heading"];
export const FIELD_WIDTHS: FieldWidth[] = ["full", "half", "third"];
export const CHOICE_DISPLAYS: ChoiceDisplay[] = ["dropdown", "pills", "tiles", "list"];

/** Always on the form (contact details); can be renamed, resized and moved, not removed. */
export const CORE_FIELDS = ["name", "email", "phone", "city"] as const;

/** Keys the sign-up payload uses for itself; no question may take one as its id. */
export const RESERVED_IDS = ["consent", "company_website", "timestamp", "event", "answers"] as const;

/** Fields that have their own sheet / database column; every other answer goes in `answers`. */
export const COLUMN_FIELDS = ["name", "email", "phone", "city", "organization", "role", "interests", "availability", "experience", "links"] as const;

/** "Label | hint" → { label, hint }. The stored answer is always the label. */
export function parseOption(line: string) {
  const [label, ...rest] = line.split(" | ");
  return { label: label.trim(), hint: rest.join(" | ").trim() };
}

export type Answer = string | string[];
export type Values = Record<string, Answer>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^[0-9+()\-.\s]{7,20}$/;
const URL_RE = /^https?:\/\/[^\s]+$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX: Partial<Record<FieldType, number>> = { short: 200, long: 2000, url: 500, email: 200, phone: 20, number: 30 };

const asText = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const asList = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").map((s) => s.trim()) : []);

/**
 * Check one submission against the form. Unknown keys are ignored, choices must be one
 * of the field's own options, and every value is length-capped, so nothing arbitrary
 * reaches the sheet. Used by the form (instant feedback) and the API (the real check).
 */
export function validateSubmission(def: CrewFormDef, raw: Record<string, unknown>) {
  const errors: Record<string, string> = {};
  const clean: Values = {};

  for (const f of def.fields) {
    if (f.type === "heading") continue;
    const labels = f.options.map((o) => parseOption(o).label);

    if (f.type === "multi") {
      const picked = asList(raw[f.id]).filter((v) => labels.includes(v));
      if (f.required && picked.length === 0) errors[f.id] = "Pick at least one.";
      clean[f.id] = picked;
      continue;
    }

    const v = asText(raw[f.id]);
    clean[f.id] = v;
    if (!v) {
      if (f.required) errors[f.id] = f.type === "choice" || f.type === "yesno" ? "Pick one." : "This is required.";
      continue;
    }
    const max = MAX[f.type];
    if (max && v.length > max) errors[f.id] = `Keep this under ${max} characters.`;
    else if (f.type === "email" && !EMAIL.test(v)) errors[f.id] = "That email doesn’t look right.";
    else if (f.type === "phone" && !PHONE.test(v)) errors[f.id] = "That number doesn’t look right.";
    else if (f.type === "url" && !URL_RE.test(v)) errors[f.id] = "Use a full link, starting with https://";
    else if (f.type === "number" && Number.isNaN(Number(v))) errors[f.id] = "Use a number.";
    else if (f.type === "date" && (!DATE.test(v) || Number.isNaN(Date.parse(v)))) errors[f.id] = "Use a date.";
    else if (f.type === "choice" && !labels.includes(v)) errors[f.id] = "Pick one of the options.";
    else if (f.type === "yesno" && v !== "Yes" && v !== "No") errors[f.id] = "Pick yes or no.";
  }

  return { errors, clean };
}
