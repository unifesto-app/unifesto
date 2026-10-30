"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { Button } from "@/console/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/console/components/ui/card";

/** Any page that throws lands here, reported to Sentry, with a retry. */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <CardTitle>Something went wrong</CardTitle>
          <CardDescription>We couldn&apos;t load this page. Try again in a moment.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4">
          <Button onClick={reset}>Try again</Button>
          {error.digest && <p className="font-mono text-xs text-muted-foreground">Ref {error.digest}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
