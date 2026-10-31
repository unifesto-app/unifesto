import { Trophy, Lifebuoy, Check } from "@unifesto/unicon/react";
import { Panel, panelAfter, panelRows } from "@/components/visuals/Product";

/* Hackathon fragments: the live leaderboard, a judge's rubric, the help
   desk queue. Server-rendered HTML, decorative to assistive tech. */

export function LeaderboardVisual() {
  const teams: [string, string, number][] = [
    ["Byte Me", "HealthTech", 92.4],
    ["Null Pointers", "FinTech", 89.1],
    ["Kernel Panic", "EdTech", 86.7],
    ["Stack Smash", "Open", 81.3],
  ];
  return (
    <Panel title="Leaderboard · Finals">
      <div className={panelRows}>
        {teams.map(([name, track, score], i) => (
          <div key={name} className="flex items-center gap-3 py-2">
            <span className={`tabular w-4 text-[11px] ${i === 0 ? "text-paper" : "text-paper/45"}`}>{i + 1}</span>
            <span className="flex-1">
              <span className="block text-[11px] text-paper">{name}</span>
              <span className="block text-[9px] text-paper/50">{track}</span>
            </span>
            {i === 0 && <Trophy weight="fill" className="h-3.5 w-3.5 text-paper/80" />}
            <span className="tabular text-[12px] text-paper">{score.toFixed(1)}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

export function RubricVisual() {
  const criteria: [string, number, number][] = [
    ["Problem fit", 30, 27],
    ["Technical depth", 30, 26],
    ["Demo", 25, 22],
    ["Pitch", 15, 13],
  ];
  return (
    <Panel title="Judge · Round 2 · Byte Me">
      <div className="space-y-2.5">
        {criteria.map(([name, max, got]) => (
          <div key={name}>
            <div className="mb-1 flex justify-between text-[10px]">
              <span className="text-paper/70">{name} <span className="text-paper/40">· {max}%</span></span>
              <span className="tabular text-paper">{got}/{max}</span>
            </div>
            <div className="h-1 rounded-full bg-white/[0.06]">
              <div data-reveal="fill" className="h-full origin-left rounded-full bg-primary" style={{ transform: `scaleX(${got / max})` }} />
            </div>
          </div>
        ))}
      </div>
      <div className={`${panelAfter} text-[10px]`}>
        <span className="text-paper/75">Panel B · 3 of 3 judges scored</span>
        <Check weight="bold" className="h-3 w-3 text-primary" />
      </div>
    </Panel>
  );
}

export function HelpDeskVisual() {
  const queries: [string, string, string][] = [
    ["API keys not working", "Cloud · POC Rahul", "Picked up"],
    ["Need an extension cord", "Room 204 · Volunteers", "Open"],
    ["Submission format?", "Organisers", "Answered"],
  ];
  return (
    <Panel title="Help desk">
      <div className={panelRows}>
        {queries.map(([q, to, state]) => (
          <div key={q} className="py-2">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[11px] text-paper">
                <Lifebuoy className="h-3 w-3 text-paper/55" /> {q}
              </span>
              <span className={`text-[9px] ${state === "Open" ? "text-paper" : "text-paper/50"}`}>{state}</span>
            </div>
            <span className="mt-0.5 block pl-[18px] text-[9px] text-paper/45">{to}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}
