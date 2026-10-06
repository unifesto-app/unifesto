import Link from "next/link";
import { ArrowRight } from "@phosphor-icons/react/dist/ssr";
import Section from "@/components/site/Section";

/* The page closes on the horizon band: one decision, two doors. */
export default function FinalCTASection() {
  return (
    <Section surface="blue" id="final-cta" aria-labelledby="cta-heading" width="text" innerClassName="text-center">
      <h2
        id="cta-heading"
        data-reveal="clip"
        className="font-display text-[clamp(1.75rem,4vw,3rem)] leading-[1.12] text-ink [text-wrap:balance]"
      >
        Publish your first event today.
      </h2>
      <p data-reveal="blur" className="mx-auto mt-5 max-w-lg text-base leading-relaxed text-ink/75 md:text-lg">
        Request a Space for your club, community or institution. Free events stay free, and the app is free for everyone going.
      </p>
      <div data-reveal="rise" className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <Link id="final-cta-create" href="/request-space" className="btn btn-lg btn-primary w-full sm:w-auto">
          Request a Space
          <ArrowRight className="btn-arrow h-4 w-4" weight="bold" aria-hidden="true" />
        </Link>
        <Link id="final-cta-app" href="/app" className="btn btn-lg btn-secondary w-full sm:w-auto">
          Get the app
        </Link>
      </div>
    </Section>
  );
}
