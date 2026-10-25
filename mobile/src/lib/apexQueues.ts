import {
  approveSpaceRequest,
  getFreeAddRequests,
  getOwnershipRequests,
  getSpaceRequests,
  getStatusRequests,
  getSubSpaceRequests,
  getTransferRequests,
  rejectSpaceRequest,
  reviewFreeAddRequest,
  reviewOwnershipRequest,
  reviewStatusRequest,
  reviewSubSpaceRequest,
  reviewTransferRequest,
  type Decision,
  type PersonRef,
  type RequestStatus,
  type Result,
  type SubSpaceRequestType,
} from './api/apex';

/*
 * The six Apex approval queues share one list → review → approve/reject flow.
 * Each queue maps its raw API shape onto QueueItem here, so the screens never
 * branch on the request type.
 */

export type QueueKind = 'space' | 'status' | 'ownership' | 'subspace' | 'transfer' | 'free-add';

export interface QueuePerson {
  label: string;
  phone?: string | null;
  email?: string | null;
}

export interface QueueItem {
  id: string;
  status: RequestStatus;
  createdAt: string;
  reviewNote: string | null;
  /** List row + review screen heading. */
  title: string;
  /** One line under the title on the list. */
  subtitle: string;
  /** Why they asked, quoted on the review screen. */
  reason: string | null;
  /** Who asked. */
  requester: QueuePerson | null;
  facts: { label: string; value: string }[];
  /** Shown above the buttons, e.g. a plan that doesn't cover the request. */
  warning?: string;
  /** Body of the "Approve?" confirm. */
  approveEffect: string;
}

export interface QueueDef {
  kind: QueueKind;
  /** Plural, for the home row and list title. */
  label: string;
  approveLabel: string;
  /** Ticket transfers can be sent to a different email than requested. */
  emailOverride?: boolean;
  fetch: (status: RequestStatus) => Promise<Result<QueueItem[]>>;
  review: (id: string, decision: Decision, note?: string, email?: string) => Promise<Result<unknown>>;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

export const titleCase = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ');

const nameOf = (p?: PersonRef | null) => p?.fullName || (p?.username ? `@${p.username}` : 'Someone');

const person = (p?: PersonRef | null): QueuePerson | null =>
  p ? { label: nameOf(p), phone: p.mobileNumber ?? null, email: p.identities?.find((i) => i.email)?.email ?? null } : null;

/** Map a Result<Raw> to Result<QueueItem[]> without touching errors. */
async function mapped<T>(res: Promise<Result<T>>, pick: (data: T) => QueueItem[]): Promise<Result<QueueItem[]>> {
  const r = await res;
  return r.ok ? { ok: true, data: pick(r.data) } : r;
}

const SUBSPACE_LABEL: Record<SubSpaceRequestType, string> = {
  JOIN_SUPER: 'Join a parent space',
  CONVERT_AND_JOIN: 'Become a parent and take in a space',
  CONVERT_TO_SUPER: 'Become a parent space',
  CONVERT_TO_REGULAR: 'Stop being a parent space',
  REMOVE_CHILD: 'Remove a sub-space',
  REMOVE_PARENT: 'Leave its parent space',
};

// ── Queues ───────────────────────────────────────────────────────────────────

export const QUEUES: QueueDef[] = [
  {
    kind: 'space',
    label: 'Space requests',
    approveLabel: 'Approve space',
    fetch: (status) =>
      mapped(getSpaceRequests(status), (rows) =>
        (Array.isArray(rows) ? rows : []).map((r) => ({
          id: r.id,
          status: r.status,
          createdAt: r.createdAt,
          reviewNote: r.reviewNote,
          title: r.name,
          subtitle: [nameOf(r.user), r.city].filter(Boolean).join('  ·  '),
          reason: r.description,
          requester: person(r.user),
          facts: [
            { label: 'Type', value: titleCase(r.type) },
            ...(r.requesterRole ? [{ label: 'Their role', value: r.requesterRole }] : []),
            ...(r.city || r.state ? [{ label: 'Location', value: [r.city, r.state].filter(Boolean).join(', ') }] : []),
            ...(r.websiteUrl ? [{ label: 'Website', value: r.websiteUrl.replace(/^https?:\/\//, '') }] : []),
          ],
          warning: r.authorityConfirmedAt
            ? undefined
            : 'No authority declaration (older app). Confirm they represent this organisation before approving.',
          approveEffect: `The space is created and ${nameOf(r.user)} becomes its Space Admin.`,
        })),
      ),
    review: (id, decision, note) => (decision === 'APPROVED' ? approveSpaceRequest(id) : rejectSpaceRequest(id, note)),
  },
  {
    kind: 'status',
    label: 'Status changes',
    approveLabel: 'Approve change',
    fetch: (status) =>
      mapped(getStatusRequests(status), (d) =>
        (d.requests ?? []).map((r) => ({
          id: r.id,
          status: r.status,
          createdAt: r.createdAt,
          reviewNote: r.reviewNote,
          title: r.space?.name ?? 'Space',
          subtitle: `${titleCase(r.currentStatus)} → ${titleCase(r.requestedStatus)}`,
          reason: r.reason,
          requester: person(r.user),
          facts: [
            { label: 'Now', value: titleCase(r.currentStatus) },
            { label: 'Wants', value: titleCase(r.requestedStatus) },
          ],
          approveEffect: `${r.space?.name ?? 'The space'} becomes ${titleCase(r.requestedStatus).toLowerCase()}.`,
        })),
      ),
    review: reviewStatusRequest,
  },
  {
    kind: 'ownership',
    label: 'Ownership transfers',
    approveLabel: 'Approve transfer',
    fetch: (status) =>
      mapped(getOwnershipRequests(status), (d) =>
        (d.requests ?? []).map((r) => ({
          id: r.id,
          status: r.status,
          createdAt: r.createdAt,
          reviewNote: r.reviewNote,
          title: r.space?.name ?? 'Space',
          subtitle: `${nameOf(r.requester)} → ${nameOf(r.newOwner)}`,
          reason: r.reason,
          requester: person(r.requester),
          facts: [
            { label: 'Owner now', value: nameOf(r.requester) },
            { label: 'New owner', value: nameOf(r.newOwner) },
            ...(r.newOwner?.mobileNumber ? [{ label: 'New owner phone', value: r.newOwner.mobileNumber }] : []),
          ],
          approveEffect: `${nameOf(r.newOwner)} owns the space and pays for its plan. ${nameOf(r.requester)} stays a Space Admin.`,
        })),
      ),
    review: reviewOwnershipRequest,
  },
  {
    kind: 'subspace',
    label: 'Sub-space requests',
    approveLabel: 'Approve',
    fetch: (status) =>
      mapped(getSubSpaceRequests(status), (d) =>
        (d.items ?? []).map((r) => ({
          id: r.id,
          status: r.status,
          createdAt: r.createdAt,
          reviewNote: r.reviewNote,
          title: SUBSPACE_LABEL[r.requestType] ?? titleCase(r.requestType),
          subtitle: [r.subSpace?.name, r.targetSpace?.name].filter(Boolean).join(' → '),
          reason: r.reason,
          requester: person(r.user),
          facts: [
            ...(r.subSpace ? [{ label: 'Space', value: r.subSpace.name }] : []),
            { label: r.subSpace ? 'Parent' : 'Space', value: r.targetSpace?.name ?? '—' },
          ],
          approveEffect: 'The space hierarchy changes right away.',
        })),
      ),
    review: reviewSubSpaceRequest,
  },
  {
    kind: 'transfer',
    label: 'Ticket transfers',
    approveLabel: 'Transfer ticket',
    emailOverride: true,
    fetch: (status) =>
      mapped(getTransferRequests(status), (d) =>
        (d.requests ?? []).map((r) => {
          const holder = nameOf(r.registration?.user);
          return {
            id: r.id,
            status: r.status,
            createdAt: r.createdAt,
            reviewNote: r.reviewNote,
            title: r.registration?.event?.title ?? 'Ticket',
            subtitle: `${holder} → ${r.targetEmail}`,
            reason: r.reason,
            requester: person(r.requester),
            facts: [
              { label: 'Holder now', value: holder },
              { label: 'Send to', value: r.targetEmail },
              ...(r.registration?.ticketType ? [{ label: 'Ticket', value: r.registration.ticketType.name }] : []),
              ...(r.registration?.groupSize && r.registration.groupSize > 1
                ? [{ label: 'Group', value: `${r.registration.groupSize} people` }]
                : []),
            ],
            approveEffect: `The ticket moves to the account with that email. ${holder} loses it. No money moves.`,
          };
        }),
      ),
    review: reviewTransferRequest,
  },
  {
    kind: 'free-add',
    label: 'Free-add requests',
    approveLabel: 'Allow free adds',
    fetch: (status) =>
      mapped(getFreeAddRequests(status), (d) =>
        (d.requests ?? []).map((r) => ({
          id: r.id,
          status: r.status,
          createdAt: r.createdAt,
          reviewNote: r.reviewNote,
          title: r.event?.title ?? 'Event',
          subtitle: [r.space?.name, nameOf(r.requester)].filter(Boolean).join('  ·  '),
          reason: r.reason,
          requester: person(r.requester),
          facts: r.space ? [{ label: 'Space', value: r.space.name }] : [],
          approveEffect: 'Organisers of this event can add attendees to paid tickets for free.',
        })),
      ),
    review: reviewFreeAddRequest,
  },
];

export const queueDef = (kind: string): QueueDef | undefined => QUEUES.find((q) => q.kind === kind);

// ── Hand-off cache ───────────────────────────────────────────────────────────
// No queue has a GET-by-id, so the list hands the tapped item to the review
// screen here; the review screen rescans the lists when it's missing.

const cache = new Map<string, QueueItem>();
export const rememberQueueItem = (kind: QueueKind, item: QueueItem) => cache.set(`${kind}:${item.id}`, item);
export const recallQueueItem = (kind: string, id: string) => cache.get(`${kind}:${id}`);

/** Pending counts for every queue; a failed queue reports null. */
export async function pendingCounts(): Promise<Record<QueueKind, number | null>> {
  const results = await Promise.all(QUEUES.map((q) => q.fetch('PENDING')));
  return Object.fromEntries(QUEUES.map((q, i) => [q.kind, results[i].ok ? results[i].data.length : null])) as Record<
    QueueKind,
    number | null
  >;
}
