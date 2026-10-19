"use client";

import { useSpaceId } from "@/lib/hooks/useSpaceId";
import { useCallback, useEffect, useState } from "react";

import { Tray, CaretLeft, ArrowUpRight } from "@unifesto/unicon/react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorNotice } from "@/components/shared/ErrorNotice";
import { SearchBox, Pager } from "@/components/shared/ListControls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TicketThread, statusBadgeVariant } from "@/components/support/TicketThread";
import { AssistCopilot } from "@/components/support/AssistCopilot";
import { RefundCasePanel } from "@/components/support/RefundCasePanel";
import type { RefundRequest } from "@/lib/api/refunds-api";
import {
  listSpaceDesk,
  getTicket,
  replyToTicket,
  addInternalNote,
  escalateTicket,
  requesterName,
  requesterEmail,
  ASSIST_READ_EVENT,
  STATUS_LABEL,
  CATEGORY_LABEL,
  type SupportTicket,
  type SupportTicketStatus,
} from "@/lib/api/support-api";

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

const FILTERS: { label: string; status?: SupportTicketStatus; unread?: boolean }[] = [
  { label: "All" },
  { label: "Unread", unread: true },
  { label: "Open", status: "OPEN" },
  { label: "Awaiting reply", status: "PENDING" },
  { label: "Resolved", status: "RESOLVED" },
];

const PAGE_SIZE = 20;

/**
 * The space's Assist desk (D9): questions attendees raise about this space
 * and its events. Space Admins see every case; curators and co-curators see
 * their events' cases. A case escalated to Unifesto stays here read-only.
 */
export default function AssistInboxPage() {
  const spaceId = useSpaceId();

  const [filter, setFilter] = useState(0);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [selected, setSelected] = useState<SupportTicket | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [acting, setActing] = useState(false);

  // Search the server a beat after typing stops.
  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    if (!spaceId) return;
    setLoading(true);
    setError("");
    const { status, unread } = FILTERS[filter];
    const { data, error } = await listSpaceDesk(spaceId, {
      status,
      unread,
      search: query,
      page,
      limit: PAGE_SIZE,
    });
    if (error) {
      setError(error.message || "Could not load cases.");
      setTickets([]);
    } else {
      setTickets(data?.tickets ?? []);
      setTotalPages(data?.pagination.totalPages || 1);
    }
    setLoading(false);
  }, [spaceId, filter, query, page]);

  useEffect(() => {
    load();
  }, [load]);

  const openTicket = useCallback(async (id: string) => {
    // Opening a case reads it for the desk.
    setTickets((ts) => ts.map((t) => (t.id === id ? { ...t, unread: false } : t)));
    setDetailLoading(true);
    setError("");
    const { data, error } = await getTicket(id);
    if (error) setError(error.message || "Could not open this case.");
    else {
      setSelected(data);
      window.dispatchEvent(new Event(ASSIST_READ_EVENT));
    }
    setDetailLoading(false);
  }, []);

  // D15: the latest Assist draft, for the case it was drafted on.
  const [draft, setDraft] = useState<{ text: string; n: number; ticketId: string }>();

  const send = async (write: (id: string, body: string, aiDrafted?: boolean) => ReturnType<typeof replyToTicket>, body: string, aiDrafted = false) => {
    if (!selected) return;
    const { error } = await write(selected.id, body, aiDrafted);
    if (error) {
      setError(error.message || "Could not send.");
      return;
    }
    await Promise.all([openTicket(selected.id), load()]);
  };

  const handleEscalate = async () => {
    if (!selected) return;
    if (!window.confirm("Hand this case to Unifesto? You will still be able to read it, but not reply.")) return;
    setActing(true);
    const { error } = await escalateTicket(selected.id);
    if (error) setError(error.message || "Could not escalate this case.");
    else await Promise.all([openTicket(selected.id), load()]);
    setActing(false);
  };

  /* ----------------------------- Detail view ----------------------------- */
  if (selected) {
    const closed = selected.status === "CLOSED";
    const withUnifesto = selected.desk === "PLATFORM";
    const email = requesterEmail(selected);
    const refunds = (selected.subjects ?? [])
      .filter((s) => s.type === "RefundRequest")
      .map((s) => s.data as unknown as RefundRequest);
    return (
      <div className="space-y-6">
        <Button variant="ghost" size="sm" className="-ml-2 w-fit" onClick={() => setSelected(null)}>
          <CaretLeft className="h-4 w-4" /> Back to inbox
        </Button>

        {error && <ErrorNotice message={error} />}

        <AssistCopilot
          key={selected.id}
          ticketId={selected.id}
          lastMessageAt={selected.lastMessageAt}
          canDraft={!closed && !withUnifesto}
          onDraft={(text) => setDraft((d) => ({ text, n: (d?.n ?? 0) + 1, ticketId: selected.id }))}
        />

        <Card>
          <CardHeader className="gap-2 border-b border-border">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">#{selected.ticketNumber}</span>
              <Badge variant={statusBadgeVariant(selected.status)}>{STATUS_LABEL[selected.status]}</Badge>
              <Badge variant="outline">{CATEGORY_LABEL[selected.category]}</Badge>
              {withUnifesto && <Badge variant="neutral">With Unifesto</Badge>}
            </div>
            <CardTitle className="text-lg">{selected.subject}</CardTitle>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                {requesterName(selected)}
                {email ? ` · ${email}` : ""} · opened {timeAgo(selected.createdAt)}
              </p>
              {/* A refund goes to Unifesto by forwarding it, not by escalating the case. */}
              {!withUnifesto && !closed && refunds.length === 0 && (
                <Button variant="outline" size="sm" disabled={acting} onClick={handleEscalate}>
                  <ArrowUpRight className="h-4 w-4" /> Escalate to Unifesto
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="pt-5">
            {detailLoading || !selected.messages ? (
              <div className="space-y-3">
                <Skeleton className="h-16 w-2/3" />
                <Skeleton className="ml-auto h-16 w-2/3" />
              </div>
            ) : (
              <TicketThread
                key={selected.id}
                messages={selected.messages}
                viewerIsStaff
                draft={draft?.ticketId === selected.id ? draft : undefined}
                onReply={(body, aiDrafted) => send(replyToTicket, body, aiDrafted)}
                onNote={(body) => send(addInternalNote, body)}
                disabled={closed || withUnifesto}
                disabledHint={
                  withUnifesto
                    ? "This case is with Unifesto now. You can read it, but only Unifesto replies."
                    : "This case is closed."
                }
              />
            )}
          </CardContent>
        </Card>

        {refunds.map((r) => (
          <RefundCasePanel key={r.id} refund={r} onDone={() => Promise.all([openTicket(selected.id), load()])} />
        ))}
      </div>
    );
  }

  /* ------------------------------ List view ------------------------------ */
  return (
    <div className="space-y-6">
      <PageHeader
        title="Assist inbox"
        subtitle="Questions attendees ask about this space and its events"
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1" role="group" aria-label="Filter cases">
          {FILTERS.map((f, i) => (
            <Button
              key={f.label}
              size="sm"
              variant={filter === i ? "secondary" : "ghost"}
              aria-pressed={filter === i}
              onClick={() => {
                setFilter(i);
                setPage(1);
              }}
            >
              {f.label}
            </Button>
          ))}
        </div>
        <SearchBox value={search} onChange={setSearch} placeholder="Search subject, #number or attendee" />
      </div>

      <Card>
        <CardContent className="p-0">
          {error && (
            <div className="p-4">
              <ErrorNotice message={error} />
            </div>
          )}

          {loading ? (
            <div className="space-y-px">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 px-6 py-4">
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-56" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                  <Skeleton className="h-6 w-20" />
                </div>
              ))}
            </div>
          ) : tickets.length === 0 ? (
            <EmptyState
              icon={Tray}
              tone="positive"
              title={filter === 0 && !query ? "No cases yet" : "No cases match"}
              description={
                filter === 0 && !query
                  ? "When attendees ask about this space or its events, their questions land here."
                  : "Try another filter or search."
              }
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
                        <span className="text-xs font-medium text-muted-foreground">#{t.ticketNumber}</span>
                        {t.unread && (
                          <span className="size-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />
                        )}
                        <p className={t.unread ? "truncate font-semibold text-foreground" : "truncate font-medium text-foreground"}>
                          {t.subject}
                        </p>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span>{requesterName(t)}</span>
                        <span>{CATEGORY_LABEL[t.category]}</span>
                        <span>Updated {timeAgo(t.lastMessageAt)}</span>
                      </div>
                    </div>
                    {t.desk === "PLATFORM" && <Badge variant="neutral">With Unifesto</Badge>}
                    <Badge variant={statusBadgeVariant(t.status)}>{STATUS_LABEL[t.status]}</Badge>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Pager page={page} totalPages={totalPages} onPage={setPage} />
    </div>
  );
}
