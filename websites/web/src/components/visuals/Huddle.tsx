import { Microphone, VideoCamera, ChatCircle, PhoneDisconnect, Record, LockSimple, BellRinging } from "@unifesto/unicon/react";
import { Panel, panelRow, panelRows } from "@/components/visuals/Product";
import { Phone } from "@/components/visuals/AppScreens";

/* Unifesto Huddle fragments, drawn in HTML from the real model: a session
   setup (platform, format, price), the host's manage view, the attendee's
   in-app room, and the gated join. Decorative. */

const tile = "bg-[radial-gradient(120%_90%_at_80%_0%,rgb(var(--glow)/0.22),transparent_60%),linear-gradient(160deg,var(--sand),var(--night-2))]";

export function HuddleSetupVisual() {
  const rows: [string, string][] = [
    ["Hosted on", "Unifesto (in-app)"],
    ["Format", "Interactive"],
    ["Starts", "Thu, 23 Oct · 7:00 PM"],
    ["Duration", "60 min"],
    ["Price", "₹99"],
  ];
  return (
    <Panel title="New session · I&E Cell, MRU">
      <p className="text-[12px] text-paper">Pitch clinic: 10 decks, 10 minutes each</p>
      <div className={`mt-3 ${panelRows}`}>
        {rows.map(([k, v]) => (
          <div key={k} className={`${panelRow} py-2 text-[10px]`}>
            <span className="text-paper/50">{k}</span>
            <span className="text-paper">{v}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-1.5 text-[10px]">
        <span className="rounded-md bg-primary py-1.5 text-center text-black">Publish</span>
        <span className="rounded-md bg-white/[0.06] py-1.5 text-center text-paper/70">Save draft</span>
      </div>
    </Panel>
  );
}

export function HuddleHostVisual() {
  const cohosts: [string, string][] = [
    ["KV", "Karthik V."],
    ["SM", "Sneha M."],
  ];
  return (
    <Panel title="Manage session · Published">
      <div className="grid grid-cols-3 gap-4">
        {[["Registered", "148"], ["Paid", "₹14.6k"], ["Joined", "121"]].map(([l, v]) => (
          <div key={l}>
            <span className="block font-display tabular text-sm text-paper">{v}</span>
            <span className="block text-[8px] text-paper/50">{l}</span>
          </div>
        ))}
      </div>
      <p className="mt-3 border-t border-border pt-3 text-[10px] text-paper/50">Co-hosts</p>
      <div className="mt-1.5 flex gap-4">
        {cohosts.map(([i, n]) => (
          <span key={n} className="flex items-center gap-1.5 text-[10px] text-paper">
            <span className="grid h-4 w-4 place-items-center rounded-full bg-white/10 text-[7px]">{i}</span>
            {n}
          </span>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-1.5 text-[10px]">
        <span className="rounded-md bg-primary py-1.5 text-center text-black">Go live</span>
        <span className="flex items-center justify-center gap-1 rounded-md bg-white/[0.06] py-1.5 text-paper/70">
          <Record weight="fill" className="h-2.5 w-2.5 text-red-400" /> Record
        </span>
        <span className="rounded-md bg-white/[0.06] py-1.5 text-center text-paper/70">End</span>
      </div>
    </Panel>
  );
}

export function HuddleRoomScreen() {
  const people = ["Ananya R.", "Rahul K.", "Meera S.", "You"];
  return (
    <Phone>
      <p className="font-display text-sm text-paper">Pitch clinic</p>
      <p className="mt-0.5 text-[9px] text-paper/50">Live · 121 in the room</p>
      <div className={`mt-4 flex aspect-video items-end rounded-xl p-2 ${tile}`}>
        <span className="rounded bg-black/50 px-1.5 py-0.5 text-[8px] text-paper">Karthik V. · Host</span>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {people.map((n) => (
          <div key={n} className="flex aspect-[4/3] items-end rounded-lg bg-night-2 p-1.5">
            <span className="text-[8px] text-paper/70">{n}</span>
          </div>
        ))}
      </div>
      <div className="mt-4 flex justify-center gap-3">
        {[Microphone, VideoCamera, ChatCircle].map((I, k) => (
          <span key={k} className="grid h-8 w-8 place-items-center rounded-full bg-night-2 text-paper/80">
            <I className="h-3.5 w-3.5" />
          </span>
        ))}
        <span className="grid h-8 w-8 place-items-center rounded-full bg-red-500/90 text-paper">
          <PhoneDisconnect className="h-3.5 w-3.5" />
        </span>
      </div>
    </Phone>
  );
}

export function HuddleJoinVisual() {
  return (
    <Panel title="Your session">
      <div className="flex items-center justify-between pb-2">
        <span>
          <span className="block text-[12px] text-paper">Pitch clinic</span>
          <span className="block text-[9px] text-paper/50">Thu, 23 Oct · 7:00 PM · Paid</span>
        </span>
        <span className="flex items-center gap-1 text-[10px] text-paper/60">
          <LockSimple className="h-3 w-3" /> Opens 6:45 PM
        </span>
      </div>
      <div className={`border-t border-border text-[10px] ${panelRows}`}>
        {[["A day before", "Sent"], ["15 minutes before", "Scheduled"]].map(([when, state]) => (
          <div key={when} className={`${panelRow} py-2`}>
            <span className="flex items-center gap-1.5 text-paper/70">
              <BellRinging className="h-3 w-3" /> Reminder · {when}
            </span>
            <span className="text-paper">{state}</span>
          </div>
        ))}
      </div>
      <span className="mt-3 block rounded-md bg-primary py-1.5 text-center text-[10px] text-black">Join session</span>
    </Panel>
  );
}
