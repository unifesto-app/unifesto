import type { Icon } from "@phosphor-icons/react";
import { TrendUp, TrendDown, Minus } from "@phosphor-icons/react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils/cn";

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
 * Compact metric tile used across every overview. The number is the hero
 * (size + tracking carry the hierarchy, since only one font weight ships);
 * the label rides above as a quiet eyebrow, the icon as a tinted chip.
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
        "flex h-full flex-col gap-3 p-5",
        href && "card-interactive cursor-pointer"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-eyebrow">{title}</span>
        <span
          className={cn(
            "grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg",
            tone === "brand" && "bg-primary-soft text-primary",
            tone === "success" && "bg-success-soft text-success",
            tone === "neutral" && "bg-muted text-muted-foreground"
          )}
        >
          <IconCmp className="h-[18px] w-[18px]" weight="duotone" />
        </span>
      </div>

      <div className="mt-auto">
        {loading ? (
          <Skeleton className="h-9 w-24" />
        ) : (
          <div className="text-[1.75rem] font-semibold leading-none tracking-tight text-foreground">
            {value}
          </div>
        )}

        <div className="mt-2 flex flex-wrap items-center gap-2">
          {trend && !loading && TrendIcon && (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs font-medium",
                trend.direction === "up" && "bg-success-soft text-success",
                trend.direction === "down" && "bg-destructive-soft text-destructive",
                trend.direction === "flat" && "bg-muted text-muted-foreground"
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
