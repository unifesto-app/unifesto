import type { Icon } from "@unifesto/unicon/react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils/cn";

interface StatCardProps {
  title: string;
  value: string | number;
  hint?: string;
  icon: Icon;
  loading?: boolean;
  /** Tints the icon: 'success' green; 'brand' and 'neutral' stay muted. */
  tone?: "neutral" | "brand" | "success";
}

/**
 * A metric on an overview: the label with its icon small beside it, the
 * number below, then the hint. No tile or icon chip: a hairline on top,
 * like every block (the console's StatCard, without its trend and link).
 */
export function StatCard({
  title,
  value,
  hint,
  icon: IconCmp,
  loading = false,
  tone = "neutral",
}: StatCardProps) {
  return (
    <Card className="flex h-full flex-col gap-3 pb-1 pt-4">
      <div className="flex items-center gap-1.5">
        <IconCmp
          aria-hidden="true"
          className={cn("h-3.5 w-3.5 flex-shrink-0", tone === "success" ? "text-success" : "text-muted-foreground")}
        />
        <span className="text-eyebrow">{title}</span>
      </div>
      <div className="mt-auto">
        {loading ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <div className="font-display text-[1.75rem] leading-none tabular-nums tracking-tight text-foreground">
            {value}
          </div>
        )}
        {hint &&
          (loading ? (
            <Skeleton className="mt-2 h-3 w-32" />
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">{hint}</p>
          ))}
      </div>
    </Card>
  );
}
