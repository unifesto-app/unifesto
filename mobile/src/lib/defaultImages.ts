import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from './constants';
import { call } from './api/manageEvent';
import { postMultipart } from './api/upload';

/**
 * Stand-in banners (4:3) and logos (1:1) for events and spaces without their
 * own, managed in Apex › Default images. Loaded once at launch (last copy kept
 * for offline starts); each event/space gets one by a stable hash of its id,
 * so the same page always shows the same image.
 */

export interface DefaultImageSet {
  banners: string[];
  logos: string[];
}

const KEY = 'defaultImages.v1';
let current: DefaultImageSet = { banners: [], logos: [] };
const listeners = new Set<() => void>();

function set(next: DefaultImageSet) {
  current = next;
  listeners.forEach((l) => l());
}

/** Load the saved copy, then refresh from the server. Call once at launch; never throws. */
export async function loadDefaultImages(): Promise<void> {
  try {
    const saved = await AsyncStorage.getItem(KEY);
    if (saved) set(JSON.parse(saved));
  } catch {}
  try {
    const res = await fetch(`${API_URL}/default-images`);
    if (!res.ok) return;
    const data = (await res.json()) as DefaultImageSet;
    if (!Array.isArray(data?.banners) || !Array.isArray(data?.logos)) return;
    set({ banners: data.banners, logos: data.logos });
    AsyncStorage.setItem(KEY, JSON.stringify(current)).catch(() => {});
  } catch {}
}

/** The current set; re-renders when it loads or Apex changes it in this session. */
export function useDefaultImages(): DefaultImageSet {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}

/** FNV-1a: small, stable, same result on every device. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function pickDefault(list: string[], id: string | null | undefined): string | null {
  if (!list.length || !id) return null;
  return list[hash(id) % list.length];
}

/** An event's cover, else its stand-in banner (null when there are none: keep the gradient). */
export function useEventCover(event: { id?: string | null; coverImageUrl?: string | null } | null | undefined): string | null {
  const { banners } = useDefaultImages();
  return event?.coverImageUrl || pickDefault(banners, event?.id);
}

/** Same, outside components (lists that already have the set from useDefaultImages). */
export const coverOr = (set: DefaultImageSet, id: string | null | undefined, url: string | null | undefined) =>
  url || pickDefault(set.banners, id);
export const logoOr = (set: DefaultImageSet, id: string | null | undefined, url: string | null | undefined) =>
  url || pickDefault(set.logos, id);

// ── Apex ─────────────────────────────────────────────────────────────────────

export interface DefaultImageRow {
  id: string;
  kind: 'BANNER' | 'LOGO';
  url: string;
  createdAt: string;
}

export const getAllDefaultImages = () => call<DefaultImageRow[]>('/admin/default-images');

export function addDefaultImage(kind: 'BANNER' | 'LOGO', uri: string) {
  const name = uri.split('/').pop() || 'image.jpg';
  const ext = /\.(\w+)$/.exec(name)?.[1]?.toLowerCase();
  const type = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
  return postMultipart<DefaultImageRow>('/admin/default-images', { field: 'file', uri, name, type }, { kind });
}

export const deleteDefaultImage = (id: string) => call<{ success: boolean }>(`/admin/default-images/${id}`, { method: 'DELETE' });
