"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { MagnifyingGlass, SignOut } from "@unifesto/unicon/react";
import backendClient from "@/lib/api/backend-client";
import { clearAuthToken } from "@/lib/utils/auth";
import { useSession } from "@/lib/context/SessionContext";
import { useCommandPalette } from "@/lib/context/CommandPaletteContext";
import { cn } from "@/lib/utils/cn";

const PROFILE = "/dashboard/profile";

/** Top of the sidebar: the wordmark and "Apex", then ⌘K search. Apex has no header bar; this is where it lived. */
export function RailHeader() {
  const { setOpen } = useCommandPalette();
  return (
    <div className="flex flex-col gap-4 border-b border-border p-4">
      <Link href="/dashboard" aria-label="Apex home" className="flex items-center gap-2 pl-1">
        <Image src="/UnifestoAppWordmark.png" alt="Unifesto" width={64} height={26} priority className="wordmark h-7 w-auto" />
        <span className="text-sm font-medium text-muted-foreground">Apex</span>
      </Link>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-9 w-full items-center gap-2 rounded-lg border border-input bg-background px-3 text-sm text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
      >
        <MagnifyingGlass className="h-4 w-4" />
        <span>Jump to…</span>
        <kbd className="ml-auto rounded border border-border px-1.5 py-0.5 text-[10px] font-medium">⌘K</kbd>
      </button>
    </div>
  );
}

/**
 * Foot of the sidebar: who's signed in (avatar, name, email), which opens my
 * profile and is lit while it's open, and sign out. Theme lives in the menu,
 * after its last group.
 */
export function RailFooter() {
  const router = useRouter();
  const { user } = useSession();
  const here = usePathname() === PROFILE;
  const signOut = async () => {
    try {
      await backendClient.post("/auth/logout").catch(() => {});
    } finally {
      clearAuthToken();
      router.push("/login");
    }
  };
  return (
    <div className="flex items-center gap-1 border-t border-border p-2">
      <Link
        href={PROFILE}
        aria-current={here ? "page" : undefined}
        title="My profile"
        className={cn(
          "flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors duration-150",
          here ? "bg-primary-soft" : "hover:bg-muted"
        )}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-xs font-semibold text-muted-foreground">
          {user?.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.avatar_url} alt="" className="h-full w-full object-cover" />
          ) : (
            (user?.name ?? "U").split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase()
          )}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium leading-tight text-foreground">{user?.name}</span>
          <span className="block truncate text-xs leading-tight text-muted-foreground">{user?.email}</span>
        </span>
      </Link>
      <button
        type="button"
        onClick={signOut}
        aria-label="Sign out"
        title="Sign out"
        className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <SignOut className="h-5 w-5" />
      </button>
    </div>
  );
}
