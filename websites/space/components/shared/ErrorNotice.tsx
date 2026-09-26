import { Card, CardContent } from "@/components/ui/card";

/**
 * An honest error card. States what went wrong in plain language; never a
 * raw stack trace, never a silent failure.
 */
export function ErrorNotice({ message }: { message: string }) {
  return (
    <Card className="border-destructive/30 bg-destructive-soft">
      <CardContent className="py-4">
        <p className="text-sm text-[hsl(358_65%_44%)]">{message}</p>
      </CardContent>
    </Card>
  );
}
