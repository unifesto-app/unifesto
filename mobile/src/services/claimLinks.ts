import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Claim links that already reached a final outcome on this device (claimed,
 * declined, already going, or dead). Android re-delivers the launch link when
 * the app is reopened from recents (and on every dev reload), and a push tap
 * can be replayed too, which kept re-opening "Claim your seat" with an error.
 * Replays of these links are sent home instead.
 */
const KEY = 'claim.handledTokens';
const MAX = 50;

async function read(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export async function markClaimLinkHandled(token: string): Promise<void> {
  if (!token) return;
  const list = await read();
  if (list.includes(token)) return;
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify([token, ...list].slice(0, MAX)));
  } catch {}
}

export async function isClaimLinkHandled(token: string | null | undefined): Promise<boolean> {
  if (!token) return false;
  return (await read()).includes(token);
}

/** The token in any claim link form: unifesto://claim/x, https://unifesto.app/claim/x, /claim/x. */
export function claimTokenFrom(pathOrUrl: string | null | undefined): string | null {
  const m = /(?:^|\/)claim\/([^/?#]+)/i.exec(pathOrUrl ?? '');
  return m ? decodeURIComponent(m[1]) : null;
}

// ── Launch-link replay guard ────────────────────────────────────────────────
// Every claim link that arrives from outside the app is recorded the first time.
// If the SAME link comes back as the launch link again (Android relaunch from
// recents, a dev reload, a replayed push), it's a replay: the user already saw
// it, and any still-open invite is on the Home card.
const SEEN_KEY = 'claim.seenLaunchTokens';

async function readSeen(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(SEEN_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

/** True if this token already arrived by link before; records it either way. */
export async function seenClaimLinkBefore(token: string): Promise<boolean> {
  const list = await readSeen();
  if (list.includes(token)) return true;
  try {
    await AsyncStorage.setItem(SEEN_KEY, JSON.stringify([token, ...list].slice(0, MAX)));
  } catch {}
  return false;
}
