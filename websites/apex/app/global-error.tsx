"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

/**
 * Last resort when the root layout itself fails, so it renders its own
 * <html> without the site's CSS: inline styles only.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100vh", display: "grid", placeItems: "center", background: "#000", color: "#f4f1ea", fontFamily: "system-ui, sans-serif", padding: 16 }}>
        <main style={{ maxWidth: 480, textAlign: "center" }}>
          <h1 style={{ fontSize: 28, margin: 0 }}>Something went wrong.</h1>
          <p style={{ opacity: 0.7 }}>It&apos;s on our side, not yours. Try again in a moment.</p>
          <button type="button" onClick={reset} style={{ marginTop: 16, padding: "10px 20px", borderRadius: 8, border: 0, fontWeight: 600, cursor: "pointer" }}>
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
