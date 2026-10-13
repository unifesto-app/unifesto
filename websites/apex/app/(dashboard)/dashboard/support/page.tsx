"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Lifebuoy,
  MagnifyingGlass,
  ChatCircleDots,
  CheckCircle,
  Clock,
  CaretLeft,
  UserCircle,
} from "@unifesto/unicon/react";
import { useSession } from "@/lib/context/SessionContext";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatCard } from "@/components/shared/StatCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorNotice } from "@/components/shared/ErrorNotice";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  TicketThread,
  statusBadgeVariant,
  priorityBadgeVariant,
} from "@/components/support/TicketThread";
import {
  listTickets,
  getTicket,
  getSupportStats,
  replyToTicket,
  updateTicket,
  requesterName,
  requesterEmail,
  STATUS_LABEL,
  CATEGORY_LABEL,
  PRIORITY_LABEL,
  type SupportTicket,
  type SupportStats,
  type SupportTicketStatus,
  type SupportTicketPriority,
} from "@/lib/api/support-api";

const STATUS_FILTERS: { label: string; value: SupportTicketStatus | "ALL" }[] = [
  { label: "Open", value: "OPEN" },
  { label: "Awaiting reply", value: "PENDING" },
  { label: "Resolved", value: "RESOLVED" },
  { label: "Closed", value: "CLOSED" },
  { label: "All", value: "ALL" },
];

const PRIORITY_OPTIONS = Object.keys(PRIORITY_LABEL) as SupportTicketPriority[];
const STATUS_OPTIONS = Object.keys(STATUS_LABEL) as SupportTicketStatus[];

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

/**
 * Support — the platform helpdesk. Admins triage every ticket across the
 * platform. Backed by the NestJS `/support` controller.
 */
export default function SupportPage() {
  const { user } = useSession();

  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [stats, setStats] = useState<SupportStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<SupportTicketStatus | "ALL">("OPEN");
  const [search, setSearch] = useState("");

  const [selected, setSelected] = useState<SupportTicket | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [acting, setActing] = useState(false);

  const loadStats = useCallback(async () => {
    const { data } = await getSupportStats();
    if (data) setStats(data);
  }, []);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data, error } = await listTickets({
      status: filter === "ALL" ? undefined : filter,
      search: search.trim() || undefined,
      limit: 50,
    });
    if (error) {
      setError(error.message || "Could not load tickets.");
      setTickets([]);
    } else {
      setTickets(data?.tickets ?? []);
    }
    setLoading(false);
  }, [filter, search]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const openTicket = useCallback(async (id: string) => {
    setDetailLoading(true);
    setError("");
    const { data, error } = await getTicket(id);
    if (error) {
      setError(error.message || "Could not open ticket.");
    } else {
      setSelected(data);
    }
    setDetailLoading(false);
  }, []);

  const refreshAfterMutation = useCallback(
    async (id: string) => {
      await Promise.all([openTicket(id), loadList(), loadStats()]);
    },
    [openTicket, loadList, loadStats]
  );

  const handleReply = async (body: string) => {
    if (!selected) return;
    const { error } = await replyToTicket(selected.id, body);
    if (error) {
      setError(error.message || "Could not send reply.");
      return;
    }
    await refreshAfterMutation(selected.id);
  };

  const handleAdminUpdate = async (patch: {
    status?: SupportTicketStatus;
    priority?: SupportTicketPriority;
    assignedToId?: string | null;
  }) => {
    if (!selected) return;
    setActing(true);
    const { error } = await updateTicket(selected.id, patch);
    if (error) setError(error.message || "Could not update ticket.");
    else await refreshAfterMutation(selected.id);
    setActing(false);
  };

  const statCards = useMemo(
    () => [
      {
        title: "Open",
        value: stats?.open ?? 0,
        hint: "Needs a reply",
        icon: ChatCircleDots,
        tone: "neutral" as const,
      },
      {
        title: "Awaiting reply",
        value: stats?.pending ?? 0,
        hint: "With the requester",
        icon: Clock,
        tone: "neutral" as const,
      },
      {
        title: "Resolved",
        value: stats?.resolved ?? 0,
        hint: "Marked done",
        icon: CheckCircle,
        tone: "success" as const,
      },
    ],
    [stats]
  );

  /* ----------------------------- Detail view ----------------------------- */
  if (selected) {
    const closed = selected.status === "CLOSED";
    return (
      <div className="space-y-6">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 w-fit"
          onClick={() => setSelected(null)}
        >
          <CaretLeft className="h-4 w-4" /> Back to tickets
        </Button>

        {error && <ErrorNotice message={error} />}

        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader className="gap-2 border-b border-border">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground">
                  #{selected.ticketNumber}
                </span>
                <Badge variant={statusBadgeVariant(selected.status)}>
                  {STATUS_LABEL[selected.status]}
                </Badge>
                <Badge variant={priorityBadgeVariant(selected.priority)}>
                  {PRIORITY_LABEL[selected.priority]}
                </Badge>
                <Badge variant="outline">
                  {CATEGORY_LABEL[selected.category]}
                </Badge>
              </div>
              <CardTitle className="text-lg">{selected.subject}</CardTitle>
              <p className="text-sm text-muted-foreground">
                {requesterName(selected)}
                {requesterEmail(selected) ? ` · ${requesterEmail(selected)}` : ""}
                {selected.space ? ` · ${selected.space.name}` : ""}
              </p>
            </CardHeader>
            <CardContent className="pt-5">
              {detailLoading || !selected.messages ? (
                <div className="space-y-3">
                  <Skeleton className="h-16 w-2/3" />
                  <Skeleton className="ml-auto h-16 w-2/3" />
                </div>
              ) : (
                <TicketThread
                  messages={selected.messages}
                  viewerIsStaff
                  onReply={handleReply}
                  disabled={closed}
                  disabledHint="This ticket is closed. Reopen it (set status to Open) to reply."
                />
              )}
            </CardContent>
          </Card>

          {/* Sidebar — admin triage */}
          <Card className="h-fit">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Triage</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select
                  value={selected.status}
                  onValueChange={(v) =>
                    handleAdminUpdate({ status: v as SupportTicketStatus })
                  }
                >
                  <SelectTrigger disabled={acting}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((s) => (
                      <SelectItem key={s} value={s}>
                        {STATUS_LABEL[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Priority</Label>
                <Select
                  value={selected.priority}
                  onValueChange={(v) =>
                    handleAdminUpdate({
                      priority: v as SupportTicketPriority,
                    })
                  }
                >
                  <SelectTrigger disabled={acting}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITY_OPTIONS.map((p) => (
                      <SelectItem key={p} value={p}>
                        {PRIORITY_LABEL[p]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Assignee</Label>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <UserCircle className="h-4 w-4" />
                  {selected.assignedTo
                    ? selected.assignedTo.fullName ||
                      selected.assignedTo.username ||
                      "Assigned"
                    : "Unassigned"}
                </div>
                {selected.assignedToId === user?.id ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    disabled={acting}
                    onClick={() =>
                      handleAdminUpdate({ assignedToId: null })
                    }
                  >
                    Unassign me
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    disabled={acting || !user?.id}
                    onClick={() =>
                      handleAdminUpdate({ assignedToId: user!.id })
                    }
                  >
                    Assign to me
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  /* ------------------------------ List view ------------------------------ */
  return (
    <div className="space-y-6">
      <PageHeader
        title="Support"
        subtitle="Tickets raised by organisers and attendees across the platform"
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {statCards.map((s) => (
          <StatCard key={s.title} {...s} loading={!stats} />
        ))}
      </div>

      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-base">Tickets</CardTitle>
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative">
                <MagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search subject or #number"
                  className="w-56 pl-9"
                  aria-label="Search support tickets"
                />
              </div>
              <div className="flex gap-1 rounded-lg border border-border bg-muted/40 p-1">
                {STATUS_FILTERS.map((f) => (
                  <button
                    key={f.value}
                    onClick={() => setFilter(f.value)}
                    className={
                      "rounded-md px-3 py-1 text-sm font-medium transition-colors " +
                      (filter === f.value
                        ? "bg-card text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground")
                    }
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {error && (
            <div className="p-4">
              <ErrorNotice message={error} />
            </div>
          )}

          {loading ? (
            <div className="space-y-px">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 px-6 py-4">
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-64" />
                    <Skeleton className="h-3 w-40" />
                  </div>
                  <Skeleton className="h-6 w-20" />
                </div>
              ))}
            </div>
          ) : tickets.length === 0 ? (
            <EmptyState
              icon={Lifebuoy}
              tone="neutral"
              title="Nothing needs attention"
              description="Support requests from organisers and attendees will appear here as they come in."
            />
          ) : (
            <ul className="divide-y divide-border">
              {tickets.map((t) => (
                <li key={t.id}>
                  <button
                    onClick={() => openTicket(t.id)}
                    className="flex w-full items-center gap-4 px-6 py-4 text-left transition-colors hover:bg-muted/40"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-medium text-muted-foreground">
                          #{t.ticketNumber}
                        </span>
                        <p className="truncate font-medium text-foreground">
                          {t.subject}
                        </p>
                        {t.priority !== "NORMAL" && (
                          <Badge variant={priorityBadgeVariant(t.priority)}>
                            {PRIORITY_LABEL[t.priority]}
                          </Badge>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span>{requesterName(t)}</span>
                        <span>{CATEGORY_LABEL[t.category]}</span>
                        {t.space && <span>{t.space.name}</span>}
                        <span>Updated {timeAgo(t.lastMessageAt)}</span>
                        {typeof t._count?.messages === "number" && (
                          <span>{t._count.messages} messages</span>
                        )}
                      </div>
                    </div>
                    <Badge variant={statusBadgeVariant(t.status)}>
                      {STATUS_LABEL[t.status]}
                    </Badge>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
