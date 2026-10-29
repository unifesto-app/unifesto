import * as React from "react";
import { cn } from "@/console/lib/utils/cn";

type BadgeVariant =
  | "neutral"
  | "brand"
  | "success"
  | "warning"
  | "destructive"
  | "outline";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const variants: Record<BadgeVariant, string> = {
  neutral: "bg-muted text-muted-foreground border-border",
  brand: "bg-primary-soft text-primary border-primary/20",
  success:
    "bg-success-soft text-success border-success/25",
  warning:
    "bg-warning-soft text-warning border-warning/25",
  destructive:
    "bg-destructive-soft text-destructive border-destructive/25",
  outline: "bg-card text-foreground border-border",
};

/** Small status/label pill. Colour carries meaning; never blue-only for state. */
const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = "neutral", ...props }, ref) => (
    <span
      ref={ref}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        variants[variant],
        className
      )}
      {...props}
    />
  )
);
Badge.displayName = "Badge";

export { Badge };
