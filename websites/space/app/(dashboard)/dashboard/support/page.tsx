"use client";

import { useSpaceId } from "@/console/lib/hooks/useSpaceId";
import { useCallback, useEffect, useState } from "react";

import { Lifebuoy, Plus, CaretLeft } from "@unifesto/unicon/react";
import { PageHeader } from "@/console/components/shared/PageHeader";
import { EmptyState } from "@/console/components/shared/EmptyState";
import { ErrorNotice } from "@/console/components/shared/ErrorNotice";
import { Badge } from "@/console/components/ui/badge";
import { Button } from "@/console/components/ui/button";
import { Skeleton } from "@/console/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/console/components/ui/card";
import { NewTicketForm } from "@/console/components/support/NewTicketForm";
import { RateCase } from "@/console/components/support/RateCase";
import {
  TicketThread,
  statusBadgeVariant,
  priorityBadgeVariant,
} from "@/console/components/support/TicketThread";
import {
  listTickets,
  getTicket,
  replyToTicket,
  closeOwnTicket,
  reopenOwnTicket,
  STATUS_LABEL,
  CATEGORY_LABEL,
  PRIORITY_LABEL,
  type SupportTicket,
} from "@/console/lib/api/support-api";

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

/**
 * Per-space support — the organiser raises and tracks tickets scoped to the
 * space they’re managing. Backed by `/support/tickets?spaceId=` (own tickets
 * only for non-admins, server-side).
 */
export default function SpaceSupportPage() {
  const spaceId = useSpaceId();

  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [composing, setComposing] = useState(false);

  const [selected, setSelected] = useState<SupportTicket | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data, error } = await listTickets({ spaceId, limit: 50 });
    if (error) {
      setError(error.message || "Could not load tickets.");
      setTickets([]);
    } else {
      setTickets(data?.tickets ?? []);
    }
    setLoading(false);
  }, [spaceId]);

  useEffect(() => {
    load();
  }, [load]);

  const openTicket = useCallback(async (id: string) => {
    // Opening a case reads it for your side.
    setTickets((ts) => ts.map((t) => (t.id === id ? { ...t, unread: false } : t)));
    setDetailLoading(true);
    setError("");
    const { data, error } = await getTicket(id);
    if (error) setError(error.message || "Could not open ticket.");
    else setSelected(data);
    setDetailLoading(false);
  }, []);

  const handleReply = async (body: string) => {
    if (!selected) return;
    const { error } = await replyToTicket(selected.id, body);
    if (error) {
      setError(error.message || "Could not send reply.");
      return;
    }
    await Promise.all([openTicket(selected.id), load()]);
  };

  const handleOwnerStatus = async (close: boolean) => {
    if (!selected) return;
    setActing(true);
    const { error } = close
      ? await closeOwnTicket(selected.id)
      : await reopenOwnTicket(selected.id);
    if (error) setError(error.message || "Could not update ticket.");
    else await Promise.all([openTicket(selected.id), load()]);
    setActing(false);
  };

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
          <CaretLeft className="h-4 w-4" /> Back to support
        </Button>

        {error && <ErrorNotice message={error} />}

        <Card>
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
              <Badge variant="outline">{CATEGORY_LABEL[selected.category]}</Badge>
            </div>
            <CardTitle className="text-lg">{selected.subject}</CardTitle>
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                Opened {timeAgo(selected.createdAt)}
              </p>
              {closed ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={acting}
                  onClick={() => handleOwnerStatus(false)}
                >
                  Reopen
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={acting}
                  onClick={() => handleOwnerStatus(true)}
                >
                  Close ticket
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
                messages={selected.messages}
                viewerIsStaff={false}
                onReply={handleReply}
                disabled={closed}
                disabledHint="This ticket is closed. Reopen it to continue the conversation."
              />
            )}
            {(selected.status === "RESOLVED" || closed) && (
              <div className="mt-5">
                <RateCase ticket={selected} onRated={() => openTicket(selected.id)} />
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  /* ------------------------------ List view ------------------------------ */
  return (
    <div className="space-y-6">
      <PageHeader
        title="Support"
        subtitle="Raise an issue for this space and track your conversations"
        actions={
          <Button onClick={() => setComposing((v) => !v)}>
            <Plus className="h-4 w-4" /> New ticket
          </Button>
        }
      />

      {composing && (
        <NewTicketForm
          spaceId={spaceId}
          onClose={() => setComposing(false)}
          onCreated={async (id) => {
            setComposing(false);
            await load();
            openTicket(id);
          }}
        />
      )}

      <Card>
        <CardHeader className="pb-0">
          <CardTitle className="text-base">My tickets</CardTitle>
        </CardHeader>
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
              icon={Lifebuoy}
              tone="positive"
              title="No tickets yet"
              description="Raise a ticket and our team will help you get this space running smoothly."
              action={
                <Button onClick={() => setComposing(true)}>
                  <Plus className="h-4 w-4" /> New ticket
                </Button>
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
                        <span className="text-xs font-medium text-muted-foreground">
                          #{t.ticketNumber}
                        </span>
                        {t.unread && (
                          <span className="size-2 shrink-0 rounded-full bg-primary" aria-label="New reply" />
                        )}
                        <p className="truncate font-medium text-foreground">
                          {t.subject}
                        </p>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span>{CATEGORY_LABEL[t.category]}</span>
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
