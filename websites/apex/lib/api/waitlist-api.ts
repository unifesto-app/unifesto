/**
 * Waiting list API — the queue behind a sold-out ticket type.
 * Backed by `/events/:id/waitlist`.
 */

import backendClient, { apiCall, ApiError } from "./backend-client";

export type WaitlistStatus =
  | "WAITING"
  | "OFFERED"
  | "CONVERTED"
  | "EXPIRED"
  | "DECLINED";

export interface WaitlistEntry {
  registrationId: string;
  /** 1-based place in the queue, in join order. */
  position: number;
  user: {
    id: string;
    fullName: string | null;
    username: string | null;
    email: string | null;
    mobileNumber: string | null;
    avatarUrl: string | null;
  };
  ticketType: {
    id: string;
    name: string;
    price: number;
    currency: string;
    totalQuantity: number | null;
    soldCount: number;
  } | null;
  quantity: number;
  groupSize: number | null;
  /** Seats this entry needs. A group of 5 needs 5, not 1. */
  seats: number;
  waitlistStatus: WaitlistStatus;
  joinedAt: string | null;
  offeredAt: string | null;
  offerExpiresAt: string | null;
  /** What they owe to claim the spot. Only set while OFFERED. */
  amountDue: number | null;
  paymentStatus: "PENDING" | "PAID" | "FAILED" | "REFUNDED";
}

export interface WaitlistSummaryRow {
  ticketTypeId: string;
  name: string;
  price: number;
  currency: string;
  isPaid: boolean;
  waitlistEnabled: boolean;
  offerTtlHours: number;
  capacity: number | null;
  soldCount: number;
  /** null when the ticket has unlimited capacity. */
  seatsAvailable: number | null;
  waiting: number;
  offered: number;
  converted: number;
  expired: number;
  declined: number;
}

export interface WaitlistPage {
  data: WaitlistEntry[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export async function getEventWaitlist(
  eventId: string,
  params: {
    ticketTypeId?: string;
    status?: WaitlistStatus;
    search?: string;
    page?: number;
    limit?: number;
  } = {}
): Promise<{ data: WaitlistPage | null; error: ApiError | null }> {
  return apiCall<WaitlistPage>(
    backendClient.get(`/events/${eventId}/waitlist`, { params })
  );
}

export async function getWaitlistSummary(
  eventId: string
): Promise<{ data: WaitlistSummaryRow[] | null; error: ApiError | null }> {
  return apiCall<WaitlistSummaryRow[]>(
    backendClient.get(`/events/${eventId}/waitlist/summary`)
  );
}

export interface AllowResult {
  registrationId: string;
  waitlistStatus: WaitlistStatus;
  /** False when the ticket is free — the spot is confirmed immediately. */
  needsPayment: boolean;
  amountDue?: number;
  expiresAt?: string;
  message: string;
}

/**
 * Let one person off the queue. Holds a seat for them straight away; a paid
 * ticket then needs payment before `expiresAt` or the seat is released.
 */
export async function allowFromWaitlist(
  eventId: string,
  registrationId: string
): Promise<{ data: AllowResult | null; error: ApiError | null }> {
  return apiCall<AllowResult>(
    backendClient.post(`/events/${eventId}/waitlist/${registrationId}/allow`)
  );
}

export interface AllowNextResult {
  offeredCount: number;
  requested: number;
  offered: string[];
  skipped: { registrationId: string; reason: string }[];
}

/**
 * Let the next `count` people in for a ticket type, in join order. Admits as
 * many as there are seats for rather than failing when `count` overshoots.
 */
export async function allowNextFromWaitlist(
  eventId: string,
  ticketTypeId: string,
  count: number
): Promise<{ data: AllowNextResult | null; error: ApiError | null }> {
  return apiCall<AllowNextResult>(
    backendClient.post(`/events/${eventId}/waitlist/allow-next`, {
      ticketTypeId,
      count,
    })
  );
}
