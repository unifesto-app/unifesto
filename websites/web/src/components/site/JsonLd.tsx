import { SITE, type Faq } from "@/lib/site";

/* Structured data for search engines and AI assistants. Server-rendered
   into the HTML, so crawlers that never run JavaScript still read it.
   `<` is escaped so content can never close the script tag early. One
   script per object: readers like Safari expect each block to carry its own
   "@context" and crash on a top-level array (Sentry UNIFESTO-WEB-2). */
export default function JsonLd({ data }: { data: object | object[] }) {
  return (
    <>
      {[data].flat().map((d, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(d).replace(/</g, "\\u003c") }}
        />
      ))}
    </>
  );
}

export const faqLd = (faqs: Faq[]) => ({
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: { "@type": "Answer", text: f.a },
  })),
});

export const breadcrumbLd = (items: { name: string; path: string }[]) => ({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: items.map((it, i) => ({
    "@type": "ListItem",
    position: i + 1,
    name: it.name,
    item: `${SITE.url}${it.path}`,
  })),
});
