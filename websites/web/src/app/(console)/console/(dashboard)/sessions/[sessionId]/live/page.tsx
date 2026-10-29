"use client";

import { useSpaceId } from "@/console/lib/hooks/useSpaceId";
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft } from "@unifesto/unicon/react";
import { LiveKitRoom, VideoConference } from "@livekit/components-react";
import "@livekit/components-styles";
import { joinSession } from "@/console/lib/api/sessions-api";
import { Button } from "@/console/components/ui/button";
import { ErrorNotice } from "@/console/components/shared/ErrorNotice";

/**
 * Organiser "go live" surface (web), powered by the LiveKit React SDK.
 *
 * We ask the backend for a join credential — for a live session that's a
 * per-user LiveKit **host** token (never a URL) plus the server URL — and hand
 * them to <LiveKitRoom>. Attendees join the same room on mobile with their own
 * tokens. Nothing shareable is ever exposed.
 */
export default function HostLiveSessionPage() {
  const params = useParams();
  const router = useRouter();
  const spaceId = useSpaceId();
  const sessionId = params.sessionId as string;

  const [conn, setConn] = useState<{ serverUrl: string; token: string } | null>(
    null,
  );
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const backToSession = useCallback(
    () => router.push(`/console/sessions/${sessionId}`),
    [router, spaceId, sessionId],
  );

  useEffect(() => {
    let active = true;
    (async () => {
      const { data, error } = await joinSession(sessionId);
      if (!active) return;
      if (error) {
        setError(error.message);
      } else if (data?.mode === "livekit") {
        setConn({ serverUrl: data.serverUrl, token: data.token });
      } else {
        setError(
          "This session is hosted on an external platform, not inside Unifesto.",
        );
      }
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [sessionId]);

  if (loading) {
    return (
      <div className="flex h-[70vh] items-center justify-center text-sm text-muted-foreground">
        Preparing your room…
      </div>
    );
  }

  if (error || !conn) {
    return (
      <div className="space-y-4">
        <Button variant="outline" onClick={backToSession}>
          <ArrowLeft className="h-4 w-4" />
          Back to session
        </Button>
        <ErrorNotice message={error || "Could not start the room."} />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black" data-lk-theme="default">
      <LiveKitRoom
        serverUrl={conn.serverUrl}
        token={conn.token}
        connect
        video
        audio
        onDisconnected={backToSession}
        style={{ height: "100dvh" }}
      >
        <VideoConference />
      </LiveKitRoom>
    </div>
  );
}
