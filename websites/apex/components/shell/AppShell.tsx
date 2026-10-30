"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { List, Lock } from "@unifesto/unicon/react";
import { useSession } from "@/lib/context/SessionContext";
import { spaceUrl } from "@/lib/types/rbac";
import { CommandPaletteProvider } from "@/lib/context/CommandPaletteContext";
import { CommandPalette } from "./CommandPalette";
import { Sidebar } from "./Sidebar";
import { Breadcrumbs } from "./Breadcrumbs";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/EmptyState";
import { isPathOpen, navFor } from "./nav-config";

/**
 * Authenticated shell for platform staff. Apex is platform-staff only (P1.4):
 * admins see everything, employees see the pages their platform capabilities
 * open, organisers are sent to the space app where their operator surface now
 * lives, and accounts with no Apex surface (Member / attendee) go to /no-access.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, role, loading, error, refresh } = useSession();
  const [navOpen, setNavOpen] = useState(false);
  const closeNav = useCallback(() => setNavOpen(false), []);
  const staff = role === "platform_admin" || role === "employee";
  const nav = useMemo(() => navFor(role, user?.platform), [role, user?.platform]);

  useEffect(() => {
    // A failed load says nothing about the role: don't bounce on it.
    if (loading || error) return;
    if (staff) {
      // The admin home isn't an employee page: start them on their first one.
      const first = nav[0]?.items[0]?.href;
      if (role === "employee" && pathname === "/dashboard" && first) router.replace(first);
      return;
    }
    if (role === "space_admin") {
      // External origin — hard navigation, not the SPA router.
      window.location.href = spaceUrl();
    } else {
      router.replace("/no-access");
    }
  }, [loading, error, staff, role, nav, pathname, router]);

  if (error && !loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background p-6 text-center">
        <p className="text-sm text-foreground">Couldn&apos;t load your account.</p>
        <p className="text-xs text-muted-foreground">{error}</p>
        <Button onClick={() => void refresh()}>Try again</Button>
      </div>
    );
  }

  // Until we know the user is staff, hold the skeleton rather than flashing
  // mission-control content (a redirect may be in flight).
  if (loading || !staff) {
    return <ShellSkeleton />;
  }

  return (
    <CommandPaletteProvider>
      <div className="min-h-screen bg-background">
        {/* No header bar on desktop: the sidebar carries it. Phones keep this slim bar to open the drawer. */}
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-border bg-card px-4 lg:hidden">
          <button
            type="button"
            onClick={() => setNavOpen((o) => !o)}
            aria-label="Open navigation"
            className="-ml-1 rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <List className="h-5 w-5" />
          </button>
          <Image src="/UnifestoAppWordmark.png" alt="Unifesto" width={64} height={26} priority className="wordmark h-7 w-auto" />
          <span className="text-sm font-medium text-muted-foreground">Apex</span>
        </header>
        <Sidebar open={navOpen} onClose={closeNav} />
        <CommandPalette />
        <main className="min-h-screen lg:pl-60">
          <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:p-8">
            <div className="mb-6">
              <Breadcrumbs nav={nav} />
            </div>
            {isPathOpen(pathname, nav) ? (
              children
            ) : (
              <EmptyState
                icon={Lock}
                title="No access to this page"
                description="Your account can't open this part of Apex. Ask a platform admin if you need it."
              />
            )}
          </div>
        </main>
      </div>
    </CommandPaletteProvider>
  );
}

function ShellSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 hidden w-60 space-y-4 border-r border-border bg-sidebar p-4 lg:block">
        <Skeleton className="h-7 w-28" />
        <Skeleton className="h-9 w-full" />
      </aside>
      <main className="min-h-screen lg:pl-60">
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
