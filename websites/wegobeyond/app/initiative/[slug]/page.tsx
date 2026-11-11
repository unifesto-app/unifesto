import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Reveal from "@/components/Reveal";
import RegisterNow from "@/components/RegisterNow";
import { getContent, pageMetadata } from "@/lib/site";

// One page per initiative. Known ones are built ahead; one added in Apex later renders
// on its first visit, and any other slug is a 404.
export async function generateStaticParams() {
  return (await getContent()).initiatives.map((i) => ({ slug: i.slug }));
}

const getInitiative = async (slug: string) => (await getContent()).initiatives.find((i) => i.slug === slug);

export async function generateMetadata({ params }: PageProps<"/initiative/[slug]">): Promise<Metadata> {
  const it = await getInitiative((await params).slug);
  if (!it) return {};
  // ownCard: this segment's opengraph-image draws the initiative's own card.
  return pageMetadata(it.name, it.intro, `/initiative/${it.slug}`, true);
}

const DIVIDER = "border-t-[1.5px] border-line";

export default async function InitiativePage({ params }: PageProps<"/initiative/[slug]">) {
  const { initiatives } = await getContent();
  const { slug } = await params;
  const it = initiatives.find((i) => i.slug === slug);
  if (!it) notFound();
  const others = initiatives.filter((i) => i.slug !== it.slug);

  return (
    <>
      <section className="wrap pt-12">
        <Reveal trigger="load" stagger>
          <Link data-reveal-item href="/#initiatives" className="small text-silver transition-colors hover:text-paper">
            ← Initiatives
          </Link>
          <p data-reveal-item className="small mt-12 text-rust">
            {it.note}
          </p>
          <h1 data-reveal-item className="mt-4 max-w-[12ch]">
            {it.name}
          </h1>
          <p data-reveal-item className="lead mt-8 max-w-[46ch] text-silver">
            {it.intro}
          </p>
        </Reveal>
      </section>

      {(it.agenda.length > 0 || it.audience) && (
        <section className="wrap pt-28">
          <div className={`grid gap-12 ${DIVIDER} pt-12 lg:grid-cols-[1.4fr_1fr] lg:gap-20`}>
            {it.agenda.length > 0 && (
              <Reveal>
                <h2>What happens.</h2>
                <ol className="mt-10">
                  {it.agenda.map((item, i) => (
                    <li key={item} className={`flex gap-6 ${DIVIDER} py-5`}>
                      <span className="title w-8 shrink-0 text-rust tabular-nums">0{i + 1}</span>
                      <span className="title">{item}</span>
                    </li>
                  ))}
                </ol>
              </Reveal>
            )}
            {it.audience && (
              <Reveal delay={0.06}>
                <h2>Who it&rsquo;s for.</h2>
                <p className="lead mt-10 max-w-[36ch] text-silver">{it.audience}</p>
              </Reveal>
            )}
          </div>
        </section>
      )}

      {/* This initiative's dated editions, live from Unifesto. */}
      <RegisterNow match={it.match} />

      <section className="wrap pb-28 pt-28">
        <div className={`${DIVIDER} pt-12`}>
          <h2>More initiatives.</h2>
          <ul className="mt-10 grid gap-x-10 md:grid-cols-2 lg:grid-cols-3">
            {others.map((o) => (
              <li key={o.slug}>
                <Link href={`/initiative/${o.slug}`} className={`group block ${DIVIDER} py-5`}>
                  <span className="small text-rust">{o.note}</span>
                  <span className="title mt-2 flex items-baseline justify-between gap-4 transition-colors group-hover:text-rust">
                    {o.name}
                    <span aria-hidden="true">→</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}
