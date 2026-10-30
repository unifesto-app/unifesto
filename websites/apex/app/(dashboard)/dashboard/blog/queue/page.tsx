"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ListChecks, UploadSimple } from "@unifesto/unicon/react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";
import { getPlatformConfig } from "@/lib/api/subscriptions-api";
import {
  getBlogQuestions,
  learnFromSearchConsole,
  retryBlogQuestion,
  type BlogQuestion,
  type BlogQuestionStatus,
} from "@/lib/api/blog-api";

const BADGE: Record<BlogQuestionStatus, "neutral" | "brand" | "success" | "destructive"> = {
  QUEUED: "neutral",
  WRITING: "brand",
  PUBLISHED: "success",
  FAILED: "destructive",
};
const SOURCE = { SEED: "Seed", REFILL: "Refill", SEARCH_CONSOLE: "Search Console" } as const;

/** The auto-blog queue: what the writer will take next, what it published, what it rejected and why. */
export default function BlogQueuePage() {
  const [questions, setQuestions] = useState<BlogQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [uploading, setUploading] = useState(false);
  const [writerOn, setWriterOn] = useState<boolean | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = await getBlogQuestions();
    setLoading(false);
    if (err) setError(err.message);
    else {
      setError("");
      setQuestions(data ?? []);
    }
  }, []);

  useEffect(() => {
    void load();
    getPlatformConfig().then(({ data }) => {
      if (data) setWriterOn((data.aiEnabledFeatures ?? []).includes("blog_writer"));
    });
  }, [load]);

  const retry = async (q: BlogQuestion) => {
    setRetrying(q.id);
    const { error: err } = await retryBlogQuestion(q.id);
    setRetrying(null);
    if (err) return setError(err.message);
    setError("");
    setNotice(`Back in the queue: "${q.question}".`);
    void load();
  };

  const upload = async (f: File) => {
    setUploading(true);
    setNotice("");
    const { data, error: err } = await learnFromSearchConsole(await f.text());
    setUploading(false);
    if (file.current) file.current.value = "";
    if (err) return setError(err.message);
    setError("");
    setNotice(
      `Queued ${data!.added} new questions from ${data!.pages.length} posts that get clicks (${data!.pages
        .map((p) => `${p.slug}: ${p.clicks}`)
        .join(", ")}).`
    );
    void load();
  };

  const count = (s: BlogQuestionStatus) => questions.filter((q) => q.status === s).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Blog queue"
        subtitle={`Questions the auto-blog writes up, 3 a day. ${count("QUEUED")} queued · ${count("PUBLISHED")} published · ${count("FAILED")} failed.`}
        actions={
          <>
            <input
              ref={file}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])}
            />
            <Button onClick={() => file.current?.click()} disabled={uploading}>
              <UploadSimple className="h-4 w-4" />
              {uploading ? "Reading…" : "Upload Search Console CSV"}
            </Button>
          </>
        }
      />

      <p className="text-sm text-muted-foreground">
        Weekly: in Search Console open Performance, then Pages, export, and upload the Pages.csv file.
        Posts that get clicks add 10 related questions to the queue.
      </p>

      {writerOn === false && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-foreground">
          The auto-blog writer is off, so queued questions fail with &quot;research: disabled&quot;. Turn on
          Auto-blog writer under{" "}
          <Link href="/dashboard/app-version" className="font-medium text-primary hover:underline">
            App version › AI features
          </Link>
          , then retry the failed ones.
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-2xl border border-success/30 bg-success/5 px-4 py-3 text-sm text-foreground">
          {notice}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : questions.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <EmptyState
              icon={ListChecks}
              title="No questions yet"
              description="The queue refills itself with 20 questions when it runs dry."
            />
          </CardContent>
        </Card>
      ) : (
        <div className="divide-y divide-border rounded-xl border border-border">
          {questions.map((q) => (
            <div key={q.id} className="flex flex-wrap items-start gap-3 p-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-foreground">{q.question}</p>
                  <Badge variant={BADGE[q.status]}>{q.status.toLowerCase()}</Badge>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {q.intent} · {q.topic} · {SOURCE[q.source]}
                  {q.appLink ? ` · links ${q.appLink}` : " · no app link"}
                </p>
                {q.failReason && <p className="mt-1 text-xs text-destructive">{q.failReason}</p>}
              </div>
              {q.status === "FAILED" && (
                <Button size="sm" variant="outline" onClick={() => void retry(q)} disabled={retrying !== null}>
                  {retrying === q.id ? "Retrying…" : "Retry"}
                </Button>
              )}
              {q.post && (
                <a
                  href={`https://unifesto.app/blog/${q.post.slug}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm font-medium text-primary hover:underline"
                >
                  View post
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
