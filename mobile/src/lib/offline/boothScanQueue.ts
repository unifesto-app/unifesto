import { useEffect, useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { boothScan } from '../api/sponsorPortal';
import { OFFLINE_MESSAGE } from '../api/errors';
import { isOnline, onReconnect } from './connectivity';
import { onCheckinSignOut } from './checkinStorage';

/**
 * Offline booth scanning (E7), on the door scanner's pieces: the same
 * online/offline signal and reconnect hook (connectivity.ts), the same
 * per-account queue kept across sign-out and dropped from memory on it
 * (checkinStorage.ts), and the same sync points (sign-in, foreground,
 * reconnect). Unlike the door there is no guest list on the phone: a sponsor
 * never holds attendee contact before the attendee shares it. So an offline
 * scan is only the ticket QR plus the attendee's yes on the prompt, and the
 * server judges it on sync (boothScan is idempotent). A scan it refuses stays
 * as `failed` for the sponsor to see, until dismissed.
 */
export interface QueuedBoothScan {
  id: string;
  sponsorId: string;
  eventSponsorId: string;
  qrCode: string;
  scannedAt: string;
  state: 'pending' | 'failed';
  message?: string;
}

const key = (userId: string) => `booth:queue:v1:${userId}`;

let userId: string | null = null;
let queue: QueuedBoothScan[] = [];
let loaded: Promise<void> | null = null;
let syncing: Promise<void> | null = null;
const listeners = new Set<() => void>();

const emit = () => {
  queue = [...queue]; // new reference, so useSyncExternalStore re-renders
  listeners.forEach((l) => l());
};
const persist = () =>
  (queue.length ? AsyncStorage.setItem(key(userId!), JSON.stringify(queue)) : AsyncStorage.removeItem(key(userId!))).catch(
    () => {},
  );

function load(id: string): Promise<void> {
  if (userId === id && loaded) return loaded;
  userId = id;
  queue = [];
  loaded = AsyncStorage.getItem(key(id))
    .then((raw) => {
      if (userId === id && raw) queue = JSON.parse(raw);
    })
    .catch(() => {})
    .then(emit);
  return loaded;
}

onReconnect(() => {
  if (userId) void syncBoothScans(userId);
});
onCheckinSignOut(() => {
  userId = null;
  loaded = null;
  queue = [];
  emit();
});

/** Keep a consented scan made while offline; it syncs when the phone is back. */
export async function enqueueBoothScan(
  id: string,
  scan: { sponsorId: string; eventSponsorId: string; qrCode: string },
): Promise<void> {
  await load(id);
  queue.push({ ...scan, id: Crypto.randomUUID(), scannedAt: new Date().toISOString(), state: 'pending' });
  emit();
  await persist();
}

/** Send every pending scan, oldest first. Stops at the first network failure. */
export function syncBoothScans(id: string): Promise<void> {
  if (syncing) return syncing;
  syncing = (async () => {
    await load(id);
    for (const item of queue.filter((q) => q.state === 'pending')) {
      if (userId !== id || !isOnline()) break;
      const res = await boothScan(item.sponsorId, item.eventSponsorId, item.qrCode);
      if (!res.ok && res.message === OFFLINE_MESSAGE) break;
      queue = res.ok
        ? queue.filter((q) => q.id !== item.id)
        : queue.map((q) => (q.id === item.id ? { ...q, state: 'failed' as const, message: res.message } : q));
      emit();
      await persist();
    }
  })().finally(() => {
    syncing = null;
  });
  return syncing;
}

/** Forget a scan the server refused. */
export async function dismissBoothScan(id: string): Promise<void> {
  queue = queue.filter((q) => q.id !== id);
  emit();
  if (userId) await persist();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

/** This sponsor's queued scans (pending and refused), live. Loads the account's queue. */
export function useBoothScanQueue(id: string | undefined, sponsorId: string): QueuedBoothScan[] {
  useEffect(() => {
    if (id) void load(id);
  }, [id]);
  const all = useSyncExternalStore(subscribe, () => queue);
  return all.filter((q) => q.sponsorId === sponsorId);
}
