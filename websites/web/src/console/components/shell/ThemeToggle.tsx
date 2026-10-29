"use client";

import { Desktop, Moon, Sun } from "@unifesto/unicon/react";

const ORDER = ["system", "light", "dark"] as const;

declare global {
  interface Window {
    __applyTheme?: () => void;
  }
}

/* Cycles system → light → dark. The stored choice and the resolved theme
   live on <html> (set before paint by the script in app/layout.tsx), so
   this reads the DOM instead of holding state (no hydration mismatch). */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const cycle = () => {
    const pref = document.documentElement.dataset.pref ?? "system";
    const next = ORDER[(ORDER.indexOf(pref as (typeof ORDER)[number]) + 1) % ORDER.length];
    try {
      if (next === "system") localStorage.removeItem("theme");
      else localStorage.setItem("theme", next);
    } catch {}
    window.__applyTheme?.();
  };

  return (
    <button
      type="button"
      onClick={cycle}
      aria-label="Change theme: system, light or dark"
      title="Theme: system, light or dark"
      className={`rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground ${className}`}
    >
      {/* All three render; CSS shows the current choice, so SSR markup never depends on it. */}
      <Desktop className="hidden h-5 w-5 [[data-pref=system]_&]:block" aria-hidden="true" />
      <Sun className="hidden h-5 w-5 [[data-pref=light]_&]:block" aria-hidden="true" />
      <Moon className="hidden h-5 w-5 [[data-pref=dark]_&]:block" aria-hidden="true" />
    </button>
  );
}
