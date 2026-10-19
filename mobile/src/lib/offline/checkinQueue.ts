import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import {
  CheckinNetworkError,
  getOfflineRoster,
  getRosterChanges,
  syncOfflineCheckins,
  type AttendeeSearchResult,
  type CheckinDuplicate,
  type CheckinStats,
  type GroupScanResult,
  type OfflineCheckinItem,
  type OfflineRoster,
  type OfflineRosterEntry,
} from '../api/checkin';
import { isOnline, onReconnect } from './connectivity';
import { onCheckinSignOut, queueKey, queuedEventIds, readRoster, writeRoster } from './checkinStorage';

/**
 * Offline check-in for door staff.
 *
 * While online the scanner keeps a compact guest list (the roster) saved on
 * the device. When the network drops, scans are judged against that list and
 * the check-ins go into a per-user queue, which syncs automatically when the
 * connection returns. The server re-checks every queued item, so the queue
 * can only ever be *more* permissive than live scanning for as long as the
 * device is offline — anything it shouldn't have let in comes back as
 * "rejected" for the organiser to review. Tickets another device (or a live
 * scan) had already checked in come back as "duplicate", also for review.
 *
 * While online, the list is kept current with small "changes since" pulls,
 * so every crew phone learns about the others' scans within about a minute.
 *
 * Queues sync without the check-in screen open too: on sign-in, on app
 * foreground and on reconnect (syncAllQueues), and only ever under the
 * account that recorded them — sign-out drops every in-memory store.
 */

/**
 * A check-in recorded offline. `pending` until the server answers; then
 * dropped if accepted, or kept for review as `rejected` (a rule failed) or
 * `duplicate` (accepted, but the ticket had already been used at that point).
 */
export interface QueuedCheckin extends OfflineCheckinItem {
  name: string | null;
  ticketType: string;
  state: 'pending' | 'rejected' | 'duplicate';
  message?: string;
  duplicateOf?: CheckinDuplicate;
}

export type OfflineVerdict =
  | { kind: 'no-roster' }
  | { kind: 'unknown' }
  | { kind: 'blocked'; entry: OfflineRosterEntry; reason: string }
  | { kind: 'already'; entry: OfflineRosterEntry; at: string }
  | { kind: 'admitted'; entry: OfflineRosterEntry }
  | { kind: 'group'; entry: OfflineRosterEntry; view: GroupScanResult };

export interface OfflineCheckinSnapshot {
  /** Storage has been read (roster + queue). */
  ready: boolean;
  rosterSavedAt: string | null;
  rosterSize: number;
  pending: number;
  /** Rejected and duplicate check-ins, oldest first, for the organiser. */
  review: QueuedCheckin[];
  downloading: boolean;
  syncing: boolean;
  /** Last download/sync failure worth showing (not plain "offline"). */
  error: string | null;
}

const SYNC_BATCH = 200;
/** Re-download the guest list on open when the saved copy is older than this. */
export const ROSTER_MAX_AGE_MS = 5 * 60 * 1000;

interface EventStore {
  userId: string;
  eventId: string;
  roster: OfflineRoster | null;
  byCode: Map<string, OfflineRosterEntry>;
  queue: QueuedCheckin[];
  /**
   * Live check-ins written into the list since the last download began. A
   * download that was already in flight returns a list older than these, so
   * they are re-applied on top of it.
   */
  live: { registrationId: string; pointId: string; at: string; memberIndexes?: number[]; recordedAt: number }[];
  loaded: Promise<void>;
  downloading: Promise<void> | null;
  pulling: Promise<void> | null;
  syncing: Promise<void> | null;
  error: string | null;
  snapshot: OfflineCheckinSnapshot;
  listeners: Set<() => void>;
  /** Its user signed out: stop syncing and never write the roster again. */
  dropped: boolean;
}

const stores = new Map<string, EventStore>();
/** The signed-in account, once syncAllQueues has run for it. */
let activeUserId: string | null = null;

const hasPending = (s: EventStore) => s.queue.some((q) => q.state === 'pending');

// Back online: push every queue this account left (which then pulls), or
// just catch up on what the rest of the crew did while this phone was cut off.
onReconnect(() => {
  if (activeUserId) void syncAllQueues(activeUserId);
  stores.forEach((s) => {
    if (!hasPending(s) && s.roster) void pullChanges(s);
  });
});

// Signed out: the next account must never sync this one's queue under its
// own token. Queues stay on disk, keyed by user, for this account's return.
onCheckinSignOut(() => {
  stores.forEach((s) => {
    s.dropped = true;
  });
  stores.clear();
  rosterWriteTimers.forEach((t) => clearTimeout(t));
  rosterWriteTimers.clear();
  activeUserId = null;
});

/**
 * Push every queue this account has on the device, not just the ones whose
 * check-in screen is open. Runs on sign-in, app foreground and reconnect.
 */
export async function syncAllQueues(userId: string): Promise<void> {
  activeUserId = userId;
  let eventIds: string[] = [];
  try {
    eventIds = await queuedEventIds(userId);
  } catch {
    return;
  }
  for (const eventId of eventIds) {
    if (activeUserId !== userId) return; // signed out meanwhile
    const s = getCheckinStore(userId, eventId);
    await s.loaded;
    if (isOnline() && hasPending(s)) void syncNow(s);
  }
}

/** Save the guest list ahead of time for events starting within this window. */
const PREFETCH_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Download (or refresh) the guest list for every event this account checks
 * people in at that is on now or starts within a day, so the scanner works
 * even if the venue has no signal from the first scan.
 */
export function prefetchRosters(
  userId: string,
  events: { id: string; startDateTime: string; endDateTime: string }[],
): void {
  if (!isOnline()) return;
  const now = Date.now();
  for (const ev of events) {
    const soon = Date.parse(ev.startDateTime) - now <= PREFETCH_WINDOW_MS;
    const over = Date.parse(ev.endDateTime) < now;
    if (soon && !over) void ensureFreshRoster(getCheckinStore(userId, ev.id));
  }
}

// ── Store lifecycle ─────────────────────────────────────────────────────────

export function getCheckinStore(userId: string, eventId: string): EventStore {
  const key = `${userId}:${eventId}`;
  let store = stores.get(key);
  if (store) return store;

  store = {
    userId,
    eventId,
    roster: null,
    byCode: new Map(),
    queue: [],
    live: [],
    loaded: Promise.resolve(),
    downloading: null,
    pulling: null,
    syncing: null,
    error: null,
    snapshot: emptySnapshot(),
    listeners: new Set(),
    dropped: false,
  };
  const s = store;
  s.loaded = (async () => {
    try {
      const [roster, queue] = await Promise.all([
        readRoster(eventId),
        AsyncStorage.getItem(queueKey(userId, eventId)),
      ]);
      if (roster) setRoster(s, JSON.parse(roster));
      if (queue) s.queue = JSON.parse(queue);
    } catch {
      // Corrupt or unreadable: start clean rather than block the scanner.
    }
    notify(s, true);
    if (isOnline() && s.queue.some((q) => q.state === 'pending')) void syncNow(s);
  })();
  stores.set(key, s);
  return s;
}

export function subscribe(store: EventStore, listener: () => void) {
  store.listeners.add(listener);
  return () => {
    store.listeners.delete(listener);
  };
}

function emptySnapshot(): OfflineCheckinSnapshot {
  return {
    ready: false,
    rosterSavedAt: null,
    rosterSize: 0,
    pending: 0,
    review: [],
    downloading: false,
    syncing: false,
    error: null,
  };
}

function notify(s: EventStore, ready = s.snapshot.ready) {
  s.snapshot = {
    ready,
    rosterSavedAt: s.roster?.generatedAt ?? null,
    rosterSize: s.roster?.entries.length ?? 0,
    pending: s.queue.filter((q) => q.state === 'pending').length,
    review: s.queue.filter((q) => q.state !== 'pending'),
    downloading: !!s.downloading,
    syncing: !!s.syncing,
    error: s.error,
  };
  s.listeners.forEach((l) => l());
}

function setRoster(s: EventStore, roster: OfflineRoster) {
  s.roster = roster;
  s.byCode = new Map();
  for (const entry of roster.entries) {
    for (const code of entry.codes) s.byCode.set(code, entry);
  }
}

const persistRoster = async (s: EventStore) => {
  if (!s.roster || s.dropped) return;
  try {
    writeRoster(s.eventId, JSON.stringify(s.roster));
  } catch {
    // Out of space or unwritable: the list still works from memory.
  }
};

/**
 * Live scans arrive every few seconds at a busy door, and the roster is one
 * large JSON value, so writes from them are coalesced. Memory is updated
 * immediately; only the disk write waits.
 */
const ROSTER_WRITE_DELAY_MS = 3_000;
/** Longest a roster download is assumed to take; older live marks are dropped. */
const LIVE_REPLAY_WINDOW_MS = 10 * 60 * 1000;
const rosterWriteTimers = new Map<EventStore, ReturnType<typeof setTimeout>>();

function persistRosterSoon(s: EventStore) {
  if (rosterWriteTimers.has(s)) return;
  rosterWriteTimers.set(
    s,
    setTimeout(() => {
      rosterWriteTimers.delete(s);
      void persistRoster(s);
    }, ROSTER_WRITE_DELAY_MS),
  );
}

// An empty queue leaves no key, so syncAllQueues only visits events with work.
const persistQueue = (s: EventStore) =>
  (s.queue.length
    ? AsyncStorage.setItem(queueKey(s.userId, s.eventId), JSON.stringify(s.queue))
    : AsyncStorage.removeItem(queueKey(s.userId, s.eventId))
  ).catch(() => {});

// ── Roster download ─────────────────────────────────────────────────────────

export function downloadRoster(s: EventStore): Promise<void> {
  if (s.downloading) return s.downloading;
  s.downloading = (async () => {
    const startedAt = Date.now();
    try {
      await s.loaded;
      setRoster(s, await getOfflineRoster(s.eventId));
      reapplyLive(s, startedAt);
      s.error = null;
      await persistRoster(s);
    } catch (e) {
      // Offline is expected; only a real refusal is worth surfacing.
      if (!(e instanceof CheckinNetworkError)) {
        s.error = e instanceof Error ? e.message : 'Could not download the guest list';
      }
    } finally {
      s.downloading = null;
      notify(s);
    }
  })();
  notify(s);
  return s.downloading;
}

/**
 * Scans confirmed while a download or pull was in flight aren't in its
 * response yet; put them back on top. Older ones are in the server's list.
 */
function reapplyLive(s: EventStore, startedAt: number) {
  s.live = s.live.filter((l) => l.recordedAt >= startedAt);
  for (const l of s.live) {
    const entry = findEntry(s, l.registrationId);
    if (entry) markCheckedIn(entry, l.pointId, l.at, l.memberIndexes);
  }
}

/**
 * Bring the saved list up to date with only what changed since the last
 * download/pull: other crew devices' check-ins (live or synced late), new
 * registrations, cancellations. Falls back to a full download when there is
 * no cursor yet or the server says too much changed. Silent when offline.
 */
export function pullChanges(s: EventStore): Promise<void> {
  if (s.pulling) return s.pulling;
  if (s.downloading) return s.downloading;
  s.pulling = (async () => {
    const startedAt = Date.now();
    try {
      await s.loaded;
      const cursor = s.roster?.cursor;
      if (!s.roster || !cursor) {
        await downloadRoster(s);
        return;
      }
      const changes = await getRosterChanges(s.eventId, cursor);
      if (changes.full) {
        await downloadRoster(s);
        return;
      }
      // A download may have replaced the list while this pull was out.
      if (!s.roster || s.roster.cursor !== cursor) return;

      const replace = new Map(changes.entries.map((e) => [e.registrationId, e]));
      const gone = new Set(changes.removed);
      const entries = s.roster.entries
        .filter((e) => !gone.has(e.registrationId))
        .map((e) => {
          const next = replace.get(e.registrationId);
          replace.delete(e.registrationId);
          return next ?? e;
        });
      entries.push(...replace.values()); // registered since the last look
      setRoster(s, { ...s.roster, entries, cursor: changes.cursor });
      reapplyLive(s, startedAt);
      persistRosterSoon(s); // at least the cursor moved
      s.error = null;
    } catch (e) {
      if (!(e instanceof CheckinNetworkError)) {
        s.error = e instanceof Error ? e.message : 'Could not refresh the guest list';
      }
    } finally {
      s.pulling = null;
      notify(s);
    }
  })();
  return s.pulling;
}

/** Download when online and the saved list is missing or older than maxAge. */
export async function ensureFreshRoster(s: EventStore, maxAgeMs = ROSTER_MAX_AGE_MS) {
  await s.loaded;
  if (!isOnline()) return;
  const age = s.roster ? Date.now() - Date.parse(s.roster.generatedAt) : Infinity;
  if (age <= maxAgeMs) return;
  // A cursor means a small pull is enough; otherwise download it all.
  await (s.roster?.cursor ? pullChanges(s) : downloadRoster(s));
}

// ── Local verdicts (roster + queue overlay) ────────────────────────────────

/** When this registration was checked in at the point, counting queued scans. */
function checkedInAt(s: EventStore, entry: OfflineRosterEntry, pointId: string): string | null {
  if (entry.checkins[pointId]) return entry.checkins[pointId];
  const queued = s.queue.find(
    (q) =>
      q.state === 'pending' &&
      q.registrationId === entry.registrationId &&
      q.checkinTypeId === pointId &&
      !q.memberIndexes,
  );
  return queued?.scannedAt ?? null;
}

function memberCheckedInAt(
  s: EventStore,
  entry: OfflineRosterEntry,
  pointId: string,
  index: number,
): string | null {
  const member = entry.group?.members.find((m) => m.index === index);
  if (member?.checkins[pointId]) return member.checkins[pointId];
  const queued = s.queue.find(
    (q) =>
      q.state === 'pending' &&
      q.registrationId === entry.registrationId &&
      q.checkinTypeId === pointId &&
      q.memberIndexes?.includes(index),
  );
  return queued?.scannedAt ?? null;
}

/**
 * What the saved guest list says about a scanned code at a point. Mirrors
 * the live scan: blocked registrations are refused with the server's own
 * reason; groups return their roster instead of checking anyone in.
 */
export function judgeOfflineScan(s: EventStore, code: string, pointId: string): OfflineVerdict {
  if (!s.roster) return { kind: 'no-roster' };
  const entry = s.byCode.get(code);
  if (!entry) return { kind: 'unknown' };
  if (entry.blockedReason) return { kind: 'blocked', entry, reason: entry.blockedReason };

  if (entry.group && entry.group.members.length > 0) {
    return {
      kind: 'group',
      entry,
      view: {
        isGroup: true,
        registrationId: entry.registrationId,
        eventTitle: s.roster.eventTitle,
        ticketType: entry.ticketType,
        groupSize: entry.group.members.length,
        leadName: entry.name,
        // Unclaimed seats can't be checked in, same as online.
        members: entry.group.members
          .filter((m) => m.claimable)
          .map((m) => ({
            index: m.index,
            name: m.name,
            email: null,
            checkedInAtPoint: memberCheckedInAt(s, entry, pointId, m.index),
          })),
      },
    };
  }

  const at = checkedInAt(s, entry, pointId);
  if (at) return { kind: 'already', entry, at };
  return { kind: 'admitted', entry };
}

/**
 * Headcount from the saved list, matching the live stats: people, not
 * bookings — an individual counts once, a group each of its members.
 */
export function offlineStats(s: EventStore, pointId?: string): CheckinStats | null {
  if (!s.roster) return null;
  const admissible = s.roster.entries.filter((e) => !e.blockedReason);
  const cancelled = s.roster.entries.length - admissible.length;
  let total = 0;
  let checkedIn = 0;
  for (const e of admissible) {
    const members = e.group?.members ?? [];
    if (members.length === 0) {
      total += 1;
      const inAnywhere =
        Object.keys(e.checkins).length > 0 ||
        s.queue.some((q) => q.state === 'pending' && q.registrationId === e.registrationId);
      if (pointId ? checkedInAt(s, e, pointId) : inAnywhere) checkedIn += 1;
      continue;
    }
    total += members.length;
    const points = pointId ? [pointId] : pointsOf(s, e);
    checkedIn += members.filter((m) => points.some((p) => memberCheckedInAt(s, e, p, m.index))).length;
  }
  return {
    total,
    checkedIn,
    remaining: total - checkedIn,
    cancelled,
    checkInRate: total ? Math.round((checkedIn / total) * 100) : 0,
  };
}

/** Every point a group has a check-in at, saved or queued. */
function pointsOf(s: EventStore, entry: OfflineRosterEntry): string[] {
  const points = new Set<string>();
  for (const m of entry.group?.members ?? []) Object.keys(m.checkins).forEach((p) => points.add(p));
  for (const q of s.queue) {
    if (q.state === 'pending' && q.registrationId === entry.registrationId) points.add(q.checkinTypeId);
  }
  return [...points];
}

/** Name / ticket-code search over the saved list, for the manual screen. */
export function offlineSearch(s: EventStore, query: string, pointId: string): AttendeeSearchResult[] {
  if (!s.roster) return [];
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const rows: AttendeeSearchResult[] = [];
  for (const e of s.roster.entries) {
    if (e.blockedReason) continue;
    const members = e.group?.members ?? [];
    const byCode = e.codes.some((c) => c.toLowerCase().startsWith(q));
    if (members.length > 0) {
      // Same as online: each member is their own row, matched by name; a
      // ticket-code or lead-name match lists the whole group.
      const hits = members.filter((m) => m.name?.toLowerCase().includes(q));
      const leadHit = !!e.name?.toLowerCase().includes(q);
      const list = hits.length ? hits : byCode || leadHit ? members : [];
      for (const m of list) {
        rows.push({
          registrationId: e.registrationId,
          memberIndex: m.index,
          attendee: { id: null, fullName: m.name ?? (m.index === 0 ? e.name : null), username: null, avatarUrl: null },
          ticketType: e.ticketType,
          checkedInAtPoint: m.checkins[pointId] ?? null,
          groupLeadName: e.name,
          claimable: m.claimable,
        });
      }
    } else if (byCode || e.name?.toLowerCase().includes(q)) {
      rows.push({
        registrationId: e.registrationId,
        memberIndex: null,
        attendee: { id: e.registrationId, fullName: e.name, username: null, avatarUrl: null },
        ticketType: e.ticketType,
        checkedInAtPoint: checkedInAt(s, e, pointId),
      });
    }
    if (rows.length >= 30) break;
  }
  return rows.slice(0, 30);
}

export function findEntry(s: EventStore, registrationId: string): OfflineRosterEntry | undefined {
  return s.roster?.entries.find((e) => e.registrationId === registrationId);
}

/** Mark a check-in on the saved list. Keeps an earlier time if one is set. */
function markCheckedIn(
  entry: OfflineRosterEntry,
  pointId: string,
  at: string,
  memberIndexes?: number[],
) {
  if (memberIndexes?.length) {
    for (const m of entry.group?.members ?? []) {
      if (memberIndexes.includes(m.index)) m.checkins[pointId] ??= at;
    }
  }
  entry.checkins[pointId] ??= at;
}

/**
 * Write a check-in the server just confirmed (live scan, manual or group)
 * into the saved list, so the same ticket reads as "already in" if the
 * network drops before the next list refresh. Identify the registration by
 * the scanned code or its id; unknown ones (registered after the list was
 * saved) are skipped — the next refresh brings them in.
 */
export function recordLiveCheckin(
  s: EventStore,
  ref: { code: string } | { registrationId: string },
  pointId: string,
  at?: string | null,
  memberIndexes?: number[],
): void {
  if (!s.roster) return;
  const entry = 'code' in ref ? s.byCode.get(ref.code) : findEntry(s, ref.registrationId);
  if (!entry) return;
  const when = at ? new Date(at).toISOString() : new Date().toISOString();
  markCheckedIn(entry, pointId, when, memberIndexes);
  const now = Date.now();
  // Only needed while a download could still be in flight.
  s.live = s.live.filter((l) => now - l.recordedAt < LIVE_REPLAY_WINDOW_MS);
  s.live.push({ registrationId: entry.registrationId, pointId, at: when, memberIndexes, recordedAt: now });
  persistRosterSoon(s);
  notify(s);
}

// ── Queue ───────────────────────────────────────────────────────────────────

export async function enqueueCheckin(
  s: EventStore,
  entry: OfflineRosterEntry,
  pointId: string,
  memberIndexes?: number[],
): Promise<void> {
  s.queue.push({
    id: Crypto.randomUUID(),
    registrationId: entry.registrationId,
    checkinTypeId: pointId,
    ...(memberIndexes?.length ? { memberIndexes } : {}),
    scannedAt: new Date().toISOString(),
    name: entry.name,
    ticketType: entry.ticketType,
    state: 'pending',
  });
  await persistQueue(s);
  notify(s);
  if (isOnline()) void syncNow(s);
}

/** Push pending check-ins to the server in batches. Single-flight per event. */
export function syncNow(s: EventStore): Promise<void> {
  if (s.syncing) return s.syncing;
  s.syncing = (async () => {
    try {
      await s.loaded;
      let rosterChanged = false;
      for (;;) {
        // Its user signed out: the next request would carry someone else's token.
        if (s.dropped) return;
        const batch = s.queue.filter((q) => q.state === 'pending').slice(0, SYNC_BATCH);
        if (batch.length === 0) break;

        const results = await syncOfflineCheckins(
          s.eventId,
          batch.map(({ id, registrationId, checkinTypeId, memberIndexes, scannedAt }) => ({
            id,
            registrationId,
            checkinTypeId,
            ...(memberIndexes ? { memberIndexes } : {}),
            scannedAt,
          })),
        );
        const byId = new Map(results.map((r) => [r.id, r]));

        const next: QueuedCheckin[] = [];
        for (const item of s.queue) {
          const r = byId.get(item.id);
          if (!r) {
            next.push(item);
          } else if (r.status === 'rejected') {
            next.push({ ...item, state: 'rejected', message: r.message });
          } else {
            // Accepted: fold it into the saved list so it still reads as
            // "already in" if the same ticket is scanned again offline. A
            // duplicate is in too (at the earlier time), and goes to review.
            rosterChanged = foldIntoRoster(s, item, r.duplicateOf?.checkedInAt) || rosterChanged;
            if (r.duplicateOf) next.push({ ...item, state: 'duplicate', duplicateOf: r.duplicateOf });
          }
        }
        s.queue = next;
        await persistQueue(s);
        notify(s);
        // Nothing from this batch came back — don't spin on it.
        if (results.length === 0) break;
      }
      if (rosterChanged) await persistRoster(s);
      s.error = null;
      // Now that ours are up, fetch everyone else's.
      void pullChanges(s);
    } catch (e) {
      if (!(e instanceof CheckinNetworkError)) {
        s.error = e instanceof Error ? e.message : 'Sync failed';
      }
    } finally {
      s.syncing = null;
      notify(s);
    }
  })();
  notify(s);
  return s.syncing;
}

function foldIntoRoster(s: EventStore, item: QueuedCheckin, firstAt?: string): boolean {
  const entry = findEntry(s, item.registrationId);
  if (!entry) return false;
  markCheckedIn(entry, item.checkinTypeId, firstAt ?? item.scannedAt, item.memberIndexes);
  return true;
}

/** Organiser has seen a review item; drop it from the list. */
export async function dismissReviewItem(s: EventStore, id: string): Promise<void> {
  s.queue = s.queue.filter((q) => q.id !== id);
  await persistQueue(s);
  notify(s);
}
