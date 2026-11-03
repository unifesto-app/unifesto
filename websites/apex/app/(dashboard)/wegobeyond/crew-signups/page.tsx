"use client";

import { useEffect, useMemo, useState } from "react";
import { DownloadSimple, UserPlus } from "@unifesto/unicon/react";
import { PageHeader } from "@/components/shared/PageHeader";
import { ErrorNotice } from "@/components/shared/ErrorNotice";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { downloadCsv } from "@/lib/utils/csv";
import { COLUMN_FIELDS, getWegobeyondDoc, listCrewSignups, type CrewForm, type CrewSignup } from "@/lib/api/wegobeyond-api";

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });

const show = (v: string | string[] | undefined) => (Array.isArray(v) ? v.join(", ") : (v ?? ""));

/**
 * Apex › WeGoBeyond › Crew sign-ups: everyone who filled in wegobeyond.in's Join
 * the crew form. Built questions get a column each, headed by their current
 * label; answers to questions since removed show under their answer key.
 */
export default function CrewSignupsPage() {
  const [rows, setRows] = useState<CrewSignup[] | null>(null);
  const [form, setForm] = useState<CrewForm | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    void Promise.all([listCrewSignups(), getWegobeyondDoc("crew")]).then(([signups, crew]) => {
      if (signups.data && crew.data) {
        setRows(signups.data);
        setForm(crew.data.data as unknown as CrewForm);
      } else setError((signups.error ?? crew.error)?.message ?? "Couldn't load sign-ups.");
    });
  }, []);

  const extra = useMemo(() => {
    if (!rows || !form) return [];
    const current = form.fields
      .filter((f) => f.type !== "heading" && !COLUMN_FIELDS.includes(f.id))
      .map((f) => ({ id: f.id, header: f.label }));
    const known = new Set(current.map((c) => c.id));
    const gone = [...new Set(rows.flatMap((r) => Object.keys(r.answers ?? {})))].filter((id) => !known.has(id));
    return [...current, ...gone.map((id) => ({ id, header: id }))];
  }, [rows, form]);

  const exportCsv = () =>
    rows &&
    downloadCsv(
      `wegobeyond-crew-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        "Signed up",
        "Name",
        "Email",
        "Phone",
        "City",
        "Organisation",
        "Role",
        "Ways to help",
        "Availability",
        "Experience",
        "Links",
        ...extra.map((c) => c.header),
      ],
      rows.map((r) => [
        r.createdAt,
        r.name,
        r.email,
        r.phone,
        r.city,
        r.organization,
        r.role,
        r.interests.join(", "),
        r.availability.join(", "),
        r.experience,
        r.links,
        ...extra.map((c) => show(r.answers?.[c.id])),
      ])
    );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Crew sign-ups"
        subtitle="Everyone who filled in the Join the crew form on wegobeyond.in, newest first."
        actions={
          <Button variant="outline" onClick={exportCsv} disabled={!rows?.length}>
            <DownloadSimple className="h-4 w-4" />
            Export CSV
          </Button>
        }
      />
      {error && <ErrorNotice message={error} />}
      {!rows ? (
        !error && <Skeleton className="h-64 w-full rounded-xl" />
      ) : rows.length === 0 ? (
        <EmptyState icon={UserPlus} title="No sign-ups yet" description="They show here as soon as someone joins the crew on wegobeyond.in." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[1080px] text-sm">
            <thead className="bg-secondary text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Contact</th>
                <th className="px-3 py-2">City</th>
                <th className="px-3 py-2">Role</th>
                <th className="px-3 py-2">Ways to help</th>
                <th className="px-3 py-2">Availability</th>
                <th className="px-3 py-2">Experience and links</th>
                {extra.map((c) => (
                  <th key={c.id} className="px-3 py-2">
                    {c.header}
                  </th>
                ))}
                <th className="px-3 py-2">Signed up</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border align-top">
                  <td className="px-3 py-2">
                    <p className="text-foreground">{r.name}</p>
                    {r.organization && <p className="text-xs text-muted-foreground">{r.organization}</p>}
                  </td>
                  <td className="px-3 py-2">
                    <a href={`mailto:${r.email}`} className="text-primary hover:underline">
                      {r.email}
                    </a>
                    <p className="text-xs text-muted-foreground">{r.phone}</p>
                  </td>
                  <td className="px-3 py-2">{r.city}</td>
                  <td className="px-3 py-2">{r.role || "—"}</td>
                  <td className="px-3 py-2">{r.interests.join(", ")}</td>
                  <td className="px-3 py-2">{r.availability.join(", ")}</td>
                  <td className="max-w-xs px-3 py-2 text-xs text-muted-foreground">
                    {r.experience && <p className="line-clamp-3 whitespace-pre-line">{r.experience}</p>}
                    {r.links && <p className="mt-1 break-all">{r.links}</p>}
                    {!r.experience && !r.links && "—"}
                  </td>
                  {extra.map((c) => (
                    <td key={c.id} className="max-w-xs px-3 py-2">
                      <p className="line-clamp-3 whitespace-pre-line">{show(r.answers?.[c.id]) || "—"}</p>
                    </td>
                  ))}
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">{when(r.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
