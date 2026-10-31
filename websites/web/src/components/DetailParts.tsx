"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { CaretRight } from "@unifesto/unicon/react";

/*
 * Building blocks shared by the public Event and Space pages. They mirror the
 * mobile app's cosmos detail screens: a hairline-ruled Section per block, a
 * horizontal Rail for posters, a raised facts card made of FactRows, and a
 * bottom ActionBar holding the one primary action.
 */

/** A titled block with a short silver rule above the title (mobile `Section`). */
export function Block({ title, subtitle, id, children }: {
  title: string;
  subtitle?: string;
  id?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="mt-14 scroll-mt-28">
      <div aria-hidden className="mb-5 h-px w-14 bg-paper/60" />
      <div className="mb-5 flex items-baseline justify-between gap-4">
        <h2 className="font-display text-lg text-paper">{title}</h2>
        {subtitle && <p className="shrink-0 text-xs text-paper/55">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

/** Horizontal, snap-scrolling row of fixed-width cards. */
export function Rail({ children }: { children: ReactNode }) {
  return (
    <div className="-mx-5 flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-2 [scrollbar-width:none] sm:-mx-8 sm:px-8 [&::-webkit-scrollbar]:hidden [&>*]:w-[78vw] [&>*]:max-w-[300px] [&>*]:shrink-0 [&>*]:snap-start">
      {children}
    </div>
  );
}

/** The raised card that holds FactRows / stats. */
export function Card({ className = "", children }: { className?: string; children: ReactNode }) {
  return <div className={`overflow-hidden rounded-3xl bg-night-2 ${className}`}>{children}</div>;
}

/** One line of a facts card: bare icon, title, optional quieter line. */
export function FactRow({ icon, title, sub, href, external, danger, trailing }: {
  icon: ReactNode;
  title: string;
  sub?: ReactNode;
  href?: string;
  external?: boolean;
  danger?: boolean;
  trailing?: ReactNode;
}) {
  const body = (
    <>
      <span className="grid w-14 shrink-0 place-items-center">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-[15px] font-semibold ${danger ? "text-red-400" : "text-paper"}`}>{title}</span>
        {sub && <span className="mt-0.5 block text-sm leading-snug text-paper/65">{sub}</span>}
      </span>
      {trailing ?? (href ? <CaretRight className="h-4 w-4 shrink-0 text-paper/45" aria-hidden /> : null)}
    </>
  );
  const cls = "flex items-center gap-4 border-t border-border px-4 py-4 first:border-t-0";
  if (!href) return <div className={cls}>{body}</div>;
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={`${cls} transition-colors hover:bg-paper/[0.04]`}>
        {body}
      </a>
    );
  }
  return (
    <Link href={href} className={`${cls} transition-colors hover:bg-paper/[0.04]`}>
      {body}
    </Link>
  );
}

/** Body copy clamped to six lines with a Read more toggle past ~240 chars. */
export function ReadMore({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 240;
  return (
    <div>
      <div className={`space-y-4 whitespace-pre-line text-[15px] leading-relaxed text-paper/75 ${long && !open ? "line-clamp-6" : ""}`}>
        {text}
      </div>
      {long && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="mt-3 text-sm font-semibold text-paper hover:underline"
        >
          {open ? "Show less" : "Read more"}
        </button>
      )}
    </div>
  );
}

/**
 * Bottom-anchored bar with the page's one primary action (mobile RegisterBar /
 * ActionBar): a small label over a large value on the left, the CTA on the right.
 * Pages add bottom padding so the footer is never covered.
 */
export function ActionBar({ label, value, children }: {
  label: string;
  value: string;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-canvas/85 backdrop-blur-xl">
      {/* pr-20 keeps the CTA clear of the floating support bubble. */}
      <div className="mx-auto flex max-w-3xl items-center gap-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pl-5 pr-20 sm:pl-8 sm:pr-24">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-paper/60">{label}</p>
          <p className="truncate font-display text-base text-paper sm:text-lg">{value}</p>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Rounded logo/avatar with an initial fallback. */
export function Avatar({ src, name, size = 44, round = false }: {
  src?: string | null;
  name: string;
  size?: number;
  round?: boolean;
}) {
  const radius = round ? "rounded-full" : "rounded-xl";
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt="" width={size} height={size} style={{ width: size, height: size }} className={`${radius} shrink-0 bg-night-3 object-cover`} />
    );
  }
  return (
    <span
      aria-hidden
      style={{ width: size, height: size }}
      className={`${radius} grid shrink-0 place-items-center bg-night-3 font-display text-sm text-paper/70`}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}
