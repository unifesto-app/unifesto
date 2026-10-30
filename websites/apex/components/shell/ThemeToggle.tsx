"use client";

import { Desktop, Moon, Sun } from "@unifesto/unicon/react";
import { cn } from "@/lib/utils/cn";

const ORDER = ["system", "light", "dark"] as const;

declare global {
  interface Window {
    __applyTheme?: () => void;
  }
}

/* Cycles system → light → dark. The stored choice and the resolved theme
   live on <html> (set before paint by the script in app/layout.tsx), so
   this reads the DOM instead of holding state (no hydration mismatch). */
export function cycleTheme() {
  const pref = document.documentElement.dataset.pref ?? "system";
  const next = ORDER[(ORDER.indexOf(pref as (typeof ORDER)[number]) + 1) % ORDER.length];
  try {
    if (next === "system") localStorage.removeItem("theme");
    else localStorage.setItem("theme", next);
  } catch {}
  window.__applyTheme?.();
}

/**
 * Theme as a sidebar menu item, closing the menu: the current choice's icon,
 * "Theme", and the choice itself on the right; each click moves to the next.
 * All three icons and names render and CSS shows the current one, so SSR
 * markup never depends on it.
 */
export function ThemeMenuItem({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <button
      type="button"
      onClick={cycleTheme}
      aria-label="Theme: system, light or dark. Change theme"
      title={collapsed ? "Theme" : undefined}
      className={cn(
        "flex w-full items-center rounded-lg text-sm font-medium text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground",
        collapsed ? "justify-center p-2.5" : "gap-3 px-3 py-2"
      )}
    >
      <Desktop className="hidden h-[18px] w-[18px] flex-shrink-0 [[data-pref=system]_&]:block" aria-hidden="true" />
      <Sun className="hidden h-[18px] w-[18px] flex-shrink-0 [[data-pref=light]_&]:block" aria-hidden="true" />
      <Moon className="hidden h-[18px] w-[18px] flex-shrink-0 [[data-pref=dark]_&]:block" aria-hidden="true" />
      {!collapsed && (
        <>
          Theme
          <span aria-hidden="true" className="ml-auto text-xs font-normal">
            <span className="hidden [[data-pref=system]_&]:inline">System</span>
            <span className="hidden [[data-pref=light]_&]:inline">Light</span>
            <span className="hidden [[data-pref=dark]_&]:inline">Dark</span>
          </span>
        </>
      )}
    </button>
  );
}
