"use client";

import { useCallback, useEffect, useState } from "react";
import { Tray } from "@unifesto/unicon/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorNotice } from "@/components/shared/ErrorNotice";
import {
  getMessages,
  messageStatusTone,
  type ListMessagesParams,
  type MessageDelivery,
} from "@/lib/api/messages-api";

const CHANNEL_LABEL: Record<string, string> = {
  PUSH: "Push",
  EMAIL: "Email",
  WHATSAPP: "WhatsApp",
};

function fullTime(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Delivery log rows for a filter, newest first, with "Load more". Shared by
 * the Messages page and the user detail page. Changing `filters` reloads.
 */
export function MessageTable({
  filters,
  showRecipient = true,
  reloadKey = 0,
}: {
  filters: ListMessagesParams;
  showRecipient?: boolean;
  /** Bump to reload with the same filters. */
  reloadKey?: number;
}) {
  const [rows, setRows] = useState<MessageDelivery[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const key = JSON.stringify(filters);

  const load = useCallback(
    async (after?: string) => {
      const { data, error } = await getMessages({ ...JSON.parse(key), cursor: after });
      if (error) {
        setError(error.message || "Could not load messages.");
        return;
      }
      setError("");
      setRows((prev) => (after ? [...prev, ...(data?.items ?? [])] : data?.items ?? []));
      setCursor(data?.nextCursor ?? null);
    },
    [key]
  );

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load, reloadKey]);

  const more = async () => {
    if (!cursor) return;
    setLoadingMore(true);
    await load(cursor);
    setLoadingMore(false);
  };

  if (loading) {
    return (
      <div className="space-y-px p-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-11 w-full" />
        ))}
      </div>
    );
  }

  return (
    <>
      {error && (
        <div className="p-4">
          <ErrorNotice message={error} />
        </div>
      )}
      {rows.length === 0 && !error ? (
        <EmptyState
          icon={Tray}
          title="No messages match"
          description="Nothing was sent or skipped for these filters."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-3 py-2.5 font-medium">Channel</th>
                <th className="px-3 py-2.5 font-medium">Message</th>
                {showRecipient && <th className="px-3 py-2.5 font-medium">Recipient</th>}
                <th className="px-4 py-2.5 text-right font-medium">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((m) => (
                <tr key={m.id} className="align-top hover:bg-muted/40">
                  <td className="px-4 py-2.5">
                    <Badge variant={messageStatusTone(m.status)}>
                      {m.status.toLowerCase()}
                    </Badge>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-muted-foreground">
                    {CHANNEL_LABEL[m.channel] ?? m.channel}
                    <span className="block text-xs">{m.provider}</span>
                  </td>
                  <td className="max-w-[26rem] px-3 py-2.5">
                    <p className="truncate text-foreground" title={m.label}>
                      {m.label || "Untitled"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {m.kind ?? "No kind"}
                      {m.attempts > 1 ? ` · ${m.attempts} attempts` : ""}
                    </p>
                    {m.error && (
                      <p className="mt-0.5 break-words text-xs text-destructive">
                        {m.error}
                      </p>
                    )}
                  </td>
                  {showRecipient && (
                    <td className="max-w-[16rem] truncate px-3 py-2.5 font-mono text-xs text-muted-foreground" title={m.recipient}>
                      {m.recipient}
                    </td>
                  )}
                  <td className="whitespace-nowrap px-4 py-2.5 text-right text-xs text-muted-foreground">
                    {fullTime(m.createdAt)}
                    {m.openedAt ? (
                      <span className="block">opened {fullTime(m.openedAt)}</span>
                    ) : m.deliveredAt ? (
                      <span className="block">delivered {fullTime(m.deliveredAt)}</span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {cursor && (
        <div className="flex justify-center border-t border-border p-3">
          <Button variant="outline" size="sm" onClick={more} disabled={loadingMore}>
            {loadingMore ? "Loading" : "Load more"}
          </Button>
        </div>
      )}
    </>
  );
}
