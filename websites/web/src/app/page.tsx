import type { Metadata } from "next";
import { withSocial } from "@/lib/seo";
import Link from "next/link";
import { ArrowRight } from "@unifesto/unicon/react";
import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import MarqueeBar from "@/components/MarqueeBar";
import EventsGrid from "@/components/EventsGrid";
import FinalCTASection from "@/components/FinalCTASection";
import Footer from "@/components/Footer";
import Section from "@/components/site/Section";
import FeatureRow from "@/components/site/FeatureRow";
import FaqList from "@/components/site/FaqList";
import ShadeCard, { type Shade } from "@/components/site/ShadeCard";
import { PassScreen, ManageScreen } from "@/components/visuals/AppScreens";
import { PILLAR_VISUALS } from "@/components/visuals/Product";
import { LeaderboardVisual } from "@/components/visuals/Hackathon";
import { FAQ_HOME, PILLARS, PROOF, SITE, SOCIAL } from "@/lib/site";
import JsonLd from "@/components/site/JsonLd";

export const metadata: Metadata = withSocial({
  title: { absolute: "Unifesto: Event ticketing, QR check-in and payouts for India" },
  description:
    "Run your whole event on Unifesto: tickets and RSVPs, multi-point QR check-in, Razorpay payouts, certificates, sponsors and hackathon judging. Free for RSVP events. Attendees get the free Unifesto app for iOS and Android.",
  alternates: { canonical: "/" },
}, { title: "Unifesto: Run the whole event, not just the ticket page", description: "Tickets, QR check-in, payouts, certificates, sponsors and hackathons for clubs, communities and institutions in India." });

/* Who we are, for search engines and AI assistants. Home page only (Google's
   advice), which also keeps it off a space's custom domain, whose `/` is the
   space page. */
const orgLd = [
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${SITE.url}/#org`,
    name: SITE.name,
    legalName: SITE.legalName,
    url: SITE.url,
    logo: SITE.logo,
    email: SITE.email,
    description: SITE.description,
    foundingLocation: { "@type": "Place", name: "Hyderabad, Telangana, India" },
    areaServed: "IN",
    sameAs: [SITE.appStore, SITE.playStore, ...Object.values(SOCIAL)],
  },
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${SITE.url}/#website`,
    name: SITE.name,
    url: SITE.url,
    publisher: { "@id": `${SITE.url}/#org` },
    inLanguage: "en-IN",
  },
];

const HIGHLIGHTS = ["tickets", "door", "money"] as const;
/* Each job's card in its accent: tickets sky, the door mint, money ivory. */
const PILLAR_SHADES: Record<(typeof HIGHLIGHTS)[number], Shade> = { tickets: "sky", door: "mint", money: "ivory" };
const PANEL_CARD = "w-full max-w-[30rem] p-8 sm:p-10";

export default function Home() {
  const pillars = HIGHLIGHTS.map((id) => ({ ...PILLARS.find((p) => p.id === id)!, shade: PILLAR_SHADES[id] }));
  return (
    <main className="min-h-[100dvh] overflow-x-hidden bg-canvas">
      <JsonLd data={orgLd} />
      <Navbar />
      <Hero />
      <MarqueeBar />

      {/* Two audiences, one event. Each side gets its own picture. */}
      <Section surface="paper" aria-labelledby="sides-heading">
        <h2 id="sides-heading" data-reveal="clip" className="max-w-3xl font-display text-[clamp(1.6rem,3.4vw,2.6rem)] leading-[1.12] text-ink [text-wrap:balance]">
          One event, two sides of the door.
        </h2>
        <div className="mt-14 grid gap-16 md:grid-cols-2 md:gap-12">
          <article className="flex flex-col">
            <ShadeCard shade="sky" className="flex justify-center px-6 py-10">
              <PassScreen />
            </ShadeCard>
            <h3 className="mt-10 text-xl text-ink">For people going</h3>
            <p className="mt-3 max-w-[48ch] text-[15px] font-light leading-relaxed text-ink/70">
              Find events near you, register in a few taps, and walk in with the pass on your phone. The Unifesto app is
              free on iOS and Android.
            </p>
            <Link href="/app" className="link-draw mt-5 inline-flex w-fit items-center gap-2 text-sm text-ink">
              See the app <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
            </Link>
          </article>
          <article className="flex flex-col">
            <ShadeCard shade="mint" className="flex justify-center px-6 py-10">
              <ManageScreen />
            </ShadeCard>
            <h3 className="mt-10 text-xl text-ink">For people running it</h3>
            <p className="mt-3 max-w-[48ch] text-[15px] font-light leading-relaxed text-ink/70">
              Your club or institution gets a Space for the team, every event, the door and the money. Run the day from
              the Unifesto app: scan tickets, check numbers live, request the payout.
            </p>
            <Link href="/organisers" className="link-draw mt-5 inline-flex w-fit items-center gap-2 text-sm text-ink">
              See the platform <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
            </Link>
          </article>
        </div>
      </Section>

      {/* The three jobs every organiser has, shown, not listed. */}
      <Section aria-labelledby="run-heading">
        <h2 id="run-heading" data-reveal="clip" className="max-w-3xl font-display text-[clamp(1.6rem,3.4vw,2.6rem)] leading-[1.12] text-paper [text-wrap:balance]">
          Sell it, staff the door, settle the money.
        </h2>
        <p data-reveal="blur" className="mt-5 max-w-[56ch] text-base font-light leading-relaxed text-paper/65">
          The three jobs every event has, in one place instead of a form, a spreadsheet and a group chat.
        </p>
        {pillars.map((p, i) => {
          const Visual = PILLAR_VISUALS[p.id];
          return (
            <FeatureRow
              key={p.id}
              title={p.title}
              lede={p.lede}
              points={p.points.slice(0, 3)}
              visual={
                <ShadeCard shade={p.shade} glass className={PANEL_CARD}>
                  <Visual />
                </ShadeCard>
              }
              flip={i % 2 === 1}
            />
          );
        })}
        <Link href="/organisers" className="btn btn-lg btn-secondary mt-4">
          Everything organisers get
          <ArrowRight className="btn-arrow h-3.5 w-3.5" weight="bold" aria-hidden="true" />
        </Link>
      </Section>

      <Section surface="paper" aria-labelledby="hack-heading">
        <FeatureRow
          as="h2"
          id="hack-heading"
          title="Hackathons, judged properly."
          lede="Teams, problem statements, rounds with weighted rubrics, judge panels, a help desk and a live leaderboard. The whole hackathon, from registration to certificates, in the same Space."
          visual={
            <ShadeCard shade="blue" glass className={PANEL_CARD}>
              <LeaderboardVisual />
            </ShadeCard>
          }
        >
          <Link href="/sprint" className="link-draw mt-6 inline-flex items-center gap-2 text-sm text-paper">
            How hackathons run on Unifesto Sprint <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
          </Link>
        </FeatureRow>
      </Section>

      <EventsGrid />

      <Section surface="paper" pad="tight" width="mid" innerClassName="text-center">
        <p data-reveal="blur" className="mx-auto max-w-[44ch] font-display text-[clamp(1.1rem,2.2vw,1.6rem)] leading-[1.4] text-ink [text-wrap:balance]">
          {PROOF.attendees} people checked in across {PROOF.events} events and {PROOF.spacesLive} Spaces, starting at{" "}
          {PROOF.firstCampus}.
        </p>
      </Section>

      <FaqList faqs={FAQ_HOME} />
      <FinalCTASection />
      <Footer />
    </main>
  );
}
