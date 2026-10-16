"use client";

import { useEffect } from "react";
import { useParams } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { openAppOrStore, storeUrlFor } from "@/lib/appLinks";
import { brandGradient } from "@/lib/styles";

/**
 * Group-seat claim landing (fast-registration Part 2). Claiming happens in the
 * mobile app (registration is mobile-only and needs the claimer signed in), so
 * this universal-link page just hands off to the app — opening it directly on
 * mobile, or pointing at the store on desktop.
 */
export default function ClaimPage() {
  const params = useParams();
  const token = String(params.token ?? "");
  const deepLink = `unifesto://claim/${token}`;

  // Try to open the app automatically on arrival (mobile).
  useEffect(() => {
    return openAppOrStore(deepLink);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <Navbar />
      <main className="flex min-h-[80vh] items-center justify-center bg-canvas px-5 pb-20 pt-32">
        <div className="animate-pop-in w-full max-w-md rounded-3xl bg-night-2 p-8 text-center sm:p-10">
          <h1 className="font-display text-3xl font-bold text-paper" style={{ letterSpacing: "-0.03em" }}>
            You&apos;ve been invited.
          </h1>
          <p className="mt-3 text-base leading-relaxed text-paper/70">
            Claim your seat in the Unifesto app. If it didn&apos;t open on its own, tap below.
          </p>
          <button onClick={() => openAppOrStore(deepLink)} className="btn btn-lg btn-primary mt-8 w-full">
            Open in the Unifesto app
          </button>
          <a href={storeUrlFor()} className="link-draw mt-5 inline-block text-sm text-paper/65">
            Don&apos;t have the app? Get it here
          </a>
        </div>
      </main>
      <Footer />
    </>
  );
}
