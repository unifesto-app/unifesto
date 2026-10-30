"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CaretLeft, CaretRight, MagnifyingGlass, SignOut } from "@unifesto/unicon/react";
import { useSession } from "@/console/lib/context/SessionContext";
import { useCommandPalette } from "@/console/lib/context/CommandPaletteContext";
import { signOut } from "@/console/lib/utils/auth";
import { cn } from "@/console/lib/utils/cn";
import type { CurrentUser } from "@/console/lib/types/rbac";
import { BASE_URL } from "./nav-config";

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
