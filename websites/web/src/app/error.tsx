"use client";

import { useEffect } from "react";
import Link from "next/link";
import * as Sentry from "@sentry/nextjs";
import Navbar from "@/components/Navbar";

/**
 * Any page that throws lands here: an API failure on an event, blog or
 * certificate page says "try again", never "not found" (that is a real 404,
 * see not-found.tsx).
 */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <main className="flex min-h-screen flex-col bg-canvas">
      <Navbar />
      <section className="flex flex-1 items-center px-5 pb-24 pt-32 sm:px-8">
        <div className="mx-auto w-full max-w-xl text-center">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-paper/65">Something went wrong</p>
          <h1 className="mt-4 font-display text-3xl font-bold text-paper">We couldn&apos;t load this page.</h1>
          <p className="mt-3 text-paper/65">It&apos;s on our side, not yours. Try again in a moment.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <button type="button" onClick={reset} className="btn btn-primary">
              Try again
            </button>
            <Link href="/" className="btn btn-secondary">
              Go home
            </Link>
          </div>
          {error.digest && <p className="mt-6 font-mono text-xs text-paper/40">Ref {error.digest}</p>}
        </div>
      </section>
    </main>
  );
}
