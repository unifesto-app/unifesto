"use client";

import { useSpaceId } from "@/console/lib/hooks/useSpaceId";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "@unifesto/unicon/react";
import { createSession } from "@/console/lib/api/sessions-api";
import { PageHeader } from "@/console/components/shared/PageHeader";
import { Button } from "@/console/components/ui/button";
import { SessionForm } from "../SessionForm";

export default function NewSessionPage() {
  const router = useRouter();
  const spaceId = useSpaceId();

  return (
    <div className="space-y-6">
      <PageHeader
        title="New session"
        subtitle="A quick online gathering — set it up in under a minute"
        actions={
          <Button
            variant="outline"
            onClick={() => router.push(`/console/sessions`)}
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        }
      />
      <SessionForm
        submitLabel="Create session"
        savingLabel="Creating…"
        onCancel={() => router.push(`/console/sessions`)}
        onSubmit={async (payload) => {
          const { data, error } = await createSession(spaceId, payload);
          if (error) return error.message;
          router.push(`/console/sessions/${data!.id}`);
          return null;
        }}
      />
    </div>
  );
}
