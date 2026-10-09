/*
 * Unifesto Stay, team side: trimmed from mobile/src/lib/api/stays.ts (the
 * attendee booking and payment routes live in the app only).
 *
 *   Stay         one property (hostel, hotel…) with a bookable date window
 *   StayOption   a pool of beds with one price ("Dorm bed (boys)")
 *   StayBooking  a request for beds over some nights; once confirmed it
 *                carries the Stay Pass shown at the property
 *
 * Dates are calendar days, "YYYY-MM-DD". Money is rupees.
 */
import { authedFetch, call, type Result } from './call';
import type { FormFieldType } from './events-api';
import type { FileAnswer, FormFieldConfig } from '../form-questions';

export type StayPropertyType = 'HOSTEL' | 'HOTEL' | 'DORMITORY' | 'GUEST_HOUSE' | 'HOMESTAY' | 'OTHER';
export type StayGender = 'ANY' | 'MALE' | 'FEMALE';
export type StayPaymentMode = 'FREE' | 'PAY_AT_PROPERTY' | 'ONLINE';
export type StayPricing = 'PER_NIGHT' | 'PER_STAY';
export type GuestGender = 'MALE' | 'FEMALE' | 'OTHER';
export type StayBookingStatus =
  | 'PENDING'
  | 'AWAITING_PAYMENT'
  | 'CONFIRMED'
  | 'CHECKED_IN'
  | 'CHECKED_OUT'
  | 'REJECTED'
  | 'CANCELLED'
  | 'EXPIRED';

export interface StayNight {
  date: string;
  left: number;
}

export interface StayOption {
  id: string;
  name: string;
  description: string | null;
  gender: StayGender;
  totalBeds: number;
  price: number;
  pricing: StayPricing;
  paymentMode: StayPaymentMode;
  maxGuests: number;
  isActive: boolean;
  order: number;
  /** Beds left on each night of the stay's window. */
  nights?: StayNight[];
  /** Fewest beds left on any night. */
  bedsLeft?: number;
}

export interface StayQuestion {
  id: string;
  label: string;
  type: FormFieldType;
  options: string[];
  isRequired: boolean;
  order: number;
  helpText: string | null;
  config: FormFieldConfig | null;
  showIf: { fieldId: string; anyOf: string[] } | null;
}

export interface Stay {
  id: string;
  eventId: string;
  name: string;
  propertyType: StayPropertyType;
  description: string | null;
  coverImageUrl: string | null;
  galleryUrls: string[];
  address: string | null;
  city: string | null;
  mapUrl: string | null;
  amenities: string[];
  houseRules: string | null;
  contactName: string | null;
  contactPhone: string | null;
  checkInFrom: string;
  checkOutUntil: string;
  checkInTime: string | null;
  checkOutTime: string | null;
  requireIdProof: boolean;
  paymentWindowHours: number;
  isPublished: boolean;
  order: number;
  options: StayOption[];
  questions: StayQuestion[];
}

export interface TeamStay extends Stay {
  counts: { pending: number; awaitingPayment: number; confirmed: number; confirmedGuests: number; checkedIn: number };
}

export interface StayGuest {
  id?: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  gender: GuestGender;
  isBooker?: boolean;
  idProof?: FileAnswer | null;
}

export interface StayBooking {
  id: string;
  status: StayBookingStatus;
  checkInDate: string;
  checkOutDate: string;
  nights: number;
  guestCount: number;
  arrivalAt: string | null;
  emergencyName: string | null;
  emergencyPhone: string | null;
  note: string | null;
  allocation: string | null;
  rejectionReason: string | null;
  cancellationReason: string | null;
  cancelledAt: string | null;
  checkedInAt: string | null;
  checkedOutAt: string | null;
  createdAt: string;
  paymentMode: StayPaymentMode;
  baseAmount: number;
  processingFee: number;
  totalAmount: number;
  paymentStatus: 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED' | 'PARTIALLY_REFUNDED' | null;
  paidAt: string | null;
  refundedAmount: number;
  paymentDueAt: string | null;
  /** Null until confirmed (guest view). */
  passCode: string | null;
  option: { id: string; name: string; gender: StayGender; pricing: StayPricing; price: number };
  stay: Pick<
    Stay,
    | 'id'
    | 'name'
    | 'propertyType'
    | 'coverImageUrl'
    | 'address'
    | 'city'
    | 'mapUrl'
    | 'amenities'
    | 'houseRules'
    | 'contactName'
    | 'contactPhone'
    | 'checkInTime'
    | 'checkOutTime'
  >;
  event: { id: string; title: string; slug: string; startDateTime: string; endDateTime: string; coverImageUrl: string | null };
  guests: StayGuest[];
  answers: Record<string, unknown>;
}

/** The team's view of a booking. */
export interface TeamStayBooking extends StayBooking {
  passCode: string;
  staffNote: string | null;
  registrationId: string | null;
  reviewedAt: string | null;
  user: { id: string; fullName: string | null; username: string | null; avatarUrl: string | null; mobileNumber: string | null };
  questions: { id: string; label: string; type: FormFieldType; options: string[]; order: number }[];
}

export interface StayInput {
  name: string;
  propertyType?: StayPropertyType;
  description?: string | null;
  address?: string | null;
  city?: string | null;
  mapUrl?: string | null;
  amenities?: string[];
  houseRules?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  checkInFrom: string;
  checkOutUntil: string;
  checkInTime?: string | null;
  checkOutTime?: string | null;
  requireIdProof?: boolean;
  paymentWindowHours?: number;
  isPublished?: boolean;
}

export interface StayOptionInput {
  name: string;
  description?: string | null;
  gender?: StayGender;
  totalBeds: number;
  price?: number;
  pricing?: StayPricing;
  paymentMode?: StayPaymentMode;
  maxGuests?: number;
  isActive?: boolean;
}

export interface StayQuestionInput {
  label: string;
  type: FormFieldType;
  options?: string[];
  isRequired?: boolean;
  order?: number;
  helpText?: string | null;
  config?: FormFieldConfig | null;
  showIf?: { fieldId: string; anyOf: string[] } | null;
}

/** Space-web route of an event's Stay section. */
export const staysBase = (eventId: string) => `/dashboard/events/${eventId}/stays`;

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
});

// ── Team: setup ─────────────────────────────────────────────────────────────

export const getTeamStays = (eventId: string) =>
  call<{ pendingRequests: number; stays: TeamStay[] }>(`/events/${eventId}/stays/manage`);
export const getTeamStay = (eventId: string, stayId: string) => call<Stay>(`/events/${eventId}/stays/manage/${stayId}`);
export const createStay = (eventId: string, body: StayInput) => call<Stay>(`/events/${eventId}/stays`, json('POST', body));
export const updateStay = (eventId: string, stayId: string, body: Partial<StayInput>) =>
  call<Stay>(`/events/${eventId}/stays/${stayId}`, json('PATCH', body));
export const deleteStay = (eventId: string, stayId: string) =>
  call<{ deleted: boolean }>(`/events/${eventId}/stays/${stayId}`, { method: 'DELETE' });
/** POST one image file as multipart, Result-style. */
async function postImage<T>(path: string, file: File): Promise<Result<T>> {
  const body = new FormData();
  body.append('file', file);
  try {
    const res = await authedFetch(path, { method: 'POST', body });
    const data = await res.json().catch(() => null);
    if (res.ok) return { ok: true, data: data as T };
    return { ok: false, denied: res.status === 403, message: data?.message || "Couldn't upload the photo." };
  } catch {
    return { ok: false, denied: false, message: 'No connection' };
  }
}
export const uploadStayCover = (eventId: string, stayId: string, file: File) =>
  postImage<{ coverImageUrl: string }>(`/events/${eventId}/stays/${stayId}/cover`, file);
export const addStayGalleryPhoto = (eventId: string, stayId: string, file: File) =>
  postImage<{ galleryUrls: string[] }>(`/events/${eventId}/stays/${stayId}/gallery`, file);
export const removeStayGalleryPhoto = (eventId: string, stayId: string, url: string) =>
  call<{ galleryUrls: string[] }>(`/events/${eventId}/stays/${stayId}/gallery/remove`, json('POST', { url }));
/** Same cap as the backend's STAY_GALLERY_MAX. */
export const STAY_GALLERY_MAX = 12;

export const createStayOption = (eventId: string, stayId: string, body: StayOptionInput) =>
  call<Stay>(`/events/${eventId}/stays/${stayId}/options`, json('POST', body));
export const updateStayOption = (eventId: string, stayId: string, optionId: string, body: Partial<StayOptionInput>) =>
  call<Stay>(`/events/${eventId}/stays/${stayId}/options/${optionId}`, json('PATCH', body));
export const deleteStayOption = (eventId: string, stayId: string, optionId: string) =>
  call<Stay>(`/events/${eventId}/stays/${stayId}/options/${optionId}`, { method: 'DELETE' });

export const createStayQuestion = (eventId: string, stayId: string, body: StayQuestionInput) =>
  call<Stay>(`/events/${eventId}/stays/${stayId}/questions`, json('POST', body));
export const updateStayQuestion = (eventId: string, stayId: string, questionId: string, body: Partial<StayQuestionInput>) =>
  call<Stay>(`/events/${eventId}/stays/${stayId}/questions/${questionId}`, json('PATCH', body));
export const deleteStayQuestion = (eventId: string, stayId: string, questionId: string) =>
  call<Stay>(`/events/${eventId}/stays/${stayId}/questions/${questionId}`, { method: 'DELETE' });

// ── Team: bookings & property desk ──────────────────────────────────────────

export function getStayBookings(eventId: string, opts: { status?: StayBookingStatus; stayId?: string; search?: string } = {}) {
  const q = new URLSearchParams();
  if (opts.status) q.set('status', opts.status);
  if (opts.stayId) q.set('stayId', opts.stayId);
  if (opts.search?.trim()) q.set('search', opts.search.trim());
  const qs = q.toString();
  return call<TeamStayBooking[]>(`/events/${eventId}/stay-bookings${qs ? `?${qs}` : ''}`);
}
export const getStayBooking = (eventId: string, bookingId: string) =>
  call<TeamStayBooking>(`/events/${eventId}/stay-bookings/${bookingId}`);
export const lookupStayPass = (eventId: string, passCode: string) =>
  call<TeamStayBooking>(`/events/${eventId}/stay-pass/${encodeURIComponent(passCode.trim().toUpperCase())}`);
export const approveStayBooking = (eventId: string, bookingId: string, allocation?: string) =>
  call<TeamStayBooking>(`/events/${eventId}/stay-bookings/${bookingId}/approve`, json('POST', { allocation }));
export const rejectStayBooking = (eventId: string, bookingId: string, reason?: string) =>
  call<TeamStayBooking>(`/events/${eventId}/stay-bookings/${bookingId}/reject`, json('POST', { reason }));
export const updateStayBooking = (eventId: string, bookingId: string, body: { allocation?: string | null; staffNote?: string | null }) =>
  call<TeamStayBooking>(`/events/${eventId}/stay-bookings/${bookingId}`, json('PATCH', body));
export const cancelStayBooking = (eventId: string, bookingId: string, body: { reason?: string; refund?: boolean }) =>
  call<TeamStayBooking>(`/events/${eventId}/stay-bookings/${bookingId}/cancel`, json('POST', body));
export const markStayPaid = (eventId: string, bookingId: string) =>
  call<TeamStayBooking>(`/events/${eventId}/stay-bookings/${bookingId}/mark-paid`, json('POST'));
export const checkInStay = (eventId: string, bookingId: string) =>
  call<TeamStayBooking>(`/events/${eventId}/stay-bookings/${bookingId}/check-in`, json('POST'));
export const checkOutStay = (eventId: string, bookingId: string) =>
  call<TeamStayBooking>(`/events/${eventId}/stay-bookings/${bookingId}/check-out`, json('POST'));

// ── Display helpers ─────────────────────────────────────────────────────────

export const PROPERTY_LABELS: Record<StayPropertyType, string> = {
  HOSTEL: 'Hostel',
  HOTEL: 'Hotel',
  DORMITORY: 'Dormitory',
  GUEST_HOUSE: 'Guest house',
  HOMESTAY: 'Homestay',
  OTHER: 'Other',
};

export const GENDER_LABELS: Record<StayGender, string> = { ANY: 'Anyone', MALE: 'Men only', FEMALE: 'Women only' };
export const GUEST_GENDER_LABELS: Record<GuestGender, string> = { MALE: 'Male', FEMALE: 'Female', OTHER: 'Other' };

export const PAYMENT_LABELS: Record<StayPaymentMode, string> = {
  FREE: 'Free',
  PAY_AT_PROPERTY: 'Pay at the property',
  ONLINE: 'Pay in the app',
};

export const STATUS_LABELS: Record<StayBookingStatus, string> = {
  PENDING: 'Requested',
  AWAITING_PAYMENT: 'Approved, pay now',
  CONFIRMED: 'Confirmed',
  CHECKED_IN: 'Checked in',
  CHECKED_OUT: 'Checked out',
  REJECTED: 'Declined',
  CANCELLED: 'Cancelled',
  EXPIRED: 'Payment window closed',
};

export const rupees = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

/** "₹300 / night" or "₹900 / stay" or "Free". */
export function priceLabel(o: Pick<StayOption, 'price' | 'pricing'>) {
  if (!o.price) return 'Free';
  return `${rupees(o.price)} / ${o.pricing === 'PER_NIGHT' ? 'night' : 'stay'}`;
}

/** "YYYY-MM-DD" → Date at local midnight. */
export const fromDay = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
/** Date → "YYYY-MM-DD" in local time. */
export const toDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const addDays = (s: string, n: number) => {
  const d = fromDay(s);
  d.setDate(d.getDate() + n);
  return toDay(d);
};
/** "Sat 10 Oct". */
export const dayLabel = (s: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }) =>
  fromDay(s).toLocaleDateString('en-IN', opts);
/** "Sat 10 Oct → Mon 12 Oct · 2 nights". */
export const rangeLabel = (from: string, to: string, nights: number) =>
  `${dayLabel(from)} → ${dayLabel(to)} · ${nights} night${nights === 1 ? '' : 's'}`;
