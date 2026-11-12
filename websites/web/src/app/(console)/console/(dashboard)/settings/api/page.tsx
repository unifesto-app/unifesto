"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Check, Copy, LockKey } from "@unifesto/unicon/react";
import { Button } from "@/console/components/ui/button";
import { Input } from "@/console/components/ui/input";
import { Skeleton } from "@/console/components/ui/skeleton";
import { ErrorNotice } from "@/console/components/shared/ErrorNotice";
import { ListGroup, ListRow } from "@/console/components/shared/ListGroup";
import { confirmDialog } from "@/console/components/shared/ConfirmDialog";
import { useSpaceId } from "@/console/lib/hooks/useSpaceId";
import { createApiKey, listApiKeys, revokeApiKey, type ApiKey, type NewApiKey } from "@/console/lib/api/api-keys-api";

const API = "https://api.unifesto.app";
const day = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

/**
 * K22: registration API keys, for a space's own site to register people into
 * its Unifesto events from its own form. Space Admins only; off until
 * Unifesto turns it on for the space.
 */
export default function ApiSettingsPage() {
  const spaceId = useSpaceId();
  const [state, setState] = useState<{ enabled: boolean; keys: ApiKey[] } | null>(null);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<NewApiKey | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    if (!spaceId) return;
    const { data, error: e } = await listApiKeys(spaceId);
    if (data) setState(data);
    else setError(e?.message ?? "Couldn't load your keys.");
  }, [spaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError("");
    const { data, error: err } = await createApiKey(spaceId, name.trim());
    setBusy(false);
    if (!data) return setError(err?.message ?? "Couldn't create the key.");
    setCreated(data);
    setCopied(false);
    setName("");
    void load();
  };

  const revoke = async (k: ApiKey) => {
    const ok = await confirmDialog({
      title: `Revoke "${k.name}"?`,
      description: "Anything using this key stops working at once. This can't be undone.",
      confirmLabel: "Revoke",
      destructive: true,
    });
    if (!ok) return;
    const { error: err } = await revokeApiKey(spaceId, k.id);
    if (err) return setError(err.message);
    if (created?.id === k.id) setCreated(null);
    void load();
  };

  const copyKey = async () => {
    if (!created) return;
    await navigator.clipboard.writeText(created.key).catch(() => undefined);
    setCopied(true);
  };

  if (!state && !error) return <Skeleton className="h-48 w-full" />;

  return (
    <div className="space-y-4">
      {error && <ErrorNotice message={error} />}

      {state && !state.enabled ? (
        <ListGroup
          title="Registration API"
          description="Let your own website register people into your Unifesto events from its own form. It's off for this space: write to Unifesto support to turn it on."
        >
          <div />
        </ListGroup>
      ) : state ? (
        <>
          {created && (
            <ListGroup
              title="Your new key"
              description="Copy it now and keep it on your server. You won't see it again; if it's lost, revoke it and make another."
            >
              <div className="flex items-center gap-2 p-4">
                <code className="min-w-0 flex-1 break-all rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-xs text-foreground">
                  {created.key}
                </code>
                <Button size="sm" variant="outline" onClick={() => void copyKey()}>
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
            </ListGroup>
          )}

          <ListGroup
            title="API keys"
            description="Each key registers people into this space's events. Use one per site, so you can revoke one without the others."
          >
            {state.keys.map((k) => (
              <ListRow
                key={k.id}
                icon={<LockKey className="h-5 w-5" weight="fill" />}
                label={k.name}
                sublabel={`${k.prefix}… · made ${day(k.createdAt)} · ${k.lastUsedAt ? `last used ${day(k.lastUsedAt)}` : "never used"}`}
                trailing={
                  <Button size="sm" variant="outline" onClick={() => void revoke(k)}>
                    Revoke
                  </Button>
                }
              />
            ))}
            <form onSubmit={create} className="flex items-center gap-2 p-4">
              <Input placeholder="Key name, e.g. Main website" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
              <Button type="submit" disabled={busy || !name.trim()}>
                {busy ? "Creating…" : "Create key"}
              </Button>
            </form>
          </ListGroup>

          <ListGroup title="How to use it" description="From your server only. Calls from a browser are refused, because the key would be public.">
            <div className="space-y-3 p-4 text-sm text-muted-foreground">
              <p>
                <code className="text-foreground">GET /v1/events</code> lists your upcoming events.{" "}
                <code className="text-foreground">GET /v1/events/&lt;slug&gt;</code> gives an event&apos;s ticket types and questions.
              </p>
              <p>
                <code className="text-foreground">POST /v1/events/&lt;slug&gt;/registrations</code> registers one person. Free tickets are confirmed and the
                ticket goes by email. Paid tickets come back as <code className="text-foreground">payment_pending</code> with a payment link, also sent to the
                person; the seat is theirs once they pay. Send a unique <code className="text-foreground">Idempotency-Key</code> per person so a retry never
                registers twice, and <code className="text-foreground">ageConfirmed: true</code> once your form has asked that they&apos;re 18 or older.
              </p>
              <p>
                <code className="text-foreground">GET /v1/registrations/&lt;id&gt;</code> shows its status, payment and check-in. Limits: 60 registrations and 120
                reads a minute, 500 registrations a day, per key.
              </p>
              <pre className="overflow-x-auto rounded-md border border-border bg-muted/40 p-3 font-mono text-xs text-foreground">{`curl ${API}/v1/events/<slug>/registrations \\
  -H "Authorization: Bearer uf_live_EXAMPLE_NOT_A_REAL_KEY" \\
  -H "Idempotency-Key: <your form submission id>" \\
  -H "Content-Type: application/json" \\
  -d '{"ticketTypeId":"<id>","name":"Asha Rao","email":"asha@example.com","phone":"9876543210","answers":{},"ageConfirmed":true}'`}</pre>
            </div>
          </ListGroup>
        </>
      ) : null}
    </div>
  );
}
