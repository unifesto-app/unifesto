"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { AppleLogo, GoogleLogo } from "@unifesto/unicon/react";
import { signInHref } from "@/lib/auth";
import { appleSignInEnabled, googleSignInEnabled } from "@/lib/cognito";
import { isOwnHost } from "@/lib/own-host";

const noop = () => () => {};

/**
 * K18: "Continue with Google" and "Continue with Apple", next to the email
 * code. Our own hosts only: a space's custom domain keeps the email code
 * (Cognito can't list them all). Shows why when the provider sends someone
 * back without signing them in.
 */
export default function SocialSignIn({ next }: { next: string }) {
  const own = useSyncExternalStore(noop, () => isOwnHost(location.hostname), () => false);
  const [error, setError] = useState("");

  useEffect(() => {
    const url = new URL(location.href);
    const why = url.searchParams.get("signin_error");
    if (!why) return;
    url.searchParams.delete("signin_error");
    history.replaceState(null, "", url);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads the URL once, after hydration
    setError(why === "cancelled" ? "Sign-in was cancelled." : "That sign-in didn't finish. Try again, or use your email.");
  }, []);

  if (!googleSignInEnabled || !own) return null;
  return (
    <div className="space-y-4">
      <a href={signInHref("google", next)} className="btn btn-secondary w-full">
        <GoogleLogo weight="bold" className="h-4 w-4" aria-hidden="true" />
        Continue with Google
      </a>
      {appleSignInEnabled && (
        <a href={signInHref("apple", next)} className="btn btn-secondary w-full">
          <AppleLogo weight="fill" className="h-4 w-4" aria-hidden="true" />
          Continue with Apple
        </a>
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}
      <p className="text-center text-xs text-paper/55">or use your email</p>
    </div>
  );
}
