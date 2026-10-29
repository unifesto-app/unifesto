import Link from "next/link";
import type { ReactNode } from "react";
import { CaretRight } from "@unifesto/unicon/react";
import { Card } from "@/console/components/ui/card";
import { cn } from "@/console/lib/utils/cn";

/**
 * A titled card of rows, the web twin of mobile's SettingsGroup. Used by the
 * screens ported from mobile (tracking, hackathon) so they read the same.
 */
export function ListGroup({
  title,
  description,
  action,
  children,
  className,
}: {
  title?: ReactNode;
  description?: ReactNode;
  /** Right of the title: a small Button or link. */
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={className}>
      {(title || action) && (
        <div className="mb-2 flex items-end justify-between gap-3 px-1">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-semibold text-foreground">{title}</h2>}
            {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
          </div>
          {action}
        </div>
      )}
      <Card className="divide-y divide-border overflow-hidden">{children}</Card>
    </section>
  );
}

/**
 * One row: optional leading icon, label (+ sublabel), value on the right. With
 * `href` it's a link, with `onClick` a button, otherwise static.
 */
export function ListRow({
  icon,
  label,
  sublabel,
  value,
  trailing,
  href,
  onClick,
  disabled,
  destructive,
}: {
  icon?: ReactNode;
  label: ReactNode;
  sublabel?: ReactNode;
  value?: ReactNode;
  trailing?: ReactNode;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  destructive?: boolean;
}) {
  const interactive = !!(href || onClick);
  const body = (
    <>
      {icon && <span className="flex-shrink-0 text-foreground">{icon}</span>}
      <span className="min-w-0 flex-1">
        {/* Wrap on phones (long team names), one line from sm up. */}
        <span className={cn("block break-words text-sm sm:truncate", destructive ? "text-destructive" : "text-foreground")}>
          {label}
        </span>
        {sublabel && <span className="mt-0.5 block truncate text-xs text-muted-foreground">{sublabel}</span>}
      </span>
      {value != null && <span className="flex-shrink-0 text-sm tabular-nums text-muted-foreground">{value}</span>}
      {trailing ?? (interactive && href ? <CaretRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" /> : null)}
    </>
  );
  const cls = cn(
    "flex w-full items-center gap-3 px-4 py-3 text-left",
    interactive && "transition-colors hover:bg-muted",
    disabled && "pointer-events-none opacity-50"
  );
  if (href) {
    return (
      <Link href={href} className={cls}>
        {body}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} disabled={disabled} className={cls}>
        {body}
      </button>
    );
  }
  return <div className={cls}>{body}</div>;
}
