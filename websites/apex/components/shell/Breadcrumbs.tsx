"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CaretRight } from "@unifesto/unicon/react";
import { cn } from "@/lib/utils/cn";
import type { NavGroup } from "./nav-config";
import { trail } from "./crumbs";

/**
 * Where I am, a line above the page: Dashboard › Spaces › Details. Every
 * crumb but the last is a link; on a phone only the last one shows.
 */
export function Breadcrumbs({ nav }: { nav: NavGroup[] }) {
  const crumbs = trail(usePathname(), nav);
  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1.5 text-sm">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <li key={c.href} className={cn("flex min-w-0 items-center gap-1.5", !last && "hidden md:flex")}>
              {i > 0 && <CaretRight aria-hidden className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground", last && "hidden md:block")} weight="bold" />}
              {last ? (
                <span aria-current="page" className="truncate font-medium text-foreground">
                  {c.label}
                </span>
              ) : (
                <Link href={c.href} className="truncate text-muted-foreground transition-colors hover:text-foreground">
                  {c.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
