"use client";

import { useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CaretDown, CaretLeft, CaretRight, MagnifyingGlass, SignOut } from "@unifesto/unicon/react";
import { useSession } from "@/console/lib/context/SessionContext";
import { useCommandPalette } from "@/console/lib/context/CommandPaletteContext";
import { useMobileNav } from "@/console/lib/context/MobileNavContext";
import { signOut } from "@/console/lib/utils/auth";
import { cn } from "@/console/lib/utils/cn";
import type { CurrentUser, SpaceMembership } from "@/console/lib/types/rbac";
import { BASE_URL } from "./nav-config";
import { NAV_ITEM_ACTIVE } from "./SpaceNav";

/**
 * Top of the sidebar: the wordmark with the collapse control beside it, and
 * the ⌘K search. On the icon rail the app mark is the way back open (a caret
 * shows on hover). The console has no header bar; this is where it lived.
 * Without `onToggle` (the phone drawer) there's nothing to collapse.
 */
export function RailHeader({ collapsed = false, onToggle }: { collapsed?: boolean; onToggle?: () => void }) {
  const { setOpen } = useCommandPalette();
  const mark = <Image src="/favicon.svg" alt="Unifesto" width={28} height={28} priority className="h-7 w-7" />;
  return (
    <div className={cn("flex flex-col gap-4 border-b border-border", collapsed ? "items-center px-2 py-4" : "p-4")}>
      {collapsed ? (
        onToggle ? (
          <button
            type="button"
            onClick={onToggle}
            aria-label="Expand sidebar"
            title="Expand sidebar"
            className="group relative grid h-9 w-9 place-items-center rounded-lg transition-colors hover:bg-muted"
          >
            <span className="transition-opacity duration-150 group-hover:opacity-0 group-focus-visible:opacity-0">{mark}</span>
            <CaretRight
              aria-hidden="true"
              className="absolute h-[18px] w-[18px] text-foreground opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
            />
          </button>
        ) : (
          mark
        )
      ) : (
        <div className="flex items-center gap-2 pl-1">
          <Image src="/UnifestoAppWordmark.png" alt="Unifesto" width={64} height={26} priority className="wordmark h-7 w-auto" />
          <span className="text-sm font-medium text-muted-foreground">Console</span>
          {onToggle && (
            <button
              type="button"
              onClick={onToggle}
              aria-label="Collapse sidebar"
              title="Collapse sidebar"
              className="-mr-1.5 ml-auto rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <CaretLeft className="h-[18px] w-[18px]" />
            </button>
          )}
        </div>
      )}
      <SpaceSwitcher collapsed={collapsed} />
      {collapsed ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Search"
          title="Search (⌘K)"
          className="rounded-lg p-2.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <MagnifyingGlass className="h-[18px] w-[18px]" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex h-9 w-full items-center gap-2 rounded-lg border border-input bg-background px-3 text-sm text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
        >
          <MagnifyingGlass className="h-4 w-4" />
          <span>Search…</span>
          <kbd className="ml-auto rounded border border-border px-1.5 py-0.5 text-[10px] font-medium">⌘K</kbd>
        </button>
      )}
    </div>
  );
}

/**
 * The space I'm working in, at the top of every sidebar (Q43). One click opens
 * my spaces, a second opens one, from any page: a space, an event or my own
 * pages. It replaces the "My Spaces" back link, so no sidebar loses the space.
 * Nothing shows for people who run no space. On the icon rail it's the space's
 * mark, linking to My Spaces.
 */
function SpaceSwitcher({ collapsed }: { collapsed: boolean }) {
  const router = useRouter();
  const { spaces, currentSpace, setCurrentSpace, hasAccess } = useSession();
  const { setOpen: setDrawerOpen } = useMobileNav();
  const menu = useRef<HTMLDetailsElement>(null);
  if (!hasAccess || !currentSpace) return null;

  // Picking anything shuts the list (and the phone drawer); the rail stays mounted across pages.
  const close = () => {
    if (menu.current) menu.current.open = false;
    setDrawerOpen(false);
  };
  // The same two steps as My Spaces (SpaceList): make it the console's space, then open its dashboard.
  const open = (space: SpaceMembership) => {
    close();
    setCurrentSpace(space);
    router.push(`${BASE_URL}/space`);
  };

  if (collapsed) {
    return (
      <Link
        href={`${BASE_URL}/spaces`}
        aria-label={`Switch space (now ${currentSpace.name})`}
        title={`${currentSpace.name}: switch space`}
        className="rounded-lg p-1 transition-colors hover:bg-muted"
      >
        <SpaceMark space={currentSpace} />
      </Link>
    );
  }

  const row = "relative flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm transition-colors duration-150";
  return (
    <details ref={menu} className="group -mx-1">
      <summary className="flex cursor-pointer list-none items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted [&::-webkit-details-marker]:hidden">
        <SpaceMark space={currentSpace} />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{currentSpace.name}</span>
        <span className="sr-only">Switch space</span>
        <CaretDown aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-150 group-open:rotate-180" />
      </summary>
      <div className="mt-1 space-y-0.5">
        {/* ponytail: a plain scroll list; My Spaces has the search for people with many. */}
        <div className="max-h-64 space-y-0.5 overflow-y-auto">
          {spaces.map((s) => {
            const here = s.id === currentSpace.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => open(s)}
                aria-current={here ? "true" : undefined}
                className={cn(row, here ? NAV_ITEM_ACTIVE : "font-medium text-muted-foreground hover:bg-muted hover:text-foreground")}
              >
                <SpaceMark space={s} small />
                <span className="min-w-0 truncate">{s.name}</span>
              </button>
            );
          })}
        </div>
        <div className="border-t border-border pt-1">
          <Link href={`${BASE_URL}/spaces`} onClick={close} className={cn(row, "font-medium text-muted-foreground hover:bg-muted hover:text-foreground")}>
            All my spaces
          </Link>
          <Link href="/request-space" onClick={close} className={cn(row, "font-medium text-muted-foreground hover:bg-muted hover:text-foreground")}>
            Start a space
          </Link>
          <Link href={BASE_URL} onClick={close} className={cn(row, "font-medium text-muted-foreground hover:bg-muted hover:text-foreground")}>
            My tickets and account
          </Link>
        </div>
      </div>
    </details>
  );
}

/** A space's logo, or its first letter without one. */
function SpaceMark({ space, small = false }: { space: SpaceMembership; small?: boolean }) {
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center overflow-hidden rounded-md bg-muted font-semibold text-muted-foreground",
        small ? "h-6 w-6 text-[11px]" : "h-7 w-7 text-xs"
      )}
    >
      {space.logo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={space.logo_url} alt="" className="h-full w-full object-cover" />
      ) : (
        space.name.charAt(0).toUpperCase()
      )}
    </span>
  );
}

/**
 * Foot of the sidebar: who's signed in (avatar, name, email) and sign out.
 * Me is the way into My account (the menu has no item for it), lit while it's
 * open. The icon rail drops the name and email. Theme lives in the menu, under
 * Settings.
 */
export function RailFooter({ collapsed = false }: { collapsed?: boolean }) {
  const router = useRouter();
  const { user } = useSession();
  const here = usePathname() === `${BASE_URL}/account`;
  const handleSignOut = async () => {
    await signOut();
    router.replace("/login");
  };
  const signOutButton = (
    <button
      type="button"
      onClick={handleSignOut}
      aria-label="Sign out"
      title="Sign out"
      className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      <SignOut className="h-5 w-5" />
    </button>
  );

  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-1 border-t border-border px-2 py-3">
        <Link
          href={`${BASE_URL}/account`}
          aria-current={here ? "page" : undefined}
          aria-label="My account"
          title={`My account (${user?.name ?? ""})`}
          className={cn("mb-1 rounded-full", here && "ring-2 ring-primary/40 ring-offset-2 ring-offset-sidebar")}
        >
          <Avatar user={user} />
        </Link>
        {signOutButton}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1 border-t border-border p-2">
      <Link
        href={`${BASE_URL}/account`}
        aria-current={here ? "page" : undefined}
        title="My account"
        className={cn(
          "flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors duration-150",
          here ? "bg-primary-soft" : "hover:bg-muted"
        )}
      >
        <Avatar user={user} />
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium leading-tight text-foreground">{user?.name}</span>
          <span className="block truncate text-xs leading-tight text-muted-foreground">{user?.email}</span>
        </span>
      </Link>
      {signOutButton}
    </div>
  );
}

/** My photo, or my initials without one. */
function Avatar({ user }: { user: CurrentUser | null }) {
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-xs font-semibold text-muted-foreground">
      {user?.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={user.avatar_url} alt="" className="h-full w-full object-cover" />
      ) : (
        user?.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase()
      )}
    </span>
  );
}
