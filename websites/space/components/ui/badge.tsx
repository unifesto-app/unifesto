import * as React from "react";
import { cn } from "@/lib/utils/cn";

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
    "bg-success-soft text-[hsl(142_71%_29%)] border-[hsl(142_71%_45%/0.25)]",
  warning:
    "bg-warning-soft text-[hsl(32_95%_34%)] border-[hsl(32_95%_44%/0.25)]",
  destructive:
    "bg-destructive-soft text-[hsl(358_65%_44%)] border-[hsl(358_75%_59%/0.25)]",
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
