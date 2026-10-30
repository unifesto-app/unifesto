"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  Certificate as CertificateIcon,
  Plus,
  PencilSimple,
  Trash,
  DownloadSimple,
  Prohibit,
  Spinner,
  CheckCircle,
  Copy,
  X,
  CaretLeft,
  CaretRight,
  EnvelopeSimple,
  ArrowClockwise,
} from "@unifesto/unicon/react";
import { PageHeader } from "@/console/components/shared/PageHeader";
import { EmptyState } from "@/console/components/shared/EmptyState";
import { Button } from "@/console/components/ui/button";
import { Input } from "@/console/components/ui/input";
import { Label } from "@/console/components/ui/label";
import { Badge } from "@/console/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/console/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/console/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/console/components/ui/tabs";
import { CertificateDesigner } from "@/console/components/events/certificates/CertificateDesigner";
import {
  CertificateAudience,
  CertificateTemplate,
  IssueSummary,
  IssuedCertificate,
  ResendSummary,
  ReusableTemplate,
  deleteTemplate,
  getCertificateBatch,
  getEventCertificates,
  getSpaceTemplates,
  getTemplates,
  importTemplate,
  issueCertificates,
  resendCertificateEmails,
  revokeTemplateCertificates,
  revokeCertificate,
  reissueCertificate,
  reissueRevokedCertificates,
} from "@/console/lib/api/certificates-api";
import {
  getEventRegistrations,
  type Registration,
} from "@/console/lib/api/registrations-api";

const AUDIENCE_LABEL: Record<CertificateAudience, string> = {
  CHECKED_IN: "Checked-in attendees",
  CONFIRMED: "All confirmed attendees",
  MANUAL: "Hand-pick recipients",
};

const AUDIENCE_HINT: Record<CertificateAudience, string> = {
  CHECKED_IN: "Everyone who was checked in at the event.",
  CONFIRMED: "Every confirmed, non-waitlisted attendee.",
  MANUAL: "Only the attendees you select below.",
};

export default function EventCertificatesPage() {
  const params = useParams();
  const eventId = String(params.eventId);

  const [designing, setDesigning] = useState<
    false | { template?: CertificateTemplate }
  >(false);

  const [templates, setTemplates] = useState<CertificateTemplate[]>([]);
  const [certificates, setCertificates] = useState<IssuedCertificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Import-from-another-event panel + bulk revoke.
  const [importOpen, setImportOpen] = useState(false);
  const [spaceTemplates, setSpaceTemplates] = useState<ReusableTemplate[] | null>(
    null
  );
  const [importingId, setImportingId] = useState<string | null>(null);
  const [revokingTemplateId, setRevokingTemplateId] = useState<string | null>(
    null
  );

  // Issued/Revoked tabs + client-side pagination over the loaded list.
  const [certTab, setCertTab] = useState<"ISSUED" | "REVOKED">("ISSUED");
  const [certPage, setCertPage] = useState(1);
  const CERTS_PER_PAGE = 10;

  // Bulk email resend.
  const [resending, setResending] = useState(false);
  const [resendSummary, setResendSummary] = useState<ResendSummary | null>(null);

  // Reissue: per-row (revoked cert id) + the bulk "Reissue all" pass.
  const [reissuingId, setReissuingId] = useState<string | null>(null);
  const [reissuingAll, setReissuingAll] = useState(false);
  const [reissueMessage, setReissueMessage] = useState<string | null>(null);

  // Issue panel
  const [issueTemplateId, setIssueTemplateId] = useState("");
  const [audience, setAudience] = useState<CertificateAudience>("CHECKED_IN");
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [manualSelected, setManualSelected] = useState<Set<string>>(new Set());
  const [manualFilter, setManualFilter] = useState("");
  const [issuing, setIssuing] = useState(false);
  const [summary, setSummary] = useState<IssueSummary | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [tpl, certs] = await Promise.all([
      getTemplates(eventId),
      getEventCertificates(eventId),
    ]);
    if (tpl.error) setError(tpl.error.message);
    else setError(null);
    setTemplates(tpl.data ?? []);
    setCertificates(certs.data ?? []);
    if (tpl.data?.length && !issueTemplateId) {
      setIssueTemplateId(tpl.data[0].id);
    }
    setLoading(false);
  }, [eventId, issueTemplateId]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  // Load the attendee list lazily, only when hand-picking.
  useEffect(() => {
    if (audience !== "MANUAL" || registrations.length) return;
    getEventRegistrations(eventId, { attendingOnly: true, limit: 500 }).then(
      (res) => setRegistrations(res.data?.registrations ?? [])
    );
  }, [audience, eventId, registrations.length]);

  const filteredRegistrations = useMemo(() => {
    const q = manualFilter.trim().toLowerCase();
    if (!q) return registrations;
    return registrations.filter((r) =>
      (r.user.fullName ?? r.user.username ?? "").toLowerCase().includes(q)
    );
  }, [registrations, manualFilter]);

  const toggleManual = (id: string) => {
    setManualSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleIssue = async () => {
    if (!issueTemplateId) return;
    setIssuing(true);
    setSummary(null);
    setError(null);

    // Issuance is now queued (so a big batch can't OOM the backend during
    // rendering); enqueue, then poll the batch until it finishes.
    const { data, error: err } = await issueCertificates(eventId, {
      templateId: issueTemplateId,
      audience,
      registrationIds:
        audience === "MANUAL" ? Array.from(manualSelected) : undefined,
    });
    if (err || !data) {
      setIssuing(false);
      setError(err?.message ?? "Failed to issue certificates");
      return;
    }
    setManualSelected(new Set());

    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const deadline = Date.now() + 5 * 60 * 1000; // safety cap
    while (Date.now() < deadline) {
      await sleep(1500);
      const { data: batch } = await getCertificateBatch(eventId, data.batchId);
      if (!batch) continue;
      if (batch.status === "COMPLETED" || batch.status === "FAILED") {
        setSummary(batch);
        if (batch.status === "FAILED") {
          setError(batch.error ?? "Issuance failed");
        }
        break;
      }
    }

    setIssuing(false);
    // Refresh the issued list (partial results show even if still processing).
    const certs = await getEventCertificates(eventId);
    setCertificates(certs.data ?? []);
  };

  const handleDeleteTemplate = async (tpl: CertificateTemplate) => {
    const issued = tpl._count?.certificates ?? 0;
    const warning =
      issued > 0
        ? `Remove "${tpl.name}"? You can't issue from it any more. The ${issued} certificate${
            issued === 1 ? "" : "s"
          } already issued from it stay valid and their verify links keep working.`
        : `Delete "${tpl.name}"? This cannot be undone.`;
    if (!window.confirm(warning)) return;

    const { data, error: err } = await deleteTemplate(tpl.id);
    if (err || !data) return setError(err?.message ?? "Failed to delete template");
    setTemplates((t) => t.filter((x) => x.id !== tpl.id));
    if (issueTemplateId === tpl.id) setIssueTemplateId("");
  };

  const handleRevoke = async (id: string) => {
    const { data, error: err } = await revokeCertificate(id);
    if (err || !data) return setError(err?.message ?? "Failed to revoke");
    setCertificates((c) =>
      c.map((x) => (x.id === id ? { ...x, ...data } : x))
    );
  };

  const handleResend = async (includeAlreadySent: boolean) => {
    // "Resend to all" re-emails people who already received theirs, so confirm.
    if (
      includeAlreadySent &&
      !window.confirm(
        `Re-send certificate emails to all ${emailableCount} recipient${
          emailableCount === 1 ? "" : "s"
        } with an email on file, including those already emailed?`
      )
    )
      return;

    setResending(true);
    setResendSummary(null);
    const { data, error: err } = await resendCertificateEmails(
      eventId,
      includeAlreadySent
    );
    setResending(false);
    if (err || !data) {
      setError(err?.message ?? "Failed to resend certificate emails");
      return;
    }
    setResendSummary(data);
    // Refresh so the per-row Emailed/Pending badges reflect what just sent.
    const certs = await getEventCertificates(eventId);
    setCertificates(certs.data ?? []);
  };

  const handleRevokeTemplate = async (tpl: CertificateTemplate) => {
    const issued = tpl._count?.certificates ?? 0;
    if (issued === 0) return;
    if (
      !window.confirm(
        `Revoke all certificates issued from "${tpl.name}"? Their verify links will report as revoked. This cannot be undone.`
      )
    )
      return;
    setRevokingTemplateId(tpl.id);
    const { data, error: err } = await revokeTemplateCertificates(tpl.id);
    setRevokingTemplateId(null);
    if (err || !data)
      return setError(err?.message ?? "Failed to revoke certificates");
    const certs = await getEventCertificates(eventId);
    setCertificates(certs.data ?? []);
  };

  // Reissue one revoked certificate: re-render from the latest template, restore
  // it to Issued (number + verify link kept), and re-email the recipient.
  const handleReissue = async (id: string) => {
    setReissuingId(id);
    setReissueMessage(null);
    setError(null);
    const { data, error: err } = await reissueCertificate(id);
    setReissuingId(null);
    if (err || !data)
      return setError(err?.message ?? "Failed to reissue certificate");
    setReissueMessage(
      data.emailed > 0
        ? "Certificate reissued and re-emailed."
        : "Certificate reissued (no email on file)."
    );
    // The row moves from Revoked → Issued; refresh both lists.
    const certs = await getEventCertificates(eventId);
    setCertificates(certs.data ?? []);
  };

  // Reissue every revoked certificate for the event in one pass.
  const handleReissueAll = async () => {
    if (
      !window.confirm(
        `Reissue all ${revokedList.length} revoked certificate${
          revokedList.length === 1 ? "" : "s"
        }? Each is re-rendered from its latest template and re-emailed to the recipient.`
      )
    )
      return;
    setReissuingAll(true);
    setReissueMessage(null);
    setError(null);
    const { data, error: err } = await reissueRevokedCertificates(eventId);
    setReissuingAll(false);
    if (err || !data)
      return setError(err?.message ?? "Failed to reissue certificates");
    setReissueMessage(
      data.queued
        ? `Reissuing ${data.total} certificate${data.total === 1 ? "" : "s"} in the background. Refresh in a minute to see them.`
        : `${data.reissued} reissued, ${data.emailed} emailed` +
            (data.failed > 0 ? `, ${data.failed} failed` : "")
    );
    const certs = await getEventCertificates(eventId);
    setCertificates(certs.data ?? []);
  };

  const openImport = async () => {
    setImportOpen(true);
    setSpaceTemplates(null);
    const { data } = await getSpaceTemplates(eventId);
    setSpaceTemplates(data ?? []);
  };

  const handleImport = async (sourceId: string) => {
    setImportingId(sourceId);
    const { data, error: err } = await importTemplate(eventId, sourceId);
    setImportingId(null);
    if (err || !data)
      return setError(err?.message ?? "Failed to import template");
    setImportOpen(false);
    await load();
  };

  // Designer takes over the whole page while active.
  if (designing) {
    return (
      <div className="space-y-4">
        <PageHeader
          title={designing.template ? "Edit template" : "New template"}
          subtitle="Upload a background and position the text that fills in per recipient."
        />
        <CertificateDesigner
          eventId={eventId}
          template={designing.template}
          onSaved={() => {
            setDesigning(false);
            load();
          }}
          onCancel={() => setDesigning(false)}
        />
      </div>
    );
  }

  const issuedList = certificates.filter((c) => c.status === "ISSUED");
  const revokedList = certificates.filter((c) => c.status === "REVOKED");

  // Issued certificates with an email on file that were never delivered — the
  // set the primary resend button targets.
  const pendingEmailCount = issuedList.filter(
    (c) => c.recipientEmail && !c.emailedAt
  ).length;

  // Every issued certificate that COULD be emailed — the "Resend to all" set,
  // which re-sends even to those already delivered.
  const emailableCount = issuedList.filter((c) => c.recipientEmail).length;

  // The active tab's rows, clamped to a valid page (revoking moves a row across
  // tabs, so the page count can shrink between renders).
  const activeCerts = certTab === "ISSUED" ? issuedList : revokedList;
  const certTotalPages = Math.max(
    1,
    Math.ceil(activeCerts.length / CERTS_PER_PAGE)
  );
  const certPageSafe = Math.min(certPage, certTotalPages);
  const certPageItems = activeCerts.slice(
    (certPageSafe - 1) * CERTS_PER_PAGE,
    certPageSafe * CERTS_PER_PAGE
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="Certificates"
        subtitle="Design certificate templates and issue them to attendees."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={openImport}>
              <Copy className="h-4 w-4" /> Import from another event
            </Button>
            <Button onClick={() => setDesigning({})}>
              <Plus className="h-4 w-4" /> New template
            </Button>
          </div>
        }
      />

      {error && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {importOpen && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">
              Reuse a template from another event
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setImportOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent>
            {spaceTemplates === null ? (
              <div className="flex justify-center py-8">
                <Spinner className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : spaceTemplates.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No templates on other events in this space yet. Design one on any
                event and it&apos;ll be available to reuse here.
              </p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {spaceTemplates.map((tpl) => (
                  <div
                    key={tpl.id}
                    className="overflow-hidden rounded-lg border border-border"
                  >
                    <div
                      className="relative w-full border-b border-border bg-white"
                      style={{
                        aspectRatio: `${tpl.canvasWidth} / ${tpl.canvasHeight}`,
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={tpl.backgroundUrl}
                        alt={tpl.name}
                        className="absolute inset-0 h-full w-full object-contain"
                      />
                    </div>
                    <div className="space-y-2 p-3">
                      <div>
                        <p className="truncate text-sm font-medium text-foreground">
                          {tpl.name}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          from {tpl.event.title}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full"
                        disabled={importingId !== null}
                        onClick={() => handleImport(tpl.id)}
                      >
                        {importingId === tpl.id ? (
                          <Spinner className="h-4 w-4 animate-spin" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                        Import
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : templates.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <EmptyState
              icon={CertificateIcon}
              title="No templates yet"
              description="Design a certificate template to start issuing certificates to your attendees."
              action={
                <Button onClick={() => setDesigning({})}>
                  <Plus className="h-4 w-4" /> Design a template
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Templates ---------------------------------------------------- */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {templates.map((tpl) => (
              <Card key={tpl.id} className="overflow-hidden">
                <div
                  className="relative w-full border-b border-border bg-white"
                  style={{ aspectRatio: `${tpl.canvasWidth} / ${tpl.canvasHeight}` }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={tpl.backgroundUrl}
                    alt={tpl.name}
                    className="absolute inset-0 h-full w-full object-contain"
                  />
                </div>
                <CardContent className="space-y-4 py-4">
                  <div>
                    <p className="truncate font-medium text-foreground">
                      {tpl.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {tpl.fields.length} field
                      {tpl.fields.length === 1 ? "" : "s"} ·{" "}
                      {tpl._count?.certificates ?? 0} issued
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setDesigning({ template: tpl })}
                    >
                      <PencilSimple className="h-4 w-4" /> Edit
                    </Button>
                    {(tpl._count?.certificates ?? 0) > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRevokeTemplate(tpl)}
                        disabled={revokingTemplateId === tpl.id}
                        title="Revoke all certificates from this template"
                      >
                        {revokingTemplateId === tpl.id ? (
                          <Spinner className="h-4 w-4 animate-spin" />
                        ) : (
                          <Prohibit className="h-4 w-4" />
                        )}
                        Revoke all
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteTemplate(tpl)}
                      title="Delete template"
                    >
                      <Trash className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Issue -------------------------------------------------------- */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Issue certificates</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="certificates-template">Template</Label>
                  <Select
                    value={issueTemplateId}
                    onValueChange={setIssueTemplateId}
                  >
                    <SelectTrigger id="certificates-template">
                      <SelectValue placeholder="Choose a template" />
                    </SelectTrigger>
                    <SelectContent>
                      {templates.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="certificates-recipients">Recipients</Label>
                  <Select
                    value={audience}
                    onValueChange={(v) =>
                      setAudience(v as CertificateAudience)
                    }
                  >
                    <SelectTrigger id="certificates-recipients">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(
                        ["CHECKED_IN", "CONFIRMED", "MANUAL"] as CertificateAudience[]
                      ).map((a) => (
                        <SelectItem key={a} value={a}>
                          {AUDIENCE_LABEL[a]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                {AUDIENCE_HINT[audience]}
              </p>

              {audience === "MANUAL" && (
                <div className="space-y-2">
                  <Input
                    value={manualFilter}
                    onChange={(e) => setManualFilter(e.target.value)}
                    placeholder="Filter attendees by name…"
                  />
                  <div className="max-h-56 overflow-y-auto rounded-md border border-border divide-y divide-border">
                    {filteredRegistrations.length === 0 ? (
                      <p className="px-3 py-4 text-sm text-muted-foreground">
                        No attendees to show.
                      </p>
                    ) : (
                      filteredRegistrations.map((r) => (
                        <label
                          key={r.id}
                          className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-muted"
                        >
                          <input
                            type="checkbox"
                            checked={manualSelected.has(r.id)}
                            onChange={() => toggleManual(r.id)}
                            className="h-4 w-4"
                          />
                          <span className="truncate">
                            {r.user.fullName ?? r.user.username ?? "Attendee"}
                          </span>
                          {r.checkedInAt && (
                            <Badge variant="neutral" className="ml-auto">
                              Checked in
                            </Badge>
                          )}
                        </label>
                      ))
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {manualSelected.size} selected
                  </p>
                </div>
              )}

              <div className="flex items-center gap-3">
                <Button
                  onClick={handleIssue}
                  disabled={
                    issuing ||
                    !issueTemplateId ||
                    (audience === "MANUAL" && manualSelected.size === 0)
                  }
                >
                  {issuing ? (
                    <Spinner className="h-4 w-4 animate-spin" />
                  ) : (
                    <CertificateIcon className="h-4 w-4" />
                  )}
                  Issue certificates
                </Button>

                {summary && (
                  <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                    <CheckCircle
                      className="h-4 w-4 text-success"
                      weight="fill"
                    />
                    {summary.issued} issued
                    {summary.reactivated > 0 &&
                      `, ${summary.reactivated} reactivated`}
                    {summary.skipped > 0 && `, ${summary.skipped} already had one`}
                    {summary.failed > 0 && `, ${summary.failed} failed`}
                  </span>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Issued / Revoked ------------------------------------------------ */}
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <CardTitle className="text-base">Certificates</CardTitle>
                <div className="flex items-center gap-3">
                  {reissueMessage && (
                    <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                      <CheckCircle
                        className="h-4 w-4 text-success"
                        weight="fill"
                      />
                      {reissueMessage}
                    </span>
                  )}

                  {/* Issued tab → email delivery controls. */}
                  {certTab === "ISSUED" && (
                    <>
                      {resendSummary && (
                        <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                          <CheckCircle
                            className="h-4 w-4 text-success"
                            weight="fill"
                          />
                          {resendSummary.sent} sent
                          {resendSummary.failed > 0 &&
                            `, ${resendSummary.failed} failed`}
                        </span>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleResend(false)}
                        disabled={resending || pendingEmailCount === 0}
                        title={
                          pendingEmailCount === 0
                            ? "Every certificate with an email has been sent"
                            : "Email the certificates that haven't been delivered yet"
                        }
                      >
                        {resending ? (
                          <Spinner className="h-4 w-4 animate-spin" />
                        ) : (
                          <EnvelopeSimple className="h-4 w-4" />
                        )}
                        {pendingEmailCount > 0
                          ? `Resend ${pendingEmailCount} pending`
                          : "All emailed"}
                      </Button>
                      {emailableCount > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleResend(true)}
                          disabled={resending}
                          title="Re-send to everyone with an email, including those already emailed"
                        >
                          Resend to all
                        </Button>
                      )}
                    </>
                  )}

                  {/* Revoked tab → reissue every revoked certificate at once. */}
                  {certTab === "REVOKED" && revokedList.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleReissueAll}
                      disabled={reissuingAll || reissuingId !== null}
                      title="Re-render every revoked certificate from its latest template and re-email it"
                    >
                      {reissuingAll ? (
                        <Spinner className="h-4 w-4 animate-spin" />
                      ) : (
                        <ArrowClockwise className="h-4 w-4" />
                      )}
                      Reissue all ({revokedList.length})
                    </Button>
                  )}
                </div>
              </div>
              <Tabs
                value={certTab}
                onValueChange={(v) => {
                  setCertTab(v as "ISSUED" | "REVOKED");
                  setCertPage(1);
                }}
                className="pt-2"
              >
                <TabsList>
                  <TabsTrigger value="ISSUED">
                    Issued ({issuedList.length})
                  </TabsTrigger>
                  <TabsTrigger value="REVOKED">
                    Revoked ({revokedList.length})
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </CardHeader>
            <CardContent>
              {activeCerts.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  {certTab === "ISSUED"
                    ? "No active certificates."
                    : "No revoked certificates."}
                </p>
              ) : (
                <>
                  <div className="divide-y divide-border">
                    {certPageItems.map((cert) => (
                      <div
                        key={cert.id}
                        className="flex flex-wrap items-center gap-4 py-3"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-foreground">
                            {cert.recipientName}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {cert.certificateNumber}
                            {cert.recipientEmail
                              ? ` · ${cert.recipientEmail}`
                              : ""}
                          </p>
                        </div>

                        {cert.status === "REVOKED" ? (
                          <Badge variant="destructive">Revoked</Badge>
                        ) : (
                          <Badge variant="success">Issued</Badge>
                        )}

                        {cert.status === "ISSUED" &&
                          (cert.emailedAt ? (
                            <Badge
                              variant="neutral"
                              title={`Emailed ${new Date(
                                cert.emailedAt
                              ).toLocaleString("en-IN")}`}
                            >
                              Emailed
                            </Badge>
                          ) : cert.recipientEmail ? (
                            <Badge variant="warning">Not sent</Badge>
                          ) : (
                            <Badge variant="outline" title="No email on file">
                              No email
                            </Badge>
                          ))}

                        {cert.pdfUrl && (
                          <a
                            href={cert.pdfUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-input bg-card px-2.5 text-xs font-medium hover:bg-muted"
                          >
                            <DownloadSimple className="h-3.5 w-3.5" /> PDF
                          </a>
                        )}

                        {cert.status === "ISSUED" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRevoke(cert.id)}
                          >
                            <Prohibit className="h-4 w-4" /> Revoke
                          </Button>
                        )}

                        {cert.status === "REVOKED" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleReissue(cert.id)}
                            disabled={reissuingId !== null || reissuingAll}
                            title="Re-render from the latest template and re-email"
                          >
                            {reissuingId === cert.id ? (
                              <Spinner className="h-4 w-4 animate-spin" />
                            ) : (
                              <ArrowClockwise className="h-4 w-4" />
                            )}
                            Reissue
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>

                  {certTotalPages > 1 && (
                    <div className="flex items-center justify-between pt-4">
                      <span className="text-xs text-muted-foreground">
                        Showing {(certPageSafe - 1) * CERTS_PER_PAGE + 1}–
                        {Math.min(
                          certPageSafe * CERTS_PER_PAGE,
                          activeCerts.length
                        )}{" "}
                        of {activeCerts.length}
                      </span>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={certPageSafe <= 1}
                          onClick={() =>
                            setCertPage((p) => Math.max(1, p - 1))
                          }
                        >
                          <CaretLeft className="h-4 w-4" /> Previous
                        </Button>
                        <span className="text-sm text-muted-foreground">
                          Page {certPageSafe} of {certTotalPages}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={certPageSafe >= certTotalPages}
                          onClick={() =>
                            setCertPage((p) =>
                              Math.min(certTotalPages, p + 1)
                            )
                          }
                        >
                          Next <CaretRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
