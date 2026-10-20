"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getCurrentUser } from "@/lib/api/current-user-api";
import { resolveAppRole, spaceUrl } from "@/lib/types/rbac";
import { getAuthToken } from "@/lib/utils/auth";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Landing gate. Apex is platform-staff only (P1.4), so this forwards the
 * signed-in user to the right place:
 *   - Not signed in            → /login
 *   - Admin / Employee (staff) → /dashboard
 *   - Organiser                → the space app (space.unifesto.app), where the
 *                                operator surface now lives
 *   - Member / attendee only   → /no-access (signed in, but no Apex surface)
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
      const { data, error } = await getCurrentUser();
      if (cancelled) return;
      // A failed load isn't "no access": the dashboard shell offers a retry.
      if (error) return router.replace("/dashboard");
      const role = resolveAppRole(data);
      if (role === "platform_admin" || role === "employee") {
        router.replace("/dashboard");
      } else if (role === "space_admin") {
        // External origin — hard navigation, not the SPA router.
        window.location.href = spaceUrl();
      } else {
        router.replace("/no-access");
      }
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
          Taking you to your dashboard…
        </p>
      </div>
    </div>
  );
}
