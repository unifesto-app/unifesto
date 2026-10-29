"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft } from "@unifesto/unicon/react";
import { useSpaceId } from "@/console/lib/hooks/useSpaceId";
import {
  getSpaceSessionById,
  updateSession,
  type Session,
} from "@/console/lib/api/sessions-api";
import { PageHeader } from "@/console/components/shared/PageHeader";
import { ErrorNotice } from "@/console/components/shared/ErrorNotice";
import { Button } from "@/console/components/ui/button";
import { Skeleton } from "@/console/components/ui/skeleton";
import { SessionForm } from "../../SessionForm";

export default function EditSessionPage() {
  const router = useRouter();
  const spaceId = useSpaceId();
  const sessionId = useParams().sessionId as string;
  const back = () => router.push(`/console/sessions/${sessionId}`);

  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!spaceId) return;
    void getSpaceSessionById(spaceId, sessionId).then(({ data, error }) => {
      if (error) setError(error.message);
      else setSession(data);
      setLoading(false);
    });
  }, [spaceId, sessionId]);

  const editable =
    session?.status === "DRAFT" || session?.status === "PUBLISHED";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Edit session"
        subtitle={
          session && session.registeredCount > 0
            ? `${session.registeredCount} registered. They keep what they paid; a new price applies to new sign-ups.`
            : undefined
        }
        actions={
          <Button variant="outline" onClick={back}>
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        }
      />
      {loading ? (
        <Skeleton className="h-96 w-full" />
      ) : !session || !editable ? (
        <ErrorNotice
          message={
            error ||
            (session ? "Finished sessions can't be edited." : "Session not found.")
          }
        />
      ) : (
        <SessionForm
          initial={session}
          submitLabel="Save changes"
          savingLabel="Saving…"
          onCancel={back}
          onSubmit={async (payload) => {
            const { error } = await updateSession(sessionId, {
              ...payload,
              // Blank capacity means unlimited, so clear it explicitly.
              capacity: payload.capacity ?? null,
            });
            if (error) return error.message;
            back();
            return null;
          }}
        />
      )}
    </div>
  );
}
