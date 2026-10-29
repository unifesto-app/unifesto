"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { UsersFour, MagnifyingGlass, Plus, Trash } from "@unifesto/unicon/react";
import {
  getEventTeam,
  searchTeamCandidates,
  addTeamMember,
  removeTeamMember,
  type TeamMember,
  type TeamUser,
  type EventTeamRole,
} from "@/console/lib/api/events-api";
import { useAccess, useSession } from "@/console/lib/context/SessionContext";
import { appRoleFromCode, higherRole, outranks } from "@/console/lib/types/rbac";
import { PageHeader } from "@/console/components/shared/PageHeader";
import { EmptyState } from "@/console/components/shared/EmptyState";
import { ErrorNotice } from "@/console/components/shared/ErrorNotice";
import { Button } from "@/console/components/ui/button";
import { Input } from "@/console/components/ui/input";
import { Badge } from "@/console/components/ui/badge";
import { Skeleton } from "@/console/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/console/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/console/components/ui/select";

/** Roles a Space Admin / Curator can hand out, high → low, with copy. */
const TEAM_ROLES: {
  code: EventTeamRole;
  label: string;
  blurb: string;
  variant: "brand" | "success" | "neutral";
}[] = [
  {
    code: "CURATOR",
    label: "Curator",
    blurb: "Owns the event end-to-end",
    variant: "brand",
  },
  {
    code: "CO_CURATOR",
    label: "Co-Curator",
    blurb: "Helps run it — no publish, cancel or money",
    variant: "success",
  },
  {
    code: "CREW",
    label: "Crew",
    blurb: "On-the-ground check-in / scanning only",
    variant: "neutral",
  },
];

/** Friendly label for any role code the backend returns. */
function roleLabel(code?: string | null, fallback?: string | null): string {
  switch (code) {
    case "CURATOR":
      return "Curator";
    case "CO_CURATOR":
      return "Co-Curator";
    case "CREW":
      return "Crew";
    default:
      return fallback || "Member";
  }
}

function roleVariant(code?: string | null): "brand" | "success" | "neutral" {
  if (code === "CURATOR") return "brand";
  if (code === "CO_CURATOR") return "success";
  return "neutral";
}

function Avatar({ user }: { user: TeamUser }) {
  const initials = (user.fullName || user.username || "?")
    .substring(0, 2)
    .toUpperCase();
  if (user.avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img src={user.avatarUrl} alt="" className="h-9 w-9 rounded-full object-cover" />
    );
  }
  return (
    <div className="grid h-9 w-9 place-items-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
      {initials}
    </div>
  );
}

export default function EventTeamPage() {
  const params = useParams();
  const eventId = params.eventId as string;
  const { user } = useSession();
  const { access, can } = useAccess(eventId);
  // Governing role here: the higher of the space and event role the backend reports.
  const myRole = higherRole(appRoleFromCode(access?.spaceRole), appRoleFromCode(access?.eventRole));
  const canAssign = can("event:assign-crew");
  // Only roles below your own can be handed out (only a Space Admin names a Curator).
  const roleOptions = TEAM_ROLES.filter((r) => outranks(myRole, r.code));

  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [query, setQuery] = useState("");
  const [role, setRole] = useState<EventTeamRole>("CREW");
  const [results, setResults] = useState<TeamUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const seq = useRef(0);

  const load = useCallback(async () => {
    const { data, error } = await getEventTeam(eventId);
    if (error) setError(error.message);
    else setMembers(data?.members ?? []);
    setLoading(false);
  }, [eventId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const s = ++seq.current;
    setSearching(true);
    const t = setTimeout(async () => {
      const { data } = await searchTeamCandidates(eventId, q);
      if (s !== seq.current) return;
      setResults(data?.results ?? []);
      setSearching(false);
    }, 300);
    return () => clearTimeout(t);
  }, [query, eventId]);

  const add = async (u: TeamUser) => {
    setAdding(u.id);
    setError("");
    const { error } = await addTeamMember(eventId, u.id, role);
    setAdding(null);
    if (error) {
      setError(error.message);
      return;
    }
    setQuery("");
    setResults([]);
    await load();
  };

  const remove = async (userId: string, name: string) => {
    if (!confirm(`Remove ${name} from the team?`)) return;
    setError("");
    const { error } = await removeTeamMember(eventId, userId);
    if (error) setError(error.message);
    else await load();
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-40 w-full rounded-lg" />
      </div>
    );
  }

  const selectedRole = roleOptions.find((r) => r.code === role);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Team"
        subtitle="Assign Curators, Co-Curators and Crew to run this event"
      />

      {error && <ErrorNotice message={error} />}

      {/* Assignment is only for those who may assign curators/crew. Everyone
          else sees the roster read-only. */}
      {canAssign && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Add a team member</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="relative flex-1">
                <MagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search this space by name, username or email…"
                  className="pl-9"
                />
              </div>
              <Select
                value={role}
                onValueChange={(v) => setRole(v as EventTeamRole)}
              >
                <SelectTrigger className="sm:w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {roleOptions.map((r) => (
                    <SelectItem key={r.code} value={r.code}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedRole && (
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">
                  {selectedRole.label}:
                </span>{" "}
                {selectedRole.blurb}.
              </p>
            )}
            {query.trim().length >= 2 && (
              <div className="rounded-md border border-border">
                {searching && results.length === 0 ? (
                  <p className="px-3 py-3 text-sm text-muted-foreground">
                    Searching…
                  </p>
                ) : results.length === 0 ? (
                  <p className="px-3 py-3 text-sm text-muted-foreground">
                    No members found.
                  </p>
                ) : (
                  <ul className="divide-y divide-border">
                    {results.map((u) => (
                      <li
                        key={u.id}
                        className="flex items-center justify-between gap-3 px-3 py-2"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <Avatar user={u} />
                          <span className="truncate text-sm font-medium">
                            {u.fullName || u.username || "Member"}
                          </span>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => add(u)}
                          disabled={adding === u.id}
                        >
                          <Plus className="h-4 w-4" weight="bold" />
                          Add as {selectedRole?.label ?? "Crew"}
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Team{members.length > 0 ? ` (${members.length})` : ""}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          {members.length === 0 ? (
            <EmptyState
              icon={UsersFour}
              title="No team members yet"
              description={
                canAssign
                  ? "Assign a Curator, Co-Curator or Crew above to help run this event."
                  : "Nobody has been assigned to this event yet."
              }
            />
          ) : (
            <ul className="divide-y divide-border">
              {members.map((m) => (
                <li
                  key={m.userRoleId}
                  className="flex items-center justify-between gap-3 px-6 py-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar user={m.user} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {m.user.fullName || m.user.username || "Member"}
                      </p>
                      {m.user.username && (
                        <p className="truncate text-xs text-muted-foreground">
                          @{m.user.username}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={roleVariant(m.role?.code)}>
                      {roleLabel(m.role?.code, m.role?.name)}
                    </Badge>
                    {canAssign && m.userId !== user?.id && outranks(myRole, m.role?.code) && (
                      <Button aria-label="Delete"
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          remove(
                            m.userId,
                            m.user.fullName || m.user.username || "member"
                          )
                        }
                      >
                        <Trash className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
