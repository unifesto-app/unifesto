import type { Icon } from "@unifesto/unicon/react";
import { TrendUp, TrendDown, Minus } from "@unifesto/unicon/react";
import Link from "next/link";
import { Card } from "@/console/components/ui/card";
import { Skeleton } from "@/console/components/ui/skeleton";
import { cn } from "@/console/lib/utils/cn";

interface StatCardTrend {
  /** Rendered value, e.g. "+12%" or "3 today". */
  label: string;
  /** Colours the pill: up = green, down = red, flat = neutral. */
  direction: "up" | "down" | "flat";
}

interface StatCardProps {
  title: string;
  value: string | number;
  hint?: string;
  icon: Icon;
  loading?: boolean;
  /** Tint the icon chip — 'brand' (blue) or 'success' (green, organiser). */
  tone?: "neutral" | "brand" | "success";
  /** Optional delta pill under the value (period-over-period, "N today", …). */
  trend?: StatCardTrend;
  /** When set, the whole tile becomes a link and lifts on hover. */
  href?: string;
}

const TREND_ICON = { up: TrendUp, down: TrendDown, flat: Minus } as const;

/**
 * A metric on an overview: the label with its icon small beside it, the
 * number below, then the trend and hint as plain text. No tile or icon chip:
 * a hairline on top, like every block. `tone` tints the icon only.
 */
export function StatCard({
  title,
  value,
  hint,
  icon: IconCmp,
  loading = false,
  tone = "neutral",
  trend,
  href,
}: StatCardProps) {
  const TrendIcon = trend ? TREND_ICON[trend.direction] : null;

  const body = (
    <Card
      className={cn(
        "flex h-full flex-col gap-3 pb-1 pt-4",
        href && "card-interactive cursor-pointer"
      )}
    >
      <div className="flex items-center gap-1.5">
        <IconCmp
          aria-hidden="true"
          className={cn("h-3.5 w-3.5 flex-shrink-0", tone === "success" ? "text-success" : "text-muted-foreground")}
        />
        <span className="text-eyebrow">{title}</span>
      </div>

      <div className="mt-auto">
        {loading ? (
          <Skeleton className="h-9 w-24" />
        ) : (
          <div className="font-display text-[1.75rem] leading-none tabular-nums tracking-tight text-foreground">
            {value}
          </div>
        )}

        <div className="mt-2 flex flex-wrap items-center gap-2">
          {trend && !loading && TrendIcon && (
            <span
              className={cn(
                "inline-flex items-center gap-1 text-xs font-medium",
                trend.direction === "up" && "text-success",
                trend.direction === "down" && "text-destructive",
                trend.direction === "flat" && "text-muted-foreground"
              )}
            >
              <TrendIcon className="h-3 w-3" weight="bold" />
              {trend.label}
            </span>
          )}
          {hint &&
            (loading ? (
              <Skeleton className="h-3 w-28" />
            ) : (
              <p className="text-xs text-muted-foreground">{hint}</p>
            ))}
        </div>
      </div>
    </Card>
  );

  return href ? (
    <Link href={href} className="block h-full focus-visible:outline-none">
      {body}
    </Link>
  ) : (
    body
  );
}
