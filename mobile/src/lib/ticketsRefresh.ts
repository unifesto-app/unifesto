import { refreshWidgets } from '../widgets/refresh';

/**
 * One-shot "my tickets changed" signal between screens.
 *
 * TicketDetailScreen marks the list stale after a change it makes (e.g. a
 * cancel); TicketsScreen consumes the flag on focus and reloads once. This
 * avoids refetching (and losing scroll/pagination) on every focus.
 */
let stale = false;

export function markTicketsStale(): void {
  stale = true;
  // The home-screen widgets show the same tickets: refresh them now too.
  void refreshWidgets({ force: true });
}

/** Returns whether the list is stale, and clears the flag. */
export function consumeTicketsStale(): boolean {
  const wasStale = stale;
  stale = false;
  return wasStale;
}
