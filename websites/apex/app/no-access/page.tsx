"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { getCurrentUser } from "@/lib/api/current-user-api";
import { resolveAppRole, type CurrentUser } from "@/lib/types/rbac";
import { clearAuthToken, getAuthToken } from "@/lib/utils/auth";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Access-restricted screen.
 *
 * Reached when a signed-in account authenticates successfully but holds no
 * Apex surface — i.e. it is only a MEMBER / attendee, not a platform admin
 * and not a SPACE_ADMIN in any space (see `resolveAppRole`).
 *
 * We verify the state on mount so this page can never be a dead-end:
 *   - No token            → send to /login.
 *   - Privileged account  → forward to /dashboard (they landed here by mistake).
 *   - Member / attendee   → show the restriction, offer sign out.
 */
export default function NoAccessPage() {
  const router = useRouter();
  const [status, setStatus] = useState<"checking" | "denied">("checking");
  const [user, setUser] = useState<CurrentUser | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function verify() {
      if (!getAuthToken()) {
        router.replace("/login");
        return;
      }
      const { data, error } = await getCurrentUser();
      if (cancelled) return;

      // A failed load isn't a denial: the dashboard shell offers a retry.
      if (error || resolveAppRole(data) !== "none") {
        router.replace("/dashboard");
        return;
      }

      setUser(data);
      setStatus("denied");
    }

    void verify();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const handleSignOut = () => {
    clearAuthToken();
    router.replace("/login");
  };

  if (status === "checking") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="w-full max-w-md space-y-4 text-center">
          <Skeleton className="mx-auto h-8 w-32" />
          <Skeleton className="mx-auto h-4 w-56" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md shadow-md">
        <CardHeader className="space-y-4 pb-6">
          <Image
            src="/UnifestoAppWordmark.png"
            alt="Unifesto"
            width={70}
            height={28}
            priority
            className="wordmark -ml-1 h-10 w-30"
          />
          <div
            aria-hidden
            className="flex h-11 w-11 items-center justify-center rounded-lg bg-muted text-muted-foreground"
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <div className="space-y-1.5">
            <CardTitle className="text-xl">You&rsquo;re signed in, but Apex isn&rsquo;t for this account</CardTitle>
            <CardDescription>
              Apex is the control room for platform staff and event organisers.
              This account doesn&rsquo;t have organiser or admin privileges yet.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {user && (
            <div className="text-sm">
              <p className="font-medium text-foreground">{user.name}</p>
              <p className="text-muted-foreground">{user.email}</p>
            </div>
          )}

          <p className="text-sm text-muted-foreground">
            If you organise events, ask a space owner to add you as a
            Space Admin — then sign in again. Looking for the
            attendee app? That lives in the Unifesto mobile app.
          </p>

          <div className="space-y-2">
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={handleSignOut}
            >
              Sign out
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
