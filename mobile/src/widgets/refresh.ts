import { fetchUpcomingTickets } from '../lib/upcomingTickets';
import { syncUpNextWidget } from './sync';

/** Don't refetch for the widgets more often than this (the Home tab syncs them too). */
const MIN_INTERVAL_MS = 15 * 60 * 1000;
let lastAt = 0;
let running: Promise<void> | null = null;

/**
 * Refresh the home-screen widgets from the server, without the Home tab.
 * The widgets used to be fed only when Home loaded, so after registering,
 * cancelling or claiming a seat (or just not opening Home) they kept showing
 * nothing. Called on sign-in, on return to the foreground (throttled), and
 * with `force` whenever tickets change. Never throws; keeps the last
 * snapshot when offline.
 */
export function refreshWidgets({ force = false }: { force?: boolean } = {}): Promise<void> {
  if (running) return running;
  if (!force && Date.now() - lastAt < MIN_INTERVAL_MS) return Promise.resolve();
  lastAt = Date.now();
  running = fetchUpcomingTickets(5)
    .then((tickets) => syncUpNextWidget(tickets))
    .catch(() => {})
    .finally(() => {
      running = null;
    });
  return running;
}
