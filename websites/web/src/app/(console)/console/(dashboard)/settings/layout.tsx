"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, type Capability } from "@/console/lib/context/SessionContext";
import { cn } from "@/console/lib/utils/cn";

const TABS: Array<{ href: string; label: string; requires: Capability }> = [
  { href: "/console/settings", label: "General", requires: "space:manage-members" },
  { href: "/console/settings/branding", label: "Branding", requires: "space:manage-settings" },
];

/** Route-backed tabs so Branding lives inside Settings but keeps its own URL. */
export default function SettingsLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { can } = useSession();
  const tabs = TABS.filter((t) => can(t.requires));

  return (
    <div className="space-y-6">
      {tabs.length > 1 && (
        <nav className="inline-flex h-10 items-center rounded-md bg-muted p-1 text-muted-foreground">
          {tabs.map((t) => {
            const active = pathname === t.href;
            return (
              <Link
                key={t.href}
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded-sm px-3 py-1.5 text-sm font-medium transition-all",
                  active && "bg-background text-foreground shadow-sm"
                )}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
      )}
      {children}
    </div>
  );
}
