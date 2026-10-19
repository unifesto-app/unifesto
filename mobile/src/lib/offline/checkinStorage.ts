import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';

/**
 * Storage for offline check-in. Kept in a leaf module (no API imports) so
 * the auth helpers can wipe rosters on logout without an import cycle.
 *
 * - Roster: one JSON file per event — attendee names, so it is removed on
 *   logout. A file, not AsyncStorage: a big event's guest list is one large
 *   value, past what Android's AsyncStorage holds per entry.
 * - Queue: one AsyncStorage entry per (user, event) — check-ins that user
 *   recorded offline. Kept across logout so unsynced scans are never lost;
 *   they sync the next time the same account signs in.
 */
/** Rosters before G10 lived in AsyncStorage under this prefix; only cleared now. */
const LEGACY_ROSTER_PREFIX = 'checkin:roster:v1:';
export const QUEUE_PREFIX = 'checkin:queue:v1:';

export const queueKey = (userId: string, eventId: string) => `${QUEUE_PREFIX}${userId}:${eventId}`;

const rosterDir = () => new Directory(Paths.document, 'checkin-rosters');
const rosterFile = (eventId: string) => new File(rosterDir(), `${eventId}.json`);

export async function readRoster(eventId: string): Promise<string | null> {
  const file = rosterFile(eventId);
  return file.exists ? file.text() : null;
}

export function writeRoster(eventId: string, json: string): void {
  rosterDir().create({ intermediates: true, idempotent: true });
  rosterFile(eventId).write(json);
}

/** Events this user still has a stored queue for. */
export async function queuedEventIds(userId: string): Promise<string[]> {
  const prefix = `${QUEUE_PREFIX}${userId}:`;
  const keys = await AsyncStorage.getAllKeys();
  return keys.filter((k) => k.startsWith(prefix)).map((k) => k.slice(prefix.length));
}

const signOutListeners = new Set<() => void>();

/** Runs on sign-out, before the rosters go: the queue drops its in-memory stores. */
export function onCheckinSignOut(listener: () => void): void {
  signOutListeners.add(listener);
}

export async function clearCheckinRosters(): Promise<void> {
  signOutListeners.forEach((l) => l());
  // Best-effort; nothing else depends on these succeeding.
  try {
    const dir = rosterDir();
    if (dir.exists) dir.delete();
  } catch {}
  try {
    const keys = await AsyncStorage.getAllKeys();
    await AsyncStorage.multiRemove(keys.filter((k) => k.startsWith(LEGACY_ROSTER_PREFIX)));
  } catch {}
}
