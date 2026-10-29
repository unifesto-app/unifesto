import Link from "next/link";
import { ArrowRight } from "@unifesto/unicon/react";
import CosmicBackdrop, { HorizonFloor } from "@/components/site/CosmicBackdrop";
import CosmosPointer from "@/components/site/CosmosPointer";
import { PassScreen } from "@/components/visuals/AppScreens";
import { DoorVisual } from "@/components/visuals/Product";

/* Product in orbit. Left: the claim, as the h1 (the navbar already carries
   the name). Right: both sides of one event, floating in front of the dim
   planet: the attendee's pass, with the Crew's live check-in panel in
   front of it. The horizon runs along the hero's bottom edge.
   All CSS entrances: the scene assembles, the claim rises through its
   waterline, then the product arrives: the pass, then the door it opens. */
const LINES = ["Run the whole event.", "Not just the ticket page."];

export default function Hero() {
  return (
    <section id="hero" aria-labelledby="hero-heading" className="surface-night relative flex min-h-[100dvh] flex-col overflow-hidden">
      <CosmicBackdrop />
      <CosmosPointer targetId="hero" />

      <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-1 flex-col px-5 pb-8 pt-28 sm:px-12 md:pt-32">
        <div className="grid flex-1 content-center items-center gap-12 pb-12 lg:items-end lg:pb-[12vh] lg:grid-cols-[1.2fr_0.8fr] lg:gap-8">
          <div>
            <h1
              id="hero-heading"
              className="waterline-load font-display text-[clamp(1.75rem,3vw,2.75rem)] leading-[1.12] text-paper"
            >
              {LINES.map((line, i) => (
                <span key={line} className="line" style={{ ["--l" as string]: i }}>
                  <span className={`line-inner ${i > 0 ? "text-paper/60" : ""}`}>{line}</span>
                </span>
              ))}
            </h1>

            <p className="mt-7 max-w-[34rem] text-[15px] leading-relaxed text-paper/75 md:text-[17px]" >
              The team, the tickets, the door, the money and the debrief, in one Space that outlives any single event.
              10,000+ checked in across 25+ events. Free to start.
            </p>

            <div className="enter mt-9 flex flex-col gap-3 sm:flex-row sm:items-center" style={{ ["--d" as string]: "240ms" }}>
              <Link id="hero-host-event" href="/organisers" className="btn btn-lg btn-primary">
                Host an event
                <ArrowRight className="btn-arrow h-3.5 w-3.5" weight="bold" aria-hidden="true" />
              </Link>
              <Link id="hero-discover-events" href="/events" className="btn btn-lg btn-secondary">
                Discover events
              </Link>
            </div>
          </div>

          {/* The two sides of the door: the attendee's pass, the Crew's count
              in front of it. Desktop only; phones meet these screens on /app. */}
          <div className="relative hidden h-[32rem] lg:block">
            <div className="enter absolute bottom-0 right-0 origin-bottom-right scale-[0.9]" style={{ ["--d" as string]: "300ms" }}>
              <PassScreen />
            </div>
            <div className="enter absolute bottom-[10%] left-[-6%] z-10 w-[18rem]" style={{ ["--d" as string]: "420ms" }}>
              <DoorVisual />
            </div>
          </div>
        </div>
      </div>
      <HorizonFloor />
    </section>
  );
}
