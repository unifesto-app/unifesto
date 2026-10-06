/* The cinematic ground behind every hero: a planet's lit edge in the top
   right, orbit hairlines, a horizon of light
   on the bottom edge, and monolith bars standing on it. Pure CSS (server
   rendered, plays before hydration, no script); all motion lives in
   globals.css under "Cosmos" and dies under prefers-reduced-motion.
   `page` is the quieter cut for inner pages. The hero's horizon and
   monoliths live in <HorizonFloor /> below. */
export default function CosmicBackdrop({ variant = "hero" }: { variant?: "hero" | "page" }) {
  const hero = variant === "hero";
  return (
    <div aria-hidden="true" className={`cosmos ${hero ? "" : "cosmos-page"}`}>
      <div className="cosmos-stars" />
      <div className="cosmos-stars cosmos-stars-far" />

      <div className="cosmos-parallax-slow">
        <div className="cosmos-planet" />
      </div>
      <div className="cosmos-orbit cosmos-orbit-a" />
      <div className="cosmos-orbit cosmos-orbit-b" />

      <div className="cosmos-frame" />
      {hero && <div className="cosmos-glow" />}

      {/* The hero draws its horizon with <HorizonFloor /> (with monoliths);
          inner pages get the bare line on their bottom edge. */}
      {!hero && <div className="cosmos-horizon" />}
    </div>
  );
}

/* The hero's horizon: a line of light along its bottom edge, with the
   monoliths standing on it. Place it as a direct child of the hero. */
export function HorizonFloor() {
  return (
    <div aria-hidden="true" className="cosmos-anchor">
      <div className="cosmos-monoliths">
        <span style={{ ["--d" as string]: "900ms", ["--h" as string]: "100%" }} />
        <span style={{ ["--d" as string]: "1050ms", ["--h" as string]: "64%" }} />
        <span style={{ ["--d" as string]: "1200ms", ["--h" as string]: "42%" }} />
      </div>
      <div className="cosmos-horizon" />
    </div>
  );
}
