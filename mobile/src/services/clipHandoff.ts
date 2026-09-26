import { takeClipHandoff, type ClipHandoff } from '../../modules/clip-handoff';

/**
 * Someone previewed an event in the App Clip (mobile/targets/clip), then
 * installed the full app from its App Store banner. The clip left that event's
 * path in the shared app group. On the app's first start we reopen it so they
 * land where they left off instead of on Home.
 *
 * Read-once: the native side clears the value as it is taken, so this can
 * only ever fire on one launch.
 */
export function takeClipResumePath(now = Date.now()): string | null {
  const handoff = takeClipHandoff();
  if (!handoff) return null;
  return shouldResumeClipHandoff(handoff, now) ? handoff.path : null;
}

/**
 * Is this handoff still worth acting on?
 *
 * TODO(you): decide how stale a clip visit can be before reopening it would
 * feel random rather than helpful.
 */
export function shouldResumeClipHandoff(handoff: ClipHandoff, now: number): boolean {
  return true;
}
