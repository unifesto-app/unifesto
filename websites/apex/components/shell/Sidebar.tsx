"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { adminNav, isNavActive } from "./nav-config";

/**
 * Platform nav. A fixed rail from `lg` up; below that the same list slides in
 * as a drawer the header hamburger opens.
 */
export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();

  // Navigating closes the drawer; Escape does too.
  useEffect(onClose, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-30 bg-background/70 backdrop-blur-sm lg:hidden"
          onClick={onClose}
          aria-hidden
        />
      )}
      <aside
        className={cn(
          "fixed bottom-0 left-0 top-16 z-30 w-64 overflow-y-auto border-r border-border bg-sidebar transition-transform duration-200 ease-out lg:w-60 lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <nav className="space-y-6 p-4">
          {adminNav.map((group, i) => (
            <div key={group.label ?? i}>
              {group.label && <p className="text-eyebrow mb-2 px-3">{group.label}</p>}
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const active = isNavActive(pathname, item);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors duration-150 ease-standard",
                        active
                          ? "bg-primary-soft font-semibold text-foreground"
                          : "font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                      )}
                    >
                      <Icon className="h-[18px] w-[18px] flex-shrink-0" weight={active ? "fill" : "regular"} />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
}
