"use client";

import { useEffect } from "react";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { List } from "@unifesto/unicon/react";
import { useSession } from "@/console/lib/context/SessionContext";
import {
  MobileNavProvider,
  useMobileNav,
} from "@/console/lib/context/MobileNavContext";
import { CommandPaletteProvider } from "@/console/lib/context/CommandPaletteContext";
import { signOut } from "@/console/lib/utils/auth";
import { Skeleton } from "@/console/components/ui/skeleton";
import { isPersonalPath } from "./nav-config";
import { CommandPalette } from "./CommandPalette";
import { FeeNoticeBanner } from "./FeeNoticeBanner";
import { LegalAcceptSheet } from "./LegalAcceptSheet";

/**
 * Authenticated shell for everyone signed in (V9). Waits for the session;
 * accounts with no space role (attendees, members) get the personal pages,
 * and any space page sends them home. The chrome itself (wordmark, search,
 * the signed-in user, theme, sign out) lives in the sidebar.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { hasAccess, loading } = useSession();
  const offLimits = !hasAccess && !isPersonalPath(pathname);

  useEffect(() => {
    if (!loading && offLimits) {
      router.replace("/console");
    }
  }, [loading, offLimits, router]);

  if (loading || offLimits) {
    // Redirect in flight (or still loading) — keep the skeleton up rather than
    // flashing operator content at an unauthorised account.
    return <ShellSkeleton />;
  }

  const handleSignOut = async () => {
    await signOut();
    router.replace("/login");
  };

  return (
    <MobileNavProvider>
      <CommandPaletteProvider>
      <div className="min-h-screen bg-background">
        {/* No header bar on desktop: the sidebar carries it (RailChrome).
            Phones keep this slim bar to open the sidebar drawer. */}
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-border bg-card px-4 lg:hidden">
          <MobileNavToggle />
          <Image
            src="/UnifestoAppWordmark.png"
            alt="Unifesto"
            width={64}
            height={26}
            priority
            className="wordmark h-7 w-auto"
          />
        </header>
      <CommandPalette />
      <LegalAcceptSheet onSignOut={handleSignOut} />

        {/* The dashboard layout adds the sidebar and its own centered content
            column; other authed screens render children directly. */}
        <main className="min-h-screen">
          {hasAccess && <FeeNoticeBanner />}
          {children}
        </main>
      </div>
      </CommandPaletteProvider>
    </MobileNavProvider>
  );
}

/**
 * Hamburger that opens the space nav drawer. Only shown below `lg`, where the
 * desktop rail is hidden; on desktop the rail is always present so no toggle is
 * needed.
 */
function MobileNavToggle() {
  const { toggle } = useMobileNav();
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Open navigation"
      className="-ml-1 rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:hidden"
    >
      <List className="h-5 w-5" />
    </button>
  );
}

function ShellSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 hidden w-64 space-y-4 border-r border-border bg-sidebar p-4 lg:block">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-9 w-full" />
      </aside>
      <main className="min-h-screen lg:ml-64">
        <div className="mx-auto max-w-6xl space-y-4 p-8">
          <Skeleton className="h-8 w-64" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-28 w-full" />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
