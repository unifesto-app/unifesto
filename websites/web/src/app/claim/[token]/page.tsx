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
    const open = openAppOrStore(deepLink);
    open();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <Navbar />
      <main className="mx-auto flex min-h-[70vh] max-w-lg flex-col items-center justify-center px-6 text-center">
        <h1 className="mb-3 text-2xl font-extrabold text-white">
          You&apos;ve been invited
        </h1>
        <p className="mb-8 text-sm text-slate-300">
          Claim your seat in the Unifesto app. If it didn&apos;t open
          automatically, tap below.
        </p>
        <button
          onClick={() => openAppOrStore(deepLink)()}
          className="flex w-full max-w-xs items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-black transition-all duration-200 hover:-translate-y-0.5"
          style={{ background: brandGradient }}
        >
          Open in the Unifesto app
        </button>
        <a
          href={storeUrlFor()}
          className="mt-4 text-xs text-slate-400 underline underline-offset-4"
        >
          Don&apos;t have the app? Get it here
        </a>
      </main>
      <Footer />
    </>
  );
}
