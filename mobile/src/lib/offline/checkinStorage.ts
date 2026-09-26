import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Storage keys for offline check-in. Kept in a leaf module (no API imports) so
 * the auth helpers can wipe rosters on logout without an import cycle.
 *
 * - Roster: one per event — attendee names, so it is removed on logout.
 * - Queue: one per (user, event) — check-ins that user recorded offline. Kept
 *   across logout so unsynced scans are never lost; they sync the next time
 *   the same account opens that event's check-in.
 */
export const ROSTER_PREFIX = 'checkin:roster:v1:';
export const QUEUE_PREFIX = 'checkin:queue:v1:';

export const rosterKey = (eventId: string) => `${ROSTER_PREFIX}${eventId}`;
export const queueKey = (userId: string, eventId: string) => `${QUEUE_PREFIX}${userId}:${eventId}`;

export async function clearCheckinRosters(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    await AsyncStorage.multiRemove(keys.filter((k) => k.startsWith(ROSTER_PREFIX)));
  } catch {
    // Best-effort; nothing else depends on this succeeding.
  }
}
