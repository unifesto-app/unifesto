import { getAdminPayouts, getAdminRefunds, type AdminPayout, type AdminRefundStatus, type PayoutStatus, type RequestStatus, type Result } from './api/apex';
import type { RefundRequest } from './api/finance';
import { QUEUES, rememberQueueItem, type QueueKind } from './apexQueues';
import { shortDate } from '../components/apex/ApexRow';
import { inr } from '../utils/money';

/*
 * Every Apex decision in one list: the seven approval queues plus refunds and
 * payouts. Each source maps its own status words onto three shared tabs and its
 * rows onto RequestRow, so the Requests screen never branches on the type.
 */

export type RequestTab = 'open' | 'approved' | 'rejected';
export type RequestSource = QueueKind | 'refund' | 'payout';

export interface RequestRow {
  /** Unique across sources. */
  key: string;
  source: RequestSource;
  title: string;
  meta: string;
  /** Right-aligned, e.g. an amount. */
  value?: string;
  createdAt: string;
  /** Route to the review screen (after stashing the row for hand-off). */
  open: () => string;
}

export interface RequestSourceDef {
  source: RequestSource;
  /** Short, for the filter chips and section headers. */
  label: string;
  fetch: (tab: RequestTab) => Promise<Result<RequestRow[]>>;
}

// Big enough that the merged list is the whole backlog; queues already fetch 100.
const PAGE = 100;

const QUEUE_STATUS: Record<RequestTab, RequestStatus> = { open: 'PENDING', approved: 'APPROVED', rejected: 'REJECTED' };
const REFUND_STATUS: Record<RequestTab, AdminRefundStatus> = { open: 'PENDING_ADMIN', approved: 'APPROVED', rejected: 'REJECTED' };
const PAYOUT_STATUS: Record<RequestTab, PayoutStatus> = { open: 'PENDING', approved: 'COMPLETED', rejected: 'CANCELLED' };

const CHIP_LABEL: Record<QueueKind, string> = {
  space: 'Spaces',
  status: 'Status changes',
  ownership: 'Ownership',
  subspace: 'Sub-spaces',
  transfer: 'Ticket transfers',
  'free-add': 'Free adds',
  'white-label': 'White-label',
};

// ── Payout hand-off ──────────────────────────────────────────────────────────
// No GET-by-id for payouts: the list hands the tapped one to the detail screen.

const payoutHandoff = new Map<string, AdminPayout>();
export const recallPayout = (id: string) => payoutHandoff.get(id);
/** Stash a payout and return its detail route (for lists outside Requests). */
export const openPayout = (p: AdminPayout) => {
  payoutHandoff.set(p.id, p);
  return `/apex/payout/${p.id}`;
};

export const organiserName = (p: AdminPayout) => p.user?.fullName || (p.user?.username ? `@${p.user.username}` : 'Organiser');

// ── Sources ──────────────────────────────────────────────────────────────────

export const REQUEST_SOURCES: RequestSourceDef[] = [
  ...QUEUES.map<RequestSourceDef>((q) => ({
    source: q.kind,
    label: CHIP_LABEL[q.kind],
    fetch: async (tab) => {
      const r = await q.fetch(QUEUE_STATUS[tab]);
      if (!r.ok) return r;
      return {
        ok: true,
        data: r.data.map((item) => ({
          key: `${q.kind}:${item.id}`,
          source: q.kind,
          title: item.title,
          meta: [item.subtitle, shortDate(item.createdAt)].filter(Boolean).join('  ·  '),
          createdAt: item.createdAt,
          open: () => {
            rememberQueueItem(q.kind, item);
            return `/apex/queue/${q.kind}/${item.id}`;
          },
        })),
      };
    },
  })),
  {
    source: 'refund',
    label: 'Refunds',
    fetch: async (tab) => {
      const r = await getAdminRefunds<RefundRequest>(REFUND_STATUS[tab], 1, PAGE);
      if (!r.ok) return r;
      return {
        ok: true,
        data: r.data.requests.map((f) => {
          const amount = f.approvedAmount ?? f.requestedAmount;
          return {
            key: `refund:${f.id}`,
            source: 'refund' as const,
            title: f.registration?.user?.fullName || f.registration?.user?.username || 'Attendee',
            meta: [f.event?.title, shortDate(f.createdAt), f.reason].filter(Boolean).join('  ·  '),
            value: amount ? inr(amount) : 'Full',
            createdAt: f.createdAt,
            open: () => `/manage/refund/${f.id}`,
          };
        }),
      };
    },
  },
  {
    source: 'payout',
    label: 'Payouts',
    fetch: async (tab) => {
      const r = await getAdminPayouts(PAYOUT_STATUS[tab], 1, PAGE);
      if (!r.ok) return r;
      return {
        ok: true,
        data: r.data.payouts.map((p) => ({
          key: `payout:${p.id}`,
          source: 'payout' as const,
          title: p.event?.title ?? 'Event',
          meta: [organiserName(p), shortDate(p.completedAt ?? p.createdAt), p.utr ? `UTR ${p.utr}` : null].filter(Boolean).join('  ·  '),
          value: inr(p.netAmount),
          createdAt: p.createdAt,
          open: () => {
            payoutHandoff.set(p.id, p);
            return `/apex/payout/${p.id}`;
          },
        })),
      };
    },
  },
];

export const sourceDef = (source: string) => REQUEST_SOURCES.find((s) => s.source === source);

export interface SourceResult {
  def: RequestSourceDef;
  rows: RequestRow[];
  /** Set when this source failed; the others still show. */
  error?: string;
}

/** Fetch every source for a tab in parallel; one failing source doesn't blank the rest. */
export async function fetchAllRequests(tab: RequestTab): Promise<SourceResult[]> {
  const results = await Promise.all(REQUEST_SOURCES.map((def) => def.fetch(tab)));
  return REQUEST_SOURCES.map((def, i) => {
    const r = results[i];
    return r.ok ? { def, rows: r.data } : { def, rows: [], error: r.denied ? 'Only Unifesto platform admins can see this.' : r.message };
  });
}

/**
 * Order the sections of the "All" view.
 *
 * Open: the source whose oldest request has waited longest comes first.
 * Approved/rejected: the most recently active source first. Ties and empty
 * sources keep REQUEST_SOURCES order (the screen drops empty ones).
 */
export function orderSections(results: SourceResult[], tab: RequestTab): SourceResult[] {
  const open = tab === 'open';
  const key = (r: SourceResult) => {
    const times = r.rows.map((row) => Date.parse(row.createdAt)).filter((t) => !Number.isNaN(t));
    if (!times.length) return Infinity;
    return open ? Math.min(...times) : -Math.max(...times);
  };
  return [...results].sort((a, b) => key(a) - key(b));
}
