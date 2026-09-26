"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "space:rail-collapsed";

/**
 * Remembers whether the desktop nav rail is collapsed, persisted across
 * reloads in localStorage.
 *
 * Starts `false` on both server and first client render (so hydration matches),
 * then reconciles with the stored preference in an effect. That trades a brief
 * expand→collapse flash on reload for a hydration-mismatch-free tree — the
 * safe default for a preference that only affects chrome.
 */
export function useCollapsibleRail(): [boolean, () => void] {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      // localStorage unavailable (private mode, etc.) — keep the default.
    }
  }, []);

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        // Ignore write failures; the in-memory state still updates.
      }
      return next;
    });
  }, []);

  return [collapsed, toggle];
}
