"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/context/SessionContext";
import { spaceUrl } from "@/lib/types/rbac";
import { CommandPaletteProvider } from "@/lib/context/CommandPaletteContext";
import { Navbar } from "./Navbar";
import { CommandPalette } from "./CommandPalette";
import { Sidebar } from "./Sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

/**
 * Authenticated shell for the platform-admin surface. Apex is platform-staff
 * only (P1.4): admins stay, organisers are sent to the space app where their
 * operator surface now lives, and accounts with no Apex surface (Member /
 * attendee) go to /no-access.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { role, loading, error, refresh } = useSession();
  const [navOpen, setNavOpen] = useState(false);
  const closeNav = useCallback(() => setNavOpen(false), []);

  useEffect(() => {
    // A failed load says nothing about the role: don't bounce on it.
    if (loading || error || role === "platform_admin") return;
    if (role === "space_admin") {
      // External origin — hard navigation, not the SPA router.
      window.location.href = spaceUrl();
    } else {
      router.replace("/no-access");
    }
  }, [loading, error, role, router]);

  if (error && !loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background p-6 text-center">
        <p className="text-sm text-foreground">Couldn&apos;t load your account.</p>
        <p className="text-xs text-muted-foreground">{error}</p>
        <Button onClick={() => void refresh()}>Try again</Button>
      </div>
    );
  }

  // Until we know the user is an admin, hold the skeleton rather than flashing
  // mission-control content (a redirect may be in flight).
  if (loading || role !== "platform_admin") {
    return <ShellSkeleton />;
  }

  return (
    <CommandPaletteProvider>
      <div className="min-h-screen bg-background">
        <Navbar onMenu={() => setNavOpen((o) => !o)} />
        <Sidebar open={navOpen} onClose={closeNav} />
        <CommandPalette />
        <main className="min-h-screen pt-16 lg:pl-60">
          <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:p-8">{children}</div>
        </main>
      </div>
    </CommandPaletteProvider>
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
