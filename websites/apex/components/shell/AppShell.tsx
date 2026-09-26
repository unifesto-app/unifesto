"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/context/SessionContext";
import { spaceUrl } from "@/lib/types/rbac";
import { Navbar } from "./Navbar";
import { Sidebar } from "./Sidebar";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Authenticated shell for the platform-admin surface. Apex is platform-staff
 * only (P1.4): admins stay, organisers are sent to the space app where their
 * operator surface now lives, and accounts with no Apex surface (Member /
 * attendee) go to /no-access.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { role, loading } = useSession();

  useEffect(() => {
    if (loading || role === "platform_admin") return;
    if (role === "space_admin") {
      // External origin — hard navigation, not the SPA router.
      window.location.href = spaceUrl();
    } else {
      router.replace("/no-access");
    }
  }, [loading, role, router]);

  // Until we know the user is an admin, hold the skeleton rather than flashing
  // mission-control content (a redirect may be in flight).
  if (loading || role !== "platform_admin") {
    return <ShellSkeleton />;
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <Sidebar role={role} />
      <main className="min-h-screen pt-16 pl-60">
        <div className="mx-auto max-w-6xl p-8">{children}</div>
      </main>
    </div>
  );
}

function ShellSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      <div className="fixed left-0 right-0 top-0 z-20 flex h-16 items-center justify-between border-b border-border bg-card px-6">
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-8 w-8 rounded-full" />
      </div>
      <main className="min-h-screen pt-16">
        <div className="mx-auto max-w-6xl space-y-4 p-8">
          <Skeleton className="h-8 w-64" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28 w-full" />
            ))}
          </div>
          <Skeleton className="h-64 w-full" />
        </div>
      </main>
    </div>
  );
}
