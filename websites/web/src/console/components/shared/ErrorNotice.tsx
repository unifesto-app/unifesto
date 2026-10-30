import { Card, CardContent } from "@/console/components/ui/card";

/**
 * An honest error card. States what went wrong in plain language; never a
 * raw stack trace, never a silent failure.
 */
export function ErrorNotice({ message }: { message: string }) {
  return (
    <Card className="rounded-2xl border border-destructive/30 bg-destructive-soft px-4">
      <CardContent className="py-4">
        <p className="text-sm text-destructive">{message}</p>
      </CardContent>
    </Card>
  );
}
