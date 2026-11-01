"use client";

import { useParams } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useAppHref } from "@/lib/appLinks";

/**
 * Where the sign-in QR (QrSignIn) lands when the phone didn't open the app
 * itself: no app, or a build that doesn't claim /qr yet. On Android the button
 * hands the code to the app (or Play); elsewhere it goes to the store.
 */
export default function QrSignInPage() {
  const code = String(useParams().code ?? "");
  const appHref = useAppHref(`unifesto://qr/${code}`);

  return (
    <>
      <Navbar />
      <main className="flex min-h-[80vh] items-center justify-center bg-canvas px-5 pb-20 pt-32">
        <div className="animate-pop-in w-full max-w-md rounded-3xl bg-night-2 p-8 sm:p-10">
          <h1 className="mb-4 font-display text-3xl font-bold text-paper" style={{ letterSpacing: "-0.03em" }}>
            Sign in with the app
          </h1>
          <p className="text-paper/70">
            This code signs a computer in to Unifesto. Open it in the Unifesto app on your phone, signed in, to approve it.
          </p>
          <a href={appHref} className="btn btn-lg btn-primary mt-8 w-full">
            Open in the Unifesto app
          </a>
        </div>
      </main>
      <Footer />
    </>
  );
}
