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
  neutral: "text-muted-foreground",
  brand: "text-foreground",
  success: "text-success",
  warning: "text-warning",
  destructive: "text-destructive",
  outline: "text-foreground",
};

/**
 * An API enum shown as text (PUBLISHED, IN_REVIEW) reads as words (Published,
 * In review), so pages can pass statuses straight through. Acronyms of three
 * letters or fewer (VIP, QR) are left alone.
 */
const asWords = (child: React.ReactNode) =>
  typeof child === "string" && /^[A-Z][A-Z_]{3,}$/.test(child)
    ? child.charAt(0) + child.slice(1).toLowerCase().replace(/_/g, " ")
    : child;

/**
 * A status or label as plain coloured text, not a pill (no fill, no border).
 * Colour carries meaning, and the words always say it too.
 */
const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = "neutral", children, ...props }, ref) => (
    <span
      ref={ref}
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium",
        variants[variant],
        className
      )}
      {...props}
    >
      {React.Children.map(children, asWords)}
    </span>
  )
);
Badge.displayName = "Badge";

export { Badge };
