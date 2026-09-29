import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';
import { makeOptionalAuthRequest } from '../lib/api/helpers';
import { touchFor } from './utm';

/**
 * Page-view beacons for event and space pages (4.0.5 page analytics).
 *
 * Each install gets a random anonymous visitor id (never the account id); the
 * server keeps one row per visitor per page per day, so re-opening a page only
 * bumps its view count. A view carries the tracking link that opened the page,
 * if any, so curators see which channels bring people in, not just who
 * registered. Fire-and-forget: a tracking call never blocks or breaks a page.
 */

const VISITOR_KEY = 'analytics.visitorId';
let visitorId: Promise<string> | null = null;

function getVisitorId(): Promise<string> {
  if (!visitorId) {
    visitorId = (async () => {
      try {
        const saved = await AsyncStorage.getItem(VISITOR_KEY);
        if (saved) return saved;
      } catch {}
      const fresh = Crypto.randomUUID();
      AsyncStorage.setItem(VISITOR_KEY, fresh).catch(() => {});
      return fresh;
    })();
  }
  return visitorId;
}

export async function trackPageView(target: 'event' | 'space', slug: string | null | undefined): Promise<void> {
  if (!slug || (Platform.OS !== 'ios' && Platform.OS !== 'android')) return;
  try {
    const [id, utm] = await Promise.all([getVisitorId(), touchFor({ kind: target, slug })]);
    await makeOptionalAuthRequest('/track/view', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        target: target === 'event' ? 'EVENT' : 'SPACE',
        key: slug,
        visitorId: id,
        platform: Platform.OS,
        ...(utm ? { utmSource: utm.source, utmMedium: utm.medium, utmCampaign: utm.campaign } : {}),
      }),
    });
  } catch {
    // Best-effort.
  }
}
