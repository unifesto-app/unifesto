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
import { getAuthToken } from "@/lib/utils/auth";
import { apexUrl } from "@/lib/types/rbac";
import {
  getMyPortal,
  getPortalLeads,
  boothScan,
  type PortalSponsor,
  type PortalLead,
} from "@/lib/api/sponsor-portal-api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/shared/EmptyState";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

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
      router.replace("/login");
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

  const exportCsv = () => {
    if (leads.length === 0) return;
    const header = ["Name", "Email", "Phone", "Source", "Event", "Captured"];
    const rows = leads.map((l) => [
      l.name ?? "",
      l.email ?? "",
      l.phone ?? "",
      SOURCE_LABEL[l.source] ?? l.source,
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
          description="This account isn't linked to any sponsor. If you expected access, ask the event organiser to invite this email."
          action={
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => router.replace("/dashboard")}>
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
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Email</th>
                  <th className="px-3 py-2 font-medium">Phone</th>
                  <th className="px-3 py-2 font-medium">Source</th>
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
                    <td className="px-3 py-2 text-muted-foreground">{l.eventTitle}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {new Date(l.createdAt).toLocaleDateString()}
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
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  if (scannable.length === 0) {
    return (
      <Card>
        <CardContent className="p-4 text-sm text-muted-foreground">
          Booth lead capture isn&apos;t enabled for you at any event yet. Ask the organiser to turn
          it on for {sponsor.name}.
        </CardContent>
      </Card>
    );
  }

  const scan = async () => {
    if (!eventSponsorId || !qr.trim()) return;
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
    onCaptured();
  };

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <QrCode className="h-4 w-4" /> Booth scan
        </h2>
        <p className="text-xs text-muted-foreground">
          Enter an attendee&apos;s ticket code to add them as a lead. Scanning is consent.
        </p>
        <div className="flex flex-wrap items-end gap-2">
          {scannable.length > 1 && (
            <div className="space-y-1.5">
              <Label>Event</Label>
              <Select value={eventSponsorId} onValueChange={setEventSponsorId}>
                <SelectTrigger className="w-56">
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
            <Label>Ticket code</Label>
            <Input
              value={qr}
              onChange={(e) => setQr(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && scan()}
              placeholder="Scan or type the ticket QR code"
            />
          </div>
          <Button onClick={scan} disabled={busy || !qr.trim()}>
            {busy ? "Adding…" : "Add lead"}
          </Button>
        </div>
        {feedback && (
          <p
            className={`flex items-center gap-1.5 text-sm ${
              feedback.ok ? "text-[hsl(142_71%_29%)]" : "text-destructive"
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
