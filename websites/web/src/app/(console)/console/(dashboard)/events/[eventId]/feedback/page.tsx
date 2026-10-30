"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  createFeedbackQuestion,
  deleteFeedbackQuestion,
  getFeedbackForm,
  setFeedbackSettings,
  updateFeedbackQuestion,
  type FeedbackForm,
} from "@/console/lib/api/feedback";
import type { Result } from "@/console/lib/api/call";
import { FormFieldsManager, type QuestionStore } from "@/console/components/events/form-fields-manager";
import { FeedbackResults } from "@/console/components/events/FeedbackResults";
import { PageHeader } from "@/console/components/shared/PageHeader";
import { ErrorNotice } from "@/console/components/shared/ErrorNotice";
import { Skeleton } from "@/console/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/console/components/ui/card";

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

  const toggle = async (patch: { enabled?: boolean; unlocksCertificate?: boolean; public?: boolean }) => {
    const r = await setFeedbackSettings(eventId, patch);
    if (r.ok) setForm(r.data);
    else setError(r.message);
  };

  const store: QuestionStore = {
    create: (b) => asStore(createFeedbackQuestion(eventId, { ...b, order: b.order ?? form?.questions.length ?? 0 })),
    update: (id, b) => asStore(updateFeedbackQuestion(eventId, id, b)),
    remove: (id) => asStore(deleteFeedbackQuestion(eventId, id)),
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Feedback"
        subtitle="Attendees rate the event in the app once it starts"
      />
      {error && <ErrorNotice message={error} />}
      {!form ? (
        <Skeleton className="h-48 w-full rounded-lg" />
      ) : (
        <>
          <FeedbackResults eventId={eventId} />

          <Card>
            <CardContent className="flex items-start gap-3 p-4">
              <input
                id="feedback-enabled"
                type="checkbox"
                className="mt-1 h-4 w-4 accent-primary"
                checked={form.enabled}
                onChange={(e) => void toggle({ enabled: e.target.checked })}
              />
              <label htmlFor="feedback-enabled" className="text-sm">
                <span className="font-medium text-foreground">Ask attendees for feedback</span>
                <span className="block text-muted-foreground">
                  Every form asks for a rating from 1 to 5 and how likely they are to recommend the
                  event (0 to 10), plus an optional comment. Each attendee answers once and can edit it.
                  Checked-in attendees get a push 2 hours after the event ends and a reminder at 48
                  hours. Feedback closes 7 days after the end.
                </span>
              </label>
            </CardContent>
            {form.enabled && (
              <CardContent className="flex items-start gap-3 border-t border-border p-4">
                <input
                  id="feedback-unlocks"
                  type="checkbox"
                  className="mt-1 h-4 w-4 accent-primary"
                  checked={form.unlocksCertificate}
                  onChange={(e) => void toggle({ unlocksCertificate: e.target.checked })}
                />
                <label htmlFor="feedback-unlocks" className="text-sm">
                  <span className="font-medium text-foreground">Feedback unlocks the certificate</span>
                  <span className="block text-muted-foreground">
                    An attendee&apos;s certificate is emailed and shown in the app only after they give
                    feedback.
                  </span>
                </label>
              </CardContent>
            )}
            {form.enabled && (
              <CardContent className="flex items-start gap-3 border-t border-border p-4">
                <input
                  id="feedback-public"
                  type="checkbox"
                  className="mt-1 h-4 w-4 accent-primary"
                  checked={form.public}
                  onChange={(e) => void toggle({ public: e.target.checked })}
                />
                <label htmlFor="feedback-public" className="text-sm">
                  <span className="font-medium text-foreground">Show the rating on the event page</span>
                  <span className="block text-muted-foreground">
                    The average and number of ratings appear publicly once at least 5 attendees have
                    rated. Comments and answers always stay private.
                  </span>
                </label>
              </CardContent>
            )}
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
