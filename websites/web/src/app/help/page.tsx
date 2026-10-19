import type { Metadata } from "next";
import { withSocial } from "@/lib/seo";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PageHero from "@/components/site/PageHero";
import Section from "@/components/site/Section";
import { getHelpArticles, type HelpArticleSummary } from "@/lib/api/help";

export const metadata: Metadata = withSocial({
  alternates: { canonical: "/help" },
  title: "Help articles",
  description: "Answers to common questions about tickets, payments, refunds, Spaces and running events on Unifesto.",
}, { title: "Unifesto help", description: "Answers to common questions about using Unifesto." });

export default async function HelpPage() {
  const articles = await getHelpArticles();
  // The API already sorts by category then title, so grouping keeps that order.
  const groups = new Map<string, HelpArticleSummary[]>();
  for (const a of articles) groups.set(a.category, [...(groups.get(a.category) ?? []), a]);

  return (
    <main className="min-h-screen overflow-x-hidden bg-canvas">
      <Navbar />

      <PageHero
        lines={["Help", "articles."]}
        accentFrom={1}
        size="md"
        lede={
          <>
            Short answers to common questions. Can&apos;t find yours?{" "}
            <Link href="/help/contact" className="font-semibold text-primary underline-offset-4 hover:underline">
              Contact support
            </Link>
            .
          </>
        }
      />

      <Section surface="night" pad="tight">
        {articles.length === 0 ? (
          <div className="rounded-3xl bg-night-2 p-12 text-center">
            <h2 className="text-xl font-semibold text-paper">No articles yet</h2>
            <p className="mt-2 text-paper/65">
              <Link href="/help/contact" className="text-primary hover:underline">Contact support</Link> and we will help you directly.
            </p>
          </div>
        ) : (
          <div className="grid gap-8 md:grid-cols-2">
            {[...groups].map(([category, items]) => (
              <section key={category}>
                <h2 className="mb-2 px-1 text-sm font-medium text-paper/55">{category}</h2>
                <ul className="divide-y divide-white/[0.06] overflow-hidden rounded-2xl bg-night-2">
                  {items.map((a) => (
                    <li key={a.id}>
                      <Link
                        href={`/help/${a.slug}`}
                        className="group flex items-center justify-between gap-4 px-4 py-3.5 text-[15px] font-medium text-paper transition-colors duration-150 hover:bg-night-3"
                      >
                        {a.title}
                        <span aria-hidden className="text-paper/45 transition-transform duration-150 group-hover:translate-x-0.5">→</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </Section>

      <Footer />
    </main>
  );
}
