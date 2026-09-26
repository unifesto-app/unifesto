/**
 * Careers API — admin management of public job postings.
 *
 * Backed by the NestJS `/careers` controller. The public list/detail routes are
 * open; the CRUD routes here are ADMIN-guarded. Applications are handled off
 * platform (mailto on the web careers page), so there are no applicant records.
 */

import backendClient, { apiCall, ApiError } from "./backend-client";

export type CareerStatus = "OPEN" | "CLOSED" | "DRAFT";

export interface Career {
  id: string;
  title: string;
  department: string;
  location: string;
  type: string;
  experienceLevel: string;
  description: string;
  requirements: string[];
  responsibilities: string[];
  benefits: string[];
  salaryRange: string | null;
  status: CareerStatus;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { applications: number };
}

export type ApplicationStatus =
  | "NEW"
  | "REVIEWING"
  | "SHORTLISTED"
  | "REJECTED"
  | "HIRED";

export interface CareerApplication {
  id: string;
  careerId: string;
  fullName: string;
  email: string;
  phone: string | null;
  resumeUrl: string;
  coverLetter: string | null;
  linkedinUrl: string | null;
  portfolioUrl: string | null;
  status: ApplicationStatus;
  createdAt: string;
}

export interface CareerInput {
  title: string;
  department: string;
  location: string;
  type: string;
  experienceLevel: string;
  description: string;
  requirements: string[];
  responsibilities: string[];
  benefits: string[];
  salaryRange?: string;
  status?: CareerStatus;
}

type Result<T> = Promise<{ data: T | null; error: ApiError | null }>;

/** `GET /careers/admin` — every role, any status. */
export async function getAllCareers(): Result<Career[]> {
  return apiCall<Career[]>(backendClient.get("/careers/admin"));
}

/** `POST /careers`. */
export async function createCareer(input: CareerInput): Result<Career> {
  return apiCall<Career>(backendClient.post("/careers", input));
}

/** `PATCH /careers/:id`. */
export async function updateCareer(
  id: string,
  input: Partial<CareerInput>
): Result<Career> {
  return apiCall<Career>(backendClient.patch(`/careers/${id}`, input));
}

/** `DELETE /careers/:id`. */
export async function deleteCareer(id: string): Result<{ deleted: boolean }> {
  return apiCall<{ deleted: boolean }>(backendClient.delete(`/careers/${id}`));
}

// ============================================================================
// APPLICATIONS
// ============================================================================

/** `GET /careers/:careerId/applications`. */
export async function getApplications(
  careerId: string
): Result<{
  career: { id: string; title: string } | null;
  applications: CareerApplication[];
}> {
  return apiCall(backendClient.get(`/careers/${careerId}/applications`));
}

/** `PATCH /careers/applications/:id`. */
export async function updateApplicationStatus(
  id: string,
  status: ApplicationStatus
): Result<CareerApplication> {
  return apiCall<CareerApplication>(
    backendClient.patch(`/careers/applications/${id}`, { status })
  );
}

/** `DELETE /careers/applications/:id`. */
export async function deleteApplication(
  id: string
): Result<{ deleted: boolean }> {
  return apiCall<{ deleted: boolean }>(
    backendClient.delete(`/careers/applications/${id}`)
  );
}
