"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Check, Copy } from "@unifesto/unicon/react";
import { Button } from "@/console/components/ui/button";
import { Input } from "@/console/components/ui/input";
import { ListGroup } from "@/console/components/shared/ListGroup";
import { confirmDialog } from "@/console/components/shared/ConfirmDialog";
import {
  WEBHOOK_EVENTS,
  createWebhook,
  deleteWebhook,
  listDeliveries,
  listWebhooks,
  resendDelivery,
  sendTestWebhook,
  updateWebhook,
  type NewWebhook,
  type Webhook,
  type WebhookDelivery,
  type WebhookEventType,
} from "@/console/lib/api/webhooks-api";

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const label = (type: string) => WEBHOOK_EVENTS.find((e) => e.type === type)?.label ?? (type === "webhook.test" ? "Test" : type);

/** Statuses as plain coloured text, never pills. */
const STATUS_CLASS: Record<WebhookDelivery["status"], string> = {
  DELIVERED: "text-success",
  FAILED: "text-destructive",
  PENDING: "text-muted-foreground",
  SKIPPED: "text-muted-foreground",
};
const STATUS_TEXT: Record<WebhookDelivery["status"], string> = {
  DELIVERED: "Delivered",
  FAILED: "Failed",
  PENDING: "Retrying",
  SKIPPED: "Skipped",
};

/**
 * K23: webhooks, signed POSTs to the space's own server when someone
 * registers, cancels or checks in. Part of Settings › API, shown once API
 * access is on for the space.
 */
export function WebhooksSection({ spaceId, onError }: { spaceId: string; onError: (message: string) => void }) {
  const [hooks, setHooks] = useState<Webhook[] | null>(null);
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<WebhookEventType[]>(WEBHOOK_EVENTS.map((e) => e.type));
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<NewWebhook | null>(null);
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [log, setLog] = useState<WebhookDelivery[]>([]);
  const [note, setNote] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const { data, error } = await listWebhooks(spaceId);
    if (data) setHooks(data.webhooks);
    else onError(error?.message ?? "Couldn't load your webhooks.");
  }, [spaceId, onError]);

  useEffect(() => {
    void load();
  }, [load]);

  const showLog = async (id: string) => {
    if (open === id) return setOpen(null);
    const { data } = await listDeliveries(spaceId, id);
    setLog(data ?? []);
    setOpen(id);
  };

  const add = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { data, error } = await createWebhook(spaceId, { url: url.trim(), events });
    setBusy(false);
    if (!data) return onError(error?.message ?? "Couldn't add the webhook.");
    setCreated(data);
    setCopied(false);
    setUrl("");
    void load();
  };

  const test = async (h: Webhook) => {
    setNote((n) => ({ ...n, [h.id]: "Sending…" }));
    const { data, error } = await sendTestWebhook(spaceId, h.id);
    const text = !data
      ? (error?.message ?? "Couldn't send.")
      : data.status === "DELIVERED"
        ? `Test delivered (${data.lastStatusCode}, ${data.durationMs} ms)`
        : `Test failed: ${data.lastError ?? data.lastStatusCode}`;
    setNote((n) => ({ ...n, [h.id]: text }));
    if (open === h.id) void showLog(h.id).then(() => setOpen(h.id));
  };

  const toggle = async (h: Webhook) => {
    const on = !h.isActive || !!h.disabledAt;
    const { error } = await updateWebhook(spaceId, h.id, { isActive: on });
    if (error) return onError(error.message);
    void load();
  };

  const remove = async (h: Webhook) => {
    const ok = await confirmDialog({
      title: "Delete this webhook?",
      description: `${h.url} stops getting events at once, and its delivery log goes with it.`,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    const { error } = await deleteWebhook(spaceId, h.id);
    if (error) return onError(error.message);
    if (created?.id === h.id) setCreated(null);
    void load();
  };

  const resend = async (h: Webhook, d: WebhookDelivery) => {
    const { error } = await resendDelivery(spaceId, h.id, d.id);
    if (error) return onError(error.message);
    setLog((l) => l.map((x) => (x.id === d.id ? { ...x, status: "PENDING" } : x)));
  };

  if (!hooks) return null;

  return (
    <>
      {created && (
        <ListGroup
          title="Signing secret"
          description="Copy it now and keep it on your server: it checks each delivery really came from Unifesto. You won't see it again."
        >
          <div className="flex items-center gap-2 p-4">
            <code className="min-w-0 flex-1 break-all rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-xs text-foreground">
              {created.secret}
            </code>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void navigator.clipboard.writeText(created.secret).then(() => setCopied(true), () => undefined)}
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        </ListGroup>
      )}

      <ListGroup
        title="Webhooks"
        description="Unifesto tells your server when someone's booking is confirmed or cancelled, or they check in. Up to three per space."
      >
        {hooks.map((h) => {
          const state = h.disabledAt ? "Switched off after failed deliveries" : h.isActive ? "On" : "Off";
          return (
            <div key={h.id} className="space-y-2 border-b border-border p-4 last:border-b-0">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="break-all font-mono text-xs text-foreground">{h.url}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {h.events.map(label).join(", ")} ·{" "}
                    <span className={h.disabledAt ? "text-destructive" : h.isActive ? "text-success" : ""}>{state}</span>
                  </p>
                  {note[h.id] && <p className="mt-1 text-xs text-muted-foreground">{note[h.id]}</p>}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => void test(h)}>
                    Send test
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => void showLog(h.id)}>
                    {open === h.id ? "Hide log" : "Log"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => void toggle(h)}>
                    {h.isActive && !h.disabledAt ? "Turn off" : "Turn on"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => void remove(h)}>
                    Delete
                  </Button>
                </div>
              </div>
              {open === h.id && (
                <div className="space-y-1 rounded-md border border-border p-2 text-xs">
                  {log.length === 0 && <p className="text-muted-foreground">Nothing sent yet.</p>}
                  {log.map((d) => (
                    <div key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="text-muted-foreground">{when(d.createdAt)}</span>
                      <span className="text-foreground">{label(d.type)}</span>
                      <span className={STATUS_CLASS[d.status]}>{STATUS_TEXT[d.status]}</span>
                      <span className="text-muted-foreground">
                        {[d.lastStatusCode, d.lastError, d.attempts > 1 ? `${d.attempts} tries` : null].filter(Boolean).join(" · ")}
                      </span>
                      {(d.status === "FAILED" || d.status === "SKIPPED") && d.type !== "webhook.test" && (
                        <button type="button" className="text-foreground underline-offset-4 hover:underline" onClick={() => void resend(h, d)}>
                          Resend
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {hooks.length < 3 && (
          <form onSubmit={add} className="space-y-3 p-4">
            <Input
              type="url"
              inputMode="url"
              placeholder="https://your-site.example/hooks/unifesto"
              maxLength={500}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <div className="flex flex-wrap gap-4 text-sm text-foreground">
              {WEBHOOK_EVENTS.map((ev) => (
                <label key={ev.type} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={events.includes(ev.type)}
                    onChange={(e) => setEvents((cur) => (e.target.checked ? [...cur, ev.type] : cur.filter((x) => x !== ev.type)))}
                  />
                  {ev.label}
                </label>
              ))}
            </div>
            <Button type="submit" disabled={busy || !url.trim() || events.length === 0}>
              {busy ? "Adding…" : "Add webhook"}
            </Button>
          </form>
        )}
      </ListGroup>

      <ListGroup title="Checking a delivery" description="Each POST is JSON with these headers. Retries reuse the same id.">
        <div className="space-y-3 p-4 text-sm text-muted-foreground">
          <p>
            <code className="text-foreground">Unifesto-Webhook-Id</code>, <code className="text-foreground">Unifesto-Webhook-Timestamp</code> (Unix
            seconds) and <code className="text-foreground">Unifesto-Webhook-Signature: v1=&lt;hex&gt;</code>, the HMAC-SHA256 of{" "}
            <code className="text-foreground">id.timestamp.body</code> with your signing secret. Compare it in constant time, refuse timestamps older
            than five minutes, and skip ids you&apos;ve already handled.
          </p>
          <p>
            Answer with any 2xx within five seconds. Anything else is retried for about two hours; after 20 failures in a row the webhook switches
            off until you turn it back on.
          </p>
        </div>
      </ListGroup>
    </>
  );
}
