import type { Metadata } from "next";
import { withSocial } from "@/lib/seo";
import Link from "next/link";
import { ArrowRight } from "@unifesto/unicon/react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PageHero from "@/components/site/PageHero";
import Section from "@/components/site/Section";
import FeatureRow from "@/components/site/FeatureRow";
import FaqList from "@/components/site/FaqList";
import JsonLd, { breadcrumbLd } from "@/components/site/JsonLd";
import { OrbitBadge, OrbitCertificate, OrbitSystem, OrbitIdCard, OrbitStartVisual, Pinned } from "@/components/visuals/Orbit";
import { FAQ_ORBIT, ORBIT_APPLY, ORBIT_RULES, ORBIT_STEPS, ORBIT_TIERS } from "@/lib/site";

export const metadata: Metadata = withSocial({
  title: "Unifesto Orbit: the campus programme for students",
  description:
    "One Orbit Lead per campus represents Unifesto and helps every club on campus run its events on Unifesto. Remote, flexible, no fixed hours. Rewards are recognition, not cash.",
  alternates: { canonical: "/orbit" },
}, { title: "Unifesto Orbit", description: "One student per campus, helping every club run its events on Unifesto." });

const tilts = [-1.2, 0.8, -0.6, 1.1];

export default function OrbitPage() {
  return (
    <main className="min-h-screen overflow-x-hidden bg-canvas">
      <JsonLd data={breadcrumbLd([{ name: "Home", path: "/" }, { name: "Unifesto Orbit", path: "/orbit" }])} />
      <Navbar />

      <PageHero
        lines={["Every club on campus,", "in one orbit."]}
        accentFrom={1}
        lede="Unifesto Orbit is our campus programme. One Orbit Lead per campus represents Unifesto, not the college, and helps every club on campus run its events on Unifesto."
        actions={
          <>
            <Link href={ORBIT_APPLY} className="btn btn-lg btn-primary">
              Apply to be an Orbit Lead
              <ArrowRight className="btn-arrow h-3.5 w-3.5" weight="bold" aria-hidden="true" />
            </Link>
            <Link href="/orbit/terms" className="btn btn-lg btn-secondary">
              Programme terms
            </Link>
          </>
        }
        aside={<OrbitSystem />}
      />

      {/* The four steps are a route: each stop leads to the next. */}
      <Section surface="night-2" aria-labelledby="route-heading">
        <h2 id="route-heading" data-reveal="clip" className="font-display text-[clamp(1.6rem,3.2vw,2.4rem)] leading-[1.12] text-paper">
          The job, in four stops.
        </h2>
        <ol data-stagger="rise" className="relative mt-12 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
          <span
            aria-hidden="true"
            className="absolute left-0 right-0 top-[7px] hidden h-px bg-[repeating-linear-gradient(90deg,rgb(var(--glow)/0.3)_0_6px,transparent_6px_12px)] lg:block"
          />
          {ORBIT_STEPS.map((s, i) => (
            <li key={s.title} className="relative">
              <span aria-hidden="true" className="block h-[15px] w-[15px] rounded-full bg-night-2 shadow-[inset_0_0_0_2px_rgb(var(--glow)/0.6)]" />
              <span className="mt-5 block font-display tabular text-sm text-paper/45">Stop {i + 1}</span>
              <h3 className="mt-2 text-base text-paper">{s.title}</h3>
              <p className="mt-2 text-sm font-light leading-relaxed text-paper/60">{s.body}</p>
            </li>
          ))}
        </ol>
        <p data-reveal="blur" className="mt-12 max-w-[60ch] text-[15px] font-light leading-relaxed text-paper/65">
          One more: introduce your fest committee to Unifesto.
        </p>
      </Section>

      <Section pad="tight">
        <FeatureRow
          as="h2"
          id="who"
          title="Who it is for"
          lede="You study on the campus you would lead and you are already part of its club life. The role is remote and flexible, with no fixed hours."
          points={[
            "18 or older",
            "Currently studying at that campus",
            "Active in a club or fest team",
            "Remote, flexible, no fixed hours",
          ]}
          visual={<OrbitIdCard />}
        />
        <FeatureRow
          as="h2"
          id="start"
          title="Start with 30 days"
          lede="The first 30 days are your start period: onboard 2 clubs. After that there is no end date. You stay as long as you are active."
          points={[
            "Join the Orbit Leads WhatsApp community on day one",
            "Onboard 2 clubs in your first 30 days",
            "No end date after that",
            "Exam breaks are fine. Tell your Program Lead.",
          ]}
          visual={<OrbitStartVisual />}
          flip
        />
      </Section>

      {/* Tiers and rules, pinned up like the campus notice board. */}
      <Section surface="night-2" aria-labelledby="tiers-heading">
        <h2 id="tiers-heading" data-reveal="clip" className="font-display text-[clamp(1.6rem,3.2vw,2.4rem)] leading-[1.12] text-paper">
          What you earn.
        </h2>
        <p data-reveal="blur" className="mt-4 max-w-[60ch] text-[15px] font-light leading-relaxed text-paper/65 md:text-base">
          Rewards are recognition, not cash. An active club is one that has published its first event on Unifesto.
        </p>
        <ul data-stagger="rise" className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {ORBIT_TIERS.map((t, i) => (
            <li key={t.name}>
              <Pinned tilt={tilts[i]} className="h-full">
                <h3 className="font-display text-lg text-paper">{t.name}</h3>
                <p className="mt-1 text-[13px] text-paper/50">{t.bar}</p>
                <ul className="mt-4 space-y-2">
                  {t.rewards.map((r) => (
                    <li key={r} className="text-sm leading-relaxed text-paper/80">{r}</li>
                  ))}
                </ul>
              </Pinned>
            </li>
          ))}
        </ul>

        {/* What the Lead tier's certificate and badge look like (sample recipient). */}
        <div className="mt-20 grid items-center gap-12 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <div className="min-w-0" data-reveal="rise">
            <OrbitCertificate />
          </div>
          <div className="min-w-0">
            <h3 className="font-display text-xl text-paper">Your certificate and badge</h3>
            <p className="mt-3 max-w-[48ch] text-[15px] font-light leading-relaxed text-paper/65">
              Pass your first 30 days and you get the Orbit certificate, issued through Unifesto with a link anyone can
              verify. Your badge levels up with your tier.
            </p>
            <ul className="mt-8 grid grid-cols-4 gap-3" aria-label="Orbit badges by tier">
              {(["Lead", "Bronze", "Silver", "Gold"] as const).map((t) => (
                <li key={t} className="min-w-0">
                  <OrbitBadge tier={t} size={84} />
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-16 max-w-xl">
          <Pinned tilt={-0.5}>
            <h3 id="rules" className="font-display text-lg text-paper">Ground rules</h3>
            <ul className="mt-4 space-y-2.5">
              {ORBIT_RULES.map((r) => (
                <li key={r} className="flex gap-3 text-sm leading-relaxed text-paper/80">
                  <span aria-hidden="true" className="mt-2 h-1 w-1 shrink-0 rounded-full bg-paper/50" />
                  {r}
                </li>
              ))}
            </ul>
          </Pinned>
        </div>
      </Section>

      <FaqList faqs={FAQ_ORBIT} />

      <Section surface="blue" id="apply" aria-labelledby="apply-heading" width="text" innerClassName="text-center">
        <h2
          id="apply-heading"
          data-reveal="clip"
          className="font-display text-[clamp(1.75rem,4vw,3rem)] leading-[1.12] text-ink [text-wrap:balance]"
        >
          Lead your campus.
        </h2>
        <p data-reveal="blur" className="mx-auto mt-5 max-w-lg text-base leading-relaxed text-ink/75 md:text-lg">
          Apply in about ten minutes. Tell us your campus, the clubs you are part of, and the active clubs on your campus. We verify your email and phone, and the Program Lead gets back to you.
        </p>
        <div data-reveal="rise" className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link href={ORBIT_APPLY} className="btn btn-lg btn-primary w-full sm:w-auto">
            Apply now
            <ArrowRight className="btn-arrow h-4 w-4" weight="bold" aria-hidden="true" />
          </Link>
          <Link href="/orbit/terms" className="btn btn-lg btn-secondary w-full sm:w-auto">
            Programme terms
          </Link>
        </div>
        <p className="mt-6 text-sm text-ink/60">
          Looking for a job instead? See <Link href="/careers" className="underline underline-offset-4">open roles</Link>.
        </p>
      </Section>
      <Footer />
    </main>
  );
}
