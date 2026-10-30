"use client";

import { useState, Suspense } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import backendClient from "@/lib/api/backend-client";
import { getCurrentUser } from "@/lib/api/current-user-api";
import { resolveAppRole, spaceUrl } from "@/lib/types/rbac";
import { setAuthToken } from "@/lib/utils/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<"email" | "otp">("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");

  // After sign-in, the root page routes the user to /dashboard.
  // Same-origin paths only (J17): `//evil.com`, `/\evil.com`, `https://…` or a
  // tab/newline trick would be an open redirect.
  const next = searchParams.get("next") ?? "";
  const nextPath = /^\/(?![/\\])[^\s\\]*$/.test(next) ? next : "/";

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setError("Email is required.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await backendClient.post("/auth/email", { email });
      setStep("otp");
    } catch (err) {
      setError(
        (err as { message?: string })?.message ??
          "Failed to send verification code."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp) {
      setError("Please enter the verification code.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const { data } = await backendClient.post("/auth/email/verify", {
        email,
        otp,
      });
      const token = data?.accessToken;
      if (!token) throw new Error("Authentication failed — no token returned.");

      setAuthToken(token);

      // Resolve the account's Apex surface before routing. Members / attendees
      // authenticate fine but have no admin or organiser access — send them to
      // the access-restricted screen instead of a protected route.
      const { data: profile, error: meError } = await getCurrentUser();
      const role = resolveAppRole(profile);
      if (role === "space_admin") {
        // Space operators work in the Space app; the cookie is shared.
        window.location.href = spaceUrl();
        return;
      }
      // A failed profile load isn't a denial: the dashboard shell retries it.
      if (!meError && role === "none") {
        router.replace("/no-access");
        return;
      }

      router.push(nextPath);
      router.refresh();
    } catch (err) {
      setError((err as { message?: string })?.message ?? "Verification failed.");
      setLoading(false);
    }
  };

  return (
    <Frame>
      <h1 className="font-display text-2xl leading-snug text-foreground">Sign in to Apex</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {step === "email" ? (
          "Unifesto staff only. We'll email you a code."
        ) : (
          <>
            Enter the code we sent to <span className="font-medium text-foreground">{email}</span>.
          </>
        )}
      </p>

      {error && (
        <p role="alert" className="mt-6 rounded-lg border border-destructive/30 bg-destructive-soft px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {step === "email" ? (
        <form onSubmit={handleSendOtp} className="mt-8 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@unifesto.app"
              autoComplete="email"
              autoFocus
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Sending code…" : "Email me a code"}
          </Button>
        </form>
      ) : (
        <form onSubmit={handleVerifyOtp} className="mt-8 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="otp">Code</Label>
            <Input
              id="otp"
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
              placeholder="000000"
              autoComplete="one-time-code"
              autoFocus
              className="h-12 text-center font-mono text-lg tabular-nums tracking-[0.5em]"
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Verifying…" : "Verify and sign in"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-full"
            onClick={() => {
              setStep("email");
              setOtp("");
              setError("");
            }}
            disabled={loading}
          >
            Use a different email
          </Button>
        </form>
      )}

      <p className="mt-10 border-t border-border pt-4 text-xs text-muted-foreground">
        Running a space?{" "}
        <a href={spaceUrl()} className="text-foreground underline underline-offset-4">
          Sign in to the console
        </a>
      </p>
    </Frame>
  );
}

/**
 * The sign-in page around its column: the wordmark and "Apex" at the top
 * left (as in the sidebar), the form in a narrow column at the centre, no
 * card around it, and Horizon's line of light along the foot.
 */
function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-background">
      <header className="flex items-center gap-2 p-6">
        <Image src="/UnifestoAppWordmark.png" alt="Unifesto" width={64} height={26} priority className="wordmark h-7 w-auto" />
        <span className="text-sm font-medium text-muted-foreground">Apex</span>
      </header>
      <main className="flex flex-1 items-center justify-center px-6 pb-24">
        <div className="w-full max-w-sm">{children}</div>
      </main>
      {/* The website's horizon: a 1px line of bloom fading at both ends, and a soft glow over it. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-48 bg-[radial-gradient(50%_100%_at_50%_100%,rgb(var(--bloom)/0.1),transparent_70%)]" />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-[linear-gradient(90deg,transparent,rgb(var(--bloom)/0.18)_25%,rgb(var(--bloom)/0.6)_50%,rgb(var(--bloom)/0.18)_75%,transparent)]"
      />
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <Frame>
          <h1 className="font-display text-2xl leading-snug text-foreground">Sign in to Apex</h1>
          <p className="mt-1 text-sm text-muted-foreground">Loading…</p>
        </Frame>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
