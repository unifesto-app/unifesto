"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { captureUtm } from "@/lib/utm";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

// document.referrer only describes how the tab arrived, so send it with the
// first view of a page load and never with in-app navigations after it.
let landing = true;

/**
 * Counts a page view (K6) with the API's own first-party beacon: path, the
 * referring domain and utm tags. No cookie, no stored id, no third party; the
 * server hashes IP + user agent daily and drops bots. Fire and forget.
 */
function trackView(path: string) {
  try {
    const q = new URLSearchParams(window.location.search);
    const tag = (k: string) => q.get(k)?.trim().slice(0, 100) || undefined;
    const body = JSON.stringify({
      path,
      referrer: landing ? document.referrer || undefined : undefined,
      source: tag("utm_source"),
      medium: tag("utm_medium"),
      campaign: tag("utm_campaign"),
    });
    landing = false;
    void fetch(`${API_URL}/traffic/web-views`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Best effort: a lost view is fine.
  }
}

/** Records landing utm_* tags so "Open in app" can forward them, and counts the view. Renders nothing. */
export default function UtmCapture() {
  const pathname = usePathname();
  useEffect(() => {
    captureUtm();
    if (pathname) trackView(pathname);
  }, [pathname]);
  return null;
}
