"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorNotice } from "@/components/shared/ErrorNotice";
import {
  addDomain,
  getSpaceDomains,
  removeDomain,
  verifyDomain,
  type SpaceDomain,
} from "@/lib/api/white-label-api";

const STATUS: Record<string, { label: string; variant: "success" | "warning" | "destructive" | "neutral" }> = {
  verified: { label: "Verified", variant: "success" },
  pending: { label: "Checking DNS", variant: "warning" },
  not_started: { label: "Add the records", variant: "neutral" },
  partially_verified: { label: "Partly verified", variant: "warning" },
  partially_failed: { label: "Partly failed", variant: "destructive" },
  failed: { label: "Failed", variant: "destructive" },
};

const COPY = {
  email: {
    title: "Sending domain",
    blurb:
      "Send attendee emails from your own address, like tickets@mail.yourorg.com. Until it's verified they go from Unifesto's address with your sender name.",
    placeholder: "mail.yourorg.com",
    hint: "Use a subdomain you don't send other mail from, so your existing email setup isn't touched.",
  },
  web: {
    title: "Custom domain",
    blurb:
      "Put your space page and events on your own address, like events.yourorg.com. Your space page becomes its home page; event pages live under /event.",
    placeholder: "events.yourorg.com",
    hint: "Use a subdomain (not your main website). Branding must be on for the domain to serve your pages.",
  },
};

/**
 * A domain the space owns, for email (DKIM/SPF via Resend) or the web (CNAME
 * via Cloudflare). The space adds the records shown here; once verified, mail
 * goes from local@their-domain, or their pages answer on their domain.
 */
export function DomainCard({ spaceId, kind }: { spaceId: string; kind: "email" | "web" }) {
  const copyText = COPY[kind];
  const [domain, setDomain] = useState<SpaceDomain | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [hostname, setHostname] = useState("");
  const [localPart, setLocalPart] = useState("tickets");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await getSpaceDomains(spaceId);
    if (error) setError(error.message);
    else setDomain(data?.find((d) => d.kind === kind.toUpperCase()) ?? null);
    setLoaded(true);
  }, [spaceId, kind]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (fn: () => Promise<{ error: { message: string } | null }>) => {
    setBusy(true);
    setError("");
    const { error } = await fn();
    if (error) setError(error.message);
    await load();
    setBusy(false);
  };

  const copy = async (value: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
  };

  if (!loaded) return null;
  const status = domain
    ? STATUS[domain.status] ?? { label: domain.status, variant: "neutral" as const }
    : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {copyText.title} {status && <Badge variant={status.variant}>{status.label}</Badge>}
        </CardTitle>
        <CardDescription>{copyText.blurb}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <ErrorNotice message={error} />}

        {!domain ? (
          <div className="flex flex-wrap items-end gap-3">
            {kind === "email" && (
              <>
                <div className="w-32 space-y-1.5">
                  <Label htmlFor={`dom-local-${kind}`}>Mailbox</Label>
                  <Input
                    id={`dom-local-${kind}`}
                    value={localPart}
                    onChange={(e) => setLocalPart(e.target.value.trim())}
                  />
                </div>
                <span className="pb-2.5 text-muted-foreground">@</span>
              </>
            )}
            <div className="min-w-[220px] flex-1 space-y-1.5">
              <Label htmlFor={`dom-host-${kind}`}>Domain</Label>
              <Input
                id={`dom-host-${kind}`}
                value={hostname}
                onChange={(e) => setHostname(e.target.value.trim())}
                placeholder={copyText.placeholder}
              />
            </div>
            <Button
              disabled={busy || !hostname || (kind === "email" && !localPart)}
              onClick={() =>
                run(() => addDomain(spaceId, kind, kind === "email" ? { hostname, localPart } : { hostname }))
              }
            >
              {busy ? "Adding…" : "Add domain"}
            </Button>
            <p className="w-full text-xs text-muted-foreground">{copyText.hint}</p>
          </div>
        ) : (
          <>
            <p className="text-sm text-foreground">
              {kind === "email" ? "Sending as " : "Your pages at "}
              {kind === "email" ? (
                <span className="font-mono">
                  {domain.emailLocalPart ?? "tickets"}@{domain.hostname}
                </span>
              ) : (
                <a
                  href={`https://${domain.hostname}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono underline"
                >
                  {domain.hostname}
                </a>
              )}
            </p>

            {domain.status !== "verified" && (
              <>
                <p className="text-sm text-muted-foreground">
                  Add these records at your DNS provider, then check. DNS changes can take a few minutes, sometimes
                  hours.
                </p>
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-muted/40 text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 font-medium">Type</th>
                        <th className="px-3 py-2 font-medium">Name</th>
                        <th className="px-3 py-2 font-medium">Value</th>
                        <th className="px-3 py-2 font-medium">Priority</th>
                        <th className="px-3 py-2 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {domain.records.map((r, i) => (
                        <tr key={i} className="align-top">
                          <td className="px-3 py-2 font-mono">{r.type}</td>
                          <td className="px-3 py-2">
                            <button type="button" className="font-mono hover:underline" onClick={() => copy(r.name)}>
                              {r.name}
                            </button>
                          </td>
                          <td className="max-w-[280px] px-3 py-2">
                            <button
                              type="button"
                              className="break-all text-left font-mono hover:underline"
                              onClick={() => copy(r.value)}
                            >
                              {r.value}
                            </button>
                          </td>
                          <td className="px-3 py-2">{r.priority ?? ""}</td>
                          <td className="px-3 py-2">{r.status === "verified" ? "OK" : r.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-muted-foreground">
                  {copied ? "Copied." : "Click a name or value to copy it."}
                </p>
              </>
            )}

            <div className="flex gap-2">
              {domain.status !== "verified" && (
                <Button disabled={busy} onClick={() => run(() => verifyDomain(spaceId, kind))}>
                  {busy ? "Checking…" : "Check now"}
                </Button>
              )}
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => {
                  if (confirm(`Remove ${domain.hostname}?`)) void run(() => removeDomain(spaceId, kind));
                }}
              >
                Remove
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
