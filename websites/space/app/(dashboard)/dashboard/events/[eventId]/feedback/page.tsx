"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  createFeedbackQuestion,
  deleteFeedbackQuestion,
  getFeedbackForm,
  setFeedbackEnabled,
  updateFeedbackQuestion,
  type FeedbackForm,
} from "@/lib/api/feedback";
import type { Result } from "@/lib/api/call";
import { FormFieldsManager, type QuestionStore } from "@/components/events/form-fields-manager";
import { PageHeader } from "@/components/shared/PageHeader";
import { ErrorNotice } from "@/components/shared/ErrorNotice";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/** Result → the `{ error }` shape FormFieldsManager expects. */
const asStore = async (p: Promise<Result<unknown>>) => {
  const r = await p;
  return { error: r.ok ? null : { message: r.message } };
};

/**
 * F1: the event's feedback form. Attendees always rate 1 to 5 and answer the
 * NPS question; curators can add their own questions after those.
 */
export default function EventFeedbackPage() {
  const eventId = useParams().eventId as string;
  const [form, setForm] = useState<FeedbackForm | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const r = await getFeedbackForm(eventId);
    if (r.ok) setForm(r.data);
    else setError(r.message);
  }, [eventId]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async (enabled: boolean) => {
    const r = await setFeedbackEnabled(eventId, enabled);
    if (r.ok) setForm(r.data);
    else setError(r.message);
  };

  const store: QuestionStore = {
    create: (b) => asStore(createFeedbackQuestion(eventId, { ...b, order: b.order ?? form?.questions.length ?? 0 })),
    update: (id, b) => asStore(updateFeedbackQuestion(eventId, id, b)),
    remove: (id) => asStore(deleteFeedbackQuestion(eventId, id)),
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Feedback"
        subtitle="Attendees rate the event in the app once it starts"
      />
      {error && <ErrorNotice message={error} />}
      {!form ? (
        <Skeleton className="h-48 w-full rounded-lg" />
      ) : (
        <>
          <Card>
            <CardContent className="flex items-start gap-3 p-4">
              <input
                id="feedback-enabled"
                type="checkbox"
                className="mt-1 h-4 w-4 accent-primary"
                checked={form.enabled}
                onChange={(e) => void toggle(e.target.checked)}
              />
              <label htmlFor="feedback-enabled" className="text-sm">
                <span className="font-medium text-foreground">Ask attendees for feedback</span>
                <span className="block text-muted-foreground">
                  Every form asks for a rating from 1 to 5 and how likely they are to recommend the
                  event (0 to 10), plus an optional comment. Each attendee answers once and can edit it.
                </span>
              </label>
            </CardContent>
          </Card>

          {form.enabled && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Extra questions</CardTitle>
              </CardHeader>
              <CardContent>
                <FormFieldsManager
                  eventId={eventId}
                  isGroup={false}
                  noFiles
                  fields={form.questions.map((q) => ({ ...q, perGroup: false }))}
                  store={store}
                  onChanged={load}
                />
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
