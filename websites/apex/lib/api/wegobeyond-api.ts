/**
 * WeGoBeyond (wegobeyond.in) site content and crew sign-ups. Backed by the
 * NestJS `/admin/wegobeyond` routes (platform:manage). Each document comes with
 * its form spec, so the editor builds itself from what the backend validates
 * against; a save names the version it was made from and a stale one gets 409.
 */

import backendClient, { apiCall, ApiError } from "./backend-client";

export const WEGOBEYOND_DOCS = ["initiatives", "gallery", "team", "press", "crew", "settings"] as const;
export type WegobeyondDocName = (typeof WEGOBEYOND_DOCS)[number];

export type FieldKind = "text" | "textarea" | "lines" | "email" | "url" | "date" | "slug" | "select" | "image";

export interface Field {
  key: string;
  label: string;
  kind: FieldKind;
  required?: boolean;
  options?: string[];
  hint?: string;
  max?: number;
}

export interface ListSpec {
  key: string;
  title: string;
  itemLabel: string;
  titleKey: string;
  fields: Field[];
  max?: number;
}

export interface DocSpec {
  title: string;
  blurb: string;
  fields: Field[];
  lists: ListSpec[];
}

export type DocData = Record<string, unknown>;

export interface WegobeyondDoc {
  name: WegobeyondDocName;
  spec: DocSpec;
  data: DocData;
  version: number;
  updatedAt: string;
}

/** The crew sign-up form (the `crew` document's `fields`); see the backend's crew-form.ts. */
export type QuestionType =
  | "short"
  | "long"
  | "email"
  | "phone"
  | "url"
  | "number"
  | "date"
  | "choice"
  | "multi"
  | "yesno"
  | "heading";
export type QuestionWidth = "full" | "half" | "third";
export type ChoiceDisplay = "dropdown" | "pills" | "tiles" | "list";

export interface FormQuestion {
  /** Stable answer key; locked once saved. */
  id: string;
  type: QuestionType;
  label: string;
  help: string;
  placeholder: string;
  required: boolean;
  /** Choice / multi only: one per line, optional hint after " | ". */
  options: string[];
  width: QuestionWidth;
  display: ChoiceDisplay;
}

export interface CrewForm {
  intro: string;
  consent: string;
  submitLabel: string;
  successTitle: string;
  successBody: string;
  fields: FormQuestion[];
}

/** Always asked (contact details): type and required are fixed, they can't be removed. */
export const CORE_QUESTIONS = ["name", "email", "phone", "city"];
/** Keys a sign-up uses for itself; no question may take one. */
export const RESERVED_IDS = ["consent", "company_website", "timestamp", "event", "answers"];
/** Answers with their own sign-up column; the rest are in `answers`. */
export const COLUMN_FIELDS = ["name", "email", "phone", "city", "organization", "role", "interests", "availability", "experience", "links"];

/** "Label | hint" → { label, hint }. The stored answer is always the label. */
export function parseOption(line: string) {
  const [label, ...rest] = line.split(" | ");
  return { label: label.trim(), hint: rest.join(" | ").trim() };
}

export interface CrewSignup {
  id: string;
  name: string;
  email: string;
  phone: string;
  city: string;
  organization: string;
  role: string;
  interests: string[];
  availability: string[];
  experience: string;
  links: string;
  /** Answers to every other question, keyed by question id. */
  answers: Record<string, string | string[]>;
  createdAt: string;
}

type Result<T> = Promise<{ data: T | null; error: ApiError | null }>;

export const getWegobeyondDoc = (name: WegobeyondDocName): Result<WegobeyondDoc> =>
  apiCall(backendClient.get(`/admin/wegobeyond/docs/${name}`));

export const saveWegobeyondDoc = (name: WegobeyondDocName, data: DocData, version: number): Result<WegobeyondDoc> =>
  apiCall(backendClient.put(`/admin/wegobeyond/docs/${name}`, { data, version }));

export function uploadWegobeyondPhoto(file: File): Result<{ url: string }> {
  const form = new FormData();
  form.append("file", file);
  return apiCall(backendClient.post("/admin/wegobeyond/photos", form, { headers: { "Content-Type": "multipart/form-data" } }));
}

export const listCrewSignups = (): Result<CrewSignup[]> => apiCall(backendClient.get("/admin/wegobeyond/crew-signups"));
