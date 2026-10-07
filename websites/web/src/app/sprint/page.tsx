import type { Metadata } from "next";
import { withSocial } from "@/lib/seo";
import Link from "next/link";
import { ArrowRight } from "@phosphor-icons/react/dist/ssr";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import FinalCTASection from "@/components/FinalCTASection";
import PageHero from "@/components/site/PageHero";
import Section from "@/components/site/Section";
import FeatureRow from "@/components/site/FeatureRow";
import FaqList from "@/components/site/FaqList";
import JsonLd, { breadcrumbLd } from "@/components/site/JsonLd";
import { LeaderboardVisual, RubricVisual, HelpDeskVisual } from "@/components/visuals/Hackathon";
import { FAQ_HACKATHONS, HACKATHON_STAGES } from "@/lib/site";

export const metadata: Metadata = withSocial({
  title: "Unifesto Sprint: hackathon management, judging and leaderboards",
  description:
    "Unifesto Sprint runs a hackathon end to end: team registration, problem statements, rounds with weighted rubrics, judge panels, rooms and a help desk, submissions, a live leaderboard and certificates.",
  alternates: { canonical: "/sprint" },
}, { title: "Unifesto Sprint", description: "Teams, rubrics, judge panels, a help desk and a live leaderboard, in one Space." });

export default function SprintPage() {
  return (
    <main className="min-h-screen overflow-x-hidden bg-canvas">
      <JsonLd data={breadcrumbLd([{ name: "Home", path: "/" }, { name: "Unifesto Sprint", path: "/sprint" }])} />
      <Navbar />

      <PageHero
        lines={["Hackathons,", "judged properly."]}
        accentFrom={1}
        lede="Unifesto Sprint runs hackathons, ideathons and build weekends, from the first team registration to the last certificate. Organisers run the event from the Space console, while participants and judges do everything from the Unifesto app."
        actions={
          <>
            <Link href="/request-space" className="btn btn-lg btn-primary">
              Host a sprint
              <ArrowRight className="btn-arrow h-3.5 w-3.5" weight="bold" aria-hidden="true" />
            </Link>
            <Link href="/pricing" className="btn btn-lg btn-secondary">
              See pricing
            </Link>
          </>
        }
        aside={<LeaderboardVisual />}
      />

      {/* The stages are a real sequence, so they carry their order. */}
      <Section aria-labelledby="flow-heading">
        <h2 id="flow-heading" data-reveal="clip" className="font-display text-[clamp(1.6rem,3.2vw,2.4rem)] leading-[1.12] text-paper">
          How a hackathon runs.
        </h2>
        <ol data-stagger="rise" className="mt-12 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-5">
          {HACKATHON_STAGES.map((s, i) => (
            <li key={s.title} className="pt-5 shadow-[inset_0_1px_0_rgb(var(--glow)/0.14)]">
              <span className="font-display tabular text-sm text-paper/45">{i + 1}</span>
              <h3 className="mt-3 text-base text-paper">{s.title}</h3>
              <p className="mt-2 text-sm font-light leading-relaxed text-paper/60">{s.body}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Section surface="paper" pad="tight">
        <FeatureRow
          as="h2"
          id="judging"
          title="Scores you can defend."
          lede="Every round has weighted criteria. Judges sit on panels, score from their phones, and see only the teams sent to them. Organisers watch panels complete, then publish results when they are ready."
          points={["Rounds, criteria and weights per hackathon", "Judge panels with evaluation requests", "Rubric or metric leaderboards", "Winners, awards and results pages"]}
          visual={<RubricVisual />}
        />
        <FeatureRow
          as="h2"
          id="help-desk"
          title="Help that reaches the right person."
          lede="Map teams to rooms and give each room its volunteers. When a team is stuck, they raise a query by topic and it lands with the point of contact for that topic, not in a crowded group chat."
          points={["Rooms with assigned volunteers", "Help topics with points of contact", "Team queries tracked to resolution", "Announcements pushed to every participant"]}
          visual={<HelpDeskVisual />}
          flip
        />
      </Section>

      <FaqList faqs={FAQ_HACKATHONS} />
      <FinalCTASection />
      <Footer />
    </main>
  );
}
