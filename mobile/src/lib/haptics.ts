// Haptics, used sparingly: only where a tap on the hand says something the
// screen already shows (a card coming into focus, a refresh landing).
// Loaded lazily so a binary built before expo-haptics was added never crashes
// on import; it just stays silent.
let mod: typeof import('expo-haptics') | null | undefined;

function haptics() {
  if (mod === undefined) {
    try {
      mod = require('expo-haptics');
    } catch {
      mod = null;
    }
  }
  return mod;
}

/** Light tick when a picker-like control lands on a new item. */
export function selectionTick() {
  void haptics()?.selectionAsync().catch(() => {});
}

/** A finished action the person started (e.g. pull-to-refresh). */
export function successTap() {
  const h = haptics();
  void h?.notificationAsync(h.NotificationFeedbackType.Success).catch(() => {});
}
