"use client";

import { useEffect } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { List, MagnifyingGlass } from "@unifesto/unicon/react";
import { useSession } from "@/lib/context/SessionContext";
import {
  MobileNavProvider,
  useMobileNav,
} from "@/lib/context/MobileNavContext";
import {
  CommandPaletteProvider,
  useCommandPalette,
} from "@/lib/context/CommandPaletteContext";
import { clearAuthToken } from "@/lib/utils/auth";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SpaceSwitcher } from "./SpaceSwitcher";
import { CommandPalette } from "./CommandPalette";
import { ThemeToggle } from "./ThemeToggle";
import { FeeNoticeBanner } from "./FeeNoticeBanner";

/**
 * Authenticated shell. Waits for the session, sends accounts with no operator
 * role (signed in, but attendee/member only) to /no-access, and frames the
 * space-scoped chrome: wordmark, space switcher, and the signed-in user.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, hasAccess, loading } = useSession();

  useEffect(() => {
    if (!loading && !hasAccess) {
      router.replace("/no-access");
    }
  }, [loading, hasAccess, router]);

  if (loading || !hasAccess) {
    // Redirect in flight (or still loading) — keep the skeleton up rather than
    // flashing operator content at an unauthorised account.
    return <ShellSkeleton />;
  }

  const handleSignOut = () => {
    clearAuthToken();
    router.replace("/login");
  };

  return (
    <MobileNavProvider>
      <CommandPaletteProvider>
      <div className="min-h-screen bg-background">
        <header className="fixed inset-x-0 top-0 z-40 flex h-16 items-center justify-between border-b border-border bg-card px-4 sm:px-6">
          {/* min-w-0 lets the switcher shrink instead of pushing the right side
              off a 375px screen (B12). */}
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <MobileNavToggle />
            <Image
            src="/UnifestoAppWordmark.png"
            alt="Unifesto"
            width={64}
            height={26}
            priority
            className="wordmark h-7 w-auto"
          />
          <span className="hidden text-sm font-medium text-muted-foreground sm:inline">
            Space
          </span>
          <div className="mx-1 hidden h-5 w-px bg-border sm:block" />
          <SpaceSwitcher />
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <CommandPaletteTrigger />
          <ThemeToggle />
          <div className="hidden text-right sm:block">
            <p className="text-sm font-medium leading-tight text-foreground">
              {user?.name}
            </p>
            <p className="text-xs leading-tight text-muted-foreground">
              {user?.email}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={handleSignOut}>
            Sign out
          </Button>
        </div>
      </header>
      <CommandPalette />

        {/* Full-width below the fixed header. The dashboard layout adds the
            space sidebar and its own centered content column; other authed
            screens render children directly. */}
        <main className="min-h-screen pt-16">
          <FeeNoticeBanner />
          {children}
        </main>
      </div>
      </CommandPaletteProvider>
    </MobileNavProvider>
  );
}

/**
 * Header affordance that opens the ⌘K palette by click — a full search field on
 * desktop (with the shortcut hint) and a compact icon button on mobile.
 */
function CommandPaletteTrigger() {
  const { setOpen } = useCommandPalette();
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden h-9 items-center gap-2 rounded-lg border border-input bg-background px-3 text-sm text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground md:flex"
      >
        <MagnifyingGlass className="h-4 w-4" />
        <span>Search…</span>
        <kbd className="ml-4 rounded border border-border px-1.5 py-0.5 text-[10px] font-medium">
          ⌘K
        </kbd>
      </button>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Search"
        className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:hidden"
      >
        <MagnifyingGlass className="h-5 w-5" />
      </button>
    </>
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
      <div className="fixed inset-x-0 top-0 z-20 flex h-16 items-center justify-between border-b border-border bg-card px-6">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-8 w-8 rounded-full" />
      </div>
      <main className="min-h-screen pt-16">
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
