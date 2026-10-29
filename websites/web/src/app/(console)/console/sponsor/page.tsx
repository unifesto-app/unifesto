"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Handshake,
  Download,
  QrCode,
  CheckCircle,
  Users,
} from "@unifesto/unicon/react";
import { getAuthToken } from "@/console/lib/utils/auth";
import { apexUrl } from "@/console/lib/types/rbac";
import {
  getMyPortal,
  getPortalLeads,
  boothScan,
  updatePortalLead,
  type PortalLeadStatus,
  type PortalSponsor,
  type PortalLead,
} from "@/console/lib/api/sponsor-portal-api";
import { Button } from "@/console/components/ui/button";
import { Badge } from "@/console/components/ui/badge";
import { Skeleton } from "@/console/components/ui/skeleton";
import { Card, CardContent } from "@/console/components/ui/card";
import { Input } from "@/console/components/ui/input";
import { Label } from "@/console/components/ui/label";
import { EmptyState } from "@/console/components/shared/EmptyState";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/console/components/ui/select";

const STATUS_LABEL: Record<PortalLeadStatus, string> = {
  NEW: "New",
  CONTACTED: "Contacted",
  CONVERTED: "Converted",
  ARCHIVED: "Archived",
};

const SOURCE_LABEL: Record<string, string> = {
  OPT_IN: "Opted in",
  BOOTH_SCAN: "Booth scan",
  MANUAL: "Manual",
  IMPORT: "Import",
};

export default function SponsorPortalPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<"loading" | "no-access" | "ready">("loading");
  const [sponsors, setSponsors] = useState<PortalSponsor[]>([]);
  const [sponsorId, setSponsorId] = useState("");
  const [leads, setLeads] = useState<PortalLead[]>([]);
  const [leadsLoading, setLeadsLoading] = useState(false);

  useEffect(() => {
    if (!getAuthToken()) {
      router.replace("/console/login");
      return;
    }
    (async () => {
      const { data } = await getMyPortal();
      if (!data || data.length === 0) {
        setPhase("no-access");
        return;
      }
      setSponsors(data);
      setSponsorId(data[0].sponsorId);
      setPhase("ready");
    })();
  }, [router]);

  const sponsor = useMemo(
    () => sponsors.find((s) => s.sponsorId === sponsorId) ?? null,
    [sponsors, sponsorId]
  );

  const loadLeads = useCallback(async () => {
    if (!sponsorId) return;
    setLeadsLoading(true);
    const { data } = await getPortalLeads(sponsorId);
    setLeads(data ?? []);
    setLeadsLoading(false);
  }, [sponsorId]);

  useEffect(() => {
    if (phase === "ready") loadLeads();
  }, [phase, loadLeads]);

  /** Booth stats per event (E3), from the leads on screen so a status change shows at once. */
  const boothStats = useMemo(() => {
    const by = new Map<string, { leads: number; scans: number; optIns: number; contacted: number; converted: number }>();
    for (const l of leads) {
      const s = by.get(l.eventSponsorId) ?? { leads: 0, scans: 0, optIns: 0, contacted: 0, converted: 0 };
      s.leads++;
      if (l.source === "BOOTH_SCAN") s.scans++;
      if (l.source === "OPT_IN") s.optIns++;
      if (l.status === "CONTACTED") s.contacted++;
      if (l.status === "CONVERTED") s.converted++;
      by.set(l.eventSponsorId, s);
    }
    return by;
  }, [leads]);

  /** Save my follow-up on a lead; the row updates in place (E3). */
  const follow = async (leadId: string, patch: { status?: PortalLeadStatus; note?: string | null }) => {
    const { data } = await updatePortalLead(sponsorId, leadId, patch);
    if (data) setLeads((ls) => ls.map((l) => (l.id === leadId ? { ...l, ...data } : l)));
  };

  const exportCsv = () => {
    if (leads.length === 0) return;
    const header = ["Name", "Email", "Phone", "Source", "Status", "Note", "Event", "Captured"];
    const rows = leads.map((l) => [
      l.name ?? "",
      l.email ?? "",
      l.phone ?? "",
      SOURCE_LABEL[l.source] ?? l.source,
      STATUS_LABEL[l.status] ?? l.status,
      l.note ?? "",
      l.eventTitle,
      new Date(l.createdAt).toISOString(),
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${sponsor?.name ?? "sponsor"}-leads.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (phase === "loading") {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (phase === "no-access") {
    return (
      <div className="mx-auto max-w-md pt-16">
        <EmptyState
          icon={Handshake}
          title="No sponsor access"
          description="This account isn't linked to any sponsor. If you expected access, ask the event's curator to invite this email."
          action={
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => router.replace("/console")}>
                Operator dashboard
              </Button>
              <a href={apexUrl()}>
                <Button variant="ghost">Platform console</Button>
              </a>
            </div>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Sponsor header / switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {sponsor?.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={sponsor.logoUrl}
              alt=""
              className="h-12 w-12 rounded-md bg-white object-contain"
            />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-md bg-primary-soft text-sm font-bold text-primary">
              {sponsor?.name.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div>
            <h1 className="text-xl font-semibold text-foreground">{sponsor?.name}</h1>
            <p className="text-sm text-muted-foreground">{sponsor?.spaceName}</p>
          </div>
        </div>
        {sponsors.length > 1 && (
          <Select value={sponsorId} onValueChange={setSponsorId}>
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sponsors.map((s) => (
                <SelectItem key={s.sponsorId} value={s.sponsorId}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Booth scan */}
      {sponsor && <BoothScanPanel sponsor={sponsor} onCaptured={loadLeads} />}

      {/* Booth stats per event (E3) */}
      {sponsor && sponsor.events.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Booth stats</h2>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Event</th>
                  <th className="px-3 py-2 text-right font-medium">Leads</th>
                  <th className="px-3 py-2 text-right font-medium">Booth scans</th>
                  <th className="px-3 py-2 text-right font-medium">Opted in</th>
                  <th className="px-3 py-2 text-right font-medium">Contacted</th>
                  <th className="px-3 py-2 text-right font-medium">Converted</th>
                </tr>
              </thead>
              <tbody>
                {sponsor.events.map((e) => {
                  const s = boothStats.get(e.eventSponsorId);
                  return (
                    <tr key={e.eventSponsorId} className="border-t border-border">
                      <td className="px-3 py-2 font-medium text-foreground">{e.title}</td>
                      <td className="px-3 py-2 text-right">{s?.leads ?? 0}</td>
                      <td className="px-3 py-2 text-right">{s?.scans ?? 0}</td>
                      <td className="px-3 py-2 text-right">{s?.optIns ?? 0}</td>
                      <td className="px-3 py-2 text-right">{s?.contacted ?? 0}</td>
                      <td className="px-3 py-2 text-right">{s?.converted ?? 0}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Leads */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Users className="h-4 w-4" /> Leads
            {leads.length > 0 && <span className="text-muted-foreground">({leads.length})</span>}
          </h2>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={leads.length === 0}>
            <Download className="h-4 w-4" /> Export CSV
          </Button>
        </div>

        {leadsLoading ? (
          <Skeleton className="h-40 rounded-xl" />
        ) : leads.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No leads yet"
            description="Leads appear as attendees opt in or you scan tickets at your booth."
          />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[960px] text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Email</th>
                  <th className="px-3 py-2 font-medium">Phone</th>
                  <th className="px-3 py-2 font-medium">Source</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Note</th>
                  <th className="px-3 py-2 font-medium">Event</th>
                  <th className="px-3 py-2 font-medium">Captured</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((l) => (
                  <tr key={l.id} className="border-t border-border">
                    <td className="px-3 py-2 font-medium text-foreground">{l.name ?? "—"}</td>
                    <td className="px-3 py-2">{l.email ?? "—"}</td>
                    <td className="px-3 py-2">{l.phone ?? "—"}</td>
                    <td className="px-3 py-2">
                      <Badge variant="neutral">{SOURCE_LABEL[l.source] ?? l.source}</Badge>
                    </td>
                    <td className="px-3 py-2">
                      <Select value={l.status} onValueChange={(v) => follow(l.id, { status: v as PortalLeadStatus })}>
                        <SelectTrigger className="h-8 w-32" aria-label={`Status of ${l.name ?? "lead"}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.keys(STATUS_LABEL) as PortalLeadStatus[]).map((s) => (
                            <SelectItem key={s} value={s}>
                              {STATUS_LABEL[s]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        key={`${l.id}:${l.note ?? ""}`}
                        defaultValue={l.note ?? ""}
                        placeholder="Add a note"
                        aria-label={`Note on ${l.name ?? "lead"}`}
                        className="h-8 min-w-40"
                        maxLength={2000}
                        onBlur={(e) => {
                          const note = e.target.value.trim();
                          if (note !== (l.note ?? "")) follow(l.id, { note: note || null });
                        }}
                      />
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{l.eventTitle}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {new Date(l.createdAt).toLocaleDateString("en-IN")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function BoothScanPanel({
  sponsor,
  onCaptured,
}: {
  sponsor: PortalSponsor;
  onCaptured: () => void;
}) {
  const scannable = sponsor.events.filter((e) => e.leadCaptureEnabled);
  const [eventSponsorId, setEventSponsorId] = useState(scannable[0]?.eventSponsorId ?? "");
  const [qr, setQr] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  if (scannable.length === 0) {
    return (
      <Card>
        <CardContent className="p-4 text-sm text-muted-foreground">
          Booth lead capture isn&apos;t enabled for you at any event yet. Ask the event&apos;s curator to turn
          it on for {sponsor.name}.
        </CardContent>
      </Card>
    );
  }

  const scan = async () => {
    if (!eventSponsorId || !qr.trim() || !consent) return;
    setBusy(true);
    setFeedback(null);
    const { data, error } = await boothScan(sponsor.sponsorId, eventSponsorId, qr.trim());
    setBusy(false);
    if (error) {
      setFeedback({ ok: false, text: error.message ?? "Could not capture that ticket." });
      return;
    }
    setFeedback({
      ok: true,
      text: `Captured ${data?.lead.name ?? "attendee"}.`,
    });
    setQr("");
    setConsent(false);
    onCaptured();
  };

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <QrCode className="h-4 w-4" /> Booth scan
        </h2>
        <p className="text-xs text-muted-foreground">
          Enter an attendee&apos;s ticket code to add them as a lead. Ask them first: you get their name, email and
          phone number.
        </p>
        <div className="flex flex-wrap items-end gap-2">
          {scannable.length > 1 && (
            <div className="space-y-1.5">
              <Label htmlFor="sponsor-event">Event</Label>
              <Select value={eventSponsorId} onValueChange={setEventSponsorId}>
                <SelectTrigger id="sponsor-event" className="w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {scannable.map((e) => (
                    <SelectItem key={e.eventSponsorId} value={e.eventSponsorId}>
                      {e.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="sponsor-ticket-code">Ticket code</Label>
            <Input id="sponsor-ticket-code"
              value={qr}
              onChange={(e) => setQr(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && scan()}
              placeholder="Scan or type the ticket QR code"
            />
          </div>
          <Button onClick={scan} disabled={busy || !qr.trim() || !consent}>
            {busy ? "Adding…" : "Add lead"}
          </Button>
        </div>
        <label className="flex items-start gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-0.5 h-4 w-4"
          />
          The attendee agreed to share their name, email and phone number with {sponsor.name}.
        </label>
        {feedback && (
          <p
            className={`flex items-center gap-1.5 text-sm ${
              feedback.ok ? "text-success" : "text-destructive"
            }`}
          >
            {feedback.ok && <CheckCircle className="h-4 w-4" weight="fill" />}
            {feedback.text}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
