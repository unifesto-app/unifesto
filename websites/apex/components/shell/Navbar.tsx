"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { List, MagnifyingGlass, SignOut, User } from "@unifesto/unicon/react";
import backendClient from "@/lib/api/backend-client";
import { clearAuthToken } from "@/lib/utils/auth";
import { useSession } from "@/lib/context/SessionContext";
import { useCommandPalette } from "@/lib/context/CommandPaletteContext";
import { ThemeToggle } from "./ThemeToggle";

export function Navbar({ onMenu }: { onMenu: () => void }) {
  const router = useRouter();
  const { setOpen: openPalette } = useCommandPalette();
  const { user } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const home = "/dashboard";
  const initials = (user?.name?.[0] ?? "U").toUpperCase();

  useEffect(() => {
    if (!menuOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  const handleLogout = async () => {
    setMenuOpen(false);
    try {
      await backendClient.post("/auth/logout").catch(() => {});
    } finally {
      clearAuthToken();
      router.push("/login");
    }
  };

  return (
    <header className="fixed left-0 right-0 top-0 z-40 flex h-16 items-center justify-between border-b border-border bg-card/80 px-4 backdrop-blur-md sm:px-6">
      <div className="flex items-center gap-2 sm:gap-3">
        <button
          type="button"
          onClick={onMenu}
          aria-label="Open navigation"
          className="-ml-1 rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:hidden"
        >
          <List className="h-5 w-5" />
        </button>
        <Link href={home} className="flex items-center gap-3" aria-label="Apex home">
          <Image
            src="/UnifestoAppWordmark.png"
            alt="Unifesto"
            width={64}
            height={26}
            priority
            className="wordmark h-7 w-auto"
          />
          <span className="font-display hidden text-xs tracking-[0.2em] text-muted-foreground sm:inline">
            APEX
          </span>
        </Link>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => openPalette(true)}
          className="hidden h-9 items-center gap-2 rounded-lg border border-input bg-background px-3 text-sm text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground md:flex"
        >
          <MagnifyingGlass className="h-4 w-4" />
          <span>Jump to…</span>
          <kbd className="ml-4 rounded border border-border px-1.5 py-0.5 text-[10px] font-medium">⌘K</kbd>
        </button>
        <button
          type="button"
          onClick={() => openPalette(true)}
          aria-label="Search"
          className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:hidden"
        >
          <MagnifyingGlass className="h-5 w-5" />
        </button>
        <ThemeToggle />
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            className="flex items-center rounded-full outline-none ring-offset-2 ring-offset-card focus-visible:ring-2 focus-visible:ring-ring"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label="Account menu"
          >
            {user?.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.avatar_url}
                alt={user.name ?? "Profile"}
                width={32}
                height={32}
                className="h-8 w-8 rounded-full object-cover"
              />
            ) : (
              <span className="grid h-8 w-8 place-items-center rounded-full bg-muted text-sm font-semibold text-foreground">
                {initials}
              </span>
            )}
          </button>

          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-full z-30 mt-2 w-48 overflow-hidden rounded-md border border-border bg-popover py-1 shadow-lg"
            >
              {user?.name && (
                <div className="border-b border-border px-3 py-2">
                  <p className="truncate text-sm font-medium text-foreground">
                    {user.name}
                  </p>
                  {user.email && (
                    <p className="truncate text-xs text-muted-foreground">
                      {user.email}
                    </p>
                  )}
                </div>
              )}
              <Link
                href="/dashboard/profile"
                role="menuitem"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-muted"
              >
                <User className="h-4 w-4" />
                Profile
              </Link>
              <button
                type="button"
                role="menuitem"
                onClick={handleLogout}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground hover:bg-muted"
              >
                <SignOut className="h-4 w-4" />
                Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
