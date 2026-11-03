"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/shared/PageHeader";
import { ErrorNotice } from "@/components/shared/ErrorNotice";
import { Skeleton } from "@/components/ui/skeleton";
import { DocEditor } from "@/components/wegobeyond/DocEditor";
import { CrewFormBuilder } from "@/components/wegobeyond/CrewFormBuilder";
import { getWegobeyondDoc, WEGOBEYOND_DOCS, type WegobeyondDoc, type WegobeyondDocName } from "@/lib/api/wegobeyond-api";

/** Apex › WeGoBeyond › one site document (initiatives, gallery, team, press, crew, settings). */
export default function WegobeyondDocPage() {
  const { doc: name } = useParams<{ doc: string }>();
  const known = (WEGOBEYOND_DOCS as readonly string[]).includes(name);
  const [doc, setDoc] = useState<WegobeyondDoc | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!known) return;
    void getWegobeyondDoc(name as WegobeyondDocName).then(({ data, error }) => {
      if (data) setDoc(data);
      else setError(error?.message ?? "Couldn't load this page's content.");
    });
  }, [name, known]);

  if (!known) return <ErrorNotice message="There's no WeGoBeyond page by that name." />;

  return (
    <div className="space-y-6">
      <PageHeader title={doc?.spec.title ?? "WeGoBeyond"} subtitle={doc?.spec.blurb} />
      {error && <ErrorNotice message={error} />}
      {doc ? (
        doc.name === "crew" ? (
          <CrewFormBuilder doc={doc} onSaved={setDoc} />
        ) : (
          <DocEditor key={doc.name} doc={doc} onSaved={setDoc} />
        )
      ) : (
        !error && <Skeleton className="h-64 w-full rounded-xl" />
      )}
    </div>
  );
}
