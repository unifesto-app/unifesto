import { Plus } from "@unifesto/unicon/react";
import Section from "@/components/site/Section";
import JsonLd, { faqLd } from "@/components/site/JsonLd";
import type { Faq } from "@/lib/site";

/* Questions people (and AI assistants) actually ask, answered in full.
   Native <details>: no script, keyboard and screen-reader ready, and every
   answer is in the HTML for crawlers. Emits matching FAQPage data. */
export default function FaqList({ faqs, title = "Questions, answered" }: { faqs: Faq[]; title?: string }) {
  return (
    <Section surface="paper" width="mid" aria-labelledby="faq-heading">
      <JsonLd data={faqLd(faqs)} />
      <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
        <h2 id="faq-heading" data-reveal="clip" className="font-display text-[clamp(1.6rem,3.2vw,2.4rem)] leading-[1.12] text-ink [text-wrap:balance]">
          {title}
        </h2>
        <div data-stagger="rise" className="border-t border-border">
          {faqs.map((f) => (
            <details key={f.q} className="group border-b border-border py-5 last:border-b-0">
              <summary className="flex cursor-pointer list-none items-start justify-between gap-6 text-base text-ink marker:hidden [&::-webkit-details-marker]:hidden">
                <span>{f.q}</span>
                <Plus aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 text-ink/60 transition-transform duration-200 group-open:rotate-45" />
              </summary>
              <p className="mt-3 max-w-[65ch] text-[15px] font-light leading-relaxed text-ink/70">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </Section>
  );
}
