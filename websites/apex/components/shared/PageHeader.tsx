import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  /** One-line subtitle. Keep it a sentence, not a spec. */
  subtitle?: ReactNode;
  /** Right-aligned actions — a primary Button, filters, etc. */
  actions?: ReactNode;
}

/**
 * The consistent page title block used across every dashboard surface:
 * title left, action cluster right, subtitle beneath. No kicker above the
 * title; the breadcrumbs above the page already say where I am.
 * Nothing loud — hierarchy comes from size and colour, not weight.
 */
export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="font-display text-xl leading-snug text-foreground sm:text-2xl">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
