import { DownloadQr } from "@/components/visuals/DownloadQr";
import type { ReactNode } from "react";
import { SpaceScreen } from "@/components/visuals/AppScreens";
import { Check, ScanSmiley, WhatsappLogo, Link as LinkIcon, Certificate, Handshake, FilePdf, Bed } from "@unifesto/unicon/react";

/* Product fragments for the organiser platform, rebuilt in HTML so they
   cost no image bytes, stay sharp at any density and never shift layout.
   Server components: no client JS. Figures are illustrative but every
   control shown exists in the product. Decorative to assistive tech: the
   neighbouring copy carries the meaning. */

export function Panel({ title, children, className = "" }: { title: string; children: ReactNode; className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`w-full max-w-sm rounded-xl bg-night-2 p-4 shadow-[inset_0_0_0_1px_rgb(var(--glow)/0.08),0_30px_60px_-30px_rgba(0,0,0,0.9)] ${className}`}
    >
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[11px] font-medium text-paper/60">{title}</span>
        <span className="flex gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-white/15" />
          <span className="h-1.5 w-1.5 rounded-full bg-white/15" />
          <span className="h-1.5 w-1.5 rounded-full bg-primary/70" />
        </span>
      </div>
      {children}
    </div>
  );
}

const row = "flex items-center justify-between rounded-md bg-night-3 px-2.5 py-1.5";

/* Tickets: a fest nesting sub-events, with its ticket types. */
export function TicketsVisual() {
  const tree: [number, string, string][] = [
    [0, "Nav Nirman 4.0", "Fest · 3 days"],
    [1, "Hackathon", "Group · 4 seats"],
    [1, "Keynote night", "Free RSVP"],
    [1, "Workshop series", "Recurring"],
  ];
  const tickets: [string, string, string][] = [
    ["Early bird", "₹199", "Sold out"],
    ["Regular", "₹349", "212 left"],
    ["Team of 4", "₹1,099", "38 left"],
  ];
  return (
    <Panel title="Event builder">
      <div className="space-y-1.5">
        {tree.map(([d, label, meta]) => (
          <div key={label} className={row} style={{ paddingLeft: `${0.625 + d * 0.9}rem` }}>
            <span className={`text-[11px] ${d === 0 ? "text-paper" : "text-paper/75"}`}>
              {d > 0 && <span className="mr-1.5 text-paper/35">└</span>}
              {label}
            </span>
            <span className="text-[9px] text-paper/55">{meta}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 space-y-1.5 pt-3 shadow-[inset_0_1px_0_rgb(var(--glow)/0.08)]">
        {tickets.map(([name, price, left]) => (
          <div key={name} className="flex items-center justify-between text-[11px]">
            <span className="text-paper/75">{name}</span>
            <span className="flex items-center gap-3">
              <span className="text-[9px] text-paper/45">{left}</span>
              <span className="tabular w-12 text-right text-paper">{price}</span>
            </span>
          </div>
        ))}
        <div className="flex items-center justify-between rounded-md bg-sky/[0.08] px-2.5 py-1.5 text-[10px]">
          <span className="text-paper/75">Coupon FRESHERS20</span>
          <span className="text-sky">−20%</span>
        </div>
      </div>
    </Panel>
  );
}

/* Check-in: live count and the multi-point list. QR, not face. */
export function DoorVisual() {
  const points: [string, string, boolean][] = [
    ["Main gate", "241", true],
    ["Lunch", "198", false],
    ["Kit collection", "176", false],
  ];
  return (
    <Panel title="Live check-in">
      <div className="mb-3 flex items-baseline gap-2">
        <span className="font-display tabular text-2xl text-paper">387</span>
        <span className="text-[11px] text-paper/55">of 412 checked in</span>
      </div>
      <div className="mb-4 h-1 w-full overflow-hidden rounded-full bg-white/[0.06]">
        <div data-reveal="fill" className="h-full origin-left rounded-full bg-mint" style={{ transform: "scaleX(0.94)" }} />
      </div>
      <div className="space-y-1.5">
        {points.map(([name, count, live]) => (
          <div key={name} className={row}>
            <span className="flex items-center gap-2 text-[11px] text-paper/75">
              <ScanSmiley className="h-3.5 w-3.5 text-paper/55" />
              {name}
            </span>
            <span className="flex items-center gap-1.5">
              {live && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-mint" />}
              <span className="tabular text-[11px] text-paper">{count}</span>
            </span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

/* Money: a cash-accurate roll-up that reconciles to net. */
export function MoneyVisual() {
  const lines: [string, string][] = [
    ["Collected", "₹1,42,650"],
    ["Platform fee", "−₹2,140"],
    ["Refunds", "−₹2,097"],
  ];
  return (
    <Panel title="Financials · Nav Nirman 4.0">
      <div className="space-y-2">
        {lines.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between pb-2 shadow-[inset_0_-1px_0_rgb(var(--glow)/0.06)]">
            <span className="text-[11px] text-paper/65">{label}</span>
            <span className="tabular text-[12px] text-paper/85">{value}</span>
          </div>
        ))}
        <div className="flex items-center justify-between pt-1">
          <span className="text-[11px] text-paper">Net payout</span>
          <span className="font-display tabular text-base text-paper">₹1,38,413</span>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-1.5 rounded-md bg-ivory/[0.08] px-2.5 py-1.5">
        <Check weight="bold" className="h-3 w-3 text-ivory" />
        <span className="text-[10px] text-paper/75">Paid to HDFC ····4821</span>
      </div>
    </Panel>
  );
}

/* Reach: the WhatsApp confirmation and which links brought people in. */
export function ReachVisual() {
  const sources: [string, number][] = [
    ["Instagram bio", 46],
    ["WhatsApp group", 31],
    ["Partner: ECell", 15],
  ];
  return (
    <Panel title="Reach">
      <div className="rounded-lg bg-night-3 p-3">
        <div className="mb-1.5 flex items-center gap-1.5 text-[10px] text-paper/55">
          <WhatsappLogo weight="fill" className="h-3.5 w-3.5 text-paper/70" />
          Unifesto · now
        </div>
        <p className="text-[11px] leading-relaxed text-paper/85">
          You are in for Hack League 2026. Your pass is in the app. Join the team group: chat.whatsapp.com/…
        </p>
      </div>
      <div className="mt-3 space-y-2">
        {sources.map(([name, pct]) => (
          <div key={name}>
            <div className="mb-1 flex justify-between text-[10px]">
              <span className="flex items-center gap-1.5 text-paper/70">
                <LinkIcon className="h-3 w-3" />
                {name}
              </span>
              <span className="tabular text-paper">{pct}%</span>
            </div>
            <div className="h-1 rounded-full bg-white/[0.06]">
              <div data-reveal="fill" className="h-full origin-left rounded-full bg-paper/60" style={{ transform: `scaleX(${pct / 100})` }} />
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

/* After: certificates, sponsor leads, report, stays. */
export function AfterVisual() {
  const rows = [
    { icon: Certificate, label: "Certificates issued", value: "312" },
    { icon: Handshake, label: "Sponsor leads", value: "48" },
    { icon: Bed, label: "Stay check-ins", value: "64" },
    { icon: FilePdf, label: "Event report", value: "PDF" },
  ];
  return (
    <Panel title="After the event">
      <div className="space-y-1.5">
        {rows.map(({ icon: Icon, label, value }) => (
          <div key={label} className={`${row} py-2`}>
            <span className="flex items-center gap-2 text-[11px] text-paper/75">
              <Icon className="h-3.5 w-3.5 text-paper/55" />
              {label}
            </span>
            <span className="tabular text-sm text-paper">{value}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

/* QR scan from the Crew's phone. The sweep loops (eases both ways). */
export function ScanVisual() {
  return (
    <Panel title="Scanner · Main gate">
      <div className="relative overflow-hidden rounded-lg bg-night">
        <svg viewBox="0 0 200 112" className="aspect-[16/9] h-auto w-full">
          <DownloadQr x="72" y="20" width="56" height="56" />
          <rect className="scan-sweep fill-mint" x="70" y="20" width="60" height="2" />
        </svg>
      </div>
      <div className="mt-2.5 flex items-center justify-between text-[11px]">
        <span className="text-paper">Ananya R. · Team of 4</span>
        <span className="flex items-center gap-1 text-mint">
          <Check weight="bold" className="h-3 w-3" /> Checked in
        </span>
      </div>
    </Panel>
  );
}

export const PILLAR_VISUALS: Record<string, () => ReactNode> = {
  spaces: SpaceScreen,
  tickets: TicketsVisual,
  door: DoorVisual,
  money: MoneyVisual,
  reach: ReachVisual,
  after: AfterVisual,
};
