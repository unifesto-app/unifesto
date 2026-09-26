"use client";

import { useEffect } from "react";

/**
 * Wires up the "modal drawer" behaviours that keep a slide-in panel feeling
 * native: pressing Escape closes it, and the page behind it stops scrolling
 * while it's open (so a scroll gesture moves the drawer's list, not the page
 * underneath — the classic "background bleed" bug on mobile).
 *
 * The drawer already opens/closes via the hamburger, the overlay tap, and
 * on-navigate. This hook is the polish layer on top of that.
 *
 * @param open   Whether the drawer is currently open.
 * @param close  Callback that closes the drawer.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * TODO(you): implement the effect body. It runs on every change to `open`.
 *
 * Two behaviours to add, and one real decision to make:
 *
 *   1. Escape to close — add a `keydown` listener on `document` (or `window`)
 *      that calls `close()` when `event.key === "Escape"`.
 *
 *   2. Scroll-lock — while open, prevent the page behind from scrolling. The
 *      simplest approach is toggling `document.body.style.overflow = "hidden"`
 *      and restoring it on cleanup. (A more advanced version preserves the
 *      scroll position, but "hidden" is fine for a first pass.)
 *
 *   Decision: should the effect do ANYTHING when `open` is false? Attaching a
 *   global keydown listener that runs on every keystroke even when the drawer
 *   is closed is wasteful. Prefer to early-return when `!open` so the listener
 *   and the scroll-lock only exist for the lifetime of an open drawer — and
 *   remember the cleanup function must undo whatever the effect set up.
 *
 *   Return a cleanup function from the effect that removes the listener and
 *   restores `body.overflow`, so nothing leaks once the drawer closes.
 * ─────────────────────────────────────────────────────────────────────────
 */
export function useDrawerBehavior(open: boolean, close: () => void) {
  useEffect(() => {
    // Nothing to wire up while closed — skip the global listener + lock so they
    // exist only for the lifetime of an open drawer.
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKeyDown);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, close]);
}
