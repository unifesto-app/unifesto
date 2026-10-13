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
