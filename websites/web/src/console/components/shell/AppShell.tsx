"use client";

import { useEffect } from "react";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { List, MagnifyingGlass } from "@unifesto/unicon/react";
import { useSession } from "@/console/lib/context/SessionContext";
import {
  MobileNavProvider,
  useMobileNav,
} from "@/console/lib/context/MobileNavContext";
import {
  CommandPaletteProvider,
  useCommandPalette,
} from "@/console/lib/context/CommandPaletteContext";
import { signOut } from "@/console/lib/utils/auth";
import { Button } from "@/console/components/ui/button";
import { Skeleton } from "@/console/components/ui/skeleton";
import { Breadcrumbs } from "./Breadcrumbs";
import { isPersonalPath } from "./nav-config";
import { CommandPalette } from "./CommandPalette";
import { ThemeToggle } from "./ThemeToggle";
import { FeeNoticeBanner } from "./FeeNoticeBanner";
import { LegalAcceptSheet } from "./LegalAcceptSheet";

/**
 * Authenticated shell for everyone signed in (V9). Waits for the session;
 * accounts with no space role (attendees, members) get the personal pages,
 * and any space page sends them home. Frames the chrome: wordmark, space
 * where I am (breadcrumbs), and the signed-in user.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, hasAccess, loading } = useSession();
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
            Console
          </span>
          <div className="mx-1 hidden h-5 w-px bg-border sm:block" />
          <Breadcrumbs />
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
      <LegalAcceptSheet onSignOut={handleSignOut} />

        {/* Full-width below the fixed header. The dashboard layout adds the
            space sidebar and its own centered content column; other authed
            screens render children directly. */}
        <main className="min-h-screen pt-16">
          {hasAccess && <FeeNoticeBanner />}
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
