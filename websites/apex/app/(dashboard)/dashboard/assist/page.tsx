"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Lifebuoy,
  MagnifyingGlass,
  ChatCircleDots,
  EnvelopeSimple,
  Clock,
  CaretLeft,
  UserCircle,
  UserMinus,
  Timer,
  Hourglass,
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TicketThread, statusBadgeVariant, priorityBadgeVariant } from "@/components/support/TicketThread";
import { CaseActionPanel } from "@/components/support/CaseActionPanel";
import { SendToOrganiser } from "@/components/support/SendToOrganiser";
import { CannedRepliesDialog } from "@/components/support/CannedRepliesDialog";
import { cn } from "@/lib/utils/cn";
import {
  listTickets,
  getTicket,
  getSupportStats,
  replyToTicket,
  updateTicket,
  listCannedReplies,
  formatMins,
  slaText,
  requesterName,
  requesterEmail,
  STATUS_LABEL,
  CATEGORY_LABEL,
  PRIORITY_LABEL,
  KIND_LABEL,
  DESK_LABEL,
  type SupportTicket,
  type SupportStats,
  type SupportTicketStatus,
  type SupportTicketPriority,
  type SupportCaseKind,
  type SupportDesk,
  type SupportTicketsResponse,
  type CannedReply,
  ASSIST_READ_EVENT,
} from "@/lib/api/support-api";

const PAGE_SIZE = 25;
const ALL = "ALL";
const KINDS = Object.keys(KIND_LABEL) as SupportCaseKind[];
const STATUSES = Object.keys(STATUS_LABEL) as SupportTicketStatus[];
const PRIORITIES = Object.keys(PRIORITY_LABEL) as SupportTicketPriority[];
const DESKS = Object.keys(DESK_LABEL) as SupportDesk[];

function timeAgo(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

/** Filter state: any change starts the list again at page 1. */
function useFilter<T>(init: T, onChange: () => void) {
  const [value, set] = useState<T>(init);
  return [value, (v: T | ((p: T) => T)) => { set(v); onChange(); }] as const;
}

/** Labelled filter dropdown with an "All" option. */
function Filter<T extends string>({
  label,
  value,
  onChange,
  options,
  labels,
}: {
  label: string;
  value: T | typeof ALL;
  onChange: (v: T | typeof ALL) => void;
  options: T[];
  labels: Record<T, string>;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as T | typeof ALL)}>
      <SelectTrigger className="w-40" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{`Any ${label.toLowerCase()}`}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o} value={o}>
            {labels[o]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * Assist — every support case in one inbox (D8): help questions, refunds,
 * requests, reports and the rest, each with the actions its record allows.
 */
export default function AssistInboxPage() {
  const { user } = useSession();

  const [page, setPage] = useState(1);
  const firstPage = () => setPage(1);
  const [kind, setKind] = useFilter<SupportCaseKind | typeof ALL>(ALL, firstPage);
  const [status, setStatus] = useFilter<SupportTicketStatus | typeof ALL>("OPEN", firstPage);
  const [desk, setDesk] = useFilter<SupportDesk | typeof ALL>(ALL, firstPage);
  const [priority, setPriority] = useFilter<SupportTicketPriority | typeof ALL>(ALL, firstPage);
  const [assignee, setAssignee] = useFilter<"ALL" | "me" | "none">(ALL, firstPage);
  const [unreadOnly, setUnreadOnly] = useFilter(false, firstPage);
  const [overdueOnly, setOverdueOnly] = useFilter(false, firstPage);
  const [search, setSearch] = useFilter("", firstPage);
  const [searchInput, setSearchInput] = useState("");

  const [list, setList] = useState<SupportTicketsResponse | null>(null);
  const [stats, setStats] = useState<SupportStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [selected, setSelected] = useState<SupportTicket | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [acting, setActing] = useState(false);
  const [canned, setCanned] = useState<CannedReply[]>([]);
  const [cannedOpen, setCannedOpen] = useState(false);

  // Type, then search: wait for a pause instead of a request per key.
  useEffect(() => {
    const t = setTimeout(() => searchInput.trim() !== search && setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadCanned = useCallback(async () => {
    const { data } = await listCannedReplies();
    if (data) setCanned(data);
  }, []);

  useEffect(() => {
    loadCanned();
  }, [loadCanned]);

  const loadStats = useCallback(async () => {
    const { data } = await getSupportStats();
    if (data) setStats(data);
  }, []);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data, error } = await listTickets({
      kind: kind === ALL ? undefined : kind,
      status: status === ALL ? undefined : status,
      desk: desk === ALL ? undefined : desk,
      priority: priority === ALL ? undefined : priority,
      assignedToId: assignee === "me" ? user?.id : assignee === "none" ? "none" : undefined,
      unread: unreadOnly || undefined,
      overdue: overdueOnly || undefined,
      search: search || undefined,
      page,
      limit: PAGE_SIZE,
    });
    if (error) setError(error.message || "Could not load cases.");
    setList(data);
    setLoading(false);
  }, [kind, status, desk, priority, assignee, unreadOnly, overdueOnly, search, page, user?.id]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const openCase = useCallback(async (id: string) => {
    setDetailLoading(true);
    setError("");
    const { data, error } = await getTicket(id);
    if (error) setError(error.message || "Could not open the case.");
    else {
      setSelected((prev) => {
        if (!prev) window.scrollTo(0, 0);
        return data;
      });
      // Opening a case reads it for the Platform desk.
      setList((l) => l && { ...l, tickets: l.tickets.map((t) => (t.id === id ? { ...t, unread: false } : t)) });
      window.dispatchEvent(new Event(ASSIST_READ_EVENT));
    }
    setDetailLoading(false);
  }, []);

  const refresh = useCallback(
    async (id: string) => {
      await Promise.all([openCase(id), loadList(), loadStats()]);
    },
    [openCase, loadList, loadStats]
  );

  const handleReply = async (body: string) => {
    if (!selected) return false;
    const { error } = await replyToTicket(selected.id, body);
    if (error) {
      setError(error.message || "Could not send the reply.");
      return false;
    }
    await refresh(selected.id);
  };

  const triage = async (patch: { status?: SupportTicketStatus; priority?: SupportTicketPriority; assignedToId?: string | null }) => {
    if (!selected) return;
    setActing(true);
    const { error } = await updateTicket(selected.id, patch);
    if (error) setError(error.message || "Could not update the case.");
    else await refresh(selected.id);
    setActing(false);
  };

  const statCards = useMemo(
    () => [
      { title: "Open", value: stats?.open ?? 0, hint: "Needs a reply", icon: ChatCircleDots },
      { title: "Unread", value: stats?.unread ?? 0, hint: "New on the Unifesto desk", icon: EnvelopeSimple },
      { title: "Unassigned", value: stats?.unassigned ?? 0, hint: "Open with no owner", icon: UserMinus },
      { title: "Awaiting reply", value: stats?.pending ?? 0, hint: "With the requester", icon: Clock },
      { title: "Overdue", value: stats?.overdue ?? 0, hint: "Past the reply or resolution time", icon: Hourglass },
      {
        title: "First reply",
        value: formatMins(stats?.desks?.PLATFORM.firstResponseMins),
        hint: `Unifesto, median of 30 days · space desks ${formatMins(stats?.desks?.SPACE.firstResponseMins)}`,
        icon: Timer,
      },
      {
        title: "Resolution",
        value: formatMins(stats?.desks?.PLATFORM.resolutionMins),
        hint: `Unifesto, median of 30 days · space desks ${formatMins(stats?.desks?.SPACE.resolutionMins)}`,
        icon: Timer,
      },
    ],
    [stats]
  );

  /* ----------------------------- Case view ------------------------------ */
  if (selected) {
    const closed = selected.status === "CLOSED";
    const email = requesterEmail(selected);
    return (
      <div className="space-y-6">
        <Button variant="ghost" size="sm" className="-ml-2 w-fit" onClick={() => setSelected(null)}>
          <CaretLeft className="h-4 w-4" /> Back to inbox
        </Button>

        {error && <ErrorNotice message={error} />}

        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader className="gap-2 border-b border-border">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground">#{selected.ticketNumber}</span>
                <Badge variant={statusBadgeVariant(selected.status)}>{STATUS_LABEL[selected.status]}</Badge>
                <Badge variant={priorityBadgeVariant(selected.priority)}>{PRIORITY_LABEL[selected.priority]}</Badge>
                <Badge variant="brand">{KIND_LABEL[selected.kind]}</Badge>
                <Badge variant="outline">{CATEGORY_LABEL[selected.category]}</Badge>
              </div>
              <CardTitle className="text-lg">{selected.subject}</CardTitle>
              <p className="text-sm text-muted-foreground">
                {requesterName(selected)}
                {email ? ` · ${email}` : ""}
                {selected.requester?.mobileNumber ? ` · ${selected.requester.mobileNumber}` : ""}
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
                  cannedReplies={canned}
                  onReply={handleReply}
                  disabled={closed}
                  disabledHint="This case is closed. Set its status to Open to reply."
                />
              )}
            </CardContent>
          </Card>

          <div className="space-y-6">
            {selected.desk === "PLATFORM" && selected.kind === "HELP" && !closed && (
              <SendToOrganiser
                key={selected.id}
                ticketId={selected.id}
                suggested={selected.aiTriage?.routingHint === "SPACE"}
                reason={selected.aiTriage?.reason}
                onDone={() => refresh(selected.id)}
              />
            )}
            {selected.subjects?.map((s) => (
              <CaseActionPanel key={`${s.type}:${s.data.id}`} subject={s} onDone={() => refresh(selected.id)} />
            ))}

            <Card className="h-fit">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Triage</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  {DESK_LABEL[selected.desk]}
                  {selected.escalatedAt ? " · escalated by the space" : ""}
                </p>
                {selected.sla && (
                  <p className={cn("text-sm font-medium", selected.sla.overdue ? "text-destructive" : "text-foreground")}>
                    {slaText(selected.sla)}
                  </p>
                )}
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <Select value={selected.status} onValueChange={(v) => triage({ status: v as SupportTicketStatus })}>
                    <SelectTrigger disabled={acting}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {STATUS_LABEL[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Priority</Label>
                  <Select value={selected.priority} onValueChange={(v) => triage({ priority: v as SupportTicketPriority })}>
                    <SelectTrigger disabled={acting}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRIORITIES.map((p) => (
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
                      ? selected.assignedTo.fullName || selected.assignedTo.username || "Assigned"
                      : "Unassigned"}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    disabled={acting || !user?.id}
                    onClick={() => triage({ assignedToId: selected.assignedToId === user?.id ? null : user!.id })}
                  >
                    {selected.assignedToId === user?.id ? "Unassign me" : "Assign to me"}
                  </Button>
                </div>
                {selected.space && (
                  <Link
                    href={`/dashboard/spaces/${selected.space.id}`}
                    className="block text-xs text-muted-foreground underline-offset-4 hover:underline"
                  >
                    Open {selected.space.name}
                  </Link>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  /* ------------------------------ Inbox --------------------------------- */
  const tickets = list?.tickets ?? [];
  const total = list?.pagination.total ?? 0;
  const totalPages = list?.pagination.totalPages ?? 1;
  const kindTabs: { value: SupportCaseKind | typeof ALL; label: string; count?: number }[] = [
    { value: ALL, label: "All" },
    ...KINDS.map((k) => ({ value: k, label: KIND_LABEL[k], count: stats?.byKind?.[k] })),
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Assist"
        subtitle="Every support case on the platform: questions, refunds, requests and reports"
        actions={
          <Button variant="outline" size="sm" onClick={() => setCannedOpen(true)}>
            Saved replies
          </Button>
        }
      />
      <CannedRepliesDialog open={cannedOpen} onOpenChange={setCannedOpen} replies={canned} onChange={loadCanned} />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {statCards.map((s) => (
          <StatCard key={s.title} {...s} loading={!stats} />
        ))}
      </div>

      <Card>
        <CardHeader className="gap-4">
          <div className="-mx-1 flex gap-1 overflow-x-auto px-1" role="tablist" aria-label="Case kind">
            {kindTabs.map((t) => (
              <button
                key={t.value}
                role="tab"
                aria-selected={kind === t.value}
                onClick={() => setKind(t.value)}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  kind === t.value ? "bg-primary-soft text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                {t.label}
                {!!t.count && <span className="text-xs tabular-nums text-muted-foreground">{t.count}</span>}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <MagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Subject, #number, name or email"
                className="w-64 pl-9"
                aria-label="Search cases"
              />
            </div>
            <Filter label="Status" value={status} onChange={setStatus} options={STATUSES} labels={STATUS_LABEL} />
            <Filter label="Desk" value={desk} onChange={setDesk} options={DESKS} labels={DESK_LABEL} />
            <Filter label="Priority" value={priority} onChange={setPriority} options={PRIORITIES} labels={PRIORITY_LABEL} />
            <Filter
              label="Assignee"
              value={assignee}
              onChange={setAssignee}
              options={["me", "none"]}
              labels={{ me: "Assigned to me", none: "Unassigned" }}
            />
            <Button
              variant={unreadOnly ? "default" : "outline"}
              size="sm"
              aria-pressed={unreadOnly}
              onClick={() => setUnreadOnly((u) => !u)}
            >
              Unread only
            </Button>
            <Button
              variant={overdueOnly ? "default" : "outline"}
              size="sm"
              aria-pressed={overdueOnly}
              onClick={() => setOverdueOnly((o) => !o)}
            >
              Overdue only
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {error && (
            <div className="p-4">
              <ErrorNotice message={error} />
            </div>
          )}

          {loading && !list ? (
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
              title="Nothing here"
              description="No cases match these filters."
            />
          ) : (
            <ul className={cn("divide-y divide-border", loading && "opacity-60")}>
              {tickets.map((t) => (
                <li key={t.id}>
                  <button
                    onClick={() => openCase(t.id)}
                    className="flex w-full items-center gap-4 px-6 py-4 text-left transition-colors hover:bg-muted/40"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-medium text-muted-foreground">#{t.ticketNumber}</span>
                        {t.unread && <span className="size-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
                        <p className={cn("truncate text-foreground", t.unread ? "font-semibold" : "font-medium")}>{t.subject}</p>
                        {t.kind !== "HELP" && <Badge variant="brand">{KIND_LABEL[t.kind]}</Badge>}
                        {t.priority !== "NORMAL" && (
                          <Badge variant={priorityBadgeVariant(t.priority)}>{PRIORITY_LABEL[t.priority]}</Badge>
                        )}
                        {t.sla?.overdue && <Badge variant="destructive">Overdue</Badge>}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span>{requesterName(t)}</span>
                        <span>{DESK_LABEL[t.desk]}</span>
                        <span>{CATEGORY_LABEL[t.category]}</span>
                        {t.space && <span>{t.space.name}</span>}
                        {t.assignedTo && <span>→ {t.assignedTo.fullName || t.assignedTo.username}</span>}
                        <span>Updated {timeAgo(t.lastMessageAt)}</span>
                        {t.sla && !t.sla.overdue && <span>{slaText(t.sla)}</span>}
                        {typeof t._count?.messages === "number" && <span>{t._count.messages} messages</span>}
                      </div>
                    </div>
                    <Badge variant={statusBadgeVariant(t.status)}>{STATUS_LABEL[t.status]}</Badge>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {total > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Page {page} of {totalPages} · {total.toLocaleString("en-IN")} {total === 1 ? "case" : "cases"}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages || loading} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
