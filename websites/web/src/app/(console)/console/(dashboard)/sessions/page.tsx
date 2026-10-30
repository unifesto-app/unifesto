"use client";

import { inr } from "@/console/lib/utils/money";
import { useSpaceId } from "@/console/lib/hooks/useSpaceId";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  MagnifyingGlass,
  VideoCamera,
  Plus,
  Clock,
  Users,
} from "@unifesto/unicon/react";
import { useSession } from "@/console/lib/context/SessionContext";
import {
  listSpaceSessions,
  PLATFORM_LABELS,
  type Session,
  type SessionStatus,
} from "@/console/lib/api/sessions-api";
import type { SpaceWithHierarchy } from "@/console/lib/types/rbac";
import { Pager, usePaged } from "@/console/components/shared/ListControls";
import { PageHeader } from "@/console/components/shared/PageHeader";
import { EmptyState } from "@/console/components/shared/EmptyState";
import { ErrorNotice } from "@/console/components/shared/ErrorNotice";
import { StatusBadge } from "@/console/components/shared/StatusBadge";
import { Input } from "@/console/components/ui/input";
import { Button } from "@/console/components/ui/button";
import { Card, CardContent } from "@/console/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/console/components/ui/select";

/**
 * Status filter plus one pseudo-option: "hidden" is the soft-delete trash view,
 * not a status. It shares this dropdown because hidden sessions would otherwise
 * be unreachable and could never be restored.
 */
type SessionFilterValue = SessionStatus | "all" | "hidden";

const STATUS_OPTIONS: { value: SessionFilterValue; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "DRAFT", label: "Draft" },
  { value: "PUBLISHED", label: "Published" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
  { value: "hidden", label: "Hidden" },
];

function formatWhen(iso: string, timezone: string) {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: timezone,
  });
}

function priceLabel(s: Session) {
  const p = Number(s.price);
  return p > 0 ? inr(p) : "Free";
}

export default function SpaceSessionsPage() {
  const router = useRouter();
  const spaceId = useSpaceId();
  const { spaces, loading: sessionLoading } = useSession();

  const [currentSpace, setCurrentSpace] =
    useState<SpaceWithHierarchy | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<SessionFilterValue>("all");

  useEffect(() => {
    if (sessionLoading) return;
    const space = spaces.find((s) => s.id === spaceId);
    if (!space) {
      router.push("/console");
      return;
    }
    setCurrentSpace(space);
  }, [spaceId, spaces, sessionLoading, router]);

  const load = useCallback(async () => {
    if (!spaceId) return;
    setLoading(true);
    setError("");
    const { data, error } = await listSpaceSessions(
      spaceId,
      status === "hidden" ? "deleted" : "active"
    );
    if (error) setError(error.message);
    else setSessions(data ?? []);
    setLoading(false);
  }, [spaceId, status]);

  useEffect(() => {
    if (sessionLoading || !currentSpace) return;
    void load();
  }, [sessionLoading, currentSpace, load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sessions.filter((s) => {
      // "hidden" is handled server-side by the deleted filter, so it must not
      // be compared against s.status here — nothing would ever match.
      if (status !== "all" && status !== "hidden" && s.status !== status)
        return false;
      if (q && !s.title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [sessions, search, status]);
  const { page, setPage, totalPages, pageItems } = usePaged(filtered, 24);

  const subtitle = loading
    ? "Loading sessions…"
    : `${filtered.length.toLocaleString("en-IN")} session${
        filtered.length === 1 ? "" : "s"
      }`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sessions"
        subtitle={subtitle}
        actions={
          <Button
            onClick={() =>
              router.push(`/console/sessions/new`)
            }
          >
            <Plus className="h-4 w-4" weight="bold" />
            New session
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <MagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search by title"
            className="pl-9"
            aria-label="Search sessions"
          />
        </div>
        <Select
          value={status}
          onValueChange={(v) => {
            setStatus(v as SessionFilterValue);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-44" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error && <ErrorNotice message={error} />}

      {loading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="h-40 animate-pulse bg-muted" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <EmptyState
              icon={VideoCamera}
              tone={search || status !== "all" ? "neutral" : "positive"}
              title={
                search || status !== "all"
                  ? "No sessions match those filters"
                  : "Host your first session"
              }
              description={
                search || status !== "all"
                  ? "Try clearing the search or choosing a different status."
                  : "Sessions are quick online gatherings: a title, a time, and a video room inside Unifesto, with no link to pass around. Or use your own Meet or Zoom. Perfect for webinars and community calls."
              }
              action={
                !search && status === "all" ? (
                  <Button
                    onClick={() =>
                      router.push(`/console/sessions/new`)
                    }
                  >
                    <Plus className="h-4 w-4" weight="bold" />
                    New session
                  </Button>
                ) : undefined
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {pageItems.map((session) => (
            <Link
              key={session.id}
              href={`/console/sessions/${session.id}`}
            >
              <Card className="card-interactive group h-full">
                <CardContent className="p-5">
                  <div className="space-y-4">
                    <h3 className="font-semibold text-foreground line-clamp-2 group-hover:text-primary transition-colors">
                      {session.title}
                    </h3>

                    <div className="space-y-2 text-sm">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Clock className="h-4 w-4 flex-shrink-0" />
                        <span>
                          {formatWhen(
                            session.startDateTime,
                            session.timezone
                          )}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <VideoCamera className="h-4 w-4 flex-shrink-0" />
                        <span className="truncate">
                          {session.platform === "OTHER"
                            ? session.platformOther || "Online"
                            : PLATFORM_LABELS[session.platform]}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <StatusBadge status={session.status} />
                      <span className="text-sm font-medium text-foreground">
                        {priceLabel(session)}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Users className="h-3.5 w-3.5" />
                      <span>
                        {session.registeredCount} registered
                        {session.capacity
                          ? ` · ${session.capacity} cap`
                          : ""}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
      <Pager page={page} totalPages={totalPages} onPage={setPage} />
    </div>
  );
}
