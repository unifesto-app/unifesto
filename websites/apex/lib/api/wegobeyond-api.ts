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
