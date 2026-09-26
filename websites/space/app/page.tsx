"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getCurrentUser } from "@/lib/api/current-user-api";
import { resolveLanding, apexUrl } from "@/lib/types/rbac";
import { getAuthToken } from "@/lib/utils/auth";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Landing gate. Resolves the signed-in user's surface and forwards them:
 *   - Not signed in                     → /login
 *   - Operator role in ≥1 space         → /dashboard
 *   - Platform admin (no space role)    → Apex (they belong there)
 *   - Signed in, nothing to operate     → /no-access
 */
export default function LandingPage() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    async function route() {
      if (!getAuthToken()) {
        router.replace("/login");
        return;
      }
      const { data } = await getCurrentUser();
      if (cancelled) return;

      const dest = resolveLanding(data);
      if (dest.kind === "dashboard") router.replace("/dashboard");
      else if (dest.kind === "apex") window.location.href = apexUrl();
      else router.replace("/no-access");
    }

    void route();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-8">
      <div className="w-full max-w-sm space-y-3 text-center">
        <Skeleton className="mx-auto h-8 w-32" />
        <Skeleton className="mx-auto h-4 w-48" />
        <p className="pt-2 text-sm text-muted-foreground">
          Taking you to your space…
        </p>
      </div>
    </div>
  );
}
