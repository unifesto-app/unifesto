"use client";

import { useRouter } from "next/navigation";
import { useSession } from "@/console/lib/context/SessionContext";
import { ROLE_LABEL, appRoleFromCode, type SpaceMembership } from "@/console/lib/types/rbac";
import { Card } from "@/console/components/ui/card";

/** My spaces with my role in each. Opening one makes it the space the console works in. */
export function SpaceList({ limit }: { limit?: number }) {
  const router = useRouter();
  const { spaces, setCurrentSpace } = useSession();

  const open = (space: SpaceMembership) => {
    setCurrentSpace(space);
    router.push("/console/space");
  };

  return (
    <Card>
      <ul className="divide-y divide-border">
        {spaces.slice(0, limit).map((s) => {
          const role = ROLE_LABEL[appRoleFromCode(s.userRole?.code)] || (s.eventAccess?.length ? "Event team" : "");
          const about = s.tagline || s.description;
          return (
            <li key={s.id}>
              <button type="button" onClick={() => open(s)} className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left hover:bg-muted">
                <span className="min-w-0">
                  <span className="block truncate font-medium text-foreground">{s.name}</span>
                  {about && <span className="mt-0.5 block truncate text-xs text-muted-foreground">{about}</span>}
                </span>
                {role && <span className="shrink-0 text-xs text-muted-foreground">{role}</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
