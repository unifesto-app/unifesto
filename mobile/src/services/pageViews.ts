import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';
import { API_URL } from '../lib/constants';
import ConsentManager from './ConsentManager';
import { recentTouch } from './utm';

/**
 * Page views for event and space pages, so curators see how many people
 * looked at a page next to how many registered.
 *
 * The visitor is a random id made on this install (never the IDFV/Android id
 * and never the account), so views are anonymous. Consent-gated like the rest
 * of analytics: nothing is sent once analytics consent is withdrawn. Repeat
 * views of one page inside 30 minutes are dropped here, and again server-side.
 */

const VISITOR_KEY = 'traffic.visitorId';
const DEDUPE_MS = 30 * 60_000;
/** A tagged link opened this long before the page counts as what brought the visitor. */
const LINK_WINDOW_MS = 10 * 60_000;

const lastSent = new Map<string, number>();
let visitorId: Promise<string | null> | null = null;

function getVisitorId(): Promise<string | null> {
  visitorId ??= (async () => {
    try {
      const saved = await AsyncStorage.getItem(VISITOR_KEY);
      if (saved) return saved;
      const id = Crypto.randomUUID();
      await AsyncStorage.setItem(VISITOR_KEY, id);
      return id;
    } catch {
      visitorId = null; // try again next time
      return null;
    }
  })();
  return visitorId;
}

/**
 * Record one view of an event or space page. Fire and forget: never throws,
 * never blocks the screen. `slug` lets a view be credited to a tagged link
 * that pointed at the page by slug.
 */
export async function trackPageView(kind: 'event' | 'space', id: string, slug?: string | null): Promise<void> {
  try {
    if (!id || !ConsentManager.isTrackingAllowed()) return;
    const key = `${kind}:${id}`;
    const now = Date.now();
    if (now - (lastSent.get(key) ?? 0) < DEDUPE_MS) return;
    lastSent.set(key, now);

    const visitor = await getVisitorId();
    if (!visitor) return;
    const utm = await recentTouch({ kind, keys: [id, slug] }, LINK_WINDOW_MS);

    await fetch(`${API_URL}/traffic/views`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        target: kind === 'event' ? 'EVENT' : 'SPACE',
        id,
        visitorId: visitor,
        platform: Platform.OS === 'ios' ? 'ios' : 'android',
        ...(utm ? { source: utm.source, medium: utm.medium, campaign: utm.campaign } : {}),
      }),
    });
  } catch {
    // Best effort: a lost view is fine.
  }
}
