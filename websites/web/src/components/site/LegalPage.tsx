import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PageHero from "@/components/site/PageHero";
import JsonLd, { breadcrumbLd } from "@/components/site/JsonLd";
import { LEGAL } from "@/lib/legal";
import { getLegalDoc } from "@/lib/api/legal";

/* The shared reading layout for every legal page: a sticky table of
   contents (anchors double as deep links for support replies), a
   65–75ch measure, real headings, the effective date, and the company and
   grievance details required on every page. Server-rendered, no script. */

export type LegalSection = { id: string; title: string; body: ReactNode };

const md = (text: string) => (
  <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>
    {text}
  </ReactMarkdown>
);

/** Splits a document into sections on its `## Title {#anchor}` headings. A
 *  `<!-- slot:name -->` line inside a section is replaced by `slots[name]`. */
function markdownSections(body: string, slots: Record<string, ReactNode>): LegalSection[] {
  return body
    .split(/^## /m)
    .slice(1)
    .map((chunk) => {
      const nl = chunk.indexOf("\n");
      const [, title, anchor] = chunk.slice(0, nl).match(/^(.*?)(?:\s*\{#([\w-]+)\})?\s*$/)!;
      const parts = chunk.slice(nl + 1).split(/^<!-- slot:([\w-]+) -->$/m);
      return {
        id: anchor ?? title.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        title,
        // split() with a capture group alternates text, slot name, text, ...
        body: parts.map((part, i) => <div key={i}>{i % 2 ? slots[part] : md(part)}</div>),
      };
    });
}

/** A legal page whose text is the latest published version from the API (I2). */
export async function LegalDocPage({
  slug,
  slots = {},
  ...page
}: {
  slug: string;
  title: string;
  path: string;
  lines: string[];
  lede: ReactNode;
  slots?: Record<string, ReactNode>;
}) {
  const doc = await getLegalDoc(slug);
  if (!doc) notFound();
  const effective = new Date(doc.publishedAt).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
  return <LegalPage {...page} sections={markdownSections(doc.body, slots)} effective={effective} />;
}

export default function LegalPage({
  title,
  path,
  lines,
  lede,
  sections,
  effective = LEGAL.effective,
}: {
  title: string;
  path: string;
  lines: string[];
  lede: ReactNode;
  sections: LegalSection[];
  /** This page's own effective date, when it changed after the shared one. */
  effective?: string;
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
            <span className="mt-4 block text-sm text-paper/50">Effective {effective}</span>
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
