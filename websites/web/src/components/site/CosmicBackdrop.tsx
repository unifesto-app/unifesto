/* The cinematic ground behind every hero: stars, orbit hairlines, faint
   edge rules and a horizon of light on the bottom edge. Thin lines only.
   Pure CSS (server rendered, plays before hydration, no script); all motion
   lives in globals.css under "Cosmos" and dies under prefers-reduced-motion.
   `page` is the quieter cut for inner pages. The hero's horizon lives in
   <HorizonFloor /> below. */
export default function CosmicBackdrop({ variant = "hero" }: { variant?: "hero" | "page" }) {
  const hero = variant === "hero";
  return (
    <div aria-hidden="true" className={`cosmos ${hero ? "" : "cosmos-page"}`}>
      <div className="cosmos-stars" />
      <div className="cosmos-stars cosmos-stars-far" />

      <div className="cosmos-orbit cosmos-orbit-a" />
      <div className="cosmos-orbit cosmos-orbit-b" />

      <div className="cosmos-frame" />
      {hero && <div className="cosmos-glow" />}

      {/* The hero draws its horizon with <HorizonFloor />; inner pages get
          the same line on their bottom edge. */}
      {!hero && <div className="cosmos-horizon" />}
    </div>
  );
}

/* The hero's horizon: a line of light along its bottom edge. Place it as a
   direct child of the hero. */
export function HorizonFloor() {
  return (
    <div aria-hidden="true" className="cosmos-anchor">
      <div className="cosmos-horizon" />
    </div>
  );
}
