"use client";

import Link from "next/link";
import { cloneElement, isValidElement, useCallback, useEffect, useId, useRef, useState, type ReactElement, type ReactNode } from "react";
import { ArrowLeft } from "@unifesto/unicon/react";
import { PageHeader } from "@/console/components/shared/PageHeader";
import { ErrorNotice } from "@/console/components/shared/ErrorNotice";
import { Card } from "@/console/components/ui/card";
import { Label } from "@/console/components/ui/label";
import { Skeleton } from "@/console/components/ui/skeleton";
import { cn } from "@/console/lib/utils/cn";
import { useLayoutEvent } from "@/console/components/events/EventLayoutContext";
import type { Result } from "@/console/lib/api/call";

/*
 * Shared bits for the hackathon curator pages, the web side of mobile's
 * manage/event/[eventId]/hackathon/** screens.
 */

export const hackBase = (eventId: string) => `/dashboard/events/${eventId}/hackathon`;

/**
 * Load one Result-returning call; `reload` re-runs it. `denied` gets the
 * friendlier copy the mobile screens use.
 */
export function useResult<T>(fetcher: () => Promise<Result<T>>, deniedCopy = "You can't manage this event's hackathon.") {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  /** True after the first answer (data can legitimately be null). */
  const [loaded, setLoaded] = useState(false);
  const reload = useCallback(async () => {
    const res = await fetcher();
    setLoaded(true);
    if (res.ok) {
      setData(res.data);
      setError("");
    } else setError(res.denied ? deniedCopy : res.message);
    return res;
  }, [fetcher, deniedCopy]);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { data, setData, error, setError, reload, loaded };
}

/** Page frame: back link to the hub (or a parent), header, error, skeleton until `ready`. */
export function HackPage({
  eventId,
  back,
  title,
  subtitle,
  actions,
  error,
  ready,
  children,
}: {
  eventId: string;
  /** Defaults to the hackathon hub. */
  back?: { href: string; label: string } | null;
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  error?: string;
  ready: boolean;
  children?: ReactNode;
}) {
  const b = back === undefined ? { href: hackBase(eventId), label: "Hackathon" } : back;
  return (
    <div className="space-y-6">
      {b && (
        <Link href={b.href} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> {b.label}
        </Link>
      )}
      <PageHeader title={title} subtitle={subtitle} actions={actions} />
      {error && <ErrorNotice message={error} />}
      {ready ? children : !error && <Skeleton className="h-48 w-full" />}
    </div>
  );
}

/** Up to four headline numbers (mobile ManageStats). */
export function StatsRow({ stats }: { stats: { label: string; value: number | string }[] }) {
  return (
    <Card className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-4">
      {stats.map((s) => (
        <div key={s.label}>
          <p className="font-display text-2xl text-foreground">{s.value}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{s.label}</p>
        </div>
      ))}
    </Card>
  );
}

/** Single-select chips; `hint` of the chosen option shows beneath. */
export function Chips<V extends string>({
  options,
  value,
  onChange,
  disabled,
}: {
  options: { value: V; label: string; hint?: string }[];
  value: V | null;
  onChange: (v: V) => void;
  disabled?: boolean;
}) {
  const hint = options.find((o) => o.value === value)?.hint;
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            disabled={disabled}
            aria-pressed={o.value === value}
            onClick={() => onChange(o.value)}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-sm transition-colors disabled:opacity-50",
              o.value === value
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-foreground hover:bg-muted"
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
      {hint && <p className="mt-2 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Multi-select chips (mobile MultiChips). */
export function MultiChips({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = value.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            role="checkbox"
            aria-checked={on}
            onClick={() => onChange(on ? value.filter((v) => v !== o.value) : [...value, o.value])}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-sm transition-colors",
              on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground hover:bg-muted"
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** A labelled on/off switch with an optional hint. */
export function Toggle({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: ReactNode;
  hint?: ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className={cn("flex items-start justify-between gap-4", disabled && "opacity-50")}>
      <span className="min-w-0">
        <span className="block text-sm text-foreground">{label}</span>
        {hint && <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative mt-0.5 h-6 w-11 flex-shrink-0 rounded-full transition-colors",
          checked ? "bg-primary" : "bg-border-strong"
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-5 w-5 rounded-full bg-background transition-transform",
            checked ? "translate-x-[22px]" : "translate-x-0.5"
          )}
        />
      </button>
    </label>
  );
}

/**
 * Label + control + hint, stacked. Without `htmlFor`, a single control child
 * gets a generated id and the label points at it (B12: unlabelled inputs).
 */
export function Field({ label, hint, children, htmlFor }: { label: ReactNode; hint?: ReactNode; children: ReactNode; htmlFor?: string }) {
  const autoId = useId();
  const own = isValidElement<{ id?: string }>(children) && !children.props.id && !htmlFor;
  const control = own ? cloneElement(children as ReactElement<{ id?: string }>, { id: autoId }) : children;
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor ?? (own ? autoId : undefined)}>{label}</Label>
      {control}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** A form card: titled section of fields. */
export function FormCard({ title, description, children }: { title?: ReactNode; description?: ReactNode; children: ReactNode }) {
  return (
    <Card className="space-y-5 p-5">
      {(title || description) && (
        <div>
          {title && <h2 className="text-sm font-semibold text-foreground">{title}</h2>}
          {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
        </div>
      )}
      {children}
    </Card>
  );
}

/** Success line under an action. */
export function Notice({ message }: { message: string }) {
  if (!message) return null;
  return <p className="rounded-md border border-success/30 bg-success-soft px-3 py-2 text-sm text-success">{message}</p>;
}

/** `datetime-local` value ↔ ISO. */
export const toLocalInput = (iso: string | null | undefined) => {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
export const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);

/** A problem statement as a selectable card (mobile StatementCard). */
export function StatementCard({
  code,
  title,
  description,
  theme,
  note,
  selected,
  disabled,
  onClick,
}: {
  code?: string | null;
  title: string;
  description?: string | null;
  theme?: string | null;
  note?: string | null;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold text-foreground">
          {code && <span className="mr-2 font-mono text-xs text-muted-foreground">{code}</span>}
          {title}
        </p>
        {note && <span className="flex-shrink-0 text-xs text-muted-foreground">{note}</span>}
      </div>
      {theme && <p className="mt-1 text-xs text-muted-foreground">{theme}</p>}
      {description && <p className="mt-2 line-clamp-4 whitespace-pre-line text-sm text-muted-foreground">{description}</p>}
    </>
  );
  const cls = cn(
    "block w-full rounded-lg border bg-card p-4 text-left transition-colors",
    selected ? "border-primary ring-1 ring-primary" : "border-border",
    onClick && !disabled && "hover:bg-muted",
    disabled && "opacity-50"
  );
  return onClick ? (
    <button type="button" onClick={onClick} disabled={disabled} aria-pressed={selected} className={cls}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/**
 * False once the event is over (ended, completed or cancelled), so pages that
 * only matter while it runs stop polling (B12: queues and help desk kept
 * asking every 10 s days later). True while the event is still loading.
 */
export function useEventRunning(): boolean {
  const layout = useLayoutEvent();
  const [now] = useState(() => Date.now());
  const e = layout?.event;
  if (!e) return true;
  if (e.status === "COMPLETED" || e.status === "CANCELLED") return false;
  return new Date(e.endDateTime).getTime() > now;
}

/**
 * Keep a page live: re-run `onTick` every 10 s while the tab is visible and on
 * refocus. Mobile has a socket for this; the web has no socket.io client.
 * ponytail: polling, add the /leaderboard socket if curators need sub-10 s updates.
 */
export function useLivePoll(onTick: () => void, enabled = true) {
  const cb = useRef(onTick);
  useEffect(() => {
    cb.current = onTick;
  });
  useEffect(() => {
    if (!enabled) return;
    const tick = () => document.visibilityState === "visible" && cb.current();
    const id = setInterval(tick, 10_000);
    window.addEventListener("focus", tick);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", tick);
    };
  }, [enabled]);
}
