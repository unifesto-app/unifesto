import { DownloadQr } from "@/components/visuals/DownloadQr";
import { Bed, Check, IdentificationCard, WifiHigh, Drop, ForkKnife, Clock } from "@phosphor-icons/react/dist/ssr";
import { Panel } from "@/components/visuals/Product";
import { Phone } from "@/components/visuals/AppScreens";

/* Unifesto Stay fragments, drawn in HTML from the real model: a stay with
   room options (beds, gender, price, payment mode), the team's request
   queue, the guest's Stay Pass, and the arrival scan. Decorative. */

const cover = "bg-[radial-gradient(120%_90%_at_80%_0%,rgb(var(--glow)/0.22),transparent_60%),linear-gradient(160deg,var(--sand),var(--night-2))]";

export function StaySetupVisual() {
  const options: [string, string, string, string][] = [
    ["Boys hostel, Block C", "Men · 40 beds", "₹300 / night", "Online"],
    ["Girls hostel, Block A", "Women · 32 beds", "Free", "Free"],
    ["Hotel twin room", "Anyone · 12 beds", "₹1,200 / stay", "At property"],
  ];
  return (
    <Panel title="Stay · Nav Nirman 4.0">
      <div className={`aspect-[4/3] w-full rounded-md ${cover}`} />
      <div className="mt-3 flex flex-wrap gap-1.5 text-[9px] text-paper/70">
        {[[WifiHigh, "Wi-Fi"], [Drop, "Hot water"], [ForkKnife, "Mess"], [Clock, "Check-in 12:00 PM"]].map(([I, t]) => {
          const Icon = I as typeof WifiHigh;
          return (
            <span key={t as string} className="flex items-center gap-1 rounded-full bg-night-3 px-2 py-1">
              <Icon className="h-2.5 w-2.5" /> {t as string}
            </span>
          );
        })}
      </div>
      <div className="mt-3 space-y-1.5">
        {options.map(([name, who, price, mode]) => (
          <div key={name} className="flex items-center justify-between rounded-md bg-night-3 px-2.5 py-2">
            <span>
              <span className="block text-[11px] text-paper">{name}</span>
              <span className="block text-[9px] text-paper/50">{who} · {mode}</span>
            </span>
            <span className="tabular text-[11px] text-paper">{price}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

export function StayRequestsVisual() {
  const reqs: [string, string, string, boolean][] = [
    ["Ananya R. + 1", "Girls hostel · 17–19 Oct", "Block A, Room 112", true],
    ["Rahul K. + 3", "Boys hostel · 17–18 Oct", "Assign a room", false],
    ["Meera S.", "Hotel twin room · 18 Oct", "Awaiting payment", true],
  ];
  return (
    <Panel title="Stay requests · 3 pending review">
      <div className="space-y-1.5">
        {reqs.map(([who, what, state, done]) => (
          <div key={who} className="rounded-md bg-night-3 px-2.5 py-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-paper">{who}</span>
              <span className="flex items-center gap-1 text-[9px] text-paper/55">
                <IdentificationCard className="h-3 w-3" /> ID attached
              </span>
            </div>
            <div className="mt-0.5 flex items-center justify-between text-[9px]">
              <span className="text-paper/50">{what}</span>
              <span className={done ? "text-paper/70" : "text-paper"}>{state}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-1.5 text-[10px]">
        <span className="rounded-md bg-primary py-1.5 text-center text-black">Approve</span>
        <span className="rounded-md bg-white/[0.06] py-1.5 text-center text-paper/70">Reject</span>
      </div>
    </Panel>
  );
}

export function StayPassScreen() {
  return (
    <Phone>
      <p className="font-display text-sm text-paper">Stay Pass</p>
      <div className="mt-4 rounded-2xl bg-night-2 p-4">
        <div className="flex items-center gap-2 text-[11px] text-paper">
          <Bed className="h-3.5 w-3.5 text-paper/70" /> Girls hostel, Block A
        </div>
        <p className="mt-1 text-[9px] text-paper/55">Room 112 · 2 guests · 17 to 19 Oct</p>
        <div className="my-4 flex justify-center">
          <DownloadQr className="h-[5.5rem] w-[5.5rem]" />
        </div>
        <div className="flex justify-between text-[9px]">
          <span className="tabular text-paper/55">ST-7K2Q</span>
          <span className="text-primary">Confirmed</span>
        </div>
      </div>
      <div className="mt-3 space-y-1.5 text-[10px] text-paper/70">
        <div className="flex justify-between rounded-lg bg-night-2 px-3 py-2"><span>Check-in</span><span className="text-paper">17 Oct, 12:00 PM</span></div>
        <div className="flex justify-between rounded-lg bg-night-2 px-3 py-2"><span>Check-out</span><span className="text-paper">19 Oct, 10:00 AM</span></div>
        <div className="flex justify-between rounded-lg bg-night-2 px-3 py-2"><span>Contact</span><span className="text-paper">Warden, Block A</span></div>
      </div>
    </Phone>
  );
}

export function StayScanVisual() {
  return (
    <Panel title="Scan Stay Pass">
      <div className="flex items-center justify-between rounded-md bg-night-3 px-3 py-3">
        <span>
          <span className="block text-[12px] text-paper">Ananya R. + 1</span>
          <span className="block text-[9px] text-paper/50">ST-7K2Q · Girls hostel</span>
        </span>
        <span className="flex items-center gap-1 text-[11px] text-primary">
          <Check weight="bold" className="h-3 w-3" /> Checked in
        </span>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1.5 text-[10px]">
        <div className="rounded-md bg-night-3 px-2.5 py-2">
          <span className="block text-paper/50">Room</span>
          <span className="block text-paper">Block A, 112</span>
        </div>
        <div className="rounded-md bg-night-3 px-2.5 py-2">
          <span className="block text-paper/50">Payment</span>
          <span className="block text-paper">Free stay</span>
        </div>
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="font-display tabular text-xl text-paper">64</span>
        <span className="text-[10px] text-paper/55">of 84 guests checked in</span>
      </div>
      <div className="mt-2 h-1 rounded-full bg-white/[0.06]">
        <div data-reveal="fill" className="h-full origin-left rounded-full bg-primary" style={{ transform: "scaleX(0.76)" }} />
      </div>
    </Panel>
  );
}
