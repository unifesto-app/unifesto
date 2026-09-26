/**
 * Soft delete for events and sessions.
 *
 * A non-null `deletedAt` hides the row from every organiser and attendee
 * surface while leaving its registrations, tickets, payments and payouts
 * untouched. Restoring clears the column and everything reappears intact.
 *
 * Soft delete is *not* a status. `CANCELLED` is a public statement to attendees
 * that something is off; hiding is private housekeeping that says nothing to
 * anyone. That is why something must be cancelled before it can be hidden —
 * hiding a live event would strand ticket holders with no refund and no notice.
 *
 * Everything visible must filter on this. The escape hatches are deliberate and
 * few — see `WHY_UNFILTERED` for the places that intentionally still see hidden
 * rows, and why.
 */

/** Spread into a Prisma `where` to exclude hidden rows. */
export const NOT_DELETED = { deletedAt: null } as const;

/** Spread into a Prisma `where` to select *only* hidden rows (trash views). */
export const ONLY_DELETED = { deletedAt: { not: null } } as const;

/**
 * Resolves a "show hidden?" filter into the matching `where` fragment.
 *
 *   'active'  (default) live rows only
 *   'deleted'           hidden rows only — the trash view
 *   'all'               both, for admin surfaces that act on hidden rows
 */
export type DeletedFilter = 'active' | 'deleted' | 'all';

export function deletedWhere(filter: DeletedFilter = 'active') {
  if (filter === 'all') return {};
  return filter === 'deleted' ? ONLY_DELETED : NOT_DELETED;
}

/**
 * Places that deliberately do NOT filter hidden rows, recorded so the omissions
 * read as decisions rather than oversights:
 *
 * - `RefundsService.getManagedEventIds` — money already owed stays actionable.
 *   Hiding an event must not strand a refund an attendee is entitled to.
 *
 * - `PayoutsService` — payouts are financial records. Hiding an event does not
 *   cancel what the organiser is owed. (Payouts are created manually now; the
 *   old auto-create scheduler was removed.)
 *
 * - `AdminService.getEvents` / `getSessions` — the admin surface where hidden
 *   rows are reviewed and purged. Filtered by an explicit request parameter
 *   instead, defaulting to active.
 */
export const WHY_UNFILTERED = null;
