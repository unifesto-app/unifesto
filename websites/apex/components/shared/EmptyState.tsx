import type { Icon } from "@unifesto/unicon/react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

interface EmptyStateProps {
  icon: Icon;
  title: string;
  description?: ReactNode;
  /** Optional CTA (a Button, a Link) rendered beneath the copy. */
  action?: ReactNode;
  /**
   * 'neutral' for "nothing here yet" states, 'positive' for the encouraging
   * organiser first-run moments (green chip, per the design language).
   */
  tone?: "neutral" | "positive";
  className?: string;
}

/**
 * A teaching empty state — never a dead end. Explains what will appear here
 * and, where useful, offers the next step. Used for zero-result tables and
 * first-run surfaces alike.
 */
export function EmptyState({
  icon: IconCmp,
  title,
  description,
  action,
  tone = "neutral",
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 px-6 py-12 text-center",
        className
      )}
    >
      <span
        className={cn(
          "mb-2 grid h-12 w-12 place-items-center rounded-full",
          tone === "positive"
            ? "bg-success-soft text-success"
            : "bg-muted text-muted-foreground"
        )}
      >
        <IconCmp className="h-6 w-6" weight="duotone" />
      </span>
      <p className="text-base font-medium text-foreground">{title}</p>
      {description && (
        <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
