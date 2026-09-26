"use client";

import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { ScanSmiley, Check } from "@phosphor-icons/react";

/*
  The five pillar fragments, shared by the homepage PlatformShowcase and the
  /features chapters so both surfaces show the same honest product. Each is
  deliberately different in shape, so a stack of them never reads as one card
  template repeated. All accept an optional `reduce` prop; where a visual has
  its own motion it also reads prefers-reduced-motion directly.
*/

const ease = [0.22, 1, 0.36, 1] as const;

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="w-full max-w-sm rounded-xl border border-white/10 bg-[#101015] p-4 shadow-[0_30px_60px_-30px_rgba(0,0,0,0.9)]">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          {title}
        </span>
        <span className="flex gap-1" aria-hidden="true">
          <span className="h-1.5 w-1.5 rounded-full bg-white/15" />
          <span className="h-1.5 w-1.5 rounded-full bg-white/15" />
          <span className="h-1.5 w-1.5 rounded-full bg-primary/70" />
        </span>
      </div>
      {children}
    </div>
  );
}

/* Team: a roles × permission matrix mirroring the real inheritance. */
export function TeamVisual() {
  const roles = ["Admin", "Curator", "Co-Cur.", "Crew"] as const;
  const rows: { label: string; grant: boolean[] }[] = [
    { label: "Billing & money", grant: [true, false, false, false] },
    { label: "Publish event", grant: [true, true, false, false] },
    { label: "Edit event", grant: [true, true, true, false] },
    { label: "Scan the door", grant: [true, true, true, true] },
  ];
  return (
    <Panel title="Access matrix">
      <div className="grid grid-cols-[1fr_repeat(4,1.6rem)] items-center gap-x-1.5 gap-y-2">
        <span />
        {roles.map((r) => (
          <span
            key={r}
            className="text-center text-[9px] font-semibold uppercase tracking-tight text-slate-500"
          >
            {r}
          </span>
        ))}
        {rows.map((row) => (
          <RowCells key={row.label} label={row.label} grant={row.grant} />
        ))}
      </div>
    </Panel>
  );
}

function RowCells({ label, grant }: { label: string; grant: boolean[] }) {
  return (
    <>
      <span className="truncate text-[11px] font-medium text-slate-300">
        {label}
      </span>
      {grant.map((g, i) => (
        <span key={i} className="flex justify-center">
          <span
            className={`flex h-4 w-4 items-center justify-center rounded ${
              g ? "bg-primary/20 text-primary" : "bg-white/[0.04] text-transparent"
            }`}
            aria-hidden="true"
          >
            {g ? <Check weight="bold" className="h-2.5 w-2.5" /> : "·"}
          </span>
        </span>
      ))}
    </>
  );
}

/* Events: a big event nesting sub-events, with ticket lines beneath. */
export function EventsVisual() {
  return (
    <Panel title="Nav Nirman 4.0">
      <div className="space-y-1.5">
        <TreeRow depth={0} label="Nav Nirman 4.0" meta="Fest · 3 days" lead />
        <TreeRow depth={1} label="Hackathon" meta="Ticketed" />
        <TreeRow depth={1} label="Keynote night" meta="RSVP" />
        <TreeRow depth={2} label="Round 2 · Finals" meta="Sub-event" />
        <TreeRow depth={1} label="Workshop series" meta="Recurring" />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-white/10 pt-3">
        <TicketChip label="Early bird" price="₹199" />
        <TicketChip label="Regular" price="₹349" />
        <TicketChip label="Group of 4" price="₹1,099" />
        <TicketChip label="RSVP" price="Free" />
      </div>
    </Panel>
  );
}

function TreeRow({
  depth,
  label,
  meta,
  lead = false,
}: {
  depth: number;
  label: string;
  meta: string;
  lead?: boolean;
}) {
  return (
    <div
      className="flex items-center justify-between rounded-lg bg-white/[0.03] py-1.5 pr-2.5"
      style={{ paddingLeft: `${0.625 + depth * 0.85}rem` }}
    >
      <span className="flex items-center gap-2">
        {depth > 0 && (
          <span aria-hidden="true" className="text-slate-600">
            └
          </span>
        )}
        <span
          className={`text-[11px] ${lead ? "font-semibold text-white" : "font-medium text-slate-300"}`}
        >
          {label}
        </span>
      </span>
      <span className="text-[9px] font-medium uppercase tracking-wide text-slate-500">
        {meta}
      </span>
    </div>
  );
}

function TicketChip({ label, price }: { label: string; price: string }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-white/10 bg-white/[0.02] px-2 py-1.5">
      <span className="text-[10px] font-medium text-slate-300">{label}</span>
      <span className="text-[10px] font-semibold text-primary">{price}</span>
    </div>
  );
}

/* Door: a live counter and the multi-gate list. QR, not face. */
export function DoorVisual() {
  const reduce = useReducedMotion();
  return (
    <Panel title="Live check-in">
      <div className="mb-3 flex items-baseline gap-2">
        <span className="font-agrandir text-3xl font-bold tabular-nums text-white">
          387
        </span>
        <span className="text-[11px] text-slate-500">/ 400 checked in</span>
      </div>
      <div className="mb-4 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
        <motion.div
          className="h-full rounded-full bg-primary"
          initial={reduce ? false : { width: "0%" }}
          whileInView={{ width: "96.75%" }}
          viewport={{ once: true }}
          transition={{ duration: reduce ? 0 : 1.1, ease }}
        />
      </div>
      <div className="space-y-1.5">
        <GateRow name="Main entrance" count="241" live />
        <GateRow name="Speaker lounge" count="86" />
        <GateRow name="Workshop hall" count="60" />
      </div>
    </Panel>
  );
}

function GateRow({
  name,
  count,
  live = false,
}: {
  name: string;
  count: string;
  live?: boolean;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-white/[0.03] px-2.5 py-1.5">
      <span className="flex items-center gap-2 text-[11px] font-medium text-slate-300">
        <ScanSmiley aria-hidden="true" className="h-3.5 w-3.5 text-slate-500" />
        {name}
      </span>
      <span className="flex items-center gap-1.5">
        {live && (
          <span aria-hidden="true" className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/70" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
          </span>
        )}
        <span className="text-[11px] font-semibold tabular-nums text-white">
          {count}
        </span>
      </span>
    </div>
  );
}

/* Money: a cash-accurate roll-up that reconciles to net. */
export function MoneyVisual() {
  const lines: { label: string; value: string; tone?: "neg" }[] = [
    { label: "Collected", value: "₹1,42,650" },
    { label: "Processing fee", value: "−₹4,280", tone: "neg" },
    { label: "Refunds", value: "−₹2,097", tone: "neg" },
  ];
  return (
    <Panel title="Financials · settled">
      <div className="space-y-2">
        {lines.map((l) => (
          <div
            key={l.label}
            className="flex items-center justify-between border-b border-white/[0.06] pb-2"
          >
            <span className="text-[11px] font-medium text-slate-400">
              {l.label}
            </span>
            <span
              className={`text-[12px] font-semibold tabular-nums ${
                l.tone === "neg" ? "text-slate-400" : "text-slate-200"
              }`}
            >
              {l.value}
            </span>
          </div>
        ))}
        <div className="flex items-center justify-between pt-1">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-primary">
            Net payout
          </span>
          <span className="font-agrandir text-lg font-bold tabular-nums text-white">
            ₹1,36,273
          </span>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-1.5 rounded-md bg-primary/[0.08] px-2.5 py-1.5">
        <Check aria-hidden="true" weight="bold" className="h-3 w-3 text-primary" />
        <span className="text-[10px] font-medium text-slate-300">
          Reconciled to the rupee
        </span>
      </div>
    </Panel>
  );
}

/* Grow: after-event surfaces and channels as distinct chips. */
export function GrowVisual() {
  return (
    <Panel title="After the event">
      <div className="space-y-2.5">
        <GrowRow label="Certificates issued" value="312" sub="publicly verifiable" />
        <GrowRow label="Leaderboard" value="Finals" sub="rubric · 6 judges" />
        <GrowRow label="Sponsor leads" value="48" sub="booth scan + inquiry" />
      </div>
      <div className="mt-3 border-t border-white/10 pt-3">
        <span className="mb-2 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          Follow-up sent via
        </span>
        <div className="flex flex-wrap gap-1.5">
          {["Email · A/B", "WhatsApp", "Push", "PDF report"].map((c) => (
            <span
              key={c}
              className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[10px] font-medium text-slate-300"
            >
              {c}
            </span>
          ))}
        </div>
      </div>
    </Panel>
  );
}

function GrowRow({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-white/[0.03] px-2.5 py-2">
      <span className="flex flex-col">
        <span className="text-[11px] font-medium text-slate-300">{label}</span>
        <span className="text-[9px] text-slate-500">{sub}</span>
      </span>
      <span className="text-sm font-semibold tabular-nums text-primary">
        {value}
      </span>
    </div>
  );
}
