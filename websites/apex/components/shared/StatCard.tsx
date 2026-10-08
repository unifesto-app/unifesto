import type { Icon } from "@unifesto/unicon/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils/cn";

interface StatCardProps {
  title: string;
  value: string | number;
  hint?: string;
  icon: Icon;
  loading?: boolean;
  /** Tint the icon chip — 'brand' (blue) or 'success' (green, organiser). */
  tone?: "neutral" | "brand" | "success";
}

/** Compact metric tile used across both admin and organiser overviews. */
export function StatCard({
  title,
  value,
  hint,
  icon: IconCmp,
  loading = false,
  tone = "neutral",
}: StatCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <span
          className={cn(
            "grid h-8 w-8 place-items-center rounded-md",
            tone === "brand" && "bg-primary-soft text-primary",
            tone === "success" && "bg-success-soft text-success",
            tone === "neutral" && "bg-muted text-muted-foreground"
          )}
        >
          <IconCmp className="h-4 w-4" weight="duotone" />
        </span>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <div className="text-2xl font-semibold tracking-tight text-foreground">
            {value}
          </div>
        )}
        {hint &&
          (loading ? (
            <Skeleton className="mt-2 h-3 w-32" />
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
          ))}
      </CardContent>
    </Card>
  );
}
