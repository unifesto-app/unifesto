"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { getCurrentUser } from "@/console/lib/api/current-user-api";
import { getMyPortal } from "@/console/lib/api/sponsor-portal-api";
import { resolveLanding, apexUrl, type CurrentUser } from "@/console/lib/types/rbac";
import { currentToken, loginHref, signOut } from "@/console/lib/utils/auth";
import { Button } from "@/console/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/console/components/ui/card";
import { Skeleton } from "@/console/components/ui/skeleton";

/**
 * Access-restricted screen.
 *
 * Reached when a signed-in account authenticates but holds no operator role in
 * any space — i.e. it is only an attendee / plain member. We re-verify on mount
 * so this page is never a dead-end:
 *   - No token           → /login
 *   - Operator account   → /console (landed here by mistake)
 *   - Platform admin     → Apex (they belong there)
 *   - Attendee / member  → show the restriction, offer sign out.
 */
export default function NoAccessPage() {
  const router = useRouter();
  const [status, setStatus] = useState<"checking" | "denied">("checking");
  const [user, setUser] = useState<CurrentUser | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function verify() {
      if (!(await currentToken())) {
        router.replace(loginHref("/console"));
        return;
      }
      const { data } = await getCurrentUser();
      if (cancelled) return;

      const dest = resolveLanding(data);
      if (dest.kind === "dashboard") {
        router.replace("/console");
        return;
      }
      if (dest.kind === "apex") {
        window.location.href = apexUrl();
        return;
      }

      // Not an operator or platform admin — but they may be a sponsor. Probe the
      // sponsor portal before declaring no access, so an invited sponsor lands
      // in their portal instead of this dead-end.
      const portal = await getMyPortal();
      if (cancelled) return;
      if (portal.data && portal.data.length > 0) {
        router.replace("/console/sponsor");
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

  const handleSignOut = async () => {
    await signOut();
    router.replace("/login");
  };

  if (status === "checking") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="w-full max-w-md space-y-3 text-center">
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
            <CardTitle className="text-xl">
              You&rsquo;re signed in, but this space console isn&rsquo;t for this
              account
            </CardTitle>
            <CardDescription>
              This is the operator console for space admins, curators and crew.
              This account doesn&rsquo;t run any space yet.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {user && (
            <div className="rounded-md border border-border bg-card px-3 py-2.5 text-sm">
              <p className="font-medium text-foreground">{user.name}</p>
              <p className="text-muted-foreground">{user.email}</p>
            </div>
          )}

          <p className="text-sm text-muted-foreground">
            If you help run events, ask a space admin to add you as a curator or
            crew — then sign in again. Looking for the attendee app? That lives
            in the Unifesto mobile app.
          </p>

          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={handleSignOut}
          >
            Sign out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
