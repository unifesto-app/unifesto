"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  CaretLeft,
  DownloadSimple,
  Trash,
  LinkedinLogo,
  Globe,
  Envelope,
  Phone,
} from "@unifesto/unicon/react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Briefcase } from "@unifesto/unicon/react";
import {
  deleteApplication,
  getApplications,
  updateApplicationStatus,
  type ApplicationStatus,
  type CareerApplication,
} from "@/lib/api/careers-api";

const STATUSES: ApplicationStatus[] = [
  "NEW",
  "REVIEWING",
  "SHORTLISTED",
  "REJECTED",
  "HIRED",
];

const STATUS_DOT: Record<ApplicationStatus, string> = {
  NEW: "bg-primary",
  REVIEWING: "bg-warning",
  SHORTLISTED: "bg-muted-foreground",
  REJECTED: "bg-destructive",
  HIRED: "bg-success",
};

export default function CareerApplicationsPage() {
  const params = useParams();
  const careerId = String(params.id);

  const [applications, setApplications] = useState<CareerApplication[]>([]);
  const [roleTitle, setRoleTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = await getApplications(careerId);
    setLoading(false);
    if (err) return setError(err.message);
    setError("");
    setApplications(data?.applications ?? []);
    setRoleTitle(data?.career?.title ?? "Role");
  }, [careerId]);

  useEffect(() => {
    void load();
  }, [load]);

  const setStatus = async (id: string, status: ApplicationStatus) => {
    // Optimistic — reflect the change immediately.
    setApplications((as) =>
      as.map((a) => (a.id === id ? { ...a, status } : a))
    );
    const { error: err } = await updateApplicationStatus(id, status);
    if (err) {
      setError(err.message);
      void load();
    }
  };

  const remove = async (a: CareerApplication) => {
    if (!window.confirm(`Delete ${a.fullName}'s application?`)) return;
    const { error: err } = await deleteApplication(a.id);
    if (err) return setError(err.message);
    setApplications((as) => as.filter((x) => x.id !== a.id));
  };

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString("en-IN", { dateStyle: "medium" });

  return (
    <div className="space-y-4">
      <Link
        href="/dashboard/careers"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <CaretLeft className="h-4 w-4" /> Careers
      </Link>

      <PageHeader
        title={roleTitle}
        subtitle={`${applications.length} application${
          applications.length === 1 ? "" : "s"
        }`}
      />

      {error && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      ) : applications.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <EmptyState
              icon={Briefcase}
              title="No applications yet"
              description="Applications submitted through the public careers page will appear here."
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {applications.map((a) => (
            <Card key={a.id}>
              <CardContent className="space-y-4 py-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">{a.fullName}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <a
                        href={`mailto:${a.email}`}
                        className="inline-flex items-center gap-1 hover:text-foreground"
                      >
                        <Envelope className="h-3.5 w-3.5" /> {a.email}
                      </a>
                      {a.phone && (
                        <span className="inline-flex items-center gap-1">
                          <Phone className="h-3.5 w-3.5" /> {a.phone}
                        </span>
                      )}
                      <span>Applied {fmt(a.createdAt)}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`h-2 w-2 rounded-full ${STATUS_DOT[a.status]}`}
                    />
                    <Select
                      value={a.status}
                      onValueChange={(v) =>
                        setStatus(a.id, v as ApplicationStatus)
                      }
                    >
                      <SelectTrigger className="h-8 w-[140px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {s.charAt(0) + s.slice(1).toLowerCase()}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {a.coverLetter && (
                  <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                    {a.coverLetter}
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  <Button asChild size="sm">
                    <a
                      href={a.resumeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <DownloadSimple className="h-4 w-4" /> Resume
                    </a>
                  </Button>
                  {a.linkedinUrl && (
                    <Button asChild variant="outline" size="sm">
                      <a
                        href={a.linkedinUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <LinkedinLogo className="h-4 w-4" /> LinkedIn
                      </a>
                    </Button>
                  )}
                  {a.portfolioUrl && (
                    <Button asChild variant="outline" size="sm">
                      <a
                        href={a.portfolioUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Globe className="h-4 w-4" /> Portfolio
                      </a>
                    </Button>
                  )}
                  <Button aria-label="Delete"
                    variant="ghost"
                    size="sm"
                    className="ml-auto"
                    onClick={() => remove(a)}
                  >
                    <Trash className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
