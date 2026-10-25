"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Download,
  UploadSimple,
  WarningCircle,
  MagnifyingGlass,
  CheckCircle,
  Info,
} from "@unifesto/unicon/react";
import { getEventById } from "@/lib/api/events-api";
import type { Event, EventTicketType } from "@/lib/api/events-api";
import {
  downloadImportTemplate,
  importAttendees,
  previewImportAttendees,
  type ImportReport,
  type ImportPreview,
} from "@/lib/api/registrations-api";
import { PageHeader } from "@/components/shared/PageHeader";
import { ErrorNotice } from "@/components/shared/ErrorNotice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

export default function ImportAttendeesPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params.eventId as string;

  const [event, setEvent] = useState<Event | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await getEventById(eventId);
    if (error) setError(error.message);
    else if (data) setEvent(data);
    setLoading(false);
  }, [eventId]);

  useEffect(() => {
    void load();
  }, [load]);

  const ticketTypes = event?.ticketTypes ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push(`/dashboard/events/${eventId}/attendees`)}
          className="-ml-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to attendees
        </Button>
      </div>

      <PageHeader
        title="Import attendees"
        subtitle="Bulk-add a list of attendees from a spreadsheet."
      />

      {error && <ErrorNotice message={error} />}

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : ticketTypes.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm font-medium">No ticket types yet</p>
            <p className="text-sm text-muted-foreground">
              Add a ticket type or RSVP option before importing attendees.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <BulkUploadForm eventId={eventId} ticketTypes={ticketTypes} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function BulkUploadForm({
  eventId,
  ticketTypes,
}: {
  eventId: string;
  ticketTypes: EventTicketType[];
}) {
  const [ticketTypeId, setTicketTypeId] = useState(ticketTypes[0].id);
  const [file, setFile] = useState<File | null>(null);
  const [sendEmails, setSendEmails] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);

  const ticketName =
    ticketTypes.find((t) => t.id === ticketTypeId)?.name ?? "attendees";

  /**
   * A preview is only valid for the exact file + ticket type it was run against.
   * Any change to either must throw the review away, so a curator can never
   * commit an import they didn't actually review. This is the safety gate for
   * the whole flow — call it from every input that changes what would be imported.
   */
  const invalidateReview = () => {
    setPreview(null);
    setReport(null);
    setError("");
  };

  const onPickFile = (f: File | null) => {
    setFile(f);
    invalidateReview();
  };

  const onPickTicketType = (id: string) => {
    setTicketTypeId(id);
    invalidateReview();
  };

  const download = async () => {
    setDownloading(true);
    setError("");
    const { data, error } = await downloadImportTemplate(eventId, ticketTypeId);
    setDownloading(false);
    if (error) {
      setError(error.message);
      return;
    }
    if (data) {
      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${ticketName}-template.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  const review = async () => {
    if (!file) {
      setError("Choose a CSV file first.");
      return;
    }
    setReviewing(true);
    setError("");
    setReport(null);
    const { data, error } = await previewImportAttendees(
      eventId,
      ticketTypeId,
      file
    );
    setReviewing(false);
    if (error) {
      setError(error.message);
      return;
    }
    if (data) setPreview(data);
  };

  const confirmImport = async () => {
    if (!file || !preview) return;
    setUploading(true);
    setError("");
    const { data, error } = await importAttendees(
      eventId,
      ticketTypeId,
      file,
      sendEmails
    );
    setUploading(false);
    if (error) {
      setError(error.message);
      return;
    }
    if (data) {
      setReport(data);
      setPreview(null);
    }
  };

  return (
    <div className="max-w-2xl space-y-4">
      <div className="space-y-2">
        <Label htmlFor="import-ticket-type">Ticket type</Label>
        <Select value={ticketTypeId} onValueChange={onPickTicketType}>
          <SelectTrigger id="import-ticket-type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ticketTypes.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Bulk-imported attendees are added without payment. On a paid ticket,
          each one uses a free seat a platform admin approved for this event;
          rows past those seats are refused (add them with a payment link from
          Add attendee). The template columns match this ticket type.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={download} disabled={downloading}>
          <Download className="h-4 w-4" />
          {downloading ? "Preparing..." : "Download template"}
        </Button>
      </div>

      <div className="space-y-2">
        <Label htmlFor="import-upload-filled-csv">Upload filled CSV</Label>
        <Input id="import-upload-filled-csv"
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
        />
        <p className="text-xs text-muted-foreground">
          We&apos;ll check the file and show you a review before anything is
          imported.
        </p>
      </div>

      {error && (
        <p className="flex items-center gap-1.5 text-sm text-destructive">
          <WarningCircle className="h-4 w-4" />
          {error}
        </p>
      )}

      {/* Step 1 — review. Shown until a valid preview exists. */}
      {!preview && !report && (
        <div className="flex justify-end">
          <Button onClick={review} disabled={reviewing || !file}>
            <MagnifyingGlass className="h-4 w-4" />
            {reviewing ? "Checking..." : "Review import"}
          </Button>
        </div>
      )}

      {/* Step 2 — review results + confirm. */}
      {preview && (
        <ImportPreviewView preview={preview} />
      )}

      {preview && (
        <>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={sendEmails}
              onChange={(e) => setSendEmails(e.target.checked)}
            />
            Email each attendee their ticket now
          </label>

          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" onClick={invalidateReview}>
              Start over
            </Button>
            <Button
              onClick={confirmImport}
              disabled={uploading || preview.willCreate === 0}
            >
              <UploadSimple className="h-4 w-4" />
              {uploading
                ? "Importing..."
                : preview.willCreate === 0
                ? "Nothing to import"
                : `Import ${preview.willCreate} attendee${
                    preview.willCreate === 1 ? "" : "s"
                  }`}
            </Button>
          </div>
        </>
      )}

      {/* Step 3 — final report after a committed import. */}
      {report && <ImportReportView report={report} />}
    </div>
  );
}

/** The dry-run review: what committing this file would do, before it happens. */
function ImportPreviewView({ preview }: { preview: ImportPreview }) {
  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Info className="h-4 w-4 text-muted-foreground" />
        Review — nothing has been imported yet
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        <Badge variant="success">{preview.willCreate} will be added</Badge>
        {preview.willSkip > 0 && (
          <Badge variant="neutral">{preview.willSkip} will be skipped</Badge>
        )}
        {preview.willError > 0 && (
          <Badge variant="destructive">{preview.willError} have errors</Badge>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        {preview.newAccounts > 0
          ? `${preview.newAccounts} new account${
              preview.newAccounts === 1 ? "" : "s"
            } will be created. `
          : ""}
        {preview.remainingCapacity == null
          ? "This ticket type has unlimited capacity."
          : `${preview.remainingCapacity} seat${
              preview.remainingCapacity === 1 ? "" : "s"
            } remaining before this import.`}
      </p>

      <div className="max-h-64 overflow-y-auto">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-background text-muted-foreground">
            <tr>
              <th className="py-1 pr-2">Line</th>
              <th className="py-1 pr-2">Name</th>
              <th className="py-1 pr-2">Email</th>
              <th className="py-1 pr-2">Outcome</th>
              <th className="py-1">Detail</th>
            </tr>
          </thead>
          <tbody>
            {preview.rows.map((r) => (
              <tr key={`${r.line}-${r.email}`} className="border-t">
                <td className="py-1 pr-2">{r.line}</td>
                <td className="py-1 pr-2">{r.name || "—"}</td>
                <td className="py-1 pr-2">{r.email || "—"}</td>
                <td className="py-1 pr-2">
                  {r.outcome === "create" ? (
                    <span className="inline-flex items-center gap-1 text-success">
                      <CheckCircle className="h-3.5 w-3.5" />
                      Add
                    </span>
                  ) : r.outcome === "skip" ? (
                    <span className="text-muted-foreground">Skip</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-destructive">
                      <WarningCircle className="h-3.5 w-3.5" />
                      Error
                    </span>
                  )}
                </td>
                <td className="py-1 text-muted-foreground">
                  {r.outcome === "create"
                    ? r.newAccount
                      ? "New account"
                      : "Existing account"
                    : r.reason}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ImportReportView({ report }: { report: ImportReport }) {
  const problems = report.rows.filter((r) => r.status !== "created");
  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="flex flex-wrap gap-2 text-sm">
        <Badge variant="success">{report.created} added</Badge>
        {report.skipped > 0 && (
          <Badge variant="neutral">{report.skipped} skipped</Badge>
        )}
        {report.errored > 0 && (
          <Badge variant="destructive">{report.errored} errored</Badge>
        )}
      </div>
      {problems.length > 0 && (
        <div className="max-h-48 overflow-y-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-muted-foreground">
              <tr>
                <th className="py-1 pr-2">Line</th>
                <th className="py-1 pr-2">Email</th>
                <th className="py-1 pr-2">Status</th>
                <th className="py-1">Reason</th>
              </tr>
            </thead>
            <tbody>
              {problems.map((r) => (
                <tr key={`${r.line}-${r.email}`} className="border-t">
                  <td className="py-1 pr-2">{r.line}</td>
                  <td className="py-1 pr-2">{r.email || "—"}</td>
                  <td className="py-1 pr-2 capitalize">{r.status}</td>
                  <td className="py-1 text-muted-foreground">{r.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
