"use client";

import { useEffect } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SignIn from "@/components/SignIn";
import { useWebSession } from "@/lib/auth";

/**
 * The one sign-in for everyone (K18, Track V8). Signed in already, or once the
 * code is verified, it moves on to `next` (checked same-site by the page).
 */
export default function LoginClient({ next }: { next: string }) {
  const { session, ready, pending } = useWebSession();

  useEffect(() => {
    if (session) location.replace(next);
  }, [session, next]);

  return (
    <main className="min-h-screen overflow-x-hidden bg-canvas">
      <Navbar />
      <section className="px-5 pb-24 pt-28 sm:px-8 md:pt-32">
        <div className="mx-auto max-w-md">
          <h1 className="font-display text-[clamp(1.5rem,3vw,2.2rem)] leading-tight text-paper">Sign in</h1>
          <div className="mt-8 rounded-3xl bg-night-2 p-6 sm:p-8">
            {!ready || session ? null : (
              <SignIn
                next={next}
                pending={pending}
                intro="Sign in with the email on your Unifesto account. We send you a code to confirm it's you."
                submitLabel="Sign in"
              />
            )}
          </div>
        </div>
      </section>
      <Footer />
    </main>
  );
}
