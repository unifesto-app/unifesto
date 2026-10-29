import { DownloadQr } from "@/components/visuals/DownloadQr";
import type { ReactNode } from "react";
import { MagnifyingGlass, House, Ticket, UsersThree, User, CalendarPlus, ShareNetwork, WhatsappLogo, Bed, VideoCamera, Certificate, Scan, Receipt, Bank, CaretRight, Plus, CellSignalFull, WifiHigh, BatteryFull } from "@unifesto/unicon/react";

/* The attendee app, drawn in HTML: a phone frame around real screens
   (Home feed, a ticket pass, the event-adjacent extras). No image bytes,
   no client JS. Decorative; the copy beside each phone carries meaning. */

/* iPhone 17 Pro: 402×874pt display, titanium band, Dynamic Island, side
   keys (Action + volume left; side + Camera Control right). Hardware colours
   are literal on purpose; they are the device, not the theme. */
const metal = "bg-[linear-gradient(145deg,#8a8d93,#3b3e44_18%,#1c1d21_45%,#2c2e33_70%,#7d8087)]";
const key = `absolute w-[3px] ${metal}`;

export function Phone({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div aria-hidden="true" className={`relative mx-auto w-[15.5rem] ${className}`}>
      <span className={`${key} -left-[2px] top-[5.2rem] h-5 rounded-l-sm`} />
      <span className={`${key} -left-[2px] top-[7.4rem] h-9 rounded-l-sm`} />
      <span className={`${key} -left-[2px] top-[10.2rem] h-9 rounded-l-sm`} />
      <span className={`${key} -right-[2px] top-[8rem] h-14 rounded-r-sm`} />
      <span className={`${key} -right-[1px] top-[17.5rem] h-8 rounded-r-sm opacity-70`} />
      <div className={`rounded-[2.65rem] p-[3px] ${metal} shadow-[0_40px_80px_-30px_rgb(var(--glow)/0.18)]`}>
        <div className="rounded-[2.5rem] bg-black p-[6px] shadow-[inset_0_0_0_1px_rgb(255_255_255/0.06)]">
          {/* Night by night, paper by day: the white cards stand off it (bg-black flips to white). */}
          <div className="phone-screen relative flex aspect-[402/874] flex-col overflow-hidden rounded-[2.15rem] bg-night">
            <StatusBar />
            <div className="flex-1 overflow-hidden px-4 pt-2">{children}</div>
            <TabBar />
            <div className="mx-auto mb-1.5 h-1 w-24 rounded-full bg-paper/70" />
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusBar() {
  return (
    <div className="relative flex h-9 shrink-0 items-center justify-between px-6 pt-1 text-[10px] font-semibold text-paper">
      <span>9:41</span>
      <span className="absolute left-1/2 top-[9px] flex h-[22px] w-[74px] -translate-x-1/2 items-center justify-end rounded-full bg-[#000] pr-2 ring-1 ring-white/[0.04]">
        <span className="h-2 w-2 rounded-full bg-[radial-gradient(circle_at_35%_35%,#2b3550,#07080c_70%)]" />
      </span>
      <span className="flex items-center gap-1">
        <CellSignalFull weight="fill" className="h-3 w-3" />
        <WifiHigh weight="bold" className="h-3 w-3" />
        <BatteryFull weight="fill" className="h-3.5 w-3.5" />
      </span>
    </div>
  );
}

function TabBar() {
  const tabs = [House, Ticket, UsersThree, User];
  return (
    <div className="mx-4 mb-3 flex justify-around rounded-full bg-night-2 py-2.5">
      {tabs.map((Icon, i) => (
        <Icon key={i} weight={i === 0 ? "fill" : "regular"} className={`h-4 w-4 ${i === 0 ? "text-paper" : "text-paper/45"}`} />
      ))}
    </div>
  );
}

const cover = "bg-[radial-gradient(120%_90%_at_80%_0%,rgb(var(--glow)/0.22),transparent_60%),linear-gradient(160deg,var(--sand),var(--night-2))]";

/* Home: search, categories, a 4:3 hero card and the up-next rail. */
export function FeedScreen() {
  return (
    <Phone>
      <p className="font-display text-sm text-paper">Discover</p>
      <div className="mt-3 flex items-center gap-2 rounded-full bg-night-2 px-3 py-2 text-[10px] text-paper/45">
        <MagnifyingGlass className="h-3 w-3" /> Search events, Spaces
      </div>
      <div className="mt-3 flex gap-1.5">
        {["Tech", "Fests", "Music", "Sports"].map((c, i) => (
          <span key={c} className={`rounded-full px-2.5 py-1 text-[9px] ${i === 0 ? "bg-primary text-black" : "bg-night-2 text-paper/65"}`}>{c}</span>
        ))}
      </div>
      <div className={`mt-4 aspect-[4/3] rounded-xl ${cover}`} />
      <p className="mt-2 text-[11px] text-paper">Hack League 2026</p>
      <p className="text-[9px] text-paper/50">Sat, 18 Oct · MRU, Hyderabad · From ₹199</p>
      <p className="mt-4 text-[10px] text-paper/60">Up next</p>
      <div className="mt-2 flex gap-2">
        {["ESummit", "MUN"].map((n) => (
          <div key={n} className="flex-1">
            <div className={`aspect-[4/3] rounded-lg ${cover} opacity-70`} />
            <p className="mt-1 text-[9px] text-paper/70">{n}</p>
          </div>
        ))}
      </div>
    </Phone>
  );
}

/* Ticket: the pass with its QR and the actions around it. */
export function PassScreen() {
  return (
    <Phone>
      <p className="font-display text-sm text-paper">My tickets</p>
      <div className="mt-4 rounded-2xl bg-night-2 p-4">
        <p className="text-[12px] text-paper">Hack League 2026</p>
        <p className="mt-0.5 text-[9px] text-paper/55">Sat, 18 Oct · 9:00 AM · Main Auditorium</p>
        <div className="my-4 flex justify-center">
          <DownloadQr className="h-[5.5rem] w-[5.5rem]" />
        </div>
        <div className="flex justify-between text-[9px]">
          <span className="text-paper/55">Team Byte Me · Seat 2 of 4</span>
          <span className="text-sky">Confirmed</span>
        </div>
      </div>
      <div className="mt-3 space-y-1.5">
        {[
          [CalendarPlus, "Add to calendar"],
          [WhatsappLogo, "Join the WhatsApp group"],
          [ShareNetwork, "Share I'm going"],
        ].map(([Icon, label]) => {
          const I = Icon as typeof CalendarPlus;
          return (
            <div key={label as string} className="flex items-center gap-2 rounded-lg bg-night-2 px-3 py-2 text-[10px] text-paper/75">
              <I className="h-3.5 w-3.5" /> {label as string}
            </div>
          );
        })}
      </div>
    </Phone>
  );
}

/* Extras: stay pass, live session, certificates. */
export function ExtrasScreen() {
  const items = [
    { icon: Bed, title: "Stay · Boys hostel, Block C", meta: "2 nights · pass ready" },
    { icon: VideoCamera, title: "Live: Pitch clinic", meta: "Online · starts in 12 min" },
    { icon: Certificate, title: "Certificate of merit", meta: "Verifiable link" },
  ];
  return (
    <Phone>
      <p className="font-display text-sm text-paper">For this event</p>
      <div className="mt-4 space-y-2">
        {items.map(({ icon: Icon, title, meta }) => (
          <div key={title} className="flex items-start gap-3 rounded-xl bg-night-2 p-3">
            <Icon className="mt-0.5 h-4 w-4 shrink-0 text-paper/70" />
            <div>
              <p className="text-[11px] text-paper">{title}</p>
              <p className="text-[9px] text-paper/50">{meta}</p>
            </div>
          </div>
        ))}
      </div>
      <div className={`mt-4 aspect-[4/3] rounded-xl ${cover} opacity-80`} />
    </Phone>
  );
}

/* Organiser side: the app's Manage event screen (same labels as
   mobile/src/screens/ManageEventScreen): live stats, then the actions
   that run the day. */
export function ManageScreen() {
  const stats: [string, string][] = [
    ["Attending", "412"],
    ["Checked in", "387"],
    ["Seats left", "38"],
  ];
  const actions = [
    { icon: Scan, label: "Scan tickets" },
    { icon: UsersThree, label: "Attendees" },
    { icon: Receipt, label: "Transactions" },
    { icon: Bank, label: "Request payout" },
    { icon: WhatsappLogo, label: "WhatsApp group" },
  ];
  return (
    <Phone>
      <p className="text-[10px] text-paper/50">Manage event</p>
      <p className="font-display text-sm text-paper">Nav Nirman 4.0</p>
      <p className="mt-0.5 text-[9px] text-paper/50">Sat, 18 Oct · Live now</p>
      <div className="mt-4 grid grid-cols-3 gap-1.5">
        {stats.map(([label, value]) => (
          <div key={label} className="rounded-lg bg-night-2 px-2 py-2.5">
            <p className="font-display tabular text-sm text-paper">{value}</p>
            <p className="mt-0.5 text-[8px] text-paper/50">{label}</p>
          </div>
        ))}
      </div>
      <p className="mt-5 text-[10px] text-paper/60">Run this event</p>
      <div className="mt-2 overflow-hidden rounded-xl bg-night-2">
        {actions.map(({ icon: Icon, label }, i) => (
          <div key={label} className={`flex items-center gap-2.5 px-3 py-2.5 text-[10px] text-paper/80 ${i ? "shadow-[inset_0_1px_0_rgb(var(--glow)/0.06)]" : ""}`}>
            <Icon className="h-3.5 w-3.5 text-paper/60" />
            <span className="flex-1">{label}</span>
            <CaretRight className="h-3 w-3 text-paper/30" />
          </div>
        ))}
      </div>
    </Phone>
  );
}

/* Organiser side, Space level: the app's Space screen (same labels as
   mobile/src/screens/ManageSpaceScreen): stats, New event, the event
   tabs, and the team. */
export function SpaceScreen() {
  const stats: [string, string][] = [
    ["Upcoming", "3"],
    ["Attending", "1,204"],
    ["Drafts", "2"],
  ];
  const events: [string, string][] = [
    ["Nav Nirman 4.0", "Sat, 18 Oct · 412 going"],
    ["Startup Expo", "Mon, 27 Oct · 186 going"],
  ];
  const team: [string, string, string][] = [
    ["AR", "Ananya R.", "Space Admin"],
    ["KV", "Karthik V.", "Curator"],
    ["SM", "Sneha M.", "Crew"],
  ];
  return (
    <Phone>
      <p className="text-[10px] text-paper/50">Space</p>
      <p className="font-display text-sm text-paper">I&amp;E Cell, MRU</p>
      <div className="mt-3 grid grid-cols-3 gap-1.5">
        {stats.map(([label, value]) => (
          <div key={label} className="rounded-lg bg-night-2 px-2 py-2">
            <p className="font-display tabular text-[13px] text-paper">{value}</p>
            <p className="mt-0.5 text-[8px] text-paper/50">{label}</p>
          </div>
        ))}
      </div>
      <div className="mt-2.5 flex items-center justify-center gap-1.5 rounded-lg bg-primary py-2 text-[10px] text-black">
        <Plus weight="bold" className="h-3 w-3" /> New event
      </div>
      <div className="mt-3 flex gap-1.5">
        {["Upcoming", "Drafts", "Past"].map((t, i) => (
          <span key={t} className={`rounded-full px-2.5 py-1 text-[9px] ${i === 0 ? "bg-paper/[0.12] text-paper" : "text-paper/50"}`}>{t}</span>
        ))}
      </div>
      <div className="mt-2 space-y-1.5">
        {events.map(([name, meta]) => (
          <div key={name} className="flex items-center gap-2.5 rounded-lg bg-night-2 p-2">
            <div className={`h-8 w-[2.6rem] shrink-0 rounded-md ${cover}`} />
            <div>
              <p className="text-[10px] text-paper">{name}</p>
              <p className="text-[8px] text-paper/50">{meta}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between text-[10px]">
        <span className="text-paper/60">Team · 13</span>
        <span className="text-paper/50">Manage</span>
      </div>
      <div className="mt-1.5 space-y-1">
        {team.map(([ini, name, role]) => (
          <div key={name} className="flex items-center gap-2 text-[9px]">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-night-3 text-[7px] text-paper/80">{ini}</span>
            <span className="flex-1 text-paper/80">{name}</span>
            <span className="text-paper/45">{role}</span>
          </div>
        ))}
      </div>
    </Phone>
  );
}
