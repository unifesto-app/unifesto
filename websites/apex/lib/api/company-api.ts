/**
 * Company section API (Track U): compliance obligations with owners, due dates
 * and an activity log. Restricted items never reach callers without
 * company:view-restricted.
 */

import backendClient, { apiCall, ApiError } from "./backend-client";

export const COMPANY_CATEGORIES = ["ROC", "TAX", "GST", "IP", "GOVERNANCE", "PEOPLE", "FINANCE", "FUNDING"] as const;
export type CompanyCategory = (typeof COMPANY_CATEGORIES)[number];

export const COMPANY_STATUSES = ["TODO", "IN_PROGRESS", "WAITING", "FILED", "DONE", "NA"] as const;
export type CompanyStatus = (typeof COMPANY_STATUSES)[number];

export const COMPANY_RECURRENCES = ["NONE", "MONTHLY", "QUARTERLY", "ANNUAL"] as const;
export type CompanyRecurrence = (typeof COMPANY_RECURRENCES)[number];

export interface CompanyPerson {
  id: string;
  fullName: string | null;
  username: string | null;
}

export interface CompanyItem {
  id: string;
  number: number;
  title: string;
  category: CompanyCategory;
  status: CompanyStatus;
  dueDate: string | null;
  ownerId: string | null;
  owner?: CompanyPerson | null;
  restricted: boolean;
  filedOn: string | null;
  reference: string | null;
  notes: string | null;
  recurrence: CompanyRecurrence;
  updatedAt: string;
}

export interface CompanyActivity {
  id: string;
  actor: string;
  message: string;
  createdAt: string;
}

export type CompanyItemInput = Partial<
  Pick<
    CompanyItem,
    "number" | "title" | "category" | "status" | "dueDate" | "ownerId" | "restricted" | "filedOn" | "reference" | "notes" | "recurrence"
  >
>;

type Result<T> = Promise<{ data: T | null; error: ApiError | null }>;

export const getCompanyItems = (): Result<CompanyItem[]> => apiCall(backendClient.get("/company/items"));
export const getCompanyItem = (number: number): Result<CompanyItem & { activity: CompanyActivity[] }> =>
  apiCall(backendClient.get(`/company/items/${number}`));
export const upsertCompanyItem = (input: CompanyItemInput): Result<CompanyItem> =>
  apiCall(backendClient.put("/company/items", input));
export const addCompanyNote = (number: number, message: string): Result<CompanyActivity> =>
  apiCall(backendClient.post(`/company/items/${number}/notes`, { message }));
export const getCompanyPeople = (): Result<CompanyPerson[]> => apiCall(backendClient.get("/company/people"));
