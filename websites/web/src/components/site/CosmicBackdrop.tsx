import CosmosPointer from "@/components/site/CosmosPointer";

/* The cinematic ground behind every hero: stars, orbit hairlines, faint
   edge rules and a horizon of light on the bottom edge. Thin lines only.
   Pure CSS (server rendered, plays before hydration, no script); all motion
   lives in globals.css under "Cosmos" and dies under prefers-reduced-motion.
   `page` is the quieter cut for the footer and the links page; every hero
   (home and inner pages) uses the full sky. The hero's horizon lives in
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

/* The home hero's whole sky for an inner page's opener: the backdrop, stars
   that follow the pointer, the blue glow rising from the bottom-right corner
   and the horizon. Place it first inside a relative, overflow-hidden section
   whose id is `targetId`. Pass `glow={false}` when a glass card draws the
   glow inside its own root (the glass can't see this one). */
export function HeroSky({ targetId, glow = true }: { targetId: string; glow?: boolean }) {
  return (
    <>
      <CosmicBackdrop />
      <CosmosPointer targetId={targetId} />
      {/* Sized like the home hero's product column, so the glow sits the same. */}
      {glow && (
        <div aria-hidden="true" className="pointer-events-none absolute bottom-0 right-0 h-[32rem] w-full lg:w-1/2">
          <div className="hero-glow" />
        </div>
      )}
      <HorizonFloor />
    </>
  );
}
