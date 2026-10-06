import type { ReactNode } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PageHero from "@/components/site/PageHero";
import JsonLd, { breadcrumbLd } from "@/components/site/JsonLd";
import { LEGAL } from "@/lib/legal";

/* The shared reading layout for every legal page: a sticky table of
   contents (anchors double as deep links for support replies), a
   65–75ch measure, real headings, the effective date, and the company and
   grievance details required on every page. Server-rendered, no script. */

export type LegalSection = { id: string; title: string; body: ReactNode };

export default function LegalPage({
  title,
  path,
  lines,
  lede,
  sections,
}: {
  title: string;
  path: string;
  lines: string[];
  lede: ReactNode;
  sections: LegalSection[];
}) {
  return (
    <main className="min-h-screen overflow-x-hidden bg-canvas">
      <JsonLd data={breadcrumbLd([{ name: "Home", path: "/" }, { name: title, path }])} />
      <Navbar />
      <PageHero
        lines={lines}
        size="md"
        lede={
          <>
            {lede}
            <span className="mt-4 block text-sm text-paper/50">Effective {LEGAL.effective}</span>
          </>
        }
      />

      <div className="mx-auto grid max-w-7xl gap-12 px-5 pb-24 pt-14 sm:px-8 md:pt-20 lg:grid-cols-[15rem_1fr] lg:gap-16">
        <nav aria-label="On this page" className="lg:sticky lg:top-28 lg:self-start">
          <p className="text-sm text-paper">On this page</p>
          <ol className="mt-4 space-y-2.5 text-sm text-paper/55">
            {sections.map((s, i) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="link-draw hover:text-paper">
                  {i + 1}. {s.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <article className="legal max-w-[70ch]">
          {sections.map((s, i) => (
            <section key={s.id} id={s.id} aria-labelledby={`${s.id}-h`} className="scroll-mt-28 pb-10">
              <h2 id={`${s.id}-h`} className="font-display text-[clamp(1.15rem,1.8vw,1.4rem)] leading-[1.3] text-paper">
                {i + 1}. {s.title}
              </h2>
              <div className="mt-4">{s.body}</div>
            </section>
          ))}

          <aside aria-label="Company and grievance details" className="rounded-xl bg-night-2 p-6 text-sm leading-relaxed text-paper/70 shadow-[inset_0_0_0_1px_rgb(var(--glow)/0.08)]">
            <p className="text-paper">{LEGAL.company}</p>
            <p className="mt-1">CIN {LEGAL.cin}</p>
            <p className="mt-1">{LEGAL.address}</p>
            <p className="mt-4">
              <span className="text-paper">Grievance Officer:</span> {LEGAL.grievance.name},{" "}
              <a href={`mailto:${LEGAL.grievance.email}`} className="link-draw text-paper">{LEGAL.grievance.email}</a>
            </p>
            <p className="mt-1">
              Support: <a href={`mailto:${LEGAL.email.support}`} className="link-draw text-paper">{LEGAL.email.support}</a>
            </p>
          </aside>
        </article>
      </div>
      <Footer />
    </main>
  );
}
