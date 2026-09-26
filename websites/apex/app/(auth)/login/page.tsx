"use client";

import { useState, Suspense } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import backendClient from "@/lib/api/backend-client";
import { getCurrentUser } from "@/lib/api/current-user-api";
import { resolveAppRole } from "@/lib/types/rbac";
import { setAuthToken } from "@/lib/utils/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<"email" | "otp">("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");

  // After sign-in, the root page routes the user to /dashboard.
  const nextPath = searchParams.get("next") || "/";

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
      const { data: profile } = await getCurrentUser();
      if (resolveAppRole(profile) === "none") {
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
    <div className="flex min-h-screen items-center justify-center bg-muted p-4">
      <Card className="w-full max-w-md shadow-md">
        <CardHeader className="pb-6">
          <Image
            src="/UnifestoAppWordmark.png"
            alt="Unifesto"
            width={70}
            height={28}
            priority
            className="-ml-1 h-10 w-30"
          />
          <div className="space-y-1">
            <CardTitle className="text-xl">Sign in to Apex</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive-soft px-3 py-2 text-sm text-[hsl(358_65%_44%)]"
            >
              {error}
            </div>
          )}

          {step === "email" ? (
            <form onSubmit={handleSendOtp} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@organisation.com"
                  autoComplete="email"
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Sending code…" : "Send verification code"}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} className="space-y-3">
              <p className="text-sm text-muted-foreground">
                We sent a code to{" "}
                <span className="font-medium text-foreground">{email}</span>.
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="otp">Verification code</Label>
                <Input
                  id="otp"
                  type="text"
                  inputMode="numeric"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  placeholder="6-digit code"
                  autoComplete="one-time-code"
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Verifying…" : "Verify & sign in"}
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
        </CardContent>
      </Card>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-muted p-4">
          <Card className="w-full max-w-md shadow-md">
            <CardHeader className="space-y-1 pb-6">
              <CardTitle className="text-xl">Apex</CardTitle>
              <CardDescription>Loading…</CardDescription>
            </CardHeader>
          </Card>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
