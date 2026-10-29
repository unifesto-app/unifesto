"use client";

import { usePathname, useRouter } from "next/navigation";
import { useSession } from "@/console/lib/context/SessionContext";
import { appRoleFromCode, type SpaceAppRole } from "@/console/lib/types/rbac";

const ROLE_LABEL: Record<SpaceAppRole, string> = {
  space_admin: "Space Admin",
  curator: "Curator",
  co_curator: "Co-Curator",
  crew: "Crew",
  none: "",
};

/**
 * Picks which space the operator is acting in. Backed by SessionContext, so the
 * choice persists and every space-scoped view reads the same `currentSpace`.
 * Collapses to a static label when the user runs exactly one space.
 */
export function SpaceSwitcher() {
  const { spaces, currentSpace, setCurrentSpace } = useSession();
  const pathname = usePathname();
  const router = useRouter();

  if (spaces.length === 0 || !currentSpace) return null;

  const role = appRoleFromCode(currentSpace.userRole?.code);

  if (spaces.length === 1) {
    return (
      <div className="flex min-w-0 flex-col leading-tight">
        <span className="truncate text-sm font-medium text-foreground">
          {currentSpace.name}
        </span>
        {ROLE_LABEL[role] && (
          <span className="text-xs text-muted-foreground">
            {ROLE_LABEL[role]}
          </span>
        )}
      </div>
    );
  }

  return (
    <label className="relative flex items-center">
      <span className="sr-only">Select space</span>
      <select
        value={currentSpace.id}
        onChange={(e) => {
          const next = spaces.find((s) => s.id === e.target.value);
          if (!next) return;
          setCurrentSpace(next);
          // An entity page (an event, a session…) belongs to the old space:
          // go up to its section, e.g. /dashboard/events/<id>/x → /dashboard/events.
          const section = pathname.split("/").slice(0, 3).join("/");
          if (section !== pathname) router.push(section);
        }}
        className="h-9 max-w-[128px] cursor-pointer sm:max-w-[220px] appearance-none truncate rounded-md border border-input bg-card pl-3 pr-8 text-sm font-medium text-foreground hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        {spaces.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <svg
        aria-hidden
        className="pointer-events-none absolute right-2.5 h-4 w-4 text-muted-foreground"
        viewBox="0 0 20 20"
        fill="currentColor"
      >
        <path
          fillRule="evenodd"
          d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.06l3.71-3.83a.75.75 0 1 1 1.08 1.04l-4.25 4.39a.75.75 0 0 1-1.08 0L5.21 8.27a.75.75 0 0 1 .02-1.06Z"
          clipRule="evenodd"
        />
      </svg>
    </label>
  );
}
