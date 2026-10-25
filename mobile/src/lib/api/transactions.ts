import { File, Paths } from 'expo-file-system';
import { API_URL } from '../constants';
import { getToken } from './helpers';
import { call, type PaymentStatus, type RegistrationStatus } from './manageEvent';

/*
 * An event's money rows. Reads the same registrations list the attendee
 * screen uses (Space-Admin only on the server) and keeps the rows where money
 * was involved; the export is the server's own transactions file.
 */

export interface TransactionRow {
  id: string;
  status: RegistrationStatus;
  paymentStatus: PaymentStatus;
  /** Decimal strings over the wire. totalAmount = base price + processingFee. */
  totalAmount: number | string;
  processingFee: number | string | null;
  refundedAmount: number | string | null;
  paymentId: string | null;
  orderId: string | null;
  paidAt: string | null;
  registeredAt: string;
  ticketTypeId: string | null;
  ticketType?: { id: string; name: string } | null;
  user: { id: string; fullName: string | null; username: string | null; email: string | null };
}

/** Same filter the server's export uses: free RSVPs never count as transactions. */
export const isTransaction = (r: TransactionRow) => Number(r.totalAmount) > 0 || !!r.paymentId || !!r.orderId;

const PAGE = 100;

/** Every registration for the event, 100 per call, then filtered to money rows. */
export async function getTransactions(eventId: string) {
  const first = await call<{ registrations: TransactionRow[]; total?: number; pagination?: { totalPages: number } }>(
    `/events/${eventId}/registrations?page=1&limit=${PAGE}`,
  );
  if (!first.ok) return first;
  const pages = first.data.pagination?.totalPages ?? Math.ceil((first.data.total ?? 0) / PAGE);
  const rows = [...first.data.registrations];
  if (pages > 1) {
    const rest = await Promise.all(
      Array.from({ length: pages - 1 }, (_, i) =>
        call<{ registrations: TransactionRow[] }>(`/events/${eventId}/registrations?page=${i + 2}&limit=${PAGE}`),
      ),
    );
    for (const r of rest) {
      if (!r.ok) return r;
      rows.push(...r.data.registrations);
    }
  }
  return { ok: true as const, data: rows.filter(isTransaction) };
}

/** The money tiles, settled on the server at each sale's own fee (T6). */
export interface TransactionSummary {
  /** Ever captured, buyer fee included. */
  collected: number;
  /** Buyer fees the platform kept. */
  buyerFees: number;
  refunded: number;
  /** Still held, before the organiser's platform fee. */
  gross: number;
  platformFee: number;
  /** What the organiser keeps. */
  net: number;
  pending: number;
  paidCount: number;
}

/** Tiles for the event, or one ticket type of it. */
export function getTransactionSummary(eventId: string, ticketTypeId?: string) {
  const q = ticketTypeId ? `?ticketTypeId=${encodeURIComponent(ticketTypeId)}` : '';
  return call<TransactionSummary>(`/payouts/event/${eventId}/transactions${q}`);
}

export type ExportFormat = 'csv' | 'xlsx' | 'pdf';
const EXT: Record<ExportFormat, string> = { csv: 'csv', xlsx: 'xls', pdf: 'pdf' };

/**
 * Download the server's transactions export into the cache and return the
 * local file, ready for the share sheet. Needs the plan's bulk-export perk.
 */
export async function downloadTransactionsExport(
  eventId: string,
  slug: string,
  format: ExportFormat,
): Promise<{ ok: true; uri: string } | { ok: false; message: string }> {
  const token = await getToken();
  if (!token) return { ok: false, message: 'Sign in again to export' };
  try {
    const dest = new File(Paths.cache, `${slug || eventId}-transactions.${EXT[format]}`);
    const file = await File.downloadFileAsync(
      `${API_URL}/events/${eventId}/registrations/export?format=${format}&type=transactions`,
      dest,
      { headers: { Authorization: `Bearer ${token}` }, idempotent: true },
    );
    return { ok: true, uri: file.uri };
  } catch (e) {
    // A refused export (plan without bulk export) comes back as a non-2xx the downloader throws on.
    return { ok: false, message: e instanceof Error && /403|402|400/.test(e.message) ? "This space's plan doesn't include exports." : 'Export failed' };
  }
}
